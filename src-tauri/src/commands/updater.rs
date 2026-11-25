//! Atualização automática: procura uma versão nova nas Releases do GitHub uma vez por dia, baixa em
//! segundo plano e mostra o botão "Atualizar" no menu, sem notificação do Windows (ninguém é
//! interrompido). Instalar fecha o app, roda o instalador e abre a versão nova.

use std::sync::Mutex;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_updater::{Update, UpdaterExt};
use tauri_specta::Event;

use crate::error::{AppError, AppResult};

const CHECK_EVERY: Duration = Duration::from_secs(24 * 3600);

/// Atualização já baixada, esperando o usuário reiniciar. `fetching` evita dois downloads ao mesmo
/// tempo (checagem de fundo + botão "Procurar").
#[derive(Default)]
pub struct PendingUpdate(Mutex<Option<(Update, Vec<u8>)>>, tokio::sync::Mutex<()>);

impl PendingUpdate {
    fn lock(&self) -> std::sync::MutexGuard<'_, Option<(Update, Vec<u8>)>> {
        self.0.lock().unwrap_or_else(|p| p.into_inner())
    }

    fn info(&self) -> Option<UpdateInfo> {
        self.lock().as_ref().map(|(u, _)| UpdateInfo::of(u))
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct UpdateInfo {
    pub version: String,
    pub notes: Option<String>,
}

impl UpdateInfo {
    fn of(u: &Update) -> Self {
        Self { version: u.version.clone(), notes: u.body.clone() }
    }
}

/// Uma versão nova foi baixada e está pronta para instalar.
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type, tauri_specta::Event)]
pub struct UpdateReady(pub UpdateInfo);

fn updater_error(e: tauri_plugin_updater::Error) -> AppError {
    AppError::Invalid(format!("Atualização: {e}"))
}

/// Procura e baixa. Devolve a versão pronta para instalar (nova ou já baixada antes).
async fn fetch(app: &AppHandle) -> AppResult<Option<UpdateInfo>> {
    let pending = app.state::<PendingUpdate>();
    let _one_at_a_time = pending.1.lock().await;
    if let Some(info) = pending.info() {
        return Ok(Some(info));
    }
    let Some(update) = app.updater().map_err(updater_error)?.check().await.map_err(updater_error)? else {
        return Ok(None);
    };
    let bytes = update.download(|_, _| {}, || {}).await.map_err(updater_error)?;
    let info = UpdateInfo::of(&update);
    *pending.lock() = Some((update, bytes));
    let _ = UpdateReady(info.clone()).emit(app);
    Ok(Some(info))
}

/// Ao abrir e depois uma vez por dia. Em debug não procura: o binário de desenvolvimento não é o instalado.
pub fn spawn_update_checker(app: AppHandle) {
    if cfg!(debug_assertions) {
        return;
    }
    tauri::async_runtime::spawn(async move {
        loop {
            if let Err(e) = fetch(&app).await {
                eprintln!("{e}");
            }
            tokio::time::sleep(CHECK_EVERY).await;
        }
    });
}

/// Atualização baixada esperando instalação (o front pergunta ao abrir).
#[tauri::command]
#[specta::specta]
pub fn update_status(pending: State<'_, PendingUpdate>) -> Option<UpdateInfo> {
    pending.info()
}

/// "Procurar atualizações" em Config.
#[tauri::command]
#[specta::specta]
pub async fn check_update(app: AppHandle) -> AppResult<Option<UpdateInfo>> {
    fetch(&app).await
}

/// Instala a versão baixada e reinicia o app.
#[tauri::command]
#[specta::specta]
pub async fn install_update(app: AppHandle, pending: State<'_, PendingUpdate>) -> AppResult<()> {
    let (update, bytes) = pending.lock().take().ok_or_else(|| AppError::Invalid("Nenhuma atualização baixada".into()))?;
    // A versão nova abre com a janela à vista (antes ia para a bandeja e parecia ter fechado).
    // Grava antes: no Windows o instalador encerra este processo.
    if let Err(e) = crate::settings::ask_show_on_start(&app.state::<sqlx::SqlitePool>()).await {
        eprintln!("aviso de abrir a janela: {e}");
    }
    if let Err(e) = update.install(&bytes) {
        // Fica guardada para tentar de novo (ex.: o servidor MCP estava em uso).
        *pending.lock() = Some((update, bytes));
        return Err(updater_error(e));
    }
    app.restart()
}
