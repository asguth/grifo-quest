//! Consultas da sessão de estudo: banco de questões, tentativas, caderno de erros e cartões.

use serde::Serialize;
use sqlx::SqlitePool;

use crate::ai::Provider;
use crate::domain::study::{self, CardState, NewQuestion};
use crate::error::{AppError, AppResult};

wire_enum! {
    /// De onde veio o cartão: material do Grifo, questão errada ou escrito à mão.
    pub enum CardSource {
        Grifo = "grifo",
        Erro = "erro",
        Manual = "manual",
    }
}

/// Questão como o front mostra (sem gabarito: ele só vem na resposta).
#[derive(Debug, Clone, Serialize, sqlx::FromRow, specta::Type)]
pub struct QuestionRow {
    pub id: i32,
    pub topic_id: i32,
    pub topic: String,
    pub subject_id: i32,
    pub subject: String,
    pub color: String,
    pub banca: Option<String>,
    /// ce | ae
    pub format: String,
    pub statement: String,
    /// JSON das alternativas.
    pub options: String,
    pub difficulty: Option<String>,
    pub source: String,
}

impl QuestionRow {
    pub fn options(&self) -> AppResult<Vec<String>> {
        serde_json::from_str(&self.options).map_err(|e| AppError::Invalid(format!("Alternativas da questão {} ilegíveis: {e}", self.id)))
    }
}

pub async fn question(pool: &SqlitePool, id: i32) -> AppResult<QuestionRow> {
    sqlx::query_as(
        "SELECT q.id, q.topic_id, t.name AS topic, s.id AS subject_id, s.name AS subject, s.color, q.banca, q.format,
                q.statement, q.options, q.difficulty, q.source
         FROM questions q JOIN topics t ON t.id = q.topic_id JOIN subjects s ON s.id = t.subject_id WHERE q.id = ?",
    )
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::Invalid("Questão não encontrada".into()))
}

/// Próxima questão do tópico para esta sessão: nunca respondida primeiro, depois as não vistas há 14 dias.
pub async fn pick_for_topic(pool: &SqlitePool, topic_id: i32, served_json: &str) -> AppResult<Option<i32>> {
    Ok(sqlx::query_scalar(
        "SELECT q.id FROM questions q
         WHERE q.topic_id = ?1 AND q.reported = 0 AND q.id NOT IN (SELECT value FROM json_each(?2))
           AND NOT EXISTS (SELECT 1 FROM attempts a WHERE a.question_id = q.id AND a.answered_at >= datetime('now','-14 days'))
         ORDER BY (SELECT COUNT(*) FROM attempts a WHERE a.question_id = q.id), RANDOM()
         LIMIT 1",
    )
    .bind(topic_id)
    .bind(served_json)
    .fetch_optional(pool)
    .await?)
}

/// Quantas questões ainda "frescas" (não vistas em 14 dias) o tópico tem no banco.
pub async fn fresh_count(pool: &SqlitePool, topic_id: i32) -> AppResult<i32> {
    Ok(sqlx::query_scalar(
        "SELECT COUNT(*) FROM questions q WHERE q.topic_id = ? AND q.reported = 0
           AND NOT EXISTS (SELECT 1 FROM attempts a WHERE a.question_id = q.id AND a.answered_at >= datetime('now','-14 days'))",
    )
    .bind(topic_id)
    .fetch_one(pool)
    .await?)
}

