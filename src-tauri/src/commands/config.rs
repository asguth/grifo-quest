//! Leitura e gravação das configurações (o formato vive em `crate::settings`).

use sqlx::SqlitePool;
use tauri::State;

use crate::error::{AppError, AppResult};
use crate::settings::{self, AppConfig, PomodoroConfig, Profile, UiKey};

#[tauri::command]
#[specta::specta]
pub async fn get_config(pool: State<'_, SqlitePool>) -> AppResult<AppConfig> {
    settings::load(&pool).await
}

#[tauri::command]
#[specta::specta]
pub async fn set_config(pool: State<'_, SqlitePool>, config: AppConfig) -> AppResult<()> {
    settings::save(&pool, &config).await
}

#[tauri::command]
#[specta::specta]
pub async fn get_profile(pool: State<'_, SqlitePool>) -> AppResult<Profile> {
    settings::load(&pool).await
}

#[tauri::command]
#[specta::specta]
pub async fn set_profile(pool: State<'_, SqlitePool>, profile: Profile) -> AppResult<()> {
    profile.validate()?;
    settings::save(&pool, &profile).await
}

#[tauri::command]
#[specta::specta]
pub async fn get_pomodoro_config(pool: State<'_, SqlitePool>) -> AppResult<PomodoroConfig> {
    settings::load(&pool).await
}

#[tauri::command]
#[specta::specta]
pub async fn set_pomodoro_config(pool: State<'_, SqlitePool>, config: PomodoroConfig) -> AppResult<()> {
    config.validate()?;
    settings::save(&pool, &config).await
}

#[tauri::command]
#[specta::specta]
pub async fn get_ui_pref(pool: State<'_, SqlitePool>, key: UiKey) -> AppResult<Option<String>> {
    settings::ui_pref(&pool, key).await
}

#[tauri::command]
#[specta::specta]
pub async fn set_ui_pref(pool: State<'_, SqlitePool>, key: UiKey, value: String) -> AppResult<()> {
    settings::set_ui_pref(&pool, key, &value).await
}

fn backup_dir(app: &tauri::AppHandle) -> AppResult<std::path::PathBuf> {
    use tauri::Manager;
    Ok(app.path().document_dir()?.join("Grifo Quest").join("backups"))
}

/// `VACUUM INTO` gera um arquivo consistente mesmo com o app aberto (WAL incluído).
async fn write_backup(app: &tauri::AppHandle, pool: &SqlitePool, tag: &str) -> AppResult<std::path::PathBuf> {
    let dir = backup_dir(app)?;
    std::fs::create_dir_all(&dir)?;
    let secs = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_or(0, |d| d.as_secs() as i64);
    let hms = secs.rem_euclid(86_400);
    let name = format!("grifo-{}-{:02}{:02}{:02}{tag}.db", crate::domain::news::iso_date(secs), hms / 3600, hms / 60 % 60, hms % 60);
    let path = dir.join(name);
    sqlx::query("VACUUM INTO ?").bind(path.to_string_lossy().to_string()).execute(pool).await?;
    Ok(path)
}

/// Cópia do banco em `Documentos/Grifo Quest/backups/grifo-AAAA-MM-DD-HHMMSS.db` (hora UTC) e abre a pasta.
#[tauri::command]
#[specta::specta]
pub async fn backup_database(app: tauri::AppHandle, pool: State<'_, SqlitePool>) -> AppResult<String> {
    use tauri_plugin_opener::OpenerExt;
    let path = write_backup(&app, &pool, "").await?;
    if let Err(e) = app.opener().reveal_item_in_dir(&path) {
        eprintln!("abrir a pasta do backup: {e}");
    }
    Ok(path.to_string_lossy().into_owned())
}

#[derive(Debug, serde::Serialize, specta::Type)]
pub struct BackupFile {
    pub name: String,
    /// Tamanho em KB.
    pub kb: i32,
}

/// Backups da pasta, do mais novo para o mais antigo.
#[tauri::command]
#[specta::specta]
pub fn list_backups(app: tauri::AppHandle) -> AppResult<Vec<BackupFile>> {
    let Ok(entries) = std::fs::read_dir(backup_dir(&app)?) else { return Ok(Vec::new()) };
    let mut out: Vec<BackupFile> = entries
        .filter_map(Result::ok)
        .filter(|e| e.path().extension().is_some_and(|x| x == "db"))
        .map(|e| BackupFile {
            name: e.file_name().to_string_lossy().into_owned(),
            kb: e.metadata().map_or(0, |m| (m.len() / 1024).min(i32::MAX as u64) as i32),
        })
        .collect();
    out.sort_by(|a, b| b.name.cmp(&a.name));
    Ok(out)
}

