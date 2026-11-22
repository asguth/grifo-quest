use serde::Serialize;
use sqlx::SqlitePool;

use crate::ai::Provider;
use crate::error::{AppError, AppResult};
use crate::grifo;

#[derive(Debug, Clone, Serialize, sqlx::FromRow, specta::Type)]
pub struct Material {
    pub id: i32,
    pub topic_id: i32,
    /// resumo | questoes | flashcards | mnemonico | pegadinhas
    pub kind: String,
    /// ollama | claude
    pub provider: String,
    pub full: bool,
    pub path: Option<String>,
    pub created_at: String,
}

pub async fn list(pool: &SqlitePool, topic_id: i32) -> AppResult<Vec<Material>> {
    Ok(sqlx::query_as(
        "SELECT id, topic_id, kind, provider, full, path, created_at FROM materials WHERE topic_id = ? ORDER BY id DESC",
    )
        .bind(topic_id)
        .fetch_all(pool)
        .await?)
}

pub async fn get(pool: &SqlitePool, id: i32) -> AppResult<(Material, Option<String>)> {
    let m: Material = sqlx::query_as("SELECT id, topic_id, kind, provider, full, path, created_at FROM materials WHERE id = ?")
        .bind(id)
        .fetch_optional(pool)
        .await?
        .ok_or_else(|| AppError::Invalid("Material não encontrado".into()))?;
    let content: Option<String> =
        sqlx::query_scalar("SELECT content FROM materials WHERE id = ?").bind(id).fetch_one(pool).await?;
    Ok((m, content))
}

pub async fn insert(
    pool: &SqlitePool,
    topic_id: i32,
    kind: grifo::MaterialKind,
    provider: Provider,
    full: bool,
    content: Option<&str>,
    path: Option<&str>,
) -> AppResult<Material> {
    let id = sqlx::query("INSERT INTO materials (topic_id, kind, provider, full, content, path) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(topic_id)
        .bind(kind.as_str())
        .bind(provider.as_str())
        .bind(full)
        .bind(content)
        .bind(path)
        .execute(pool)
        .await?
        .last_insert_rowid() as i32;
    Ok(get(pool, id).await?.0)
}

pub async fn delete(pool: &SqlitePool, id: i32) -> AppResult<()> {
    sqlx::query("DELETE FROM materials WHERE id = ?").bind(id).execute(pool).await?;
    Ok(())
}

/// Tópico, matéria, banca da próxima prova e material de referência: o que os prompts do Grifo pedem.
pub async fn topic_for_prompt(pool: &SqlitePool, topic_id: i32) -> AppResult<grifo::Topic> {
    let (name, subject, reference): (String, String, Option<String>) = sqlx::query_as(
        "SELECT t.name, s.name, NULLIF(t.material, '') FROM topics t JOIN subjects s ON s.id = t.subject_id WHERE t.id = ?",
    )
    .bind(topic_id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::Invalid("Tópico não encontrado".into()))?;
    let banca = super::exams::next_banca(pool).await?;
    Ok(grifo::Topic { name, subject, banca, reference })
}
