-- Regras usadas por várias consultas (e pelo servidor MCP): escritas uma vez aqui.

-- Sessões de tempo encerradas, com a duração em minutos.
CREATE VIEW session_minutes AS
SELECT id, kind, subject_id, source, started_at, (julianday(ended_at) - julianday(started_at)) * 1440 AS minutes
FROM time_sessions
WHERE ended_at IS NOT NULL;

-- Questões do caderno de erros que vencem hoje (ou antes).
CREATE VIEW errors_due AS
SELECT e.question_id, q.topic_id, e.due_at
FROM error_book e JOIN questions q ON q.id = e.question_id
WHERE e.due_at <= date('now', 'localtime');

-- Cartão novo = nunca revisado.
CREATE VIEW card_state AS
SELECT c.*, (c.reps + c.interval_days = 0) AS is_new
FROM cards c;
