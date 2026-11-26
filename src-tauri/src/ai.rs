//! Roteador de IA: decide se uma tarefa de texto roda no Ollama (local, grátis), no Claude CLI, no
//! ChatGPT pela assinatura (Codex CLI) ou numa IA com chave de API.
//! Tarefas que precisam de web ou da skill completa do Grifo chamam o Claude direto, fora daqui.

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::cloud::{self, Cloud};
use crate::error::AppResult;
use crate::settings::AppConfig;
use crate::{claude, codex, ollama};

/// Escolha do usuário em Configurações → IA. `Auto` = Ollama, e Claude se o Ollama estiver fora do ar.
/// Gemini/GPT/Grok usam a chave de API da pessoa.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "snake_case")]
pub enum Route {
    Auto,
    Ollama,
    Claude,
    /// ChatGPT pela assinatura (login com a conta, sem chave).
    Chatgpt,
    Gemini,
    Openai,
    Grok,
    Deepseek,
    Glm,
    Custom,
}

wire_enum! {
    pub enum Provider {
        Ollama = "ollama",
        Claude = "claude",
        Chatgpt = "chatgpt",
        Gemini = "gemini",
        Openai = "openai",
        Grok = "grok",
        Deepseek = "deepseek",
        Glm = "glm",
        Custom = "custom",
    }
}

impl Provider {
    /// Nome para a interface ("Escrevendo com …").
    pub fn label(self) -> &'static str {
        match self {
            Provider::Ollama => "Ollama",
            Provider::Claude => "Claude",
            Provider::Chatgpt => "ChatGPT",
            Provider::Gemini => Cloud::Gemini.label(),
            Provider::Openai => Cloud::Openai.label(),
            Provider::Grok => Cloud::Grok.label(),
            Provider::Deepseek => Cloud::Deepseek.label(),
            Provider::Glm => Cloud::Glm.label(),
            Provider::Custom => Cloud::Custom.label(),
        }
    }

    pub fn cloud(self) -> Option<Cloud> {
        match self {
            Provider::Gemini => Some(Cloud::Gemini),
            Provider::Openai => Some(Cloud::Openai),
            Provider::Grok => Some(Cloud::Grok),
            Provider::Deepseek => Some(Cloud::Deepseek),
            Provider::Glm => Some(Cloud::Glm),
            Provider::Custom => Some(Cloud::Custom),
            Provider::Ollama | Provider::Claude | Provider::Chatgpt => None,
        }
    }
}

/// Para que serve a resposta: define a rota e o modelo lidos da config.
#[derive(Debug, Clone, Copy)]
pub enum Task {
    /// Materiais, questões, resumos, planos: `material_route` + `task_model`.
    Text,
    /// Avaliador oculto da sala: `evaluator` + `evaluator_model`.
    Evaluator,
    /// Alunos da sala: mesma IA do avaliador (a sala inteira numa IA só), `student_model` no Ollama.
    Student,
}

impl Task {
    fn route_and_model(self, cfg: &AppConfig) -> (Route, &str) {
        match self {
            Task::Text => (cfg.material_route, &cfg.task_model),
            Task::Evaluator => (cfg.evaluator, &cfg.evaluator_model),
            Task::Student => (cfg.evaluator, &cfg.student_model),
        }
    }
}

fn pick(route: Route, ollama_up: bool) -> Provider {
    match route {
        Route::Ollama => Provider::Ollama,
        Route::Claude => Provider::Claude,
        Route::Chatgpt => Provider::Chatgpt,
        Route::Gemini => Provider::Gemini,
        Route::Openai => Provider::Openai,
        Route::Grok => Provider::Grok,
        Route::Deepseek => Provider::Deepseek,
        Route::Glm => Provider::Glm,
        Route::Custom => Provider::Custom,
        Route::Auto if ollama_up => Provider::Ollama,
        Route::Auto => Provider::Claude,
    }
}

/// Quem vai rodar a tarefa agora (no `Auto`, pergunta ao Ollama se está no ar). Sem placa de vídeo
/// dedicada o `Auto` nem tenta o Ollama: rodaria na CPU, lento demais.
pub async fn provider_for(cfg: &AppConfig, task: Task) -> Provider {
    let (route, _) = task.route_and_model(cfg);
    let up = route == Route::Auto && crate::gpu::info().await.local_ai && ollama::is_up(&cfg.ollama_url).await;
    pick(route, up)
}

/// Uma resposta de texto. `json = true` pede só JSON (o Ollama garante pelo `format`; aos outros vai no prompt).
pub async fn complete(app: &AppHandle, cfg: &AppConfig, task: Task, system: &str, user: &str, json: bool) -> AppResult<(String, Provider)> {
    let messages = [ollama::Msg { role: "system", content: system }, ollama::Msg { role: "user", content: user }];
    run(app, cfg, task, &messages, json, None).await
}

