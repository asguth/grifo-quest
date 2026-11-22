use serde::Serialize;
use sqlx::{SqliteConnection, SqlitePool};

use crate::domain::level;
use crate::error::AppResult;

/// Soma XP ao jogador. Recebe a conexão para rodar dentro da transação de quem chama.
pub async fn add_xp(conn: &mut SqliteConnection, xp: i32) -> AppResult<()> {
    sqlx::query("UPDATE player SET xp = xp + ? WHERE id = 1").bind(xp).execute(conn).await?;
    Ok(())
}

pub async fn xp(pool: &SqlitePool) -> AppResult<i32> {
    Ok(sqlx::query_scalar("SELECT xp FROM player WHERE id = 1").fetch_one(pool).await?)
}

/// O que um ganho de XP destravou.
#[derive(Debug, Clone, Copy, Serialize, specta::Type)]
pub struct XpOutcome {
    /// XP das missões concluídas agora.
    pub mission_xp: i32,
    /// Novo nível, se subiu.
    pub level_up: Option<i32>,
}

/// Todo caminho que grava XP passa por aqui: lê o XP antes, roda a gravação, fecha as missões
/// que ela completou e diz se o nível subiu. Depois que a gravação entra, nada mais vira erro:
/// o usuário tentaria de novo e a gravação duplicaria. As missões se acertam no próximo acesso.
pub async fn award<T>(pool: &SqlitePool, write: impl AsyncFnOnce() -> AppResult<T>) -> AppResult<(T, XpOutcome)> {
    let before = level::progress(xp(pool).await?).level;
    let out = write().await?;
    let mission_xp = super::diary::refresh_missions(pool).await.unwrap_or_else(|e| {
        eprintln!("missões: {e}");
        0
    });
    let level_up = match xp(pool).await {
        Ok(x) => Some(level::progress(x).level).filter(|&after| after > before),
        Err(e) => {
            eprintln!("nível: {e}");
            None
        }
    };
    Ok((out, XpOutcome { mission_xp, level_up }))
}
