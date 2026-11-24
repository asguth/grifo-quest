//! Provas, notícias (RSS) e rastreador de concursos.

use std::time::Duration;

use sqlx::SqlitePool;
use tauri::{AppHandle, Manager, State};

use tauri_plugin_notification::NotificationExt;

use crate::ai::{self, Task};
use crate::db::exams::{self, Exam, ExamInput};
use crate::db::world::{self, Contest, ContestSource, Feed, FoundContest, NewNews, NewsItem};
use crate::domain::news;
use crate::domain::text::{self, fold};
use crate::error::{AppError, AppResult};
use crate::settings::{self, AppConfig, Profile};
use crate::{claude, ollama, sys};

/// Relevância a partir da qual a notícia é "da sua área" e vira notificação.
const NOTIFY_RELEVANCE: f64 = 0.8;

// ---------- provas ----------

#[tauri::command]
#[specta::specta]
pub async fn list_exams(pool: State<'_, SqlitePool>) -> AppResult<Vec<Exam>> {
    exams::list(&pool).await
}

#[tauri::command]
#[specta::specta]
pub async fn create_exam(pool: State<'_, SqlitePool>, input: ExamInput) -> AppResult<()> {
    let valid_date = input.exam_date.len() == 10 && input.exam_date.as_bytes()[4] == b'-';
    if input.name.trim().is_empty() || !valid_date {
        return Err(AppError::Invalid("Informe nome e data (AAAA-MM-DD) da prova".into()));
    }
    exams::create(&pool, &input).await
}

#[tauri::command]
#[specta::specta]
pub async fn delete_exam(pool: State<'_, SqlitePool>, id: i32) -> AppResult<()> {
    exams::delete(&pool, id).await
}

// ---------- feeds e notícias ----------

#[tauri::command]
#[specta::specta]
pub async fn list_feeds(pool: State<'_, SqlitePool>) -> AppResult<Vec<Feed>> {
    world::feeds(&pool).await
}

#[tauri::command]
#[specta::specta]
pub async fn add_feed(pool: State<'_, SqlitePool>, name: String, url: String) -> AppResult<()> {
    if !url.starts_with("http") {
        return Err(AppError::Invalid("URL do feed precisa começar com http".into()));
    }
    world::add_feed(&pool, name.trim(), url.trim()).await
}

#[tauri::command]
#[specta::specta]
pub async fn set_feed_active(pool: State<'_, SqlitePool>, id: i32, active: bool) -> AppResult<()> {
    world::set_feed_active(&pool, id, active).await
}

#[tauri::command]
#[specta::specta]
pub async fn delete_feed(pool: State<'_, SqlitePool>, id: i32) -> AppResult<()> {
    world::delete_feed(&pool, id).await
}

#[tauri::command]
#[specta::specta]
pub async fn list_news(pool: State<'_, SqlitePool>, limit: i32) -> AppResult<Vec<NewsItem>> {
    world::news(&pool, limit.clamp(1, 500)).await
}

/// Marca/desmarca como lida (o check do card).
#[tauri::command]
#[specta::specta]
pub async fn set_news_read(pool: State<'_, SqlitePool>, id: i32, read: bool) -> AppResult<()> {
    world::set_read(&pool, id, read).await
}

#[tauri::command]
#[specta::specta]
pub async fn mark_all_news_read(pool: State<'_, SqlitePool>) -> AppResult<i32> {
    world::mark_all_read(&pool).await
}

/// Baixa todos os feeds ativos e, em segundo plano, busca capas e classifica com a IA local.
/// Devolve quantas notícias novas entraram.
#[tauri::command]
#[specta::specta]
pub async fn refresh_news(app: AppHandle, pool: State<'_, SqlitePool>) -> AppResult<i32> {
    let n = refresh_all(&pool).await?;
    spawn_enrich(app);
    Ok(n)
}

