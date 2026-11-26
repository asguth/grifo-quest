pub mod classes;
pub mod diary;
pub mod exams;
pub mod logs;
pub mod materials;
pub mod player;
pub mod sessions;
pub mod settings;
pub mod study;
pub mod subjects;
pub mod world;

use std::path::Path;

use sqlx::SqlitePool;
use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode};

use crate::error::AppResult;

pub async fn open(path: &Path) -> AppResult<SqlitePool> {
    let options = SqliteConnectOptions::new()
        .filename(path)
        .create_if_missing(true)
        .foreign_keys(true)
        // WAL deixa o servidor MCP (fase 4) ler enquanto o app escreve.
        .journal_mode(SqliteJournalMode::Wal);
    let pool = SqlitePool::connect_with(options).await?;
    sqlx::migrate!("./migrations").run(&pool).await?;
    Ok(pool)
}

/// Exercita as consultas reais (SQL em string não é checado pelo compilador) num banco temporário.
#[cfg(test)]
mod tests {
    /// Abre uma cópia de banco real (`GQ_DB=caminho`) pelo mesmo caminho do app: roda as migrações pendentes.
    #[test]
    #[ignore]
    fn open_real_copy() {
        let path = std::env::var("GQ_DB").expect("GQ_DB");
        tauri::async_runtime::block_on(async {
            let pool = super::open(std::path::Path::new(&path)).await.unwrap();
            let v: i64 = sqlx::query_scalar("SELECT MAX(version) FROM _sqlx_migrations").fetch_one(&pool).await.unwrap();
            assert_eq!(v, 10);
        });
    }

    use crate::db::{classes, diary, exams, logs, player, sessions, study, subjects, world};
    use crate::domain::study::{CardState, NewQuestion, QuestionFormat};
    use crate::ai::Provider;
    use crate::domain::classroom::Evaluation;

