//! Conta do Grifo Quest (login por código no e-mail). A lógica fica em `crate::account`.

use tauri::State;

use crate::account::{AccountState, AccountStatus, CloudAccess, Plan};
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
