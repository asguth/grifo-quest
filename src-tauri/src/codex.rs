//! ChatGPT pela assinatura (Plus/Pro/Business) via Codex CLI oficial da OpenAI, em modo headless
//! (`codex exec`). Sem chave de API: a pessoa entra com a conta do ChatGPT no navegador.
//! O executável vem da release do GitHub (`openai/codex`) para `<app_data>/codex/codex.exe`.

use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::Duration;

use serde::Deserialize;
use tauri::{AppHandle, Manager};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};

use crate::error::{AppError, AppResult};
use crate::sys;

const TIMEOUT: Duration = Duration::from_secs(10 * 60);
const LOGIN_TIMEOUT: Duration = Duration::from_secs(10 * 60);
const RELEASES_API: &str = "https://api.github.com/repos/openai/codex/releases?per_page=10";

fn dir(app: &AppHandle) -> AppResult<PathBuf> {
    Ok(app.path().app_data_dir()?.join("codex"))
}

/// O baixado pelo app; senão o `codex` do PATH (quem já instalou por npm).
pub fn exe(app: &AppHandle) -> PathBuf {
    match dir(app) {
        Ok(d) if d.join("codex.exe").exists() => d.join("codex.exe"),
        _ => PathBuf::from("codex"),
    }
}

pub(crate) fn command(app: &AppHandle) -> tokio::process::Command {
    let exe = exe(app);
    // `codex` do npm é um .cmd: só o cmd.exe o acha
    if cfg!(windows) && exe.extension().is_none() {
        let mut c = sys::hidden_command("cmd");
        c.arg("/C").arg(exe);
        c
    } else {
        sys::hidden_command(exe)
    }
}

/// Versão instalada (`None` = não achou).
pub async fn version(app: &AppHandle) -> Option<String> {
    let out = tokio::time::timeout(Duration::from_secs(15), command(app).arg("--version").output()).await.ok()?.ok()?;
    out.status.success().then(|| String::from_utf8_lossy(&out.stdout).trim().replace("codex-cli ", "")).filter(|v| !v.is_empty())
}

/// `codex login status` sai com 0 quando há login.
pub async fn logged_in(app: &AppHandle) -> bool {
    let run = command(app).args(["login", "status"]).output();
    matches!(tokio::time::timeout(Duration::from_secs(15), run).await, Ok(Ok(o)) if o.status.success())
}

#[derive(Deserialize)]
struct Release {
    assets: Vec<Asset>,
}

#[derive(Deserialize)]
struct Asset {
    name: String,
    browser_download_url: String,
}

/// Executável do Windows na release mais recente que o tem (as releases também trazem outros binários).
async fn exe_url() -> AppResult<String> {
    let want = if cfg!(target_arch = "aarch64") { "codex-aarch64-pc-windows-msvc.exe" } else { "codex-x86_64-pc-windows-msvc.exe" };
    let releases: Vec<Release> = sys::http()
        .get(RELEASES_API)
        .timeout(Duration::from_secs(20))
        .send()
        .await?
        .error_for_status()
        .map_err(|e| AppError::Invalid(format!("GitHub recusou a consulta de versões: {e}")))?
        .json()
        .await?;
    releases
        .into_iter()
        .flat_map(|r| r.assets)
        .find(|a| a.name == want)
        .map(|a| a.browser_download_url)
        .ok_or_else(|| AppError::Invalid("Não achei o ChatGPT (Codex) para Windows nas versões publicadas".into()))
}

/// Baixa o Codex oficial (eventos `chatgpt`).
pub async fn install(app: &AppHandle) -> AppResult<()> {
    let d = dir(app)?;
    std::fs::create_dir_all(&d)?;
    sys::progress(app, "chatgpt", "Procurando a versão mais recente…", None);
    let url = exe_url().await?;
    crate::commands::voice::download(app, "chatgpt", &url, &d.join("codex.exe"), "o conector do ChatGPT").await
}

