//! Notícias (RSS), feeds e concursos rastreados.

use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

use crate::domain::news;
use crate::error::{AppError, AppResult};

wire_enum! {
    /// De onde veio o concurso. O Claude pesquisa a fundo; o RSS só acha a manchete.
    pub enum ContestSource {
        Claude = "claude",
        Rss = "rss",
    }
}

#[derive(Debug, Serialize, specta::Type, sqlx::FromRow)]
pub struct Feed {
    pub id: i32,
    pub name: String,
    pub url: String,
    pub active: bool,
}

#[derive(Debug, Serialize, specta::Type, sqlx::FromRow)]
pub struct NewsItem {
    pub id: i32,
    pub feed: String,
    pub title: String,
    pub link: String,
    pub published_at: Option<String>,
    pub read: bool,
    pub image_url: Option<String>,
    /// Texto do RSS, já sem HTML.
    pub description: Option<String>,
    /// Resumo de 1–2 frases da IA local.
    pub summary: Option<String>,
    /// Etiquetas separadas por vírgula ("edital,inscricoes").
    pub tags: Option<String>,
    /// 0–1: quanto interessa para a sua área.
    pub relevance: Option<f64>,
}

#[derive(Debug, Serialize, specta::Type, sqlx::FromRow)]
pub struct Contest {
    pub id: i32,
    pub title: String,
    pub org: Option<String>,
    pub banca: Option<String>,
    pub status: Option<String>,
    pub vacancies: Option<String>,
    pub salary: Option<String>,
    pub deadline: Option<String>,
    pub url: String,
    pub summary: Option<String>,
    pub source: String,
    pub followed: bool,
    pub found_at: String,
}

/// Formato pedido ao Claude no rastreador.
#[derive(Debug, Clone, Deserialize)]
pub struct FoundContest {
    pub title: String,
    pub org: Option<String>,
    pub banca: Option<String>,
    pub status: Option<String>,
    pub vacancies: Option<String>,
    pub salary: Option<String>,
    pub deadline: Option<String>,
    pub url: String,
    pub summary: Option<String>,
    /// Data da prova (AAAA-MM-DD), quando a fonte diz. Só serve para a trava de status.
    #[serde(default)]
    pub exam_date: Option<String>,
}

pub async fn feeds(pool: &SqlitePool) -> AppResult<Vec<Feed>> {
    Ok(sqlx::query_as("SELECT id, name, url, active FROM feeds ORDER BY name").fetch_all(pool).await?)
}

pub async fn add_feed(pool: &SqlitePool, name: &str, url: &str) -> AppResult<()> {
    sqlx::query("INSERT INTO feeds (name, url) VALUES (?, ?)").bind(name).bind(url).execute(pool).await?;
    Ok(())
}

pub async fn set_feed_active(pool: &SqlitePool, id: i32, active: bool) -> AppResult<()> {
    sqlx::query("UPDATE feeds SET active = ? WHERE id = ?").bind(active).bind(id).execute(pool).await?;
    Ok(())
}

pub async fn delete_feed(pool: &SqlitePool, id: i32) -> AppResult<()> {
    sqlx::query("DELETE FROM feeds WHERE id = ?").bind(id).execute(pool).await?;
    Ok(())
}

/// Insere a notícia se o link for novo. Devolve se inseriu.
pub struct NewNews<'a> {
    pub feed_id: i32,
    pub title: &'a str,
    pub link: &'a str,
    pub published: Option<&'a str>,
    pub description: Option<&'a str>,
    pub image_url: Option<&'a str>,
}

