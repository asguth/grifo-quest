CREATE TABLE subjects (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  color       TEXT NOT NULL DEFAULT '#e0a84f',
  exam_weight REAL NOT NULL DEFAULT 1.0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE topics (
  id         INTEGER PRIMARY KEY,
  subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'nao_visto' CHECK (status IN ('nao_visto','estudando','dominado'))
);

CREATE TABLE question_logs (
  id         INTEGER PRIMARY KEY,
  subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  topic_id   INTEGER REFERENCES topics(id) ON DELETE SET NULL,
  banca      TEXT,
  total      INTEGER NOT NULL CHECK (total > 0),
  correct    INTEGER NOT NULL CHECK (correct >= 0 AND correct <= total),
  logged_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE time_sessions (
  id         INTEGER PRIMARY KEY,
  kind       TEXT NOT NULL CHECK (kind IN ('estudo','trabalho')),
  subject_id INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
  started_at TEXT NOT NULL,
  ended_at   TEXT,
  source     TEXT NOT NULL CHECK (source IN ('pomodoro','manual'))
);

CREATE TABLE classes (
  id             INTEGER PRIMARY KEY,
  topic_id       INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  reference_text TEXT NOT NULL,
  transcript     TEXT NOT NULL DEFAULT '[]',
  report         TEXT,
  coverage_score REAL,
  held_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE review_queue (
  id            INTEGER PRIMARY KEY,
  topic_id      INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  due_at        TEXT NOT NULL,
  interval_days INTEGER NOT NULL,
  last_class_id INTEGER REFERENCES classes(id) ON DELETE SET NULL
);

CREATE TABLE player (
  id               INTEGER PRIMARY KEY CHECK (id = 1),
  xp               INTEGER NOT NULL DEFAULT 0,
  level            INTEGER NOT NULL DEFAULT 1,
  streak_days      INTEGER NOT NULL DEFAULT 0,
  shields          INTEGER NOT NULL DEFAULT 0,
  last_active_date TEXT
);
INSERT INTO player (id) VALUES (1);

CREATE TABLE missions (
  id          INTEGER PRIMARY KEY,
  date        TEXT NOT NULL,
  description TEXT NOT NULL,
  target      INTEGER NOT NULL,
  progress    INTEGER NOT NULL DEFAULT 0,
  done        INTEGER NOT NULL DEFAULT 0,
  xp_reward   INTEGER NOT NULL
);

-- Preferencias do app (autostart inicializado; config do pomodoro na fase 2)
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX idx_logs_logged_at ON question_logs(logged_at);
CREATE INDEX idx_sessions_started_at ON time_sessions(started_at);
