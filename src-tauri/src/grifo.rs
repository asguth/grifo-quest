//! Grifo nativo. A skill (MIT/CC BY, do mesmo autor) vem dentro do app em `resources/grifo`.
//! - Modo rápido (Ollama ou Claude só texto): o app monta o prompt com as regras da própria skill
//!   (especificação do comando, perfis de banca, fidelidade) e pede Markdown.
//! - Modo completo (Claude CLI): o Claude roda a skill de verdade e gera o HTML/PDF A4.

use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager};

use crate::domain::text::head;
use crate::error::{AppError, AppResult};

wire_enum! {
    /// O nome de cada variante é o comando da skill (`/resumo`, `/questoes`…).
    pub enum MaterialKind {
        Resumo = "resumo",
        Questoes = "questoes",
        Flashcards = "flashcards",
        Mnemonico = "mnemonico",
        Pegadinhas = "pegadinhas",
    }
}

impl MaterialKind {
    /// Como o resultado deve aparecer em Markdown (o resto da spec fala de HTML/A4).
    fn markdown_shape(self) -> &'static str {
        match self {
            MaterialKind::Resumo => "Seções `##` por subtema, uma tabela comparativa quando houver institutos parecidos, \
                pelo menos uma caixa IMPORTANTE, uma DICA e uma PEGADINHA. No fim, 5 questões e o gabarito comentado.",
            MaterialKind::Questoes => "Numere as questões (`### Questão 1`). Para A–E, alternativas em lista `- A) ...`. \
                Para Certo/Errado, um item por questão. Depois de todas, uma linha `---`, o título `## Gabarito comentado` \
                e, para cada questão, a resposta, por que está certa e por que cada distrator está errado.",
            MaterialKind::Flashcards => "Uma tabela Markdown `| Frente | Verso |`, um fato por linha, 16 cartões.",
            MaterialKind::Mnemonico => "Para cada lista memorizável: a sigla ou frase em `###`, a lista completa e uma imagem mental curta.",
            MaterialKind::Pegadinhas => "Para cada armadilha: a assertiva errada no estilo da banca (caixa PEGADINHA), \
                a versão correta (caixa DICA) e o fundamento. Agrupe por tipo com `##`.",
        }
    }
}

/// Seção `## /<cmd>` do comandos.md, até o próximo título `## `.
fn command_spec<'a>(comandos: &'a str, cmd: &str) -> Option<&'a str> {
    let start = comandos.find(&format!("## /{cmd} "))?;
    let rest = &comandos[start..];
    let end = rest[3..].find("\n## ").map_or(rest.len(), |i| i + 3);
    Some(rest[..end].trim())
}

/// O tópico para o qual o material é escrito.
pub struct Topic {
    pub name: String,
    pub subject: String,
    pub banca: Option<String>,
    /// Material de referência do aluno (priorizado pelo modelo).
    pub reference: Option<String>,
}

/// Como o modo rápido devolve o resultado.
pub enum Output<'a> {
    Markdown,
    /// Só JSON, no formato descrito (exemplo do objeto + regras extras).
    Json(&'a str),
}

/// Prompt (sistema, usuário) do modo rápido, montado com os textos da própria skill.
pub fn quick_prompt(app: &AppHandle, kind: MaterialKind, output: Output<'_>, topic: &Topic) -> AppResult<(String, String)> {
    let system = quick_system(
        kind,
        output,
        &read_skill_file(app, "references/comandos.md")?,
        &read_skill_file(app, "references/bancas.md")?,
        &read_skill_file(app, "references/fidelidade.md")?,
    );
    Ok((system, quick_user(kind, topic)))
}

fn quick_system(kind: MaterialKind, output: Output<'_>, comandos: &str, bancas: &str, fidelidade: &str) -> String {
    let spec = command_spec(comandos, kind.as_str()).unwrap_or("");
    let (saida, forma) = match output {
        Output::Markdown => (
            "somente Markdown (sem HTML, sem bloco de código em volta, sem comentários sobre o pedido).".to_string(),
            format!(
                "CAIXAS: escreva como citação começando pelo rótulo em negrito: `> **IMPORTANTE:** ...`, `> **DICA:** ...`, \
                 `> **PEGADINHA:** ...`, `> **EXCEÇÃO:** ...`. O núcleo a decorar vai em **negrito**.\nFORMA: {}",
                kind.markdown_shape()
            ),
        ),
        Output::Json(format) => (format!("somente JSON, sem texto antes ou depois. {format}"), String::new()),
    };
    format!(
        "Você é o Grifo, autor de material de estudo para concursos públicos. Escreva em português do Brasil.\n\
         SAÍDA: {saida} Ignore o que a especificação abaixo diz sobre folhas A4, classes CSS, colunas e figuras.\n\
         {forma}\n\
         FIDELIDADE: nunca invente artigo, súmula, prazo ou número. Se não tiver certeza de um dado, escreva \
         \"(conferir na fonte)\" ao lado. Questões são sempre inéditas, nunca cópias de provas reais.\n\n\
         # Especificação do comando\n{spec}\n\n# Perfis de banca\n{bancas}\n\n# Regras de fidelidade (resumo)\n{fid}",
        fid = head(fidelidade, 2_500),
    )
}

