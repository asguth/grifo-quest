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
            if !t.is_empty() && t.chars().count() <= 300 && !s.topics.iter().any(|x| fold(x) == fold(&t)) && s.topics.len() < 80 {
                s.topics.push(t);
            }
        }
    }
    // Título sem nenhum tópico (sobrou no fim de uma fatia, ou é cabeçalho de grupo como
    // "CONHECIMENTOS GERAIS") não é matéria.
    out.retain(|s| !s.topics.is_empty());
    out
}

/// Conserta o texto que o `pdf-extract` devolve de PDFs gerados por navegador/Word: espaço no meio
/// de números ("1 4 .4 6 0 /2 0 2 2" → "14.460/2022") e de palavras acentuadas ("Compreensã o" →
/// "Compreensão"), linhas de rodapé com "página N de M" e espaços repetidos. Mexe só onde o padrão
/// não existe em português de verdade ("ã", "õ", "ç" nunca ficam sozinhos; "à" e "é" ficam).
pub fn clean_pdf_text(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for line in text.lines() {
        let folded = fold(line);
        if folded.contains("pagina ") && folded.split_whitespace().collect::<Vec<_>>().windows(4).any(|w| w[0] == "pagina" && w[2] == "de" && w[1].chars().all(|c| c.is_ascii_digit())) {
            continue; // rodapé repetido em toda página
        }
        let chars: Vec<char> = line.chars().collect();
        let mut fixed = String::with_capacity(line.len());
        for (i, &c) in chars.iter().enumerate() {
            if c == ' ' && i > 0 && i + 1 < chars.len() {
                let (prev, next) = (chars[i - 1], chars[i + 1]);
                let digit_join = prev.is_ascii_digit() && (next.is_ascii_digit() || matches!(next, '.' | ',' | '/' | ')' | '-' | 'º' | 'ª'));
                // Só o que nunca termina palavra: "ç" e "õ", e "ã" antes de "o" ("Compreensã o").
                // "já é", "você está" e "manhã de" terminam em acento e ficam como estão.
                let accent_join = i >= 2
                    && chars[i - 2].is_alphabetic()
                    && (matches!(prev, 'ç' | 'õ') && next.is_lowercase() || prev == 'ã' && next == 'o');
                if digit_join || accent_join {
                    continue;
                }
                if prev == ' ' {
                    continue; // espaço repetido
                }
            }
            fixed.push(c);
        }
        out.push_str(fixed.trim_end());
        out.push('\n');
    }
    out
}

/// Fim do conteúdo programático: o próximo "ANEXO" depois do início (modelo de declaração, tabela de
/// fontes, cronograma…) não é matéria e confunde a IA.
pub fn until_next_annex(section: &str) -> &str {
    let mut offset = 0;
    for (n, line) in section.split_inclusive('\n').enumerate() {
        let t = line.trim_start();
        if n > 0 && t.starts_with("ANEXO ") {
            return &section[..offset];
        }
        offset += line.len();
    }
    section
}

/// Linha que parece título de matéria: curta, sem numeração na frente e quase toda em maiúsculas
/// ("LÍNGUA PORTUGUESA", "DIREITO ADMINISTRATIVO (peso 3)").
pub fn is_heading(line: &str) -> bool {
    let t = line.trim();
    let letters: Vec<char> = t.chars().filter(|c| c.is_alphabetic()).collect();
    if letters.len() < 4 || t.chars().count() > 120 || t.starts_with(|c: char| c.is_ascii_digit()) {
        return false;
    }
    // o que está entre parênteses pode vir minúsculo: "(peso 3)", "(conhecimentos básicos)"
    let outside: String = t.split('(').next().unwrap_or(t).chars().filter(|c| c.is_alphabetic()).collect();
    !outside.is_empty() && outside.chars().filter(|c| c.is_uppercase()).count() * 10 >= outside.chars().count() * 9
}

