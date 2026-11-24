import { useId } from "react";
import { motion } from "motion/react";
import type { LucideIcon } from "lucide-react";
import { spring } from "@/lib/motion";
import { cn } from "@/lib/utils";

export type SectionTab<T extends string> = { id: T; label: string; icon: LucideIcon; badge?: number };

/**
 * Abas de seção de uma tela (Estudo, Mundo, Config): grandes, com ícone, um destaque que desliza até
 * a aba escolhida e contador. Para alternar duas opções pequenas, use `Segmented`.
 */
export function SectionTabs<T extends string>({ label, value, onChange, tabs }: { label: string; value: T; onChange: (t: T) => void; tabs: SectionTab<T>[] }) {
  // um layoutId por barra: duas barras na tela não trocam o destaque entre si
  const pill = useId();
  return (
    <div role="tablist" aria-label={label} className="flex gap-1 overflow-x-auto rounded-2xl border border-border bg-card p-1.5 shadow-soft">
      {tabs.map((t) => {
        const active = t.id === value;
        const Icon = t.icon;
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.id)}
            className={cn(
              "relative flex h-11 min-w-fit flex-1 items-center justify-center gap-2 rounded-xl px-4 text-sm font-medium whitespace-nowrap transition-colors",
              active ? "text-primary-foreground" : "text-muted-foreground hover:bg-secondary hover:text-foreground",
            )}
          >
            {active && <motion.span layoutId={pill} className="absolute inset-0 rounded-xl bg-primary shadow-soft" transition={spring.snappy} />}
            <Icon className="relative size-[18px] shrink-0" />
            <span className="relative">{t.label}</span>
            {!!t.badge && (
              <span
                className={cn(
                  "tabular relative grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[10px] font-semibold",
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
