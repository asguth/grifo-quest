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

/// Como o ciclo anda (vem da configuração do pomodoro; durações em segundos).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Plan {
    pub focus: i64,
    pub short_break: i64,
    pub long_break: i64,
    /// Pausa longa a cada N focos (0 = nunca).
    pub long_every: i32,
    /// A pausa começa sozinha quando o foco acaba (senão espera "Continuar").
    pub auto_break: bool,
    /// O próximo foco começa sozinho quando a pausa acaba (senão espera).
    pub auto_focus: bool,
}

impl Default for Plan {
    fn default() -> Self {
        Self { focus: 1500, short_break: 300, long_break: 900, long_every: 4, auto_break: true, auto_focus: false }
    }
}

impl Plan {
    /// Pausa que vem depois do `done`-ésimo foco.
    fn break_after(&self, done: i32) -> (i64, bool) {
        let long = self.long_every > 0 && done > 0 && done % self.long_every == 0;
        (if long { self.long_break } else { self.short_break }, long)
    }
}

/// Tempos em segundos Unix. `paused_at`: pausado desde então (o relógio "congela" ali). Uma fase
/// que espera começar fica pausada no próprio início. `done`: focos concluídos nesta sequência.
#[derive(Clone, Copy, Debug, PartialEq, Default)]
pub enum Timer {
    #[default]
    Idle,
    Pomodoro { phase: Phase, subject_id: Option<i32>, started: i64, len: i64, plan: Plan, done: i32, long: bool, paused_at: Option<i64> },
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
    /// `long`: a pausa que vem é a longa. `cycle`: focos concluídos na sequência.
    FocusDone { subject_id: Option<i32>, started: i64, ended: i64, long: bool, cycle: i32 },
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

    /// Pomodoro novo, já contando.
    pub fn pomodoro(plan: Plan, subject_id: Option<i32>, now: i64) -> Timer {
        Timer::Pomodoro { phase: Phase::Focus, subject_id, started: now, len: plan.focus, plan, done: 0, long: false, paused_at: None }
    }

    /// Avança o pomodoro se a fase venceu: foco → pausa (curta ou longa) → foco → … até parar.
    /// Sem início automático, a fase seguinte fica esperando (pausada no próprio começo).
    pub fn tick(&mut self, now: i64) -> Option<Transition> {
        let Timer::Pomodoro { phase, subject_id, started, len, plan, done, paused_at: None, .. } = *self else {
            return None;
        };
        let end = started + len;
        if now < end {
            return None;
        }
        match phase {
            Phase::Focus => {
                let done = done + 1;
                let (blen, long) = plan.break_after(done);
                let paused_at = (!plan.auto_break).then_some(end);
                *self = Timer::Pomodoro { phase: Phase::Break, subject_id, started: end, len: blen, plan, done, long, paused_at };
                Some(Transition::FocusDone { subject_id, started, ended: end, long, cycle: done })
            }
            Phase::Break => {
                let paused_at = (!plan.auto_focus).then_some(end);
                *self = Timer::Pomodoro { phase: Phase::Focus, subject_id, started: end, len: plan.focus, plan, done, long: false, paused_at };
                Some(Transition::BreakDone)
            }
        }
    }

    /// Pula a fase atual e já começa a próxima. Pular o foco guarda o que foi estudado (sem o XP
    /// do pomodoro, como parar no meio) e não conta como foco concluído.
    pub fn skip(&mut self, now: i64) -> Option<Partial> {
        let Timer::Pomodoro { phase, subject_id, plan, done, .. } = *self else {
            return None;
        };
        let partial = if phase == Phase::Focus { self.stop(now) } else { None };
        *self = match phase {
            Phase::Focus => Timer::Pomodoro { phase: Phase::Break, subject_id, started: now, len: plan.short_break, plan, done, long: false, paused_at: None },
            Phase::Break => Timer::Pomodoro { phase: Phase::Focus, subject_id, started: now, len: plan.focus, plan, done, long: false, paused_at: None },
        };
        partial
    }

    /// Fase esperando o "Continuar" (ainda não começou a contar).
    pub fn waiting(&self) -> bool {
        matches!(*self, Timer::Pomodoro { started, paused_at: Some(p), .. } if p == started)
    }

    /// Texto curto para o tooltip da bandeja.
    pub fn label(&self, now: i64) -> Option<String> {
        let at = self.at(now);
        let mark = if self.paused() { " (pausado)" } else { "" };
        match *self {
            Timer::Idle => None,
            Timer::Pomodoro { phase, started, len, long, .. } => {
                let name = match (phase, long) {
                    (Phase::Focus, _) => "Foco",
                    (Phase::Break, true) => "Pausa longa",
                    (Phase::Break, false) => "Pausa",
                };
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
        Timer::pomodoro(Plan::default(), Some(7), 1000)
    }

    #[test]
    fn focus_then_break_then_waits_for_next_focus() {
        let mut t = pomodoro();
        assert_eq!(t.tick(2499), None);
        assert_eq!(t.tick(2500), Some(Transition::FocusDone { subject_id: Some(7), started: 1000, ended: 2500, long: false, cycle: 1 }));
        assert_eq!(t.label(2500).as_deref(), Some("Pausa 05:00"));
        assert_eq!(t.tick(2799), None);
        assert_eq!(t.tick(2800), Some(Transition::BreakDone));
        // sem início automático do foco: espera, pausado no começo
        assert!(t.waiting());
        assert_eq!(t.tick(99_999), None);
        assert_eq!(t.seconds(99_999), 1500);
        t.resume(5000);
        assert!(!t.waiting());
        assert!(matches!(t.tick(6500), Some(Transition::FocusDone { cycle: 2, .. })));
    }

    #[test]
    fn long_break_every_n_focus() {
        let plan = Plan { long_every: 2, auto_focus: true, ..Plan::default() };
        let mut t = Timer::pomodoro(plan, None, 0);
        assert!(matches!(t.tick(1500), Some(Transition::FocusDone { long: false, cycle: 1, .. })));
        assert_eq!(t.tick(1800), Some(Transition::BreakDone));
        assert!(matches!(t.tick(3300), Some(Transition::FocusDone { long: true, cycle: 2, .. })));
        assert_eq!(t.label(3300).as_deref(), Some("Pausa longa 15:00"));
        assert_eq!(t.tick(4199), None);
        assert_eq!(t.tick(4200), Some(Transition::BreakDone));
    }

    #[test]
    fn break_can_wait_to_start() {
        let plan = Plan { auto_break: false, ..Plan::default() };
        let mut t = Timer::pomodoro(plan, None, 0);
        assert!(t.tick(1500).is_some());
        assert!(t.waiting());
        assert_eq!(t.tick(9999), None, "pausa esperando não vence");
    }

    #[test]
    fn skip_focus_keeps_partial_and_starts_break() {
        let mut t = pomodoro();
        let p = t.skip(1600).unwrap();
        assert_eq!((p.started, p.ended), (1000, 1600));
        assert!(matches!(t, Timer::Pomodoro { phase: Phase::Break, started: 1600, len: 300, done: 0, .. }));
        assert_eq!(t.skip(1700), None);
        assert!(matches!(t, Timer::Pomodoro { phase: Phase::Focus, started: 1700, len: 1500, paused_at: None, .. }));
    }

    #[test]
    fn late_tick_records_planned_end() {
        // PC dormiu: o foco termina no horário previsto, não quando acordou.
        let mut t = pomodoro();
        assert!(matches!(t.tick(9999), Some(Transition::FocusDone { started: 1000, ended: 2500, .. })));
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