fn quick_user(kind: MaterialKind, t: &Topic) -> String {
    let banca = t.banca.as_deref().unwrap_or("indefinida (use o padrão: metade C/E, metade A–E)");
    let reference =
        t.reference.as_deref().map_or(String::new(), |r| format!("\n\nMATERIAL DE REFERÊNCIA DO ALUNO (priorize):\n{}", head(r, 12_000)));
    format!("/{} \"{}\" — matéria: {}; banca: {banca}.{reference}", kind.as_str(), t.name, t.subject)
}

/// Pedido do modo completo (Claude CLI + skill). Tudo é salvo em `out`.
pub fn full_prompt(kind: MaterialKind, t: &Topic, out: &Path) -> String {
    let banca = t.banca.as_deref().map_or(String::new(), |b| format!(" --banca \"{b}\""));
    let md = if kind == MaterialKind::Resumo {
        " Ao final, salve também o conteúdo completo em texto puro no arquivo material.md nessa mesma pasta."
    } else {
        ""
    };
    format!(
        "Carregue a skill `grifo` com a ferramenta Skill e execute: /{cmd} \"{topic}\"{banca} \
         (matéria: {subject}; concurso público; idioma pt-BR). Não faça perguntas: use os padrões da skill. \
         Salve TODOS os arquivos gerados na pasta {out}.{md}",
        cmd = kind.as_str(),
        topic = t.name,
        subject = t.subject,
        out = out.display()
    )
}

fn skill_dir(app: &AppHandle) -> AppResult<PathBuf> {
    Ok(app.path().resource_dir()?.join("grifo"))
}

pub fn read_skill_file(app: &AppHandle, rel: &str) -> AppResult<String> {
    let p = skill_dir(app)?.join(rel);
    std::fs::read_to_string(&p).map_err(|e| AppError::Invalid(format!("Skill do Grifo incompleta ({}): {e}", p.display())))
}

pub fn bundled_version(app: &AppHandle) -> AppResult<String> {
    Ok(read_skill_file(app, "VERSION")?.trim().to_string())
}

/// Pasta de trabalho do Claude: `<app_data>/grifo`, com a skill em `.claude/skills/grifo`
/// (o Claude Code acha skills do projeto ali). Recopia quando a versão embutida muda.
pub fn workdir(app: &AppHandle) -> AppResult<PathBuf> {
    let work = app.path().app_data_dir()?.join("grifo");
    let dst = work.join(".claude").join("skills").join("grifo");
    let installed = std::fs::read_to_string(dst.join("VERSION")).unwrap_or_default();
    if installed.trim() != bundled_version(app)? {
        if dst.exists() {
            std::fs::remove_dir_all(&dst)?;
        }
        copy_dir(&skill_dir(app)?, &dst)?;
    }
    Ok(work)
}

fn copy_dir(src: &Path, dst: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let to = dst.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_dir(&entry.path(), &to)?;
        } else {
            std::fs::copy(entry.path(), to)?;
        }
    }
    Ok(())
}

pub fn find_ext(dir: &Path, ext: &str) -> Option<PathBuf> {
    let mut files: Vec<PathBuf> = std::fs::read_dir(dir).ok()?.filter_map(|e| e.ok().map(|e| e.path())).collect();
    files.sort();
    files.into_iter().find(|p| p.extension().is_some_and(|e| e == ext))
}

#[cfg(test)]
mod tests {
    use super::*;

    const COMANDOS: &str = "# Comandos\n\n## /resumo `<t>`\nSaída: folhas.\n\n## /questoes `<t>`\nInéditas.\nA–E.\n\n## /flashcards `<t>`\nCartões.";

    #[test]
    fn extracts_command_spec_until_next_heading() {
        assert_eq!(command_spec(COMANDOS, "questoes"), Some("## /questoes `<t>`\nInéditas.\nA–E."));
        assert_eq!(command_spec(COMANDOS, "flashcards"), Some("## /flashcards `<t>`\nCartões."));
        assert_eq!(command_spec(COMANDOS, "lei-seca"), None);
    }

    #[test]
    fn real_skill_has_every_quick_kind() {
        let comandos = include_str!("../resources/grifo/references/comandos.md");
        for &k in MaterialKind::ALL {
            assert!(command_spec(comandos, k.as_str()).is_some(), "{k:?} sem seção no comandos.md");
        }
    }

    #[test]
    fn json_output_never_asks_for_markdown() {
        let s = quick_system(MaterialKind::Questoes, Output::Json("{}"), COMANDOS, "", "");
        assert!(!s.contains("Markdown") && s.contains("somente JSON"));
        let m = quick_system(MaterialKind::Questoes, Output::Markdown, COMANDOS, "", "");
        assert!(m.contains("somente Markdown") && m.contains("Inéditas."));
    }
}
