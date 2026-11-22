-- Questão reportada (gabarito errado, texto-base faltando…) sai das sessões mas mantém o histórico.
ALTER TABLE questions ADD COLUMN reported INTEGER NOT NULL DEFAULT 0;

-- Índices para as contas que rodam toda hora (respondidas hoje, ranking, caderno, baralho).
CREATE INDEX IF NOT EXISTS idx_attempts_answered ON attempts(answered_at);
CREATE INDEX IF NOT EXISTS idx_error_book_due ON error_book(due_at);
CREATE INDEX IF NOT EXISTS idx_cards_topic ON cards(topic_id);
CREATE INDEX IF NOT EXISTS idx_topics_subject ON topics(subject_id);
CREATE INDEX IF NOT EXISTS idx_sessions_kind ON study_sessions(kind, finished_at);
