//! Notícias: limpeza do texto do RSS, imagem de capa (og:image), chave de duplicata dos concursos
//! e leitura da classificação feita pela IA local.

use serde::Deserialize;

use super::text::fold;

/// Etiquetas que a IA pode dar (o front mostra como filtro).
pub const TAGS: &[&str] = &["edital", "inscricoes", "prova", "resultado", "nomeacao", "previsto", "prorrogacao", "outros"];

/// Texto puro de um trecho HTML do RSS (tags fora, entidades comuns traduzidas, espaços colapsados).
pub fn strip_html(html: &str, max_chars: usize) -> String {
    let mut out = String::with_capacity(html.len().min(max_chars * 2));
    let mut in_tag = false;
    for c in html.chars() {
        match c {
            '<' => {
                in_tag = true;
                out.push(' ');
            }
            '>' => in_tag = false,
            c if !in_tag => out.push(c),
            _ => {}
        }
    }
    let decoded = out
        .replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&#8217;", "’")
        .replace("&#8220;", "“")
        .replace("&#8221;", "”")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("[&#8230;]", "…")
        .replace("&#8230;", "…");
    let text = decoded.split_whitespace().collect::<Vec<_>>().join(" ");
    super::text::head(&text, max_chars).to_string()
}

/// Primeiro `src` de `<img>` num trecho HTML (muitos feeds põem a capa no corpo).
pub fn first_img(html: &str) -> Option<String> {
    let i = html.find("<img")?;
    attr(&html[i..html[i..].find('>').map_or(html.len(), |e| i + e)], "src").filter(|u| u.starts_with("http"))
}

/// `og:image` (ou `twitter:image`) de uma página, resolvendo endereço relativo a partir de `page_url`.
pub fn og_image(html: &str, page_url: &str) -> Option<String> {
    let lower = html.to_ascii_lowercase();
    let mut from = 0;
    while let Some(rel) = lower[from..].find("<meta") {
        let start = from + rel;
        let end = lower[start..].find('>').map_or(lower.len(), |e| start + e);
        let tag = &html[start..end];
        let t = &lower[start..end];
        if (t.contains("og:image") || t.contains("twitter:image"))
            && let Some(url) = attr(tag, "content").filter(|u| !u.is_empty())
        {
            return Some(absolute(&url, page_url));
        }
        from = end;
    }
    None
}

/// Valor de um atributo (aspas simples ou duplas) dentro de uma tag.
fn attr(tag: &str, name: &str) -> Option<String> {
    let lower = tag.to_ascii_lowercase();
    let mut from = 0;
    while let Some(rel) = lower[from..].find(name) {
        let i = from + rel;
        let rest = tag[i + name.len()..].trim_start();
        // precisa ser o atributo inteiro (não "data-src" quando pedimos "src")
        let boundary = i == 0 || !lower.as_bytes()[i - 1].is_ascii_alphanumeric() && lower.as_bytes()[i - 1] != b'-';
        if boundary && let Some(rest) = rest.strip_prefix('=') {
            let rest = rest.trim_start();
            let q = rest.chars().next()?;
            if q == '"' || q == '\'' {
                let v = &rest[1..];
                return v.find(q).map(|e| v[..e].replace("&amp;", "&"));
            }
            return Some(rest.split(|c: char| c.is_whitespace() || c == '>').next()?.to_string());
        }
        from = i + name.len();
    }
    None
}

fn absolute(url: &str, page: &str) -> String {
    if url.starts_with("http") {
        return url.to_string();
    }
    if let Some(rest) = url.strip_prefix("//") {
        return format!("https://{rest}");
    }
    // origem = esquema + host da página
    let origin_end = page.find("://").map_or(0, |i| i + 3);
    let host_end = page[origin_end..].find('/').map_or(page.len(), |i| origin_end + i);
    format!("{}/{}", &page[..host_end], url.trim_start_matches('/'))
}

/// Chave para achar a mesma notícia republicada por outra fonte: título sem o " - Blog X" do fim,
/// sem acento, pontuação e caixa.
pub fn title_key(title: &str) -> String {
    let mut t = title.trim();
    for sep in [" - ", " | ", " – ", " — "] {
        if let Some(i) = t.rfind(sep)
            && t[i + sep.len()..].chars().count() <= 40
            && i > 20
        {
            t = &t[..i];
        }
    }
    fold(t).split(|c: char| !c.is_ascii_alphanumeric()).filter(|w| !w.is_empty()).collect::<Vec<_>>().join(" ")
}