/// Guarda as questões novas (ignora repetidas pela impressão digital). Devolve quantas entraram.
pub async fn insert_questions(pool: &SqlitePool, topic_id: i32, banca: Option<&str>, source: Provider, qs: &[NewQuestion]) -> AppResult<i32> {
    let mut n = 0;
    for q in qs {
        let options = serde_json::to_string(&q.options)?;
        let res = sqlx::query(
            "INSERT OR IGNORE INTO questions (topic_id, banca, format, statement, options, answer, explanation, difficulty, source, fingerprint)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(topic_id)
        .bind(banca)
        .bind(q.format.as_str())
        .bind(&q.statement)
        .bind(options)
        .bind(&q.answer)
        .bind(&q.explanation)
        .bind(&q.difficulty)
        .bind(source.as_str())
        .bind(study::fingerprint(&q.statement))
        .execute(pool)
        .await?;
        n += res.rows_affected() as i32;
    }
    Ok(n)
}

pub async fn answer_key(pool: &SqlitePool, id: i32) -> AppResult<(String, String)> {
    Ok(sqlx::query_as("SELECT answer, explanation FROM questions WHERE id = ?").bind(id).fetch_one(pool).await?)
}

pub async fn create_session(pool: &SqlitePool, kind: &str, planned: i32, time_limit_min: Option<i32>) -> AppResult<i32> {
    Ok(sqlx::query("INSERT INTO study_sessions (kind, planned, time_limit_min) VALUES (?, ?, ?)")
        .bind(kind)
        .bind(planned)
        .bind(time_limit_min)
        .execute(pool)
        .await?
        .last_insert_rowid() as i32)
}

/// Grava a resposta, o lançamento de questões (alimenta % de acerto, missões e XP) e o caderno de erros,
/// tudo numa transação. Devolve o XP ganho.
pub async fn record_answer(
    pool: &SqlitePool,
    q: &QuestionRow,
    session_id: Option<i32>,
    answer: &str,
    correct: bool,
    seconds: i32,
    xp: i32,
) -> AppResult<()> {
    let mut tx = pool.begin().await?;
    sqlx::query("INSERT INTO attempts (question_id, session_id, answer, correct, seconds) VALUES (?, ?, ?, ?, ?)")
        .bind(q.id)
        .bind(session_id)
        .bind(answer)
        .bind(correct)
        .bind(seconds)
        .execute(&mut *tx)
        .await?;
    sqlx::query("INSERT INTO question_logs (subject_id, topic_id, banca, total, correct) VALUES (?, ?, ?, 1, ?)")
        .bind(q.subject_id)
        .bind(q.topic_id)
        .bind(&q.banca)
        .bind(i32::from(correct))
        .execute(&mut *tx)
        .await?;
    super::player::add_xp(&mut tx, xp).await?;

    let streak: Option<i32> = sqlx::query_scalar("SELECT streak FROM error_book WHERE question_id = ?").bind(q.id).fetch_optional(&mut *tx).await?;
    // Só entra no caderno quem errou; quem já está nele segue as regras de 1/3/7 dias.
    let next = match streak {
        Some(s) => study::next_error(s, correct),
        None if !correct => study::next_error(0, false),
        None => None,
    };
    match next {
        Some((s, days)) => {
            sqlx::query(
                "INSERT INTO error_book (question_id, streak, due_at) VALUES (?1, ?2, date('now','localtime', '+' || ?3 || ' days'))
                 ON CONFLICT(question_id) DO UPDATE SET streak = ?2, due_at = date('now','localtime', '+' || ?3 || ' days')",
            )
            .bind(q.id)
            .bind(s)
            .bind(days)
            .execute(&mut *tx)
            .await?;
        }
        None => {
            sqlx::query("DELETE FROM error_book WHERE question_id = ?").bind(q.id).execute(&mut *tx).await?;
        }
    }

    // Edital verticalizado: 10 questões respondidas no tópico marcam "questões feitas".
    sqlx::query(
        "UPDATE topics SET practice = 1 WHERE id = ?1 AND practice = 0 AND
           (SELECT COUNT(*) FROM attempts a JOIN questions qq ON qq.id = a.question_id WHERE qq.topic_id = ?1) >= 10",
    )
    .bind(q.topic_id)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(())
}

/// Erros vencidos hoje: (questão, tópico).
pub async fn errors_due(pool: &SqlitePool) -> AppResult<Vec<(i32, i32)>> {
    Ok(sqlx::query_as(
        "SELECT question_id, topic_id FROM errors_due ORDER BY due_at, question_id",
    )
        .fetch_all(pool)
        .await?)
}

/// Dados crus para o ranking de pontos fracos (agregados no Rust).
#[derive(sqlx::FromRow)]
pub struct TopicRow {
    pub topic_id: i32,
    pub topic: String,
    pub subject: String,
    pub color: String,
    pub weight: f64,
    pub errors_due: i32,
}

pub async fn topics_for_ranking(pool: &SqlitePool) -> AppResult<Vec<TopicRow>> {
    Ok(sqlx::query_as(
        "SELECT t.id AS topic_id, t.name AS topic, s.name AS subject, s.color, CAST(s.exam_weight AS REAL) AS weight,
                (SELECT COUNT(*) FROM errors_due e WHERE e.topic_id = t.id) AS errors_due
         FROM topics t JOIN subjects s ON s.id = t.subject_id",
    )
    .fetch_all(pool)
    .await?)
}

/// (tópico, idade em dias, acertou) das respostas dos últimos 60 dias.
pub async fn recent_answers(pool: &SqlitePool) -> AppResult<Vec<(i32, f64, bool)>> {
    Ok(sqlx::query_as(
        "SELECT q.topic_id, julianday('now') - julianday(a.answered_at), a.correct
         FROM attempts a JOIN questions q ON q.id = a.question_id
         WHERE a.answered_at >= datetime('now','-60 days')",
    )
    .fetch_all(pool)
    .await?)
}

/// Minutos de estudo por matéria nos últimos 7 dias (para o ciclo).
pub async fn minutes_by_subject(pool: &SqlitePool) -> AppResult<Vec<(i32, f64, f64)>> {
    Ok(sqlx::query_as(
        // CAST: sem estudo na semana o SQLite devolveria INTEGER 0 e o f64 não decodifica.
        "SELECT s.id, CAST(s.exam_weight AS REAL),
                CAST(COALESCE((SELECT SUM(ts.minutes) FROM session_minutes ts
                          WHERE ts.subject_id = s.id AND ts.started_at >= datetime('now','-7 days')), 0)
                + COALESCE((SELECT SUM(a.seconds) / 60.0 FROM attempts a JOIN questions q ON q.id = a.question_id JOIN topics t ON t.id = q.topic_id
                          WHERE t.subject_id = s.id AND a.answered_at >= datetime('now','-7 days')), 0) AS REAL)
         FROM subjects s",
    )
    .fetch_all(pool)
    .await?)
}

pub async fn answered_today(pool: &SqlitePool) -> AppResult<i32> {
    Ok(sqlx::query_scalar("SELECT COUNT(*) FROM attempts WHERE date(answered_at,'localtime') = date('now','localtime')").fetch_one(pool).await?)
}

/// Tópicos aleatórios ponderados pelo peso da matéria (simulado): devolve (tópico, peso da matéria / nº de tópicos dela).
pub async fn topics_by_weight(pool: &SqlitePool) -> AppResult<Vec<(i32, f64)>> {
    Ok(sqlx::query_as(
        "SELECT t.id, s.exam_weight * 1.0 / (SELECT COUNT(*) FROM topics t2 WHERE t2.subject_id = s.id)
         FROM topics t JOIN subjects s ON s.id = t.subject_id ORDER BY RANDOM()",
    )
    .fetch_all(pool)
    .await?)
}

#[derive(Debug, Serialize, sqlx::FromRow, specta::Type)]
pub struct SubjectScore {
    pub subject: String,
    pub color: String,
    pub total: i32,
    pub correct: i32,
}

pub async fn finish_session(pool: &SqlitePool, id: i32) -> AppResult<(i32, i32, i32, Vec<SubjectScore>)> {
    sqlx::query("UPDATE study_sessions SET finished_at = datetime('now') WHERE id = ? AND finished_at IS NULL").bind(id).execute(pool).await?;
    let (total, correct, seconds): (i32, i32, i32) =
        sqlx::query_as("SELECT COUNT(*), COALESCE(SUM(correct),0), COALESCE(SUM(seconds),0) FROM attempts WHERE session_id = ?")
            .bind(id)
            .fetch_one(pool)
            .await?;
    let by_subject = sqlx::query_as(
        "SELECT s.name AS subject, s.color, COUNT(*) AS total, SUM(a.correct) AS correct
         FROM attempts a JOIN questions q ON q.id = a.question_id JOIN topics t ON t.id = q.topic_id JOIN subjects s ON s.id = t.subject_id
         WHERE a.session_id = ? GROUP BY s.id ORDER BY total DESC",
    )
    .bind(id)
    .fetch_all(pool)
    .await?;
    Ok((total, correct, seconds, by_subject))
}

// ---------- cartões ----------

#[derive(Debug, Serialize, sqlx::FromRow, specta::Type)]
pub struct CardRow {
    pub id: i32,
    pub front: String,
    pub back: String,
    pub topic: Option<String>,
    pub source: String,
    /// Nunca revisado (contador azul do Anki).
    pub is_new: bool,
    #[serde(skip)]
    pub ease: f64,
    #[serde(skip)]
    pub interval_days: i32,
    #[serde(skip)]
    pub reps: i32,
    /// Próximo intervalo (dias) de cada nota, na ordem Errei/Difícil/Bom/Fácil (os botões do Anki).
    #[sqlx(skip)]
    pub next: Vec<i32>,
}

/// Cartões novos que entram por dia (o resto espera: evita a avalanche de revisões dias depois).
pub const NEW_CARDS_PER_DAY: i32 = 20;

/// Vencidos primeiro; novos (nunca revisados) até o limite do dia.
// ponytail: o limite vale por carregamento do baralho, não por dia corrido (sem coluna de "visto hoje"); basta para não afogar.
pub async fn cards_due(pool: &SqlitePool, limit: i32) -> AppResult<Vec<CardRow>> {
    Ok(sqlx::query_as(
        "SELECT * FROM (
           SELECT c.id, c.front, c.back, t.name AS topic, c.source, c.is_new, c.ease, c.interval_days, c.reps
           FROM card_state c LEFT JOIN topics t ON t.id = c.topic_id
           WHERE c.due_at <= date('now','localtime') AND NOT c.is_new ORDER BY c.due_at, c.id)
         UNION ALL
         SELECT * FROM (
           SELECT c.id, c.front, c.back, t.name AS topic, c.source, c.is_new, c.ease, c.interval_days, c.reps
           FROM card_state c LEFT JOIN topics t ON t.id = c.topic_id
           WHERE c.is_new ORDER BY c.id LIMIT ?2)
         LIMIT ?1",
    )
    .bind(limit)
    .bind(NEW_CARDS_PER_DAY)
    .fetch_all(pool)
    .await?)
}

