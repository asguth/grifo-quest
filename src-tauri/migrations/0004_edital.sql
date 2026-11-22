-- Edital verticalizado: checks por tópico (teoria, questões, revisões 1–3)
ALTER TABLE topics ADD COLUMN theory   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE topics ADD COLUMN practice INTEGER NOT NULL DEFAULT 0;
ALTER TABLE topics ADD COLUMN reviews  INTEGER NOT NULL DEFAULT 0 CHECK (reviews BETWEEN 0 AND 3);
