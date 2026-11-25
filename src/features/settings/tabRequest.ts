import { emit } from "@/lib/bus";

/** Abas da Config. */
export type SettingsTab = "conta" | "integracoes" | "aparencia" | "pomodoro" | "concursos" | "ia" | "sistema";

// Fora do componente: o menu pede uma aba antes de a tela da Config (lazy) montar.
let lastTab: SettingsTab = "integracoes";

export const getSettingsTab = (): SettingsTab => lastTab;

export function setSettingsTab(t: SettingsTab) {
  lastTab = t;
}

/** Abre a Config já numa aba (o menu leva à Conta). */
export function requestSettingsTab(t: SettingsTab) {
  lastTab = t;
  emit("settingsTab", t);
}