/// Fatias de até `max_chars` que nunca cortam uma matéria ao meio: junta matérias inteiras e, se
/// uma sozinha passa do limite, a fatia seguinte começa com "(continuação de TÍTULO)". Sem isso a
/// IA recebia tópicos sem título e inventava uma matéria (caso real: "A ANPD COMO AGÊNCIA
/// REGULADORA" no fim de uma fatia, os tópicos dela viraram "Evolução Institucional" na outra).
pub fn chunks_by_subject(text: &str, max_chars: usize) -> Vec<String> {
    // blocos = título + tópicos até o próximo título
    let mut blocks: Vec<(Option<String>, Vec<&str>)> = vec![(None, Vec::new())];
    for line in text.lines() {
        if line.trim().is_empty() {
            continue;
        }
        if is_heading(line) {
            blocks.push((Some(line.trim().to_string()), vec![line]));
        } else if let Some(last) = blocks.last_mut() {
            last.1.push(line);
        }
    }
    let mut out: Vec<String> = Vec::new();
    let mut cur = String::new();
    let len = |s: &str| s.chars().count();
    for (title, lines) in blocks.into_iter().filter(|b| !b.1.is_empty()) {
        let block = lines.join("\n");
        if !cur.is_empty() && len(&cur) + len(&block) + 1 > max_chars {
            out.push(std::mem::take(&mut cur));
        }
        if len(&block) <= max_chars {
            if !cur.is_empty() {
                cur.push('\n');
            }
            cur.push_str(&block);
            continue;
        }
        // matéria maior que a fatia: quebra por linha, repetindo o título. Nunca fecha uma fatia
        // que só tem o título (ou o "continuação de"): ela não teria tópico nenhum.
        let head = title.as_deref().map(|t| format!("(continuação de {t})\n"));
        let mut body = false;
        for (n, line) in lines.into_iter().enumerate() {
            if body && len(&cur) + len(line) + 1 > max_chars {
                out.push(std::mem::take(&mut cur));
                if let Some(h) = &head {
                    cur.push_str(h);
                }
                body = false;
            }
            body |= n > 0 || title.is_none();
            if !cur.is_empty() && !cur.ends_with('\n') {
                cur.push('\n');
            }
            cur.push_str(line);
        }
    }
    if !cur.trim().is_empty() {
        out.push(cur);
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
        // saída real do pdf-extract no edital da ANPD
        let raw = "1 . Compreensã o e interpretaçã o de textos.\nEdital de estudo (não oficial) ·  ANPD · página  2 de  8\nLei nº 1 4 .4 6 0 /2 0 2 2 (arts. 5 5 -A a 5 8 -B), sançõ es e à  Presidência; já é o caso, de manhã de novo (peso 3 )";
        assert_eq!(
            clean_pdf_text(raw),
            "1. Compreensão e interpretação de textos.\nLei nº 14.460/2022 (arts. 55-A a 58-B), sanções e à Presidência; já é o caso, de manhã de novo (peso 3)\n"
        );
    }

    #[test]
    fn section_stops_at_the_next_annex() {
        let s = "ANEXO I: CONTEÚDO PROGRAMÁTICO\nLÍNGUA PORTUGUESA\n1 Crase.\nANEXO II: Fontes oficiais\nLei 13.709";
        assert_eq!(until_next_annex(s), "ANEXO I: CONTEÚDO PROGRAMÁTICO\nLÍNGUA PORTUGUESA\n1 Crase.\n");
    }

    #[test]
    fn recognizes_subject_headings() {
        assert!(is_heading("LÍNGUA PORTUGUESA"));
        assert!(is_heading("A ANPD COMO AGÊNCIA REGULADORA (peso 2)"));
        assert!(!is_heading("1. Compreensão de textos."));
        assert!(!is_heading("Formato de edital do Cebraspe, pronto para importar"));
        assert!(!is_heading("LGP"));
    }

    #[test]
    fn subject_is_never_split_between_chunks() {
        let t = "LÍNGUA PORTUGUESA\n1. Crase.\n2. Regência.\nA ANPD COMO AGÊNCIA REGULADORA\n1. Evolução institucional.\n2. Estrutura.";
        // cabe uma matéria por fatia, não duas: a segunda vai inteira, com o título, para a próxima
        let parts = chunks_by_subject(t, 80);
        assert_eq!(parts.len(), 2, "{parts:?}");
        assert!(parts[1].starts_with("A ANPD COMO AGÊNCIA REGULADORA\n1. Evolução"), "{parts:?}");
        // nenhuma fatia só com título
        let tiny = chunks_by_subject(t, 40);
        assert!(tiny.iter().all(|p| p.lines().any(|l| l.starts_with(|c: char| c.is_ascii_digit()))), "{tiny:?}");
        // matéria maior que a fatia: a continuação carrega o título
        let big = format!("DIREITO ADMINISTRATIVO\n{}", (1..=6).map(|i| format!("{i}. Tópico número {i}.")).collect::<Vec<_>>().join("\n"));
        let parts = chunks_by_subject(&big, 60);
        assert!(parts.len() > 1);
        assert!(parts[1..].iter().all(|p| p.starts_with("(continuação de DIREITO ADMINISTRATIVO)")), "{parts:?}");
        assert_eq!(chunks_by_subject("", 10), Vec::<String>::new());
    }

    #[test]
    fn finds_program_section_even_with_accents() {
        let t = "Capítulo 1 — inscrições...\n\nANEXO II – CONTEÚDO PROGRAMÁTICO\nLÍNGUA PORTUGUESA: 1 Compreensão.";
        assert!(program_section(t).starts_with("CONTEÚDO PROGRAMÁTICO"));
        assert_eq!(program_section("sem título"), "sem título");
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
        // título que ficou sem tópico não vira matéria
        assert!(merge(vec![p("CONHECIMENTOS GERAIS", 1.0, &[])]).is_empty());
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
