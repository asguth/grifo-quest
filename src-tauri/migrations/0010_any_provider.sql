-- no-transaction
-- Questões e materiais aceitam qualquer IA (GPT, Gemini, ChatGPT pela assinatura…). A regra antiga só
-- aceitava 'ollama'/'claude': o INSERT OR IGNORE das questões descartava em silêncio o lote das outras.
-- SQLite não altera CHECK: a tabela é refeita. Chaves estrangeiras desligadas, senão o DROP apagaria
-- tentativas e caderno de erros em cascata; a view que lê `questions` sai e volta (o RENAME a confere).
PRAGMA foreign_keys = OFF;
BEGIN;

DROP VIEW errors_due;

CREATE TABLE questions_new (
  id          INTEGER PRIMARY KEY,
  topic_id    INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  banca       TEXT,
  format      TEXT NOT NULL CHECK (format IN ('ce','ae')),
  statement   TEXT NOT NULL,
  options     TEXT NOT NULL DEFAULT '[]',
  answer      TEXT NOT NULL,
  explanation TEXT NOT NULL,
  difficulty  TEXT,
  source      TEXT NOT NULL CHECK (source <> ''),
  fingerprint TEXT NOT NULL UNIQUE,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  reported    INTEGER NOT NULL DEFAULT 0
);
INSERT INTO questions_new (id, topic_id, banca, format, statement, options, answer, explanation, difficulty, source, fingerprint, created_at, reported)
SELECT id, topic_id, banca, format, statement, options, answer, explanation, difficulty, source, fingerprint, created_at, reported FROM questions;
DROP TABLE questions;
ALTER TABLE questions_new RENAME TO questions;
CREATE INDEX idx_questions_topic ON questions(topic_id);

CREATE TABLE materials_new (
  id         INTEGER PRIMARY KEY,
  topic_id   INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL CHECK (kind IN ('resumo','questoes','flashcards','mnemonico','pegadinhas')),
  provider   TEXT NOT NULL CHECK (provider <> ''),
  full       INTEGER NOT NULL DEFAULT 0,
  content    TEXT,
  path       TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO materials_new (id, topic_id, kind, provider, full, content, path, created_at)
SELECT id, topic_id, kind, provider, full, content, path, created_at FROM materials;
DROP TABLE materials;
ALTER TABLE materials_new RENAME TO materials;
CREATE INDEX idx_materials_topic ON materials(topic_id);

CREATE VIEW errors_due AS
SELECT e.question_id, q.topic_id, e.due_at
FROM error_book e JOIN questions q ON q.id = e.question_id
WHERE e.due_at <= date('now', 'localtime');

COMMIT;
PRAGMA foreign_keys = ON;
