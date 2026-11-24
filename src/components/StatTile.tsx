import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Número em destaque (fonte pixel) com a legenda embaixo. */
export function StatTile({
  value,
  label,
  icon,
  tone = "text-primary",
  className,
  valueClass = "text-xl",
}: {
  value: ReactNode;
  label: string;
  /** Ícone pixel (`PixelFlame` etc.) à esquerda do número. */
  icon?: ReactNode;
  tone?: string;
  className?: string;
  valueClass?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center rounded-2xl border border-border bg-card p-4 text-center", className)}>
      <p className={cn("retro tabular inline-flex items-center justify-center gap-2", valueClass, tone)}>
        {icon && (
          <span aria-hidden className="inline-flex">
            {icon}
          </span>
        )}
        {value}
      </p>
      <p className="mt-1 truncate text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
