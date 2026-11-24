//! Materiais do Grifo por tópico: modo rápido (roteador de IA, Markdown) e modo completo
//! (Claude CLI + skill, HTML/PDF). Um trabalho por tópico; dá para cancelar.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_opener::OpenerExt;
use tauri_specta::Event;
use tokio::sync::Notify;

use crate::ai::{self, Provider, Route, Task};
use crate::claude;
use crate::db::classes;
use crate::db::materials::{self, Material};
use crate::error::{AppError, AppResult};
use crate::grifo::{self, MaterialKind, Output};
use crate::settings::{self, AppConfig};

/// Trabalhos em andamento, por tópico. O `Notify` cancela.
#[derive(Default)]
pub struct GrifoJobs(Mutex<HashMap<i32, Arc<Notify>>>);

/// Tira o trabalho da lista ao terminar (com sucesso, erro ou cancelamento).
struct JobGuard<'a> {
    jobs: &'a GrifoJobs,
    topic_id: i32,
}

impl Drop for JobGuard<'_> {
    fn drop(&mut self) {
        if let Ok(mut m) = self.jobs.0.lock() {
            m.remove(&self.topic_id);
        }
    }
}

fn start_job(jobs: &GrifoJobs, topic_id: i32) -> AppResult<(JobGuard<'_>, Arc<Notify>)> {
    let mut m = jobs.0.lock().map_err(|_| AppError::Invalid("estado do Grifo corrompido".into()))?;
    if m.contains_key(&topic_id) {
        return Err(AppError::Invalid("Já tem um material sendo gerado para este tópico".into()));
    }
    let n = Arc::new(Notify::new());
    m.insert(topic_id, n.clone());
    Ok((JobGuard { jobs, topic_id }, n))
}

/// O que o Grifo está fazendo agora (modo completo narra cada passo do Claude).
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type, tauri_specta::Event)]
pub struct GrifoEvent {
    pub topic_id: i32,
    pub text: String,
}

#[derive(Debug, Serialize, specta::Type)]
pub struct Generated {
    pub material: Material,
    /// Aviso para o usuário (ex.: caiu no Claude porque o Ollama estava fora do ar).
    pub note: Option<String>,
}

#[derive(Debug, Serialize, specta::Type)]
pub struct MaterialView {
    pub material: Material,
    pub markdown: Option<String>,
    /// HTML autocontido do modo completo.
    pub html: Option<String>,
}