    #[test]
    fn sql_end_to_end() {
        tauri::async_runtime::block_on(async {
            let path = std::env::temp_dir().join(format!("grifo-test-{}.db", std::process::id()));
            let _ = std::fs::remove_file(&path);
            let pool = super::open(&path).await.expect("abrir + migrations");

            // aviso de mostrar a janela depois de reiniciar: vale uma vez só
            assert!(!crate::settings::take_show_on_start(&pool).await.unwrap());
            crate::settings::ask_show_on_start(&pool).await.unwrap();
            assert!(crate::settings::take_show_on_start(&pool).await.unwrap());
            assert!(!crate::settings::take_show_on_start(&pool).await.unwrap());

            // 1º acesso sem matérias: só a missão de pomodoro
            assert_eq!(diary::refresh_missions(&pool).await.unwrap(), 0);
            assert_eq!(diary::missions_today(&pool).await.unwrap().len(), 1);

            let input = subjects::SubjectInput { name: "LGPD".into(), color: "#e0a84f".into(), exam_weight: 3.0 };
            let lgpd = subjects::create(&pool, &input).await.unwrap();
            // banco novo, sem nenhum minuto estudado: o ciclo de estudos não pode quebrar (bug real da Fase 9)
            assert_eq!(study::minutes_by_subject(&pool).await.unwrap(), vec![(lgpd, 3.0, 0.0)]);
            subjects::add_topics(&pool, lgpd, &["Princípios", "Bases legais"]).await.unwrap();
            let topic = subjects::topics(&pool, lgpd).await.unwrap()[0].id;

            // matéria cadastrada depois ganha missão no mesmo dia, sem duplicar a de pomodoro
            assert_eq!(diary::refresh_missions(&pool).await.unwrap(), 0);
            assert_eq!(diary::missions_today(&pool).await.unwrap().len(), 2);
            logs::insert_with_xp(&pool, lgpd, Some("FGV"), 20, 15, 50).await.unwrap();
            assert_eq!(diary::refresh_missions(&pool).await.unwrap(), 30, "missão de 20 questões concluída");
            assert_eq!(diary::refresh_missions(&pool).await.unwrap(), 0, "XP não é creditado duas vezes");
            assert_eq!(player::xp(&pool).await.unwrap(), 80);

            let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs() as i64;
            let s = sessions::NewSession {
                kind: crate::domain::timer::TimerKind::Estudo,
                subject_id: Some(lgpd),
                // começa há 1 min (não "25 min atrás"): rodando logo depois da meia-noite, a sessão
                // cairia no dia anterior e o teste quebrava
                started: now - 60,
                ended: now - 60 + 1500,
                source: sessions::SessionSource::Pomodoro,
                xp: 10,
            };
            sessions::insert(&pool, s).await.unwrap();
            assert_eq!(sessions::pomodoros_today(&pool).await.unwrap(), (1, 25));

            let acc = diary::accuracy(&pool, 30).await.unwrap();
            assert_eq!((acc[0].total, acc[0].correct), (20, 15));
            assert_eq!(diary::week_hours(&pool).await.unwrap()[0].minutes, 25);
            let act = diary::activity(&pool).await.unwrap();
            assert_eq!((act[0].questions, act[0].study_minutes), (20, 25));
            let (days, today) = diary::streak_days(&pool).await.unwrap();
            assert_eq!(days, vec![today]);

            let exam = exams::ExamInput { name: "ANPD".into(), exam_date: "2099-01-01".into(), banca: None, role: None };
            exams::create(&pool, &exam).await.unwrap();
            assert!(exams::list(&pool).await.unwrap()[0].days_left > 0);

            // aula: material → aula → boletim → reaula em 1 dia
            classes::set_material(&pool, topic, "texto", None).await.unwrap();
            assert!(classes::all_topics(&pool).await.unwrap()[0].has_material);
            let class = classes::create(&pool, topic, "texto").await.unwrap();
            let ev = Evaluation { cobertos: vec!["a".into()], ..Default::default() };
            classes::save_progress(&pool, class, "[]", &serde_json::to_string(&ev).unwrap()).await.unwrap();
            assert_eq!(classes::finish(&pool, class, topic, 100.0, 30).await.unwrap(), Some(1));
            let reports = classes::reports(&pool, Some(topic)).await.unwrap();
            assert_eq!((reports[0].next_review_days, reports[0].evaluation.cobertos.len()), (Some(1), 1));
            assert_eq!(diary::review_queue(&pool).await.unwrap().len(), 1);
            // aula que ficou aberta (app fechou no meio): aparece para retomar e pode ser descartada
            let open = classes::create(&pool, topic, "texto").await.unwrap();
            assert!(classes::open(&pool).await.unwrap().is_empty(), "sem falas ainda: não conta");
            classes::save_progress(&pool, open, r#"[{"role":"teacher","student":null,"text":"oi"}]"#, "{}").await.unwrap();
            assert_eq!(classes::open(&pool).await.unwrap()[0].id, open);
            classes::delete_open(&pool, open).await.unwrap();
            assert!(classes::open(&pool).await.unwrap().is_empty());

            // rastreador: upsert pelo link
            let c = world::FoundContest {
                title: "Concurso ANPD".into(),
                org: None,
                banca: Some("Cebraspe".into()),
                status: None,
                vacancies: None,
                salary: None,
                deadline: None,
                url: "https://x.gov.br/edital".into(),
                summary: None,
                exam_date: None,
            };
            assert!(world::upsert_contest(&pool, &c, world::ContestSource::Claude).await.unwrap());
            assert!(!world::upsert_contest(&pool, &c, world::ContestSource::Claude).await.unwrap());
            // mesmo concurso por outra fonte (RSS, outro link): junta no existente e só completa o que falta
            let rss = world::FoundContest {
                title: "Concurso ANPD: edital publicado".into(),
                vacancies: Some("40".into()),
                url: "https://blog.com/anpd".into(),
                ..c.clone()
            };
            assert!(!world::upsert_contest(&pool, &rss, world::ContestSource::Rss).await.unwrap(), "duplicata vira o mesmo concurso");
            let all = world::contests(&pool).await.unwrap();
            assert_eq!(all.len(), 1);
            assert_eq!((all[0].title.as_str(), all[0].vacancies.as_deref()), ("Concurso ANPD", Some("40")));

            // aditivo de concurso antigo chamado de "edital publicado" pela IA: grava como prova realizada
            let old = world::FoundContest {
                title: "Serpro – 3º aditivo do concurso 2023 (Analista)".into(),
                status: Some("edital publicado".into()),
                url: "https://serpro.gov.br/aditivo".into(),
                ..c.clone()
            };
            world::upsert_contest(&pool, &old, world::ContestSource::Claude).await.unwrap();
            let serpro = world::contests(&pool).await.unwrap().into_iter().find(|x| x.title.starts_with("Serpro")).unwrap();
            assert_eq!(serpro.status.as_deref(), Some(crate::domain::news::DONE));

            // notícias: capa e texto do RSS, classificação, lido/não lido
            let feed = world::feeds(&pool).await.unwrap()[0].id;
            let n = world::NewNews { feed_id: feed, title: "TRT-2 abre edital", link: "https://n/1", published: Some("2026-11-19 10:00:00"), description: Some("120 vagas"), image_url: None };
            assert!(world::insert_news(&pool, &n).await.unwrap());
            assert_eq!(world::needing_image(&pool, 10).await.unwrap().len(), 1);
            let id = world::needing_image(&pool, 10).await.unwrap()[0].0;
            world::set_image(&pool, id, Some("https://n/capa.jpg")).await.unwrap();
            assert!(world::needing_image(&pool, 10).await.unwrap().is_empty());
            world::set_classification(&pool, id, "Saiu o edital.", "edital", 0.9).await.unwrap();
            assert!(world::needing_summary(&pool, 10).await.unwrap().is_empty());
            world::set_read(&pool, id, true).await.unwrap();
            let item = &world::news(&pool, 10).await.unwrap()[0];
            assert_eq!((item.read, item.image_url.as_deref(), item.tags.as_deref()), (true, Some("https://n/capa.jpg"), Some("edital")));
            world::set_read(&pool, id, false).await.unwrap();
            assert_eq!(world::mark_all_read(&pool).await.unwrap(), 1);
            assert_eq!(world::feeds(&pool).await.unwrap().len(), 3);

            // estudo: banco de questões → resposta → caderno de erros (1/3/7 dias) → check do edital
            let q = |st: &str| NewQuestion {
                format: QuestionFormat::Ce,
                statement: st.into(),
                options: vec![],
                answer: "C".into(),
                explanation: "porque".into(),
                difficulty: None,
            };
            let qs: Vec<NewQuestion> = (0..10).map(|i| q(&format!("Afirmação número {i} sobre princípios"))).collect();
            assert_eq!(study::insert_questions(&pool, topic, Some("Cebraspe"), Provider::Ollama, &qs).await.unwrap(), 10);
            assert_eq!(study::insert_questions(&pool, topic, None, Provider::Ollama, &qs[..1]).await.unwrap(), 0, "repetida pela impressão digital");
            // migração 0010: questão de outra IA não some mais no INSERT OR IGNORE
            let other = [q("Afirmação escrita pelo ChatGPT")];
            assert_eq!(study::insert_questions(&pool, topic, None, Provider::Chatgpt, &other).await.unwrap(), 1);
            assert_eq!(study::insert_questions(&pool, topic, None, Provider::Openai, &[q("Afirmação da API do GPT")]).await.unwrap(), 1);
            sqlx::query("DELETE FROM questions WHERE source <> 'ollama'").execute(&pool).await.unwrap();
            let first = study::pick_for_topic(&pool, topic, "[]").await.unwrap().unwrap();
            let row = study::question(&pool, first).await.unwrap();
            let xp_before = player::xp(&pool).await.unwrap();
            study::record_answer(&pool, &row, None, "E", false, 30, 1).await.unwrap();
            assert_eq!(player::xp(&pool).await.unwrap(), xp_before + 1);
            let (streak, due_days): (i32, f64) = sqlx::query_as("SELECT streak, julianday(due_at) - julianday(date('now','localtime')) FROM error_book WHERE question_id = ?")
                .bind(first).fetch_one(&pool).await.unwrap();
            assert_eq!((streak, due_days), (0, 1.0));
            assert!(study::errors_due(&pool).await.unwrap().is_empty(), "só vence amanhã");
            assert_ne!(study::pick_for_topic(&pool, topic, &format!("[{first}]")).await.unwrap(), Some(first), "não repete na sessão");
            for _ in 0..3 {
                study::record_answer(&pool, &row, None, "C", true, 10, 3).await.unwrap();
            }
            assert!(sqlx::query_scalar::<_, i32>("SELECT COUNT(*) FROM error_book").fetch_one(&pool).await.unwrap() == 0, "saiu no 3º acerto");
            for qid in sqlx::query_scalar::<_, i32>("SELECT id FROM questions LIMIT 6").fetch_all(&pool).await.unwrap() {
                let r = study::question(&pool, qid).await.unwrap();
                study::record_answer(&pool, &r, None, "C", true, 5, 3).await.unwrap();
            }
            assert!(subjects::topics(&pool, lgpd).await.unwrap()[0].practice, "10 respostas marcam 'questões feitas'");
            assert_eq!(study::answered_today(&pool).await.unwrap(), 10);
            assert_eq!(study::recent_answers(&pool).await.unwrap().len(), 10);
            assert!(!study::topics_for_ranking(&pool).await.unwrap().is_empty());
            assert!(study::minutes_by_subject(&pool).await.unwrap()[0].2 >= 25.0);
            let sid = study::create_session(&pool, "diaria", 5, None).await.unwrap();
            let r = study::question(&pool, first).await.unwrap();
            study::record_answer(&pool, &r, Some(sid), "C", true, 7, 3).await.unwrap();
            let (total, correct, secs, by) = study::finish_session(&pool, sid).await.unwrap();
            assert_eq!((total, correct, secs, by.len()), (1, 1, 7, 1));

            // cartões: repetidos ignorados, revisão empurra o vencimento
            let cards = vec![("Prazo?".to_string(), "10 dias".to_string()), ("Prazo?".to_string(), "outro".to_string())];
            assert_eq!(study::insert_cards(&pool, Some(topic), study::CardSource::Grifo, &cards).await.unwrap(), 1);
            let due = study::cards_due(&pool, 10).await.unwrap();
            assert_eq!(due.len(), 1);
            study::save_card_state(&pool, due[0].id, CardState { ease: 2.5, interval_days: 2, reps: 1 }).await.unwrap();
            assert_eq!(study::cards_due_count(&pool).await.unwrap(), 0);
            assert_eq!(study::card_state(&pool, due[0].id).await.unwrap().interval_days, 2);

            // baralho: novos limitados por dia, editar, listar e apagar
            let many: Vec<(String, String)> = (0..25).map(|i| (format!("Frente {i}"), "verso".into())).collect();
            assert_eq!(study::insert_cards(&pool, None, study::CardSource::Manual, &many).await.unwrap(), 25);
            assert_eq!(study::cards_due_count(&pool).await.unwrap(), study::NEW_CARDS_PER_DAY);
            assert_eq!(study::cards_due(&pool, 100).await.unwrap().len() as i32, study::NEW_CARDS_PER_DAY);
            let deck = study::list_cards(&pool).await.unwrap();
            assert_eq!(deck.len(), 26);
            assert!(study::update_card(&pool, deck[0].id, "Prazo?", "x").await.is_err(), "frente repetida");
            study::update_card(&pool, deck[0].id, "Frente nova", "x").await.unwrap();
            study::delete_card(&pool, deck[0].id).await.unwrap();
            assert_eq!(study::list_cards(&pool).await.unwrap().len(), 25);

            // caderno de erros: lista, reportar tira da sessão e do caderno
            let wrong = study::question(&pool, study::pick_for_topic(&pool, topic, "[]").await.unwrap().unwrap()).await.unwrap();
            study::record_answer(&pool, &wrong, None, "E", false, 9, 1).await.unwrap();
            let book = study::error_list(&pool).await.unwrap();
            assert_eq!((book.len(), book[0].last_answer.as_deref(), book[0].misses), (1, Some("E"), 1));
            study::report_question(&pool, wrong.id).await.unwrap();
            assert!(study::error_list(&pool).await.unwrap().is_empty());
            let fresh_before = study::fresh_count(&pool, topic).await.unwrap();
            assert!(sqlx::query_scalar::<_, i32>("SELECT reported FROM questions WHERE id = ?").bind(wrong.id).fetch_one(&pool).await.unwrap() == 1);
            assert!(fresh_before < 10);

            // desempenho
            let perf = study::subject_perf(&pool).await.unwrap();
            let l = perf.iter().find(|s| s.id == lgpd).unwrap();
            assert!(l.answered_30 >= 12 && l.correct_30 <= l.answered_30);
            assert!(study::simulados(&pool).await.unwrap().is_empty());
            assert!(!study::daily_answers(&pool, 30).await.unwrap().is_empty());
            assert!(study::topic_ids_of_subject(&pool, lgpd).await.unwrap().contains(&topic));

            pool.close().await;
            let _ = std::fs::remove_file(&path);
        });
    }
}
