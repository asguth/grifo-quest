import { describe, expect, it } from "vitest";
import { heatGrid, WEEKS } from "./heatmap";

describe("heatGrid", () => {
  const today = new Date(2026, 10, 24); // terça, 24/11/2026
  const g = heatGrid(today);

  it("53 colunas de 7 dias, domingo no topo, terminando hoje", () => {
    expect(g.weeks).toHaveLength(WEEKS);
    expect(g.weeks.every((w) => w.length === 7)).toBe(true);
    expect(g.weeks[0][0]?.getDay()).toBe(0);
    const last = g.weeks[WEEKS - 1];
    expect(last[2]?.toDateString()).toBe(today.toDateString());
    expect(last.slice(3)).toEqual([null, null, null, null]); // quarta a sábado ainda não chegaram
  });

  it("um rótulo por mês, em ordem, na coluna em que o mês começa", () => {
    const labels = g.months.map((m) => m.label);
    expect(labels.slice(-3)).toEqual(["set", "out", "nov"]);
    expect(new Set(labels.slice(1)).size).toBe(labels.length - 1);
    const nov = g.months.find((m) => m.label === "nov");
    expect(g.weeks[nov!.col].some((d) => d?.getMonth() === 10 && d.getDate() === 1)).toBe(true);
    // rótulos nunca se encostam
    for (let i = 1; i < g.months.length; i++) expect(g.months[i].col - g.months[i - 1].col).toBeGreaterThanOrEqual(3);
  });
});
