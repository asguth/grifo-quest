//! IAs na nuvem com chave de API própria: Gemini, GPT (OpenAI), Grok (xAI), DeepSeek, GLM (Z.ai) e
//! qualquer outra com API no formato da OpenAI. Todas aceitam a API de
//! chat no formato da OpenAI, então um cliente serve para todas. A chave fica no Cofre de
//! Credenciais do Windows (nunca no banco, que o servidor MCP lê).

use std::time::Duration;

use serde::Deserialize;
use serde_json::{Value, json};

use crate::error::{AppError, AppResult};
use crate::ollama::Msg;
use crate::sys;

wire_enum! {
    pub enum Cloud {
        Gemini = "gemini",
        Openai = "openai",
        Grok = "grok",
        Deepseek = "deepseek",
        Glm = "glm",
        /// Qualquer serviço com API no formato da OpenAI (OpenRouter, Groq, Mistral, LM Studio…):
        /// a pessoa informa o endereço.
        Custom = "custom",
    }
}

/// Resposta longa (material, lote de questões) pode levar alguns minutos.
const TIMEOUT: Duration = Duration::from_secs(300);
const KEYRING_SERVICE: &str = "dev.grifoquest.app";

impl Cloud {
    pub fn label(self) -> &'static str {
        match self {
            Cloud::Gemini => "Gemini",
            Cloud::Openai => "GPT",
            Cloud::Grok => "Grok",
            Cloud::Deepseek => "DeepSeek",
            Cloud::Glm => "GLM (Z.ai)",
            Cloud::Custom => "Outra IA",
        }
    }

    /// Endereço da API no formato da OpenAI. `Custom` usa o que a pessoa informou (vazio = erro claro).
    pub fn default_base_url(self) -> &'static str {
        match self {
            Cloud::Gemini => "https://generativelanguage.googleapis.com/v1beta/openai",
            Cloud::Openai => "https://api.openai.com/v1",
            Cloud::Grok => "https://api.x.ai/v1",
            Cloud::Deepseek => "https://api.deepseek.com/v1",
            Cloud::Glm => "https://api.z.ai/api/paas/v4",
            Cloud::Custom => "",
        }
    }

    /// Onde a pessoa cria a chave (botão em Integrações).
    pub fn key_page(self) -> &'static str {
        match self {
            Cloud::Gemini => "https://aistudio.google.com/apikey",
            Cloud::Openai => "https://platform.openai.com/api-keys",
            Cloud::Grok => "https://console.x.ai",
            Cloud::Deepseek => "https://platform.deepseek.com/api_keys",
            Cloud::Glm => "https://z.ai/manage-apikey/apikey-list",
            Cloud::Custom => "https://openrouter.ai/keys",
        }
    }

    fn entry(self) -> AppResult<keyring::Entry> {
        keyring::Entry::new(KEYRING_SERVICE, &format!("api-key-{}", self.as_str())).map_err(key_error)
    }
}

fn key_error(e: keyring::Error) -> AppError {
    AppError::Invalid(format!("Cofre de credenciais do Windows: {e}"))
}

/// Chave salva, ou `None`.
pub fn key(c: Cloud) -> AppResult<Option<String>> {
    match c.entry()?.get_password() {
        Ok(k) => Ok(Some(k)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(key_error(e)),
    }
}

/// Grava (ou apaga, com texto vazio) a chave.
pub fn set_key(c: Cloud, key: &str) -> AppResult<()> {
    let entry = c.entry()?;
    let key = key.trim();
    if key.is_empty() {
        return match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(key_error(e)),
        };
    }
    entry.set_password(key).map_err(key_error)
}

fn need_key(c: Cloud) -> AppResult<String> {
    key(c)?.ok_or_else(|| AppError::Invalid(format!("Falta a chave de API do {} (Configurações → Integrações).", c.label())))
}

async fn error_of(c: Cloud, res: reqwest::Response) -> AppError {
    let status = res.status();
    let body = res.text().await.unwrap_or_default();
    // as três devolvem {"error":{"message":…}} (o Gemini às vezes numa lista)
    let msg = serde_json::from_str::<Value>(&body)
        .ok()
        .and_then(|v| {
            let e = if v.is_array() { v.get(0)?.get("error")?.clone() } else { v.get("error")?.clone() };
            e.get("message")?.as_str().map(str::to_string)
        })
        .unwrap_or(body);
    let hint = match status.as_u16() {
        401 | 403 => " (chave inválida ou sem permissão)",
        429 => " (limite de uso ou sem crédito)",
        _ => "",
    };
    AppError::Invalid(format!("{}: {msg}{hint}", c.label()))
}

