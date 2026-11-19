//! Máquina de estados do timer (pomodoro e cronômetro), pura: o relógio entra como parâmetro.

use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "snake_case")]
pub enum Kind {
    Estudo,
    Trabalho,
}

impl Kind {
    pub fn as_str(self) -> &'static str {
        match self {
            Kind::Estudo => "estudo",
            Kind::Trabalho => "trabalho",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize, specta::Type)]
#[serde(rename_all = "snake_case")]
pub enum Phase {
    Focus,
    Break,
}

/// Tempos em segundos Unix.
#[derive(Clone, Copy, Debug, PartialEq, Default)]
pub enum Timer {
    #[default]
    Idle,
    Pomodoro { phase: Phase, subject_id: Option<i32>, started: i64, len: i64, break_len: i64 },
    Stopwatch { kind: Kind, subject_id: Option<i32>, started: i64 },
}

#[derive(Debug, PartialEq)]
pub enum Transition {
    FocusDone { subject_id: Option<i32>, started: i64, ended: i64 },
    BreakDone,
}

impl Timer {
    /// Avança o pomodoro se a fase venceu. Foco → pausa → parado.
    pub fn tick(&mut self, now: i64) -> Option<Transition> {
        let Timer::Pomodoro { phase, subject_id, started, len, break_len } = *self else {
            return None;
        };
        let end = started + len;
        if now < end {
            return None;
        }
        match phase {
            Phase::Focus => {
                *self = Timer::Pomodoro { phase: Phase::Break, subject_id, started: end, len: break_len, break_len };
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
        match *self {
            Timer::Idle => None,
            Timer::Pomodoro { phase, started, len, .. } => {
                let name = if phase == Phase::Focus { "Foco" } else { "Pausa" };
                Some(format!("{name} {}", clock(started + len - now)))
            }
            Timer::Stopwatch { kind, started, .. } => {
                let name = if kind == Kind::Estudo { "Estudo" } else { "Trabalho" };
                Some(format!("{name} {}", clock(now - started)))
            }
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
        Timer::Pomodoro { phase: Phase::Focus, subject_id: Some(7), started: 1000, len: 1500, break_len: 300 }
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
        let mut t = Timer::Stopwatch { kind: Kind::Trabalho, subject_id: None, started: 0 };
        assert_eq!(t.tick(100_000), None);
        assert_eq!(t.label(3725).as_deref(), Some("Trabalho 1:02:05"));
    }

    #[test]
    fn clock_format() {
        assert_eq!(clock(0), "00:00");
        assert_eq!(clock(59), "00:59");
        assert_eq!(clock(1500), "25:00");
        assert_eq!(clock(-5), "00:00");
    }
}
