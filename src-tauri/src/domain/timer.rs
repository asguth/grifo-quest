//! Máquina de estados do timer (pomodoro e cronômetro), pura: o relógio entra como parâmetro.

use serde::{Deserialize, Serialize};

wire_enum! {
    pub enum TimerKind {
        Estudo = "estudo",
        Trabalho = "trabalho",
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "snake_case")]
pub enum Phase {
    Focus,
    Break,
}

/// Tempos em segundos Unix. `paused_at`: pausado desde então (o relógio "congela" ali).
#[derive(Clone, Copy, Debug, PartialEq, Default)]
pub enum Timer {
    #[default]
    Idle,
    Pomodoro { phase: Phase, subject_id: Option<i32>, started: i64, len: i64, break_len: i64, paused_at: Option<i64> },
    Stopwatch { kind: TimerKind, subject_id: Option<i32>, started: i64, paused_at: Option<i64> },
}

/// Tempo de estudo que vale gravar ao parar no meio.
#[derive(Debug, PartialEq)]
pub struct Partial {
    pub kind: TimerKind,
    pub subject_id: Option<i32>,
    pub started: i64,
    pub ended: i64,
    pub from_pomodoro: bool,
}

#[derive(Debug, PartialEq)]
pub enum Transition {
    FocusDone { subject_id: Option<i32>, started: i64, ended: i64 },
    BreakDone,
}

impl Timer {
    pub fn paused(&self) -> bool {
        matches!(self, Timer::Pomodoro { paused_at: Some(_), .. } | Timer::Stopwatch { paused_at: Some(_), .. })
    }

    pub fn pause(&mut self, now: i64) {
        if let Timer::Pomodoro { paused_at, .. } | Timer::Stopwatch { paused_at, .. } = self {
            paused_at.get_or_insert(now);
        }
    }

    /// Volta a contar: empurra o início pelo tempo parado, então nada do que passou pausado conta.
    pub fn resume(&mut self, now: i64) {
        if let Timer::Pomodoro { started, paused_at, .. } | Timer::Stopwatch { started, paused_at, .. } = self
            && let Some(p) = paused_at.take()
        {
            *started += now - p;
        }
    }

    /// "Agora" do ponto de vista do timer (congelado enquanto pausado).
    fn at(&self, now: i64) -> i64 {
        match *self {
            Timer::Pomodoro { paused_at: Some(p), .. } | Timer::Stopwatch { paused_at: Some(p), .. } => p,
            _ => now,
        }
    }

    /// Ao parar: o que foi estudado de verdade (cronômetro inteiro, ou o foco parcial do pomodoro).
    pub fn stop(self, now: i64) -> Option<Partial> {
        let end = self.at(now);
        match self {
            Timer::Stopwatch { kind, subject_id, started, .. } => {
                Some(Partial { kind, subject_id, started, ended: end, from_pomodoro: false })
            }
            Timer::Pomodoro { phase: Phase::Focus, subject_id, started, .. } => {
                Some(Partial { kind: TimerKind::Estudo, subject_id, started, ended: end, from_pomodoro: true })
            }
            _ => None,
        }
    }

    /// Avança o pomodoro se a fase venceu. Foco → pausa → parado.
    pub fn tick(&mut self, now: i64) -> Option<Transition> {
        let Timer::Pomodoro { phase, subject_id, started, len, break_len, paused_at: None } = *self else {
            return None;
        };
        let end = started + len;
        if now < end {
            return None;
        }
        match phase {
            Phase::Focus => {
                *self = Timer::Pomodoro { phase: Phase::Break, subject_id, started: end, len: break_len, break_len, paused_at: None };
                Some(Transition::FocusDone { subject_id, started, ended: end })
            }
            Phase::Break => {
                *self = Timer::Idle;
                Some(Transition::BreakDone)
            }
        }
    }

