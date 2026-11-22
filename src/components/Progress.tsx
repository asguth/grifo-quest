import type { ReactNode } from "react";
import { AnimatePresence, motion, type Transition } from "motion/react";
import { spring } from "@/lib/motion";
import { cn } from "@/lib/utils";

const clamp01 = (x: number) => Math.min(1, Math.max(0, x || 0));

/** Barra de progresso 0–1. `className` dimensiona o trilho; `tone` (classe) ou `color` pintam o preenchimento. */
export function ProgressBar({
  value,
  className,
  tone = "bg-primary",
  color,
  transition = spring.soft,
  label,
}: {
  value: number;
  className?: string;
  tone?: string;
  color?: string;
  transition?: Transition;
  label?: string;
}) {
  const v = clamp01(value);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.round(v * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn("h-2 overflow-hidden rounded-full bg-secondary", className)}
    >
      <motion.div
        className={cn("h-full rounded-[inherit]", !color && tone)}
        style={color ? { background: color } : undefined}
        initial={{ width: 0 }}
        animate={{ width: `${v * 100}%` }}
        transition={transition}
      />
    </div>
  );
}

/** Anel de progresso 0–1 com conteúdo opcional no centro. */
export function ProgressRing({
  value,
  size,
  stroke,
  tone = "stroke-primary",
  transition = spring.soft,
  label,
  children,
}: {
  value: number;
  size: number;
  stroke: number;
  tone?: string;
  transition?: Transition;
  label?: string;
  children?: ReactNode;
}) {
  const r = size / 2 - 10;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-label={label}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-secondary" />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          className={tone}
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - clamp01(value)) }}
          transition={transition}
        />
      </svg>
      {children && <div className="absolute text-center">{children}</div>}
    </div>
  );
}

export type ProgressEntry = { text: string; progress: number | null };

/** Linha "o que está acontecendo" + barra, de uma ação longa que manda eventos de progresso. */
export function EventProgress({ entry, className }: { entry: ProgressEntry | null | undefined; className?: string }) {
  return (
    <AnimatePresence>
      {entry && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className={cn("space-y-1.5", className)}>
          <p className="truncate text-xs text-muted-foreground">{entry.text}</p>
          {entry.progress !== null && <ProgressBar value={entry.progress} className="h-1.5" />}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
