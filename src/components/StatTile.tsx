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
  icon?: string;
  tone?: string;
  className?: string;
  valueClass?: string;
}) {
  return (
    <div className={cn("rounded-2xl border border-border bg-card p-4 text-center", className)}>
      <p className={cn("retro tabular", valueClass, tone)}>
        {icon && (
          <span aria-hidden className="mr-1 text-[0.8em]">
            {icon}
          </span>
        )}
        {value}
      </p>
      <p className="mt-1 truncate text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
