import { cn } from "@/lib/utils";

/** Sprite pixel art desenhado a partir de um mapa de caracteres → cores. `.` = transparente. */
export function PixelSprite(props: { map: string[]; colors: Record<string, string>; scale?: number; title?: string; className?: string }) {
  const scale = props.scale ?? 6;
  const h = props.map.length;
  const w = props.map[0]?.length ?? 0;
  return (
    <svg role="img" aria-label={props.title} viewBox={`0 0 ${w} ${h}`} width={w * scale} height={h * scale} className={cn("pixelated", props.className)}>
      {props.title && <title>{props.title}</title>}
      {props.map.flatMap((row, y) =>
        [...row].map((ch, x) => (ch === "." || !props.colors[ch] ? null : <rect key={`${x}-${y}`} x={x} y={y} width={1.02} height={1.02} fill={props.colors[ch]} />)),
      )}
    </svg>
  );
}

/** Sobrepõe `top` em `base` (caracteres diferentes de `.` vencem). */
export function overlay(base: string[], top: string[]): string[] {
  return base.map((row, y) => [...row].map((ch, x) => (top[y]?.[x] && top[y][x] !== "." ? top[y][x] : ch)).join(""));
}
