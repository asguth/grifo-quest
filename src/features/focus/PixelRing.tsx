import { motion } from "motion/react";
import { cn } from "@/lib/utils";

/** Blocos do anel: 40 = um a cada 37,5 s num pomodoro de 25 min. */
const N = 40;
const R = 44;

/**
 * Anel de progresso em blocos de pixel (cara de barra de vida de jogo): cada bloco acende quando o
 * tempo passa por ele, e o da vez pisca com brilho. O conteúdo (relógio) fica no meio.
 */
export function PixelRing({ value, tone, paused, size = 260, children }: { value: number; tone: string; paused: boolean; size?: number; children: React.ReactNode }) {
  const lit = Math.min(N, Math.floor(value * N));
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" className="absolute inset-0 size-full" aria-hidden>
        {Array.from({ length: N }, (_, i) => {
          const a = (i / N) * 2 * Math.PI - Math.PI / 2;
          const x = 50 + R * Math.cos(a);
          const y = 50 + R * Math.sin(a);
          const on = i < lit;
          const head = i === lit && !paused;
          return (
            <motion.rect
              key={i}
              x={x - 2.6}
              y={y - 1.6}
              width={5.2}
              height={3.2}
              rx={0.5}
              transform={`rotate(${(i / N) * 360} ${x} ${y})`}
              initial={false}
              animate={head ? { opacity: [0.35, 1, 0.35] } : { opacity: on ? 1 : 0.16 }}
              transition={head ? { duration: 1.2, repeat: Infinity, ease: "easeInOut" } : { duration: 0.4 }}
              style={{ fill: on || head ? tone : "var(--foreground)", filter: on ? `drop-shadow(0 0 1.2px ${tone})` : undefined }}
            />
          );
        })}
      </svg>
      <div className={cn("relative flex flex-col items-center", paused && "opacity-70")}>{children}</div>
    </div>
  );
}

/** Barra de 10 blocos (mini-timer do menu). */
export function PixelBar({ value, tone, className }: { value: number; tone: string; className?: string }) {
  const lit = Math.round(Math.min(1, Math.max(0, value)) * 10);
  return (
    <span className={cn("flex gap-[2px]", className)} aria-hidden>
      {Array.from({ length: 10 }, (_, i) => (
        <span key={i} className="h-1.5 flex-1 rounded-[1px] transition-colors duration-700" style={{ background: i < lit ? tone : "color-mix(in oklch, var(--foreground) 14%, transparent)" }} />
      ))}
    </span>
  );
}
