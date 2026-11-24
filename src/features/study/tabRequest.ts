import { emit } from "@/lib/bus";
import type { Tab } from "./shared";

// Fora do componente de propósito: sair do Estudo e voltar reabre a mesma aba (só nesta sessão do
// app). Fica num módulo leve para o menu pedir uma aba sem carregar a tela inteira do Estudo.
let lastTab: Tab = "hoje";

export const getStudyTab = (): Tab => lastTab;

export function setStudyTab(t: Tab) {
  lastTab = t;
}

/** Abre o Estudo já numa aba (o mini-timer do menu leva direto ao Foco). */
export function requestStudyTab(t: Tab) {
  lastTab = t;
  emit("studyTab", t);
}
