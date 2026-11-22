//! Regras puras da sessão de estudo: questões geradas, caderno de erros, repetição espaçada
//! dos flashcards, ranking de pontos fracos, composição da sessão e ciclo de estudos.

use serde::{Deserialize, Serialize};

use super::text::fold;

// ---------- questões ----------

wire_enum! {
    /// C/E (Cebraspe) ou múltipla escolha A–E.
    pub enum QuestionFormat {
        Ce = "ce",
        Ae = "ae",
    }
}

/// Letra da alternativa `i` (0 = A).
pub fn letter(i: usize) -> char {
    char::from(b'A' + (i as u8))
}

/// Posição da alternativa pela letra do gabarito ("B" = 1).
pub fn letter_index(key: &str) -> Option<usize> {
    let b = *key.trim().as_bytes().first()?;
    (b'A'..=b'E').contains(&b).then(|| usize::from(b - b'A'))
}

/// Formato pela banca. `None` = misto (banca indefinida: metade de cada).
pub fn format_for(banca: Option<&str>) -> Option<QuestionFormat> {
    let b = fold(banca?);
    if b.is_empty() || b.contains("indefinid") {
        None
    } else if b.contains("cebraspe") || b.contains("cespe") {
        Some(QuestionFormat::Ce)
    } else {
        Some(QuestionFormat::Ae)
    }
}

