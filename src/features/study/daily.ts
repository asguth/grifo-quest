import type { StudyHome } from "@/lib/bindings";

/** Meta de questões do dia: quantas faltam e a fração feita (0–1). */
export function dailyProgress(h: Pick<StudyHome, "daily_goal" | "answered_today">) {
  return {
    left: Math.max(0, h.daily_goal - h.answered_today),
    frac: Math.min(1, h.answered_today / Math.max(1, h.daily_goal)),
  };
}
