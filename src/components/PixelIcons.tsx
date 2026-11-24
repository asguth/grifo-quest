import { PixelSprite } from "@/components/PixelSprite";
import { MASCOT_PALETTE } from "@/components/Mascot";

/**
 * Ícones em pixel art no mesmo traço do Grifinho (contorno marrom-escuro, 10×10/11 px), no lugar
 * dos emojis. `off` apaga as cores (sequência zerada, escudo já usado).
 */
type IconProps = { off?: boolean; scale?: number; title?: string; className?: string };

const O = MASCOT_PALETTE.outline;
const GREY = { a: "#5d5a55", b: "#7a7670", c: "#9b968e", d: "#b9b3aa" };

const FLAME = [
  "....oo....",
  "...orro...",
  "...orro.o.",
  "..orrrooro",
  "..orryrrro",
  ".orryyrrro",
  ".orryyyrro",
  ".oryywyyro",
  ".oryywwyro",
  "..oyywwyo.",
  "...oooo...",
];

const SHIELD = [
  ".oooooooo.",
  "oSSSSsssso",
  "oSbbbbbbso",
  "oSbbwbbbso",
  "oSbwwwbbso",
  "oSbbwbbbso",
  ".oSbbbbso.",
  ".oSbbbbso.",
  "..oSbbso..",
  "...oSso...",
  "....oo....",
];

const SWORD = [
  "........oo",
  ".......owo",
  "......owso",
  ".....owso.",
  "..o.owso..",
  "..ooowo...",
  "...ogo....",
  "..ogoo....",
  ".ogo.oo...",
  ".oo.......",
];

const CALENDAR = [
  "..o....o..",
  "oooooooooo",
  "orrrrrrrro",
  "oooooooooo",
  "owwwwwwwwo",
  "owkwwkwwko",
  "owwwwwwwwo",
  "owkwwkwrwo",
  "owwwwwwwwo",
  "oooooooooo",
];

function Icon({ map, colors, off, scale = 2, title, className }: IconProps & { map: string[]; colors: Record<string, string> }) {
  return <PixelSprite map={map} colors={off ? { ...offColors(colors), o: O } : { ...colors, o: O }} scale={scale} title={title} className={className} />;
}

/** Mesma figura em tons de cinza, mantendo o contraste entre as partes. */
function offColors(colors: Record<string, string>): Record<string, string> {
  const greys = Object.values(GREY);
  return Object.fromEntries(Object.keys(colors).map((k, i) => [k, greys[i % greys.length]]));
}

export const PixelFlame = (p: IconProps) => <Icon map={FLAME} colors={{ r: "#e8572a", y: "#f2a93b", w: "#fde68a" }} {...p} />;
export const PixelShield = (p: IconProps) => <Icon map={SHIELD} colors={{ S: "#e3e6ea", s: "#8f98a3", b: "#3b6fb6", w: MASCOT_PALETTE.crown }} {...p} />;
export const PixelSword = (p: IconProps) => <Icon map={SWORD} colors={{ w: "#eef1f4", s: "#9aa4ae", g: "#c8913a" }} {...p} />;
export const PixelCalendar = (p: IconProps) => <Icon map={CALENDAR} colors={{ r: "#d9573b", w: "#f3ead6", k: "#6b5c46" }} {...p} />;

const BOOK = [
  ".ooo..ooo.",
  "opppoopppo",
  "opkkpokkpo",
  "opppoopppo",
  "opkkpokkpo",
  "opppoopppo",
  "opkkpokkpo",
  "opppoopppo",
  "oooooooooo",
  ".bbbbbbbb.",
];

const STAR = [
  "....oo....",
  "...oyyo...",
  "...oyyo...",
  "oooowyoooo",
  "oyyywwyyyo",
  ".oyywwyyo.",
  "..oyyyyo..",
  ".oyyooyyo.",
  ".oyo..oyo.",
  ".oo....oo.",
];

export const PixelBook = (p: IconProps) => <Icon map={BOOK} colors={{ p: "#f3ead6", k: "#9c8a6c", b: "#7a4f2e" }} {...p} />;
export const PixelStar = (p: IconProps) => <Icon map={STAR} colors={{ y: MASCOT_PALETTE.crown, w: "#fff6c9" }} {...p} />;
