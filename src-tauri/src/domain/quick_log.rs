//! Parser do lançamento rápido: `30 15 lgpd fgv` → total, certas, matéria, banca.

#[derive(Debug, PartialEq)]
pub struct Parsed {
    pub total: i32,
    pub correct: i32,
    pub subject_index: usize,
    pub banca: Option<String>,
}

// ponytail: lista fixa de bancas; vira tabela editável se aparecer banca fora dela.
const BANCAS: &[&str] = &[
    "fgv", "cespe", "cebraspe", "fcc", "vunesp", "cesgranrio", "ibfc", "quadrix", "idecan",
    "aocp", "iades", "fundatec", "consulplan", "fepese", "ibade", "selecon", "esaf", "fumarc",
];

const STOPWORDS: &[&str] = &["de", "da", "do", "das", "dos", "e", "a", "o"];
const MIN_SCORE: f64 = 0.8;

pub fn parse(input: &str, subjects: &[String]) -> Result<Parsed, String> {
    let mut tokens = input.split_whitespace();
    let total = next_number(tokens.next(), "total de questões")?;
    let correct = next_number(tokens.next(), "número de certas")?;
    if total == 0 {
        return Err("Total precisa ser maior que zero".into());
    }
    if correct > total {
        return Err(format!("Certas ({correct}) maior que o total ({total})"));
    }

    let mut rest: Vec<&str> = tokens.collect();
    let banca = match rest.last() {
        Some(last) if rest.len() > 1 && BANCAS.contains(&fold(last).as_str()) => {
            rest.pop().map(|b| b.to_uppercase())
        }
        _ => None,
    };
    if rest.is_empty() {
        return Err("Faltou a matéria. Ex.: 30 15 lgpd fgv".into());
    }

    let query = rest.join(" ");
    let subject_index = best_subject(&query, subjects)
        .ok_or_else(|| format!("Nenhuma matéria parecida com \"{query}\""))?;
    Ok(Parsed { total, correct, subject_index, banca })
}

fn next_number(token: Option<&str>, what: &str) -> Result<i32, String> {
    token
        .and_then(|t| t.parse::<i32>().ok())
        .filter(|n| *n >= 0)
        .ok_or_else(|| format!("Faltou o {what}. Ex.: 30 15 lgpd fgv"))
}

fn best_subject(query: &str, subjects: &[String]) -> Option<usize> {
    subjects
        .iter()
        .enumerate()
        .map(|(i, name)| (i, score(query, name)))
        .filter(|(_, s)| *s >= MIN_SCORE)
        .max_by(|a, b| a.1.total_cmp(&b.1))
        .map(|(i, _)| i)
}

fn score(query: &str, name: &str) -> f64 {
    let (q, n) = (fold(query), fold(name));
    if q == n {
        return 1.0;
    }
    if n.starts_with(&q) {
        return 0.95;
    }
    let words: Vec<&str> = n.split_whitespace().filter(|w| !STOPWORDS.contains(w)).collect();
    let initials: String = words.iter().filter_map(|w| w.chars().next()).collect();
    if q == initials {
        return 0.93; // "lgpd" → "Lei Geral de Proteção de Dados"
    }
    if n.contains(&q) {
        return 0.9;
    }
    if words_are_prefixes(&q, &words) {
        return 0.88; // "dir adm" → "Direito Administrativo"
    }
    strsim::jaro_winkler(&q, &n) * 0.95
}

/// Cada palavra da busca é prefixo de uma palavra do nome, na ordem.
fn words_are_prefixes(q: &str, words: &[&str]) -> bool {
    let mut it = words.iter();
    q.split_whitespace().all(|qw| it.any(|w| w.starts_with(qw)))
}

/// Minúsculas sem acento.
fn fold(s: &str) -> String {
    s.to_lowercase()
        .chars()
        .map(|c| match c {
            'á' | 'à' | 'â' | 'ã' | 'ä' => 'a',
            'é' | 'è' | 'ê' | 'ë' => 'e',
            'í' | 'ì' | 'î' | 'ï' => 'i',
            'ó' | 'ò' | 'ô' | 'õ' | 'ö' => 'o',
            'ú' | 'ù' | 'û' | 'ü' => 'u',
            'ç' => 'c',
            other => other,
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn subjects() -> Vec<String> {
        ["LGPD", "Direito Constitucional", "Direito Administrativo", "Português", "Lei Geral de Proteção de Dados Pessoais"]
            .map(String::from)
            .to_vec()
    }

    #[test]
    fn full_line() {
        let p = parse("30 15 lgpd fgv", &subjects()).unwrap();
        assert_eq!(p, Parsed { total: 30, correct: 15, subject_index: 0, banca: Some("FGV".into()) });
    }

    #[test]
    fn without_banca_and_accents() {
        let p = parse("20 18 portugues", &subjects()).unwrap();
        assert_eq!((p.subject_index, p.banca), (3, None));
    }

    #[test]
    fn initials_word_prefixes_and_typos() {
        let only_long = vec!["Lei Geral de Proteção de Dados".to_string()];
        assert_eq!(parse("10 5 lgpd", &only_long).unwrap().subject_index, 0);
        assert_eq!(parse("10 5 dir adm cespe", &subjects()).unwrap().subject_index, 2);
        assert_eq!(parse("10 5 constitucional", &subjects()).unwrap().subject_index, 1);
        assert_eq!(parse("10 5 portuges", &subjects()).unwrap().subject_index, 3);
    }

    #[test]
    fn lone_banca_token_is_treated_as_subject() {
        assert!(parse("10 5 fgv", &subjects()).is_err());
    }

    #[test]
    fn errors() {
        for bad in ["", "30", "10 15 lgpd", "0 0 lgpd", "10 5", "10 5 astronomia", "-3 1 lgpd"] {
            assert!(parse(bad, &subjects()).is_err(), "{bad:?} deveria falhar");
        }
    }
}
