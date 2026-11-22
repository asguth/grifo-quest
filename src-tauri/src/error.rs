use serde::Serialize;

/// Erro que atravessa a fronteira Tauri; o front recebe só a mensagem.
#[derive(Debug, thiserror::Error, Serialize, specta::Type)]
#[serde(tag = "kind", content = "message")]
pub enum AppError {
    #[error("banco de dados: {0}")]
    Db(String),
    #[error("{0}")]
    Invalid(String),
}

impl From<sqlx::Error> for AppError {
    fn from(e: sqlx::Error) -> Self {
        AppError::Db(e.to_string())
    }
}

impl From<sqlx::migrate::MigrateError> for AppError {
    fn from(e: sqlx::migrate::MigrateError) -> Self {
        AppError::Db(e.to_string())
    }
}

impl From<tauri::Error> for AppError {
    fn from(e: tauri::Error) -> Self {
        AppError::Invalid(e.to_string())
    }
}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        AppError::Invalid(e.to_string())
    }
}

impl From<reqwest::Error> for AppError {
    fn from(e: reqwest::Error) -> Self {
        AppError::Invalid(e.to_string())
    }
}

impl From<serde_json::Error> for AppError {
    fn from(e: serde_json::Error) -> Self {
        AppError::Invalid(e.to_string())
    }
}

impl AppError {
    /// Trabalho cancelado pelo usuário. O front reconhece a mensagem e não a mostra como falha.
    pub fn cancelled() -> Self {
        AppError::Invalid("Cancelado".into())
    }
}

pub type AppResult<T> = Result<T, AppError>;
