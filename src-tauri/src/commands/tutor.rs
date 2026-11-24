//! Tira-dúvidas ("Pergunte ao Grifo"): chat com a IA sobre uma matéria ou um tópico do edital.
//! Com IA local no ar, a resposta vem escrevendo (streaming do Ollama); sem ela, vai pela rota de
//! tarefas de Config → IA (Claude, Gemini, GPT, DeepSeek…) de uma vez.

use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use tauri::{AppHandle, State};
use tauri_specta::Event;

use crate::ai::{self, Task};
use crate::db::{materials, subjects};
use crate::domain::text;
use crate::error::{AppError, AppResult};
use crate::settings::{self, AppConfig};
use crate::{gpu, ollama};

/// Uma fala da conversa (o front guarda o histórico e manda junto a cada pergunta).
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct TutorTurn {
    /// "aluno" ou "grifo"
    pub role: String,
    pub text: String,
}

/// Pedaço da resposta chegando (`id` = número da pergunta no front).
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type, tauri_specta::Event)]
pub struct TutorToken {
    pub id: i32,
    pub text: String,
}

/// Material do tópico entra até aqui (o resto do contexto é a conversa).
const REFERENCE_CHARS: usize = 6_000;
/// Últimas falas mandadas ao modelo (conversa longa não estoura o contexto).
const HISTORY_TURNS: usize = 12;

fn system_prompt(context: &str) -> String {
    format!(
        "Você é o Grifo, professor de cursinho para concursos públicos, conversando com um aluno. \
         Responda em português do Brasil, de forma didática e direta: explique o conceito, dê um exemplo e, \
         quando for o caso, diga como a banca costuma cobrar e a pegadinha comum. Cite lei, artigo ou súmula \
         só quando tiver certeza; se não tiver, diga que o aluno deve conferir no texto oficial. \
         Se a pergunta fugir do conteúdo de concurso, responda em uma frase e volte ao estudo. \
         Use Markdown simples (listas, negrito). Respostas de até uns 3 parágrafos, a menos que peçam mais.\n\n{context}"
    )
}

/// Contexto da conversa: tópico (com o material de referência) ou matéria (com a lista de tópicos).
async fn context(pool: &SqlitePool, subject_id: Option<i32>, topic_id: Option<i32>) -> AppResult<String> {
    if let Some(t) = topic_id {
        let topic = materials::topic_for_prompt(pool, t).await?;
        let banca = topic.banca.map(|b| format!(" Banca: {b}.")).unwrap_or_default();
        let reference = topic
            .reference
            .map(|r| format!("\n\nMATERIAL DO ALUNO SOBRE O TÓPICO (use como base; se discordar dele, explique):\n{}", text::head(&r, REFERENCE_CHARS)))
            .unwrap_or_default();
        return Ok(format!("Matéria: {}. Tópico em estudo: {}.{banca}{reference}", topic.subject, topic.name));
    }
    if let Some(s) = subject_id {
        let name: Option<String> = sqlx::query_scalar("SELECT name FROM subjects WHERE id = ?").bind(s).fetch_optional(pool).await?;
        let name = name.ok_or_else(|| AppError::Invalid("Matéria não encontrada".into()))?;
        let topics: Vec<String> = subjects::topics(pool, s).await?.into_iter().map(|t| t.name).take(60).collect();
        return Ok(format!("Matéria em estudo: {name}. Tópicos do edital nessa matéria: {}.", topics.join("; ")));
    }
    Ok("O aluno não escolheu matéria: responda sobre o que ele perguntar, no contexto de concursos.".into())
}

/// Responde à última fala do aluno em `history`. Devolve a resposta inteira (os pedaços chegam antes
/// pelo evento `TutorToken`, quando a IA local está no ar).
#[tauri::command]
#[specta::specta]
pub async fn ask_tutor(app: AppHandle, pool: State<'_, SqlitePool>, id: i32, subject_id: Option<i32>, topic_id: Option<i32>, history: Vec<TutorTurn>) -> AppResult<String> {
    if history.last().is_none_or(|t| t.role != "aluno" || t.text.trim().is_empty()) {
        return Err(AppError::Invalid("Escreva a sua dúvida".into()));
    }
    let cfg: AppConfig = settings::load(&pool).await?;
    let system = system_prompt(&context(&pool, subject_id, topic_id).await?);
    let recent = &history[history.len().saturating_sub(HISTORY_TURNS)..];

    // IA local quando a rota de tarefas é Automático/Ollama e há placa + Ollama no ar
    let wants_local = matches!(cfg.material_route, ai::Route::Auto | ai::Route::Ollama);
    if wants_local && gpu::info().await.local_ai && ollama::is_up(&cfg.ollama_url).await {
        let mut messages = vec![ollama::Msg { role: "system", content: &system }];
        messages.extend(recent.iter().map(|t| ollama::Msg { role: if t.role == "aluno" { "user" } else { "assistant" }, content: &t.text }));
        let answer = ollama::chat_stream(&cfg.ollama_url, &cfg.task_model, &messages, |piece| {
            let _ = TutorToken { id, text: piece.to_string() }.emit(&app);
        })
        .await?;
        return Ok(answer.trim().to_string());
    }
    // Sem IA local (ou outra IA escolhida em Config): uma resposta inteira pela rota de tarefas.
    let conversation = recent
        .iter()
        .map(|t| format!("{}: {}", if t.role == "aluno" { "ALUNO" } else { "GRIFO" }, t.text))
        .collect::<Vec<_>>()
        .join("\n\n");
    let (answer, _) = ai::complete(&app, &cfg, Task::Text, &system, &format!("{conversation}\n\nGRIFO:"), false).await?;
    let answer = answer.trim().to_string();
    let _ = TutorToken { id, text: answer.clone() }.emit(&app);
    Ok(answer)
}