pub async fn cards_due_count(pool: &SqlitePool) -> AppResult<i32> {
    Ok(sqlx::query_scalar(
        "SELECT (SELECT COUNT(*) FROM card_state WHERE due_at <= date('now','localtime') AND NOT is_new)
              + MIN(?, (SELECT COUNT(*) FROM card_state WHERE is_new))",
    )
    .bind(NEW_CARDS_PER_DAY)
    .fetch_one(pool)
    .await?)
}

pub async fn card_state(pool: &SqlitePool, id: i32) -> AppResult<CardState> {
    let (ease, interval_days, reps): (f64, i32, i32) =
        sqlx::query_as("SELECT ease, interval_days, reps FROM cards WHERE id = ?").bind(id).fetch_one(pool).await?;
    Ok(CardState { ease, interval_days, reps })
}

pub async fn save_card_state(pool: &SqlitePool, id: i32, s: CardState) -> AppResult<()> {
    sqlx::query("UPDATE cards SET ease = ?, interval_days = ?, reps = ?, due_at = date('now','localtime', '+' || ? || ' days') WHERE id = ?")
        .bind(s.ease)
        .bind(s.interval_days)
        .bind(s.reps)
        .bind(s.interval_days)
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}

/// Cria cartões (ignora repetidos pela frente). Devolve quantos entraram.
pub async fn insert_cards(pool: &SqlitePool, topic_id: Option<i32>, source: CardSource, cards: &[(String, String)]) -> AppResult<i32> {
    let mut n = 0;
    for (front, back) in cards {
        n += sqlx::query("INSERT OR IGNORE INTO cards (topic_id, front, back, source, fingerprint) VALUES (?, ?, ?, ?, ?)")
            .bind(topic_id)
            .bind(front)
            .bind(back)
            .bind(source.as_str())
            .bind(study::fingerprint(front))
            .execute(pool)
            .await?
            .rows_affected() as i32;
    }
    Ok(n)
}

