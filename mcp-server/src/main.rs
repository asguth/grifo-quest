#![allow(clippy::type_complexity)] // tuplas de query_as: mais curtas que um struct por consulta
//! Servidor MCP do Grifo Quest: expõe o progresso de estudos ao Claude (stdio, banco somente leitura).
//! Caminho do banco: 1º argumento, `GRIFO_DB`, ou `%APPDATA%/dev.grifoquest.app/grifo.db`.

use std::path::PathBuf;

use rmcp::handler::server::{router::tool::ToolRouter, wrapper::Parameters};
use rmcp::model::{ServerCapabilities, ServerConfig};
use rmcp::{ServerHandler, ServiceExt, schemars, tool, tool_handler, tool_router};
use serde_json::{Value, json};
use sqlx::SqlitePool;
use sqlx::sqlite::SqliteConnectOptions;

// ponytail: algumas consultas repetem as do app (crate separado, só leitura). As regras comuns
// (minutos, erros vencidos) vêm das views da migração 0009; o teste abaixo roda tudo no esquema real.

#[derive(Clone)]
struct Grifo {
    pool: SqlitePool,
    #[allow(dead_code)] // usado pelo macro tool_handler
    tool_router: ToolRouter<Self>,
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
struct StatsRequest {
    #[schemars(description = "Período: \"7d\", \"30d\" ou \"all\"")]
    period: Option<String>,
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
struct WeakRequest {
    #[schemars(description = "Quantos tópicos devolver (padrão 10)")]
    limit: Option<i32>,
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
struct ReportsRequest {
    #[schemars(description = "Filtra por parte do nome do tópico (opcional)")]
    topic: Option<String>,
}

fn out(r: Result<Value, sqlx::Error>) -> String {
    match r {
        Ok(v) => serde_json::to_string_pretty(&v).unwrap_or_default(),
        Err(e) => format!("Erro ao ler o banco do Grifo Quest: {e}"),
    }
}

#[tool_router]
impl Grifo {
    #[tool(description = "Estatísticas de estudo: acerto por matéria, horas de estudo e de trabalho, e tendência de acerto contra o período anterior.")]
    async fn get_stats(&self, Parameters(req): Parameters<StatsRequest>) -> String {
        let days = match req.period.as_deref() {
            Some("7d") => 7,
            Some("all") => 36_500,
            _ => 30,
        };
        out(self.stats(days).await)
    }

    #[tool(description = "Tópicos mais fracos: piores notas na sala de aula (ou nunca ensinados) nas matérias com pior acerto e maior peso no edital.")]
    async fn get_weak_topics(&self, Parameters(req): Parameters<WeakRequest>) -> String {
        out(self.weak_topics(req.limit.unwrap_or(10).clamp(1, 50)).await)
    }

    #[tool(description = "Fila de revisão: aulas a refazer (vencidas e dos próximos 7 dias).")]
    async fn get_review_queue(&self) -> String {
        let rows: Result<Vec<(String, String, String, i32)>, _> = sqlx::query_as(
            "SELECT t.name, s.name, r.due_at, r.interval_days FROM review_queue r
             JOIN topics t ON t.id = r.topic_id JOIN subjects s ON s.id = t.subject_id
             WHERE r.due_at <= date('now', 'localtime', '+7 days') ORDER BY r.due_at",
        )
        .fetch_all(&self.pool)
        .await;
        out(rows.map(|rows| {
            json!(rows.into_iter().map(|(topic, subject, due, interval)| json!({
                "topico": topic, "materia": subject, "vence_em": due, "intervalo_dias": interval
            })).collect::<Vec<_>>())
        }))
    }

