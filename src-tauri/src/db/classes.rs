use serde::Serialize;
use sqlx::SqlitePool;

use crate::domain::classroom::Evaluation;
use crate::domain::review;
use crate::error::{AppError, AppResult};

#[derive(Debug, sqlx::FromRow)]
pub struct ClassRow {
    pub topic_id: i32,
    pub reference_text: String,
    pub transcript: String,
    pub report: Option<String>,
    pub finished: bool,
}

#[derive(Debug, Serialize, specta::Type)]
pub struct ClassReport {
    pub id: i32,
    pub topic_id: i32,
    pub topic: String,
    pub subject: String,
    pub held_at: String,
    pub coverage_score: f64,
    pub evaluation: Evaluation,
    /// Próxima reaula em dias (`None` = ciclo de revisão concluído).
    pub next_review_days: Option<i32>,
}

#[derive(Debug, Serialize, specta::Type, sqlx::FromRow)]
pub struct TopicRef {
    pub id: i32,
    pub name: String,
    pub subject: String,
    pub subject_color: String,
    pub has_material: bool,
    pub material_path: Option<String>,
}

#[derive(Debug, Serialize, specta::Type, sqlx::FromRow)]
pub struct TopicMaterial {
    pub material: Option<String>,
    pub material_path: Option<String>,
}

pub async fn all_topics(pool: &SqlitePool) -> AppResult<Vec<TopicRef>> {
    Ok(sqlx::query_as(
        "SELECT t.id, t.name, s.name AS subject, s.color AS subject_color,
                (t.material IS NOT NULL AND t.material <> '') AS has_material, t.material_path
         FROM topics t JOIN subjects s ON s.id = t.subject_id
         ORDER BY s.name COLLATE NOCASE, t.id",
    )
    .fetch_all(pool)
    .await?)
}

pub async fn material(pool: &SqlitePool, topic_id: i32) -> AppResult<TopicMaterial> {
    Ok(sqlx::query_as("SELECT material, material_path FROM topics WHERE id = ?")
        .bind(topic_id)
        .fetch_optional(pool)
        .await?
        .unwrap_or(TopicMaterial { material: None, material_path: None }))
}

pub async fn set_material(pool: &SqlitePool, topic_id: i32, text: &str, path: Option<&str>) -> AppResult<()> {
    sqlx::query("UPDATE topics SET material = ?, material_path = COALESCE(?, material_path) WHERE id = ?")
        .bind(text)
        .bind(path)
        .bind(topic_id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn create(pool: &SqlitePool, topic_id: i32, reference: &str) -> AppResult<i32> {
    let res = sqlx::query("INSERT INTO classes (topic_id, reference_text) VALUES (?, ?)")
        .bind(topic_id)
        .bind(reference)
        .execute(pool)
        .await?;
    Ok(res.last_insert_rowid() as i32)
}

pub async fn get(pool: &SqlitePool, id: i32) -> AppResult<ClassRow> {
    sqlx::query_as("SELECT topic_id, reference_text, transcript, report, finished FROM classes WHERE id = ?")
        .bind(id)
        .fetch_optional(pool)
        .await?
        .ok_or_else(|| AppError::Invalid("Aula não encontrada".into()))
}

#[derive(Debug, Serialize, specta::Type, sqlx::FromRow)]
pub struct OpenClass {
    pub id: i32,
    pub topic_id: i32,
    pub topic: String,
    pub subject: String,
    pub held_at: String,
    /// JSON das falas (o comando conta).
    #[serde(skip)]
    pub transcript: String,
}

/// Aulas começadas e não encerradas (o app fechou no meio).
pub async fn open(pool: &SqlitePool) -> AppResult<Vec<OpenClass>> {
    Ok(sqlx::query_as(
        "SELECT c.id, c.topic_id, t.name AS topic, s.name AS subject, c.held_at, c.transcript
         FROM classes c JOIN topics t ON t.id = c.topic_id JOIN subjects s ON s.id = t.subject_id
         WHERE c.finished = 0 AND c.transcript <> '[]' ORDER BY c.id DESC",
    )
    .fetch_all(pool)
    .await?)
}

pub async fn delete_open(pool: &SqlitePool, id: i32) -> AppResult<()> {
    sqlx::query("DELETE FROM classes WHERE id = ? AND finished = 0").bind(id).execute(pool).await?;
    Ok(())
}

pub async fn save_progress(pool: &SqlitePool, id: i32, transcript: &str, report: &str) -> AppResult<()> {
    sqlx::query("UPDATE classes SET transcript = ?, report = ? WHERE id = ?")
        .bind(transcript)
        .bind(report)
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}

/// Fecha a aula, credita XP e reagenda a reaula do tópico. Devolve o próximo intervalo.
pub async fn finish(pool: &SqlitePool, id: i32, topic_id: i32, score: f64, xp: i32) -> AppResult<Option<i32>> {
    let mut tx = pool.begin().await?;
    sqlx::query("UPDATE classes SET coverage_score = ?, finished = 1 WHERE id = ?")
        .bind(score)
        .bind(id)
        .execute(&mut *tx)
        .await?;

    let previous: Option<i32> = sqlx::query_scalar("SELECT interval_days FROM review_queue WHERE topic_id = ?")
        .bind(topic_id)
        .fetch_optional(&mut *tx)
        .await?;
    let next = review::next_interval(previous, score);
    sqlx::query("DELETE FROM review_queue WHERE topic_id = ?").bind(topic_id).execute(&mut *tx).await?;
    if let Some(days) = next {
        sqlx::query(
            "INSERT INTO review_queue (topic_id, due_at, interval_days, last_class_id)
             VALUES (?, date('now', 'localtime', '+' || ? || ' days'), ?, ?)",
        )
        .bind(topic_id)
        .bind(days)
        .bind(days)
        .bind(id)
        .execute(&mut *tx)
        .await?;
    }
    super::player::add_xp(&mut tx, xp).await?;
    tx.commit().await?;
    Ok(next)
}

#[derive(sqlx::FromRow)]
struct ReportRow {
    id: i32,
    topic_id: i32,
    topic: String,
    subject: String,
    held_at: String,
    coverage_score: f64,
    report: Option<String>,
    interval_days: Option<i32>,
}

pub async fn reports(pool: &SqlitePool, topic_id: Option<i32>) -> AppResult<Vec<ClassReport>> {
    let rows: Vec<ReportRow> = sqlx::query_as(
        "SELECT c.id, c.topic_id, t.name AS topic, s.name AS subject, c.held_at,
                COALESCE(c.coverage_score, 0) AS coverage_score, c.report, r.interval_days
         FROM classes c JOIN topics t ON t.id = c.topic_id JOIN subjects s ON s.id = t.subject_id
         LEFT JOIN review_queue r ON r.last_class_id = c.id
         WHERE c.finished = 1 AND (? IS NULL OR c.topic_id = ?)
         ORDER BY c.held_at DESC LIMIT 50",
    )
    .bind(topic_id)
    .bind(topic_id)
    .fetch_all(pool)
    .await?;
    rows.into_iter()
        .map(|r| {
            let evaluation = r.report.as_deref().map(serde_json::from_str).transpose()?.unwrap_or_default();
            Ok(ClassReport {
            id: r.id,
            topic_id: r.topic_id,
            topic: r.topic,
            subject: r.subject,
            held_at: r.held_at,
            coverage_score: r.coverage_score,
                evaluation,
                next_review_days: r.interval_days,
            })
        })
        .collect()
}
