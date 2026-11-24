//! Cadastro automático de matérias: pelo cargo (Claude + web) ou pelo edital (PDF/texto → IA local).
//! Nada é salvo antes de o usuário revisar a prévia e aplicar.

use base64::Engine;
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use tauri::{AppHandle, Manager, State};
use tauri_specta::Event;

use crate::ai::{self, Task};
use crate::claude;
use crate::db::subjects::{self as repo, SubjectInput};
use crate::domain::edital::{self, PlanSubject};
use crate::domain::text::{self, fold};
use crate::error::{AppError, AppResult};
use crate::settings::{self, AppConfig};

/// Fatia do edital por chamada ao modelo local (cabe no contexto de 12k tokens com folga).
const CHUNK_CHARS: usize = 9_000;
/// Edital gigante: o conteúdo programático raramente passa disso.
const MAX_CHARS: usize = 90_000;
const COLORS: [&str; 10] = ["#e0a84f", "#7a9a5b", "#5f8fa3", "#c8644a", "#8a7fb0", "#d9b45a", "#6fae6a", "#b5739d", "#4f9d9a", "#c98a4a"];

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type, tauri_specta::Event)]
pub struct PlannerEvent {
    /// Etapa: 1 ler o PDF (só no front), 2 achar o conteúdo, 3 separar matérias, 4 revisar e juntar.
    pub step: i32,
    pub text: String,
    pub progress: Option<f64>,
    /// Matérias encontradas até agora (aparecem na tela enquanto a leitura anda).
    pub found: Vec<String>,
}

fn emit(app: &AppHandle, step: i32, text: impl Into<String>, progress: Option<f64>, found: &[String]) {
    let _ = PlannerEvent { step, text: text.into(), progress, found: found.to_vec() }.emit(app);
}

/// Matérias e tópicos do edital mais recente do cargo, pesquisados na web pelo Claude.
#[tauri::command]
#[specta::specta]
pub async fn plan_from_role(app: AppHandle, pool: State<'_, SqlitePool>, role: String, banca: Option<String>) -> AppResult<Vec<PlanSubject>> {
    if role.trim().is_empty() {
        return Err(AppError::Invalid("Diga o cargo (ex.: Técnico Judiciário do TRT-2)".into()));
    }
    let cfg: AppConfig = settings::load(&pool).await?;
    let banca = banca.filter(|b| !b.trim().is_empty()).map_or(String::new(), |b| format!(" (banca {b})"));
    let prompt = format!(
        "Pesquise na web o edital mais recente do concurso para o cargo \"{role}\"{banca}. Use o edital oficial \
         (site da banca ou diário oficial) ou, se não houver edital recente, o último edital do mesmo cargo. \
         Extraia o conteúdo programático completo desse cargo. Responda SOMENTE com um array JSON (sem markdown) \
         em que cada item é {{\"name\": \"nome da matéria\", \"weight\": número de questões da matéria na prova \
         (ou peso; 1 se não souber), \"topics\": [\"tópico 1\", \"tópico 2\", ...]}}. Tópicos curtos, um por item, \
         na ordem do edital, sem numeração."
    );
    emit(&app, 2, format!("Pesquisando o edital de {role} na web…"), None, &[]);
    let cwd = app.path().app_data_dir()?;
    let on_progress = |t: String| emit(&app, 3, t, None, &[]);
    let text = claude::run_job(&cfg.claude_cli, &prompt, &cwd, &["WebSearch", "WebFetch"], None, on_progress, None).await?;
    let json = ai::json_array(&text).ok_or_else(|| AppError::Invalid("O Claude não devolveu uma lista de matérias".into()))?;
    let plan: Vec<PlanSubject> = serde_json::from_str(json).map_err(|e| AppError::Invalid(format!("Lista de matérias inválida: {e}")))?;
    let plan = edital::merge(plan);
    if plan.is_empty() {
        return Err(AppError::Invalid("Não achei matérias para esse cargo".into()));
    }
    Ok(plan)
}

