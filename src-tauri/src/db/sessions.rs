use sqlx::SqlitePool;

use crate::domain::timer::TimerKind;
use crate::error::AppResult;

wire_enum! {
    pub enum SessionSource {
        Pomodoro = "pomodoro",
        Manual = "manual",
    }
}

pub struct NewSession {
    pub kind: TimerKind,
    pub subject_id: Option<i32>,
    /// Segundos Unix.
    pub started: i64,
    pub ended: i64,
    pub source: SessionSource,
    pub xp: i32,
}

/// Grava a sessão de tempo e o XP correspondente numa transação.
pub async fn insert(pool: &SqlitePool, s: NewSession) -> AppResult<()> {
    let mut tx = pool.begin().await?;
    sqlx::query(
        "INSERT INTO time_sessions (kind, subject_id, started_at, ended_at, source)
         VALUES (?, ?, datetime(?, 'unixepoch'), datetime(?, 'unixepoch'), ?)",
    )
    .bind(s.kind.as_str())
    .bind(s.subject_id)
    .bind(s.started)
    .bind(s.ended)
    .bind(s.source.as_str())
    .execute(&mut *tx)
    .await?;
    if s.xp > 0 {
        super::player::add_xp(&mut tx, s.xp).await?;
    }
    tx.commit().await?;
    Ok(())
}