#[tauri::command]
#[specta::specta]
pub async fn list_materials(pool: State<'_, SqlitePool>, topic_id: i32) -> AppResult<Vec<Material>> {
    materials::list(&pool, topic_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn material_view(pool: State<'_, SqlitePool>, id: i32) -> AppResult<MaterialView> {
    let (material, content) = materials::get(&pool, id).await?;
    let html = match material.path.as_deref() {
        Some(p) if p.ends_with(".html") => {
            Some(std::fs::read_to_string(p).map_err(|e| AppError::Invalid(format!("Não achei o arquivo do material ({p}): {e}")))?)
        }
        _ => None,
    };
    let markdown = if material.full { None } else { content };
    Ok(MaterialView { material, markdown, html })
}

#[tauri::command]
#[specta::specta]
pub async fn delete_material(pool: State<'_, SqlitePool>, id: i32) -> AppResult<()> {
    materials::delete(&pool, id).await
}

/// Abre o HTML/PDF do material no programa padrão do Windows.
#[tauri::command]
#[specta::specta]
pub async fn open_material_file(app: AppHandle, pool: State<'_, SqlitePool>, id: i32) -> AppResult<()> {
    let path = materials::get(&pool, id).await?.0.path.ok_or_else(|| AppError::Invalid("Esse material não tem arquivo".into()))?;
    app.opener().open_path(path, None::<&str>).map_err(|e| AppError::Invalid(e.to_string()))
}

#[tauri::command]
#[specta::specta]
pub fn cancel_material(jobs: State<'_, GrifoJobs>, topic_id: i32) {
    if let Some(n) = jobs.0.lock().ok().and_then(|m| m.get(&topic_id).cloned()) {
        n.notify_one();
    }
}

/// Gera um material. `full = false`: rápido, pelo roteador (Config → IA). `full = true`: apostila do Claude.
#[tauri::command]
#[specta::specta]
pub async fn generate_material(
    app: AppHandle,
    pool: State<'_, SqlitePool>,
    jobs: State<'_, GrifoJobs>,
    topic_id: i32,
    kind: MaterialKind,
    full: bool,
) -> AppResult<Generated> {
    generate(&app, &pool, &jobs, topic_id, kind, full).await
}

pub async fn generate(app: &AppHandle, pool: &SqlitePool, jobs: &GrifoJobs, topic_id: i32, kind: MaterialKind, full: bool) -> AppResult<Generated> {
    let (_guard, cancel) = start_job(jobs, topic_id)?;
    if full {
        // O cancelamento vai até o run_job, que derruba a árvore de processos do Claude.
        return generate_full(app, pool, topic_id, kind, &cancel).await;
    }
    tokio::select! {
        r = generate_quick(app, pool, topic_id, kind) => r,
        () = cancel.notified() => Err(AppError::cancelled()),
    }
}

async fn generate_quick(app: &AppHandle, pool: &SqlitePool, topic_id: i32, kind: MaterialKind) -> AppResult<Generated> {
    let cfg: AppConfig = settings::load(pool).await?;
    let topic = materials::topic_for_prompt(pool, topic_id).await?;
    let (system, user) = grifo::quick_prompt(app, kind, Output::Markdown, &topic)?;

    let who = ai::provider_for(&cfg, Task::Text).await.label();
    let _ = GrifoEvent { topic_id, text: format!("Escrevendo com {who}…") }.emit(app);
    let (text, provider) = ai::complete(app, &cfg, Task::Text, &system, &user, false).await?;
    let text = clean_markdown(&text);
    if text.is_empty() {
        return Err(AppError::Invalid("A IA devolveu um texto vazio".into()));
    }

    let material = materials::insert(pool, topic_id, kind, provider, false, Some(&text), None).await?;
    // O primeiro resumo vira material de referência da Sala de aula (a apostila completa sempre substitui).
    if kind == MaterialKind::Resumo && topic.reference.is_none() {
        classes::set_material(pool, topic_id, &text, None).await?;
    }
    let note = (cfg.material_route == Route::Auto && provider == Provider::Claude && crate::gpu::info().await.local_ai)
        .then(|| "O Ollama não respondeu, então usei o Claude.".to_string());
    Ok(Generated { material, note })
}

async fn generate_full(app: &AppHandle, pool: &SqlitePool, topic_id: i32, kind: MaterialKind, cancel: &Notify) -> AppResult<Generated> {
    let cfg: AppConfig = settings::load(pool).await?;
    let topic = materials::topic_for_prompt(pool, topic_id).await?;
    let stamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_or(0, |d| d.as_secs());
    let out = app.path().app_data_dir()?.join("apostilas").join(topic_id.to_string()).join(format!("{}-{stamp}", kind.as_str()));
    std::fs::create_dir_all(&out)?;
    let work = grifo::workdir(app)?;

    let _ = GrifoEvent { topic_id, text: "Chamando o Claude…".into() }.emit(app);
    let prompt = grifo::full_prompt(kind, &topic, &out);
    let tools = ["Skill", "Read", "Write", "Edit", "Glob", "Grep", "Bash", "WebFetch", "WebSearch"];
    let on_progress = |text: String| {
        let _ = GrifoEvent { topic_id, text }.emit(app);
    };
    claude::run_job(&cfg.claude_cli, &prompt, &work, &tools, Some(&out), on_progress, Some(cancel)).await?;

    let doc = grifo::find_ext(&out, "html")
        .or_else(|| grifo::find_ext(&out, "pdf"))
        .ok_or_else(|| AppError::Invalid(format!("O Grifo terminou sem gerar HTML/PDF em {}", out.display())))?;
    let path = doc.to_string_lossy().to_string();
    // Só o resumo pede o `material.md`; nos outros tipos ele não existe.
    let text = std::fs::read_to_string(out.join("material.md")).ok();
    let material = materials::insert(pool, topic_id, kind, Provider::Claude, true, text.as_deref(), Some(&path)).await?;
    if let (MaterialKind::Resumo, Some(t)) = (kind, &text) {
        classes::set_material(pool, topic_id, t, Some(&path)).await?;
    }
    Ok(Generated { material, note: None })
}

/// Tira cercas ```markdown que alguns modelos põem em volta da resposta e blocos <think>.
fn clean_markdown(s: &str) -> String {
    let mut t = s.trim();
    if let Some(end) = t.find("</think>") {
        t = t[end + "</think>".len()..].trim();
    }
    if t.starts_with("```") {
        t = t.split_once('\n').map_or("", |(_, rest)| rest);
        t = t.trim_end().strip_suffix("```").unwrap_or(t).trim();
    }
    t.to_string()
}

#[cfg(test)]
mod tests {
    use super::clean_markdown;

    #[test]
    fn strips_fences_and_think() {
        assert_eq!(clean_markdown("```markdown\n## Oi\ntexto\n```"), "## Oi\ntexto");
        assert_eq!(clean_markdown("<think>hmm</think>\n## Oi"), "## Oi");
        assert_eq!(clean_markdown("## Já limpo"), "## Já limpo");
    }
}