// ---------- baralho ----------

#[derive(Debug, Serialize, sqlx::FromRow, specta::Type)]
pub struct DeckCard {
    pub id: i32,
    pub front: String,
    pub back: String,
    pub topic_id: Option<i32>,
    pub topic: Option<String>,
    pub subject_id: Option<i32>,
    pub subject: Option<String>,
    pub color: Option<String>,
    /// grifo | erro | manual
    pub source: String,
    pub due_at: String,
    pub interval_days: i32,
    pub reps: i32,
}

pub async fn list_cards(pool: &SqlitePool) -> AppResult<Vec<DeckCard>> {
    Ok(sqlx::query_as(
        "SELECT c.id, c.front, c.back, c.topic_id, t.name AS topic, s.id AS subject_id, s.name AS subject, s.color, c.source,
                c.due_at, c.interval_days, c.reps
         FROM cards c LEFT JOIN topics t ON t.id = c.topic_id LEFT JOIN subjects s ON s.id = t.subject_id
         ORDER BY c.created_at DESC, c.id DESC",
    )
    .fetch_all(pool)
    .await?)
}

pub async fn update_card(pool: &SqlitePool, id: i32, front: &str, back: &str) -> AppResult<()> {
    sqlx::query("UPDATE cards SET front = ?, back = ?, fingerprint = ? WHERE id = ?")
        .bind(front)
        .bind(back)
        .bind(study::fingerprint(front))
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e| match e {
            sqlx::Error::Database(d) if d.is_unique_violation() => AppError::Invalid("Já existe um cartão com essa frente".into()),
            e => e.into(),
        })?;
    Ok(())
}

