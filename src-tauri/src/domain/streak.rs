//! Sequência de dias com escudo: 1 dia falhado por semana não quebra a sequência.
//! Dias são contados como "dias desde 1970-01-01" (horário local, calculado no SQLite).

use serde::Serialize;

#[derive(Debug, PartialEq, Serialize, specta::Type)]
pub struct Streak {
    pub days: i32,
    /// Escudo da semana atual ainda disponível.
    pub shield_available: bool,
}

/// Semana começando na segunda (1970-01-01 foi quinta).
fn week(day: i64) -> i64 {
    (day + 3).div_euclid(7)
}

/// `active` = dias que contaram (≥1 pomodoro ou ≥10 questões), em qualquer ordem.
/// Hoje ainda não feito não quebra nada: o dia não acabou.
pub fn compute(active: &[i64], today: i64) -> Streak {
    let set: std::collections::HashSet<i64> = active.iter().copied().collect();
    let first = active.iter().copied().min().unwrap_or(today);
    let mut used_shield_weeks = std::collections::HashSet::new();
    let mut days = 0;
    let mut d = if set.contains(&today) { today } else { today - 1 };

    while d >= first {
        if set.contains(&d) {
            days += 1;
        } else if used_shield_weeks.insert(week(d)) {
            // escudo da semana cobre a falta
        } else {
            break;
        }
        d -= 1;
    }
    Streak { days, shield_available: !used_shield_weeks.contains(&week(today)) }
}

#[cfg(test)]
mod tests {
    use super::*;

    // 2026-11-16 é segunda-feira = dia 20773
    const MON: i64 = 20773;

    #[test]
    fn plain_streak() {
        assert_eq!(compute(&[MON, MON + 1, MON + 2], MON + 2), Streak { days: 3, shield_available: true });
    }

    #[test]
    fn today_pending_keeps_streak() {
        assert_eq!(compute(&[MON, MON + 1], MON + 2).days, 2);
    }

    #[test]
    fn one_gap_per_week_is_shielded() {
        let s = compute(&[MON, MON + 2, MON + 3], MON + 3);
        assert_eq!(s, Streak { days: 3, shield_available: false });
    }

    #[test]
    fn two_gaps_same_week_break() {
        assert_eq!(compute(&[MON, MON + 3], MON + 3).days, 1);
    }

    #[test]
    fn gaps_in_different_weeks_ok() {
        // falta no domingo anterior (semana passada) e na quarta desta semana
        let s = compute(&[MON - 2, MON, MON + 1, MON + 3], MON + 3);
        assert_eq!(s.days, 4);
    }

    #[test]
    fn empty() {
        assert_eq!(compute(&[], MON).days, 0);
    }
}
