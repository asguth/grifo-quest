import { emit } from "@/lib/bus";

/** Abas do Mundo. */
export type WorldTab = "news" | "contests" | "exams";

// Fora do componente: o Início pede uma aba antes de a tela do Mundo (lazy) montar.
let lastTab: WorldTab = "news";

export const getWorldTab = (): WorldTab => lastTab;

export function setWorldTab(t: WorldTab) {
  lastTab = t;
}

/** Abre o Mundo já numa aba ("gerenciar" do widget da prova vai direto para Minhas provas). */
export function requestWorldTab(t: WorldTab) {
  lastTab = t;
  emit("worldTab", t);
}
