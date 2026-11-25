#[macro_use]
mod wire;

mod account;
mod ai;
mod claude;
mod cloud;
mod codex;
mod commands;
mod db;
mod domain;
mod error;
mod gpu;
mod grifo;
mod ollama;
mod settings;
mod sys;

use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, WindowEvent};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
use tauri_specta::{collect_commands, collect_events};

type SetupResult = Result<(), Box<dyn std::error::Error>>;

fn specta_builder() -> tauri_specta::Builder<tauri::Wry> {
    use commands::{account, classroom, community, config, diary, integrations, log, material, planner, study, subjects, timer, tutor, updater, voice, window, world};
    tauri_specta::Builder::<tauri::Wry>::new()
        .events(collect_events![classroom::ClassEvent, material::GrifoEvent, sys::IntegrationEvent, planner::PlannerEvent, timer::TimerTick, study::StudyEvent, window::NavigateTo, voice::VoiceLevel, updater::UpdateReady, tutor::TutorToken])
        .commands(collect_commands![
        account::account_status,
        account::account_send_code,
        account::account_verify_code,
        account::account_sign_in_password,
        account::account_access,
        account::account_sign_out,
        account::account_plan,
        community::daily_question_draft,
        subjects::list_subjects,
        subjects::create_subject,
        subjects::update_subject,
        subjects::delete_subject,
        subjects::list_topics,
        subjects::add_topics,
        subjects::set_topic_checks,
        subjects::delete_topic,
        log::quick_log,
        timer::timer_status,
        timer::start_pomodoro,
        timer::start_stopwatch,
        timer::stop_timer,
        timer::toggle_pause,
        config::get_pomodoro_config,
        config::set_pomodoro_config,
        diary::get_dashboard,
        diary::nav_badges,
        config::get_config,
        config::backup_database,
        config::list_backups,
        config::restore_backup,
        config::reset_database,
        tutor::ask_tutor,
        tutor::tutor_models,
        config::set_config,
        config::get_ui_pref,
        config::set_ui_pref,
        window::open_main,
        window::show_welcome,
        voice::voice_start,
        voice::voice_stop,
        voice::install_voice,
        classroom::open_classes,
        classroom::class_state,
        classroom::discard_class,
        world::list_exams,
        world::create_exam,
        world::delete_exam,
        world::list_feeds,
        world::add_feed,
        world::set_feed_active,
        world::delete_feed,
        world::list_news,
        world::set_news_read,
        world::mark_all_news_read,
        world::summarize_news,
        world::refresh_news,
        world::list_contests,
        world::set_contest_followed,
        world::delete_contest,
        world::search_contests_with_claude,
        classroom::list_students,
        classroom::list_all_topics,
        classroom::get_topic_material,
        classroom::set_topic_material,
        classroom::start_class,
        classroom::send_explanation,
        classroom::finish_class,
        classroom::list_class_reports,
        classroom::prepare_class,
        classroom::open_material,
        classroom::open_link,
        material::list_materials,
        material::material_view,
        material::delete_material,
        material::open_material_file,
        material::cancel_material,
        material::generate_material,
        integrations::integrations_status,
        integrations::gpu_info,
        integrations::apply_hardware_defaults,
        integrations::cloud_status,
        integrations::set_cloud_key,
        integrations::cloud_models,
        integrations::install_ollama,
        integrations::start_ollama,
        integrations::pull_model,
        integrations::test_ollama,
        integrations::install_claude,
        integrations::claude_login,
        integrations::claude_login_terminal,
        integrations::claude_logout,
        integrations::install_chatgpt,
        integrations::chatgpt_login,
        integrations::chatgpt_logout,
        integrations::test_chatgpt,
        integrations::test_claude,
        integrations::connect_mcp,
        config::get_profile,
        config::set_profile,
        planner::plan_from_role,
        planner::pdf_text,
        planner::plan_from_edital,
        planner::apply_plan,
        study::study_home,
        study::start_session,
        study::next_question,
        study::answer_question,
        study::finish_session,
        study::explain_question,
        study::cards_due,
        study::generate_cards,
        study::save_cards,
        study::review_card,
        study::cards_from_material,
        study::card_from_question,
        study::list_cards,
        study::create_card,
        study::update_card,
        study::delete_card,
        study::error_list,
        study::remove_error,
        study::report_question,
        study::performance,
        updater::update_status,
        updater::check_update,
        updater::install_update,
    ])
}

fn setup_tray(app: &tauri::App) -> SetupResult {
    let open = MenuItem::with_id(app, "open", "Abrir Grifo Quest", true, None::<&str>)?;
    let quick = MenuItem::with_id(app, "quick", "Lançar questões (Ctrl+Alt+Q)", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Sair", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &quick, &quit])?;
    let icon = app.default_window_icon().cloned().ok_or("ícone padrão ausente")?;

    TrayIconBuilder::with_id(sys::TRAY)
        .icon(icon)
        .tooltip("Grifo Quest")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => sys::show_window(app, sys::MAIN),
            "quick" => sys::show_window(app, sys::QUICK),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                sys::show_window(tray.app_handle(), sys::MAIN);
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
                    sys::show_window(app, sys::QUICK);
                }
            })
            .build(),
    )?;
    // Atalho ocupado por outro programa (ou outra cópia do app) não pode impedir o app de abrir.
    if let Err(e) = app.global_shortcut().register(quick) {
        eprintln!("atalho Ctrl+Alt+Q indisponível ({e}); o lançamento rápido segue pela bandeja");
    }
    Ok(())
}