/// Resumo/etiquetas de uma notícia agora (botão do leitor). Usa a rota de tarefas (pode cair no Claude).
#[tauri::command]
#[specta::specta]
pub async fn summarize_news(app: AppHandle, pool: State<'_, SqlitePool>, id: i32) -> AppResult<NewsItem> {
    let cfg: AppConfig = settings::load(&pool).await?;
    let item = world::news_item(&pool, id).await?;
    let area = area(&pool).await?;
    let batch = [(item.id, item.title, item.description)];
    let (raw, _) = ai::complete(&app, &cfg, Task::Text, &classify_system(&area), &batch_prompt(&batch), true).await?;
    save_classifications(&pool, &batch, &parse_batch(&raw)?).await?;
    world::news_item(&pool, id).await
}

async fn refresh_all(pool: &SqlitePool) -> AppResult<i32> {
    let cfg: AppConfig = settings::load(pool).await?;
    let keywords: Vec<String> = cfg.keywords.iter().map(|k| fold(k)).filter(|k| !k.is_empty()).collect();

    let mut seen: std::collections::HashSet<String> = world::recent_titles(pool).await?.iter().map(|t| news::title_key(t)).collect();
    let mut new_items = 0;
    for feed in world::feeds(pool).await?.into_iter().filter(|f| f.active) {
        let parsed = match fetch_feed(&feed.url).await {
            Ok(p) => p,
            Err(e) => {
                eprintln!("feed {}: {e}", feed.url);
                continue; // um feed quebrado não derruba os outros
            }
        };
        for entry in parsed.entries {
            let image = entry_image(&entry);
            let html = entry.content.as_ref().and_then(|c| c.body.clone()).or_else(|| entry.summary.as_ref().map(|t| t.content.clone()));
            let description = html.as_deref().map(|h| news::strip_html(h, 1500)).filter(|d| !d.is_empty());
            let image = image.or_else(|| html.as_deref().and_then(news::first_img));
            let (Some(title), Some(link)) = (entry.title.map(|t| t.content), entry.links.first().map(|l| l.href.clone()))
            else {
                continue;
            };
            // Mesma notícia vinda de outra fonte: fica só a primeira.
            let key = news::title_key(&title);
            if !key.is_empty() && !seen.insert(key) {
                continue;
            }
            let published = entry.published.or(entry.updated).map(|d| d.format("%Y-%m-%d %H:%M:%S").to_string());
            let item = NewNews {
                feed_id: feed.id,
                title: &title,
                link: &link,
                published: published.as_deref(),
                description: description.as_deref(),
                image_url: image.as_deref(),
            };
            if world::insert_news(pool, &item).await? {
                new_items += 1;
                // Notícia da sua área vira item do rastreador (fonte rss).
                let t = fold(&title);
                if keywords.iter().any(|k| t.contains(k.as_str())) {
                    let c = FoundContest {
                        title: title.clone(),
                        org: None,
                        banca: None,
                        status: Some("notícia".into()),
                        vacancies: None,
                        salary: None,
                        deadline: None,
                        url: link.clone(),
                        summary: Some(feed.name.clone()),
                        exam_date: None,
                    };
                    world::upsert_contest(pool, &c, ContestSource::Rss).await?;
                }
            }
        }
    }
    world::prune_news(pool).await?;
    Ok(new_items)
}

async fn fetch_feed(url: &str) -> AppResult<feed_rs::model::Feed> {
    let bytes = sys::http().get(url).timeout(Duration::from_secs(20)).send().await?.bytes().await?;
    feed_rs::parser::parse(&bytes[..]).map_err(|e| AppError::Invalid(e.to_string()))
}

/// Capa da própria entrada do RSS: media:thumbnail, media:content de imagem ou enclosure de imagem.
fn entry_image(e: &feed_rs::model::Entry) -> Option<String> {
    for m in &e.media {
        if let Some(t) = m.thumbnails.first() {
            return Some(t.image.uri.clone());
        }
        let img = m.content.iter().find(|c| c.content_type.as_ref().is_none_or(|t| t.to_string().starts_with("image/")));
        if let Some(url) = img.and_then(|c| c.url.as_ref()) {
            return Some(url.to_string());
        }
    }
    e.links.iter().find(|l| l.media_type.as_deref().is_some_and(|t| t.starts_with("image/"))).map(|l| l.href.clone())
}