/// Texto de um PDF (vindo do front em base64). Roda fora do async: o parser pode ser lento ou entrar em pânico.
#[tauri::command]
#[specta::specta]
pub async fn pdf_text(data_base64: String) -> AppResult<String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data_base64.as_bytes())
        .map_err(|e| AppError::Invalid(format!("Arquivo inválido: {e}")))?;
    let text = tauri::async_runtime::spawn_blocking(move || pdf_extract::extract_text_from_mem(&bytes))
        .await
        .map_err(|_| AppError::Invalid("Não consegui ler este PDF (formato não suportado)".into()))?
        .map_err(|e| AppError::Invalid(format!("Não consegui ler este PDF: {e}")))?;
    if text.trim().len() < 200 {
        return Err(AppError::Invalid("O PDF não tem texto selecionável (parece escaneado). Copie e cole o conteúdo programático.".into()));
    }
    Ok(text)
}

#[derive(Deserialize)]
struct ChunkAnswer {
    #[serde(default)]
    materias: Vec<ChunkSubject>,
}

#[derive(Deserialize)]
struct ChunkSubject {
    #[serde(default)]
    nome: String,
    #[serde(default)]
    peso: Option<f64>,
    #[serde(default)]
    topicos: Vec<String>,
}

const EDITAL_SYSTEM: &str = "Você extrai o conteúdo programático de editais de concurso público. \
Recebe um TRECHO do edital e devolve SOMENTE JSON no formato \
{\"materias\":[{\"nome\":\"Língua Portuguesa\",\"peso\":null,\"topicos\":[\"Compreensão e interpretação de textos\",\"Ortografia oficial\"]}]}. \
Regras: \
1) Matéria é o TÍTULO do edital (geralmente em MAIÚSCULAS, como LÍNGUA PORTUGUESA ou DIREITO ADMINISTRATIVO). \
Nunca invente matéria a partir de um tópico. Títulos de grupo como CONHECIMENTOS GERAIS ou CONHECIMENTOS ESPECÍFICOS não são matéria. \
2) Se o trecho começar com \"(continuação de X)\", os itens são da matéria X: use exatamente esse nome. \
3) Cada item NUMERADO do edital vira UM tópico, com o texto do item inteiro (sem o número). Não quebre um item em vários \
nem separe leis, artigos ou exemplos do item. Item sem numeração: um tópico por frase ou por ponto e vírgula. \
4) Copie nomes e textos como estão, só corrigindo espaços quebrados. \
5) peso = número de questões ou peso da matéria se o trecho disser, senão null. \
6) Ignore inscrições, datas, cargos que não pedirem, notas de rodapé e listas de bibliografia. \
Se o trecho não tiver conteúdo programático, devolva {\"materias\":[]}.";

