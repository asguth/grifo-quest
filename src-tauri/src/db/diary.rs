//! Consultas do Diário. Datas: UTC no banco, agrupadas por dia local via `date(x, 'localtime')`.

use serde::Serialize;
use sqlx::SqlitePool;

use super::sessions::SessionSource;
use crate::domain::missions::{self, MissionKind, SubjectScore};
use crate::error::AppResult;
use crate::settings::{self, Profile};

#[derive(Debug, Serialize, specta::Type, sqlx::FromRow)]
pub struct SubjectAccuracy {
    pub id: i32,
    pub name: String,
    pub color: String,
    pub exam_weight: f64,
    pub total: i32,
    pub correct: i32,
}

#[derive(Debug, Serialize, specta::Type, sqlx::FromRow)]
pub struct DayHours {
    pub day: String,
    pub kind: String,
    pub minutes: i32,
}

#[derive(Debug, Serialize, specta::Type, sqlx::FromRow)]
pub struct DayActivity {
    pub day: String,
    pub questions: i32,
    pub study_minutes: i32,
}

#[derive(Debug, Serialize, specta::Type, sqlx::FromRow)]
pub struct Mission {
    pub id: i32,
    pub description: String,
    pub target: i32,
    pub progress: i32,
    pub done: bool,
    pub xp_reward: i32,
}

#[derive(Debug, Serialize, specta::Type, sqlx::FromRow)]
pub struct ReviewItem {
    pub id: i32,
    pub topic_id: i32,
    pub topic: String,
    pub subject: String,
    pub due_at: String,
    pub overdue: bool,
}

/// Acerto por matéria nos últimos `days` dias (todas as matérias, mesmo sem lançamentos).
pub async fn accuracy(pool: &SqlitePool, days: i32) -> AppResult<Vec<SubjectAccuracy>> {
    Ok(sqlx::query_as(
        "SELECT s.id, s.name, s.color, s.exam_weight,
                CAST(COALESCE(SUM(q.total), 0) AS INTEGER) AS total,
                CAST(COALESCE(SUM(q.correct), 0) AS INTEGER) AS correct
         FROM subjects s
         LEFT JOIN question_logs q ON q.subject_id = s.id AND q.logged_at >= datetime('now', '-' || ? || ' days')
         GROUP BY s.id ORDER BY s.name COLLATE NOCASE",
    )
    .bind(days)
    .fetch_all(pool)
    .await?)
}

/// Minutos por dia e tipo (estudo/trabalho) nos últimos 7 dias.
pub async fn week_hours(pool: &SqlitePool) -> AppResult<Vec<DayHours>> {
    Ok(sqlx::query_as(
        "SELECT date(started_at, 'localtime') AS day, kind,
                CAST(ROUND(SUM(minutes)) AS INTEGER) AS minutes
         FROM session_minutes
         WHERE date(started_at, 'localtime') > date('now', 'localtime', '-7 days')
         GROUP BY day, kind ORDER BY day",
    )
    .fetch_all(pool)
    .await?)
}

/// Questões e minutos de estudo por dia no último ano (só dias com atividade).
pub async fn activity(pool: &SqlitePool) -> AppResult<Vec<DayActivity>> {
    Ok(sqlx::query_as(
        "SELECT day, CAST(SUM(q) AS INTEGER) AS questions, CAST(ROUND(SUM(m)) AS INTEGER) AS study_minutes FROM (
            SELECT date(logged_at, 'localtime') AS day, total AS q, 0 AS m
              FROM question_logs WHERE logged_at >= datetime('now', '-366 days')
            UNION ALL
            SELECT date(started_at, 'localtime'), 0, minutes
              FROM session_minutes
              WHERE kind = 'estudo' AND started_at >= datetime('now', '-366 days')
         ) GROUP BY day ORDER BY day",
    )
    .fetch_all(pool)
    .await?)
}

/// Dias que contam para a sequência (≥1 pomodoro ou ≥10 questões), como dias desde 1970, e o dia de hoje.
pub async fn streak_days(pool: &SqlitePool) -> AppResult<(Vec<i64>, i64)> {
    let days: Vec<i64> = sqlx::query_scalar(
        "SELECT CAST(julianday(day) - 2440587.5 AS INTEGER) FROM (
            SELECT date(logged_at, 'localtime') AS day, SUM(total) AS q, 0 AS p FROM question_logs GROUP BY 1
            UNION ALL
            SELECT date(started_at, 'localtime'), 0, COUNT(*) FROM time_sessions WHERE source = ? GROUP BY 1
         ) GROUP BY day HAVING SUM(q) >= 10 OR SUM(p) >= 1",
    )
    .bind(SessionSource::Pomodoro.as_str())
    .fetch_all(pool)
    .await?;
    let today: i64 = sqlx::query_scalar("SELECT CAST(julianday(date('now','localtime')) - 2440587.5 AS INTEGER)").fetch_one(pool).await?;
    Ok((days, today))
}

pub async fn review_queue(pool: &SqlitePool) -> AppResult<Vec<ReviewItem>> {
    Ok(sqlx::query_as(
        "SELECT r.id, r.topic_id, t.name AS topic, s.name AS subject, r.due_at,
                r.due_at <= date('now', 'localtime') AS overdue
         FROM review_queue r JOIN topics t ON t.id = r.topic_id JOIN subjects s ON s.id = t.subject_id
         WHERE r.due_at <= date('now', 'localtime', '+7 days')
         ORDER BY r.due_at",
    )
    .fetch_all(pool)
    .await?)
}

