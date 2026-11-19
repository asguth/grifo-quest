use sqlx::SqliteConnection;

use crate::error::AppResult;

/// Soma XP ao jogador. Recebe a conexão para rodar dentro da transação de quem chama.
pub async fn add_xp(conn: &mut SqliteConnection, xp: i32) -> AppResult<()> {
    sqlx::query("UPDATE player SET xp = xp + ? WHERE id = 1").bind(xp).execute(conn).await?;
    Ok(())
}