/// Restaura um backup da pasta: guarda o estado atual como `…-antes-de-restaurar.db`, fecha o
/// banco, troca o arquivo e reinicia o app.
#[tauri::command]
#[specta::specta]
pub async fn restore_backup(app: tauri::AppHandle, pool: State<'_, SqlitePool>, name: String) -> AppResult<()> {
    use tauri::Manager;
    // só um nome de arquivo da própria pasta (nada de caminho vindo de fora)
    if name.contains(['/', '\\']) || name.contains("..") || !name.ends_with(".db") {
        return Err(AppError::Invalid("Backup inválido".into()));
    }
    let src = backup_dir(&app)?.join(&name);
    if !src.is_file() {
        return Err(AppError::Invalid("Backup não encontrado".into()));
    }
    // Confere que é um banco do Grifo antes de apagar qualquer coisa (abrir não basta: o SQLite só
    // lê o cabeçalho na primeira consulta).
    let opts = sqlx::sqlite::SqliteConnectOptions::new().filename(&src).read_only(true);
    let valid = match sqlx::SqlitePool::connect_with(opts).await {
        Ok(p) => {
            let n: Result<i64, _> = sqlx::query_scalar("SELECT count(*) FROM sqlite_master WHERE name = 'subjects'").fetch_one(&p).await;
            p.close().await;
            matches!(n, Ok(1))
        }
        Err(_) => false,
    };
    if !valid {
        return Err(AppError::Invalid("Esse arquivo não é um backup do Grifo Quest".into()));
    }
    write_backup(&app, &pool, "-antes-de-restaurar").await?;
    pool.close().await;
    let db = app.path().app_data_dir()?.join(crate::sys::DB_FILE);
    for ext in ["-wal", "-shm"] {
        let _ = std::fs::remove_file(format!("{}{ext}", db.to_string_lossy()));
    }
    std::fs::copy(&src, &db)?;
    // O aviso vai no banco RESTAURADO (o antigo acabou de ser trocado): o app reabre com a janela à
    // vista, não escondido na bandeja.
    let opts = sqlx::sqlite::SqliteConnectOptions::new().filename(&db);
    match sqlx::SqlitePool::connect_with(opts).await {
        Ok(p) => {
            if let Err(e) = crate::settings::ask_show_on_start(&p).await {
                eprintln!("aviso de abrir a janela: {e}");
            }
            p.close().await;
        }
        Err(e) => eprintln!("aviso de abrir a janela: {e}"),
    }
    app.restart()
}

/// Apaga tudo (matérias, questões, histórico, preferências) e reinicia no assistente inicial.
/// Antes guarda um backup "antes-de-apagar" na pasta de backups: dá para voltar em Restaurar.
/// Chaves de API (cofre do Windows), modelos do Ollama e apostilas geradas não são apagados.
#[tauri::command]
#[specta::specta]
pub async fn reset_database(app: tauri::AppHandle, pool: State<'_, SqlitePool>) -> AppResult<()> {
    use tauri::Manager;
    write_backup(&app, &pool, "-antes-de-apagar").await?;
    pool.close().await;
    let db = app.path().app_data_dir()?.join(crate::sys::DB_FILE);
    for ext in ["", "-wal", "-shm"] {
        let path = format!("{}{ext}", db.to_string_lossy());
        match std::fs::remove_file(&path) {
            Err(e) if e.kind() != std::io::ErrorKind::NotFound => {
                return Err(AppError::Invalid(format!("Não consegui apagar {path}: {e}")));
            }
            _ => {}
        }
    }
    // Banco novo já com as migrações e o aviso de abrir a janela (o app reabre no assistente, à vista).
    let fresh = crate::db::open(&db).await?;
    if let Err(e) = crate::settings::ask_show_on_start(&fresh).await {
        eprintln!("aviso de abrir a janela: {e}");
    }
    fresh.close().await;
    app.restart()
}
