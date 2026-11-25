//! Backup do banco de estudos no Grifo Quest Cloud: Storage do Supabase, bucket `backups`, pasta
//! `<user_id>/`. Quem decide se pode é o servidor (RLS só aceita assinante). A cópia sai por
//! `VACUUM INTO`, vai comprimida (gzip) e com a data no nome. O bucket não tem política de update:
//! cada backup é um arquivo novo e os mais velhos que os `KEEP` últimos são apagados.

use std::io::{Read, Write};
use std::time::Duration;

use flate2::Compression;
use flate2::read::GzDecoder;
use flate2::write::GzEncoder;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sqlx::SqlitePool;
use tauri::{AppHandle, Manager};

use crate::account::{self, AccountState, CloudAccess};
use crate::commands::config::{backup_dir, now_secs, restore_named, snapshot, stamp};
use crate::error::{AppError, AppResult};
use crate::settings::{self, UiKey};
use crate::sys;

const BUCKET: &str = "backups";
const EXT: &str = ".db.gz";
/// Backups guardados na nuvem (os mais novos).
const KEEP: usize = 5;
/// Envio e download podem demorar em conexão lenta.
const TIMEOUT: Duration = Duration::from_secs(300);
/// Automático: no máximo um por dia.
const AUTO_EVERY_SECS: i64 = 86_400;
/// De quanto em quanto tempo o app confere se já está na hora do automático.
const CHECK_EVERY: Duration = Duration::from_secs(3 * 3600);
/// Espera ao abrir (não disputa a rede e o disco com o resto da inicialização).
const FIRST_CHECK: Duration = Duration::from_secs(120);

#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct CloudBackup {
    pub name: String,
    /// Tamanho comprimido, em KB.
    pub kb: i32,
    /// ISO 8601 (vem do servidor).
    pub created_at: Option<String>,
}

#[derive(Deserialize)]
struct Listed {
    name: String,
    #[serde(default)]
    created_at: Option<String>,
    #[serde(default)]
    metadata: Option<Value>,
}

/// Só nomes que o próprio app cria (nada de caminho vindo de fora).
fn valid_name(name: &str) -> bool {
    name.starts_with("grifo-") && name.ends_with(EXT) && !name.contains(['/', '\\']) && !name.contains("..")
}

fn object_url(a: &CloudAccess, name: &str) -> String {
    format!("{}/storage/v1/object/{BUCKET}/{}/{name}", a.url, a.user_id)
}

/// Erros do Storage em português; RLS recusando = falta assinatura.
fn storage_error(status: u16, body: &str) -> AppError {
    let lower = body.to_lowercase();
    let text = if lower.contains("row-level security") || lower.contains("unauthorized") || status == 403 {
        "O backup na nuvem é para quem tem plano ativo.".to_string()
    } else if status == 413 || lower.contains("too large") || lower.contains("maximum allowed size") {
        "O backup ficou grande demais para a nuvem. Use o backup no PC (Config → Sistema).".to_string()
    } else if status == 404 || lower.contains("not found") {
        "Backup não encontrado na nuvem.".to_string()
    } else {
        format!("Nuvem ({status}): {}", crate::domain::text::head(body, 200))
    };
    AppError::Invalid(text)
}

fn offline(e: reqwest::Error) -> AppError {
    AppError::Invalid(format!("Sem conexão com a nuvem: {e}"))
}

async fn check(res: reqwest::Response) -> AppResult<String> {
    let status = res.status();
    let text = res.text().await?;
    if status.is_success() { Ok(text) } else { Err(storage_error(status.as_u16(), &text)) }
}

/// Backups da conta, do mais novo para o mais antigo.
pub async fn list(account: &AccountState) -> AppResult<Vec<CloudBackup>> {
    let a = account.access().await?;
    let res = sys::http()
        .post(format!("{}/storage/v1/object/list/{BUCKET}", a.url))
        .timeout(Duration::from_secs(20))
        .header("apikey", &a.key)
        .bearer_auth(&a.token)
        .json(&json!({ "prefix": a.user_id, "limit": 100, "sortBy": { "column": "name", "order": "desc" } }))
        .send()
        .await
        .map_err(offline)?;
    let listed: Vec<Listed> = serde_json::from_str(&check(res).await?)?;
    let mut out: Vec<CloudBackup> = listed
        .into_iter()
        .filter(|l| valid_name(&l.name))
        .map(|l| {
            let bytes = l.metadata.as_ref().and_then(|m| m.get("size")).and_then(Value::as_u64).unwrap_or(0);
            CloudBackup { name: l.name, kb: (bytes / 1024).min(i32::MAX as u64) as i32, created_at: l.created_at }
        })
        .collect();
    out.sort_by(|a, b| b.name.cmp(&a.name));
    Ok(out)
}

