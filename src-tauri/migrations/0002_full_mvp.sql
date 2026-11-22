-- Provas marcadas (contagem regressiva no Diário)
CREATE TABLE exams (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  exam_date  TEXT NOT NULL,           -- YYYY-MM-DD
  banca      TEXT,
  role       TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Concursos encontrados pelo rastreador (Claude CLI ou RSS)
CREATE TABLE contests (
  id         INTEGER PRIMARY KEY,
  title      TEXT NOT NULL,
  org        TEXT,
  banca      TEXT,
  status     TEXT,
  vacancies  TEXT,
  salary     TEXT,
  deadline   TEXT,
  url        TEXT NOT NULL UNIQUE,
  summary    TEXT,
  source     TEXT NOT NULL CHECK (source IN ('claude','rss')),
  followed   INTEGER NOT NULL DEFAULT 0,
  found_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE feeds (
  id     INTEGER PRIMARY KEY,
  name   TEXT NOT NULL,
  url    TEXT NOT NULL UNIQUE,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE news_items (
  id           INTEGER PRIMARY KEY,
  feed_id      INTEGER NOT NULL REFERENCES feeds(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  link         TEXT NOT NULL UNIQUE,
  published_at TEXT,
  read         INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_news_published ON news_items(published_at);

INSERT INTO feeds (name, url) VALUES
  ('Estratégia Concursos', 'https://www.estrategiaconcursos.com.br/blog/feed/'),
  ('Gran Cursos', 'https://blog.grancursosonline.com.br/feed/'),
  ('Google Notícias: editais', 'https://news.google.com/rss/search?q=concurso+p%C3%BAblico+edital&hl=pt-BR&gl=BR&ceid=BR:pt-419');

-- Missões com progresso calculado a partir dos lançamentos do dia
ALTER TABLE missions ADD COLUMN kind TEXT NOT NULL DEFAULT 'questoes' CHECK (kind IN ('questoes','pomodoros'));
ALTER TABLE missions ADD COLUMN subject_id INTEGER REFERENCES subjects(id) ON DELETE CASCADE;
CREATE INDEX idx_missions_date ON missions(date);

-- Material de referência do tópico (colado ou gerado pelo Grifo)
ALTER TABLE topics ADD COLUMN material TEXT;
ALTER TABLE topics ADD COLUMN material_path TEXT;

-- Boletim: aulas encerradas
ALTER TABLE classes ADD COLUMN finished INTEGER NOT NULL DEFAULT 0;
