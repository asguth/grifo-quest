import { describe, expect, it } from "vitest";
import type { NewsItem } from "@/lib/bindings";
import { DEFAULT_VIEW, dayLabel, groupNews, inPeriod, parseView, sortNews, timeOf } from "./news";

const now = new Date(2026, 10, 24, 15, 0); // 24/11/2026 15h local
const at = (daysAgo: number, hour = 10) => new Date(2026, 10, 24 - daysAgo, hour).toISOString();
const item = (id: number, published_at: string | null, extra: Partial<NewsItem> = {}): NewsItem => ({
  id,
  feed: "Feed",
  title: `n${id}`,
  link: "",
  published_at,
  read: false,
  image_url: null,
  description: null,
  summary: null,
  tags: null,
  relevance: null,
  ...extra,
});

describe("news", () => {
  it("lê a visualização salva e ignora valores estranhos", () => {
    expect(parseView(null)).toEqual(DEFAULT_VIEW);
    expect(parseView("{quebrado")).toEqual(DEFAULT_VIEW);
    expect(parseView(JSON.stringify({ layout: "lista", sort: "xyz", period: "semana" }))).toEqual({ layout: "lista", sort: "recentes", period: "semana" });
  });

  it("filtra por período", () => {
    const today = item(1, at(0));
    const week = item(2, at(5));
    const old = item(3, at(40));
    const none = item(4, null);
    expect([today, week, old, none].filter((n) => inPeriod(n, "hoje", now)).map((n) => n.id)).toEqual([1]);
    expect([today, week, old, none].filter((n) => inPeriod(n, "semana", now)).map((n) => n.id)).toEqual([1, 2]);
    expect([today, week, old, none].filter((n) => inPeriod(n, "tudo", now)).map((n) => n.id)).toEqual([1, 2, 3, 4]);
  });

  it("ordena (sem data vai para o fim)", () => {
    const list = [item(1, at(3)), item(2, null), item(3, at(0), { relevance: 0.2 }), item(4, at(1), { relevance: 0.9, feed: "Agência" })];
    expect(sortNews(list, "recentes").map((n) => n.id)).toEqual([3, 4, 1, 2]);
    expect(sortNews(list, "antigas").map((n) => n.id)).toEqual([1, 4, 3, 2]);
    expect(sortNews(list, "relevantes").map((n) => n.id)).toEqual([4, 3, 1, 2]);
    expect(sortNews(list, "fonte")[0].id).toBe(4);
  });

  it("agrupa por dia na ordem dada", () => {
    expect(dayLabel(timeOf(item(1, at(0))), now)).toBe("Hoje");
    expect(dayLabel(timeOf(item(1, at(1))), now)).toBe("Ontem");
    expect(dayLabel(timeOf(item(1, at(4))), now)).toBe("Nesta semana");
    expect(dayLabel(timeOf(item(1, at(12))), now)).toBe("Neste mês");
    expect(dayLabel(0, now)).toBe("Sem data");
    const groups = groupNews(sortNews([item(1, at(0)), item(2, at(0, 8)), item(3, at(1))], "recentes"), "recentes", now);
    expect(groups.map((g) => [g.label, g.items.length])).toEqual([
      ["Hoje", 2],
      ["Ontem", 1],
    ]);
    expect(groupNews([item(1, at(0))], "relevantes", now)).toEqual([{ label: "", items: [item(1, at(0))] }]);
  });
});
