//! Encanamento do sistema: processos sem janela, janelas do app e o cliente HTTP.

use std::process::Stdio;
use std::sync::OnceLock;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use tauri_specta::Event;

/// `CREATE_NO_WINDOW`: sem isso cada processo filho pisca um console no Windows.
pub const CREATE_NO_WINDOW: u32 = 0x0800_0000;

pub const MAIN: &str = "main";
pub const QUICK: &str = "quick";
pub const WELCOME: &str = "welcome";
pub const TRAY: &str = "main";
/// Banco do app, dentro da pasta de dados (o servidor MCP recebe o caminho completo).
pub const DB_FILE: &str = "grifo.db";

/// Processo filho sem console, sem stdin e morto junto com o handle.
pub fn hidden_command(program: impl AsRef<std::ffi::OsStr>) -> tokio::process::Command {
    let mut c = tokio::process::Command::new(program);
    #[cfg(windows)]
    c.creation_flags(CREATE_NO_WINDOW);
    c.stdin(Stdio::null()).kill_on_drop(true);
    c
}

pub fn show_window(app: &AppHandle, label: &str) {
    if let Some(w) = app.get_webview_window(label) {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

/// Um cliente para o app inteiro. O UA de navegador evita que sites de notícia recusem o pedido;
/// cada chamada define o próprio timeout.
pub fn http() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) GrifoQuest")
            .build()
            .unwrap_or_default()
    })
}

/// Linha de progresso de uma ação longa (instalação, download de modelo).
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type, tauri_specta::Event)]
pub struct IntegrationEvent {
    /// ollama | model | claude | voice
    pub target: String,
    pub text: String,
    /// 0–1 quando se sabe.
    pub progress: Option<f64>,
}

/// Emite uma linha de progresso (falha ao emitir não interrompe a instalação).
pub fn progress(app: &AppHandle, target: &str, text: impl Into<String>, progress: Option<f64>) {
    let _ = IntegrationEvent { target: target.into(), text: text.into(), progress }.emit(app);
}
