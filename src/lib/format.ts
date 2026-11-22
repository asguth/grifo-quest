/** "12/03/2026" de um "2026-03-12…". Devolve o texto original se não for data. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return d && m && y ? `${d}/${m}/${y}` : iso;
}

/** "12/03" de um "2026-03-12…". */
export function shortDate(iso: string | null | undefined): string {
  return formatDate(iso).slice(0, 5);
}

/** Datas do SQLite (`datetime('now')`, sem fuso) e do RSS vêm em UTC. */
export function parseUtc(s: string): Date {
  const t = s.trim().replace(" ", "T");
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return new Date(`${t}T00:00:00Z`);
  return new Date(/(Z|[+-]\d{2}:?\d{2})$/i.test(t) ? t : `${t}Z`);
}

/** "há 3 h", "há 2 dias"; depois de uma semana, a data. */
export function ago(iso: string | null | undefined): string {
  if (!iso) return "";
  const min = (Date.now() - parseUtc(iso).getTime()) / 60000;
  if (!Number.isFinite(min)) return formatDate(iso);
  if (min < 60) return `há ${Math.max(1, Math.round(min))} min`;
  if (min < 1440) return `há ${Math.round(min / 60)} h`;
  if (min < 10080) return `há ${plural(Math.round(min / 1440), "dia", "dias")}`;
  return formatDate(iso);
}

/** 0–1 → "73%"; `null` (sem dados) → "—". */
export function pct(x: number | null | undefined): string {
  return x === null || x === undefined ? "—" : `${Math.round(x * 100)}%`;
}

/** Minutos → "1h05" ou "45 min". */
export function duration(min: number): string {
  return min >= 60 ? `${Math.floor(min / 60)}h${String(Math.round(min % 60)).padStart(2, "0")}` : `${Math.round(min)} min`;
}

/** Horas com até uma casa, à brasileira: 2 → "2", 1.5 → "1,5". */
export function hours(h: number): string {
  return h.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

/** "1 questão" / "3 questões". */
export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Faixas de acerto usadas em todo o app: abaixo de 60% ruim, até 80% médio, daí para cima bom. */
type AccLevel = "bad" | "ok" | "good";

function accLevel(acc: number): AccLevel {
  return acc < 0.6 ? "bad" : acc < 0.8 ? "ok" : "good";
}

const ACC_TEXT: Record<AccLevel, string> = { bad: "text-destructive", ok: "text-primary", good: "text-success" };
const ACC_BG: Record<AccLevel, string> = { bad: "bg-destructive/80", ok: "bg-primary", good: "bg-success" };

/** Cor do texto de um % de acerto (0–1). */
export function accTone(acc: number | null | undefined): string {
  return acc === null || acc === undefined ? "text-muted-foreground" : ACC_TEXT[accLevel(acc)];
}

/** Cor de barra de um % de acerto (0–1). */
export function accBg(acc: number): string {
  return ACC_BG[accLevel(acc)];
}

/** Cor estável por fonte de notícia (capa enquanto a notícia não tem imagem). */
export function feedColor(name: string): string {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${h} 45% 38%)`;
}