    #[tool(description = "Boletins da sala de aula: nota de cobertura e lista de conceitos cobertos, rasos, omitidos e errados.")]
    async fn get_class_reports(&self, Parameters(req): Parameters<ReportsRequest>) -> String {
        let pattern = format!("%{}%", req.topic.unwrap_or_default());
        let rows: Result<Vec<(String, String, String, f64, Option<String>)>, _> = sqlx::query_as(
            "SELECT t.name, s.name, c.held_at, COALESCE(c.coverage_score, 0), c.report FROM classes c
             JOIN topics t ON t.id = c.topic_id JOIN subjects s ON s.id = t.subject_id
             WHERE c.finished = 1 AND t.name LIKE ? ORDER BY c.held_at DESC LIMIT 20",
        )
        .bind(pattern)
        .fetch_all(&self.pool)
        .await;
        out(rows.map(|rows| {
            json!(rows.into_iter().map(|(topic, subject, at, score, report)| json!({
                "topico": topic, "materia": subject, "data": at, "nota_cobertura": score,
                "avaliacao": report.and_then(|r| serde_json::from_str::<Value>(&r).ok()),
            })).collect::<Vec<_>>())
        }))
    }

    #[tool(description = "Provas marcadas e quantos dias faltam.")]
    async fn get_exams(&self) -> String {
        let rows: Result<Vec<(String, String, Option<String>, i32)>, _> = sqlx::query_as(
            "SELECT name, exam_date, banca,
                    CAST(julianday(exam_date) - julianday(date('now', 'localtime')) AS INTEGER)
             FROM exams ORDER BY exam_date",
        )
        .fetch_all(&self.pool)
        .await;
        out(rows.map(|rows| {
            json!(rows.into_iter().map(|(name, date, banca, days)| json!({
                "nome": name, "data": date, "banca": banca, "dias_restantes": days
            })).collect::<Vec<_>>())
        }))
    }

    #[tool(description = "Concursos encontrados pelo rastreador (seguidos primeiro).")]
    async fn get_contests(&self) -> String {
        let rows: Result<Vec<(String, Option<String>, Option<String>, Option<String>, Option<String>, String, bool)>, _> =
            sqlx::query_as(
                "SELECT title, org, banca, status, deadline, url, followed FROM contests
                 ORDER BY followed DESC, found_at DESC LIMIT 40",
            )
            .fetch_all(&self.pool)
            .await;
        out(rows.map(|rows| {
            json!(rows.into_iter().map(|(title, org, banca, status, deadline, url, followed)| json!({
                "titulo": title, "orgao": org, "banca": banca, "status": status,
                "prazo": deadline, "link": url, "seguido": followed
            })).collect::<Vec<_>>())
        }))
    }
}

impl Grifo {
    async fn stats(&self, days: i32) -> Result<Value, sqlx::Error> {
        let window = |offset: i32| {
            sqlx::query_as::<_, (String, i32, i32)>(
                "SELECT s.name, CAST(COALESCE(SUM(q.total), 0) AS INTEGER), CAST(COALESCE(SUM(q.correct), 0) AS INTEGER)
                 FROM subjects s LEFT JOIN question_logs q ON q.subject_id = s.id
                   AND q.logged_at >= datetime('now', '-' || ? || ' days')
                   AND q.logged_at <  datetime('now', '-' || ? || ' days')
                 GROUP BY s.id ORDER BY s.name",
            )
            .bind(days + offset)
            .bind(offset)
            .fetch_all(&self.pool)
        };
        let now = window(0).await?;
        let before = window(days).await?;
        let pct = |t: i32, c: i32| (t > 0).then(|| (1000.0 * f64::from(c) / f64::from(t)).round() / 10.0);

        let subjects: Vec<Value> = now
            .iter()
            .zip(before.iter())
            .map(|((name, t, c), (_, pt, pc))| {
                json!({ "materia": name, "questoes": t, "certas": c,
                        "acerto_pct": pct(*t, *c), "acerto_pct_periodo_anterior": pct(*pt, *pc) })
            })
            .collect();

        let hours: Vec<(String, f64)> = sqlx::query_as(
            "SELECT kind, COALESCE(SUM(minutes) / 60.0, 0) FROM session_minutes
             WHERE started_at >= datetime('now', '-' || ? || ' days') GROUP BY kind",
        )
        .bind(days)
        .fetch_all(&self.pool)
        .await?;
        let h = |k: &str| hours.iter().find(|(kind, _)| kind == k).map_or(0.0, |(_, v)| (v * 10.0).round() / 10.0);
        let xp: i32 = sqlx::query_scalar("SELECT xp FROM player WHERE id = 1").fetch_one(&self.pool).await?;

        Ok(json!({
            "periodo_dias": days,
            "por_materia": subjects,
            "horas_estudo": h("estudo"),
            "horas_trabalho": h("trabalho"),
            "xp_total": xp,
        }))
    }

