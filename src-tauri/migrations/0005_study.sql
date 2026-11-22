-- Banco de questões geradas pelo Grifo (uma vez geradas, voltam em outras sessões)
CREATE TABLE questions (
  id          INTEGER PRIMARY KEY,
  topic_id    INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  banca       TEXT,
  format      TEXT NOT NULL CHECK (format IN ('ce','ae')),
  statement   TEXT NOT NULL,
  options     TEXT NOT NULL DEFAULT '[]',     -- JSON (vazio no C/E)
  answer      TEXT NOT NULL,                  -- C/E ou A–E
  explanation TEXT NOT NULL,
  difficulty  TEXT,
  source      TEXT NOT NULL CHECK (source IN ('ollama','claude')),
  fingerprint TEXT NOT NULL UNIQUE,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_questions_topic ON questions(topic_id);

CREATE TABLE study_sessions (
  id             INTEGER PRIMARY KEY,
  kind           TEXT NOT NULL CHECK (kind IN ('diaria','reforco','simulado','topico','erros')),
  planned        INTEGER NOT NULL,
  time_limit_min INTEGER,
  started_at     TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at    TEXT
);

CREATE TABLE attempts (
  id          INTEGER PRIMARY KEY,
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  session_id  INTEGER REFERENCES study_sessions(id) ON DELETE SET NULL,
  answer      TEXT NOT NULL,
  correct     INTEGER NOT NULL,
  seconds     INTEGER NOT NULL DEFAULT 0,
  answered_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_attempts_question ON attempts(question_id);
CREATE INDEX idx_attempts_session ON attempts(session_id);

-- Caderno de erros: volta em 1, 3 e 7 dias; sai no 3º acerto seguido
CREATE TABLE error_book (
  question_id INTEGER PRIMARY KEY REFERENCES questions(id) ON DELETE CASCADE,
  streak      INTEGER NOT NULL DEFAULT 0,
  due_at      TEXT NOT NULL
);

-- Flashcards com repetição espaçada
CREATE TABLE cards (
  id            INTEGER PRIMARY KEY,
  topic_id      INTEGER REFERENCES topics(id) ON DELETE CASCADE,
  front         TEXT NOT NULL,
  back          TEXT NOT NULL,
  source        TEXT NOT NULL CHECK (source IN ('grifo','erro','manual')),
  ease          REAL NOT NULL DEFAULT 2.5,
  interval_days INTEGER NOT NULL DEFAULT 0,
  reps          INTEGER NOT NULL DEFAULT 0,
  due_at        TEXT NOT NULL DEFAULT (date('now','localtime')),
  fingerprint   TEXT NOT NULL UNIQUE,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_cards_due ON cards(due_at);