/// Atualiza as notícias ao abrir e a cada 3 horas.
pub fn spawn_news_refresher(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        if let Err(e) = world::backfill_keys(&app.state::<SqlitePool>()).await {
            eprintln!("concursos (chaves antigas): {e}");
        }
        loop {
            let pool = app.state::<SqlitePool>();
            if let Err(e) = refresh_all(&pool).await {
                eprintln!("notícias: {e}");
            }
            if let Err(e) = enrich(&app).await {
                eprintln!("notícias (capas/IA): {e}");
            }
            tokio::time::sleep(Duration::from_secs(3 * 3600)).await;
        }
    });
}

fn spawn_enrich(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        if let Err(e) = enrich(&app).await {
            eprintln!("notícias (capas/IA): {e}");
        }
    });
}

/// Área para medir relevância: a do perfil, ou a do rastreador.
async fn area(pool: &SqlitePool) -> AppResult<String> {
    let p: Profile = settings::load(pool).await?;
    if !p.area.trim().is_empty() {
        return Ok(p.area);
    }
    let c: AppConfig = settings::load(pool).await?;
    Ok(if c.interest_area.trim().is_empty() { "concursos públicos em geral".into() } else { c.interest_area })
}

fn classify_system(area: &str) -> String {
    format!(
        "Você classifica notícias de concursos públicos para um candidato da área: {area}. Para cada item devolva: \
         resumo (1 a 2 frases em português do Brasil, só fatos: órgão, cargos, vagas, salário, datas; sem opinião), \
         tags (até 3, só destas: {tags}), relevancia de 0 a 1 para essa área (1 = concurso da área com edital ou inscrições; \
         0 = nada a ver). Responda SOMENTE JSON: {{\"itens\":[{{\"id\":1,\"resumo\":\"...\",\"tags\":[\"edital\"],\"relevancia\":0.7}}]}}",
        tags = news::TAGS.join(", ")
    )
}

type NewsForAi = (i32, String, Option<String>);

fn batch_prompt(items: &[NewsForAi]) -> String {
    let list: Vec<serde_json::Value> = items
        .iter()
        .map(|(id, title, text)| {
            serde_json::json!({ "id": id, "titulo": title, "texto": text::head(text.as_deref().unwrap_or(""), 600) })
        })
        .collect();
    format!("NOTÍCIAS:\n{}", serde_json::Value::Array(list))
}

fn parse_batch(raw: &str) -> AppResult<Vec<news::Classified>> {
    let b: news::ClassifiedBatch = ai::parse_object(raw, "Classificação das notícias")?;
    Ok(b.itens)
}

/// Grava só o que a IA devolveu para notícias do lote e com resumo. Devolve os títulos relevantes.
async fn save_classifications(pool: &SqlitePool, batch: &[NewsForAi], found: &[news::Classified]) -> AppResult<Vec<String>> {
    let mut relevant = Vec::new();
    for c in found {
        let (id, summary, tags, rel) = news::clean(c.clone());
        let Some(item) = batch.iter().find(|x| x.0 == id) else { continue }; // id inventado pela IA
        if summary.is_empty() {
            continue;
        }
        world::set_classification(pool, id, &summary, &tags, rel).await?;
        if rel >= NOTIFY_RELEVANCE {
            relevant.push(item.1.clone());
        }
    }
    Ok(relevant)
}

