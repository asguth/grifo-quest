//! Tudo o que fica em `settings`: config do backend, perfil, pomodoro (JSON tipado, uma chave cada)
//! e as preferências da interface (`ui_*`, texto livre que só o front interpreta).

use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

use crate::ai::Route;
use crate::db;
use crate::error::{AppError, AppResult};

/// Um valor JSON guardado numa chave de `settings`. Campos novos entram pelo `#[serde(default)]`.
pub trait Stored: Serialize + DeserializeOwned + Default {
    const KEY: &'static str;
}

/// Ausente = padrão. JSON ilegível vira erro: devolver o padrão faria o próximo `save` apagar os dados.
pub async fn load<T: Stored>(pool: &SqlitePool) -> AppResult<T> {
    match db::settings::get(pool, T::KEY).await? {
        None => Ok(T::default()),
        Some(s) => serde_json::from_str(&s).map_err(|e| AppError::Invalid(format!("Configuração '{}' ilegível: {e}", T::KEY))),
    }
}

pub async fn save<T: Stored>(pool: &SqlitePool, value: &T) -> AppResult<()> {
    db::settings::set(pool, T::KEY, &serde_json::to_string(value)?).await
}

const DEFAULT_MODEL: &str = "gemma4:12b";

/// Configuração usada pelo backend (IA, rastreador).
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(default)]
pub struct AppConfig {
    pub interest_area: String,
    pub keywords: Vec<String>,
    pub claude_cli: String,
    pub ollama_url: String,
    pub student_model: String,
    pub evaluator_model: String,
    pub evaluator: Route,
    /// Modelo do Ollama para tarefas de texto (materiais do Grifo, resumos).
    pub task_model: String,
    /// Onde rodam os materiais rápidos do Grifo (resumo, questões, flashcards…).
    pub material_route: Route,
    /// Modelo de cada IA na nuvem (a chave fica no cofre do Windows, não aqui).
    pub cloud_models: CloudModels,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(default)]
pub struct CloudModels {
    pub gemini: String,
    pub openai: String,
    pub grok: String,
}

impl Default for CloudModels {
    fn default() -> Self {
        // Modelos rápidos e baratos de cada uma; Integrações lista os da conta para trocar.
        Self { gemini: "gemini-2.5-flash".into(), openai: "gpt-4.1-mini".into(), grok: "grok-3-mini".into() }
    }
}

impl CloudModels {
    pub fn get(&self, c: crate::cloud::Cloud) -> &str {
        match c {
            crate::cloud::Cloud::Gemini => &self.gemini,
            crate::cloud::Cloud::Openai => &self.openai,
            crate::cloud::Cloud::Grok => &self.grok,
        }
    }
}

impl Stored for AppConfig {
    const KEY: &'static str = "config";
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            interest_area: String::new(),
            keywords: Vec::new(),
            claude_cli: "claude".into(),
            ollama_url: "http://localhost:11434".into(),
            // Mesmo modelo nos três papéis: 14B + 8B não cabem juntos em 12 GB e a troca custa ~1 min por bloco.
            student_model: DEFAULT_MODEL.into(),
            evaluator_model: DEFAULT_MODEL.into(),
            evaluator: Route::Ollama,
            task_model: DEFAULT_MODEL.into(),
            material_route: Route::Auto,
            cloud_models: CloudModels::default(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(default)]
pub struct Profile {
    /// Como o Grifo te chama.
    pub name: String,
    /// Área de interesse (Policial, Fiscal, Tribunais…).
    pub area: String,
    /// medio | superior
    pub education: String,
    pub hours_per_day: f64,
    /// Dias de estudo, 0 = domingo … 6 = sábado.
    pub study_days: Vec<i32>,
    /// Meta de questões por dia (as missões dividem entre as matérias mais fracas).
    pub daily_questions: i32,
    /// Já passou pelo assistente de primeira abertura.
    pub onboarded: bool,
}

impl Stored for Profile {
    const KEY: &'static str = "profile";
}

impl Default for Profile {
    fn default() -> Self {
        Self {
            name: String::new(),
            area: String::new(),
            education: "superior".into(),
            hours_per_day: 2.0,
            study_days: vec![1, 2, 3, 4, 5],
            daily_questions: 20,
            onboarded: false,
        }
    }
}

impl Profile {
    pub fn validate(&self) -> AppResult<()> {
        if !(1..=500).contains(&self.daily_questions) {
            return Err(AppError::Invalid("Meta diária entre 1 e 500 questões".into()));
        }
        if !(0.25..=16.0).contains(&self.hours_per_day) {
            return Err(AppError::Invalid("Horas por dia entre 0,25 e 16".into()));
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, specta::Type)]
#[serde(default)]
pub struct PomodoroConfig {
    pub focus_min: i32,
    pub break_min: i32,
}

impl Stored for PomodoroConfig {
    const KEY: &'static str = "pomodoro";
}

impl Default for PomodoroConfig {
    fn default() -> Self {
        Self { focus_min: 25, break_min: 5 }
    }
}

impl PomodoroConfig {
    pub fn validate(&self) -> AppResult<()> {
        if !(1..=180).contains(&self.focus_min) || !(1..=60).contains(&self.break_min) {
            return Err(AppError::Invalid("Foco entre 1 e 180 min, pausa entre 1 e 60 min".into()));
        }
        Ok(())
    }
}

wire_enum! {
    /// Preferências da interface (`ui_<nome>` em `settings`). O front usa o tipo gerado nos bindings.
    pub enum UiKey {
        Theme = "theme",
        HomeLayout = "home_layout",
        Sound = "sound",
        SidebarCollapsed = "sidebar_collapsed",
        WelcomeOnBoot = "welcome_on_boot",
        ClassVoice = "class_voice",
        TourDone = "tour_done",
        SoundVolume = "sound_volume",
    }
}

impl UiKey {
    fn db_key(self) -> String {
        format!("ui_{}", self.as_str())
    }
}

pub async fn ui_pref(pool: &SqlitePool, key: UiKey) -> AppResult<Option<String>> {
    db::settings::get(pool, &key.db_key()).await
}

pub async fn set_ui_pref(pool: &SqlitePool, key: UiKey, value: &str) -> AppResult<()> {
    db::settings::set(pool, &key.db_key(), value).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ui_keys_keep_their_stored_names() {
        // Renomear uma variante perderia a preferência já salva.
        assert_eq!(UiKey::WelcomeOnBoot.db_key(), "ui_welcome_on_boot");
        assert_eq!(UiKey::HomeLayout.db_key(), "ui_home_layout");
    }

    #[test]
    fn old_saved_config_keeps_fields_and_fills_new_ones() {
        let c: AppConfig = serde_json::from_str(r#"{"claude_cli":"C:\\claude.exe","evaluator":"ollama"}"#).unwrap();
        assert_eq!(c.claude_cli, "C:\\claude.exe");
        assert_eq!(c.material_route, Route::Auto);
    }
}
