//! Config → Integrações: diagnóstico e ações de um clique (Ollama, Claude CLI, MCP, Grifo).

use std::path::PathBuf;
use std::process::Stdio;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use tauri::{AppHandle, Manager, State};
use tokio::io::{AsyncBufReadExt, BufReader};

use crate::error::{AppError, AppResult};
use crate::settings::{self, AppConfig};
use crate::sys::{self, progress};
use crate::ai::Route;
use crate::cloud::{self, Cloud};
use crate::gpu::{self, GpuInfo};
use crate::{claude, grifo, ollama};

#[derive(Debug, Serialize, specta::Type)]
pub struct IntegrationsStatus {
    pub ollama_installed: bool,
    pub ollama_running: bool,
    /// Modelos já baixados.
    pub ollama_models: Vec<String>,
    /// Modelos que a configuração usa (alunos, avaliador, tarefas), sem repetição.
    pub wanted_models: Vec<String>,
    pub claude_version: Option<String>,
    pub grifo_version: String,
    pub mcp_built: bool,
    pub mcp_code: bool,
    pub mcp_desktop: bool,
    /// whisper.cpp + modelo de voz baixados.
    pub voice_installed: bool,
    /// Placa de vídeo: sem placa dedicada, a IA local nem aparece como opção.
    pub gpu: GpuInfo,
    /// Quantas IAs na nuvem (Gemini/GPT/Grok) têm chave salva.
    pub cloud_keys: i32,
}

/// Ollama.exe: o instalador põe em %LOCALAPPDATA%\Programs\Ollama, mas o PATH deste
/// processo não vê a instalação nova até reiniciar. Por isso olha a pasta antes do PATH.
fn ollama_exe() -> Option<PathBuf> {
    let local = std::env::var_os("LOCALAPPDATA").map(|d| PathBuf::from(d).join("Programs").join("Ollama").join("ollama.exe"));
    local.filter(|p| p.exists()).or_else(|| which("ollama"))
}

fn which(name: &str) -> Option<PathBuf> {
    let mut cmd = std::process::Command::new(if cfg!(windows) { "where" } else { "which" });
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(sys::CREATE_NO_WINDOW);
    }
    let out = cmd.arg(name).stdout(Stdio::piped()).stderr(Stdio::null()).output().ok()?;
    let first = String::from_utf8_lossy(&out.stdout).lines().next()?.trim().to_string();
    (out.status.success() && !first.is_empty()).then(|| PathBuf::from(first))
}

fn mcp_exe() -> AppResult<PathBuf> {
    let name = if cfg!(windows) { "grifo-quest-mcp.exe" } else { "grifo-quest-mcp" };
    Ok(std::env::current_exe()?.with_file_name(name))
}

fn desktop_config_path() -> Option<PathBuf> {
    std::env::var_os("APPDATA").map(|d| PathBuf::from(d).join("Claude").join("claude_desktop_config.json"))
}

async fn claude_version(cli: &str) -> Option<String> {
    let out = tokio::time::timeout(Duration::from_secs(20), claude::command(cli).arg("--version").output())
        .await
        .ok()?
        .ok()?;
    let v = String::from_utf8_lossy(&out.stdout).trim().to_string();
    (out.status.success() && !v.is_empty()).then_some(v)
}

async fn mcp_in_claude_code(cli: &str) -> bool {
    let run = claude::command(cli).args(["mcp", "get", "grifo-quest"]).output();
    matches!(tokio::time::timeout(Duration::from_secs(20), run).await, Ok(Ok(o)) if o.status.success())
}

fn mcp_in_desktop() -> bool {
    let Some(text) = desktop_config_path().and_then(|p| std::fs::read_to_string(p).ok()) else { return false };
    serde_json::from_str::<serde_json::Value>(&text).is_ok_and(|v| v.pointer("/mcpServers/grifo-quest").is_some())
}

