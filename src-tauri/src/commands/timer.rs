use std::sync::{Mutex, MutexGuard};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_notification::NotificationExt;
use tauri_specta::Event;

use crate::db::{self, sessions::{NewSession, SessionSource}};
use crate::domain::timer::{Phase, Timer, TimerKind, Transition};
use crate::domain::xp;
use crate::error::{AppError, AppResult};
use crate::settings::{self, PomodoroConfig};
use crate::sys;

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

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(tag = "mode", rename_all = "snake_case")]
pub enum TimerView {
    Idle,
    Pomodoro { phase: Phase, subject_id: Option<i32>, remaining: i32, total: i32, paused: bool },
    Stopwatch { kind: TimerKind, subject_id: Option<i32>, elapsed: i32, paused: bool },
}

/// Estado do timer a cada segundo (substitui o polling do front).
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type, tauri_specta::Event)]
pub struct TimerTick(pub TimerView);

/// Cronômetro com menos de 1 min é clique acidental: não grava.
const MIN_SESSION_SECS: i64 = 60;

fn now() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_secs() as i64)
}

fn view(t: Timer, now: i64) -> TimerView {
    let secs = t.seconds(now) as i32;
    let paused = t.paused();
    match t {
        Timer::Idle => TimerView::Idle,
        Timer::Pomodoro { phase, subject_id, len, .. } => {
            TimerView::Pomodoro { phase, subject_id, remaining: secs, total: len as i32, paused }
        }
        Timer::Stopwatch { kind, subject_id, .. } => TimerView::Stopwatch { kind, subject_id, elapsed: secs, paused },
    }
}

fn ensure_idle(state: &TimerState) -> AppResult<()> {
    match state.get() {
        Timer::Idle => Ok(()),
        _ => Err(AppError::Invalid("Já tem um timer rodando".into())),
    }
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
    let cfg: PomodoroConfig = settings::load(&pool).await?;
    let t = Timer::Pomodoro {
        phase: Phase::Focus,
        subject_id,
        started: now(),
        len: i64::from(cfg.focus_min) * 60,
        break_len: i64::from(cfg.break_min) * 60,
        paused_at: None,
    };
    state.set(t);
    Ok(view(t, now()))
}

#[tauri::command]
#[specta::specta]
pub fn start_stopwatch(state: State<'_, TimerState>, kind: TimerKind, subject_id: Option<i32>) -> AppResult<TimerView> {
    ensure_idle(&state)?;
    let subject_id = if kind == TimerKind::Estudo { subject_id } else { None };
    let t = Timer::Stopwatch { kind, subject_id, started: now(), paused_at: None };
    state.set(t);
    Ok(view(t, now()))
}

/// Para o timer gravando o tempo estudado: cronômetro inteiro ou foco parcial do pomodoro (sem o XP do pomodoro).
#[tauri::command]
#[specta::specta]
pub async fn stop_timer(pool: State<'_, SqlitePool>, state: State<'_, TimerState>) -> AppResult<TimerView> {
    let previous = state.get();
    if let Some(p) = previous.stop(now())
        && p.ended - p.started >= MIN_SESSION_SECS
    {
        // Pomodoro interrompido vira estudo manual: missão e sequência contam só pomodoro concluído.
        let session =
            NewSession { kind: p.kind, subject_id: p.subject_id, started: p.started, ended: p.ended, source: SessionSource::Manual, xp: 0 };
        db::player::award(&pool, async || db::sessions::insert(&pool, session).await).await?;
    }
    state.set(Timer::Idle);
    Ok(TimerView::Idle)
}

/// Pausa ou retoma o timer que estiver rodando.
#[tauri::command]
#[specta::specta]
pub fn toggle_pause(state: State<'_, TimerState>) -> TimerView {
    let now = now();
    let mut t = state.lock();
    if t.paused() { t.resume(now) } else { t.pause(now) }
    view(*t, now)
}

/// Loop de 1 s: avança o pomodoro, grava/notifica nas viradas de fase e atualiza o tooltip da bandeja.
pub fn spawn_ticker(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let mut last_label: Option<String> = None;
        loop {
            tokio::time::sleep(Duration::from_secs(1)).await;
            let now = now();
            let state = app.state::<TimerState>();
            let (transition, label, current) = {
                let mut timer = state.lock();
                (timer.tick(now), timer.label(now), *timer)
            };
            // Só emite enquanto algo roda (e uma vez ao voltar a parado, para o front limpar).
            if current != Timer::Idle || last_label.is_some() {
                let _ = TimerTick(view(current, now)).emit(&app);
            }
            if let Some(tr) = transition
                && let Err(e) = on_transition(&app, tr).await
            {
                eprintln!("timer: {e}");
            }
            if label != last_label {
                if let Some(tray) = app.tray_by_id(sys::TRAY) {
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
                NewSession { kind: TimerKind::Estudo, subject_id, started, ended, source: SessionSource::Pomodoro, xp: xp::POMODORO };
            let ((), outcome) = db::player::award(&pool, async || db::sessions::insert(&pool, session).await).await?;
            let mission_xp = outcome.mission_xp;
            let bonus = if mission_xp > 0 { format!(" Missão concluída: +{mission_xp} XP!") } else { String::new() };
            notify(app, &format!("Pomodoro concluído! +{} XP", xp::POMODORO), &format!("Hora da pausa.{bonus}"));
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
