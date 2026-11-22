//! Sala de aula: o professor (usuário) explica em blocos; o avaliador oculto marca lacunas;
//! o orquestrador escolhe o aluno e a lacuna; o aluno pergunta em streaming (Ollama).

use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use tauri::{AppHandle, State};
use tauri_plugin_opener::OpenerExt;
use tauri_specta::Event;

use crate::ai::{self, Task};
use crate::commands::material::{self, GrifoJobs};
use crate::db::{self, classes::{self, ClassReport, TopicMaterial, TopicRef}};
use crate::domain::classroom::{self, Evaluation, Student};
use crate::domain::text::{head, tail};
use crate::domain::xp;
use crate::error::{AppError, AppResult};
use crate::grifo::MaterialKind;
use crate::ollama;
use crate::settings::{self, AppConfig};

/// Limite do material enviado ao avaliador (contexto do modelo local).
const MAX_REFERENCE_CHARS: usize = 24_000;

wire_enum! {
    pub enum Speaker {
        Teacher = "teacher",
        Student = "student",
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct Line {
    pub role: Speaker,
    pub student: Option<Student>,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type, tauri_specta::Event)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ClassEvent {
    Evaluating { class_id: i32 },
    Board { class_id: i32, evaluation: Evaluation },
    Asking { class_id: i32, student: Student },
    Token { class_id: i32, student: Student, text: String },
    Done { class_id: i32, student: Student, text: String },
}

#[derive(Debug, Serialize, specta::Type)]
pub struct StudentInfo {
    pub id: Student,
    pub name: String,
}

#[tauri::command]
#[specta::specta]
pub fn list_students() -> Vec<StudentInfo> {
    classroom::STUDENTS.iter().map(|s| StudentInfo { id: *s, name: s.name().into() }).collect()
}

#[tauri::command]
#[specta::specta]
pub async fn list_all_topics(pool: State<'_, SqlitePool>) -> AppResult<Vec<TopicRef>> {
    classes::all_topics(&pool).await
}

#[tauri::command]
#[specta::specta]
pub async fn get_topic_material(pool: State<'_, SqlitePool>, topic_id: i32) -> AppResult<TopicMaterial> {
    classes::material(&pool, topic_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn set_topic_material(pool: State<'_, SqlitePool>, topic_id: i32, text: String) -> AppResult<()> {
    classes::set_material(&pool, topic_id, &text, None).await
}

#[tauri::command]
#[specta::specta]
pub async fn start_class(pool: State<'_, SqlitePool>, topic_id: i32) -> AppResult<i32> {
    let reference = classes::material(&pool, topic_id).await?.material.unwrap_or_default();
    if reference.trim().is_empty() {
        return Err(AppError::Invalid("Cole ou gere o material de referência do tópico antes da aula".into()));
    }
    classes::create(&pool, topic_id, &reference).await
}

/// Ilegível vira erro: devolver vazio faria o próximo bloco gravar por cima da aula inteira.
fn transcript_of(json: &str) -> AppResult<Vec<Line>> {
    serde_json::from_str(json).map_err(|e| AppError::Invalid(format!("Transcrição da aula ilegível: {e}")))
}

fn evaluation_of(report: Option<&str>) -> AppResult<Option<Evaluation>> {
    report.map(|r| serde_json::from_str(r).map_err(|e| AppError::Invalid(format!("Quadro da aula ilegível: {e}")))).transpose()
}

/// Um bloco de explicação: avalia, escolhe o aluno, transmite a pergunta. Eventos chegam em `ClassEvent`.
#[tauri::command]
#[specta::specta]
pub async fn send_explanation(
    app: AppHandle,
    pool: State<'_, SqlitePool>,
    class_id: i32,
    text: String,
) -> AppResult<()> {
    if text.trim().is_empty() {
        return Ok(());
    }
    let row = classes::get(&pool, class_id).await?;
    if row.finished {
        return Err(AppError::Invalid("Essa aula já terminou".into()));
    }
    let cfg: AppConfig = settings::load(&pool).await?;
    let mut lines = transcript_of(&row.transcript)?;
    lines.push(Line { role: Speaker::Teacher, student: None, text });

    let _ = ClassEvent::Evaluating { class_id }.emit(&app);
    let teacher = teacher_text(&lines);
    let evaluation = evaluate(&app, &cfg, &row.reference_text, &teacher).await?;
    let _ = ClassEvent::Board { class_id, evaluation: evaluation.clone() }.emit(&app);

    let last = lines.iter().rev().find_map(|l| l.student);
    let turn = lines.iter().filter(|l| l.role == Speaker::Student).count();
    let (student, gap) = classroom::next_turn(&evaluation, last, turn);
    let _ = ClassEvent::Asking { class_id, student }.emit(&app);

    let system = student_system(student);
    let user = student_prompt(&lines, gap.as_deref());
    let messages = [ollama::Msg { role: "system", content: &system }, ollama::Msg { role: "user", content: &user }];
    let question = ollama::chat_stream(&cfg.ollama_url, &cfg.student_model, &messages, |t| {
        let _ = ClassEvent::Token { class_id, student, text: t.to_string() }.emit(&app);
    })
    .await?;
    let question = question.trim().to_string();
    let _ = ClassEvent::Done { class_id, student, text: question.clone() }.emit(&app);

    lines.push(Line { role: Speaker::Student, student: Some(student), text: question });
    classes::save_progress(&pool, class_id, &serde_json::to_string(&lines)?, &serde_json::to_string(&evaluation)?).await
}

/// Encerra a aula: boletim com nota de cobertura, XP e reaula agendada (1/7/30 dias).
#[tauri::command]
#[specta::specta]
pub async fn finish_class(pool: State<'_, SqlitePool>, class_id: i32) -> AppResult<ClassReport> {
    let row = classes::get(&pool, class_id).await?;
    if !transcript_of(&row.transcript)?.iter().any(|l| l.role == Speaker::Teacher) {
        return Err(AppError::Invalid("Explique pelo menos um bloco antes de encerrar".into()));
    }
    let evaluation = evaluation_of(row.report.as_deref())?.unwrap_or_default();
    let score = classroom::coverage(&evaluation);
    db::player::award(&pool, async || classes::finish(&pool, class_id, row.topic_id, score, xp::CLASS).await).await?;
    classes::reports(&pool, Some(row.topic_id))
        .await?
        .into_iter()
        .find(|r| r.id == class_id)
        .ok_or_else(|| AppError::Invalid("Boletim não encontrado".into()))
}

#[tauri::command]
#[specta::specta]
pub async fn list_class_reports(pool: State<'_, SqlitePool>, topic_id: Option<i32>) -> AppResult<Vec<ClassReport>> {
    classes::reports(&pool, topic_id).await
}

fn teacher_text(lines: &[Line]) -> String {
    lines.iter().filter(|l| l.role == Speaker::Teacher).map(|l| l.text.as_str()).collect::<Vec<_>>().join("\n\n")
}

const EVALUATOR_SYSTEM: &str = "Você é um avaliador rigoroso e OCULTO de uma aula. Compare a EXPLICAÇÃO do professor \
com o MATERIAL DE REFERÊNCIA. Liste os conceitos importantes do material (no máximo 12) e classifique cada um em: \
cobertos (explicado corretamente), rasos (mencionado sem profundidade), omitidos (não mencionado ainda), \
erros (explicado de forma errada ou contraditória com o material). Cada item é um TEMA curto (até 8 palavras) \
e NUNCA revela a resposta correta. Responda SOMENTE com JSON no formato \
{\"cobertos\":[],\"rasos\":[],\"omitidos\":[],\"erros\":[]}.";

async fn evaluate(app: &AppHandle, cfg: &AppConfig, reference: &str, teacher: &str) -> AppResult<Evaluation> {
    let user = format!(
        "MATERIAL DE REFERÊNCIA:\n{}\n\nEXPLICAÇÃO DO PROFESSOR ATÉ AGORA:\n{}",
        head(reference, MAX_REFERENCE_CHARS),
        tail(teacher, 8_000)
    );
    let (raw, _) = ai::complete(app, cfg, Task::Evaluator, EVALUATOR_SYSTEM, &user, true).await?;
    ai::parse_object(&raw, "Avaliação da aula")
}

fn student_system(s: Student) -> String {
    format!(
        "Você é {name}, aluno(a) numa turma. Você NÃO sabe nada sobre a matéria e nunca dá respostas: só pergunta. \
         {persona} Faça UMA pergunta curta (no máximo 2 frases), em português do Brasil, tom coloquial, \
         sem saudação e sem explicar nada.",
        name = s.name(),
        persona = s.persona()
    )
}

fn student_prompt(lines: &[Line], gap: Option<&str>) -> String {
    let teacher = teacher_text(lines);
    let asked: Vec<&str> = lines.iter().filter(|l| l.role == Speaker::Student).rev().take(4).map(|l| l.text.as_str()).collect();
    let hint = gap.map_or(String::new(), |g| {
        format!("Você ficou curioso(a) especificamente sobre: \"{g}\". Pergunte sobre isso sem mostrar que sabe a resposta.\n")
    });
    format!(
        "O que o professor explicou até agora:\n{}\n\nPerguntas que a turma já fez (não repita):\n{}\n\n{hint}Sua pergunta:",
        tail(&teacher, 6_000),
        if asked.is_empty() { "(nenhuma)".to_string() } else { asked.join("\n") }
    )
}

// ---------- Grifo: gerar apostila ----------

/// Roda a skill do Grifo pelo Claude CLI e anexa o resultado ao tópico como material de referência.
#[tauri::command]
#[specta::specta]
pub async fn generate_apostila(
    app: AppHandle,
    pool: State<'_, SqlitePool>,
    jobs: State<'_, GrifoJobs>,
    topic_id: i32,
) -> AppResult<TopicMaterial> {
    material::generate(&app, &pool, &jobs, topic_id, MaterialKind::Resumo, true).await?;
    classes::material(&pool, topic_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn open_material(app: AppHandle, pool: State<'_, SqlitePool>, topic_id: i32) -> AppResult<()> {
    let path = classes::material(&pool, topic_id)
        .await?
        .material_path
        .ok_or_else(|| AppError::Invalid("Esse tópico não tem apostila gerada".into()))?;
    app.opener().open_path(path, None::<&str>).map_err(|e| AppError::Invalid(e.to_string()))
}

#[tauri::command]
#[specta::specta]
pub fn open_link(app: AppHandle, url: String) -> AppResult<()> {
    // Única exceção a http(s): a tela do Windows onde se instalam as vozes pt-BR.
    if !(url.starts_with("https://") || url.starts_with("http://") || url == "ms-settings:speech") {
        return Err(AppError::Invalid("Link inválido".into()));
    }
    app.opener().open_url(url, None::<&str>).map_err(|e| AppError::Invalid(e.to_string()))
}

// ---------- retomar aula ----------

#[derive(Debug, Serialize, specta::Type)]
pub struct OpenClassInfo {
    pub id: i32,
    pub topic_id: i32,
    pub topic: String,
    pub subject: String,
    pub held_at: String,
    pub lines: i32,
}

/// Aulas que ficaram abertas (o app fechou no meio): dá para continuar de onde parou.
#[tauri::command]
#[specta::specta]
pub async fn open_classes(pool: State<'_, SqlitePool>) -> AppResult<Vec<OpenClassInfo>> {
    classes::open(&pool)
        .await?
        .into_iter()
        .map(|c| {
            Ok(OpenClassInfo {
                lines: transcript_of(&c.transcript)?.len() as i32,
                id: c.id,
                topic_id: c.topic_id,
                topic: c.topic,
                subject: c.subject,
                held_at: c.held_at,
            })
        })
        .collect()
}

#[derive(Debug, Serialize, specta::Type)]
pub struct ClassState {
    pub lines: Vec<Line>,
    pub evaluation: Option<Evaluation>,
}

/// Falas e quadro de uma aula aberta, para continuar.
#[tauri::command]
#[specta::specta]
pub async fn class_state(pool: State<'_, SqlitePool>, class_id: i32) -> AppResult<ClassState> {
    let row = classes::get(&pool, class_id).await?;
    Ok(ClassState {
        lines: transcript_of(&row.transcript)?,
        evaluation: evaluation_of(row.report.as_deref())?,
    })
}

#[tauri::command]
#[specta::specta]
pub async fn discard_class(pool: State<'_, SqlitePool>, class_id: i32) -> AppResult<()> {
    classes::delete_open(&pool, class_id).await
}