/// Como o modelo devolve (pedimos esses nomes em pt-BR).
#[derive(Debug, Deserialize)]
pub struct GeneratedQuestion {
    #[serde(default)]
    pub enunciado: String,
    #[serde(default)]
    pub alternativas: Vec<String>,
    #[serde(default)]
    pub gabarito: String,
    #[serde(default)]
    pub comentario: String,
    #[serde(default)]
    pub dificuldade: Option<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct NewQuestion {
    pub format: QuestionFormat,
    pub statement: String,
    pub options: Vec<String>,
    /// "C"/"E" ou "A".."E".
    pub answer: String,
    pub explanation: String,
    pub difficulty: Option<String>,
}

/// Valida e normaliza uma questão gerada. `None` = descartar (incompleta ou incoerente).
pub fn validate(q: GeneratedQuestion) -> Option<NewQuestion> {
    let statement = q.enunciado.trim().to_string();
    let explanation = q.comentario.trim().to_string();
    if statement.chars().count() < 15 || explanation.is_empty() {
        return None;
    }
    let raw = q.gabarito.trim().to_uppercase();
    let options: Vec<String> = q.alternativas.iter().map(|o| strip_letter(o)).filter(|o| !o.is_empty()).collect();
    let difficulty = q.dificuldade.map(|d| fold(&d)).filter(|d| ["facil", "media", "dificil"].contains(&d.as_str()));

    if options.is_empty() {
        let answer = match raw.as_str() {
            "C" | "CERTO" | "CERTA" | "V" | "VERDADEIRO" => "C",
            "E" | "ERRADO" | "ERRADA" | "F" | "FALSO" => "E",
            _ => return None,
        };
        return Some(NewQuestion { format: QuestionFormat::Ce, statement, options, answer: answer.into(), explanation, difficulty });
    }
    if !(4..=5).contains(&options.len()) {
        return None;
    }
    // "B", "Letra B", "(b)", "alternativa B": a letra isolada de A a E.
    let letter = raw
        .split(|c: char| !c.is_ascii_alphanumeric())
        .find(|t| t.len() == 1 && ('A'..='E').contains(&t.chars().next().unwrap_or(' ')))?
        .chars()
        .next()?;
    let idx = letter_index(&letter.to_string())?;
    if idx >= options.len() {
        return None;
    }
    Some(NewQuestion { format: QuestionFormat::Ae, statement, options, answer: letter.to_string(), explanation, difficulty })
}

/// Tira "A) ", "b. ", "(C) " do começo da alternativa.
fn strip_letter(s: &str) -> String {
    let t = s.trim();
    let mut chars = t.char_indices();
    let rest = match (chars.next(), chars.next()) {
        (Some((_, '(')), Some((_, l))) if l.is_ascii_alphabetic() && t[2..].starts_with(')') => &t[3..],
        (Some((_, l)), Some((i, sep))) if l.is_ascii_alphabetic() && matches!(sep, ')' | '.' | '-' | ':') => &t[i + 1..],
        _ => t,
    };
    rest.trim().to_string()
}

/// Impressão digital do enunciado (sem acento/caixa/espaço) para não guardar a mesma questão duas vezes.
pub fn fingerprint(statement: &str) -> String {
    // FNV-1a 64: estável entre versões (o Hasher da std não garante isso).
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for b in fold(statement).bytes() {
        h ^= u64::from(b);
        h = h.wrapping_mul(0x0100_0000_01b3);
    }
    format!("{h:016x}")
}

// ---------- caderno de erros ----------

/// Próximo estado de uma questão no caderno de erros: errou → volta amanhã; acertou → 3 dias, 7 dias,
/// e sai do caderno no terceiro acerto seguido. `None` = saiu.
pub fn next_error(streak: i32, correct: bool) -> Option<(i32, i32)> {
    if !correct {
        return Some((0, 1));
    }
    match streak {
        0 => Some((1, 3)),
        1 => Some((2, 7)),
        _ => None,
    }
}

// ---------- flashcards (SM-2 simplificado) ----------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "snake_case")]
pub enum Grade {
    Again,
    Hard,
    Good,
    Easy,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct CardState {
    pub ease: f64,
    pub interval_days: i32,
    pub reps: i32,
}

/// Intervalos mais curtos que o Anki padrão: prova de concurso cobra detalhe, revisão frequente compensa.
pub fn review(card: CardState, grade: Grade) -> CardState {
    let CardState { ease, interval_days: prev, reps } = card;
    let (ease, interval, reps) = match grade {
        Grade::Again => (ease - 0.2, 1, 0),
        Grade::Hard => (ease - 0.15, ((f64::from(prev) * 1.2).round() as i32).max(1), reps + 1),
        Grade::Good => (ease, if reps == 0 { 2 } else { (f64::from(prev) * ease).round() as i32 }, reps + 1),
        Grade::Easy => (ease + 0.15, if reps == 0 { 4 } else { (f64::from(prev) * ease * 1.3).round() as i32 }, reps + 1),
    };
    CardState { ease: ease.clamp(1.3, 3.0), interval_days: interval.clamp(1, 365), reps }
}

/// Cartões da tabela `| Frente | Verso |` que o Grifo gera (mesma regra do parser do front).
pub fn parse_cards(markdown: &str) -> Vec<(String, String)> {
    let strip = |s: &str| s.replace("**", "").replace("<br>", "
").replace("<br/>", "
").trim().to_string();
    markdown
        .lines()
        .map(str::trim)
        .filter(|l| l.starts_with('|'))
        .filter_map(|l| {
            let cells: Vec<&str> = l.trim_matches('|').split('|').map(str::trim).collect();
            let (front, back) = (*cells.first()?, *cells.get(1)?);
            let is_rule = |c: &str| !c.is_empty() && c.chars().all(|ch| matches!(ch, '-' | ':'));
            (!front.is_empty() && !back.is_empty() && !is_rule(front) && !front.eq_ignore_ascii_case("frente"))
                .then(|| (strip(front), strip(back)))
        })
        .collect()
}

// ---------- pontos fracos ----------

#[derive(Debug, Clone)]
pub struct TopicStats {
    pub subject_weight: f64,
    /// (idade em dias, acertou) de cada resposta no tópico.
    pub answers: Vec<(f64, bool)>,
    pub days_since_seen: Option<f64>,
    pub errors_due: i32,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, specta::Type)]
#[serde(rename_all = "snake_case")]
pub enum Trend {
    Melhorando,
    Piorando,
    Estavel,
    SemDados,
}

/// Taxa de erro ponderada pela idade (meia-vida de 14 dias), suavizada com um "chute" de 50%
/// para tópico com pouca resposta não parecer perfeito nem péssimo.
pub fn error_rate(answers: &[(f64, bool)]) -> f64 {
    let (mut wrong, mut total) = (0.5, 1.0);
    for &(age, ok) in answers {
        let w = 0.5f64.powf(age.max(0.0) / 14.0);
        total += w;
        if !ok {
            wrong += w;
        }
    }
    wrong / total
}

/// Quanto o tópico precisa de treino agora: erra muito × pesa no edital × está esquecido × tem erro vencido.
pub fn weakness(s: &TopicStats) -> f64 {
    let forget = match s.days_since_seen {
        Some(d) => 1.0 + d.min(30.0) / 30.0,
        None => 1.5,
    };
    error_rate(&s.answers) * s.subject_weight.max(0.25).sqrt() * forget * (1.0 + 0.5 * f64::from(s.errors_due.min(4)))
}

/// Últimos 7 dias × 8–30 dias atrás (precisa de 3 respostas em cada janela).
pub fn trend(answers: &[(f64, bool)]) -> Trend {
    let acc = |w: Vec<bool>| (w.len() >= 3).then(|| w.iter().filter(|&&ok| ok).count() as f64 / w.len() as f64);
    let recent = acc(answers.iter().filter(|a| a.0 < 7.0).map(|a| a.1).collect());
    let before = acc(answers.iter().filter(|a| (7.0..30.0).contains(&a.0)).map(|a| a.1).collect());
    match (recent, before) {
        (Some(r), Some(b)) if r - b >= 0.1 => Trend::Melhorando,
        (Some(r), Some(b)) if b - r >= 0.1 => Trend::Piorando,
        (Some(_), Some(_)) => Trend::Estavel,
        _ => Trend::SemDados,
    }
}

// ---------- composição da sessão ----------

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Slot {
    /// Questão do caderno de erros (id da questão).
    Error(i32),
    /// Questão nova (ou não vista há tempo) deste tópico.
    Topic(i32),
}

/// Monta `n` vagas: até `max_errors` do caderno de erros vencido e o resto distribuído entre os
/// `top` tópicos de maior peso, proporcional ao peso (maiores restos), cada um com pelo menos 1.
pub fn compose(errors_due: &[i32], ranked: &[(i32, f64)], n: usize, max_errors: usize, top: usize) -> Vec<Slot> {
    let mut out: Vec<Slot> = errors_due.iter().take(max_errors.min(n)).map(|&q| Slot::Error(q)).collect();
    let left = n - out.len();
    let picks: Vec<(i32, f64)> = ranked.iter().filter(|t| t.1 > 0.0).take(top.min(left)).copied().collect();
    if picks.is_empty() {
        return out;
    }
    let sum: f64 = picks.iter().map(|t| t.1).sum();
    let extra = left - picks.len();
    let raw: Vec<f64> = picks.iter().map(|t| t.1 / sum * extra as f64).collect();
    let mut counts: Vec<usize> = raw.iter().map(|r| 1 + r.floor() as usize).collect();
    let mut rest: Vec<usize> = (0..picks.len()).collect();
    rest.sort_by(|&a, &b| (raw[b] - raw[b].floor()).total_cmp(&(raw[a] - raw[a].floor())));
    let missing = left - counts.iter().sum::<usize>();
    for &i in rest.iter().take(missing) {
        counts[i] += 1;
    }
    for (t, c) in picks.iter().zip(counts) {
        out.extend(std::iter::repeat_n(Slot::Topic(t.0), c));
    }
    out
}

// ---------- ciclo de estudos ----------

/// Próxima matéria do ciclo: a que está mais atrás da fatia de tempo que o peso dela merece (últimos 7 dias).
pub fn cycle_next(subjects: &[(i32, f64, f64)]) -> Option<i32> {
    let total_w: f64 = subjects.iter().map(|s| s.1.max(0.0)).sum();
    let total_m: f64 = subjects.iter().map(|s| s.2.max(0.0)).sum();
    if total_w <= 0.0 {
        return None;
    }
    subjects
        .iter()
        .map(|&(id, w, m)| {
            let time_share = if total_m > 0.0 { m / total_m } else { 0.0 };
            (id, w.max(0.0) / total_w - time_share)
        })
        .max_by(|a, b| a.1.total_cmp(&b.1))
        .map(|t| t.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn q(e: &str, alts: &[&str], g: &str) -> GeneratedQuestion {
        GeneratedQuestion { enunciado: e.into(), alternativas: alts.iter().map(|s| s.to_string()).collect(), gabarito: g.into(), comentario: "porque sim".into(), dificuldade: Some("Média".into()) }
    }

    #[test]
    fn validates_ce_and_ae() {
        let ce = validate(q("A LGPD se aplica a dados anonimizados.", &[], "Errado")).unwrap();
        assert_eq!((ce.format, ce.answer.as_str()), (QuestionFormat::Ce, "E"));
        assert_eq!(ce.difficulty.as_deref(), Some("media"));

        let ae = validate(q("Qual o prazo do recurso administrativo?", &["A) 5 dias", "B) 10 dias", "(C) 15 dias", "d. 30 dias"], "letra b")).unwrap();
        assert_eq!(ae.options, vec!["5 dias", "10 dias", "15 dias", "30 dias"]);
        assert_eq!(ae.answer, "B");

        assert!(validate(q("Qual o prazo do recurso administrativo?", &["A) 5", "B) 10", "C) 15", "D) 30"], "E")).is_none(), "gabarito fora");
        assert!(validate(q("curto", &[], "C")).is_none());
        assert!(validate(q("A LGPD se aplica a dados anonimizados.", &[], "talvez")).is_none());
    }

    #[test]
    fn parses_card_table() {
        let md = "# Cartões
| Frente | Verso |
|---|:--:|
| Prazo? | **10 dias**<br>art. 59 |
| só uma |
";
        assert_eq!(parse_cards(md), vec![("Prazo?".to_string(), "10 dias
art. 59".to_string())]);
    }

    #[test]
    fn format_by_banca() {
        assert_eq!(format_for(Some("CEBRASPE")), Some(QuestionFormat::Ce));
        assert_eq!(format_for(Some("FGV")), Some(QuestionFormat::Ae));
        assert_eq!(format_for(None), None);
        assert_eq!(format_for(Some("Indefinida")), None);
    }

    #[test]
    fn fingerprint_ignores_case_accents_and_spaces() {
        assert_eq!(fingerprint("Prazo  de RECURSO é?"), fingerprint("prazo de recurso e?"));
        assert_ne!(fingerprint("prazo de recurso"), fingerprint("prazo de defesa"));
    }

    #[test]
    fn error_book_needs_three_hits_in_a_row() {
        assert_eq!(next_error(0, false), Some((0, 1)));
        assert_eq!(next_error(0, true), Some((1, 3)));
        assert_eq!(next_error(1, true), Some((2, 7)));
        assert_eq!(next_error(2, true), None);
        assert_eq!(next_error(2, false), Some((0, 1)), "errou de novo: recomeça");
    }

    #[test]
    fn srs_grows_and_resets() {
        let new = CardState { ease: 2.5, interval_days: 0, reps: 0 };
        let good = review(new, Grade::Good);
        assert_eq!((good.interval_days, good.reps), (2, 1));
        let good2 = review(good, Grade::Good);
        assert_eq!(good2.interval_days, 5);
        let again = review(good2, Grade::Again);
        assert_eq!((again.interval_days, again.reps), (1, 0));
        assert!((again.ease - 2.3).abs() < 1e-9);
        assert_eq!(review(CardState { ease: 1.3, interval_days: 1, reps: 3 }, Grade::Hard).ease, 1.3, "piso");
    }

    #[test]
    fn weakness_prefers_errors_weight_and_forgetting() {
        let base = TopicStats { subject_weight: 1.0, answers: vec![(1.0, true); 10], days_since_seen: Some(1.0), errors_due: 0 };
        let bad = TopicStats { answers: vec![(1.0, false); 10], ..base.clone() };
        let heavy = TopicStats { subject_weight: 9.0, ..bad.clone() };
        let forgotten = TopicStats { days_since_seen: Some(30.0), ..bad.clone() };
        assert!(weakness(&bad) > weakness(&base));
        assert!(weakness(&heavy) > weakness(&bad));
        assert!(weakness(&forgotten) > weakness(&bad));
        // erro antigo pesa menos que erro recente
        assert!(error_rate(&[(60.0, false), (0.0, true)]) < error_rate(&[(0.0, false), (60.0, true)]));
    }

    #[test]
    fn trend_needs_data_in_both_windows() {
        let mut a = vec![(1.0, true); 4];
        a.extend(vec![(10.0, false); 4]);
        assert_eq!(trend(&a), Trend::Melhorando);
        assert_eq!(trend(&[(1.0, true), (2.0, true)]), Trend::SemDados);
    }

    #[test]
    fn compose_fills_exactly_n() {
        let s = compose(&[100, 101, 102, 103], &[(1, 3.0), (2, 1.0), (3, 0.0)], 10, 2, 5);
        assert_eq!(s.len(), 10);
        assert_eq!(&s[..2], &[Slot::Error(100), Slot::Error(101)]);
        let t1 = s.iter().filter(|x| **x == Slot::Topic(1)).count();
        let t2 = s.iter().filter(|x| **x == Slot::Topic(2)).count();
        assert_eq!((t1, t2), (6, 2), "proporcional ao peso; tópico com peso 0 fica de fora");
        assert_eq!(compose(&[], &[], 5, 2, 3), vec![]);
        assert_eq!(compose(&[], &[(7, 1.0)], 3, 0, 3), vec![Slot::Topic(7); 3]);
    }

    #[test]
    fn cycle_picks_most_behind() {
        // A pesa 3x mais mas já teve quase todo o tempo; B ficou para trás.
        assert_eq!(cycle_next(&[(1, 3.0, 300.0), (2, 1.0, 0.0)]), Some(2));
        assert_eq!(cycle_next(&[(1, 3.0, 0.0), (2, 1.0, 0.0)]), Some(1));
        assert_eq!(cycle_next(&[]), None);
    }
}
