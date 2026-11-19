use std::sync::{Mutex, MutexGuard};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_notification::NotificationExt;

use crate::db::{self, sessions::NewSession};
use crate::domain::timer::{Kind, Phase, Timer, Transition};
use crate::domain::xp;
use crate::error::{AppError, AppResult};

/// O timer vive no Rust: segue contando com a janela escondida na bandeja.
#[derive(Default)]
pub struct TimerState(Mutex<Timer>);

impl TimerState {
    fn lock(&self) -> MutexGuard<'_, Timer> {
        self.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
    }
    fn get(&self) -> Timer {
        *self.lock()
    }
    fn set(&self, t: Timer) {
        *self.lock() = t;
    }
}

#[derive(Debug, Serialize, Deserialize, specta::Type)]
pub struct PomodoroConfig {
    pub focus_min: i32,
    pub break_min: i32,
}

#[derive(Debug, Serialize, specta::Type)]
#[serde(tag = "mode", rename_all = "snake_case")]
pub enum TimerView {
    Idle,
    Pomodoro { phase: Phase, subject_id: Option<i32>, remaining: i32, total: i32 },
    Stopwatch { kind: Kind, subject_id: Option<i32>, elapsed: i32 },
}

/// Cronômetro com menos de 1 min é clique acidental: não grava.
const MIN_SESSION_SECS: i64 = 60;

fn now() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_secs() as i64)
}

fn view(t: Timer, now: i64) -> TimerView {
    match t {
        Timer::Idle => TimerView::Idle,
        Timer::Pomodoro { phase, subject_id, started, len, .. } => TimerView::Pomodoro {
            phase,
            subject_id,
            remaining: (started + len - now).max(0) as i32,
            total: len as i32,
        },
        Timer::Stopwatch { kind, subject_id, started } => {
            TimerView::Stopwatch { kind, subject_id, elapsed: (now - started) as i32 }
        }
    }
}

fn ensure_idle(state: &TimerState) -> AppResult<()> {
    match state.get() {
        Timer::Idle => Ok(()),
        _ => Err(AppError::Invalid("Já tem um timer rodando".into())),
    }
}

async fn read_config(pool: &SqlitePool) -> AppResult<PomodoroConfig> {
    let num = |v: Option<String>, default| v.and_then(|s| s.parse().ok()).unwrap_or(default);
    Ok(PomodoroConfig {
        focus_min: num(db::settings::get(pool, "pomodoro_focus_min").await?, 25),
        break_min: num(db::settings::get(pool, "pomodoro_break_min").await?, 5),
    })
}

#[tauri::command]
#[specta::specta]
pub fn timer_status(state: State<'_, TimerState>) -> TimerView {
    view(state.get(), now())
}

#[tauri::command]
#[specta::specta]
pub async fn start_pomodoro(
    pool: State<'_, SqlitePool>,
    state: State<'_, TimerState>,
    subject_id: Option<i32>,
) -> AppResult<TimerView> {
    ensure_idle(&state)?;
    let cfg = read_config(&pool).await?;
    let t = Timer::Pomodoro {
        phase: Phase::Focus,
        subject_id,
        started: now(),
        len: i64::from(cfg.focus_min) * 60,
        break_len: i64::from(cfg.break_min) * 60,
    };
    state.set(t);
    Ok(view(t, now()))
}

#[tauri::command]
#[specta::specta]
pub fn start_stopwatch(state: State<'_, TimerState>, kind: Kind, subject_id: Option<i32>) -> AppResult<TimerView> {
    ensure_idle(&state)?;
    let subject_id = if kind == Kind::Estudo { subject_id } else { None };
    let t = Timer::Stopwatch { kind, subject_id, started: now() };
    state.set(t);
    Ok(view(t, now()))
}

/// Para o cronômetro gravando a sessão; num pomodoro, cancela sem gravar.
// ponytail: sem pausa; cancelar o foco descarta o tempo. Pausar/gravar parcial se fizer falta.
#[tauri::command]
#[specta::specta]
pub async fn stop_timer(pool: State<'_, SqlitePool>, state: State<'_, TimerState>) -> AppResult<TimerView> {
    let previous = state.get();
    state.set(Timer::Idle);
    if let Timer::Stopwatch { kind, subject_id, started } = previous {
        let ended = now();
        if ended - started >= MIN_SESSION_SECS {
            let session =
                NewSession { kind: kind.as_str(), subject_id, started, ended, source: "manual", xp: 0 };
            db::sessions::insert(&pool, session).await?;
        }
    }
    Ok(TimerView::Idle)
}

#[tauri::command]
#[specta::specta]
pub async fn get_pomodoro_config(pool: State<'_, SqlitePool>) -> AppResult<PomodoroConfig> {
    read_config(&pool).await
}

#[tauri::command]
#[specta::specta]
pub async fn set_pomodoro_config(pool: State<'_, SqlitePool>, config: PomodoroConfig) -> AppResult<()> {
    if !(1..=180).contains(&config.focus_min) || !(1..=60).contains(&config.break_min) {
        return Err(AppError::Invalid("Foco entre 1 e 180 min, pausa entre 1 e 60 min".into()));
    }
    db::settings::set(&pool, "pomodoro_focus_min", &config.focus_min.to_string()).await?;
    db::settings::set(&pool, "pomodoro_break_min", &config.break_min.to_string()).await?;
    Ok(())
}

/// Loop de 1 s: avança o pomodoro, grava/notifica nas viradas de fase e atualiza o tooltip da bandeja.
pub fn spawn_ticker(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let mut last_label: Option<String> = None;
        loop {
            tokio::time::sleep(Duration::from_secs(1)).await;
            let now = now();
            let state = app.state::<TimerState>();
            let (transition, label) = {
                let mut timer = state.lock();
                (timer.tick(now), timer.label(now))
            };
            if let Some(tr) = transition
                && let Err(e) = on_transition(&app, tr).await
            {
                eprintln!("timer: {e}");
            }
            if label != last_label {
                if let Some(tray) = app.tray_by_id("main") {
                    let _ = tray.set_tooltip(Some(label.as_deref().unwrap_or("Grifo Quest")));
                }
                last_label = label;
            }
        }
    });
}

async fn on_transition(app: &AppHandle, tr: Transition) -> AppResult<()> {
    match tr {
        Transition::FocusDone { subject_id, started, ended } => {
            let pool = app.state::<SqlitePool>();
            let session =
                NewSession { kind: "estudo", subject_id, started, ended, source: "pomodoro", xp: xp::POMODORO };
            db::sessions::insert(&pool, session).await?;
            notify(app, &format!("Pomodoro concluído! +{} XP", xp::POMODORO), "Hora da pausa.");
        }
        Transition::BreakDone => notify(app, "Pausa encerrada", "Bora para o próximo pomodoro?"),
    }
    Ok(())
}

fn notify(app: &AppHandle, title: &str, body: &str) {
    if let Err(e) = app.notification().builder().title(title).body(body).show() {
        eprintln!("notificação: {e}");
    }
}
