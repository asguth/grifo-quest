import { useEffect, useState } from "react";
import { commands, events, type TimerView_Serialize as TimerView } from "@/lib/bindings";
import { useTauriEvent } from "@/lib/hooks";
import { warn } from "@/lib/utils";

export type { TimerView };

/** Estado do timer (que vive no Rust): lê uma vez e depois segue o evento de 1 s. */
export function useTimer(): [TimerView, (t: TimerView) => void] {
  const [t, setT] = useState<TimerView>({ mode: "idle" });
  useEffect(() => void commands.timerStatus().then(setT, (e) => warn("ler o timer", e)), []);
  useTauriEvent(events.timerTick, setT);
  return [t, setT];
}

/** `mm:ss`, ou `h:mm:ss` a partir de uma hora. */
export function clock(secs: number): string {
  const s = Math.max(0, Math.floor(secs));
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function timerLabel(t: TimerView): string {
  if (t.mode === "idle") return "";
  if (t.mode === "pomodoro") return t.phase === "focus" ? "Foco" : "Pausa";
  return t.kind === "estudo" ? "Estudo" : "Trabalho";
}

export function timerSeconds(t: TimerView): number {
  return t.mode === "pomodoro" ? t.remaining : t.mode === "stopwatch" ? t.elapsed : 0;
}

/** Quanto do anel acendeu: o pomodoro enche no foco e na pausa; o cronômetro dá uma volta por hora. */
export function timerFraction(t: TimerView): number {
  if (t.mode === "pomodoro") return 1 - t.remaining / Math.max(1, t.total);
  if (t.mode === "stopwatch") return (t.elapsed % 3600) / 3600;
  return 0;
}
