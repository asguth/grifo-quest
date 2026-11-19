use sqlx::SqlitePool;

use crate::error::AppResult;

/// Grava o bloco de questões e soma o XP ao jogador numa transação só.
pub async fn insert_with_xp(
    pool: &SqlitePool,
    subject_id: i32,
    banca: Option<&str>,
    total: i32,
    correct: i32,
    xp: i32,
) -> AppResult<()> {
    let mut tx = pool.begin().await?;
    sqlx::query("INSERT INTO question_logs (subject_id, banca, total, correct) VALUES (?, ?, ?, ?)")
        .bind(subject_id)
        .bind(banca)
        .bind(total)
        .bind(correct)
        .execute(&mut *tx)
        .await?;
    sqlx::query("UPDATE player SET xp = xp + ? WHERE id = 1")
        .bind(xp)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(())
}
