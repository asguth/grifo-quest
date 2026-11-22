//! Tabela de XP: todo valor que credita XP mora aqui.

pub const POMODORO: i32 = 10;
pub const CLASS: i32 = 30;
pub const MISSION_QUESTIONS: i32 = 30;
pub const MISSION_POMODOROS: i32 = 20;

/// Cada questão vale 1, cada acerto mais 2.
pub fn for_questions(total: i32, correct: i32) -> i32 {
    total + correct * 2
}
