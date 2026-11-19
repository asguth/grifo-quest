use sqlx::SqlitePool;

use crate::error::AppResult;

pub struct NewSession<'a> {
    pub kind: &'a str,
    pub subject_id: Option<i32>,
    /// Segundos Unix.
    pub started: i64,
    pub ended: i64,
    pub source: &'a str,
    pub xp: i32,
}

/// Grava a sessão de tempo e o XP correspondente numa transação.
pub async fn insert(pool: &SqlitePool, s: NewSession<'_>) -> AppResult<()> {
    let mut tx = pool.begin().await?;
    sqlx::query(
        "INSERT INTO time_sessions (kind, subject_id, started_at, ended_at, source)
         VALUES (?, ?, datetime(?, 'unixepoch'), datetime(?, 'unixepoch'), ?)",
    )
    .bind(s.kind)
    .bind(s.subject_id)
    .bind(s.started)
    .bind(s.ended)
    .bind(s.source)
    .execute(&mut *tx)
    .await?;
    if s.xp > 0 {
        super::player::add_xp(&mut tx, s.xp).await?;
    }
    tx.commit().await?;
    Ok(())
}