#[tauri::command]
#[specta::specta]
pub async fn integrations_status(app: AppHandle, pool: State<'_, SqlitePool>) -> AppResult<IntegrationsStatus> {
    let cfg = settings::load::<AppConfig>(&pool).await?;
    let (models, version, code, gpu) =
        tokio::join!(ollama::list_models(&cfg.ollama_url), claude_version(&cfg.claude_cli), mcp_in_claude_code(&cfg.claude_cli), gpu::info());
    let mut wanted = vec![cfg.student_model.clone(), cfg.evaluator_model.clone(), cfg.task_model.clone()];
    wanted.sort();
    wanted.dedup();
    Ok(IntegrationsStatus {
        ollama_installed: ollama_exe().is_some(),
        ollama_running: models.is_ok(),
        ollama_models: models.unwrap_or_default(),
        wanted_models: wanted,
        claude_version: version,
        grifo_version: grifo::bundled_version(&app)?,
        mcp_built: mcp_exe()?.exists(),
        mcp_code: code,
        mcp_desktop: mcp_in_desktop(),
        voice_installed: crate::commands::voice::installed(&app),
        gpu,
        cloud_keys: Cloud::ALL.iter().filter(|&&c| matches!(cloud::key(c), Ok(Some(_)))).count() as i32,
    })
}

#[tauri::command]
#[specta::specta]
pub async fn gpu_info() -> GpuInfo {
    gpu::info().await
}

/// Assistente inicial: ajusta a IA à placa de vídeo. Com placa, os três papéis usam o modelo que
/// cabe na VRAM; sem placa, as rotas vão para o Claude (o Ollama nem é oferecido).
#[tauri::command]
#[specta::specta]
pub async fn apply_hardware_defaults(pool: State<'_, SqlitePool>) -> AppResult<GpuInfo> {
    let info = gpu::info().await;
    let mut cfg = settings::load::<AppConfig>(&pool).await?;
    match &info.model {
        Some(model) => {
            cfg.student_model.clone_from(model);
            cfg.evaluator_model.clone_from(model);
            cfg.task_model.clone_from(model);
        }
        None => {
            cfg.material_route = Route::Claude;
            cfg.evaluator = Route::Claude;
        }
    }
    settings::save(&pool, &cfg).await?;
    Ok(info)
}

/// Roda um instalador mostrando cada linha da saída como evento.
async fn run_streaming(app: &AppHandle, target: &str, mut cmd: tokio::process::Command) -> AppResult<()> {
    cmd.stdout(Stdio::piped()).stderr(Stdio::piped());
    let mut child = cmd.spawn().map_err(|e| AppError::Invalid(format!("Não consegui iniciar o instalador: {e}")))?;
    if let Some(out) = child.stdout.take() {
        let mut lines = BufReader::new(out).lines();
        while let Some(line) = lines.next_line().await? {
            let line = line.trim();
            // winget desenha barras com caracteres de bloco; só repassa texto de verdade.
            if line.chars().any(char::is_alphanumeric) {
                progress(app, target, line, None);
            }
        }
    }
    let out = child.wait_with_output().await?;
    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr);
        return Err(AppError::Invalid(format!("O instalador falhou: {}", err.lines().last().unwrap_or("sem detalhes"))));
    }
    Ok(())
}

/// Instala o Ollama pelo winget (o próprio instalador já deixa ele rodando).
#[tauri::command]
#[specta::specta]
pub async fn install_ollama(app: AppHandle) -> AppResult<()> {
    let mut cmd = sys::hidden_command("winget");
    cmd.args(["install", "-e", "--id", "Ollama.Ollama", "--silent", "--accept-package-agreements", "--accept-source-agreements"]);
    progress(&app, "ollama", "Baixando o Ollama pelo winget…", None);
    run_streaming(&app, "ollama", cmd).await
}

/// Sobe o servidor do Ollama em segundo plano (fica rodando depois que o app fecha).
#[tauri::command]
#[specta::specta]
pub async fn start_ollama(pool: State<'_, SqlitePool>) -> AppResult<()> {
    let exe = ollama_exe().ok_or_else(|| AppError::Invalid("Ollama não está instalado".into()))?;
    let mut cmd = std::process::Command::new(exe);
    cmd.arg("serve").stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // CREATE_NO_WINDOW dá ao servidor um console ESCONDIDO, que os runners (um processo por
        // modelo carregado) herdam. Com DETACHED_PROCESS (versão antiga) o servidor ficava sem
        // console e cada runner abria uma janela preta própria. CREATE_NEW_PROCESS_GROUP: o Ctrl+C
        // do app não derruba o Ollama, que segue rodando depois que o app fecha.
        const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;
        cmd.creation_flags(sys::CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP);
    }
    cmd.spawn().map_err(|e| AppError::Invalid(format!("Não consegui abrir o Ollama: {e}")))?;
    let url = settings::load::<AppConfig>(&pool).await?.ollama_url;
    for _ in 0..20 {
        if ollama::is_up(&url).await {
            return Ok(());
        }
        tokio::time::sleep(Duration::from_millis(500)).await;
    }
    Err(AppError::Invalid("O Ollama abriu mas não respondeu em 10 s".into()))
}