/// Faz o backup agora e apaga os excedentes. Devolve o que foi enviado.
pub async fn upload(pool: &SqlitePool, account: &AccountState) -> AppResult<CloudBackup> {
    let a = account.access().await?;
    let tmp = std::env::temp_dir().join(format!("grifo-cloud-{}.db", std::process::id()));
    // `VACUUM INTO` recusa arquivo que já existe
    let _ = std::fs::remove_file(&tmp);
    snapshot(pool, &tmp).await?;
    let path = tmp.clone();
    let gz = tauri::async_runtime::spawn_blocking(move || -> std::io::Result<Vec<u8>> {
        let raw = std::fs::read(&path)?;
        let mut enc = GzEncoder::new(Vec::with_capacity(raw.len() / 3), Compression::default());
        enc.write_all(&raw)?;
        enc.finish()
    })
    .await
    .map_err(|e| AppError::Invalid(format!("Falha ao comprimir o backup: {e}")));
    let _ = std::fs::remove_file(&tmp);
    let gz = gz??;

    let name = format!("{}{EXT}", stamp(now_secs()));
    let kb = (gz.len() / 1024).min(i32::MAX as usize) as i32;
    let res = sys::http()
        .post(object_url(&a, &name))
        .timeout(TIMEOUT)
        .header("apikey", &a.key)
        .bearer_auth(&a.token)
        .header("content-type", "application/gzip")
        .header("x-upsert", "false")
        .body(gz)
        .send()
        .await
        .map_err(offline)?;
    check(res).await?;

    if let Err(e) = prune(account).await {
        eprintln!("apagar backups antigos da nuvem: {e}");
    }
    Ok(CloudBackup { name, kb, created_at: None })
}

/// Deixa só os `KEEP` mais novos.
async fn prune(account: &AccountState) -> AppResult<()> {
    let old: Vec<String> = list(account).await?.into_iter().skip(KEEP).map(|b| b.name).collect();
    if old.is_empty() {
        return Ok(());
    }
    let a = account.access().await?;
    let prefixes: Vec<String> = old.iter().map(|n| format!("{}/{n}", a.user_id)).collect();
    let res = sys::http()
        .delete(format!("{}/storage/v1/object/{BUCKET}", a.url))
        .timeout(Duration::from_secs(20))
        .header("apikey", &a.key)
        .bearer_auth(&a.token)
        .json(&json!({ "prefixes": prefixes }))
        .send()
        .await
        .map_err(offline)?;
    check(res).await.map(|_| ())
}

/// Baixa o backup, guarda na pasta de backups do PC (`…-nuvem.db`) e restaura (o app reinicia).
pub async fn restore(app: &AppHandle, pool: &SqlitePool, account: &AccountState, name: &str) -> AppResult<()> {
    if !valid_name(name) {
        return Err(AppError::Invalid("Backup inválido".into()));
    }
    let a = account.access().await?;
    let res = sys::http()
        .get(format!("{}/storage/v1/object/authenticated/{BUCKET}/{}/{name}", a.url, a.user_id))
        .timeout(TIMEOUT)
        .header("apikey", &a.key)
        .bearer_auth(&a.token)
        .send()
        .await
        .map_err(offline)?;
    let status = res.status();
    if !status.is_success() {
        let text = res.text().await?;
        return Err(storage_error(status.as_u16(), &text));
    }
    let gz = res.bytes().await?;
    let raw = tauri::async_runtime::spawn_blocking(move || -> std::io::Result<Vec<u8>> {
        let mut out = Vec::new();
        GzDecoder::new(&gz[..]).read_to_end(&mut out)?;
        Ok(out)
    })
    .await
    .map_err(|e| AppError::Invalid(format!("Falha ao abrir o backup: {e}")))?
    .map_err(|e| AppError::Invalid(format!("Backup da nuvem corrompido: {e}")))?;

    let dir = backup_dir(app)?;
    std::fs::create_dir_all(&dir)?;
    let local = format!("{}-nuvem.db", name.trim_end_matches(EXT));
    std::fs::write(dir.join(&local), raw)?;
    restore_named(app, pool, local).await
}

/// Hora do automático? (o mais novo é de mais de um dia atrás; nomes em ordem de tempo)
fn due(newest: Option<&str>, now: i64) -> bool {
    match newest {
        None => true,
        Some(n) => n < stamp(now - AUTO_EVERY_SECS).as_str(),
    }
}

async fn auto(app: &AppHandle) -> AppResult<()> {
    let pool = app.state::<SqlitePool>();
    if settings::ui_pref(&pool, UiKey::CloudBackup).await?.as_deref() == Some("off") {
        return Ok(());
    }
    let account = app.state::<AccountState>();
    if !account.status().await?.signed_in || !account.plan().await?.active {
        return Ok(());
    }
    let existing = list(&account).await?;
    if due(existing.first().map(|b| b.name.as_str()), now_secs()) {
        upload(&pool, &account).await?;
    }
    Ok(())
}

/// Backup automático diário para quem tem conta com plano ativo (Config → Conta desliga).
pub fn spawn_auto(app: AppHandle) {
    if !account::ENABLED {
        return;
    }
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(FIRST_CHECK).await;
        loop {
            if let Err(e) = auto(&app).await {
                eprintln!("backup automático na nuvem: {e}");
            }
            tokio::time::sleep(CHECK_EVERY).await;
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_from_the_app_only() {
        assert!(valid_name("grifo-2026-11-25-120000.db.gz"));
        for bad in ["grifo-x.db", "../grifo-1.db.gz", "u/grifo-1.db.gz", "outro.db.gz"] {
            assert!(!valid_name(bad), "{bad}");
        }
    }

    #[test]
    fn auto_once_a_day() {
        let now = 1_800_000_000;
        assert!(due(None, now));
        let recent = format!("{}{EXT}", stamp(now - 3600));
        assert!(!due(Some(&recent), now));
        let old = format!("{}{EXT}", stamp(now - AUTO_EVERY_SECS - 60));
        assert!(due(Some(&old), now));
    }

    #[test]
    fn rls_means_no_plan() {
        let e = storage_error(400, r#"{"statusCode":"403","error":"Unauthorized","message":"new row violates row-level security policy"}"#);
        assert!(e.to_string().contains("plano ativo"));
    }
}
