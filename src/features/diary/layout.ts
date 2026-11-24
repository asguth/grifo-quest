import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import type { Navigate } from "@/app/nav";
import type { Dashboard_Serialize as Dashboard } from "@/lib/bindings";
import { getPref, setPref } from "@/lib/prefs";
import { warn } from "@/lib/utils";

/** s = 1×1, m = 2×1 (largo), l = 2×2 (grande). Grade de 3 colunas. */
export type WidgetSize = "s" | "m" | "l";

export const SIZE_LABEL: Record<WidgetSize, string> = { s: "1×1", m: "2×1", l: "2×2" };

export const SPAN: Record<WidgetSize, string> = {
  s: "col-span-1",
  m: "@xl:col-span-2",
  l: "@xl:col-span-2 @xl:row-span-2",
};

export const NEXT_SIZE: Record<WidgetSize, WidgetSize> = { s: "m", m: "l", l: "s" };

export type WidgetProps = { d: Dashboard; go: Navigate };
type View = LazyExoticComponent<ComponentType<WidgetProps>>;

const view = (load: () => Promise<ComponentType<WidgetProps>>): View => lazy(() => load().then((c) => ({ default: c })));
const cards = (pick: (m: typeof import("./widgets")) => ComponentType<WidgetProps>) => view(() => import("./widgets").then(pick));
// Gráficos num chunk próprio: o Recharts (~400 KB) só carrega depois do resto da tela.
const chart = (pick: (m: typeof import("./charts")) => ComponentType<WidgetProps>) => view(() => import("./charts").then(pick));

/** `full`: sempre a largura toda da grade (mapa de calor, notícias), sem troca de tamanho. */
type Widget = { label: string; hint: string; size: WidgetSize; enabled: boolean; full?: boolean; view: View };

/**
 * Todos os widgets do Início. Um novo entra aqui (e no layout salvo, no fim, sozinho).
 * A ordem é o layout padrão da primeira abertura e fecha as linhas de 3 colunas sem buraco:
 * [Sessão 2 + Missões 1] [Acerto 2 + Prova 1] [Questões 2 + Concursos 1] [Metas + Recordes + Horas]
 * e depois os de largura total.
 */
export const WIDGETS = {
  today: { label: "Sessão de hoje", hint: "meta do dia, erros e cartões vencidos", size: "m", enabled: true, view: cards((m) => m.TodayWidget) },
  missions: { label: "Missões do dia", hint: "metas diárias com XP", size: "s", enabled: true, view: cards((m) => m.MissionsWidget) },
  accuracy: { label: "% de acerto por matéria", hint: "últimos 30 dias", size: "m", enabled: true, view: chart((m) => m.AccuracyWidget) },
  countdown: { label: "Dias até a prova", hint: "contagem regressiva da próxima prova", size: "s", enabled: true, view: cards((m) => m.CountdownWidget) },
  questions: { label: "Questões por dia", hint: "últimos 30 dias", size: "m", enabled: true, view: chart((m) => m.QuestionsWidget) },
  contests: { label: "Concursos da sua área", hint: "rastreador", size: "s", enabled: true, view: cards((m) => m.ContestsWidget) },
  weekly: { label: "Metas da semana", hint: "questões e horas contra o que você planejou", size: "s", enabled: true, view: cards((m) => m.WeeklyWidget) },
  records: { label: "Recordes", hint: "melhor dia, total do ano", size: "s", enabled: true, view: cards((m) => m.RecordsWidget) },
  hours: { label: "Estudo × trabalho", hint: "horas da semana", size: "s", enabled: true, view: chart((m) => m.HoursWidget) },
  heatmap: { label: "Mapa de calor do ano", hint: "dias com estudo", size: "m", enabled: true, full: true, view: cards((m) => m.HeatmapWidget) },
  news: { label: "Notícias de concursos", hint: "últimas dos seus feeds", size: "m", enabled: true, full: true, view: cards((m) => m.NewsWidget) },
  reviews: { label: "Reaulas da sala", hint: "revisões da sala de aula", size: "s", enabled: false, view: cards((m) => m.ReviewsWidget) },
} as const satisfies Record<string, Widget>;

/** Ocupa a linha inteira (ignora o tamanho salvo). */
export const isFull = (id: WidgetId): boolean => "full" in WIDGETS[id] && WIDGETS[id].full === true;

export type WidgetId = keyof typeof WIDGETS;
export type WidgetSlot = { id: WidgetId; enabled: boolean; size: WidgetSize };

export const DEFAULT_LAYOUT: WidgetSlot[] = (Object.keys(WIDGETS) as WidgetId[]).map((id) => ({ id, enabled: WIDGETS[id].enabled, size: WIDGETS[id].size }));

/** Layout salvo de versões antigas tinha `wide: boolean` no lugar de `size`. */
type Saved = { id: string; enabled?: boolean; size?: WidgetSize; wide?: boolean };

/** Descarta widgets que não existem mais, migra o formato antigo e põe os novos no fim. */
export function mergeLayout(saved: Saved[]): WidgetSlot[] {
  const known: WidgetSlot[] = saved
    .filter((s): s is Saved & { id: WidgetId } => s.id in WIDGETS)
    .map((s) => ({
      id: s.id,
      enabled: s.enabled ?? true,
      size: s.size ?? (s.wide ? "m" : WIDGETS[s.id].size),
    }));
  const missing = DEFAULT_LAYOUT.filter((d) => !known.some((s) => s.id === d.id));
  return [...known, ...missing];
}

export async function loadLayout(): Promise<WidgetSlot[]> {
  const raw = await getPref("home_layout");
  if (!raw) return DEFAULT_LAYOUT;
  try {
    return mergeLayout(JSON.parse(raw) as Saved[]);
  } catch (e) {
    warn("layout do Início ilegível, usando o padrão", e);
    return DEFAULT_LAYOUT;
  }
}

export async function saveLayout(layout: WidgetSlot[]) {
  await setPref("home_layout", JSON.stringify(layout));
}
