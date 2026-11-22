//! Cliente mínimo da API do Ollama (local).

use std::time::Duration;

use futures_util::StreamExt;
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::error::{AppError, AppResult};
use crate::sys;

/// Contexto maior que o padrão do Ollama: o material de referência das tarefas é longo.
const CTX_TASK: u32 = 12288;
/// A conversa da sala é curta; contexto menor deixa a resposta dos alunos mais rápida.
const CTX_CHAT: u32 = 8192;
/// Resposta de um modelo de 14B na CPU pode levar minutos; pull de modelo grande, bem mais.
const LONG: Duration = Duration::from_secs(3600);

#[derive(Serialize)]
pub struct Msg<'a> {
    pub role: &'a str,
    pub content: &'a str,
}

#[derive(Deserialize)]
struct ChatChunk {
    message: Option<ChunkMsg>,
    #[serde(default)]
    done: bool,
}

#[derive(Deserialize)]
struct ChunkMsg {
    content: String,
}

fn unreachable(url: &str, e: reqwest::Error) -> AppError {
    AppError::Invalid(format!("Ollama não respondeu em {url} (está aberto?): {e}"))
}

async fn post(url: &str, path: &str, body: &Value) -> AppResult<reqwest::Response> {
    let res = sys::http().post(format!("{url}{path}")).timeout(LONG).json(body).send().await.map_err(|e| unreachable(url, e))?;
    if !res.status().is_success() {
        return Err(AppError::Invalid(format!("Ollama: {}", res.text().await.unwrap_or_default())));
    }
    Ok(res)
}

/// Lê uma resposta NDJSON linha a linha até `on_line` devolver `true` (fim) ou o stream acabar.
async fn ndjson<T: DeserializeOwned>(res: reqwest::Response, mut on_line: impl FnMut(T) -> AppResult<bool>) -> AppResult<()> {
    let mut buf = Vec::new();
    let mut stream = res.bytes_stream();
    while let Some(bytes) = stream.next().await {
        buf.extend_from_slice(&bytes?);
        while let Some(pos) = buf.iter().position(|b| *b == b'\n') {
            let line: Vec<u8> = buf.drain(..=pos).collect();
            let Ok(item) = serde_json::from_slice::<T>(&line) else { continue };
            if on_line(item)? {
                return Ok(());
            }
        }
    }
    Ok(())
}

fn chat_body(model: &str, messages: &[Msg<'_>], stream: bool, ctx: u32) -> Value {
    json!({ "model": model, "messages": messages, "stream": stream, "think": false, "options": { "num_ctx": ctx } })
}

/// Resposta inteira de uma vez. `json_mode` força saída JSON.
pub async fn chat(url: &str, model: &str, messages: &[Msg<'_>], json_mode: bool) -> AppResult<String> {
    let mut body = chat_body(model, messages, false, CTX_TASK);
    if json_mode {
        body["format"] = json!("json");
    }
    let chunk: ChatChunk = post(url, "/api/chat", &body).await?.json().await?;
    Ok(chunk.message.map(|m| m.content).unwrap_or_default())
}

/// Resposta em streaming: chama `on_token` a cada pedaço e devolve o texto completo.
pub async fn chat_stream(url: &str, model: &str, messages: &[Msg<'_>], mut on_token: impl FnMut(&str)) -> AppResult<String> {
    let res = post(url, "/api/chat", &chat_body(model, messages, true, CTX_CHAT)).await?;
    let mut full = String::new();
    ndjson(res, |chunk: ChatChunk| {
        if let Some(m) = chunk.message {
            on_token(&m.content);
            full.push_str(&m.content);
        }
        Ok(chunk.done)
    })
    .await?;
    Ok(full)
}

#[derive(Deserialize)]
struct Tags {
    models: Vec<TagModel>,
}

#[derive(Deserialize)]
struct TagModel {
    name: String,
}

/// Modelos baixados. `Err` = Ollama fora do ar.
pub async fn list_models(url: &str) -> AppResult<Vec<String>> {
    let res = sys::http().get(format!("{url}/api/tags")).timeout(Duration::from_secs(3)).send().await.map_err(|e| unreachable(url, e))?;
    let tags: Tags = res.json().await?;
    Ok(tags.models.into_iter().map(|m| m.name).collect())
}

pub async fn is_up(url: &str) -> bool {
    list_models(url).await.is_ok()
}

#[derive(Deserialize)]
struct PullChunk {
    #[serde(default)]
    status: String,
    completed: Option<u64>,
    total: Option<u64>,
    error: Option<String>,
}

/// Baixa um modelo (`/api/pull`, NDJSON). `on_progress(status, fração 0–1 ou None)`.
pub async fn pull(url: &str, model: &str, mut on_progress: impl FnMut(&str, Option<f64>)) -> AppResult<()> {
    let res = post(url, "/api/pull", &json!({ "model": model, "stream": true })).await?;
    ndjson(res, |c: PullChunk| {
        if let Some(e) = c.error {
            return Err(AppError::Invalid(format!("Ollama: {e}")));
        }
        let frac = match (c.completed, c.total) {
            (Some(done), Some(total)) if total > 0 => Some(done as f64 / total as f64),
            _ => None,
        };
        on_progress(&c.status, frac);
        Ok(false)
    })
    .await
}
