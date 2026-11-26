//! Conta do Grifo Quest (login por código no e-mail). A lógica fica em `crate::account`.

use sqlx::SqlitePool;
use tauri::State;

use crate::account::{self, AccountState, AccountStatus, Announcement, CloudAccess, Plan};
use crate::cloud_backup::{self, CloudBackup};
use crate::error::AppResult;

#[tauri::command]
#[specta::specta]
pub async fn account_status(state: State<'_, AccountState>) -> AppResult<AccountStatus> {
    state.status().await
}

#[tauri::command]
#[specta::specta]
pub async fn account_send_code(email: String) -> AppResult<()> {
    AccountState::send_code(&email).await
}

#[tauri::command]
#[specta::specta]
pub async fn account_verify_code(state: State<'_, AccountState>, email: String, code: String) -> AppResult<AccountStatus> {
    state.verify(&email, &code).await
}

#[tauri::command]
#[specta::specta]
pub async fn account_sign_in_password(state: State<'_, AccountState>, email: String, password: String) -> AppResult<AccountStatus> {
    state.sign_in_password(&email, &password).await
}

#[tauri::command]
#[specta::specta]
pub async fn account_access(state: State<'_, AccountState>) -> AppResult<CloudAccess> {
    state.access().await
}

#[tauri::command]
#[specta::specta]
pub async fn account_sign_out(state: State<'_, AccountState>) -> AppResult<()> {
    state.sign_out().await
}

#[tauri::command]
#[specta::specta]
pub async fn account_plan(state: State<'_, AccountState>) -> AppResult<Plan> {
    state.plan().await
}

/// Backups do banco de estudos na nuvem (mais novo primeiro).
#[tauri::command]
#[specta::specta]
pub async fn cloud_backups(state: State<'_, AccountState>) -> AppResult<Vec<CloudBackup>> {
    cloud_backup::list(&state).await
}

#[tauri::command]
#[specta::specta]
pub async fn cloud_backup_now(state: State<'_, AccountState>, pool: State<'_, SqlitePool>) -> AppResult<CloudBackup> {
    cloud_backup::upload(&pool, &state).await
}

/// Baixa e restaura um backup da nuvem (guarda o atual antes; o app reinicia).
#[tauri::command]
#[specta::specta]
pub async fn cloud_restore(app: tauri::AppHandle, state: State<'_, AccountState>, pool: State<'_, SqlitePool>, name: String) -> AppResult<()> {
    cloud_backup::restore(&app, &pool, &state, &name).await
}

/// Avisos do dev para todo mundo (com ou sem conta).
#[tauri::command]
#[specta::specta]
pub async fn announcements() -> AppResult<Vec<Announcement>> {
    account::announcements().await
}

#[tauri::command]
#[specta::specta]
pub async fn cloud_delete_backup(state: State<'_, AccountState>, name: String) -> AppResult<()> {
    cloud_backup::delete(&state, &name).await
}