/// Palavras que não identificam o concurso.
const STOP: &[&str] = &[
    "concurso", "concursos", "publico", "edital", "editais", "de", "do", "da", "dos", "das", "para", "o", "a", "e", "em", "no", "na",
    "novo", "nova", "abre", "publica", "publicado", "sai", "saiu", "tem", "vagas", "vaga", "inscricoes", "previsto", "autorizado",
    "banca", "definida", "oficial", "resultado", "prova", "provas", "cargos", "cargo", "com", "ate", "r",
];

/// Chave para juntar o mesmo concurso vindo de fontes diferentes: as 2 primeiras palavras que
/// identificam o órgão (ex.: "TRT 2ª Região" e "Concurso TRT-2: edital…" viram "trt 2").
pub fn contest_key(org: Option<&str>, title: &str) -> Option<String> {
    let source = org.filter(|o| !o.trim().is_empty()).unwrap_or(title);
    let words: Vec<String> = fold(source)
        .split(|c: char| !c.is_ascii_alphanumeric())
        .filter(|w| !w.is_empty() && !STOP.contains(w) && !(w.len() == 4 && w.starts_with("20")))
        .take(2)
        .map(str::to_string)
        .collect();
    (words.len() == 2 || words.first().is_some_and(|w| w.len() >= 3)).then(|| words.join(" "))
}

/// O que a IA local devolve por notícia.
#[derive(Debug, Clone, Deserialize)]
pub struct Classified {
    pub id: i32,
    #[serde(default)]
    pub resumo: String,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub relevancia: f64,
}

#[derive(Debug, Deserialize)]
pub struct ClassifiedBatch {
    #[serde(default)]
    pub itens: Vec<Classified>,
}

/// Limpa a classificação: só etiquetas conhecidas (sem acento), relevância entre 0 e 1.
pub fn clean(c: Classified) -> (i32, String, String, f64) {
    let tags: Vec<String> = c
        .tags
        .iter()
        .map(|t| fold(t).replace(' ', ""))
        .filter(|t| TAGS.contains(&t.as_str()))
        .take(3)
        .collect();
    let rel = if c.relevancia.is_finite() { c.relevancia.clamp(0.0, 1.0) } else { 0.0 };
    (c.id, super::text::head(c.resumo.trim(), 400).to_string(), tags.join(","), rel)
}

/// Status de concurso cuja prova já aconteceu (aditivo, convocação, resultado): não dá mais para se inscrever.
pub const DONE: &str = "prova realizada";

/// Sinais, no título/resumo/status, de que a prova já passou. A IA às vezes chama o aditivo de vagas
/// de um concurso antigo de "edital publicado" (caso real: Serpro 2023, 3º aditivo em 2026).
/// Sem "contratação" (da banca vem antes da prova) e sem "convocação" sozinha (para a prova também).
const AFTER_EXAM: [&str; 12] = [
    "aditivo", "convocacoes", "convocados", "convocacao de aprovados", "nomea", "homolog", "resultado",
    "cadastro de reserva", "cadastro reserva", "prova realizada", "aprovados", "posse",
];

/// Corrige o status de um concurso: se há sinal de que a prova já aconteceu (marcadores acima, data
/// da prova no passado ou só anos anteriores no título), devolve [`DONE`] seja o que for que a IA
/// disse. `today` = "AAAA-MM-DD".
pub fn contest_status(title: &str, summary: Option<&str>, status: Option<&str>, exam_date: Option<&str>, today: &str) -> Option<String> {
    let text = fold(&format!("{title} {} {}", summary.unwrap_or(""), status.unwrap_or("")));
    let marker = AFTER_EXAM.iter().any(|m| text.contains(m));
    let past_exam = exam_date.is_some_and(|d| d.len() >= 10 && d[..10] < *today);
    let year_now: i32 = today.get(..4).and_then(|y| y.parse().ok()).unwrap_or(0);
    let years: Vec<i32> = fold(title)
        .split(|c: char| !c.is_ascii_digit())
        .filter(|w| w.len() == 4)
        .filter_map(|w| w.parse().ok())
        .filter(|y| (2000..2100).contains(y))
        .collect();
    let old_contest = !years.is_empty() && years.iter().all(|&y| y < year_now);
    if marker || past_exam || old_contest {
        return Some(DONE.to_string());
    }
    status.map(str::to_string)
}

/// "AAAA-MM-DD" (UTC) de um instante Unix. Algoritmo civil-from-days (H. Hinnant), sem dependência.
pub fn iso_date(unix_secs: i64) -> String {
    let z = unix_secs.div_euclid(86_400) + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = yoe + era * 400 + i64::from(m <= 2);
    format!("{y:04}-{m:02}-{d:02}")
}

