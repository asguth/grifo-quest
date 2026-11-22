//! Revisão espaçada da sala de aula: a aula volta em 1, 7 e 30 dias.

const STEPS: [i32; 3] = [1, 7, 30];
const PASSING: f64 = 60.0;

/// Próximo intervalo em dias. Nota abaixo de 60 reinicia em 1 dia.
/// `None` = ciclo concluído (passou na revisão de 30 dias).
pub fn next_interval(previous: Option<i32>, score: f64) -> Option<i32> {
    if score < PASSING {
        return Some(STEPS[0]);
    }
    match previous {
        None => Some(STEPS[0]),
        Some(p) => STEPS.iter().copied().find(|s| *s > p),
    }
}

#[cfg(test)]
mod tests {
    use super::next_interval;

    #[test]
    fn ladder() {
        assert_eq!(next_interval(None, 80.0), Some(1));
        assert_eq!(next_interval(Some(1), 80.0), Some(7));
        assert_eq!(next_interval(Some(7), 80.0), Some(30));
        assert_eq!(next_interval(Some(30), 80.0), None);
    }

    #[test]
    fn low_score_resets() {
        assert_eq!(next_interval(Some(7), 40.0), Some(1));
        assert_eq!(next_interval(None, 10.0), Some(1));
    }
}
