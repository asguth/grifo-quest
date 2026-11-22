//! Ponte com o Claude Code CLI em modo headless (`claude -p`). Usa a assinatura já logada da máquina.

use std::path::Path;
use std::process::Stdio;
use std::time::Duration;

use serde::Deserialize;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::sync::Notify;

use crate::error::{AppError, AppResult};
use crate::sys;

const TIMEOUT: Duration = Duration::from_secs(15 * 60);

/// Uma linha do `--output-format stream-json`. Só lemos o que interessa.
#[derive(Deserialize)]
struct StreamLine {
    #[serde(rename = "type")]
    kind: String,
    message: Option<StreamMessage>,
    result: Option<String>,
    is_error: Option<bool>,
}

#[derive(Deserialize)]
struct StreamMessage {
    #[serde(default)]
    content: Vec<serde_json::Value>,
}

/// `claude` (ou o caminho configurado). No Windows é um .cmd: precisa passar pelo cmd.exe.
pub fn command(cli: &str) -> tokio::process::Command {
    if cfg!(windows) {
        let mut c = sys::hidden_command("cmd");
        c.args(["/C", cli]);
        c
    } else {
        sys::hidden_command(cli)
    }
}

/// Roda `claude -p` (prompt via stdin) em `cwd` com as ferramentas liberadas e devolve o texto final.
pub async fn run(cli: &str, prompt: &str, cwd: &Path, allowed_tools: &[&str]) -> AppResult<String> {
    run_job(cli, prompt, cwd, allowed_tools, None, |_| {}, None).await
}

/// Igual a `run`, mas narra o que o Claude está fazendo (`on_progress`), aceita uma pasta extra
/// com permissão de escrita (`add_dir`) e pode ser cancelado (`cancel.notify_one()`).
pub async fn run_job(
    cli: &str,
    prompt: &str,
    cwd: &Path,
    allowed_tools: &[&str],
    add_dir: Option<&Path>,
    mut on_progress: impl FnMut(String),
    cancel: Option<&Notify>,
) -> AppResult<String> {
    let mut cmd = command(cli);
    // Prompt vai pelo stdin: como argumento, o cmd.exe interpretaria aspas, & e % do texto.
    cmd.args(["-p", "--output-format", "stream-json", "--verbose"]);
    if let Some(dir) = add_dir {
        cmd.arg("--add-dir").arg(dir);
    }
    if !allowed_tools.is_empty() {
        cmd.arg("--allowedTools").args(allowed_tools);
    }
    cmd.current_dir(cwd)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let spawn_err = |e: std::io::Error| AppError::Invalid(format!("Não consegui rodar o Claude CLI ({cli}): {e}"));
    let mut child = cmd.spawn().map_err(spawn_err)?;
    if let Some(mut stdin) = child.stdin.take() {
        stdin.write_all(prompt.as_bytes()).await.map_err(spawn_err)?;
    } // stdin fechado aqui: o CLI só começa ao receber EOF
    let pid = child.id();
    let stdout = child.stdout.take().ok_or_else(|| AppError::Invalid("Claude CLI sem stdout".into()))?;

    let read = async {
        let mut lines = BufReader::new(stdout).lines();
        let mut last: Option<StreamLine> = None;
        while let Some(line) = lines.next_line().await? {
            let Ok(parsed) = serde_json::from_str::<StreamLine>(&line) else { continue };
            if let Some(text) = describe(&parsed) {
                on_progress(text);
            }
            if parsed.kind == "result" {
                last = Some(parsed);
            }
        }
        Ok::<_, AppError>(last)
    };
    let cancelled = async {
        match cancel {
            Some(n) => n.notified().await,
            None => std::future::pending().await,
        }
    };

    let result = tokio::select! {
        r = tokio::time::timeout(TIMEOUT, read) => match r {
            Ok(r) => r?,
            Err(_) => {
                kill_tree(pid).await;
                return Err(AppError::Invalid(format!("Claude demorou mais de {} min", TIMEOUT.as_secs() / 60)));
            }
        },
        () = cancelled => {
            kill_tree(pid).await;
            return Err(AppError::cancelled());
        }
    };

    let out = child.wait_with_output().await.map_err(spawn_err)?;
    let Some(res) = result else {
        let err = String::from_utf8_lossy(&out.stderr);
        return Err(AppError::Invalid(format!("Resposta inesperada do Claude CLI: {}", err.lines().next().unwrap_or("").trim())));
    };
    let text = res.result.unwrap_or_default();
    if res.is_error.unwrap_or(false) {
        return Err(AppError::Invalid(format!("Claude: {text}")));
    }
    Ok(text)
}

/// No Windows matar o cmd.exe deixa o node do Claude vivo: derruba a árvore inteira.
async fn kill_tree(pid: Option<u32>) {
    let Some(pid) = pid else { return };
    let mut k = if cfg!(windows) {
        let mut k = sys::hidden_command("taskkill");
        k.args(["/PID", &pid.to_string(), "/T", "/F"]);
        k
    } else {
        let mut k = sys::hidden_command("kill");
        k.args(["-9", &pid.to_string()]);
        k
    };
    k.stdout(Stdio::null()).stderr(Stdio::null());
    if let Err(e) = k.status().await {
        eprintln!("não consegui encerrar o Claude (pid {pid}): {e}");
    }
}

/// Texto curto, em pt-BR, do que o Claude está fazendo agora.
fn describe(line: &StreamLine) -> Option<String> {
    if line.kind != "assistant" {
        return None;
    }
    let item = line.message.as_ref()?.content.last()?;
    match item.get("type")?.as_str()? {
        "tool_use" => {
            let input = item.get("input");
            let arg = |k: &str| input.and_then(|i| i.get(k)).and_then(|v| v.as_str()).unwrap_or("");
            let file = |k: &str| arg(k).rsplit(['/', '\\']).next().unwrap_or("").to_string();
            Some(match item.get("name")?.as_str()? {
                "Skill" => "Carregando a skill".into(),
                "Read" => format!("Lendo {}", file("file_path")),
                "Write" => format!("Escrevendo {}", file("file_path")),
                "Edit" => format!("Ajustando {}", file("file_path")),
                "Bash" => "Rodando um script".into(),
                "WebSearch" => format!("Pesquisando: {}", arg("query")),
                "WebFetch" => "Lendo uma fonte na web".into(),
                "Glob" | "Grep" => "Procurando arquivos".into(),
                other => format!("Usando {other}"),
            })
        }
        "text" => {
            let t = item.get("text")?.as_str()?.trim();
            (!t.is_empty()).then(|| crate::domain::text::head(t, 120).to_string())
        }
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn describes_stream_lines() {
        let line = |s: &str| serde_json::from_str::<StreamLine>(s).unwrap();
        let w = line(r#"{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Write","input":{"file_path":"C:\\x\\apostila.html"}}]}}"#);
        assert_eq!(describe(&w).as_deref(), Some("Escrevendo apostila.html"));
        let r = line(r#"{"type":"result","result":"ok","is_error":false}"#);
        assert_eq!(describe(&r), None);
    }
}
