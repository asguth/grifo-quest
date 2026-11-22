import type { MotionProps, Transition, Variants } from "motion/react";

/**
 * Tema de movimento único do app. Regras (inspiradas no claude-remotion-skill, MIT):
 * - nunca linear: spring ou curva com saída suave;
 * - entradas animam 2–3 propriedades juntas (opacidade + y + escala);
 * - listas entram em stagger curto; saídas são mais rápidas que entradas;
 * - o que fica parado muito tempo ganha uma "respiração" sutil, nunca um loop chamativo.
 */
export const ease = {
  out: [0.22, 1, 0.36, 1] as const,
  inOut: [0.65, 0, 0.35, 1] as const,
};

export const spring = {
  /** Entradas de card/painel. */
  soft: { type: "spring", stiffness: 260, damping: 26 } satisfies Transition,
  /** Botões, chips, toggles. */
  snappy: { type: "spring", stiffness: 520, damping: 32 } satisfies Transition,
  /** Destaques que "pulam" (XP, badge). */
  bouncy: { type: "spring", stiffness: 420, damping: 14 } satisfies Transition,
  /** Barra grande que enche devagar (XP do nível). */
  slow: { type: "spring", stiffness: 60, damping: 18 } satisfies Transition,
};

/** Saída: ~metade do tempo da entrada. */
const exitFast: Transition = { duration: 0.14, ease: ease.inOut };

/** Container com filhos em stagger. Use com `itemIn` nos filhos. */
export const listIn: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05, delayChildren: 0.04 } },
};

export const itemIn: Variants = {
  hidden: { opacity: 0, y: 12, scale: 0.97 },
  show: { opacity: 1, y: 0, scale: 1, transition: spring.soft },
  exit: { opacity: 0, y: -6, transition: exitFast },
};

/** Respiração de quem está parado (mascote, ícone de espera). */
export const breathe: Pick<MotionProps, "animate" | "transition"> = {
  animate: { y: [0, -3, 0], scale: [1, 1.015, 1] },
  transition: { duration: 3.2, repeat: Infinity, ease: "easeInOut" },
};