/// Em segundo plano: capa (og:image) das notícias sem imagem e classificação pela IA local.
/// Só usa o Ollama: o Claude não é gasto sem você pedir.
async fn enrich(app: &AppHandle) -> AppResult<()> {
    let pool = app.state::<SqlitePool>();
    for (id, link) in world::needing_image(&pool, 40).await? {
        // Página fora do ar ou sem og:image: grava sem capa para não tentar de novo.
        let img = match sys::http().get(&link).timeout(Duration::from_secs(8)).send().await {
            Ok(r) => r.text().await.ok().and_then(|html| news::og_image(text::head(&html, 300_000), &link)),
            Err(_) => None,
        };
        world::set_image(&pool, id, img.as_deref()).await?;
    }

    let cfg: AppConfig = settings::load(&pool).await?;
    // classificação de fundo só com IA local (e placa que aguente): não gasta o Claude
    if !crate::gpu::info().await.local_ai || !ollama::is_up(&cfg.ollama_url).await {
        return Ok(());
    }
    let area = area(&pool).await?;
    let system = classify_system(&area);
    let mut notified = 0;
    for chunk in world::needing_summary(&pool, 24).await?.chunks(8) {
        let messages = [ollama::Msg { role: "system", content: &system }, ollama::Msg { role: "user", content: &batch_prompt(chunk) }];
        let raw = ollama::chat(&cfg.ollama_url, &cfg.task_model, &messages, true).await?;
        // Um lote ilegível não impede os próximos.
        let found = parse_batch(&raw).unwrap_or_else(|e| {
            eprintln!("notícias: {e}");
            Vec::new()
        });
        for title in save_classifications(&pool, chunk, &found).await? {
            if notified < 3 {
                notified += 1;
                if let Err(e) = app.notification().builder().title("Notícia da sua área").body(&title).show() {
                    eprintln!("notificação: {e}");
                }
            }
        }
    }
    Ok(())
}

// ---------- rastreador ----------

#[tauri::command]
#[specta::specta]
pub async fn list_contests(pool: State<'_, SqlitePool>) -> AppResult<Vec<Contest>> {
    world::contests(&pool).await
}

#[tauri::command]
#[specta::specta]
pub async fn set_contest_followed(pool: State<'_, SqlitePool>, id: i32, followed: bool) -> AppResult<()> {
    world::set_followed(&pool, id, followed).await
}

#[tauri::command]
#[specta::specta]
pub async fn delete_contest(pool: State<'_, SqlitePool>, id: i32) -> AppResult<()> {
    world::delete_contest(&pool, id).await
}

/// Pede ao Claude (CLI headless + WebSearch) concursos da área configurada. Devolve quantos novos.
#[tauri::command]
#[specta::specta]
pub async fn search_contests_with_claude(app: AppHandle, pool: State<'_, SqlitePool>) -> AppResult<i32> {
    let cfg: AppConfig = settings::load(&pool).await?;
    if cfg.interest_area.trim().is_empty() {
        return Err(AppError::Invalid("Defina sua área de interesse em Config → Concursos".into()));
    }
    let prompt = format!(
        "Pesquise na web concursos públicos no Brasil com edital aberto, publicado recentemente, \
         previsto ou autorizado para a área: {area}. Palavras-chave extras: {kw}. \
         Use fontes confiáveis (sites das bancas, diários oficiais, PCI Concursos, portais de concursos). \
         Responda SOMENTE com um array JSON (sem markdown), no máximo 15 itens, cada um com os campos: \
         title, org, banca, status (autorizado|banca definida|edital publicado|inscrições abertas|previsto), \
         vacancies, salary, deadline (AAAA-MM-DD se souber), url (link da fonte), summary (1 frase). \
         Use null quando não souber.",
        area = cfg.interest_area,
        kw = cfg.keywords.join(", "),
    );
    let cwd = app.path().app_data_dir()?;
    let text = claude::run(&cfg.claude_cli, &prompt, &cwd, &["WebSearch", "WebFetch"]).await?;
    let json = ai::json_array(&text).ok_or_else(|| AppError::Invalid("Claude não devolveu uma lista".into()))?;
    let found: Vec<FoundContest> =
        serde_json::from_str(json).map_err(|e| AppError::Invalid(format!("JSON do Claude inválido: {e}")))?;

    let mut new = 0;
    for c in found.iter().filter(|c| c.url.starts_with("http") && !c.title.trim().is_empty()) {
        if world::upsert_contest(&pool, c, ContestSource::Claude).await? {
            new += 1;
        }
    }
    Ok(new)
}
