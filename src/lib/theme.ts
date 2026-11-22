import { useEffect, useState } from "react";
import { emit, on } from "@/lib/bus";
import { getPref, setPref } from "@/lib/prefs";
import { warn } from "@/lib/utils";

/** Cores editáveis em Config → Aparência. Cada uma vira uma variável CSS (`--background` etc.). */
export const COLOR_TOKENS = {
  background: "Fundo",
  card: "Superfície",
  foreground: "Texto",
  "muted-foreground": "Texto suave",
  primary: "Destaque (âmbar)",
  accent: "Sucesso (musgo)",
  destructive: "Erro (terracota)",
  secondary: "Botões secundários",
  border: "Bordas",
} as const;

export type ColorToken = keyof typeof COLOR_TOKENS;
export type Palette = Record<ColorToken, string>;

export type Theme = {
  preset: string;
  colors: Palette;
  /** Escala da fonte de leitura, em %. */
  fontScale: number;
  /** Títulos e números em fonte pixel. */
  pixelTitles: boolean;
  /** Animações e cena de fundo. Desligado = movimento reduzido. */
  motion: boolean;
};

export const PRESETS: Record<string, { label: string; colors: Palette }> = {
  cozy: {
    label: "Cozy (escuro quente)",
    colors: {
      background: "#1b1a17",
      card: "#26241f",
      foreground: "#efe6d2",
      "muted-foreground": "#a99f8b",
      primary: "#e0a84f",
      accent: "#7a9a5b",
      destructive: "#c8644a",
      secondary: "#33302a",
      border: "#3d3a33",
    },
  },
  pergaminho: {
    label: "Pergaminho (claro)",
    colors: {
      background: "#f3ead6",
      card: "#e9dcc0",
      foreground: "#3b2f20",
      // ajustados para contraste AA no papel claro (ver theme.test.ts)
      "muted-foreground": "#6b5c46",
      primary: "#93561a",
      accent: "#5d7a3f",
      destructive: "#a8432e",
      secondary: "#dccdae",
      border: "#cbb894",
    },
  },
  floresta: {
    label: "Floresta",
    colors: {
      background: "#141c17",
      card: "#1d2a22",
      foreground: "#e4efe0",
      "muted-foreground": "#93a897",
      primary: "#d9b45a",
      accent: "#6fae6a",
      destructive: "#c96a52",
      secondary: "#25362b",
      border: "#2f4536",
    },
  },
  noite: {
    label: "Noite estrelada",
    colors: {
      background: "#15151f",
      card: "#1f1f2e",
      foreground: "#e6e4f2",
      "muted-foreground": "#9a97b5",
      primary: "#f0b85c",
      accent: "#7fb3a8",
      destructive: "#d16a6a",
      secondary: "#2a2a3d",
      border: "#34344a",
    },
  },
  arcade: {
    label: "Arcade",
    colors: {
      background: "#0f0e17",
      card: "#1b1a2b",
      foreground: "#fffffe",
      "muted-foreground": "#a7a9be",
      primary: "#ff8906",
      accent: "#2cb67d",
      destructive: "#f25f4c",
      secondary: "#2e2c47",
      border: "#3a3857",
    },
  },
};

/** Cores padrão: main.tsx aplica antes da primeira pintura (index.css não repete os valores). */
export const DEFAULT_THEME: Theme = { preset: "cozy", colors: PRESETS.cozy.colors, fontScale: 100, pixelTitles: true, motion: true };

/** Texto legível sobre um fundo: escuro em cor clara, claro em cor escura (luminância simples). */
export function contrastOn(hex: string): { fg: string; isLight: boolean } {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const isLight = 0.299 * r + 0.587 * g + 0.114 * b > 150;
  return { fg: isLight ? "#1b1a17" : "#fffaf0", isLight };
}

let current: Theme = DEFAULT_THEME;

/** Escreve o tema nas variáveis CSS (`--background` etc.) que o Tailwind e os componentes leem. */
export function applyTheme(t: Theme) {
  current = t;
  const root = document.documentElement.style;
  for (const [token, value] of Object.entries(t.colors)) root.setProperty(`--${token}`, value);
  const c = t.colors;
  root.setProperty("--popover", c.card);
  root.setProperty("--popover-foreground", c.foreground);
  root.setProperty("--card-foreground", c.foreground);
  root.setProperty("--muted", c.secondary);
  root.setProperty("--secondary-foreground", c.foreground);
  root.setProperty("--input", c.border);
  root.setProperty("--ring", c.primary);
  root.setProperty("--primary-foreground", contrastOn(c.primary).fg);
  root.setProperty("--accent-foreground", contrastOn(c.accent).fg);
  root.fontSize = `${t.fontScale}%`;
  root.colorScheme = contrastOn(c.background).isLight ? "light" : "dark";
  document.documentElement.classList.toggle("no-pixel-titles", !t.pixelTitles);
  document.documentElement.classList.toggle("reduce-motion", !t.motion);
  emit("theme", t);
}

/** Tema atual, atualizado quando Config → Aparência muda. */
export function useTheme(): Theme {
  const [t, setT] = useState(current);
  useEffect(() => {
    setT(current);
    return on("theme", setT);
  }, []);
  return t;
}

export async function loadTheme(): Promise<Theme> {
  const raw = await getPref("theme");
  if (!raw) return DEFAULT_THEME;
  let saved: Partial<Theme>;
  try {
    saved = JSON.parse(raw) as Partial<Theme>;
  } catch (e) {
    warn("tema salvo ilegível, usando o padrão", e);
    return DEFAULT_THEME;
  }
  const t: Theme = { ...DEFAULT_THEME, ...saved };
  // Tema pronto sempre usa as cores atuais do código (correções de contraste chegam sozinhas).
  return t.preset in PRESETS ? { ...t, colors: PRESETS[t.preset].colors } : t;
}

export async function saveTheme(t: Theme) {
  applyTheme(t);
  await setPref("theme", JSON.stringify(t));
}
