//! Conta do Grifo Quest (Supabase Auth): entrar com código de 6 dígitos enviado por e-mail.
//! O token de renovação fica no Cofre de Credenciais do Windows (nunca no banco, que o servidor MCP
//! lê); o token de acesso só na memória, renovado antes de vencer. O banco de estudos continua local:
//! a conta serve só a quem assina o Grifo Quest Cloud (comunidade e backup na nuvem).
//! Fora do build com a feature `cloud`, os comandos existem (os bindings são os mesmos) mas recusam.

use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use tokio::sync::Mutex;

use crate::error::{AppError, AppResult};
use crate::sys;

/// Projeto e chave publicável do Supabase, vindos do `src-tauri/cloud.env` (fora do git) ou do ambiente
/// no build da versão Cloud. Nada disso fica no repositório público.
pub const URL: &str = match option_env!("GRIFO_SUPABASE_URL") {
    Some(u) => u,
    None => "",
};
pub const KEY: &str = match option_env!("GRIFO_SUPABASE_KEY") {
    Some(k) => k,
    None => "",
};

/// Build com nuvem (feature `cloud`) e projeto configurado.
pub const ENABLED: bool = cfg!(feature = "cloud") && !KEY.is_empty() && !URL.is_empty();

const TIMEOUT: Duration = Duration::from_secs(20);
const KEYRING_SERVICE: &str = "dev.grifoquest.app";
const KEYRING_USER: &str = "supabase-session";
/// Renova o token de acesso quando falta menos que isso para vencer (s).
const REFRESH_MARGIN: i64 = 120;

/// O que sobrevive a fechar o app (no cofre do Windows).
#[derive(Debug, Clone, Serialize, Deserialize)]
struct Saved {
    refresh_token: String,
    user_id: String,
    email: String,
}

#[derive(Debug, Clone)]
struct Session {
    saved: Saved,
    access_token: String,
    expires_at: i64,
}

/// Sessão em memória; o `Mutex` assíncrono impede duas renovações com o mesmo token.
#[derive(Default)]
pub struct AccountState(Mutex<Option<Session>>);

#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct AccountStatus {
    /// Este build tem a nuvem (versão Cloud). Falso = esconder tudo de conta e comunidade.
    pub available: bool,
    pub signed_in: bool,
    pub email: Option<String>,
    pub user_id: Option<String>,
}

/// O que o front precisa para falar com a API (PostgREST) em nome da pessoa.
#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct CloudAccess {
    pub url: String,
    pub key: String,
    pub token: String,
    pub user_id: String,
    /// Segundos Unix em que o token vence.
    pub expires_at: f64,
}

/// Assinatura de quem está logado (lida do servidor: `my_plan`).
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct Plan {
    /// Comunidade e backup liberados.
    pub active: bool,
    pub plan: Option<String>,
    /// active | trialing | past_due | canceled
    pub status: Option<String>,
    /// ISO 8601, fim do período pago.
    pub current_period_end: Option<String>,
}

fn now() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_secs() as i64)
}

fn needs_refresh(expires_at: i64, now: i64) -> bool {
    expires_at - now < REFRESH_MARGIN
}

fn configured() -> AppResult<()> {
    if !ENABLED {
        return Err(AppError::Invalid("Disponível só no Grifo Quest Cloud.".into()));
    }
    Ok(())
}

/// E-mail aparado e em minúsculas; recusa o que nem parece e-mail.
fn normalize_email(email: &str) -> AppResult<String> {
    let e = email.trim().to_lowercase();
    let ok = match e.split_once('@') {
        Some((user, host)) => !user.is_empty() && host.contains('.') && !host.starts_with('.') && !host.ends_with('.') && !e.contains(char::is_whitespace),
        None => false,
    };
    if ok { Ok(e) } else { Err(AppError::Invalid("Esse e-mail não parece certo.".into())) }
}

/// Só os dígitos do código (a pessoa pode colar "123 456").
fn normalize_code(code: &str) -> AppResult<String> {
    let c: String = code.chars().filter(char::is_ascii_digit).collect();
    if (6..=10).contains(&c.len()) { Ok(c) } else { Err(AppError::Invalid("O código tem 6 dígitos.".into())) }
}

