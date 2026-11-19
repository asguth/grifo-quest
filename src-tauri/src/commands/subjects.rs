use sqlx::SqlitePool;
use tauri::State;

use crate::db::subjects::{self as repo, Subject, SubjectInput, Topic, TopicStatus};
use crate::error::{AppError, AppResult};

fn validate(input: &SubjectInput) -> AppResult<()> {
    if input.name.trim().is_empty() {
        return Err(AppError::Invalid("Nome da matéria vazio".into()));
    }
    if !(0.0..=100.0).contains(&input.exam_weight) {
        return Err(AppError::Invalid("Peso deve ficar entre 0 e 100".into()));
    }
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn list_subjects(pool: State<'_, SqlitePool>) -> AppResult<Vec<Subject>> {
    repo::list(&pool).await
}

#[tauri::command]
#[specta::specta]
pub async fn create_subject(pool: State<'_, SqlitePool>, input: SubjectInput) -> AppResult<i32> {
    validate(&input)?;
    repo::create(&pool, &input).await
}

#[tauri::command]
#[specta::specta]
pub async fn update_subject(pool: State<'_, SqlitePool>, id: i32, input: SubjectInput) -> AppResult<()> {
    validate(&input)?;
    repo::update(&pool, id, &input).await
}

#[tauri::command]
#[specta::specta]
pub async fn delete_subject(pool: State<'_, SqlitePool>, id: i32) -> AppResult<()> {
    repo::delete(&pool, id).await
}

#[tauri::command]
#[specta::specta]
pub async fn list_topics(pool: State<'_, SqlitePool>, subject_id: i32) -> AppResult<Vec<Topic>> {
    repo::topics(&pool, subject_id).await
}

/// Aceita a lista colada do edital: um tópico por linha, linhas vazias ignoradas.
#[tauri::command]
#[specta::specta]
pub async fn add_topics(pool: State<'_, SqlitePool>, subject_id: i32, text: String) -> AppResult<()> {
    let names: Vec<&str> = text.lines().map(str::trim).filter(|l| !l.is_empty()).collect();
    repo::add_topics(&pool, subject_id, &names).await
}

#[tauri::command]
#[specta::specta]
pub async fn set_topic_status(pool: State<'_, SqlitePool>, id: i32, status: TopicStatus) -> AppResult<()> {
    repo::set_topic_status(&pool, id, status).await
}

#[tauri::command]
#[specta::specta]
pub async fn delete_topic(pool: State<'_, SqlitePool>, id: i32) -> AppResult<()> {
    repo::delete_topic(&pool, id).await
}