/// Conversa com pedaços ao vivo (`on_token`): só o Ollama transmite; os outros entregam a resposta
/// inteira de uma vez, num pedaço só. Serve para a sala funcionar em qualquer IA.
pub async fn stream(app: &AppHandle, cfg: &AppConfig, task: Task, messages: &[ollama::Msg<'_>], on_token: &mut (dyn FnMut(&str) + Send)) -> AppResult<(String, Provider)> {
    run(app, cfg, task, messages, false, Some(on_token)).await
}

async fn run(
    app: &AppHandle,
    cfg: &AppConfig,
    task: Task,
    messages: &[ollama::Msg<'_>],
    json: bool,
    mut on_token: Option<&mut (dyn FnMut(&str) + Send)>,
) -> AppResult<(String, Provider)> {
    let provider = provider_for(cfg, task).await;
    let only_json = if json { "

Responda somente com o JSON pedido, sem texto antes ou depois." } else { "" };
    let text = match provider {
        Provider::Ollama => {
            let (_, model) = task.route_and_model(cfg);
            match on_token.as_mut() {
                Some(f) => ollama::chat_stream(&cfg.ollama_url, model, messages, |t| f(t)).await?,
                None => ollama::chat(&cfg.ollama_url, model, messages, json).await?,
            }
        }
        Provider::Gemini | Provider::Openai | Provider::Grok | Provider::Deepseek | Provider::Glm | Provider::Custom => {
            let c = provider.cloud().unwrap_or(Cloud::Gemini);
            // JSON pedido também no texto: nem todo modelo respeita só o `response_format`
            let mut owned: Vec<(String, String)> = messages.iter().map(|m| (m.role.to_string(), m.content.to_string())).collect();
            if let Some(last) = owned.last_mut() {
                last.1.push_str(only_json);
            }
            let msgs: Vec<ollama::Msg> = owned.iter().map(|(r, c)| ollama::Msg { role: r, content: c }).collect();
            cloud::chat(c, cfg.cloud_models.base_url(c), cfg.cloud_models.get(c), &msgs, json).await?
        }
        Provider::Claude | Provider::Chatgpt => {
            // Os CLIs recebem um texto só: a conversa vai transcrita.
            let prompt = format!("{}{only_json}", transcript(messages));
            if provider == Provider::Claude {
                claude::run(&cfg.claude_cli, &prompt, &app.path().app_data_dir()?, &[]).await?
            } else {
                codex::run(app, &prompt).await?
            }
        }
    };
    if provider != Provider::Ollama
        && let Some(f) = on_token
    {
        f(&text);
    }
    Ok((text, provider))
}

/// Mensagens de chat num texto único (para os CLIs): sistema primeiro, depois as falas.
fn transcript(messages: &[ollama::Msg<'_>]) -> String {
    match messages {
        [sys, user] if sys.role == "system" && user.role == "user" => format!("{}

{}", sys.content, user.content),
        _ => messages
            .iter()
            .map(|m| match m.role {
                "system" => m.content.to_string(),
                "user" => format!("USUÁRIO: {}", m.content),
                _ => format!("VOCÊ: {}", m.content),
            })
            .collect::<Vec<_>>()
            .join("

"),
    }
}

/// O primeiro objeto JSON de um texto livre (o modelo às vezes fala antes/depois).
pub fn json_object(text: &str) -> Option<&str> {
    between(text, '{', '}')
}

/// Lê o objeto JSON de uma resposta de modelo (tolera texto antes/depois). `what` entra na mensagem de erro.
pub fn parse_object<T: serde::de::DeserializeOwned>(raw: &str, what: &str) -> AppResult<T> {
    serde_json::from_str(json_object(raw).unwrap_or(raw)).map_err(|e| crate::error::AppError::Invalid(format!("{what} em formato inválido: {e}")))
}

/// O primeiro array JSON de um texto livre.
pub fn json_array(text: &str) -> Option<&str> {
    between(text, '[', ']')
}

fn between(text: &str, open: char, close: char) -> Option<&str> {
    let start = text.find(open)?;
    let end = text.rfind(close)?;
    (end > start).then(|| &text[start..=end])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn auto_falls_back_to_claude_only_when_ollama_is_down() {
        assert_eq!(pick(Route::Auto, true), Provider::Ollama);
        assert_eq!(pick(Route::Auto, false), Provider::Claude);
        assert_eq!(pick(Route::Ollama, false), Provider::Ollama);
        assert_eq!(pick(Route::Gemini, true), Provider::Gemini);
    }

    #[test]
    fn old_evaluator_values_still_parse() {
        // Config salva antes do roteador tinha `"evaluator":"ollama"`.
        assert_eq!(serde_json::from_str::<Route>("\"ollama\"").unwrap(), Route::Ollama);
    }

    #[test]
    fn extracts_json_from_chatty_answers() {
        assert_eq!(json_object("Claro! {\"a\":{\"b\":1}} Pronto."), Some("{\"a\":{\"b\":1}}"));
        assert_eq!(json_array("Aqui: [{\"a\":1}] fim"), Some("[{\"a\":1}]"));
        assert_eq!(json_object("}{"), None);
        assert_eq!(json_array("nada"), None);
    }
}