#[derive(Deserialize)]
struct ChatResponse {
    choices: Vec<Choice>,
}

#[derive(Deserialize)]
struct Choice {
    message: ChoiceMsg,
}

#[derive(Deserialize)]
struct ChoiceMsg {
    content: Option<String>,
}

pub fn chat_body(model: &str, messages: &[Msg<'_>], json_mode: bool) -> Value {
    let mut body = json!({ "model": model, "messages": messages });
    if json_mode {
        body["response_format"] = json!({ "type": "json_object" });
    }
    body
}

/// Uma resposta de chat.
fn need_base(c: Cloud, base: &str) -> AppResult<String> {
    let b = base.trim().trim_end_matches('/');
    if !b.starts_with("http") {
        return Err(AppError::Invalid(format!("Falta o endereço da API do {} (Configurações → Integrações).", c.label())));
    }
    Ok(b.to_string())
}

pub async fn chat(c: Cloud, base: &str, model: &str, messages: &[Msg<'_>], json_mode: bool) -> AppResult<String> {
    let key = need_key(c)?;
    let base = need_base(c, base)?;
    let res = sys::http()
        .post(format!("{base}/chat/completions"))
        .bearer_auth(key)
        .timeout(TIMEOUT)
        .json(&chat_body(model, messages, json_mode))
        .send()
        .await?;
    if !res.status().is_success() {
        return Err(error_of(c, res).await);
    }
    let r: ChatResponse = res.json().await?;
    r.choices
        .into_iter()
        .next()
        .and_then(|ch| ch.message.content)
        .filter(|t| !t.trim().is_empty())
        .ok_or_else(|| AppError::Invalid(format!("{}: resposta vazia", c.label())))
}

#[derive(Deserialize)]
struct Models {
    data: Vec<ModelId>,
}

#[derive(Deserialize)]
struct ModelId {
    id: String,
}

/// Modelos de texto da conta (também serve de teste da chave). O Gemini devolve `models/x`.
pub async fn list_models(c: Cloud, base: &str) -> AppResult<Vec<String>> {
    let key = need_key(c)?;
    let base = need_base(c, base)?;
    let res = sys::http().get(format!("{base}/models")).bearer_auth(key).timeout(Duration::from_secs(20)).send().await?;
    if !res.status().is_success() {
        return Err(error_of(c, res).await);
    }
    let m: Models = res.json().await?;
    let mut ids: Vec<String> = m.data.into_iter().map(|x| x.id.trim_start_matches("models/").to_string()).filter(|id| is_chat_model(id)).collect();
    ids.sort();
    Ok(ids)
}

/// Tira da lista o que não conversa (imagem, áudio, embeddings, moderação).
fn is_chat_model(id: &str) -> bool {
    let id = id.to_lowercase();
    !["embed", "tts", "whisper", "dall-e", "image", "audio", "moderation", "realtime", "transcribe", "imagen", "veo", "aqa"]
        .iter()
        .any(|k| id.contains(k))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn json_mode_asks_for_json_object() {
        let msgs = [Msg { role: "user", content: "oi" }];
        assert_eq!(chat_body("m", &msgs, true)["response_format"]["type"], "json_object");
        assert!(chat_body("m", &msgs, false).get("response_format").is_none());
    }

    #[test]
    fn model_list_keeps_only_chat_models() {
        assert!(is_chat_model("gemini-2.5-flash"));
        assert!(is_chat_model("grok-4"));
        assert!(!is_chat_model("text-embedding-3-small"));
        assert!(!is_chat_model("gpt-image-1"));
    }

    #[test]
    fn stored_names_do_not_change() {
        assert_eq!(Cloud::parse("openai"), Some(Cloud::Openai));
        assert_eq!(Cloud::ALL.len(), 6);
        assert!(Cloud::ALL.iter().filter(|c| **c != Cloud::Custom).all(|c| c.default_base_url().starts_with("https://")));
    }
}