/// Mensagem em português para os erros do Supabase Auth (`error_code`/`code`, `msg`/`error_description`).
fn auth_error(status: u16, body: &str) -> AppError {
    let v: Value = serde_json::from_str(body).unwrap_or(Value::Null);
    let code = v.get("error_code").or_else(|| v.get("error")).and_then(Value::as_str).unwrap_or_default();
    let text = match code {
        "otp_expired" => "Código errado ou vencido. Peça um novo.".to_string(),
        "over_email_send_rate_limit" | "over_request_rate_limit" => "Muitos pedidos seguidos. Espere um pouco e tente de novo.".to_string(),
        "email_address_invalid" => "Esse e-mail não foi aceito.".to_string(),
        "refresh_token_not_found" | "refresh_token_already_used" | "session_expired" | "session_not_found" | "invalid_grant" => {
            "Sua sessão expirou. Entre de novo.".to_string()
        }
        "user_banned" => "Esta conta está suspensa.".to_string(),
        "invalid_credentials" => "E-mail ou senha errados.".to_string(),
        "email_not_confirmed" => "Este e-mail ainda não foi confirmado.".to_string(),
        _ => {
            let msg = ["msg", "error_description", "message"].iter().find_map(|k| v.get(*k).and_then(Value::as_str)).unwrap_or(body);
            format!("Conta ({status}): {}", crate::domain::text::head(msg, 200))
        }
    };
    AppError::Invalid(text)
}

/// Erro que significa "esta sessão não volta mais" (apagar do cofre), e não falta de internet.
fn session_dead(e: &AppError) -> bool {
    matches!(e, AppError::Invalid(m) if m.starts_with("Sua sessão expirou"))
}

async fn auth_post(path: &str, body: Value, bearer: Option<&str>) -> AppResult<Value> {
    configured()?;
    let mut req = sys::http().post(format!("{URL}/auth/v1/{path}")).timeout(TIMEOUT).header("apikey", KEY).json(&body);
    if let Some(t) = bearer {
        req = req.bearer_auth(t);
    }
    let res = req.send().await.map_err(|e| AppError::Invalid(format!("Sem conexão com a comunidade: {e}")))?;
    let status = res.status();
    let text = res.text().await?;
    if !status.is_success() {
        return Err(auth_error(status.as_u16(), &text));
    }
    Ok(if text.trim().is_empty() { Value::Null } else { serde_json::from_str(&text)? })
}

/// Resposta de `verify`/`token` → sessão.
fn session_of(v: &Value) -> AppResult<Session> {
    let s = |k: &str| v.get(k).and_then(Value::as_str).map(str::to_string);
    let bad = || AppError::Invalid("Resposta inesperada do servidor de contas.".into());
    let access_token = s("access_token").ok_or_else(bad)?;
    let refresh_token = s("refresh_token").ok_or_else(bad)?;
    let expires_at = v
        .get("expires_at")
        .and_then(Value::as_i64)
        .or_else(|| v.get("expires_in").and_then(Value::as_i64).map(|n| now() + n))
        .ok_or_else(bad)?;
    let user = v.get("user").ok_or_else(bad)?;
    let user_id = user.get("id").and_then(Value::as_str).ok_or_else(bad)?.to_string();
    let email = user.get("email").and_then(Value::as_str).unwrap_or_default().to_string();
    Ok(Session { saved: Saved { refresh_token, user_id, email }, access_token, expires_at })
}

fn keyring_error(e: keyring::Error) -> AppError {
    AppError::Invalid(format!("Cofre de credenciais do Windows: {e}"))
}

fn entry() -> AppResult<keyring::Entry> {
    keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER).map_err(keyring_error)
}

fn load_saved() -> AppResult<Option<Saved>> {
    match entry()?.get_password() {
        // conteúdo ilegível = como se não houvesse sessão (a pessoa entra de novo)
        Ok(s) => Ok(serde_json::from_str(&s).ok()),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(keyring_error(e)),
    }
}

fn store(saved: &Saved) -> AppResult<()> {
    entry()?.set_password(&serde_json::to_string(saved)?).map_err(keyring_error)
}

fn forget() -> AppResult<()> {
    match entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(keyring_error(e)),
    }
}

async fn refresh(saved: &Saved) -> AppResult<Session> {
    let v = auth_post("token?grant_type=refresh_token", json!({ "refresh_token": saved.refresh_token }), None).await?;
    let s = session_of(&v)?;
    // o Supabase troca o token de renovação a cada uso: o antigo deixa de valer
    store(&s.saved)?;
    Ok(s)
}

impl AccountState {
    pub async fn status(&self) -> AppResult<AccountStatus> {
        if !ENABLED {
            return Ok(AccountStatus { available: false, signed_in: false, email: None, user_id: None });
        }
        let saved = match self.0.lock().await.as_ref() {
            Some(s) => Some(s.saved.clone()),
            None => load_saved()?,
        };
        Ok(AccountStatus {
            available: true,
            signed_in: saved.is_some(),
            email: saved.as_ref().map(|s| s.email.clone()),
            user_id: saved.map(|s| s.user_id),
        })
    }

    /// Envia o código para o e-mail (cria a conta se for a primeira vez).
    pub async fn send_code(email: &str) -> AppResult<()> {
        let email = normalize_email(email)?;
        auth_post("otp", json!({ "email": email, "create_user": true }), None).await?;
        Ok(())
    }