    async fn weak_topics(&self, limit: i32) -> Result<Value, sqlx::Error> {
        let rows: Vec<(String, String, Option<f64>, Option<f64>, f64, i32)> = sqlx::query_as(
            "SELECT t.name, s.name,
                    (SELECT c.coverage_score FROM classes c WHERE c.topic_id = t.id AND c.finished = 1
                     ORDER BY c.held_at DESC LIMIT 1) AS last_score,
                    (SELECT 100.0 * SUM(q.correct) / NULLIF(SUM(q.total), 0) FROM question_logs q
                     WHERE q.subject_id = s.id AND q.logged_at >= datetime('now', '-30 days')) AS subject_pct,
                    s.exam_weight,
                    (SELECT COUNT(*) FROM errors_due e WHERE e.topic_id = t.id) AS errors_due
             FROM topics t JOIN subjects s ON s.id = t.subject_id
             WHERE t.theory + t.practice + t.reviews < 5
             ORDER BY errors_due DESC, COALESCE(last_score, -1), COALESCE(subject_pct, 50) / s.exam_weight
             LIMIT ?",
        )
        .bind(limit)
        .fetch_all(&self.pool)
        .await?;
        Ok(json!(rows.into_iter().map(|(topic, subject, score, pct, weight, errors)| json!({
            "topico": topic, "materia": subject, "erros_para_revisar_hoje": errors,
            "ultima_nota_aula": score, "acerto_materia_30d_pct": pct.map(|p| (p * 10.0).round() / 10.0),
            "peso_edital": weight,
        })).collect::<Vec<_>>()))
    }
}

#[tool_handler]
impl ServerHandler for Grifo {
    fn get_info(&self) -> ServerConfig {
        ServerConfig::new(ServerCapabilities::builder().enable_tools().build()).with_instructions(
            "Dados de estudo para concursos do Grifo Quest (somente leitura): estatísticas, tópicos fracos, \
             fila de revisão, boletins da sala de aula, provas e concursos rastreados.",
        )
    }
}

fn db_path() -> PathBuf {
    if let Some(p) = std::env::args().nth(1).or_else(|| std::env::var("GRIFO_DB").ok()) {
        return PathBuf::from(p);
    }
    let base = std::env::var("APPDATA")
        .or_else(|_| std::env::var("XDG_DATA_HOME"))
        .unwrap_or_else(|_| ".".into());
    PathBuf::from(base).join("dev.grifoquest.app").join("grifo.db")
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let path = db_path();
    if !path.exists() {
        return Err(format!("Banco do Grifo Quest não encontrado em {} (abra o app uma vez)", path.display()).into());
    }
    let pool = SqlitePool::connect_with(SqliteConnectOptions::new().filename(&path).read_only(true)).await?;
    let server = Grifo { pool, tool_router: Grifo::tool_router() };
    server.serve(rmcp::transport::stdio()).await?.waiting().await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn every_tool_runs_on_the_migrated_schema() {
        let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
        sqlx::migrate!("../src-tauri/migrations").run(&pool).await.unwrap();
        let g = Grifo { pool, tool_router: Grifo::tool_router() };
        let outputs = [
            g.get_stats(Parameters(StatsRequest { period: Some("7d".into()) })).await,
            g.get_weak_topics(Parameters(WeakRequest { limit: None })).await,
            g.get_review_queue().await,
            g.get_class_reports(Parameters(ReportsRequest { topic: None })).await,
            g.get_exams().await,
            g.get_contests().await,
        ];
        for o in outputs {
            assert!(!o.starts_with("Erro"), "{o}");
        }
    }
}