/// Abre o login do ChatGPT no navegador e espera a pessoa entrar. O link também vai no progresso
/// (caso o navegador não abra sozinho).
pub async fn login(app: &AppHandle) -> AppResult<()> {
    let mut cmd = command(app);
    cmd.arg("login").stdout(Stdio::piped()).stderr(Stdio::piped());
    let mut child = cmd.spawn().map_err(|e| AppError::Invalid(format!("Não consegui abrir o login do ChatGPT: {e}")))?;
    let stderr = child.stderr.take().ok_or_else(|| AppError::Invalid("login sem saída".into()))?;
    let app2 = app.clone();
    let narrate = async move {
        let mut lines = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            if let Some(url) = line.split_whitespace().find(|w| w.starts_with("https://")) {
                sys::progress(&app2, "chatgpt-login", url.to_string(), None);
            }
        }
    };
    let wait = async { tokio::join!(narrate, child.wait()).1 };
    match tokio::time::timeout(LOGIN_TIMEOUT, wait).await {
        Ok(Ok(s)) if s.success() => Ok(()),
        Ok(Ok(_)) => Err(AppError::Invalid("O login do ChatGPT não terminou. Tente de novo.".into())),
        Ok(Err(e)) => Err(AppError::Invalid(format!("Login do ChatGPT falhou: {e}"))),
        Err(_) => Err(AppError::Invalid("O login do ChatGPT expirou (10 min). Tente de novo.".into())),
    }
}

pub async fn logout(app: &AppHandle) -> AppResult<()> {
    command(app).arg("logout").output().await?;
    Ok(())
}

/// Uma resposta: prompt pelo stdin, só leitura, sem guardar sessão; o texto final vem do `-o`.
pub async fn run(app: &AppHandle, prompt: &str) -> AppResult<String> {
    exec(app, prompt, false).await
}

/// Igual a [`run`], com a busca na web do Codex ligada (rastreador de concursos).
pub async fn run_with_web(app: &AppHandle, prompt: &str) -> AppResult<String> {
    exec(app, prompt, true).await
}

async fn exec(app: &AppHandle, prompt: &str, web: bool) -> AppResult<String> {
    let work = dir(app)?.join("work");
    std::fs::create_dir_all(&work)?;
    let out_file = work.join(format!("resposta-{}.txt", std::process::id() ^ rand_suffix()));
    let mut cmd = command(app);
    cmd.arg("exec");
    if web {
        cmd.args(["-c", "tools.web_search=true"]);
    }
    cmd.args(["--skip-git-repo-check", "--ephemeral", "--color", "never", "-s", "read-only", "-o"])
        .arg(&out_file)
        .arg("-")
        .current_dir(&work)
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::piped());
    let spawn_err = |e: std::io::Error| AppError::Invalid(format!("Não consegui rodar o ChatGPT (Codex): {e}"));
    let mut child = cmd.spawn().map_err(spawn_err)?;
    if let Some(mut stdin) = child.stdin.take() {
        stdin.write_all(prompt.as_bytes()).await.map_err(spawn_err)?;
    }
    let out = tokio::time::timeout(TIMEOUT, child.wait_with_output())
        .await
        .map_err(|_| AppError::Invalid("O ChatGPT demorou mais de 10 min".into()))?
        .map_err(spawn_err)?;
    let text = read_and_remove(&out_file);
    if !out.status.success() || text.trim().is_empty() {
        return Err(AppError::Invalid(failure(&String::from_utf8_lossy(&out.stderr))));
    }
    Ok(text.trim().to_string())
}

fn read_and_remove(p: &Path) -> String {
    let t = std::fs::read_to_string(p).unwrap_or_default();
    let _ = std::fs::remove_file(p);
    t
}

/// Sufixo para o arquivo de resposta (duas chamadas ao mesmo tempo não se atropelam).
fn rand_suffix() -> u32 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_or(0, |d| d.subsec_nanos())
}

/// Mensagem curta do erro, com a dica de login quando é o caso.
fn failure(stderr: &str) -> String {
    let low = stderr.to_lowercase();
    if low.contains("login") || low.contains("401") || low.contains("unauthorized") || low.contains("not logged") {
        return "ChatGPT desconectado: entre de novo em Configurações → Integrações".into();
    }
    if low.contains("usage limit") || low.contains("rate limit") || low.contains("429") {
        return "ChatGPT: limite de uso da sua assinatura atingido. Tente mais tarde.".into();
    }
    let last = stderr.lines().map(str::trim).rfind(|l| !l.is_empty()).unwrap_or("sem resposta");
    format!("ChatGPT (Codex): {last}")
}

#[cfg(test)]
mod tests {
    use super::failure;

    #[test]
    fn explains_common_failures() {
        assert!(failure("Error: 401 Unauthorized").contains("entre de novo"));
        assert!(failure("You've hit your usage limit").contains("limite"));
        assert_eq!(failure("linha 1\nboom\n\n"), "ChatGPT (Codex): boom");
    }
}