/// Garante as missões de hoje (geradas no 1º acesso do dia), recalcula o progresso
/// e credita o XP das que acabaram de ser concluídas. Devolve o XP creditado agora.
// ponytail: gera no primeiro acesso do dia em vez de um job às 00:00; dá no mesmo para o usuário.
pub async fn refresh_missions(pool: &SqlitePool) -> AppResult<i32> {
    let profile: Profile = settings::load(pool).await?;
    let goals = missions::Goals { daily_questions: profile.daily_questions, hours_per_day: profile.hours_per_day };
    let mut tx = pool.begin().await?;
    let today: String = sqlx::query_scalar("SELECT date('now', 'localtime')").fetch_one(&mut *tx).await?;
    let (any, with_subject): (bool, bool) = sqlx::query_as(
        "SELECT EXISTS(SELECT 1 FROM missions WHERE date = ?1),
                EXISTS(SELECT 1 FROM missions WHERE date = ?1 AND kind = ?2)",
    )
    .bind(&today)
    .bind(MissionKind::Questoes.as_str())
    .fetch_one(&mut *tx)
    .await?;

    // Gera no 1º acesso do dia; se as matérias foram cadastradas depois, completa só as de questões.
    if !any || !with_subject {
        let scores: Vec<(i32, String, f64, i32, i32)> = sqlx::query_as(
            "SELECT s.id, s.name, s.exam_weight,
                    CAST(COALESCE(SUM(q.total), 0) AS INTEGER), CAST(COALESCE(SUM(q.correct), 0) AS INTEGER)
             FROM subjects s
             LEFT JOIN question_logs q ON q.subject_id = s.id AND q.logged_at >= datetime('now', '-30 days')
             GROUP BY s.id",
        )
        .fetch_all(&mut *tx)
        .await?;
        let scores: Vec<SubjectScore> = scores
            .into_iter()
            .map(|(id, name, weight, total, correct)| SubjectScore {
                id,
                name,
                weight,
                accuracy: (total > 0).then(|| f64::from(correct) / f64::from(total)),
            })
            .collect();
        for d in missions::generate(&scores, goals).into_iter().filter(|d| !any || d.kind == MissionKind::Questoes) {
            sqlx::query(
                "INSERT INTO missions (date, description, target, xp_reward, kind, subject_id) VALUES (?, ?, ?, ?, ?, ?)",
            )
            .bind(&today)
            .bind(&d.description)
            .bind(d.target)
            .bind(d.xp_reward)
            .bind(d.kind.as_str())
            .bind(d.subject_id)
            .execute(&mut *tx)
            .await?;
        }
    }

    sqlx::query(
        "UPDATE missions SET progress = CASE kind
            WHEN ?2 THEN (SELECT COALESCE(SUM(total), 0) FROM question_logs
                          WHERE subject_id = missions.subject_id AND date(logged_at, 'localtime') = missions.date)
            ELSE (SELECT COUNT(*) FROM time_sessions
                  WHERE source = ?3 AND date(started_at, 'localtime') = missions.date)
         END
         WHERE date = ?1",
    )
    .bind(&today)
    .bind(MissionKind::Questoes.as_str())
    .bind(SessionSource::Pomodoro.as_str())
    .execute(&mut *tx)
    .await?;

    let gained: i32 = sqlx::query_scalar(
        "SELECT CAST(COALESCE(SUM(xp_reward), 0) AS INTEGER) FROM missions WHERE date = ? AND done = 0 AND progress >= target",
    )
    .bind(&today)
    .fetch_one(&mut *tx)
    .await?;
    if gained > 0 {
        sqlx::query("UPDATE missions SET done = 1 WHERE date = ? AND done = 0 AND progress >= target")
            .bind(&today)
            .execute(&mut *tx)
            .await?;
        super::player::add_xp(&mut tx, gained).await?;
    }
    tx.commit().await?;
    Ok(gained)
}

pub async fn missions_today(pool: &SqlitePool) -> AppResult<Vec<Mission>> {
    Ok(sqlx::query_as(
        "SELECT id, description, target, progress, done, xp_reward FROM missions
         WHERE date = date('now', 'localtime') ORDER BY id",
    )
    .fetch_all(pool)
    .await?)
}

/// Contadores do menu lateral: notícias não lidas e revisões vencidas (hoje ou antes).
pub async fn nav_badges(pool: &SqlitePool) -> AppResult<(i32, i32, i32)> {
    let (news, reviews, errors): (i32, i32, i32) = sqlx::query_as(
        "SELECT (SELECT COUNT(*) FROM news_items WHERE read = 0),
                (SELECT COUNT(*) FROM review_queue WHERE due_at <= date('now', 'localtime')),
                (SELECT COUNT(*) FROM errors_due)",
    )
    .fetch_one(pool)
    .await?;
    // Mesma conta da aba Flashcards (novos limitados por dia), para o número bater.
    Ok((news, reviews, errors + super::study::cards_due_count(pool).await?))
}
