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
            // Item longo é comum em edital oficial ("Conceitos legais: dado pessoal, dado sensível…"):
            // encurta, nunca descarta (antes sumia calado).
            let t = if t.chars().count() > 600 { format!("{}…", t.chars().take(600).collect::<String>().trim_end()) } else { t };
            if !t.is_empty() && !s.topics.iter().any(|x| fold(x) == fold(&t)) && s.topics.len() < 120 {
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
    use unicode_normalization::UnicodeNormalization;
    // Alguns PDFs guardam "í" como "i" + acento solto ("Poli´ticas"): NFC junta de volta.
    let text: String = text.nfc().collect();
    // Cabeçalho/rodapé de página: a mesma linha curta repetida em muitas páginas
    // ("DATAPREV | CONCURSO PÚBLICO 2026", 63 vezes). Título de matéria não se repete tanto.
    // A contagem ignora o número de página no fim ("…CONCURSO PÚBLICO 2025    30"), que muda a cada página.
    let header_key = |l: &str| l.trim().trim_end_matches(|c: char| c.is_ascii_digit() || c.is_whitespace()).to_string();
    let mut counts: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
    for line in text.lines().map(str::trim).filter(|l| !l.is_empty() && l.chars().count() <= 100) {
        let key = header_key(line);
        // só número ("37") não é cabeçalho: sai pela regra de número de página, abaixo
        if !key.is_empty() {
            *counts.entry(key).or_default() += 1;
        }
    }
    let mut out = String::with_capacity(text.len());
    for line in text.lines() {
        // cabeçalho repetido, ou número de página sozinho na linha ("37")
        let t = line.trim();
        // linha em branco fica: ela separa parágrafos (título nunca atravessa parágrafo)
        if (!t.is_empty() && counts.get(&header_key(t)).is_some_and(|&n| n >= 8)) || (!t.is_empty() && t.len() <= 3 && t.chars().all(|c| c.is_ascii_digit())) {
            continue;
        }
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

/// Títulos que nunca são matéria (descritivos do edital).
const GROUP_ONLY: [&str; 4] = ["conteudo programatico", "conteudos programaticos", "objetos de avaliacao", "anexo"];

/// Agrupadores de matérias: um algarismo romano debaixo deles abre uma matéria (e não uma parte).
/// Com itens próprios (ex.: "PERFIL 9 – COMUNICAÇÃO SOCIAL: 1 …") eles mesmos viram matéria.
fn is_group(title: &str) -> bool {
    let k = fold(title);
    ["conhecimentos", "cargo", "especialidade", "perfil", "area", "bloco", "eixo", "grupo", "parte"].iter().any(|g| k.starts_with(g))
        || GROUP_ONLY.iter().any(|g| k.starts_with(g))
}

/// Algarismo romano de subdivisão (I a XII).
fn is_roman(w: &str) -> bool {
    matches!(w.trim_end_matches(['.', ')', '–', '-', ':']), "I" | "II" | "III" | "IV" | "V" | "VI" | "VII" | "VIII" | "IX" | "X" | "XI" | "XII")
}

/// Todos os lugares onde o conteúdo pode começar ("conteúdo programático", "objetos de avaliação"…).
/// Edital real cita esses nomes no corpo das regras antes da lista de verdade ("…objetos de avaliação
/// constantes do item 16…"): quem escolhe é `best_structured`, pelo que rende mais itens.
pub fn section_starts(text: &str) -> Vec<&str> {
    let (norm, origin): (String, Vec<usize>) = text
        .char_indices()
        .map(|(i, c)| (fold(&c.to_string()).chars().next().unwrap_or(' '), i))
        .unzip();
    let mut starts: Vec<usize> = ["conteudo programatico", "conteudos programaticos", "objetos de avaliacao", "conhecimentos basicos", "conhecimentos gerais"]
        .iter()
        .flat_map(|k| norm.match_indices(k).map(|(byte, _)| origin[norm[..byte].chars().count()]).collect::<Vec<_>>())
        .collect();
    starts.sort_unstable();
    starts.dedup();
    starts.into_iter().map(|i| &text[i..]).collect()
}

/// Leitura por regra a partir do melhor começo: o que rende mais itens (sem IA). `None` se nenhum
/// começo tiver estrutura reconhecível.
pub fn best_structured(text: &str, max_chars: usize) -> Option<Vec<PlanSubject>> {
    let mut candidates = vec![text];
    candidates.extend(section_starts(text));
    let plans: Vec<(Vec<PlanSubject>, usize)> = candidates
        .into_iter()
        .filter_map(|start| parse_structured(super::text::head(until_next_annex(start), max_chars)))
        .map(|p| {
            let plan = merge(p);
            let n = plan.iter().map(|s| s.topics.len()).sum();
            (plan, n)
        })
        .collect();
    // O começo mais cedo rende um pouco mais só por arrastar lixo das regras (quadro de provas,
    // "TOTAL MÁXIMO DE PONTOS"): fica o começo MAIS TARDIO que ainda tem ≥ 90% dos itens.
    let best = plans.iter().map(|p| p.1).max()?;
    plans.into_iter().rev().find(|p| p.1 * 10 >= best * 9).map(|p| p.0)
}

/// Título + peso: "DIREITO ADMINISTRATIVO (peso 3)" → ("DIREITO ADMINISTRATIVO", Some(3)).
fn title_and_weight(raw: &str) -> (String, Option<f64>) {
    let raw = raw.trim().trim_end_matches(':').trim();
    let Some(open) = raw.find('(') else { return (raw.to_string(), None) };
    let inside = fold(&raw[open..]);
    let weight = inside
        .find("peso")
        .and_then(|i| inside[i + 4..].split(|c: char| !c.is_ascii_digit() && c != ',' && c != '.').find(|s| !s.is_empty()).map(str::to_string))
        .and_then(|n| n.replace(',', ".").parse::<f64>().ok());
    (raw[..open].trim().to_string(), weight)
}

/// Itens numerados em SEQUÊNCIA (1, 2, 3…): "1 Crase. 2 Regência. 2.1 Verbal." → ["Crase", "Regência. 2.1 Verbal"].
/// A sequência é o que separa item de número de lei ("Lei nº 8.112") ou subitem ("2.1"). Texto antes
/// do item 1 fica de fora. Vazio se não houver "1".
pub fn numbered_items(body: &str) -> Vec<String> {
    let chars: Vec<char> = body.chars().collect();
    let mut cuts: Vec<(usize, usize)> = Vec::new(); // (início do número, início do texto)
    let mut expected = 1u32;
    let mut i = 0;
    while i < chars.len() {
        let at_boundary = i == 0 || chars[i - 1].is_whitespace();
        if at_boundary && chars[i].is_ascii_digit() {
            let mut j = i;
            while j < chars.len() && chars[j].is_ascii_digit() && j - i < 3 {
                j += 1;
            }
            let n: u32 = chars[i..j].iter().collect::<String>().parse().unwrap_or(0);
            let mut k = j;
            if k < chars.len() && matches!(chars[k], '.' | ')' | '-' | '–') {
                k += 1;
            }
            // número seguido de espaço e de texto (não de outro dígito: "2.1", "8.112")
            if n == expected && k < chars.len() && chars[k].is_whitespace() && chars[k..].iter().find(|c| !c.is_whitespace()).is_some_and(|c| !c.is_ascii_digit()) {
                cuts.push((i, k));
                expected += 1;
                i = k;
                continue;
            }
        }
        i += 1;
    }
    cuts.iter()
        .enumerate()
        .map(|(n, &(_, start))| {
            let end = cuts.get(n + 1).map_or(chars.len(), |c| c.0);
            let item: String = chars[start..end].iter().collect();
            item.split_whitespace().collect::<Vec<_>>().join(" ").trim_end_matches(['.', ';', ',']).trim().to_string()
        })
        .filter(|t| !t.is_empty())
        .collect()
}

/// Um pedaço do texto do edital, na ordem em que aparece.
enum Tok<'a> {
    /// Linha inteira que é título ("LÍNGUA PORTUGUESA", "ESPECIALIDADE 1").
    Title(&'a str),
    /// Quebra de linha (conta como começo de frase; um título pode continuar depois dela).
    Break,
    /// Linha em branco: parágrafo novo, que um título nunca atravessa.
    Para,
    Word(&'a str),
}

/// Título corrido: palavras sem minúscula ("NOÇÕES", "DE", "1", "–") terminando em ":", começando
/// em começo de frase e com 4+ letras. Para antes de algarismo romano (que abre título próprio).
/// Devolve o índice da palavra com ":".
fn inline_title_end(toks: &[Tok], start: usize) -> Option<usize> {
    let mut letters = 0;
    let mut v = start;
    loop {
        match toks.get(v) {
            // título que quebra de linha ("NOÇÕES DE TECNOLOGIA DA ↵ INFORMAÇÃO:") continua na próxima
            Some(Tok::Break) => {}
            Some(Tok::Word(w)) => {
                // título não tem minúscula, não começa outro romano e não contém fim de frase ("S3.")
                if w.chars().any(char::is_lowercase) || (v > start && is_roman(w)) || w.ends_with(['.', ';']) {
                    return None;
                }
                letters += w.chars().filter(|c| c.is_alphabetic()).count();
                if w.ends_with(':') {
                    return (letters >= 4).then_some(v);
                }
            }
            Some(Tok::Title(_) | Tok::Para) | None => return None,
        }
        v += 1;
    }
}

/// Começo de frase: início do texto, depois de quebra de linha/título ou de palavra terminada em ". ; :".
fn sentence_start(toks: &[Tok], i: usize) -> bool {
    match i.checked_sub(1).map(|p| &toks[p]) {
        None | Some(Tok::Break | Tok::Para | Tok::Title(_)) => true,
        Some(Tok::Word(w)) => w.ends_with(['.', ';', ':']),
    }
}

/// Subitens "N.1", "N.2"… (em sequência) de um item N; o texto antes do N.1 (o rótulo do item) sai.
fn subitems(item: &str, n: usize) -> Vec<String> {
    let words: Vec<&str> = item.split_whitespace().collect();
    let mut cuts: Vec<usize> = Vec::new();
    let mut k = 1;
    for (i, w) in words.iter().enumerate() {
        if *w == format!("{n}.{k}") || *w == format!("{n}.{k}.") {
            cuts.push(i);
            k += 1;
        }
    }
    cuts.iter()
        .enumerate()
        .map(|(c, &start)| {
            let end = cuts.get(c + 1).copied().unwrap_or(words.len());
            words[start + 1..end].join(" ").trim_end_matches(['.', ';', ',']).trim().to_string()
        })
        .filter(|t| !t.is_empty())
        .collect()
}

/// Matéria com menos de 3 itens principais e o conteúdo todo nos subitens ("1 Microeconomia. 1.1
/// Teoria do consumidor. 1.2 Demanda…"): os subitens viram os tópicos, senão a matéria inteira
/// seria um tópico só.
fn granular(items: Vec<String>) -> Vec<String> {
    if items.len() >= 3 {
        return items;
    }
    let expanded: Vec<String> = items
        .iter()
        .enumerate()
        .flat_map(|(i, item)| {
            let subs = subitems(item, i + 1);
            if subs.is_empty() { vec![item.clone()] } else { subs }
        })
        .collect();
    if expanded.len() > items.len() { expanded } else { items }
}

/// Lê matérias e tópicos SEM IA quando o edital tem a estrutura usual das bancas: título em
/// MAIÚSCULAS (sozinho na linha, ou "TÍTULO: 1 … 2 …" corrido, mesmo quebrando de linha) e itens
/// numerados em sequência. Algarismo romano depois de uma matéria é parte dela ("…DADOS: I NOÇÕES
/// DE TI: 1 …"); debaixo de um agrupador (CARGO, ESPECIALIDADE, PERFIL, CONHECIMENTOS…) é a própria
/// matéria ("ESPECIALIDADE 1 I MICROECONOMIA: 1 …"). `None` se não reconhecer ao menos 2 matérias.
pub fn parse_structured(section: &str) -> Option<Vec<PlanSubject>> {
    let mut toks: Vec<Tok> = Vec::new();
    for line in section.lines() {
        let line = line.trim();
        if line.is_empty() {
            if !matches!(toks.last(), Some(Tok::Para)) {
                toks.push(Tok::Para);
            }
            continue;
        }
        if is_heading(line) && !line.contains(':') {
            toks.push(Tok::Title(line));
        } else {
            toks.extend(line.split_whitespace().map(Tok::Word));
            toks.push(Tok::Break);
        }
    }

    // segmentos (título, corpo)
    let mut segments: Vec<(String, String)> = Vec::new();
    let mut title: Option<String> = None;
    let mut body = String::new();
    // último título que não é romano (matéria ou agrupador)
    let mut parent: Option<String> = None;
    // Modo da sequência de romanos em curso, decidido pelo PRIMEIRO romano: `true` = cada romano é
    // uma matéria (debaixo de CARGO/ESPECIALIDADE), `false` = partes da matéria `parent`.
    let mut romans_are_subjects: Option<bool> = None;
    let mut i = 0;
    while i < toks.len() {
        let new_title = match &toks[i] {
            Tok::Title(t) => Some((t.to_string(), i + 1)),
            Tok::Word(_) if sentence_start(&toks, i) => inline_title_end(&toks, i).map(|e| {
                let words: Vec<&str> = toks[i..=e].iter().filter_map(|t| if let Tok::Word(w) = t { Some(*w) } else { None }).collect();
                (words.join(" "), e + 1)
            }),
            _ => None,
        };
        match new_title {
            Some((run, next)) => {
                if let Some(t) = title.take() {
                    segments.push((t, std::mem::take(&mut body)));
                }
                body.clear();
                let roman = is_roman(run.split_whitespace().next().unwrap_or(""));
                let named = if roman {
                    let subjects = *romans_are_subjects.get_or_insert_with(|| parent.as_deref().is_none_or(is_group));
                    match (&parent, subjects) {
                        // parte de uma matéria: continua nela (o merge junta as partes)
                        (Some(p), false) => p.clone(),
                        // matéria debaixo de cargo/especialidade: o nome sem o numeral
                        _ => run.split_whitespace().skip(1).collect::<Vec<_>>().join(" "),
                    }
                } else {
                    romans_are_subjects = None;
                    parent = Some(run.clone());
                    run
                };
                title = Some(named);
                i = next;
            }
            None => {
                if let Tok::Word(w) = &toks[i] {
                    body.push(' ');
                    body.push_str(w);
                }
                i += 1;
            }
        }
    }
    if let Some(t) = title.take() {
        segments.push((t, body));
    }

    // cada título com itens numerados vira matéria; agrupadores sem itens ficam de fora
    let mut out: Vec<PlanSubject> = Vec::new();
    for (raw_title, body) in segments {
        let (name, weight) = title_and_weight(&raw_title);
        if name.is_empty() || GROUP_ONLY.iter().any(|g| fold(&name).starts_with(g)) {
            continue;
        }
        let topics = granular(numbered_items(&body));
        if !topics.is_empty() {
            out.push(PlanSubject { name, weight: weight.unwrap_or(1.0), topics });
        }
    }
    let total: usize = out.iter().map(|s| s.topics.len()).sum();
    (out.len() >= 2 && total >= 5).then_some(out)
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
    fn numbered_items_follow_the_sequence_only() {
        // "8.112" e "2.1" não abrem item novo; o texto antes do 1 fica de fora
        let items = numbered_items("intro 1 Crase. 2 Lei nº 8.112/1990: regime. 2.1 Provimento. 3. Regência; 10 vagas");
        assert_eq!(items, vec!["Crase", "Lei nº 8.112/1990: regime. 2.1 Provimento", "Regência; 10 vagas"]);
        assert!(numbered_items("sem itens").is_empty());
    }

    #[test]
    fn reads_line_headings_without_ai() {
        // formato do PDF da ANPD (depois do clean_pdf_text): título na linha, itens "1." em linhas
        let text = "CONTEÚDO PROGRAMÁTICO (projetado)\nFormato de edital do Cebraspe, pronto para importar.\nCONHECIMENTOS GERAIS\nLÍNGUA PORTUGUESA (peso 3)\n1. Compreensão e interpretação de textos.\n2. Ortografia oficial.\nA ANPD COMO AGÊNCIA REGULADORA (peso 2)\n1. Evolução institucional: da autoridade vinculada à Presidência (2018-2022) à autarquia\n(Lei nº 14.460/2022).\n2. Estrutura: Conselho Diretor.\n3. Competências normativas.";
        let plan = parse_structured(text).expect("estruturado");
        assert_eq!(plan.iter().map(|s| s.name.as_str()).collect::<Vec<_>>(), vec!["LÍNGUA PORTUGUESA", "A ANPD COMO AGÊNCIA REGULADORA"]);
        assert_eq!(plan[0].weight, 3.0);
        assert_eq!(plan[1].topics.len(), 3);
        assert_eq!(plan[1].topics[0], "Evolução institucional: da autoridade vinculada à Presidência (2018-2022) à autarquia (Lei nº 14.460/2022)");
    }

    #[test]
    fn reads_inline_cebraspe_format_without_ai() {
        // formato corrido de edital do Cebraspe: vários títulos e itens no mesmo parágrafo
        let text = "CONHECIMENTOS BÁSICOS: LÍNGUA PORTUGUESA: 1 Compreensão e interpretação de textos de gêneros variados. 2 Reconhecimento de tipos e gêneros textuais. 3 Domínio da ortografia oficial. NOÇÕES DE DIREITO ADMINISTRATIVO: 1 Estado, governo e administração pública: conceitos. 2 Lei nº 8.112/1990. 2.1 Provimento, vacância. 3 Lei nº 9.784/1999.\nLEGISLAÇÃO APLICADA À ANPD: 1 Lei nº 13.709/2018 (LGPD). 2 Lei nº 15.211/2025.";
        let plan = parse_structured(text).expect("estruturado");
        let names: Vec<&str> = plan.iter().map(|s| s.name.as_str()).collect();
        assert_eq!(names, vec!["LÍNGUA PORTUGUESA", "NOÇÕES DE DIREITO ADMINISTRATIVO", "LEGISLAÇÃO APLICADA À ANPD"]);
        // edital ANA 2024 (real): título quebrando de linha, partes romanas de uma matéria e matérias
        // romanas debaixo de cargo/especialidade
        let ana = "CONHECIMENTOS BÁSICOS\nNOÇÕES DE TECNOLOGIA DA INFORMAÇÃO E CIÊNCIA DE DADOS: I NOÇÕES DE TECNOLOGIA DA\nINFORMAÇÃO: 1 Computação na nuvem. 2 Banco de dados. II CIÊNCIA DE DADOS: 1 Aprendizado supervisionado.\nCONHECIMENTOS ESPECÍFICOS\nCARGO 1: ESPECIALISTA EM REGULAÇÃO – \nESPECIALIDADE 1\nI MICROECONOMIA: 1 Microeconomia. 1.1 Teoria do consumidor. 2 Demanda. IV REGULAÇÃO ECONÔMICA E DE\nMERCADOS/ECONOMIA DA REGULAÇÃO: 1 Teoria da Regulação. 2 Captura.";
        let ana_plan = parse_structured(ana).expect("estruturado");
        let ana_names: Vec<&str> = ana_plan.iter().map(|s| s.name.as_str()).collect();
        assert_eq!(ana_names, vec!["NOÇÕES DE TECNOLOGIA DA INFORMAÇÃO E CIÊNCIA DE DADOS", "NOÇÕES DE TECNOLOGIA DA INFORMAÇÃO E CIÊNCIA DE DADOS", "MICROECONOMIA", "REGULAÇÃO ECONÔMICA E DE MERCADOS/ECONOMIA DA REGULAÇÃO"]);
        let ti: usize = merge(ana_plan).iter().filter(|s| s.name.starts_with("NOÇÕES DE TEC")).map(|s| s.topics.len()).sum();
        assert_eq!(ti, 3, "as duas partes (I e II) ficam na mesma matéria");
        assert_eq!(plan[1].topics, vec!["Estado, governo e administração pública: conceitos", "Lei nº 8.112/1990. 2.1 Provimento, vacância", "Lei nº 9.784/1999"]);
    }

    #[test]
    fn subject_with_one_item_uses_its_subitems() {
        // ANA 2024: "1 Microeconomia" e todo o conteúdo em 1.1, 1.2…
        let items = granular(numbered_items("1 Microeconomia. 1.1 Teoria do consumidor. 1.1.1 Preferências. 1.2 Demanda. 1.3 Oferta."));
        assert_eq!(items, vec!["Teoria do consumidor. 1.1.1 Preferências", "Demanda", "Oferta"]);
        // 3+ itens principais: fica como está
        assert_eq!(granular(numbered_items("1 A. 1.1 a1. 2 B. 3 C.")).len(), 3);
    }

    #[test]
    fn unstructured_text_is_left_for_the_ai() {
        assert!(parse_structured("O candidato deverá estudar a Lei Geral de Proteção de Dados e noções de direito.").is_none());
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