/// Hoje (UTC) em "AAAA-MM-DD".
pub fn today() -> String {
    let secs = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_or(0, |d| d.as_secs() as i64);
    iso_date(secs)
}

#[cfg(test)]
mod tests {
    #[test]
    fn title_key_ignores_source_suffix() {
        assert_eq!(
            title_key("Concurso INSS: edital publicado com 1.000 vagas - Blog do Concurseiro"),
            title_key("Concurso INSS: edital publicado com 1.000 vagas | Folha Dirigida")
        );
        assert_eq!(title_key("Edital TRT-2 sai em março"), "edital trt 2 sai em marco");
    }

    use super::*;

    #[test]
    fn strips_html_and_entities() {
        assert_eq!(strip_html("<p>Edital&nbsp;do <b>TRT</b> &amp; mais [&#8230;]</p>", 100), "Edital do TRT & mais …");
        assert_eq!(strip_html("abcdef", 3), "abc");
    }

    #[test]
    fn finds_images() {
        let page = r#"<head><meta name="x" content="y"><meta content='/img/capa.jpg' property="og:image"></head>"#;
        assert_eq!(og_image(page, "https://site.com/noticia/1").as_deref(), Some("https://site.com/img/capa.jpg"));
        assert_eq!(og_image(r#"<meta property="og:image" content="//cdn.x/a.png">"#, "https://s.com").as_deref(), Some("https://cdn.x/a.png"));
        assert_eq!(og_image("<meta name=description content=x>", "https://s.com"), None);
        assert_eq!(first_img(r#"<p><img data-src="x" src="https://a.com/b.jpg?w=1&amp;h=2" /></p>"#).as_deref(), Some("https://a.com/b.jpg?w=1&h=2"));
    }

    #[test]
    fn same_contest_from_different_sources() {
        assert_eq!(contest_key(Some("TRT 2ª Região"), "x").as_deref(), Some("trt 2"));
        assert_eq!(contest_key(None, "Concurso TRT-2: edital publicado com 120 vagas").as_deref(), Some("trt 2"));
        assert_eq!(contest_key(None, "Concurso INSS 2026: banca definida").as_deref(), Some("inss"));
        assert_eq!(contest_key(None, "Concurso público: edital"), None, "sem identificação: não junta");
    }

    #[test]
    fn cleans_ai_classification() {
        let c = Classified { id: 7, resumo: " Saiu o edital. ".into(), tags: vec!["Edital".into(), "Inscrições".into(), "fofoca".into()], relevancia: 3.0 };
        assert_eq!(clean(c), (7, "Saiu o edital.".to_string(), "edital,inscricoes".to_string(), 1.0));
    }

    #[test]
    fn exam_already_happened_is_never_an_open_edital() {
        let today = "2026-11-24";
        // caso real: aditivo de vagas do concurso de 2023, classificado pela IA como "edital publicado"
        let serpro = contest_status("Serpro – 3º aditivo do concurso 2023 (Analista – Tecnologia)", None, Some("edital publicado"), None, today);
        assert_eq!(serpro.as_deref(), Some(DONE));
        assert_eq!(contest_status("Concurso X", Some("convocação de aprovados"), Some("edital publicado"), None, today).as_deref(), Some(DONE));
        assert_eq!(contest_status("Concurso Y", None, Some("inscrições abertas"), Some("2026-03-01"), today).as_deref(), Some(DONE));
        // concurso do ano que vem ou deste ano, sem sinal de prova feita: mantém
        assert_eq!(contest_status("Concurso ANPD 2026", None, Some("banca definida"), Some("2027-04-18"), today).as_deref(), Some("banca definida"));
        assert_eq!(contest_status("Concurso INSS", None, Some("previsto"), None, today).as_deref(), Some("previsto"));
        // fases antes da prova não podem virar "realizada"
        assert_eq!(contest_status("Concurso ANPD: contratação do Cebraspe", None, Some("banca definida"), None, today).as_deref(), Some("banca definida"));
        assert_eq!(contest_status("TRT-2 divulga convocação para a prova", None, Some("inscrições encerradas"), Some("2026-12-07"), today).as_deref(), Some("inscrições encerradas"));
    }

    #[test]
    fn iso_date_from_unix() {
        assert_eq!(iso_date(0), "1970-01-01");
        assert_eq!(iso_date(1_795_478_400), "2026-11-24");
        assert_eq!(iso_date(951_782_400), "2000-02-29");
    }
}
