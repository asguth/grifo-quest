//! Sessão de estudo: questões do dia, Reforço (pontos fracos), simulado, caderno de erros e flashcards.
//! As questões vêm do banco; quando faltam, o Grifo gera (Ollama no automático) e guarda para as próximas.

use std::collections::{HashMap, HashSet};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use tauri::{AppHandle, Manager, State};
use tauri_specta::Event;

use crate::ai::{self, Provider, Route, Task};
use crate::db::{self, materials, study as repo};
use crate::db::study::CardSource;
use crate::domain::study::{self as rules, GeneratedQuestion, Grade, QuestionFormat, Slot, TopicStats, Trend};
use crate::domain::xp;
use crate::error::{AppError, AppResult};
use crate::grifo::{self, MaterialKind, Output};
use crate::settings::{self, AppConfig, Profile};

/// Quantas questões o Grifo gera por vez para um tópico.
const BATCH: usize = 5;

/// Com menos questões inéditas que isso, o tópico ganha um lote novo em segundo plano.
const MIN_FRESH: i32 = 3;

wire_enum! {
    pub enum SessionKind {
        Diaria = "diaria",
        Reforco = "reforco",
        Simulado = "simulado",
        Topico = "topico",
        Erros = "erros",
    }
}

/// Fila de cada sessão aberta (em memória: some se o app fechar no meio, o que já foi respondido fica gravado).
#[derive(Default)]
pub struct StudyState {
    sessions: Mutex<HashMap<i32, Queue>>,
    /// Um gerador por tópico por vez (a pré-geração e a sessão não geram em dobro).
    gen_locks: Mutex<HashMap<i32, Arc<tokio::sync::Mutex<()>>>>,
    /// Aquecimento rodando (um por vez: a GPU é uma só).
    warming: AtomicBool,
}

struct Queue {
    slots: Vec<Slot>,
    served: HashSet<i32>,
    planned: usize,
}

impl StudyState {
    fn gen_lock(&self, topic_id: i32) -> Arc<tokio::sync::Mutex<()>> {
        let mut m = self.gen_locks.lock().unwrap_or_else(|p| p.into_inner());
        m.entry(topic_id).or_default().clone()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type, tauri_specta::Event)]
pub struct StudyEvent {
    pub text: String,
}

#[derive(Debug, Serialize, specta::Type)]
pub struct SessionInfo {
    pub id: i32,
    pub kind: SessionKind,
    pub planned: i32,
    pub time_limit_min: Option<i32>,
}

#[derive(Debug, Serialize, specta::Type)]
pub struct QuestionView {
    pub id: i32,
    pub topic_id: i32,
    pub topic: String,
    pub subject: String,
    pub color: String,
    pub banca: Option<String>,
    pub format: QuestionFormat,
    pub statement: String,
    pub options: Vec<String>,
    pub difficulty: Option<String>,
    pub source: Provider,
    /// Veio do caderno de erros.
    pub from_errors: bool,
    /// 1-based.
    pub position: i32,
    pub planned: i32,
}

#[derive(Debug, Serialize, specta::Type)]
pub struct AnswerResult {
    pub correct: bool,
    pub answer: String,
    pub explanation: String,
    pub xp_gained: i32,
    pub mission_xp: i32,
    /// Novo nível, se subiu agora.
    pub level_up: Option<i32>,
}