/// Baixa um modelo com barra de progresso (eventos `model`).
#[tauri::command]
#[specta::specta]
pub async fn pull_model(app: AppHandle, pool: State<'_, SqlitePool>, model: String) -> AppResult<()> {
    let url = settings::load::<AppConfig>(&pool).await?.ollama_url;
    let mut last = (String::new(), -1i32);
    ollama::pull(&url, &model, |status, frac| {
        let pct = frac.map_or(-1, |f| (f * 100.0) as i32);
        if last.0 != status || last.1 != pct {
            last = (status.to_string(), pct);
            progress(&app, "model", format!("{model}: {status}"), frac);
        }
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn test_ollama(pool: State<'_, SqlitePool>) -> AppResult<String> {
    let cfg = settings::load::<AppConfig>(&pool).await?;
    let messages = [ollama::Msg { role: "user", content: "Responda apenas com a palavra OK." }];
    ollama::chat(&cfg.ollama_url, &cfg.task_model, &messages, false).await
}

/// Instalador oficial do Claude Code. Se o `claude` não estiver no PATH depois, aponta a config pro exe novo.
#[tauri::command]
#[specta::specta]
pub async fn install_claude(app: AppHandle, pool: State<'_, SqlitePool>) -> AppResult<()> {
    let mut cmd = sys::hidden_command("powershell");
    cmd.args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", "irm https://claude.ai/install.ps1 | iex"]);
    progress(&app, "claude", "Baixando o Claude Code (instalador oficial)…", None);
    run_streaming(&app, "claude", cmd).await?;

    let mut cfg = settings::load::<AppConfig>(&pool).await?;
    if claude_version(&cfg.claude_cli).await.is_none() {
        let home = app.path().home_dir()?;
        let exe = home.join(".local").join("bin").join(if cfg!(windows) { "claude.exe" } else { "claude" });
        if exe.exists() {
            cfg.claude_cli = exe.to_string_lossy().into();
            settings::save(&pool, &cfg).await?;
        }
    }
    Ok(())
}

/// Abre um terminal com o `claude` para o login (a assinatura é sua: o app não vê a senha).
#[tauri::command]
#[specta::specta]
pub async fn claude_login(pool: State<'_, SqlitePool>) -> AppResult<()> {
    let cli = settings::load::<AppConfig>(&pool).await?.claude_cli;
    std::process::Command::new("cmd")
        .args(["/C", "start", "Claude Code - login", "cmd", "/K", &cli])
        .spawn()
        .map_err(|e| AppError::Invalid(format!("Não consegui abrir o terminal: {e}")))?;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn test_claude(app: AppHandle, pool: State<'_, SqlitePool>) -> AppResult<String> {
    let cli = settings::load::<AppConfig>(&pool).await?.claude_cli;
    claude::run(&cli, "Responda apenas com a palavra OK.", &app.path().app_data_dir()?, &[]).await
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "snake_case")]
pub enum McpTarget {
    ClaudeCode,
    ClaudeDesktop,
}

/// Registra o servidor MCP do Grifo Quest no Claude Code (`claude mcp add`) ou no Claude Desktop (JSON, com backup).
/// O caminho do banco vai como argumento: o servidor não precisa adivinhar a pasta de dados.
#[tauri::command]
#[specta::specta]
pub async fn connect_mcp(app: AppHandle, pool: State<'_, SqlitePool>, target: McpTarget) -> AppResult<String> {
    let exe = mcp_exe()?;
    if !exe.exists() {
        return Err(AppError::Invalid(format!("O servidor MCP não está ao lado do app ({}). Reinstale o Grifo Quest.", exe.display())));
    }
    let exe = exe.to_string_lossy().to_string();
    let db = app.path().app_data_dir()?.join(sys::DB_FILE).to_string_lossy().to_string();
    match target {
        McpTarget::ClaudeCode => {
            let cli = settings::load::<AppConfig>(&pool).await?.claude_cli;
            // Re-registrar: remove o antigo (pode apontar para outro exe) e adiciona.
            // Pode não existir ainda: o erro do `remove` não importa, o do `add` sim.
            let _ = claude::command(&cli).args(["mcp", "remove", "grifo-quest", "-s", "user"]).output().await;
            let out = claude::command(&cli)
                .args(["mcp", "add", "grifo-quest", "-s", "user", "--", &exe, &db])
                .output()
                .await?;
            if !out.status.success() {
                return Err(AppError::Invalid(format!("claude mcp add falhou: {}", String::from_utf8_lossy(&out.stderr).trim())));
            }
            Ok("Conectado ao Claude Code. Pergunte lá: \"como foi minha semana de estudos?\"".into())
        }
        McpTarget::ClaudeDesktop => {
            let path = desktop_config_path().ok_or_else(|| AppError::Invalid("APPDATA não definido".into()))?;
            let current = match std::fs::read_to_string(&path) {
                Ok(t) => Some(t),
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => None,
                Err(e) => return Err(AppError::Invalid(format!("Não consegui ler {}: {e}", path.display()))),
            };
            let mut json: serde_json::Value = match &current {
                Some(t) => serde_json::from_str(t).map_err(|e| AppError::Invalid(format!("claude_desktop_config.json inválido: {e}")))?,
                None => serde_json::json!({}),
            };
            if let Some(t) = &current {
                std::fs::write(path.with_extension("json.bak"), t)?;
            }
            add_server(&mut json, &exe, &db)?;
            if let Some(dir) = path.parent() {
                std::fs::create_dir_all(dir)?;
            }
            std::fs::write(&path, serde_json::to_string_pretty(&json)?)?;
            Ok("Conectado ao Claude Desktop. Feche e abra o Claude Desktop para ele carregar.".into())
        }
    }
}

/// Põe `mcpServers.grifo-quest` no JSON do Claude Desktop sem mexer no resto.
fn add_server(json: &mut serde_json::Value, exe: &str, db: &str) -> AppResult<()> {
    let root = json.as_object_mut().ok_or_else(|| AppError::Invalid("claude_desktop_config.json não é um objeto".into()))?;
    let servers = root.entry("mcpServers").or_insert_with(|| serde_json::json!({}));
    let servers = servers.as_object_mut().ok_or_else(|| AppError::Invalid("mcpServers não é um objeto".into()))?;
    servers.insert("grifo-quest".into(), serde_json::json!({ "command": exe, "args": [db] }));
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::add_server;

    #[test]
    fn keeps_other_servers_and_settings() {
        let mut j = serde_json::json!({ "theme": "dark", "mcpServers": { "outro": { "command": "x" } } });
        add_server(&mut j, "C:\\mcp.exe", "C:\\grifo.db").unwrap();
        assert_eq!(j["theme"], "dark");
        assert_eq!(j["mcpServers"]["outro"]["command"], "x");
        assert_eq!(j["mcpServers"]["grifo-quest"]["command"], "C:\\mcp.exe");
        assert_eq!(j["mcpServers"]["grifo-quest"]["args"][0], "C:\\grifo.db");
        let mut empty = serde_json::json!({});
        add_server(&mut empty, "a", "b").unwrap();
        assert_eq!(empty["mcpServers"]["grifo-quest"]["command"], "a");
    }
}

// ---------- Gemini, GPT e Grok (chave de API própria) ----------

#[derive(Debug, Serialize, specta::Type)]
pub struct CloudStatus {
    pub id: Cloud,
    pub label: String,
    pub has_key: bool,
    pub model: String,
    /// Página onde se cria a chave.
    pub key_page: String,
}

#[tauri::command]
#[specta::specta]
pub async fn cloud_status(pool: State<'_, SqlitePool>) -> AppResult<Vec<CloudStatus>> {
    let cfg = settings::load::<AppConfig>(&pool).await?;
    Cloud::ALL
        .iter()
        .map(|&c| {
            Ok(CloudStatus {
                id: c,
                label: c.label().into(),
                has_key: cloud::key(c)?.is_some(),
                model: cfg.cloud_models.get(c).to_string(),
                key_page: c.key_page().into(),
            })
        })
        .collect()
}

/// Grava a chave no cofre do Windows (texto vazio apaga).
#[tauri::command]
#[specta::specta]
pub fn set_cloud_key(cloud: Cloud, key: String) -> AppResult<()> {
    cloud::set_key(cloud, &key)
}

/// Modelos de texto da conta; serve também para testar a chave.
#[tauri::command]
#[specta::specta]
pub async fn cloud_models(cloud: Cloud) -> AppResult<Vec<String>> {
    cloud::list_models(cloud).await
}
