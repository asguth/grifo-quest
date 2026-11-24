import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, useReducedMotionConfig, useSpring, useTransform } from "motion/react";
import { periodOf, type Period } from "@/lib/dates";
import { useWidth } from "@/lib/hooks";
import { cn } from "@/lib/utils";

/** Céu (topo → horizonte), astro e se tem estrelas. O resto da cena puxa a cor do tema. */
const SKY: Record<Period, { top: string; horizon: string; body: string; stars: boolean; sun: boolean }> = {
  madrugada: { top: "#0b0d1f", horizon: "#272a4f", body: "#e8e4c9", stars: true, sun: false },
  amanhecer: { top: "#3b4a7a", horizon: "#f2a66b", body: "#ffd98a", stars: false, sun: true },
  dia: { top: "#5f9fd6", horizon: "#bfe0f0", body: "#fff3c4", stars: false, sun: true },
  entardecer: { top: "#4a3a6e", horizon: "#f08a5d", body: "#ffb36b", stars: false, sun: true },
  noite: { top: "#121530", horizon: "#3a3463", body: "#f1ecd2", stars: true, sun: false },
};

/** Largura de referência da arte (só para a silhueta padrão de `ridge`). */
const W = 320;
/** Mínimo para a lua/sol (a ~58 px da borda direita) e as montanhas ainda caberem. */
const MIN_W = 120;
const H = 90;
/** Folga do parallax: as camadas são 3rem mais largas que a cena. */
const BLEED = 48;

/**
 * Largura da arte para uma tela de `px` × `heightPx`: o pixel da arte tem sempre o mesmo tamanho
 * (altura / H), e a paisagem fica mais comprida em vez de ser ampliada em janela larga.
 */
export function artWidth(px: number, heightPx: number): number {
  // Sem piso de 320: em tela estreita (monitor em pé, ~900 px) a arte maior que a área era
  // recortada nas laterais e a lua, perto da borda direita, sumia.
  return Math.max(MIN_W, Math.ceil(((px + BLEED) * H) / heightPx));
}

/** Silhueta em degraus (só traços horizontais/verticais → cara de pixel). Determinística pelo `seed`. */
export function ridge(seed: number, base: number, amp: number, step: number, w = W): string {
  let d = `M0 ${H}`;
  for (let x = 0; x <= w; x += step) {
    const y = base - amp * (0.55 * Math.sin(x * 0.021 + seed) + 0.3 * Math.sin(x * 0.057 + seed * 2.1) + 0.15 * Math.sin(x * 0.13 + seed * 3.7));
    const yy = Math.round(y);
    d += ` V${yy} H${Math.min(x + step, w)}`;
  }
  return `${d} V${H} Z`;
}

function rand(i: number) {
  const s = Math.sin(i * 127.1) * 43758.5453;
  return s - Math.floor(s);
}

/** Paisagem pixel em 3 camadas com parallax no mouse. Fica atrás do conteúdo (aria-hidden). */
export default function Scenery({ className }: { className?: string }) {
  const [period, setPeriod] = useState<Period>(() => periodOf(new Date().getHours()));
  const reduce = useReducedMotionConfig();
  const px = useSpring(0, { stiffness: 40, damping: 18 });
  const [box, boxWidth] = useWidth<HTMLDivElement>();
  const [boxHeight, setBoxHeight] = useState(300);
  const w = artWidth(boxWidth || 1000, boxHeight);
  const measure = useCallback(
    (el: HTMLDivElement | null) => {
      box(el);
      if (el?.clientHeight) setBoxHeight(el.clientHeight);
    },
    [box],
  );

  useEffect(() => {
    const id = setInterval(() => setPeriod(periodOf(new Date().getHours())), 5 * 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (reduce) return;
    const onMove = (e: PointerEvent) => px.set(e.clientX / window.innerWidth - 0.5);
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, [reduce, px]);

  // Perto mexe mais: deslocamento em px por camada.
  const xs = [useTransform(px, (v) => -v * 4), useTransform(px, (v) => -v * 9), useTransform(px, (v) => -v * 16)];
  const sky = SKY[period];
  const layers = useMemo(
    () => [
      { d: ridge(1.3, 40, 20, 6, w), mix: 70 },
      { d: ridge(4.1, 52, 14, 4, w), mix: 40 },
      { d: ridge(7.7, 62, 8, 3, w), mix: 0 },
    ],
    [w],
  );
  // ~1 estrela a cada 8 px de arte: mesma densidade em qualquer largura
  const stars = useMemo(() => Array.from({ length: Math.round(w / 8) }, (_, i) => ({ x: rand(i) * w, y: rand(i + 99) * 45, d: 2 + rand(i + 7) * 4 })), [w]);

  return (
    <div
      aria-hidden
      ref={measure}
      className={cn("pointer-events-none overflow-hidden", className)}
    >
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(to bottom, ${sky.top}, ${sky.horizon})`,
          maskImage: "linear-gradient(to bottom, black 55%, transparent)",
        }}
      />
      <svg viewBox={`0 0 ${w} ${H}`} preserveAspectRatio="xMidYMax slice" className="pixelated absolute inset-0 size-full">
        {sky.stars &&
          stars.map((s, i) => (
            <rect
              key={i}
              x={Math.round(s.x)}
              y={Math.round(s.y)}
              width={1}
              height={1}
              fill="#fffbe6"
              style={{ animation: `twinkle ${s.d}s ease-in-out ${s.d / 3}s infinite` }}
            />
          ))}
        {/* Astro: disco pixelado com um halo */}
        <g transform={sky.sun ? `translate(${w - 70} 14)` : `translate(${w - 58} 12)`}>
          <circle r={9} fill={sky.body} opacity={0.12} />
          <rect x={-3} y={-5} width={6} height={10} fill={sky.body} />
          <rect x={-5} y={-3} width={10} height={6} fill={sky.body} />
          <rect x={-4} y={-4} width={8} height={8} fill={sky.body} />
          {!sky.sun && (
            <g fill={sky.horizon} opacity={0.55}>
              <rect x={-2} y={-2} width={2} height={2} />
              <rect x={2} y={1} width={1} height={1} />
              <rect x={-1} y={2} width={1} height={1} />
            </g>
          )}
        </g>
      </svg>

      {/* Nuvens (CSS puro, atravessam a tela devagar) */}
      {!sky.stars &&
        [0, 1, 2].map((i) => (
          <div
            key={i}
            className="absolute left-0 h-3 w-24 rounded-[2px] bg-white/35"
            style={{
              top: `${12 + i * 14}%`,
              animation: `drift ${90 + i * 40}s linear ${-i * 35}s infinite`,
              boxShadow: "12px -6px 0 -2px rgb(255 255 255 / 0.3), 30px 0 0 0 rgb(255 255 255 / 0.3)",
            }}
          />
        ))}

      {layers.map((l, i) => (
        <motion.svg
          key={i}
          viewBox={`0 0 ${w} ${H}`}
          preserveAspectRatio="xMidYMax slice"
          className="pixelated absolute -inset-x-6 inset-y-0 h-full w-[calc(100%+3rem)]"
          style={{ x: xs[i] }}
        >
          <path
            d={l.d}
            style={{ fill: l.mix ? `color-mix(in oklch, ${sky.horizon} ${l.mix}%, var(--background))` : "var(--background)" }}
          />
        </motion.svg>
      ))}
    </div>
  );
}
