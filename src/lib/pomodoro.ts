import { useEffect, useState } from "react";
import { getPref, setPref } from "@/lib/prefs";
import { warn } from "@/lib/utils";

/** Como o relógio do Foco aparece. */
export type PomodoroLayout = "pixel" | "anel" | "digital" | "minimo";

/** Preferências de tela e som do pomodoro (as de tempo ficam no backend, `PomodoroConfig`). */
export type PomodoroView = {
  layout: PomodoroLayout;
  /** Som ao terminar cada fase. */
  endSound: boolean;
  /** Tique-taque baixinho durante o foco. */
  tick: boolean;
  /** Grifinho estudando ao lado do relógio. */
  mascot: boolean;
  /** Bolinhas do ciclo até a pausa longa. */
  cycleDots: boolean;
  /** Tempo no título da janela (aparece na barra de tarefas). */
  titleClock: boolean;
  /** Meta de pomodoros por dia (mostrada no Foco). */
  dailyGoal: number;
};

export const DEFAULT_VIEW: PomodoroView = { layout: "pixel", endSound: true, tick: false, mascot: true, cycleDots: true, titleClock: true, dailyGoal: 4 };

export const LAYOUTS: { id: PomodoroLayout; label: string; hint: string }[] = [
  { id: "pixel", label: "Pixel", hint: "Anel de blocos, cara de barra de vida" },
  { id: "anel", label: "Anel suave", hint: "Círculo liso que enche aos poucos" },
  { id: "digital", label: "Digital", hint: "Números enormes e barra embaixo" },
  { id: "minimo", label: "Mínimo", hint: "Só o tempo, sem distração" },
];

/** Combinações prontas de tempo (min). */
export const PRESETS = [
  { id: "classico", label: "Clássico", hint: "25 · 5 · 15 a cada 4", focus: 25, short: 5, long: 15, every: 4 },
  { id: "curto", label: "Arranque", hint: "15 · 3 · 10 a cada 4", focus: 15, short: 3, long: 10, every: 4 },
  { id: "longo", label: "Concentrado", hint: "50 · 10 · 30 a cada 3", focus: 50, short: 10, long: 30, every: 3 },
  { id: "ultradiano", label: "Ultradiano", hint: "90 · 20 · sem longa", focus: 90, short: 20, long: 30, every: 0 },
] as const;

const listeners = new Set<(v: PomodoroView) => void>();
let cached: PomodoroView | null = null;

async function load(): Promise<PomodoroView> {
  if (cached) return cached;
  const raw = await getPref("pomodoro_view");
  try {
    cached = { ...DEFAULT_VIEW, ...(raw ? (JSON.parse(raw) as Partial<PomodoroView>) : {}) };
  } catch {
    cached = DEFAULT_VIEW;
  }
  return cached;
}

/** Preferências de tela do pomodoro, sincronizadas entre a Config e o Foco. */
export function usePomodoroView(): [PomodoroView, (patch: Partial<PomodoroView>) => void] {
  const [v, setV] = useState<PomodoroView>(cached ?? DEFAULT_VIEW);
  useEffect(() => {
    void load().then(setV);
    listeners.add(setV);
    return () => {
      listeners.delete(setV);
    };
  }, []);
  const update = (patch: Partial<PomodoroView>) => {
    const next = { ...(cached ?? DEFAULT_VIEW), ...patch };
    cached = next;
    listeners.forEach((l) => l(next));
    setPref("pomodoro_view", JSON.stringify(next)).catch((e) => warn("salvar o pomodoro", e));
  };
  return [v, update];
}