/// Matérias e tópicos a partir do texto do edital, pela IA de tarefas (Ollama no automático), em fatias.
#[tauri::command]
#[specta::specta]
pub async fn plan_from_edital(app: AppHandle, pool: State<'_, SqlitePool>, text: String, role: Option<String>) -> AppResult<Vec<PlanSubject>> {
    let cfg: AppConfig = settings::load(&pool).await?;
    emit(&app, 2, "Consertando o texto do PDF e procurando o conteúdo programático…", None, &[]);
    // texto do PDF consertado → só o conteúdo programático (até o próximo anexo) → fatias por matéria
    let clean = edital::clean_pdf_text(&text);
    // Edital com a estrutura usual (título em maiúsculas + itens 1, 2, 3…): lê por regra, exato e
    // na hora, a partir do começo de conteúdo que render mais itens. A IA só entra sem essa estrutura.
    if let Some(plan) = edital::best_structured(&clean, MAX_CHARS) {
        let names: Vec<String> = plan.iter().map(|s| s.name.clone()).collect();
        let topics: usize = plan.iter().map(|s| s.topics.len()).sum();
        emit(&app, 4, format!("Li pela estrutura do edital: {} matérias e {topics} tópicos", plan.len()), Some(1.0), &names);
        return Ok(plan);
    }
    emit(&app, 2, "O edital não segue o formato padrão: a IA local vai ler por partes", None, &[]);
    let section = edital::until_next_annex(edital::program_section(&clean));
    let section = text::head(section, MAX_CHARS);
    let parts = edital::chunks_by_subject(section, CHUNK_CHARS);
    if parts.is_empty() {
        return Err(AppError::Invalid("O texto do edital está vazio".into()));
    }
    let role_hint = role
        .filter(|r| !r.trim().is_empty())
        .map_or(String::new(), |r| format!("Cargo de interesse: {r}. Se o edital separar conteúdo por cargo, pegue só o desse cargo e os conhecimentos comuns a todos.\n\n"));

    let mut found = Vec::new();
    let mut names: Vec<String> = Vec::new();
    for (i, part) in parts.iter().enumerate() {
        // o que está nesta parte, para a tela mostrar ("lendo LÍNGUA PORTUGUESA, DIREITO…")
        let heads: Vec<&str> = part.lines().map(str::trim).filter(|l| edital::is_heading(l)).take(3).collect();
        let what = if heads.is_empty() { String::new() } else { format!(": {}", heads.join(", ")) };
        emit(&app, 3, format!("IA lendo a parte {} de {}{what}", i + 1, parts.len()), Some(i as f64 / parts.len() as f64), &names);
        let user = format!("{role_hint}TRECHO DO EDITAL:\n{part}");
        // Fatia ilegível: tenta mais uma vez antes de pular (pular fazia matérias inteiras sumirem).
        let mut answer = None;
        for attempt in 0..2 {
            let (raw, _) = ai::complete(&app, &cfg, Task::Text, EDITAL_SYSTEM, &user, true).await?;
            match ai::parse_object::<ChunkAnswer>(&raw, "Trecho do edital") {
                Ok(a) => {
                    answer = Some(a);
                    break;
                }
                Err(_) if attempt == 0 => emit(&app, 3, format!("A parte {} veio ilegível, a IA está tentando de novo", i + 1), None, &names),
                Err(_) => emit(&app, 3, format!("A parte {} veio ilegível duas vezes e ficou de fora", i + 1), None, &names),
            }
        }
        if let Some(a) = answer {
            for m in &a.materias {
                if !m.topicos.is_empty() && !names.iter().any(|n| edital::subject_key(n) == edital::subject_key(&m.nome)) {
                    names.push(m.nome.clone());
                }
            }
            found.extend(a.materias.into_iter().map(|m| PlanSubject { name: m.nome, weight: m.peso.unwrap_or(1.0), topics: m.topicos }));
        }
        emit(&app, 3, format!("Parte {} de {} lida", i + 1, parts.len()), Some((i + 1) as f64 / parts.len() as f64), &names);
    }
    emit(&app, 4, "Juntando matérias repetidas e conferindo os tópicos…", Some(1.0), &names);
    let plan = edital::merge(found);
    if plan.is_empty() {
        return Err(AppError::Invalid("Não achei matérias nesse texto. Ele tem o conteúdo programático?".into()));
    }
    Ok(plan)
}

/// Salva o plano revisado: cria as matérias novas e acrescenta só os tópicos que ainda não existem.
/// Devolve quantos tópicos entraram.
#[tauri::command]
#[specta::specta]
pub async fn apply_plan(pool: State<'_, SqlitePool>, plan: Vec<PlanSubject>) -> AppResult<i32> {
    let existing = repo::list(&pool).await?;
    let mut added = 0;
    for (i, s) in edital::merge(plan).into_iter().enumerate() {
        let id = match existing.iter().find(|e| fold(&e.name) == fold(&s.name)) {
            Some(e) => e.id,
            None => {
                let color = COLORS[(existing.len() + i) % COLORS.len()].to_string();
                repo::create(&pool, &SubjectInput { name: s.name.clone(), color, exam_weight: s.weight.clamp(0.0, 100.0) }).await?
            }
        };
        let have: Vec<String> = repo::topic_names(&pool, id).await?.iter().map(|n| fold(n)).collect();
        let new: Vec<&str> = s.topics.iter().filter(|t| !have.contains(&fold(t))).map(String::as_str).collect();
        added += new.len() as i32;
        repo::add_topics(&pool, id, &new).await?;
    }
    Ok(added)
}
