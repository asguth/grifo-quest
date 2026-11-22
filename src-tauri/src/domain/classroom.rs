//! Sala de aula: 6 alunos sem conhecimento prévio + avaliador oculto que aponta onde a explicação foi fraca.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "snake_case")]
pub enum Student {
    Curioso,
    Literal,
    Confuso,
    Advogado,
    Pragmatico,
    Timido,
}

pub const STUDENTS: [Student; 6] =
    [Student::Curioso, Student::Literal, Student::Confuso, Student::Advogado, Student::Pragmatico, Student::Timido];

impl Student {
    pub fn name(self) -> &'static str {
        match self {
            Student::Curioso => "Caio, o Curioso",
            Student::Literal => "Lia, a Literal",
            Student::Confuso => "Cadu, o Confuso",
            Student::Advogado => "Diana, a Advogada do Diabo",
            Student::Pragmatico => "Pedro, o Pragmático",
            Student::Timido => "Tina, a Tímida",
        }
    }

    pub fn persona(self) -> &'static str {
        match self {
            Student::Curioso => "Você pergunta sempre 'por quê?', puxando a causa por trás do que o professor disse.",
            Student::Literal => "Você só entende com exemplo concreto do dia a dia; peça um exemplo específico.",
            Student::Confuso => {
                "Você mistura o conceito explicado com um conceito vizinho parecido e pede para o professor diferenciar."
            }
            Student::Advogado => "Você procura exceções e casos de borda: 'e se...?', 'sempre? nunca tem exceção?'.",
            Student::Pragmatico => "Você quer saber como isso cai na prova e qual pegadinha a banca costuma usar.",
            Student::Timido => "Você fala pouco; pede para o professor resumir a ideia principal em uma frase.",
        }
    }
}

/// Saída do avaliador oculto. Cada item é um TEMA curto, sem a resposta.
#[derive(Debug, Default, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(default)]
pub struct Evaluation {
    pub cobertos: Vec<String>,
    pub omitidos: Vec<String>,
    pub erros: Vec<String>,
    pub rasos: Vec<String>,
}

/// Nota 0–100: coberto vale 1, raso vale meio, omitido e erro valem 0.
pub fn coverage(e: &Evaluation) -> f64 {
    let ok = e.cobertos.len() as f64 + e.rasos.len() as f64 * 0.5;
    let all = (e.cobertos.len() + e.rasos.len() + e.omitidos.len() + e.erros.len()) as f64;
    if all == 0.0 { 0.0 } else { (100.0 * ok / all).round() }
}

/// Orquestrador: escolhe quem pergunta e sobre qual lacuna.
/// Erro → quem força a diferenciar; omissão → quem puxa o porquê/prova; raso → quem pede exemplo/resumo.
/// Nunca o mesmo aluno duas vezes seguidas.
pub fn next_turn(e: &Evaluation, last: Option<Student>, turn: usize) -> (Student, Option<String>) {
    let candidates: [(&[String], [Student; 2]); 3] = [
        (&e.erros, [Student::Confuso, Student::Advogado]),
        (&e.omitidos, [Student::Curioso, Student::Pragmatico]),
        (&e.rasos, [Student::Literal, Student::Timido]),
    ];
    for (gaps, pair) in candidates {
        if let Some(gap) = gaps.get(turn % gaps.len().max(1)) {
            let who = if Some(pair[0]) == last { pair[1] } else { pair[0] };
            return (who, Some(gap.clone()));
        }
    }
    // Sem lacunas: roda a sala para manter o professor falando.
    let mut who = STUDENTS[turn % STUDENTS.len()];
    if Some(who) == last {
        who = STUDENTS[(turn + 1) % STUDENTS.len()];
    }
    (who, None)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn eval(c: usize, r: usize, o: usize, er: usize) -> Evaluation {
        let v = |n: usize, p: &str| (0..n).map(|i| format!("{p}{i}")).collect();
        Evaluation { cobertos: v(c, "c"), rasos: v(r, "r"), omitidos: v(o, "o"), erros: v(er, "e") }
    }

    #[test]
    fn coverage_score() {
        assert_eq!(coverage(&eval(3, 2, 1, 0)), 67.0);
        assert_eq!(coverage(&eval(4, 0, 0, 0)), 100.0);
        assert_eq!(coverage(&Evaluation::default()), 0.0);
    }

    #[test]
    fn errors_come_first() {
        let (who, hint) = next_turn(&eval(1, 1, 1, 1), None, 0);
        assert_eq!((who, hint.as_deref()), (Student::Confuso, Some("e0")));
    }

    #[test]
    fn no_repeat_student() {
        let (who, _) = next_turn(&eval(0, 0, 2, 0), Some(Student::Curioso), 1);
        assert_eq!(who, Student::Pragmatico);
    }

    #[test]
    fn rotates_without_gaps() {
        let (a, hint) = next_turn(&eval(2, 0, 0, 0), None, 0);
        assert_eq!((a, hint), (Student::Curioso, None));
        let (b, _) = next_turn(&eval(2, 0, 0, 0), Some(Student::Literal), 1);
        assert_eq!(b, Student::Confuso);
    }
}
