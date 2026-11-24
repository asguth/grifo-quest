import { useId } from "react";
import { motion } from "motion/react";
import type { LucideIcon } from "lucide-react";
import { useWidth } from "@/lib/hooks";
import { spring } from "@/lib/motion";
import { cn } from "@/lib/utils";

export type SectionTab<T extends string> = { id: T; label: string; icon: LucideIcon; badge?: number };

/** Largura que uma aba com ícone + texto precisa, em média (px). Abaixo disso, as inativas viram só ícone. */
const TAB_WITH_LABEL = 128;

/**
 * Abas de seção de uma tela (Estudo, Mundo, Config): grandes, com ícone, um destaque que desliza até
 * a aba escolhida e contador. Sem espaço para todas com texto (janela estreita), as inativas ficam só
 * com o ícone (o nome aparece ao passar o mouse): nenhuma some para fora nem cria barra de rolagem.
 * Para alternar duas opções pequenas, use `Segmented`.
 */
export function SectionTabs<T extends string>({ label, value, onChange, tabs }: { label: string; value: T; onChange: (t: T) => void; tabs: SectionTab<T>[] }) {
  // um layoutId por barra: duas barras na tela não trocam o destaque entre si
  const pill = useId();
  const [ref, width] = useWidth<HTMLDivElement>();
  const compact = width > 0 && width < tabs.length * TAB_WITH_LABEL;
  return (
    <div
      ref={ref}
      role="tablist"
      aria-label={label}
      // overflow escondido: o destaque desliza com transform e, no meio do caminho, "vazava" e fazia a barra de rolagem piscar
      className="flex gap-1 overflow-hidden rounded-2xl border border-border bg-card p-1.5 shadow-soft"
    >
      {tabs.map((t) => {
        const active = t.id === value;
        const Icon = t.icon;
        const iconOnly = compact && !active;
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={active}
            aria-label={iconOnly ? t.label : undefined}
            title={iconOnly ? t.label : undefined}
            onClick={() => onChange(t.id)}
            className={cn(
              "relative flex h-11 items-center justify-center gap-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors",
              iconOnly ? "min-w-11 flex-1 px-2" : "min-w-fit flex-1 px-4",
              active ? "text-primary-foreground" : "text-muted-foreground hover:bg-secondary hover:text-foreground",
            )}
          >
            {active && <motion.span layoutId={pill} className="absolute inset-0 rounded-xl bg-primary shadow-soft" transition={spring.snappy} />}
            <Icon className="relative size-[18px] shrink-0" />
            {!iconOnly && <span className="relative">{t.label}</span>}
            {!!t.badge && (
              <span
                className={cn(
                  "tabular relative grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[10px] font-semibold",
                  iconOnly && "absolute top-1 right-1 h-4 min-w-4 text-[9px]",
                  active ? "bg-primary-foreground text-primary" : "bg-destructive text-white",
                )}
              >
                {t.badge > 99 ? "99+" : t.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
