import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { warn } from "@/lib/utils";

type Unlisten = () => void;
type Subscribe<T> = (cb: (e: { payload: T }) => void) => Promise<Unlisten>;

function useLatest<T>(value: T) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  });
  return ref;
}

/** Assina um evento do Tauri enquanto montado; desassina mesmo se o `listen` ainda não tiver resolvido. */
function useSubscription<T>(subscribe: Subscribe<T>, handler: (payload: T) => void, key: unknown) {
  const latest = useLatest(handler);
  useEffect(() => {
    let stop: Unlisten | undefined;
    let gone = false;
    subscribe((e) => latest.current(e.payload)).then(
      (f) => (gone ? f() : (stop = f)),
      (e) => warn("assinar evento", e),
    );
    return () => {
      gone = true;
      stop?.();
    };
    // `subscribe` muda de identidade a cada render; `key` identifica a fonte.
  }, [key]);
}

/** Evento do backend (`events.x` dos bindings). */
export function useTauriEvent<T>(event: { listen: Subscribe<T> }, handler: (payload: T) => void) {
  useSubscription(event.listen, handler, event);
}

/** Janela ganhou/perdeu o foco (as janelas compactas recarregam ao reaparecer). */
export function useWindowFocus(handler: (focused: boolean) => void) {
  useSubscription<boolean>((cb) => getCurrentWindow().onFocusChanged(cb), handler, "focus");
}

/** O foco está num campo de texto: atalhos de uma tecla ficam quietos. */
function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || target.matches("input, textarea, select"));
}

/**
 * Atalho de teclado da tela: ignora quando se digita num campo e quando há Ctrl/Alt/Meta
 * (esses são do sistema). `keyup` serve para "segurar para falar".
 */
export function useKey(handler: (e: KeyboardEvent) => void, type: "keydown" | "keyup" = "keydown") {
  const latest = useLatest(handler);
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.ctrlKey || e.altKey || e.metaKey) return;
      latest.current(e);
    };
    window.addEventListener(type, listener);
    return () => window.removeEventListener(type, listener);
  }, [type, latest]);
}

let digitClaims = 0;

/**
 * As teclas 1–9 trocam de tela (menu lateral). Uma tela que usa números para outra coisa
 * (notas dos flashcards) as reserva enquanto estiver montada.
 */
export function useClaimDigits() {
  useEffect(() => {
    digitClaims++;
    return () => {
      digitClaims--;
    };
  }, []);
}

export function digitsClaimed(): boolean {
  return digitClaims > 0;
}

/** Largura do elemento (ResizeObserver). A janela tem tamanho livre: telas decidem colunas pela própria largura. */
export function useWidth<T extends HTMLElement>(): [(el: T | null) => void, number] {
  const [width, setWidth] = useState(0);
  const observer = useRef<ResizeObserver | null>(null);
  const ref = useCallback((el: T | null) => {
    observer.current?.disconnect();
    if (!el) return;
    setWidth(el.clientWidth);
    observer.current = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.current.observe(el);
  }, []);
  useEffect(() => () => observer.current?.disconnect(), []);
  return [ref, width];
}
