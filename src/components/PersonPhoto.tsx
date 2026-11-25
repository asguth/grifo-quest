import { initials, toneOf } from "@/lib/image";
import { cn } from "@/lib/utils";

/** Foto da pessoa; sem foto, as iniciais num círculo com uma cor estável dela. */
export function PersonPhoto({ p, size = 40, className }: { p: { id: string; display_name: string; photo_url: string | null }; size?: number; className?: string }) {
  const style = { width: size, height: size };
  if (p.photo_url) {
    return <img src={p.photo_url} alt="" style={style} className={cn("shrink-0 rounded-full bg-secondary object-cover", className)} loading="lazy" />;
  }
  const hue = toneOf(p.id);
  return (
    <span
      aria-hidden
      style={{ ...style, fontSize: Math.max(11, size * 0.38), background: `oklch(0.72 0.11 ${hue})`, color: `oklch(0.25 0.06 ${hue})` }}
      className={cn("grid shrink-0 place-items-center rounded-full font-semibold select-none", className)}
    >
      {initials(p.display_name)}
    </span>
  );
}
