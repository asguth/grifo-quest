use serde::Serialize;
use sqlx::SqlitePool;
use tauri::State;

use crate::db;
use crate::domain::{quick_log, xp};
use crate::error::{AppError, AppResult};

#[derive(Debug, Serialize, specta::Type)]
pub struct QuickLogResult {
    pub subject: String,
    pub total: i32,
    pub correct: i32,
    pub banca: Option<String>,
    pub xp_gained: i32,
}

#[tauri::command]
#[specta::specta]
pub async fn quick_log(pool: State<'_, SqlitePool>, text: String) -> AppResult<QuickLogResult> {
    let subjects = db::subjects::list(&pool).await?;
    if subjects.is_empty() {
        return Err(AppError::Invalid("Cadastre uma matéria primeiro".into()));
    }
    let names: Vec<String> = subjects.iter().map(|s| s.name.clone()).collect();
    let parsed = quick_log::parse(&text, &names).map_err(AppError::Invalid)?;
    let subject = &subjects[parsed.subject_index];
    let gained = xp::for_questions(parsed.total, parsed.correct);

    db::logs::insert_with_xp(&pool, subject.id, parsed.banca.as_deref(), parsed.total, parsed.correct, gained)
        .await?;
    Ok(QuickLogResult {
        subject: subject.name.clone(),
        total: parsed.total,
        correct: parsed.correct,
        banca: parsed.banca,
        xp_gained: gained,
    })
}
