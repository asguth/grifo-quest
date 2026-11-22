import { describe, expect, it } from "vitest";
import { parseFlashcards } from "./flashcards";

describe("parseFlashcards", () => {
  it("lê a tabela e ignora cabeçalho, separador e texto em volta", () => {
    const md = `# Flashcards\n\nIntro.\n\n| Frente | Verso |\n|---|:---:|\n| Prazo do recurso? | **10 dias** (art. 59) |\n| Quem julga? | A autoridade superior<br>em 30 dias |\n| incompleta |\n`;
    expect(parseFlashcards(md)).toEqual([
      { front: "Prazo do recurso?", back: "10 dias (art. 59)" },
      { front: "Quem julga?", back: "A autoridade superior\nem 30 dias" },
    ]);
  });

  it("devolve vazio quando não há tabela", () => {
    expect(parseFlashcards("só texto")).toEqual([]);
  });
});