pub async fn delete_card(pool: &SqlitePool, id: i32) -> AppResult<()> {
    sqlx::query("DELETE FROM cards WHERE id = ?").bind(id).execute(pool).await?;
    Ok(())
}

// ---------- caderno de erros ----------

#[derive(Debug, Serialize, sqlx::FromRow, specta::Type)]
pub struct ErrorEntry {
    pub question_id: i32,
    pub topic_id: i32,
    pub topic: String,
    pub subject: String,
    pub color: String,
    pub banca: Option<String>,
    /// ce | ae
    pub format: String,
    pub statement: String,
    /// JSON das alternativas.
    pub options: String,
    pub answer: String,
    pub explanation: String,
    /// Acertos seguidos desde o último erro (sai do caderno no 3º).
    pub streak: i32,
    pub due_at: String,
    /// Última resposta dada.
    pub last_answer: Option<String>,
    pub misses: i32,
}

pub async fn error_list(pool: &SqlitePool) -> AppResult<Vec<ErrorEntry>> {
    Ok(sqlx::query_as(
        "SELECT q.id AS question_id, q.topic_id, t.name AS topic, s.name AS subject, s.color, q.banca, q.format, q.statement, q.options,
                q.answer, q.explanation, e.streak, e.due_at,
                (SELECT a.answer FROM attempts a WHERE a.question_id = q.id ORDER BY a.id DESC LIMIT 1) AS last_answer,
                (SELECT COUNT(*) FROM attempts a WHERE a.question_id = q.id AND a.correct = 0) AS misses
         FROM error_book e JOIN questions q ON q.id = e.question_id JOIN topics t ON t.id = q.topic_id JOIN subjects s ON s.id = t.subject_id
         ORDER BY e.due_at, s.name, t.name",
    )
    .fetch_all(pool)
    .await?)
}

pub async fn remove_error(pool: &SqlitePool, question_id: i32) -> AppResult<()> {
    sqlx::query("DELETE FROM error_book WHERE question_id = ?").bind(question_id).execute(pool).await?;
    Ok(())
}

/// Questão com problema: sai das sessões e do caderno, mas o histórico de respostas fica.
pub async fn report_question(pool: &SqlitePool, question_id: i32) -> AppResult<()> {
    let mut tx = pool.begin().await?;
    sqlx::query("UPDATE questions SET reported = 1 WHERE id = ?").bind(question_id).execute(&mut *tx).await?;
    sqlx::query("DELETE FROM error_book WHERE question_id = ?").bind(question_id).execute(&mut *tx).await?;
    tx.commit().await?;
    Ok(())
}

