use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

use crate::error::AppResult;

#[derive(Debug, Serialize, specta::Type, sqlx::FromRow)]
pub struct Exam {
    pub id: i32,
    pub name: String,
    pub exam_date: String,
    pub banca: Option<String>,
    pub role: Option<String>,
    /// Dias até a prova (negativo = já passou).
    pub days_left: i32,
}

#[derive(Debug, Deserialize, specta::Type)]
pub struct ExamInput {
    pub name: String,
    pub exam_date: String,
    pub banca: Option<String>,
    pub role: Option<String>,
}

pub async fn list(pool: &SqlitePool) -> AppResult<Vec<Exam>> {
    Ok(sqlx::query_as(
        "SELECT id, name, exam_date, banca, role,
                CAST(julianday(exam_date) - julianday(date('now', 'localtime')) AS INTEGER) AS days_left
         FROM exams ORDER BY exam_date",
    )
    .fetch_all(pool)
    .await?)
}

pub async fn create(pool: &SqlitePool, e: &ExamInput) -> AppResult<()> {
    sqlx::query("INSERT INTO exams (name, exam_date, banca, role) VALUES (?, ?, ?, ?)")
        .bind(&e.name)
        .bind(&e.exam_date)
        .bind(&e.banca)
        .bind(&e.role)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn delete(pool: &SqlitePool, id: i32) -> AppResult<()> {
    sqlx::query("DELETE FROM exams WHERE id = ?").bind(id).execute(pool).await?;
    Ok(())
}


/// Banca da próxima prova marcada (para o estilo das questões). `None` = indefinida.
pub async fn next_banca(pool: &SqlitePool) -> AppResult<Option<String>> {
    Ok(sqlx::query_scalar(
        "SELECT banca FROM exams WHERE banca IS NOT NULL AND banca <> '' AND exam_date >= date('now','localtime')
         ORDER BY exam_date LIMIT 1",
    )
    .fetch_optional(pool)
    .await?)
}