/// Argumento que o Windows passa quando abre o app no login (distingue de abrir na mão).
const AUTOSTART_ARG: &str = "--autostart";

/// Autostart ligado por padrão só na primeira execução; depois respeita o toggle das Configurações.
async fn autostart_first_run(app: &AppHandle, pool: &sqlx::SqlitePool) -> SetupResult {
    // ponytail: em dev não registra o binário de debug no boot do Windows.
    if cfg!(debug_assertions) {
        return Ok(());
    }
    if db::settings::get(pool, "autostart_initialized").await?.is_none() {
        app.autolaunch().enable()?;
        db::settings::set(pool, "autostart_initialized", "1").await?;
    } else if app.autolaunch().is_enabled()? {
        // Reescreve o registro para incluir o `--autostart` de versões antigas.
        app.autolaunch().enable()?;
    }
    Ok(())
}

/// Ao ligar o PC: janela compacta de boas-vindas (a não ser que o usuário tenha desligado).
/// Em qualquer outra abertura (menu Iniciar, depois de atualizar, depois de restaurar backup) a
/// janela principal aparece: antes ela começava sempre escondida e o app parecia ter fechado.
async fn on_launch(app: &AppHandle, pool: &sqlx::SqlitePool) -> SetupResult {
    let booted = std::env::args().any(|a| a == AUTOSTART_ARG);
    // Reiniciar (atualização, restauração) reaproveita os argumentos: se o app tinha subido no
    // login, voltaria escondido. O aviso gravado antes de reiniciar vence o `--autostart`.
    let asked = settings::take_show_on_start(pool).await?;
    if booted && !asked {
        let off = settings::ui_pref(pool, settings::UiKey::WelcomeOnBoot).await?.as_deref() == Some("off");
        if !off {
            commands::window::open_welcome(app)?;
        }
    } else {
        sys::show_window(app, sys::MAIN);
    }
    Ok(())
}

fn setup(app: &mut tauri::App) -> SetupResult {
    let dir = app.path().app_data_dir()?;
    std::fs::create_dir_all(&dir)?;
    let pool = tauri::async_runtime::block_on(db::open(&dir.join(sys::DB_FILE)))?;
    app.manage(pool.clone());
    app.manage(commands::timer::TimerState::default());
    app.manage(commands::material::GrifoJobs::default());
    app.manage(commands::study::StudyState::default());
    app.manage(commands::voice::VoiceState::default());
    app.manage(commands::updater::PendingUpdate::default());
    app.manage(account::AccountState::default());
    // Janelas só agora (`create: false` no tauri.conf): criadas antes do `manage`, a página embutida do
    // build final carrega rápido e os primeiros comandos (tema, perfil) falham com "state not managed",
    // e o app abria com o tema padrão.
    for w in app.config().app.windows.clone().iter().filter(|w| !w.create) {
        tauri::WebviewWindowBuilder::from_config(app.handle(), w)?.build()?;
    }
    // Depois do `manage`: a janela de boas-vindas já chama comandos que usam esse estado.
    let handle = app.handle().clone();
    tauri::async_runtime::block_on(async move {
        if let Err(e) = autostart_first_run(&handle, &pool).await {
            eprintln!("autostart: {e}");
        }
        on_launch(&handle, &pool).await
    })?;
    setup_tray(app)?;
    setup_shortcut(app)?;
    commands::timer::spawn_ticker(app.handle().clone());
    commands::world::spawn_news_refresher(app.handle().clone());
    commands::updater::spawn_update_checker(app.handle().clone());
    Ok(())
}

#[cfg(debug_assertions)]
const BINDINGS: &str = "../src/lib/bindings.ts";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = specta_builder();
    #[cfg(debug_assertions)]
    if let Err(e) = builder.export(specta_typescript::Typescript::default(), BINDINGS) {
        eprintln!("falha ao exportar bindings TS: {e}");
    }

    let result = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| sys::show_window(app, sys::MAIN)))
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, Some(vec![AUTOSTART_ARG])))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(builder.invoke_handler())
        .on_window_event(|window, event| {
            // Fechar a janela só esconde (o app vive na bandeja); as boas-vindas fecham de verdade.
            if let WindowEvent::CloseRequested { api, .. } = event
                && window.label() != sys::WELCOME
            {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .setup(move |app| {
            builder.mount_events(app);
            setup(app)
        })
        .run(tauri::generate_context!());

    if let Err(e) = result {
        eprintln!("erro ao rodar o Grifo Quest: {e}");
        std::process::exit(1);
    }
}
