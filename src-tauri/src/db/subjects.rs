use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

use crate::error::AppResult;

#[derive(Debug, Serialize, specta::Type, sqlx::FromRow)]
pub struct Subject {
    pub id: i32,
    pub name: String,
    pub color: String,
    pub exam_weight: f64,
    pub topic_count: i32,
    /// Edital verticalizado concluído, 0–1: cada tópico vale teoria + questões + 3 revisões.
    pub progress: f64,
}

#[derive(Debug, Deserialize, specta::Type)]
pub struct SubjectInput {
    pub name: String,
    pub color: String,
    pub exam_weight: f64,
}

#[derive(Debug, Serialize, specta::Type, sqlx::FromRow)]
pub struct Topic {
    pub id: i32,
    pub subject_id: i32,
    pub name: String,
    /// Edital verticalizado: teoria vista, questões feitas, revisões (0–3).
    pub theory: bool,
    pub practice: bool,
    pub reviews: i32,
}

pub async fn list(pool: &SqlitePool) -> AppResult<Vec<Subject>> {
    Ok(sqlx::query_as(
        "SELECT s.id, s.name, s.color, s.exam_weight,
                COUNT(t.id) AS topic_count,
                COALESCE(AVG((t.theory + t.practice + t.reviews) / 5.0), 0.0) AS progress
         FROM subjects s LEFT JOIN topics t ON t.subject_id = s.id
         GROUP BY s.id ORDER BY s.name COLLATE NOCASE",
    )
        .fetch_all(pool)
        .await?)
}

pub async fn create(pool: &SqlitePool, s: &SubjectInput) -> AppResult<i32> {
    let res = sqlx::query("INSERT INTO subjects (name, color, exam_weight) VALUES (?, ?, ?)")
        .bind(&s.name)
        .bind(&s.color)
        .bind(s.exam_weight)
        .execute(pool)
        .await?;
    // ponytail: ids expostos como i32 (specta proíbe i64 no TS); folga de 2 bilhões em uso pessoal
    Ok(res.last_insert_rowid() as i32)
}

pub async fn update(pool: &SqlitePool, id: i32, s: &SubjectInput) -> AppResult<()> {
    sqlx::query("UPDATE subjects SET name = ?, color = ?, exam_weight = ? WHERE id = ?")
        .bind(&s.name)
        .bind(&s.color)
        .bind(s.exam_weight)
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn delete(pool: &SqlitePool, id: i32) -> AppResult<()> {
    sqlx::query("DELETE FROM subjects WHERE id = ?").bind(id).execute(pool).await?;
    Ok(())
}

pub async fn topics(pool: &SqlitePool, subject_id: i32) -> AppResult<Vec<Topic>> {
    Ok(sqlx::query_as("SELECT id, subject_id, name, theory, practice, reviews FROM topics WHERE subject_id = ? ORDER BY id")
        .bind(subject_id)
        .fetch_all(pool)
        .await?)
}

pub async fn add_topics(pool: &SqlitePool, subject_id: i32, names: &[&str]) -> AppResult<()> {
    let mut tx = pool.begin().await?;
    for name in names {
        sqlx::query("INSERT INTO topics (subject_id, name) VALUES (?, ?)")
            .bind(subject_id)
            .bind(name)
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await?;
    Ok(())
}

pub async fn set_topic_checks(pool: &SqlitePool, id: i32, theory: bool, practice: bool, reviews: i32) -> AppResult<()> {
    sqlx::query("UPDATE topics SET theory = ?, practice = ?, reviews = ? WHERE id = ?")
        .bind(theory)
        .bind(practice)
        .bind(reviews.clamp(0, 3))
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn topic_names(pool: &SqlitePool, subject_id: i32) -> AppResult<Vec<String>> {
    Ok(sqlx::query_scalar("SELECT name FROM topics WHERE subject_id = ?").bind(subject_id).fetch_all(pool).await?)
}

pub async fn delete_topic(pool: &SqlitePool, id: i32) -> AppResult<()> {
    sqlx::query("DELETE FROM topics WHERE id = ?").bind(id).execute(pool).await?;
    Ok(())
}
