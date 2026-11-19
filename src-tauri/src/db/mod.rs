pub mod logs;
pub mod player;
pub mod sessions;
pub mod settings;
pub mod subjects;

use std::path::Path;

use sqlx::SqlitePool;
use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode};

use crate::error::AppResult;

pub async fn open(path: &Path) -> AppResult<SqlitePool> {
    let options = SqliteConnectOptions::new()
        .filename(path)
        .create_if_missing(true)
        .foreign_keys(true)
        // WAL deixa o servidor MCP (fase 4) ler enquanto o app escreve.
        .journal_mode(SqliteJournalMode::Wal);
    let pool = SqlitePool::connect_with(options).await?;
    sqlx::migrate!("./migrations").run(&pool).await?;
    Ok(pool)
}
