mod commands;
mod db;
mod domain;
mod error;

use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, WindowEvent};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
use tauri_specta::collect_commands;

type SetupResult = Result<(), Box<dyn std::error::Error>>;

fn specta_builder() -> tauri_specta::Builder<tauri::Wry> {
    use commands::{log, subjects};
    tauri_specta::Builder::<tauri::Wry>::new().commands(collect_commands![
        subjects::list_subjects,
        subjects::create_subject,
        subjects::update_subject,
        subjects::delete_subject,
        subjects::list_topics,
        subjects::add_topics,
        subjects::set_topic_status,
        subjects::delete_topic,
        log::quick_log,
    ])
}

fn show_window(app: &AppHandle, label: &str) {
    if let Some(w) = app.get_webview_window(label) {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

fn setup_tray(app: &tauri::App) -> SetupResult {
    let open = MenuItem::with_id(app, "open", "Abrir Grifo Quest", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Sair", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &quit])?;
    let icon = app.default_window_icon().cloned().ok_or("ícone padrão ausente")?;

    TrayIconBuilder::with_id("main")
        .icon(icon)
        .tooltip("Grifo Quest")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => show_window(app, "main"),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                show_window(tray.app_handle(), "main");
            }
        })
        .build(app)?;
    Ok(())
}

fn setup_shortcut(app: &tauri::App) -> SetupResult {
    let quick = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::KeyQ);
    app.handle().plugin(
        tauri_plugin_global_shortcut::Builder::new()
            .with_handler(move |app, shortcut, event| {
                if shortcut == &quick && event.state() == ShortcutState::Pressed {
                    show_window(app, "quick");
                }
            })
            .build(),
    )?;
    app.global_shortcut().register(quick)?;
    Ok(())
}

/// Autostart ligado por padrão só na primeira execução; depois respeita o toggle das Configurações.
async fn autostart_first_run(app: &AppHandle, pool: &sqlx::SqlitePool) -> SetupResult {
    // ponytail: em dev não registra o binário de debug no boot do Windows.
    if cfg!(debug_assertions) || db::settings::get(pool, "autostart_initialized").await?.is_some() {
        return Ok(());
    }
    app.autolaunch().enable()?;
    db::settings::set(pool, "autostart_initialized", "1").await?;
    Ok(())
}

fn setup(app: &mut tauri::App) -> SetupResult {
    let dir = app.path().app_data_dir()?;
    std::fs::create_dir_all(&dir)?;
    let handle = app.handle().clone();
    let pool = tauri::async_runtime::block_on(async move {
        let pool = db::open(&dir.join("grifo.db")).await?;
        autostart_first_run(&handle, &pool).await?;
        Ok::<_, Box<dyn std::error::Error>>(pool)
    })?;
    app.manage(pool);
    setup_tray(app)?;
    setup_shortcut(app)?;
    Ok(())
}

const BINDINGS: &str = "../src/lib/bindings.ts";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = specta_builder();
    #[cfg(debug_assertions)]
    if let Err(e) = builder.export(specta_typescript::Typescript::default(), BINDINGS) {
        eprintln!("falha ao exportar bindings TS: {e}");
    }

    let result = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show_window(app, "main")))
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None))
        .invoke_handler(builder.invoke_handler())
        .on_window_event(|window, event| {
            // Fechar a janela só esconde: o app vive na bandeja.
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .setup(setup)
        .run(tauri::generate_context!());

    if let Err(e) = result {
        eprintln!("erro ao rodar o Grifo Quest: {e}");
        std::process::exit(1);
    }
}