#[derive(Debug, Serialize, specta::Type)]
pub struct SessionReport {
    pub total: i32,
    pub correct: i32,
    pub seconds: i32,
    pub xp: i32,
    pub by_subject: Vec<repo::SubjectScore>,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct WeakTopic {
    pub topic_id: i32,
    pub topic: String,
    pub subject: String,
    pub color: String,
    pub answered: i32,
    /// 0–1; `None` sem respostas.
    pub accuracy: Option<f64>,
    pub trend: Trend,
    pub errors_due: i32,
    pub score: f64,
}

#[derive(Debug, Serialize, specta::Type)]
pub struct CycleSubject {
    pub id: i32,
    pub name: String,
    pub color: String,
}

#[derive(Debug, Serialize, specta::Type)]
pub struct StudyHome {
    pub daily_goal: i32,
    pub answered_today: i32,
    pub errors_due: i32,
    pub cards_due: i32,
    pub cycle_next: Option<CycleSubject>,
    pub weak: Vec<WeakTopic>,
    pub has_topics: bool,
}

// ---------- pontos fracos ----------

async fn rank(pool: &SqlitePool) -> AppResult<Vec<WeakTopic>> {
    let topics = repo::topics_for_ranking(pool).await?;
    let mut answers: HashMap<i32, Vec<(f64, bool)>> = HashMap::new();
    for (t, age, ok) in repo::recent_answers(pool).await? {
        answers.entry(t).or_default().push((age, ok));
    }
    let mut out: Vec<WeakTopic> = topics
        .into_iter()
        .map(|t| {
            let a = answers.remove(&t.topic_id).unwrap_or_default();
            let seen = a.iter().map(|x| x.0).fold(None, |m: Option<f64>, x| Some(m.map_or(x, |m| m.min(x))));
            let stats = TopicStats { subject_weight: t.weight, answers: a.clone(), days_since_seen: seen, errors_due: t.errors_due };
            let hits = a.iter().filter(|x| x.1).count();
            WeakTopic {
                topic_id: t.topic_id,
                topic: t.topic,
                subject: t.subject,
                color: t.color,
                answered: a.len() as i32,
                accuracy: (!a.is_empty()).then(|| hits as f64 / a.len() as f64),
                trend: rules::trend(&a),
                errors_due: t.errors_due,
                score: rules::weakness(&stats),
            }
        })
        .collect();
    out.sort_by(|a, b| b.score.total_cmp(&a.score));
    Ok(out)
}

#[tauri::command]
#[specta::specta]
pub async fn study_home(app: AppHandle, pool: State<'_, SqlitePool>) -> AppResult<StudyHome> {
    let profile: Profile = settings::load(&pool).await?;
    let weak = rank(&pool).await?;
    warm_up(app, weak.iter().take(WARM_TOPICS).map(|w| w.topic_id).collect());
    let has_topics = !weak.is_empty();
    let subjects = db::subjects::list(&pool).await?;
    let next = rules::cycle_next(&repo::minutes_by_subject(&pool).await?);
    Ok(StudyHome {
        daily_goal: profile.daily_questions,
        answered_today: repo::answered_today(&pool).await?,
        errors_due: repo::errors_due(&pool).await?.len() as i32,
        cards_due: repo::cards_due_count(&pool).await?,
        cycle_next: next.and_then(|id| subjects.iter().find(|s| s.id == id)).map(|s| CycleSubject { id: s.id, name: s.name.clone(), color: s.color.clone() }),
        weak: weak.into_iter().take(6).collect(),
        has_topics,
    })
}

// ---------- sessão ----------

#[tauri::command]
#[specta::specta]
pub async fn start_session(
    pool: State<'_, SqlitePool>,
    state: State<'_, StudyState>,
    kind: SessionKind,
    topic_id: Option<i32>,
    n: Option<i32>,
    subject_id: Option<i32>,
) -> AppResult<SessionInfo> {
    let profile: Profile = settings::load(&pool).await?;
    let due = repo::errors_due(&pool).await?;
    let errors: Vec<i32> = due.iter().map(|e| e.0).collect();
    let n = |default: i32| n.unwrap_or(default).clamp(1, 120) as usize;
    let (slots, time_limit) = match kind {
        SessionKind::Diaria => {
            let left = (profile.daily_questions - repo::answered_today(&pool).await?).max(5);
            let ranked: Vec<(i32, f64)> = rank(&pool).await?.iter().map(|w| (w.topic_id, w.score)).collect();
            let n = n(left);
            (rules::compose(&errors, &ranked, n, n / 4, 5), None)
        }
        SessionKind::Reforco => {
            let ranked: Vec<(i32, f64)> = rank(&pool).await?.iter().map(|w| (w.topic_id, w.score)).collect();
            let n = n(15);
            (rules::compose(&errors, &ranked, n, n / 2, 3), None)
        }
        SessionKind::Erros => (errors.iter().take(n(30)).map(|&q| Slot::Error(q)).collect(), None),
        SessionKind::Topico => match (topic_id, subject_id) {
            (Some(t), _) => (vec![Slot::Topic(t); n(10)], None),
            // Matéria inteira: os tópicos mais fracos dela, com os erros vencidos dela na frente.
            (None, Some(sid)) => {
                let mine: HashSet<i32> = repo::topic_ids_of_subject(&pool, sid).await?.into_iter().collect();
                let ranked: Vec<(i32, f64)> = rank(&pool).await?.iter().filter(|w| mine.contains(&w.topic_id)).map(|w| (w.topic_id, w.score.max(0.01))).collect();
                let errs: Vec<i32> = due.iter().filter(|e| mine.contains(&e.1)).map(|e| e.0).collect();
                let n = n(15);
                (rules::compose(&errs, &ranked, n, n / 3, 4), None)
            }
            (None, None) => return Err(AppError::Invalid("Escolha a matéria ou o tópico".into())),
        },
        SessionKind::Simulado => {
            let n = n(30);
            let by_weight = repo::topics_by_weight(&pool).await?;
            // ~3 min por questão de múltipla escolha, como nas provas.
            (rules::compose(&[], &by_weight, n, 0, n), Some((n as i32) * 3))
        }
    };
    if slots.is_empty() {
        return Err(AppError::Invalid(match kind {
            SessionKind::Erros => "Nenhum erro para revisar hoje. 🎉".into(),
            _ => "Cadastre matérias e tópicos primeiro (Matérias → Importar do edital)".into(),
        }));
    }
    let planned = slots.len();
    let id = repo::create_session(&pool, kind.as_str(), planned as i32, time_limit).await?;
    state
        .sessions
        .lock()
        .map_err(|_| AppError::Invalid("estado da sessão corrompido".into()))?
        .insert(id, Queue { slots, served: HashSet::new(), planned });
    Ok(SessionInfo { id, kind, planned: planned as i32, time_limit_min: time_limit })
}

/// Próxima questão (gera se o banco do tópico estiver vazio). `None` = sessão acabou.
#[tauri::command]
#[specta::specta]
pub async fn next_question(app: AppHandle, pool: State<'_, SqlitePool>, state: State<'_, StudyState>, session_id: i32) -> AppResult<Option<QuestionView>> {
    loop {
        let (slot, served_json, position, planned, upcoming) = {
            let mut m = state.sessions.lock().map_err(|_| AppError::Invalid("estado da sessão corrompido".into()))?;
            let q = m.get_mut(&session_id).ok_or_else(|| AppError::Invalid("Sessão encerrada".into()))?;
            if q.slots.is_empty() {
                return Ok(None);
            }
            let slot = q.slots.remove(0);
            let served = serde_json::to_string(&q.served.iter().collect::<Vec<_>>())?;
            let upcoming = q.slots.iter().find_map(|s| match s {
                Slot::Topic(t) => Some(*t),
                Slot::Error(_) => None,
            });
            (slot, served, (q.planned - q.slots.len()) as i32, q.planned as i32, upcoming)
        };

        let picked = match slot {
            Slot::Error(qid) => Some((qid, true)),
            Slot::Topic(t) => {
                let mut id = repo::pick_for_topic(&pool, t, &served_json).await?;
                if id.is_none() {
                    // Espera a pré-geração em andamento (se houver) e gera se ainda faltar.
                    let lock = state.gen_lock(t);
                    let _g = lock.lock().await;
                    id = repo::pick_for_topic(&pool, t, &served_json).await?;
                    if id.is_none() {
                        generate(&app, &pool, t).await?;
                        id = repo::pick_for_topic(&pool, t, &served_json).await?;
                    }
                }
                id.map(|q| (q, false))
            }
        };
        if let Some(next) = upcoming {
            prefetch(app.clone(), next);
        }
        // Tópico sem questão possível (geração falhou em silêncio): pula a vaga.
        let Some((qid, from_errors)) = picked else { continue };
        if let Some(q) = state.sessions.lock().map_err(|_| AppError::Invalid("estado da sessão corrompido".into()))?.get_mut(&session_id) {
            q.served.insert(qid);
        }
        let row = repo::question(&pool, qid).await?;
        let options = row.options()?;
        let format = QuestionFormat::parse(&row.format).ok_or_else(|| AppError::Invalid(format!("Formato de questão desconhecido: {}", row.format)))?;
        let source = Provider::parse(&row.source).ok_or_else(|| AppError::Invalid(format!("Origem de questão desconhecida: {}", row.source)))?;
        return Ok(Some(QuestionView {
            id: row.id,
            topic_id: row.topic_id,
            topic: row.topic,
            subject: row.subject,
            color: row.color,
            banca: row.banca,
            format,
            statement: row.statement,
            options,
            difficulty: row.difficulty,
            source,
            from_errors,
            position,
            planned,
        }));
    }
}

/// Quantos tópicos fracos ficam com questões prontas antes de você clicar em "Começar".
const WARM_TOPICS: usize = 3;

/// Gera um lote se o tópico estiver com pouco estoque e ninguém já estiver gerando para ele.
async fn restock(app: &AppHandle, topic_id: i32) -> AppResult<()> {
    let pool = app.state::<SqlitePool>();
    if repo::fresh_count(&pool, topic_id).await? >= MIN_FRESH {
        return Ok(());
    }
    let lock = app.state::<StudyState>().gen_lock(topic_id);
    let Ok(_g) = lock.try_lock() else { return Ok(()) };
    generate(app, &pool, topic_id).await
}

/// Solta o `warming` mesmo se o aquecimento entrar em pânico.
struct WarmingGuard(AppHandle);

impl Drop for WarmingGuard {
    fn drop(&mut self) {
        self.0.state::<StudyState>().warming.store(false, Ordering::SeqCst);
    }
}

/// Pré-gera, um tópico por vez, os tópicos que a próxima sessão vai pedir primeiro.
/// Sem isso a primeira questão esperava o lote inteiro (~90 s no Ollama).
fn warm_up(app: AppHandle, topics: Vec<i32>) {
    if topics.is_empty() || app.state::<StudyState>().warming.swap(true, Ordering::SeqCst) {
        return;
    }
    tauri::async_runtime::spawn(async move {
        let _guard = WarmingGuard(app.clone());
        let pool = app.state::<SqlitePool>();
        // Só com o Ollama no ar: aquecer não pode gastar a assinatura do Claude sem você pedir.
        let local = match settings::load::<AppConfig>(&pool).await {
            Ok(cfg) => cfg.material_route != Route::Claude && ai::provider_for(&cfg, Task::Text).await == Provider::Ollama,
            Err(e) => {
                eprintln!("aquecimento de questões: {e}");
                false
            }
        };
        if !local {
            return;
        }
        for t in topics {
            if let Err(e) = restock(&app, t).await {
                eprintln!("aquecimento de questões: {e}");
                break; // IA fora do ar: não insiste nos outros
            }
        }
    });
}

/// Gera o próximo lote em segundo plano enquanto o usuário responde.
fn prefetch(app: AppHandle, topic_id: i32) {
    tauri::async_runtime::spawn(async move {
        if let Err(e) = restock(&app, topic_id).await {
            eprintln!("pré-geração de questões: {e}");
        }
    });
}

#[derive(Deserialize)]
struct Batch {
    #[serde(default)]
    questoes: Vec<GeneratedQuestion>,
}

/// Gera um lote de questões inéditas do tópico no estilo da banca e guarda no banco.
async fn generate(app: &AppHandle, pool: &SqlitePool, topic_id: i32) -> AppResult<()> {
    let cfg: AppConfig = settings::load(pool).await?;
    let topic = materials::topic_for_prompt(pool, topic_id).await?;
    let _ = StudyEvent { text: format!("O Grifo está escrevendo questões de {}…", topic.name) }.emit(app);

    let shape = match rules::format_for(topic.banca.as_deref()) {
        Some(QuestionFormat::Ce) => "TODAS no formato Certo/Errado: `alternativas` vazio e `gabarito` \"C\" ou \"E\".",
        Some(QuestionFormat::Ae) => "TODAS de múltipla escolha com 5 alternativas (A–E) e `gabarito` com a letra.",
        None => "Metade Certo/Errado (`alternativas` vazio, `gabarito` \"C\"/\"E\") e metade múltipla escolha com 5 alternativas.",
    };
    let format = format!(
        "Formato: {{\"questoes\":[{{\"enunciado\":\"...\",\"alternativas\":[\"...\"],\"gabarito\":\"B\",\"comentario\":\"por que a certa está certa e cada distrator está errado, com a base legal\",\"dificuldade\":\"facil|media|dificil\"}}]}}. \
         Gere exatamente {BATCH} questões inéditas, {shape} Alternativas sem a letra na frente. Não repita o mesmo assunto em duas questões. \
         Questão de interpretação (\"no texto\", \"o autor\", \"o trecho\") TRAZ o texto-base inteiro dentro do `enunciado`, antes do comando; nunca cite um texto que não está ali."
    );
    let (system, user) = grifo::quick_prompt(app, MaterialKind::Questoes, Output::Json(&format), &topic)?;
    let (raw, provider) = ai::complete(app, &cfg, Task::Text, &system, &user, true).await?;
    let batch: Batch = ai::parse_object(&raw, "Questões geradas pela IA")?;
    let valid: Vec<_> = batch.questoes.into_iter().filter_map(rules::validate).collect();
    if valid.is_empty() {
        return Err(AppError::Invalid(format!("A IA não gerou nenhuma questão válida para {}", topic.name)));
    }
    repo::insert_questions(pool, topic_id, topic.banca.as_deref(), provider, &valid).await?;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn answer_question(
    pool: State<'_, SqlitePool>,
    session_id: Option<i32>,
    question_id: i32,
    answer: String,
    seconds: i32,
) -> AppResult<AnswerResult> {
    let q = repo::question(&pool, question_id).await?;
    let (key, explanation) = repo::answer_key(&pool, question_id).await?;
    let answer = answer.trim().to_uppercase();
    let correct = answer == key;
    let gained = xp::for_questions(1, i32::from(correct));
    let ((), outcome) =
        db::player::award(&pool, async || repo::record_answer(&pool, &q, session_id, &answer, correct, seconds.clamp(0, 3600), gained).await).await?;
    Ok(AnswerResult { correct, answer: key, explanation, xp_gained: gained, mission_xp: outcome.mission_xp, level_up: outcome.level_up })
}

#[tauri::command]
#[specta::specta]
pub async fn finish_session(pool: State<'_, SqlitePool>, state: State<'_, StudyState>, session_id: i32) -> AppResult<SessionReport> {
    state.sessions.lock().map_err(|_| AppError::Invalid("estado da sessão corrompido".into()))?.remove(&session_id);
    let (total, correct, seconds, by_subject) = repo::finish_session(&pool, session_id).await?;
    Ok(SessionReport { total, correct, seconds, xp: xp::for_questions(total, correct), by_subject })
}

/// Explicação mais detalhada de uma questão (Markdown), pela IA de tarefas.
#[tauri::command]
#[specta::specta]
pub async fn explain_question(app: AppHandle, pool: State<'_, SqlitePool>, question_id: i32, user_answer: String) -> AppResult<String> {
    let cfg: AppConfig = settings::load(&pool).await?;
    let q = repo::question(&pool, question_id).await?;
    let (key, explanation) = repo::answer_key(&pool, question_id).await?;
    let opts = q.options()?.iter().enumerate().map(|(i, o)| format!("{}) {o}", rules::letter(i))).collect::<Vec<_>>().join("\n");
    let system = "Você é o Grifo, professor de cursinho para concursos. Explique em português do Brasil, em Markdown curto \
        (no máximo 12 linhas): 1) o conceito que a questão cobra, 2) por que a resposta certa está certa, 3) o erro de raciocínio \
        de quem marcou a resposta do aluno, 4) um macete para não errar de novo. Não invente artigo de lei: se não tiver certeza, diga para conferir na fonte.";
    let user = format!(
        "Tópico: {} ({}).\nQUESTÃO: {}\n{opts}\nGABARITO: {key}\nCOMENTÁRIO ORIGINAL: {explanation}\nRESPOSTA DO ALUNO: {user_answer}",
        q.topic, q.subject, q.statement
    );
    let (text, _) = ai::complete(&app, &cfg, Task::Text, system, &user, false).await?;
    Ok(text.trim().to_string())
}

// ---------- flashcards ----------

#[tauri::command]
#[specta::specta]
pub async fn cards_due(pool: State<'_, SqlitePool>, limit: i32) -> AppResult<Vec<repo::CardRow>> {
    repo::cards_due(&pool, limit.clamp(1, 200)).await
}

#[tauri::command]
#[specta::specta]
pub async fn review_card(pool: State<'_, SqlitePool>, card_id: i32, grade: Grade) -> AppResult<i32> {
    let next = rules::review(repo::card_state(&pool, card_id).await?, grade);
    repo::save_card_state(&pool, card_id, next).await?;
    Ok(next.interval_days)
}

/// Copia os cartões de um material de flashcards do Grifo para o baralho. Devolve quantos novos.
#[tauri::command]
#[specta::specta]
pub async fn cards_from_material(pool: State<'_, SqlitePool>, material_id: i32) -> AppResult<i32> {
    let (m, content) = materials::get(&pool, material_id).await?;
    let cards = rules::parse_cards(&content.unwrap_or_default());
    if cards.is_empty() {
        return Err(AppError::Invalid("Esse material não tem tabela de cartões".into()));
    }
    repo::insert_cards(&pool, Some(m.topic_id), CardSource::Grifo, &cards).await
}

/// Vira flashcard uma questão (geralmente a que você errou).
#[tauri::command]
#[specta::specta]
pub async fn card_from_question(pool: State<'_, SqlitePool>, question_id: i32) -> AppResult<i32> {
    let q = repo::question(&pool, question_id).await?;
    let (key, explanation) = repo::answer_key(&pool, question_id).await?;
    let options = q.options()?;
    let (front, back) = if options.is_empty() {
        (format!("Certo ou errado?\n{}", q.statement), format!("{}\n{explanation}", if key == "C" { "CERTO" } else { "ERRADO" }))
    } else {
        let text = rules::letter_index(&key).and_then(|i| options.get(i)).ok_or_else(|| AppError::Invalid(format!("Gabarito {key} fora das alternativas")))?;
        (q.statement.clone(), format!("{key}) {text}\n{explanation}"))
    };
    repo::insert_cards(&pool, Some(q.topic_id), CardSource::Erro, &[(front, back)]).await
}

// ---------- baralho, caderno de erros e desempenho ----------

#[tauri::command]
#[specta::specta]
pub async fn list_cards(pool: State<'_, SqlitePool>) -> AppResult<Vec<repo::DeckCard>> {
    repo::list_cards(&pool).await
}

/// Cartão escrito por você. Devolve 0 se já existia um com a mesma frente.
#[tauri::command]
#[specta::specta]
pub async fn create_card(pool: State<'_, SqlitePool>, topic_id: Option<i32>, front: String, back: String) -> AppResult<i32> {
    let (front, back) = (front.trim().to_string(), back.trim().to_string());
    if front.is_empty() || back.is_empty() {
        return Err(AppError::Invalid("Preencha a frente e o verso".into()));
    }
    repo::insert_cards(&pool, topic_id, CardSource::Manual, &[(front, back)]).await
}

#[tauri::command]
#[specta::specta]
pub async fn update_card(pool: State<'_, SqlitePool>, id: i32, front: String, back: String) -> AppResult<()> {
    let (front, back) = (front.trim(), back.trim());
    if front.is_empty() || back.is_empty() {
        return Err(AppError::Invalid("Preencha a frente e o verso".into()));
    }
    repo::update_card(&pool, id, front, back).await
}

#[tauri::command]
#[specta::specta]
pub async fn delete_card(pool: State<'_, SqlitePool>, id: i32) -> AppResult<()> {
    repo::delete_card(&pool, id).await
}

#[tauri::command]
#[specta::specta]
pub async fn error_list(pool: State<'_, SqlitePool>) -> AppResult<Vec<repo::ErrorEntry>> {
    repo::error_list(&pool).await
}

/// Tira do caderno (você já domina).
#[tauri::command]
#[specta::specta]
pub async fn remove_error(pool: State<'_, SqlitePool>, question_id: i32) -> AppResult<()> {
    repo::remove_error(&pool, question_id).await
}

/// Gabarito errado, texto-base faltando etc.: a questão some das sessões (o histórico fica).
#[tauri::command]
#[specta::specta]
pub async fn report_question(pool: State<'_, SqlitePool>, question_id: i32) -> AppResult<()> {
    repo::report_question(&pool, question_id).await
}

#[derive(Debug, Serialize, specta::Type)]
pub struct Performance {
    pub subjects: Vec<repo::SubjectPerf>,
    pub simulados: Vec<repo::SimuladoRow>,
    /// Últimos 30 dias, só os dias com questões.
    pub daily: Vec<repo::DayCount>,
}

#[tauri::command]
#[specta::specta]
pub async fn performance(pool: State<'_, SqlitePool>) -> AppResult<Performance> {
    Ok(Performance { subjects: repo::subject_perf(&pool).await?, simulados: repo::simulados(&pool).await?, daily: repo::daily_answers(&pool, 30).await? })
}
