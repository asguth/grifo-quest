//! Edital verticalizado: montagem do plano de matérias
//! (a partir do texto do edital, fatiado para caber no contexto do modelo local).

use serde::{Deserialize, Serialize};

use super::text::fold;

/// Uma matéria proposta (ainda não salva): o usuário revisa antes de aplicar.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
pub struct PlanSubject {
    pub name: String,
    /// Peso no edital (nº de questões ou peso declarado). 1 quando não se sabe.
    pub weight: f64,
    pub topics: Vec<String>,
}

/// Do "conteúdo programático" em diante (é onde estão matérias e tópicos). Sem o título, o texto todo.
pub fn program_section(text: &str) -> &str {
    // Texto normalizado caractere a caractere + de onde cada um veio no original.
    let (norm, origin): (String, Vec<usize>) = text
        .char_indices()
        .map(|(i, c)| (fold(&c.to_string()).chars().next().unwrap_or(' '), i))
        .unzip();
    ["conteudo programatico", "conteudos programaticos", "objetos de avaliacao", "conhecimentos basicos"]
        .iter()
        .find_map(|k| norm.find(k))
        .map_or(text, |byte| &text[origin[norm[..byte].chars().count()]..])
}

/// Fatias de até `max_chars`, cortando em quebra de linha.
pub fn chunks(text: &str, max_chars: usize) -> Vec<&str> {
    let mut out = Vec::new();
    let mut rest = text.trim();
    while !rest.is_empty() {
        if rest.chars().count() <= max_chars {
            out.push(rest);
            break;
        }
        let limit = rest.char_indices().nth(max_chars).map_or(rest.len(), |(i, _)| i);
        let cut = rest[..limit].rfind('\n').filter(|&i| i > limit / 2).unwrap_or(limit);
        out.push(rest[..cut].trim());
        rest = rest[cut..].trim_start();
    }
    out
}

/// Junta os pedaços (a mesma matéria pode aparecer em duas fatias) e limpa: tira vazios e
/// repetidos, corta pontuação de lista ("1.2 ", "- ", ";") e limita o tamanho.
pub fn merge(parts: Vec<PlanSubject>) -> Vec<PlanSubject> {
    let mut out: Vec<PlanSubject> = Vec::new();
    for p in parts {
        let name = clean_item(&p.name);
        if name.is_empty() {
            continue;
        }
        let idx = match out.iter().position(|s| subject_key(&s.name) == subject_key(&name)) {
            Some(i) => i,
            None => {
                out.push(PlanSubject { name, weight: 1.0, topics: Vec::new() });
                out.len() - 1
            }
        };
        let s = &mut out[idx];
        if p.weight > 0.0 && p.weight.is_finite() {
            s.weight = s.weight.max(p.weight.min(100.0));
        }
        for t in p.topics {
            let t = clean_item(&t);
            if !t.is_empty() && t.chars().count() <= 200 && !s.topics.iter().any(|x| fold(x) == fold(&t)) && s.topics.len() < 80 {
                s.topics.push(t);
            }
        }
    }
    out
}

/// Chave para juntar a mesma matéria escrita de jeitos diferentes: sem acento/caixa, sem "Noções de"
/// e com os sinônimos comuns de edital ("Português" = "Língua Portuguesa", "RLM" = "Raciocínio Lógico").
pub fn subject_key(name: &str) -> String {
    let mut k = fold(name).replace(['-', '–', '/'], " ");
    for prefix in ["nocoes basicas de ", "nocoes de ", "conhecimentos de ", "conhecimentos basicos de "] {
        if let Some(rest) = k.strip_prefix(prefix) {
            k = rest.to_string();
        }
    }
    let k = k.split_whitespace().collect::<Vec<_>>().join(" ");
    const SYNONYMS: [(&str, &[&str]); 5] = [
        ("lingua portuguesa", &["portugues", "lingua portuguesa", "lp", "gramatica e interpretacao de textos"]),
        ("lingua inglesa", &["ingles", "lingua inglesa", "lingua estrangeira ingles"]),
        ("raciocinio logico", &["raciocinio logico", "rlm", "raciocinio logico matematico", "raciocinio logico e matematico", "logica"]),
        ("informatica", &["informatica", "nocoes de informatica", "tecnologia da informacao basica"]),
        ("lgpd", &["lgpd", "lei geral de protecao de dados", "lei geral de protecao de dados pessoais", "protecao de dados pessoais"]),
    ];
    SYNONYMS.iter().find(|(_, all)| all.contains(&k.as_str())).map_or(k.clone(), |(canon, _)| (*canon).to_string())
}

fn clean_item(s: &str) -> String {
    let t = s.trim().trim_start_matches(|c: char| c.is_ascii_digit() || matches!(c, '.' | ')' | '-' | '–' | '•' | '*' | ' '));
    t.trim().trim_end_matches(['.', ';', ',', ':']).trim().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_accents_and_spaces() {
    }

    #[test]
    fn finds_program_section_even_with_accents() {
        let t = "Capítulo 1 — inscrições...\n\nANEXO II – CONTEÚDO PROGRAMÁTICO\nLÍNGUA PORTUGUESA: 1 Compreensão.";
        assert!(program_section(t).starts_with("CONTEÚDO PROGRAMÁTICO"));
        assert_eq!(program_section("sem título"), "sem título");
    }

    #[test]
    fn chunks_on_line_breaks_and_cover_everything() {
        let text = "linha um\nlinha dois\nlinha três\nlinha quatro";
        let parts = chunks(text, 20);
        assert!(parts.iter().all(|p| p.chars().count() <= 20));
        assert_eq!(parts.join(" ").split_whitespace().count(), text.split_whitespace().count());
        assert_eq!(chunks("", 10), Vec::<&str>::new());
    }

    #[test]
    fn merges_same_subject_across_chunks() {
        let p = |n: &str, w: f64, t: &[&str]| PlanSubject { name: n.into(), weight: w, topics: t.iter().map(|s| s.to_string()).collect() };
        let out = merge(vec![
            p("Língua Portuguesa", 1.0, &["1 Compreensão de texto.", "2. Ortografia;"]),
            p("", 1.0, &["perdido"]),
            p("LINGUA PORTUGUESA", 10.0, &["Ortografia", "- Crase"]),
        ]);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].name, "Língua Portuguesa");
        assert_eq!(out[0].weight, 10.0);
        assert_eq!(out[0].topics, vec!["Compreensão de texto", "Ortografia", "Crase"]);
    }

    #[test]
    fn same_subject_with_other_names_is_merged() {
        assert_eq!(subject_key("Português"), subject_key("LÍNGUA PORTUGUESA"));
        assert_eq!(subject_key("Noções de Direito Administrativo"), subject_key("Direito Administrativo"));
        assert_eq!(subject_key("RLM"), subject_key("Raciocínio Lógico-Matemático"));
        assert_ne!(subject_key("Direito Constitucional"), subject_key("Direito Administrativo"));
        let merged = merge(vec![
            PlanSubject { name: "Português".into(), weight: 1.0, topics: vec!["Crase".into()] },
            PlanSubject { name: "Língua Portuguesa".into(), weight: 2.0, topics: vec!["Regência".into()] },
        ]);
        assert_eq!(merged.len(), 1);
        assert_eq!(merged[0].name, "Português");
        assert_eq!(merged[0].topics, vec!["Crase", "Regência"]);
    }
}
