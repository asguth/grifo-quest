//! Comunidade (Grifo Quest Cloud): o que precisa do Rust além da conta. Hoje, a questão do dia:
//! a primeira pessoa que abre a comunidade no dia gera a questão com a IA que ela já usa no app
//! (Ollama, Claude, ChatGPT…), sem servidor de IA nem chave secreta na nuvem.

use serde::Serialize;
use sqlx::SqlitePool;
use tauri::{AppHandle, State};

use crate::account;
use crate::ai::{self, Task};
use crate::domain::study::{self as rules, GeneratedQuestion};
use crate::domain::text::head;
use crate::error::{AppError, AppResult};
use crate::settings::{self, AppConfig};

/// Questão pronta para ir ao servidor (`daily_questions`).
#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct DailyDraft {
    pub statement: String,
    pub options: Vec<String>,
    /// Índice da alternativa certa (0 = A).
    pub answer: i32,
    pub explanation: String,
}

const SYSTEM: &str = "Você é examinador de concursos públicos brasileiros. Escreve questões inéditas, corretas e com base legal atual. Responda só com JSON.";

fn prompt(theme: &str) -> String {
    format!(
        "Crie UMA questão inédita de múltipla escolha, no nível de prova de concurso, sobre o tema desta comunidade de estudos:\n\
         \"{}\"\n\
         Se o tema for um concurso ou uma banca, escolha um assunto que costuma cair nele. \
         Formato: {{\"enunciado\":\"...\",\"alternativas\":[\"...\",\"...\",\"...\",\"...\",\"...\"],\"gabarito\":\"B\",\"comentario\":\"por que a certa está certa e as outras erradas, com a base legal\"}}. \
         Exatamente 5 alternativas, sem a letra na frente. Enunciado com no máximo 900 caracteres e comentário com no máximo 900.",
        head(theme.trim(), 400)
    )
}

/// Questão gerada → rascunho. Só múltipla escolha (a enquete do mural mostra alternativas).
fn to_draft(q: GeneratedQuestion) -> Option<DailyDraft> {
    let v = rules::validate(q)?;
    if v.options.is_empty() {
        return None;
    }
    let answer = rules::letter_index(&v.answer)?;
    Some(DailyDraft {
        statement: head(&v.statement, 1500).to_string(),
        options: v.options.iter().map(|o| head(o, 300).to_string()).collect(),
        answer: i32::try_from(answer).ok()?,
        explanation: head(&v.explanation, 1500).to_string(),
    })
}

#[tauri::command]
#[specta::specta]
pub async fn daily_question_draft(app: AppHandle, pool: State<'_, SqlitePool>, theme: String) -> AppResult<DailyDraft> {
    account::require()?;
    let cfg: AppConfig = settings::load(&pool).await?;
    let (raw, _) = ai::complete(&app, &cfg, Task::Text, SYSTEM, &prompt(&theme), true).await?;
    let q: GeneratedQuestion = ai::parse_object(&raw, "Questão do dia")?;
    to_draft(q).ok_or_else(|| AppError::Invalid("A IA não gerou uma questão válida. Tente de novo.".into()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn generated(alternativas: &[&str], gabarito: &str) -> GeneratedQuestion {
        serde_json::from_value(serde_json::json!({
            "enunciado": "Sobre os atos administrativos, assinale a alternativa correta.",
            "alternativas": alternativas,
            "gabarito": gabarito,
            "comentario": "Base legal: Lei 9.784/99."
        }))
        .expect("questão")
    }

    #[test]
    fn letter_becomes_index() {
        let d = to_draft(generated(&["A) um", "b) dois", "três", "quatro", "cinco"], "Letra B")).expect("rascunho");
        assert_eq!(d.answer, 1);
        assert_eq!(d.options[0], "um");
    }

    #[test]
    fn true_false_is_rejected() {
        assert!(to_draft(generated(&[], "C")).is_none());
    }

    #[test]
    fn theme_is_capped() {
        assert!(prompt(&"x".repeat(5000)).len() < 2000);
    }
}
