import { describe, expect, it } from "vitest";
import { coverage, outlineItems } from "./outline";

describe("outlineItems", () => {
  it("lê lista com negrito, numerada e sem negrito", () => {
    const md = "# Título\n- **Conceito**: o essencial\n2. **Prazo** — 120 dias\n* item solto\ntexto corrido";
    expect(outlineItems(md)).toEqual([
      { title: "Conceito", text: "o essencial" },
      { title: "Prazo", text: "120 dias" },
      { title: "", text: "item solto" },
    ]);
  });

  it("material sem lista não vira itens", () => {
    expect(outlineItems("Art. 5º Todos são iguais perante a lei.")).toEqual([]);
  });
});

describe("coverage", () => {
  it("segue a regra do backend", () => {
    expect(coverage({ cobertos: ["a", "b", "c"], rasos: ["d", "e"], omitidos: ["f"], erros: [] })).toBe(67);
    expect(coverage(null)).toBe(0);
  });
});
