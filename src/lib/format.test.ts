import { describe, expect, it } from "vitest";
import { parseUtc, pct, plural, shortDate } from "./format";

describe("parseUtc", () => {
  it("lê o datetime do SQLite (sem fuso) como UTC", () => {
    expect(parseUtc("2026-03-12 14:05:00").toISOString()).toBe("2026-03-12T14:05:00.000Z");
  });

  it("respeita o fuso quando ele vem no texto", () => {
    expect(parseUtc("2026-03-12T14:05:00Z").toISOString()).toBe("2026-03-12T14:05:00.000Z");
    expect(parseUtc("2026-03-12T11:05:00-03:00").toISOString()).toBe("2026-03-12T14:05:00.000Z");
  });

  it("aceita só a data", () => {
    expect(parseUtc("2026-03-12").toISOString()).toBe("2026-03-12T00:00:00.000Z");
  });
});

describe("format", () => {
  it("pct arredonda e mostra traço sem dados", () => {
    expect([pct(0.736), pct(0), pct(null)]).toEqual(["74%", "0%", "—"]);
  });

  it("plural só usa o singular para 1", () => {
    expect([plural(0, "dia", "dias"), plural(1, "dia", "dias"), plural(2, "dia", "dias")]).toEqual(["0 dias", "1 dia", "2 dias"]);
  });

  it("shortDate corta dia/mês de data ou datetime", () => {
    expect([shortDate("2026-03-12"), shortDate("2026-03-12 14:05:00"), shortDate(null)]).toEqual(["12/03", "12/03", ""]);
  });
});

describe("fold", () => {
  it("busca sem acento nem caixa", async () => {
    const { fold } = await import("./format");
    expect(fold("Proteção de DADOS")).toBe("protecao de dados");
  });
});
