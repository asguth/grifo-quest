//! Leitura e gravação das configurações (o formato vive em `crate::settings`).

use sqlx::SqlitePool;
use tauri::State;

use crate::error::AppResult;
use crate::settings::{self, AppConfig, PomodoroConfig, Profile, UiKey};

#[tauri::command]
#[specta::specta]
pub async fn get_config(pool: State<'_, SqlitePool>) -> AppResult<AppConfig> {
    settings::load(&pool).await
}

#[tauri::command]
#[specta::specta]
pub async fn set_config(pool: State<'_, SqlitePool>, config: AppConfig) -> AppResult<()> {
    settings::save(&pool, &config).await
}

#[tauri::command]
#[specta::specta]
pub async fn get_profile(pool: State<'_, SqlitePool>) -> AppResult<Profile> {
    settings::load(&pool).await
}

#[tauri::command]
#[specta::specta]
pub async fn set_profile(pool: State<'_, SqlitePool>, profile: Profile) -> AppResult<()> {
    profile.validate()?;
    settings::save(&pool, &profile).await
}

#[tauri::command]
#[specta::specta]
pub async fn get_pomodoro_config(pool: State<'_, SqlitePool>) -> AppResult<PomodoroConfig> {
    settings::load(&pool).await
}

#[tauri::command]
#[specta::specta]
pub async fn set_pomodoro_config(pool: State<'_, SqlitePool>, config: PomodoroConfig) -> AppResult<()> {
    config.validate()?;
    settings::save(&pool, &config).await
}

#[tauri::command]
#[specta::specta]
pub async fn get_ui_pref(pool: State<'_, SqlitePool>, key: UiKey) -> AppResult<Option<String>> {
    settings::ui_pref(&pool, key).await
}

#[tauri::command]
#[specta::specta]
pub async fn set_ui_pref(pool: State<'_, SqlitePool>, key: UiKey, value: String) -> AppResult<()> {
    settings::set_ui_pref(&pool, key, &value).await
}