    /// Texto curto para o tooltip da bandeja.
    pub fn label(&self, now: i64) -> Option<String> {
        let at = self.at(now);
        let mark = if self.paused() { " (pausado)" } else { "" };
        match *self {
            Timer::Idle => None,
            Timer::Pomodoro { phase, started, len, .. } => {
                let name = if phase == Phase::Focus { "Foco" } else { "Pausa" };
                Some(format!("{name} {}{mark}", clock(started + len - at)))
            }
            Timer::Stopwatch { kind, started, .. } => {
                let name = if kind == TimerKind::Estudo { "Estudo" } else { "Trabalho" };
                Some(format!("{name} {}{mark}", clock(at - started)))
            }
        }
    }

    /// Segundos restantes (pomodoro) ou decorridos (cronômetro), respeitando a pausa.
    pub fn seconds(&self, now: i64) -> i64 {
        let at = self.at(now);
        match *self {
            Timer::Idle => 0,
            Timer::Pomodoro { started, len, .. } => (started + len - at).max(0),
            Timer::Stopwatch { started, .. } => at - started,
        }
    }
}

/// `mm:ss`, ou `h:mm:ss` a partir de uma hora.
pub fn clock(secs: i64) -> String {
    let s = secs.max(0);
    let (h, m, s) = (s / 3600, s % 3600 / 60, s % 60);
    if h > 0 { format!("{h}:{m:02}:{s:02}") } else { format!("{m:02}:{s:02}") }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pomodoro() -> Timer {
        Timer::Pomodoro { phase: Phase::Focus, subject_id: Some(7), started: 1000, len: 1500, break_len: 300, paused_at: None }
    }

    #[test]
    fn focus_then_break_then_idle() {
        let mut t = pomodoro();
        assert_eq!(t.tick(2499), None);
        assert_eq!(t.tick(2500), Some(Transition::FocusDone { subject_id: Some(7), started: 1000, ended: 2500 }));
        assert_eq!(t.label(2500).as_deref(), Some("Pausa 05:00"));
        assert_eq!(t.tick(2799), None);
        assert_eq!(t.tick(2800), Some(Transition::BreakDone));
        assert_eq!(t, Timer::Idle);
    }

    #[test]
    fn late_tick_records_planned_end() {
        // PC dormiu: o foco termina no horário previsto, não quando acordou.
        let mut t = pomodoro();
        assert_eq!(t.tick(9999), Some(Transition::FocusDone { subject_id: Some(7), started: 1000, ended: 2500 }));
        assert_eq!(t.tick(9999), Some(Transition::BreakDone));
    }

    #[test]
    fn stopwatch_never_transitions() {
        let mut t = Timer::Stopwatch { kind: TimerKind::Trabalho, subject_id: None, started: 0, paused_at: None };
        assert_eq!(t.tick(100_000), None);
        assert_eq!(t.label(3725).as_deref(), Some("Trabalho 1:02:05"));
    }

    #[test]
    fn pause_freezes_and_resume_shifts() {
        let mut t = pomodoro();
        t.pause(1100); // 100 s de foco
        assert_eq!(t.tick(5000), None, "pausado não vence");
        assert_eq!(t.seconds(5000), 1400);
        assert_eq!(t.label(5000).as_deref(), Some("Foco 23:20 (pausado)"));
        t.resume(2000); // ficou 900 s parado
        assert_eq!(t.seconds(2000), 1400);
        assert_eq!(t.tick(3399), None);
        assert!(matches!(t.tick(3400), Some(Transition::FocusDone { .. })));
    }

    #[test]
    fn stop_keeps_partial_focus_but_not_break() {
        let mut t = pomodoro();
        t.pause(1600);
        let p = t.stop(9999).unwrap();
        assert_eq!((p.started, p.ended, p.from_pomodoro), (1000, 1600, true));
        let mut b = pomodoro();
        b.tick(2500); // agora na pausa
        assert_eq!(b.stop(2600), None);
    }

    #[test]
    fn clock_format() {
        assert_eq!(clock(0), "00:00");
        assert_eq!(clock(59), "00:59");
        assert_eq!(clock(1500), "25:00");
        assert_eq!(clock(-5), "00:00");
    }
}
