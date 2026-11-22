-- Materiais do Grifo por tópico (vários: resumo, questões, flashcards…)
CREATE TABLE materials (
  id         INTEGER PRIMARY KEY,
  topic_id   INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL CHECK (kind IN ('resumo','questoes','flashcards','mnemonico','pegadinhas')),
  provider   TEXT NOT NULL CHECK (provider IN ('ollama','claude')),
  full       INTEGER NOT NULL DEFAULT 0,   -- 1 = apostila completa (HTML/PDF do Claude)
  content    TEXT,                         -- Markdown (modo rápido) ou texto puro (completo)
  path       TEXT,                         -- HTML/PDF gerado no modo completo
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_materials_topic ON materials(topic_id);

-- Apostilas geradas antes desta tabela
INSERT INTO materials (topic_id, kind, provider, full, content, path)
SELECT id, 'resumo', 'claude', 1, material, material_path FROM topics WHERE material_path IS NOT NULL;
