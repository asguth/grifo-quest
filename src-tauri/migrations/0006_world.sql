-- Notícias: capa, texto do RSS, classificação da IA local e quando foi lida
ALTER TABLE news_items ADD COLUMN image_url TEXT;
ALTER TABLE news_items ADD COLUMN image_checked INTEGER NOT NULL DEFAULT 0;   -- já procurou og:image na página
ALTER TABLE news_items ADD COLUMN description TEXT;
ALTER TABLE news_items ADD COLUMN summary TEXT;
ALTER TABLE news_items ADD COLUMN tags TEXT;                                  -- "edital,inscricoes"
ALTER TABLE news_items ADD COLUMN relevance REAL;                             -- 0–1 para a sua área
ALTER TABLE news_items ADD COLUMN read_at TEXT;

-- Rastreador: o mesmo concurso vindo de fontes diferentes vira um só
ALTER TABLE contests ADD COLUMN dedupe_key TEXT;
CREATE INDEX idx_contests_dedupe ON contests(dedupe_key);
