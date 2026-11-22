//! Janelas: principal (vive na bandeja) e boas-vindas (criada sob demanda).

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_specta::Event;

use crate::error::AppResult;
use crate::sys::{self, MAIN, WELCOME};

/// Pede à janela principal para abrir uma tela (ex.: "foco" a partir das boas-vindas).
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type, tauri_specta::Event)]
pub struct NavigateTo(pub String);

/// Mostra a janela principal (opcionalmente numa tela) e fecha as boas-vindas.
#[tauri::command]
#[specta::specta]
pub async fn open_main(app: AppHandle, slot: Option<String>) {
    sys::show_window(&app, MAIN);
    if let Some(s) = slot {
        let _ = NavigateTo(s).emit(&app);
    }
    if let Some(w) = app.get_webview_window(WELCOME) {
        let _ = w.close();
    }
}

/// Cria (ou traz para a frente) a janela de boas-vindas. Ela só existe enquanto aparece:
/// ao fechar, o WebView é destruído e não fica ocupando memória o dia todo.
pub fn open_welcome(app: &AppHandle) -> AppResult<()> {
    if app.get_webview_window(WELCOME).is_some() {
        sys::show_window(app, WELCOME);
        return Ok(());
    }
    WebviewWindowBuilder::new(app, WELCOME, WebviewUrl::App("index.html".into()))
        .title("Grifo Quest")
        .inner_size(460.0, 640.0)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .resizable(false)
        .skip_taskbar(true)
        .center()
        .focused(true)
        .build()?;
    Ok(())
}

/// Mostra a janela de boas-vindas agora (botão "Testar" em Config).
// async: criar janela num comando síncrono trava o app no Windows (deadlock do WebView2).
#[tauri::command]
#[specta::specta]
pub async fn show_welcome(app: AppHandle) -> AppResult<()> {
    open_welcome(&app)
}
