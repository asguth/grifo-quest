use serde::Serialize;
use sqlx::SqlitePool;
use tauri::State;

use crate::db::diary::{self, DayActivity, DayHours, Mission, ReviewItem, SubjectAccuracy};
use crate::db::exams::{self, Exam};
use crate::db::player;
use crate::domain::level::{self, LevelProgress};
use crate::domain::streak::{self, Streak};
use crate::error::AppResult;

#[derive(Debug, Serialize, specta::Type)]
pub struct Dashboard {
    pub xp: i32,
    pub level: LevelProgress,
    pub streak: Streak,
    pub missions: Vec<Mission>,
    pub exams: Vec<Exam>,
    pub accuracy: Vec<SubjectAccuracy>,
    pub week_hours: Vec<DayHours>,
    pub activity: Vec<DayActivity>,
    pub reviews: Vec<ReviewItem>,
}

/// Tudo que o Diário precisa numa chamada só.
#[tauri::command]
#[specta::specta]
pub async fn get_dashboard(pool: State<'_, SqlitePool>) -> AppResult<Dashboard> {
    diary::refresh_missions(&pool).await?;
    let xp = player::xp(&pool).await?;
    let (active, today) = diary::streak_days(&pool).await?;
    let upcoming = exams::list(&pool).await?.into_iter().filter(|e| e.days_left >= 0).collect();
    Ok(Dashboard {
        xp,
        level: level::progress(xp),
        streak: streak::compute(&active, today),
        missions: diary::missions_today(&pool).await?,
        exams: upcoming,
        accuracy: diary::accuracy(&pool, 30).await?,
        week_hours: diary::week_hours(&pool).await?,
        activity: diary::activity(&pool).await?,
        reviews: diary::review_queue(&pool).await?,
    })
}

#[derive(Debug, Serialize, specta::Type)]
pub struct NavBadges {
    pub unread_news: i32,
    pub reviews_due: i32,
    /// Questões do caderno de erros + flashcards vencidos hoje.
    pub study_due: i32,
}

/// Contadores do menu lateral (consulta leve, sem gerar missões).
#[tauri::command]
#[specta::specta]
pub async fn nav_badges(pool: State<'_, SqlitePool>) -> AppResult<NavBadges> {
    let (unread_news, reviews_due, study_due) = diary::nav_badges(&pool).await?;
    Ok(NavBadges { unread_news, reviews_due, study_due })
}
