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
}
