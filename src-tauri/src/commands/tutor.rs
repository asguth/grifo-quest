//! Tira-dúvidas ("Pergunte ao Grifo"): chat com a IA sobre uma matéria ou um tópico do edital.
//! A pessoa escolhe a IA na própria conversa (`tutor_models`); no Automático vale a rota de tarefas de
//! Config → IA. Pelo Ollama a resposta vem escrevendo (streaming); nas outras chega de uma vez.

use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use tauri::{AppHandle, Manager, State};
use tauri_specta::Event;

use crate::ai::{self, Task};
use crate::db::{materials, subjects};
use crate::domain::text;
use crate::error::{AppError, AppResult};
use crate::settings::{self, AppConfig};
use crate::cloud::{self, Cloud};
use crate::commands::integrations;
use crate::{claude, ollama};

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

/// Uma IA que o Tira-dúvidas pode usar agora (só aparece o que está pronto: modelo baixado no Ollama,
/// Claude Code instalado, nuvem com chave salva).
#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct TutorModel {
    /// `auto`, `ollama:<modelo>`, `claude` ou `cloud:<serviço>`
    pub id: String,
    pub label: String,
    /// Grupo na lista ("No seu PC", "Assinatura", "Nuvem")
    pub group: String,
    /// Detalhe curto ("grátis, escreve ao vivo", "gemini-2.5-flash")
    pub detail: String,
}

#[tauri::command]
#[specta::specta]
pub async fn tutor_models(pool: State<'_, SqlitePool>) -> AppResult<Vec<TutorModel>> {
    let cfg: AppConfig = settings::load(&pool).await?;
    let (local, claude) = tokio::join!(ollama::list_models(&cfg.ollama_url), integrations::claude_version(&cfg.claude_cli));
    let model = |id: String, label: &str, group: &str, detail: &str| TutorModel { id, label: label.into(), group: group.into(), detail: detail.into() };
    let mut out = vec![model(AUTO.into(), "Automático", "", "segue Config → IA")];
    for m in local.unwrap_or_default() {
        out.push(model(format!("{OLLAMA}{m}"), &m, "No seu PC (Ollama)", "grátis, escreve ao vivo"));
    }
    if claude.is_some() {
        out.push(model(CLAUDE.into(), "Claude", "Assinatura", "Claude Code: caprichado, mais lento"));
    }
    for c in Cloud::ALL.iter().copied() {
        let name = cfg.cloud_models.get(c);
        if !name.is_empty() && matches!(cloud::key(c), Ok(Some(_))) {
            out.push(model(format!("{CLOUD}{}", c.as_str()), c.label(), "Nuvem (sua chave)", name));
        }
    }
    Ok(out)
}

const AUTO: &str = "auto";
const OLLAMA: &str = "ollama:";
const CLAUDE: &str = "claude";
const CLOUD: &str = "cloud:";

/// Quem responde: o escolhido na conversa ou, no automático, a rota de tarefas de Config → IA.
enum Choice {
    Ollama(String),
    Claude,
    Cloud(Cloud),
}

async fn choose(cfg: &AppConfig, model: Option<&str>) -> AppResult<Choice> {
    match model.unwrap_or(AUTO) {
        AUTO => {}
        CLAUDE => return Ok(Choice::Claude),
        m if m.starts_with(OLLAMA) => return Ok(Choice::Ollama(m[OLLAMA.len()..].to_string())),
        m if m.starts_with(CLOUD) => {
            let c = Cloud::parse(&m[CLOUD.len()..]).ok_or_else(|| AppError::Invalid(format!("IA desconhecida: {m}")))?;
            return Ok(Choice::Cloud(c));
        }
        m => return Err(AppError::Invalid(format!("IA desconhecida: {m}"))),
    }
    Ok(match ai::provider_for(cfg, Task::Text).await {
        // no Automático o `provider_for` só escolhe o Ollama com placa de vídeo e Ollama no ar
        ai::Provider::Ollama => Choice::Ollama(cfg.task_model.clone()),
        ai::Provider::Claude => Choice::Claude,
        p => p.cloud().map_or(Choice::Claude, Choice::Cloud),
    })
}

/// Resposta inteira e quem a escreveu (o rótulo aparece embaixo da fala do Grifo).
#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct TutorAnswer {
    pub text: String,
    pub by: String,
}

/// Responde à última fala do aluno em `history`. Devolve a resposta inteira (os pedaços chegam antes
/// pelo evento `TutorToken` quando quem responde é o Ollama). `model` vem de `tutor_models`.
#[tauri::command]
#[specta::specta]
pub async fn ask_tutor(
    app: AppHandle,
    pool: State<'_, SqlitePool>,
    id: i32,
    subject_id: Option<i32>,
    topic_id: Option<i32>,
    history: Vec<TutorTurn>,
    model: Option<String>,
) -> AppResult<TutorAnswer> {
    if history.last().is_none_or(|t| t.role != "aluno" || t.text.trim().is_empty()) {
        return Err(AppError::Invalid("Escreva a sua dúvida".into()));
    }
    let cfg: AppConfig = settings::load(&pool).await?;
    let system = system_prompt(&context(&pool, subject_id, topic_id).await?);
    let recent = &history[history.len().saturating_sub(HISTORY_TURNS)..];
    let mut messages = vec![ollama::Msg { role: "system", content: &system }];
    messages.extend(recent.iter().map(|t| ollama::Msg { role: if t.role == "aluno" { "user" } else { "assistant" }, content: &t.text }));

    let (text, by) = match choose(&cfg, model.as_deref()).await? {
        Choice::Ollama(m) => {
            let text = ollama::chat_stream(&cfg.ollama_url, &m, &messages, |piece| {
                let _ = TutorToken { id, text: piece.to_string() }.emit(&app);
            })
            .await?;
            (text, m)
        }
        Choice::Cloud(c) => {
            let name = cfg.cloud_models.get(c);
            let text = cloud::chat(c, cfg.cloud_models.base_url(c), name, &messages, false).await?;
            (text, format!("{} · {name}", c.label()))
        }
        Choice::Claude => {
            // O CLI recebe um texto só: a conversa vai transcrita.
            let conversation = recent
                .iter()
                .map(|t| format!("{}: {}", if t.role == "aluno" { "ALUNO" } else { "GRIFO" }, t.text))
                .collect::<Vec<_>>()
                .join("

");
            let cwd = app.path().app_data_dir()?;
            let text = claude::run(&cfg.claude_cli, &format!("{system}

{conversation}

GRIFO:"), &cwd, &[]).await?;
            (text, "Claude".to_string())
        }
    };
    Ok(TutorAnswer { text: text.trim().to_string(), by })
}
