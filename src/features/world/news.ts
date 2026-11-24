import type { NewsItem } from "@/lib/bindings";
import { parseUtc } from "@/lib/format";

/** Como as notícias aparecem (Mundo → Notícias). Salvo em `ui_news_view`. */
export type NewsLayout = "mosaico" | "grade" | "lista" | "manchetes";
export type NewsSort = "recentes" | "antigas" | "relevantes" | "fonte";
export type NewsPeriod = "hoje" | "semana" | "mes" | "tudo";
export type NewsView = { layout: NewsLayout; sort: NewsSort; period: NewsPeriod };

export const DEFAULT_VIEW: NewsView = { layout: "mosaico", sort: "recentes", period: "tudo" };

const LAYOUTS: NewsLayout[] = ["mosaico", "grade", "lista", "manchetes"];
const SORTS: NewsSort[] = ["recentes", "antigas", "relevantes", "fonte"];
const PERIODS: NewsPeriod[] = ["hoje", "semana", "mes", "tudo"];

/** Lê a preferência salva; campo estranho (versão antiga, JSON quebrado) volta ao padrão. */
export function parseView(raw: string | null): NewsView {
  if (!raw) return DEFAULT_VIEW;
  try {
    const v = JSON.parse(raw) as Partial<NewsView>;
    return {
      layout: LAYOUTS.includes(v.layout as NewsLayout) ? (v.layout as NewsLayout) : DEFAULT_VIEW.layout,
      sort: SORTS.includes(v.sort as NewsSort) ? (v.sort as NewsSort) : DEFAULT_VIEW.sort,
      period: PERIODS.includes(v.period as NewsPeriod) ? (v.period as NewsPeriod) : DEFAULT_VIEW.period,
    };
  } catch {
    return DEFAULT_VIEW;
  }
}

/** Momento da publicação em ms (sem data = 0, vai para o fim das recentes). */
export function timeOf(n: NewsItem): number {
  if (!n.published_at) return 0;
  const t = parseUtc(n.published_at).getTime();
  return Number.isFinite(t) ? t : 0;
}

const DAY = 86_400_000;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** "hoje" = desde a meia-noite local; semana e mês = últimos 7/30 dias. Sem data só entra em "tudo". */
export function inPeriod(n: NewsItem, period: NewsPeriod, now: Date): boolean {
  if (period === "tudo") return true;
  const t = timeOf(n);
  if (!t) return false;
  if (period === "hoje") return t >= startOfDay(now);
  return t >= now.getTime() - (period === "semana" ? 7 : 30) * DAY;
}

export function sortNews(list: NewsItem[], sort: NewsSort): NewsItem[] {
  const out = list.slice();
  const recent = (a: NewsItem, b: NewsItem) => timeOf(b) - timeOf(a);
  if (sort === "recentes") out.sort(recent);
  else if (sort === "antigas") out.sort((a, b) => (timeOf(a) || Infinity) - (timeOf(b) || Infinity));
  else if (sort === "relevantes") out.sort((a, b) => (b.relevance ?? -1) - (a.relevance ?? -1) || recent(a, b));
  else out.sort((a, b) => a.feed.localeCompare(b.feed, "pt-BR") || recent(a, b));
  return out;
}

/** Rótulo da faixa de tempo de uma notícia, para os cabeçalhos da lista. */
export function dayLabel(t: number, now: Date): string {
  if (!t) return "Sem data";
  const today = startOfDay(now);
  if (t >= today) return "Hoje";
  if (t >= today - DAY) return "Ontem";
  if (t >= today - 6 * DAY) return "Nesta semana";
  if (t >= today - 29 * DAY) return "Neste mês";
  const d = new Date(t);
  const month = d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  return month.charAt(0).toUpperCase() + month.slice(1);
}

export type NewsGroup = { label: string; items: NewsItem[] };

/**
 * Grupos na ordem em que as notícias já estão: por dia (ordens de tempo), por fonte ("fonte") ou um
 * grupo só sem título ("relevantes", em que a data não manda na ordem).
 */
export function groupNews(list: NewsItem[], sort: NewsSort, now: Date): NewsGroup[] {
  if (sort === "relevantes") return list.length ? [{ label: "", items: list }] : [];
  const key = sort === "fonte" ? (n: NewsItem) => n.feed : (n: NewsItem) => dayLabel(timeOf(n), now);
  const groups: NewsGroup[] = [];
  for (const n of list) {
    const label = key(n);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(n);
    else groups.push({ label, items: [n] });
  }
  return groups;
}
