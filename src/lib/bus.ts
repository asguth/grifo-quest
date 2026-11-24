import { useEffect, useRef } from "react";
import type { Theme } from "@/lib/theme";

/** Avisos entre partes do front da mesma janela (os do backend chegam por `events` dos bindings). */
type AppEvents = {
  /** Reabrir o assistente de primeira abertura (Config → Sistema). */
  onboarding: undefined;
  /** Rever o tutorial do menu (Config → Sistema). */
  tour: undefined;
  /** Trocar a aba do Estudo (o mini-timer do menu pede "foco"). */
  studyTab: string;
  /** Trocar a aba do Mundo (o widget da prova pede "exams"). */
  worldTab: string;
  /** Ir para uma tela de qualquer lugar (ex.: "Ver resposta" no aviso do Tira-dúvidas). */
  navigate: string;
  /** Tema aplicado (cores, fonte, movimento). */
  theme: Theme;
  /** Festa de nível novo. */
  levelup: number;
};

type Name = keyof AppEvents;

const target = new EventTarget();

export function emit<K extends Name>(name: K, ...detail: AppEvents[K] extends undefined ? [] : [AppEvents[K]]) {
  target.dispatchEvent(new CustomEvent(name, { detail: detail[0] }));
}

export function on<K extends Name>(name: K, handler: (detail: AppEvents[K]) => void): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<AppEvents[K]>).detail);
  target.addEventListener(name, listener);
  return () => target.removeEventListener(name, listener);
}

/** `on` enquanto o componente estiver montado (sempre com o handler mais recente). */
export function useAppEvent<K extends Name>(name: K, handler: (detail: AppEvents[K]) => void) {
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });
  useEffect(() => on(name, (d) => ref.current(d)), [name]);
}
