import { describe, expect, it } from "vitest";
import { stageOf } from "./contests";

describe("stageOf", () => {
  it("mapeia o status livre para a etapa da linha do tempo", () => {
    expect(stageOf("previsto")).toBe(0);
    expect(stageOf("Banca definida")).toBe(1);
    expect(stageOf("edital publicado")).toBe(2);
    expect(stageOf("Inscrições abertas")).toBe(3);
    expect(stageOf("notícia")).toBe(-1);
    expect(stageOf(null)).toBe(-1);
  });

  it("a situação atual vence a etapa futura citada no mesmo status", () => {
    expect(stageOf("prova prevista para junho")).toBe(0);
    expect(stageOf("Inscrições abertas, prova em agosto")).toBe(3);
  });
});

describe("isDone", () => {
  it("só a prova realizada sai da lista de abertos", async () => {
    const { isDone } = await import("./contests");
    expect(isDone("prova realizada")).toBe(true);
    expect(isDone("edital publicado")).toBe(false);
    expect(isDone(null)).toBe(false);
  });
});
