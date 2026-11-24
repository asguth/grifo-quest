import { describe, expect, it } from "vitest";
import { DEFAULT_LAYOUT, mergeLayout, SIZE_GRID } from "./layout";

describe("mergeLayout", () => {
  it("mantém a ordem e as escolhas salvas", () => {
    const out = mergeLayout([
      { id: "news", enabled: false, size: "s" },
      { id: "today", enabled: true, size: "l" },
    ]);
    expect(out.slice(0, 2)).toEqual([
      { id: "news", enabled: false, size: "s" },
      { id: "today", enabled: true, size: "l" },
    ]);
  });

  it("descarta widgets que não existem mais", () => {
    const out = mergeLayout([{ id: "removido", enabled: true }, { id: "heatmap", enabled: true }]);
    expect(out.map((s) => s.id)).not.toContain("removido");
    expect(out[0].id).toBe("heatmap");
  });

  it("acrescenta no fim, com o padrão, os widgets que o layout salvo não tinha", () => {
    const out = mergeLayout([{ id: "contests", enabled: false }]);
    expect(out[0]).toEqual({ id: "contests", enabled: false, size: "s" });
    expect(out.slice(1)).toEqual(DEFAULT_LAYOUT.filter((s) => s.id !== "contests"));
  });

  it("migra o formato antigo `wide` para tamanho", () => {
    const [wide, narrow] = mergeLayout([
      { id: "missions", wide: true },
      { id: "today", wide: false },
    ]);
    expect(wide).toEqual({ id: "missions", enabled: true, size: "m" });
    expect(narrow.size).toBe(DEFAULT_LAYOUT.find((s) => s.id === "today")?.size);
  });
});

describe("layout padrão da primeira abertura", () => {
  it("fecha as linhas de 3 colunas sem buraco", () => {
    const cells = DEFAULT_LAYOUT.filter((w) => w.enabled).reduce((n, w) => n + SIZE_GRID[w.size][0] * SIZE_GRID[w.size][1], 0);
    expect(cells % 3).toBe(0);
  });
  it("mapa de calor e notícias começam com largura toda, no fim", () => {
    const enabled = DEFAULT_LAYOUT.filter((w) => w.enabled);
    expect(enabled.slice(-2).map((w) => [w.id, w.size])).toEqual([["heatmap", "w"], ["news", "w"]]);
  });
  it("tamanho salvo que não existe mais volta ao padrão", () => {
    const [w] = mergeLayout([{ id: "news", size: "zz" as never }]);
    expect(w.size).toBe("w");
  });
});
