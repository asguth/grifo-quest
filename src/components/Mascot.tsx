import { useSyncExternalStore } from "react";
import { useReducedMotionConfig } from "motion/react";
import { overlay, PixelSprite } from "@/components/PixelSprite";

/** Visual do Grifinho: comum, de boné (nível 5) ou de coroa (nível 10). */
export type MascotLook = "base" | "cap" | "crown";

/** Nível em que cada visual é desbloqueado e a frase da festa de nível. */
export const UNLOCKS: Record<Exclude<MascotLook, "base">, { level: number; text: string }> = {
  cap: { level: 5, text: "Ganhou o boné de estudante!" },
  crown: { level: 10, text: "Coroa desbloqueada. Respeito." },
};

/** Texto guardado (perfil da comunidade) → visual conhecido; o resto vira o Grifinho padrão. */
export function lookOf(s: string): MascotLook {
  return s === "cap" || s === "crown" ? s : "base";
}

export function tierOf(level: number): MascotLook {
  return level >= UNLOCKS.crown.level ? "crown" : level >= UNLOCKS.cap.level ? "cap" : "base";
}

/** Cores fixas do sprite (o corpo segue o tema). Também usadas no confete do nível novo. */
export const MASCOT_PALETTE = { outline: "#2a2118", wing: "#6b4f33", belly: "#efe0bd", beak: "#e8a23a", cap: "#2d2d3a", tassel: "#e0a84f", crown: "#f2c94c" };

const BODY: Record<MascotLook, string> = { base: "#9c7a52", cap: "var(--primary)", crown: "var(--accent)" };

const MASCOT = [
  "....oo....oo....",
  "...obbo..obbo...",
  "...obbboobbbo...",
  "..obbbbbbbbbbo..",
  ".obbeeebbeeebbo.",
  ".obbepebbepebbo.",
  ".obbeeebbeeebbo.",
  ".obbbbbkkbbbbbo.",
  ".owbbbbkkbbbbwo.",
  ".owwbllllllbwwo.",
  ".owwbllllllbwwo.",
  "..owbllllllbwo..",
  "..obbllllllbbo..",
  "...obbbbbbbbo...",
  "....ofo....ofo..",
  "...fff....fff...",
];

const MAPS: Record<MascotLook, string[]> = {
  base: MASCOT,
  cap: overlay(MASCOT, ["..hhhhhhhhhhhh..", "....hhhhhhhh.t..", "..............t."]),
  crown: overlay(MASCOT, ["...c..c..c..c...", "...cccccccccc..."]),
};

/** Um relógio de piscada para todos os mascotes da tela: pisca a cada 2,5–6 s enquanto houver algum. */
const blink = (() => {
  let closed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const subs = new Set<() => void>();
  const set = (v: boolean) => {
    closed = v;
    subs.forEach((s) => s());
  };
  const loop = () => {
    timer = setTimeout(() => {
      set(true);
      timer = setTimeout(() => (set(false), loop()), 130);
    }, 2500 + Math.random() * 3500);
  };
  return {
    subscribe(s: () => void) {
      subs.add(s);
      if (subs.size === 1) loop();
      return () => {
        subs.delete(s);
        if (subs.size === 0) {
          clearTimeout(timer);
          closed = false;
        }
      };
    },
    get: () => closed,
  };
})();

const never = () => () => {};

/** Grifinho mascote. Pisca como bicho vivo (parado se o movimento estiver desligado). */
export function Mascot({ look = "base", scale = 6, title = "Grifinho" }: { look?: MascotLook; scale?: number; title?: string }) {
  const reduce = useReducedMotionConfig();
  const closed = useSyncExternalStore(reduce ? never : blink.subscribe, () => !reduce && blink.get());
  const body = BODY[look];
  const p = MASCOT_PALETTE;
  return (
    <PixelSprite
      map={MAPS[look]}
      scale={scale}
      title={title}
      colors={{
        o: p.outline,
        b: body,
        w: p.wing,
        l: p.belly,
        // olho fechado: branco vira pena e a pupila vira o risco da pálpebra
        e: closed ? body : "#ffffff",
        p: closed ? p.outline : "#1b1a17",
        k: p.beak,
        f: p.beak,
        h: p.cap,
        t: p.tassel,
        c: p.crown,
      }}
    />
  );
}
