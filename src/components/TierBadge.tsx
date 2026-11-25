import { Crown, Hammer, Shield, type LucideIcon } from "lucide-react";
import { tierOf, type TierId } from "@/lib/tiers";
import { cn } from "@/lib/utils";

const ICON: Record<TierId, LucideIcon> = { escudeiro: Shield, forjador: Hammer, ancestral: Crown };

/** Selo do plano ao lado do nome. `compact` = só o ícone (listas e publicações). */
export function TierBadge({ plan, compact, className }: { plan: string | null | undefined; compact?: boolean; className?: string }) {
  const tier = tierOf(plan);
  if (!tier) return null;
  const Icon = ICON[tier.id];
  return (
    <span
      title={tier.name}
      style={{ background: tier.tone.bg, color: tier.tone.fg, boxShadow: `inset 0 0 0 1px ${tier.tone.ring}` }}
      className={cn("inline-flex shrink-0 items-center gap-1 rounded-full align-middle font-medium", compact ? "size-5 justify-center" : "px-2.5 py-0.5 text-xs", className)}
    >
      <Icon className={compact ? "size-3" : "size-3.5"} />
      {!compact && tier.name}
    </span>
  );
}
