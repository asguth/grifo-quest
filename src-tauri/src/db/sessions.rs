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

/// Pomodoros concluídos hoje (dia local) e minutos de foco somados.
pub async fn pomodoros_today(pool: &SqlitePool) -> AppResult<(i32, i32)> {
    let (n, secs): (i64, i64) = sqlx::query_as(
        "SELECT count(*), COALESCE(SUM(strftime('%s', ended_at) - strftime('%s', started_at)), 0)
         FROM time_sessions
         WHERE source = 'pomodoro' AND date(started_at, 'localtime') = date('now', 'localtime')",
    )
    .fetch_one(pool)
    .await?;
    Ok((n as i32, (secs / 60) as i32))
}
