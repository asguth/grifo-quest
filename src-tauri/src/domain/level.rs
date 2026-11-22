//! Curva de nível: alcançar o nível `n` exige `100 * (n-1)^1.5` XP acumulado.

use serde::Serialize;

#[derive(Debug, PartialEq, Serialize, specta::Type)]
pub struct LevelProgress {
    pub level: i32,
    /// XP acumulado dentro do nível atual.
    pub current: i32,
    /// XP que o nível atual exige até o próximo.
    pub needed: i32,
}

fn threshold(level: i32) -> i32 {
    (100.0 * f64::from(level - 1).powf(1.5)).round() as i32
}

pub fn progress(xp: i32) -> LevelProgress {
    let xp = xp.max(0);
    let mut level = 1;
    while threshold(level + 1) <= xp {
        level += 1;
    }
    let base = threshold(level);
    LevelProgress { level, current: xp - base, needed: threshold(level + 1) - base }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn curve() {
        assert_eq!(progress(0), LevelProgress { level: 1, current: 0, needed: 100 });
        assert_eq!(progress(99).level, 1);
        assert_eq!(progress(100), LevelProgress { level: 2, current: 0, needed: 183 });
        assert_eq!(progress(283).level, 3);
        assert_eq!(progress(-5).level, 1);
    }
}
