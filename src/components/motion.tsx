import { useEffect, type CSSProperties, type ReactNode } from "react";
import { animate, motion, MotionConfig, useMotionValue, useTransform } from "motion/react";
import { ease } from "@/lib/motion";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

/** Liga/desliga as animações de toda a janela conforme Config → Aparência (só a chave do app decide; ver index.css). */
export function MotionRoot({ children }: { children: ReactNode }) {
  const { motion: on } = useTheme();
  return <MotionConfig reducedMotion={on ? "never" : "always"}>{children}</MotionConfig>;
}

/** Número que conta até o valor (sobe rápido e assenta). */
export function Count({ to, suffix = "" }: { to: number; suffix?: string }) {
  const v = useMotionValue(0);
  const text = useTransform(v, (x) => `${Math.round(x)}${suffix}`);
  useEffect(() => {
    const c = animate(v, to, { duration: 1.1, ease: ease.out });
    return () => c.stop();
  }, [to, v]);
  return <motion.span>{text}</motion.span>;
}

/** Bloco cinza com brilho, no lugar de "Carregando...". */
export function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return <div aria-hidden className={cn("skeleton rounded-md", className)} style={style} />;
}

/**
 * "+15 XP" que sobe e some. Coloque dentro de um pai `relative`; troque a `key` para disparar de novo.
 * `className` posiciona e dimensiona (padrão: canto de cima à direita, letra pequena).
 */
export function XpBurst({ amount, className = "-top-2 right-0 text-xs" }: { amount: number; className?: string }) {
  return (
    <motion.span
      aria-live="polite"
      className={cn("retro tabular pointer-events-none absolute text-xp", className)}
      initial={{ opacity: 0, y: 6, scale: 0.8 }}
      animate={{ opacity: [0, 1, 1, 0], y: -28, scale: 1 }}
      transition={{ duration: 1.4, ease: "easeOut", times: [0, 0.15, 0.7, 1] }}
    >
      +{amount} XP
    </motion.span>
  );
}
