//! Missões diárias: questões nas matérias mais fracas × mais pesadas, mais uma de pomodoros.

wire_enum! {
    pub enum MissionKind {
        Questoes = "questoes",
        Pomodoros = "pomodoros",
    }
}

#[derive(Debug, PartialEq)]
pub struct SubjectScore {
    pub id: i32,
    pub name: String,
    pub weight: f64,
    /// Fração de acertos 0..1 nos últimos 30 dias; `None` = sem dados.
    pub accuracy: Option<f64>,
}

#[derive(Debug, PartialEq)]
pub struct Draft {
    pub kind: MissionKind,
    pub subject_id: Option<i32>,
    pub description: String,
    pub target: i32,
    pub xp_reward: i32,
}

/// Metas do perfil: questões por dia (divididas entre as 2 matérias que mais precisam) e horas de estudo.
#[derive(Debug, Clone, Copy)]
pub struct Goals {
    pub daily_questions: i32,
    pub hours_per_day: f64,
}

impl Goals {
    /// Pomodoro + pausa ≈ 50 min: 2 h por dia ≈ 2 pomodoros "de verdade" de foco profundo.
    fn pomodoros(self) -> i32 {
        ((self.hours_per_day * 60.0 / 50.0).round() as i32).clamp(1, 12)
    }
}

pub fn generate(subjects: &[SubjectScore], goals: Goals) -> Vec<Draft> {
    let mut ranked: Vec<&SubjectScore> = subjects.iter().collect();
    // Sem dado conta como 50%: matéria nova também entra na roda.
    let need = |s: &SubjectScore| s.weight * (1.0 - s.accuracy.unwrap_or(0.5));
    ranked.sort_by(|a, b| need(b).total_cmp(&need(a)));

    let picked = ranked.len().min(2) as i32;
    // Arredonda pra cima: meta 25 em 2 matérias vira 13 + 13, nunca menos que o combinado.
    let per = if picked > 0 { (goals.daily_questions.max(1) + picked - 1) / picked } else { 0 };
    let mut out: Vec<Draft> = ranked
        .iter()
        .take(2)
        .map(|s| Draft {
            kind: MissionKind::Questoes,
            subject_id: Some(s.id),
            description: format!("Faça {per} questões de {}", s.name),
            target: per,
            xp_reward: super::xp::MISSION_QUESTIONS,
        })
        .collect();
    let pomodoros = goals.pomodoros();
    out.push(Draft {
        kind: MissionKind::Pomodoros,
        subject_id: None,
        description: format!("Conclua {pomodoros} pomodoro{}", if pomodoros > 1 { "s" } else { "" }),
        target: pomodoros,
        xp_reward: super::xp::MISSION_POMODOROS,
    });
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn s(id: i32, weight: f64, accuracy: Option<f64>) -> SubjectScore {
        SubjectScore { id, name: format!("M{id}"), weight, accuracy }
    }

    const G: Goals = Goals { daily_questions: 20, hours_per_day: 2.0 };

    #[test]
    fn picks_weakest_heaviest() {
        let m = generate(&[s(1, 1.0, Some(0.9)), s(2, 3.0, Some(0.5)), s(3, 2.0, Some(0.2)), s(4, 1.0, None)], G);
        let ids: Vec<_> = m.iter().map(|d| d.subject_id).collect();
        assert_eq!(ids, vec![Some(3), Some(2), None]);
    }

    #[test]
    fn no_subjects_only_pomodoro() {
        let m = generate(&[], G);
        assert_eq!(m.len(), 1);
        assert_eq!(m[0].kind, MissionKind::Pomodoros);
    }

    #[test]
    fn splits_daily_goal_and_scales_pomodoros() {
        let m = generate(&[s(1, 1.0, None), s(2, 1.0, None)], Goals { daily_questions: 25, hours_per_day: 4.0 });
        assert_eq!(m.iter().map(|d| d.target).collect::<Vec<_>>(), vec![13, 13, 5]);
        let one = generate(&[s(1, 1.0, None)], Goals { daily_questions: 30, hours_per_day: 0.25 });
        assert_eq!(one.iter().map(|d| d.target).collect::<Vec<_>>(), vec![30, 1]);
    }
}
