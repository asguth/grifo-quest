//! Texto: comparação sem acento/caixa e cortes por caractere (nunca no meio de um UTF-8).

/// Minúsculas, sem acento e com espaços normalizados ("  Língua   Portuguesa " = "lingua portuguesa").
pub fn fold(s: &str) -> String {
    s.to_lowercase()
        .chars()
        .map(|c| match c {
            'á' | 'à' | 'â' | 'ã' | 'ä' => 'a',
            'é' | 'è' | 'ê' | 'ë' => 'e',
            'í' | 'ì' | 'î' | 'ï' => 'i',
            'ó' | 'ò' | 'ô' | 'õ' | 'ö' => 'o',
            'ú' | 'ù' | 'û' | 'ü' => 'u',
            'ç' => 'c',
            'ñ' => 'n',
            other => other,
        })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

/// Os primeiros `max_chars` caracteres.
pub fn head(s: &str, max_chars: usize) -> &str {
    s.char_indices().nth(max_chars).map_or(s, |(i, _)| &s[..i])
}

/// Os últimos `max_chars` caracteres.
pub fn tail(s: &str, max_chars: usize) -> &str {
    let n = s.chars().count();
    if n <= max_chars {
        return s;
    }
    s.char_indices().nth(n - max_chars).map_or(s, |(i, _)| &s[i..])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn folds_case_accents_and_spaces() {
        assert_eq!(fold("  Língua   Portuguesa "), "lingua portuguesa");
        assert_eq!(fold("NOÇÕES de Informática"), "nocoes de informatica");
    }

    #[test]
    fn cuts_on_char_boundaries() {
        assert_eq!(head("ação", 2), "aç");
        assert_eq!(tail("ação", 2), "ão");
        assert_eq!(head("ab", 5), "ab");
        assert_eq!(tail("ab", 5), "ab");
    }
}