pub async fn insert_news(pool: &SqlitePool, n: &NewNews<'_>) -> AppResult<bool> {
    let res = sqlx::query(
        "INSERT OR IGNORE INTO news_items (feed_id, title, link, published_at, description, image_url, image_checked)
         VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(n.feed_id)
    .bind(n.title)
    .bind(n.link)
    .bind(n.published)
    .bind(n.description)
    .bind(n.image_url)
    .bind(n.image_url.is_some())
    .execute(pool)
    .await?;
    Ok(res.rows_affected() > 0)
}

/// Títulos das notícias dos últimos 14 dias (para não repetir a mesma vinda de outra fonte).
pub async fn recent_titles(pool: &SqlitePool) -> AppResult<Vec<String>> {
    Ok(sqlx::query_scalar("SELECT title FROM news_items WHERE COALESCE(published_at, datetime('now')) >= datetime('now','-14 days')").fetch_all(pool).await?)
}

/// Notícias que ainda não tiveram a página olhada atrás de imagem (mais novas primeiro).
pub async fn needing_image(pool: &SqlitePool, limit: i32) -> AppResult<Vec<(i32, String)>> {
    Ok(sqlx::query_as("SELECT id, link FROM news_items WHERE image_checked = 0 ORDER BY published_at DESC, id DESC LIMIT ?")
        .bind(limit)
        .fetch_all(pool)
        .await?)
}

pub async fn set_image(pool: &SqlitePool, id: i32, url: Option<&str>) -> AppResult<()> {
    sqlx::query("UPDATE news_items SET image_url = COALESCE(?, image_url), image_checked = 1 WHERE id = ?")
        .bind(url)
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}

/// (id, título, texto) das notícias sem classificação da IA.
pub async fn needing_summary(pool: &SqlitePool, limit: i32) -> AppResult<Vec<(i32, String, Option<String>)>> {
    Ok(sqlx::query_as("SELECT id, title, description FROM news_items WHERE summary IS NULL ORDER BY published_at DESC, id DESC LIMIT ?")
        .bind(limit)
        .fetch_all(pool)
        .await?)
}

pub async fn set_classification(pool: &SqlitePool, id: i32, summary: &str, tags: &str, relevance: f64) -> AppResult<()> {
    sqlx::query("UPDATE news_items SET summary = ?, tags = ?, relevance = ? WHERE id = ?")
        .bind(summary)
        .bind(tags)
        .bind(relevance)
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}

/// Mantém só as 500 notícias mais recentes.
pub async fn prune_news(pool: &SqlitePool) -> AppResult<()> {
    sqlx::query(
        "DELETE FROM news_items WHERE id NOT IN (SELECT id FROM news_items ORDER BY published_at DESC, id DESC LIMIT 500)",
    )
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn news(pool: &SqlitePool, limit: i32) -> AppResult<Vec<NewsItem>> {
    Ok(sqlx::query_as(
        "SELECT n.id, f.name AS feed, n.title, n.link, n.published_at, n.read, n.image_url, n.description, n.summary, n.tags, n.relevance
         FROM news_items n JOIN feeds f ON f.id = n.feed_id
         ORDER BY n.published_at DESC, n.id DESC LIMIT ?",
    )
    .bind(limit)
    .fetch_all(pool)
    .await?)
}

pub async fn news_item(pool: &SqlitePool, id: i32) -> AppResult<NewsItem> {
    sqlx::query_as(
        "SELECT n.id, f.name AS feed, n.title, n.link, n.published_at, n.read, n.image_url, n.description, n.summary, n.tags, n.relevance
         FROM news_items n JOIN feeds f ON f.id = n.feed_id WHERE n.id = ?",
    )
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::Invalid("Notícia não encontrada".into()))
}

pub async fn set_read(pool: &SqlitePool, id: i32, read: bool) -> AppResult<()> {
    sqlx::query("UPDATE news_items SET read = ?1, read_at = CASE WHEN ?1 THEN datetime('now') END WHERE id = ?2")
        .bind(read)
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn mark_all_read(pool: &SqlitePool) -> AppResult<i32> {
    Ok(sqlx::query("UPDATE news_items SET read = 1, read_at = datetime('now') WHERE read = 0")
        .execute(pool)
        .await?
        .rows_affected() as i32)
}

pub async fn contests(pool: &SqlitePool) -> AppResult<Vec<Contest>> {
    let rows: Vec<Contest> = sqlx::query_as(
        "SELECT id, title, org, banca, status, vacancies, salary, deadline, url, summary, source, followed, found_at
         FROM contests ORDER BY followed DESC, found_at DESC, id DESC",
    )
    .fetch_all(pool)
    .await?;
    // A mesma trava na leitura: corrige também o que foi gravado antes dela existir.
    let today = news::today();
    Ok(rows
        .into_iter()
        .map(|c| Contest { status: news::contest_status(&c.title, c.summary.as_deref(), c.status.as_deref(), None, c.deadline.as_deref(), &today), ..c })
        .collect())
}

/// Insere ou atualiza pelo link; se o mesmo concurso já veio de outra fonte (mesma chave de órgão),
/// só completa aquele. Devolve se era novo.
pub async fn upsert_contest(pool: &SqlitePool, c: &FoundContest, source: ContestSource) -> AppResult<bool> {
    let key = news::contest_key(c.org.as_deref(), &c.title);
    // A IA não decide sozinha que um concurso está aberto: prova passada vira "prova realizada".
    let status = news::contest_status(&c.title, c.summary.as_deref(), c.status.as_deref(), c.exam_date.as_deref(), c.deadline.as_deref(), &news::today());
    if let Some(k) = &key {
        let twin: Option<i32> = sqlx::query_scalar("SELECT id FROM contests WHERE dedupe_key = ? AND url <> ? LIMIT 1")
            .bind(k)
            .bind(&c.url)
            .fetch_optional(pool)
            .await?;
        if let Some(id) = twin {
            // O que vier do Claude substitui; o resto só preenche o vazio.
            let prefer = source == ContestSource::Claude;
            sqlx::query(
                "UPDATE contests SET
                   title = CASE WHEN ?2 THEN ?3 ELSE title END,
                   org = COALESCE(CASE WHEN ?2 THEN ?4 END, org, ?4),
                   banca = COALESCE(CASE WHEN ?2 THEN ?5 END, banca, ?5),
                   status = COALESCE(CASE WHEN ?2 THEN ?6 END, status, ?6),
                   vacancies = COALESCE(vacancies, ?7),
                   salary = COALESCE(salary, ?8),
                   deadline = COALESCE(CASE WHEN ?2 THEN ?9 END, deadline, ?9),
                   summary = COALESCE(CASE WHEN ?2 THEN ?10 END, summary, ?10)
                 WHERE id = ?1",
            )
            .bind(id)
            .bind(prefer)
            .bind(&c.title)
            .bind(&c.org)
            .bind(&c.banca)
            .bind(&status)
            .bind(&c.vacancies)
            .bind(&c.salary)
            .bind(&c.deadline)
            .bind(&c.summary)
            .execute(pool)
            .await?;
            return Ok(false);
        }
    }
    let existed: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM contests WHERE url = ?)")
        .bind(&c.url)
        .fetch_one(pool)
        .await?;
    sqlx::query(
        "INSERT INTO contests (title, org, banca, status, vacancies, salary, deadline, url, summary, source, dedupe_key)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(url) DO UPDATE SET title = excluded.title, org = excluded.org, banca = excluded.banca,
           status = excluded.status, vacancies = excluded.vacancies, salary = excluded.salary,
           deadline = excluded.deadline, summary = excluded.summary, dedupe_key = excluded.dedupe_key",
    )
    .bind(&c.title)
    .bind(&c.org)
    .bind(&c.banca)
    .bind(&status)
    .bind(&c.vacancies)
    .bind(&c.salary)
    .bind(&c.deadline)
    .bind(&c.url)
    .bind(&c.summary)
    .bind(source.as_str())
    .bind(&key)
    .execute(pool)
    .await?;
    Ok(!existed)
}

pub async fn set_followed(pool: &SqlitePool, id: i32, followed: bool) -> AppResult<()> {
    sqlx::query("UPDATE contests SET followed = ? WHERE id = ?").bind(followed).bind(id).execute(pool).await?;
    Ok(())
}

pub async fn delete_contest(pool: &SqlitePool, id: i32) -> AppResult<()> {
    sqlx::query("DELETE FROM contests WHERE id = ?").bind(id).execute(pool).await?;
    Ok(())
}

/// Concursos salvos antes da chave de duplicata: calcula a chave deles (uma vez).
pub async fn backfill_keys(pool: &SqlitePool) -> AppResult<()> {
    let rows: Vec<(i32, Option<String>, String)> =
        sqlx::query_as("SELECT id, org, title FROM contests WHERE dedupe_key IS NULL").fetch_all(pool).await?;
    for (id, org, title) in rows {
        if let Some(k) = news::contest_key(org.as_deref(), &title) {
            sqlx::query("UPDATE contests SET dedupe_key = ? WHERE id = ?").bind(k).bind(id).execute(pool).await?;
        }
    }
    Ok(())
}