// ---------- desempenho ----------

#[derive(Debug, Serialize, sqlx::FromRow, specta::Type)]
pub struct SubjectPerf {
    pub id: i32,
    pub name: String,
    pub color: String,
    pub weight: f64,
    pub answered: i32,
    pub correct: i32,
    /// Últimos 30 dias.
    pub answered_30: i32,
    pub correct_30: i32,
    /// De 30 a 60 dias atrás (tendência).
    pub answered_prev: i32,
    pub correct_prev: i32,
    pub minutes_30: f64,
}

pub async fn subject_perf(pool: &SqlitePool) -> AppResult<Vec<SubjectPerf>> {
    Ok(sqlx::query_as(
        "SELECT s.id, s.name, s.color, CAST(s.exam_weight AS REAL) AS weight,
                COALESCE(SUM(l.total), 0) AS answered, COALESCE(SUM(l.correct), 0) AS correct,
                COALESCE(SUM(CASE WHEN l.logged_at >= datetime('now','-30 days') THEN l.total END), 0) AS answered_30,
                COALESCE(SUM(CASE WHEN l.logged_at >= datetime('now','-30 days') THEN l.correct END), 0) AS correct_30,
                COALESCE(SUM(CASE WHEN l.logged_at < datetime('now','-30 days') AND l.logged_at >= datetime('now','-60 days') THEN l.total END), 0) AS answered_prev,
                COALESCE(SUM(CASE WHEN l.logged_at < datetime('now','-30 days') AND l.logged_at >= datetime('now','-60 days') THEN l.correct END), 0) AS correct_prev,
                CAST(COALESCE((SELECT SUM(ts.minutes) FROM session_minutes ts
                     WHERE ts.subject_id = s.id AND ts.kind = 'estudo' AND ts.started_at >= datetime('now','-30 days')), 0) AS REAL) AS minutes_30
         FROM subjects s LEFT JOIN question_logs l ON l.subject_id = s.id
         GROUP BY s.id ORDER BY s.exam_weight DESC, s.name",
    )
    .fetch_all(pool)
    .await?)
}

#[derive(Debug, Serialize, sqlx::FromRow, specta::Type)]
pub struct SimuladoRow {
    pub id: i32,
    pub started_at: String,
    pub total: i32,
    pub correct: i32,
    pub seconds: i32,
}

pub async fn simulados(pool: &SqlitePool) -> AppResult<Vec<SimuladoRow>> {
    Ok(sqlx::query_as(
        "SELECT ss.id, ss.started_at, COUNT(a.id) AS total, COALESCE(SUM(a.correct), 0) AS correct, COALESCE(SUM(a.seconds), 0) AS seconds
         FROM study_sessions ss JOIN attempts a ON a.session_id = ss.id
         WHERE ss.kind = 'simulado' GROUP BY ss.id ORDER BY ss.started_at DESC LIMIT 20",
    )
    .fetch_all(pool)
    .await?)
}

#[derive(Debug, Serialize, sqlx::FromRow, specta::Type)]
pub struct DayCount {
    /// AAAA-MM-DD (local).
    pub day: String,
    pub answered: i32,
    pub correct: i32,
}

pub async fn daily_answers(pool: &SqlitePool, days: i32) -> AppResult<Vec<DayCount>> {
    Ok(sqlx::query_as(
        "SELECT date(logged_at,'localtime') AS day, SUM(total) AS answered, SUM(correct) AS correct FROM question_logs
         WHERE logged_at >= datetime('now', '-' || ? || ' days') GROUP BY day ORDER BY day",
    )
    .bind(days)
    .fetch_all(pool)
    .await?)
}

/// Tópicos de uma matéria (sessão por matéria).
pub async fn topic_ids_of_subject(pool: &SqlitePool, subject_id: i32) -> AppResult<Vec<i32>> {
    Ok(sqlx::query_scalar("SELECT id FROM topics WHERE subject_id = ?").bind(subject_id).fetch_all(pool).await?)
}