    pub async fn verify(&self, email: &str, code: &str) -> AppResult<AccountStatus> {
        let email = normalize_email(email)?;
        let code = normalize_code(code)?;
        let v = auth_post("verify", json!({ "type": "email", "email": email, "token": code }), None).await?;
        self.start(session_of(&v)?).await
    }

    /// Entrar com e-mail e senha (conta criada no painel do Supabase; não depende de e-mail).
    pub async fn sign_in_password(&self, email: &str, password: &str) -> AppResult<AccountStatus> {
        let email = normalize_email(email)?;
        if password.is_empty() {
            return Err(AppError::Invalid("Digite a senha.".into()));
        }
        let v = auth_post("token?grant_type=password", json!({ "email": email, "password": password }), None).await?;
        self.start(session_of(&v)?).await
    }

    async fn start(&self, s: Session) -> AppResult<AccountStatus> {
        store(&s.saved)?;
        *self.0.lock().await = Some(s);
        self.status().await
    }

    /// Token válido para a API, renovando se preciso.
    pub async fn access(&self) -> AppResult<CloudAccess> {
        configured()?;
        let mut guard = self.0.lock().await;
        let current = match guard.take() {
            Some(s) if !needs_refresh(s.expires_at, now()) => s,
            other => {
                let saved = match other {
                    Some(s) => s.saved,
                    None => load_saved()?.ok_or_else(|| AppError::Invalid("Entre na sua conta para usar a comunidade.".into()))?,
                };
                match refresh(&saved).await {
                    Ok(s) => s,
                    Err(e) => {
                        if session_dead(&e) {
                            forget()?;
                        }
                        return Err(e);
                    }
                }
            }
        };
        let access = CloudAccess {
            url: URL.into(),
            key: KEY.into(),
            token: current.access_token.clone(),
            user_id: current.saved.user_id.clone(),
            expires_at: current.expires_at as f64,
        };
        *guard = Some(current);
        Ok(access)
    }

    /// Plano da conta (o servidor decide; o app só mostra).
    pub async fn plan(&self) -> AppResult<Plan> {
        let a = self.access().await?;
        let res = sys::http()
            .post(format!("{URL}/rest/v1/rpc/my_plan"))
            .timeout(TIMEOUT)
            .header("apikey", KEY)
            .bearer_auth(&a.token)
            .json(&json!({}))
            .send()
            .await
            .map_err(|e| AppError::Invalid(format!("Sem conexão com a nuvem: {e}")))?;
        let status = res.status();
        let text = res.text().await?;
        if status.as_u16() == 404 {
            return Err(AppError::Invalid("A nuvem ainda não está pronta: falta aplicar a migração do grifo-cloud no Supabase.".into()));
        }
        if !status.is_success() {
            return Err(auth_error(status.as_u16(), &text));
        }
        Ok(serde_json::from_str(&text)?)
    }

    /// Sai da conta neste PC (e avisa o servidor, se der).
    pub async fn sign_out(&self) -> AppResult<()> {
        if !ENABLED {
            return Ok(());
        }
        let session = self.0.lock().await.take();
        if let Some(s) = session {
            // sem internet a sessão expira sozinha no servidor; aqui ela some de qualquer jeito
            let _ = auth_post("logout?scope=local", Value::Null, Some(&s.access_token)).await;
        }
        forget()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn email_is_trimmed_and_checked() {
        assert_eq!(normalize_email("  Ana@Mail.COM ").ok().as_deref(), Some("ana@mail.com"));
        for bad in ["", "ana", "ana@", "@mail.com", "ana@mail", "ana@.com", "a na@mail.com"] {
            assert!(normalize_email(bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn code_keeps_only_digits() {
        assert_eq!(normalize_code("123 456").ok().as_deref(), Some("123456"));
        assert!(normalize_code("12345").is_err());
    }

    #[test]
    fn refresh_before_expiring() {
        assert!(needs_refresh(1000, 950));
        assert!(!needs_refresh(1000, 500));
    }

    #[test]
    fn auth_errors_in_portuguese() {
        let e = auth_error(403, r#"{"code":403,"error_code":"otp_expired","msg":"Token has expired or is invalid"}"#);
        assert!(e.to_string().contains("Código errado"));
        let e = auth_error(400, r#"{"error":"invalid_grant","error_description":"Invalid Refresh Token"}"#);
        assert!(session_dead(&e));
        assert!(auth_error(400, r#"{"error_code":"invalid_credentials"}"#).to_string().contains("senha"));
        let e = auth_error(500, "boom");
        assert!(e.to_string().contains("boom"));
    }

    #[test]
    fn session_from_response() {
        let v = json!({ "access_token": "a", "refresh_token": "r", "expires_at": 2000, "user": { "id": "u", "email": "e@x.com" } });
        let s = session_of(&v).expect("sessão");
        assert_eq!((s.access_token.as_str(), s.saved.refresh_token.as_str(), s.expires_at), ("a", "r", 2000));
        assert!(session_of(&json!({ "access_token": "a" })).is_err());
    }
}
