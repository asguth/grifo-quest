import { useEffect, useState } from "react";
import { emit, on } from "@/lib/bus";
import { getPref, setPref } from "@/lib/prefs";
import { warn } from "@/lib/utils";

/** Cores editáveis em Configurações → Aparência. Cada uma vira uma variável CSS (`--background` etc.). */
export const COLOR_TOKENS = {
  background: "Fundo",
  card: "Superfície",
  foreground: "Texto",
  "muted-foreground": "Texto suave",
  primary: "Destaque",
  accent: "Sucesso",
  destructive: "Erro",
  secondary: "Botões secundários",
  border: "Bordas",
} as const;

export type ColorToken = keyof typeof COLOR_TOKENS;
export type Palette = Record<ColorToken, string>;

/** Fontes de leitura: a Geist vem com o app; as outras são do Windows (nada para baixar). */
export const FONTS = {
  geist: { label: "Geist (padrão)", stack: "'Geist Variable', sans-serif" },
  segoe: { label: "Segoe UI (do Windows)", stack: "'Segoe UI', system-ui, sans-serif" },
  verdana: { label: "Verdana (letras largas, boa para leitura longa)", stack: "Verdana, Geneva, sans-serif" },
  georgia: { label: "Georgia (serifada, cara de livro)", stack: "Georgia, 'Times New Roman', serif" },
  consolas: { label: "Consolas (monoespaçada)", stack: "Consolas, 'Cascadia Mono', monospace" },
} as const;

export type FontId = keyof typeof FONTS;

export type Theme = {
  preset: string;
  colors: Palette;
  /** Fonte do corpo (títulos pixel continuam na Press Start). */
  font: FontId;
  /** Escala da fonte de leitura, em %. */
  fontScale: number;
  /** Títulos e números em fonte pixel. */
  pixelTitles: boolean;
  /** Animações e cena de fundo. Desligado = movimento reduzido. */
  motion: boolean;
};

/**
 * Temas prontos. Estudo de cores (gerados em OKLCH e convertidos para hex):
 * - neutros (fundo, cartão, secundário, borda) têm o mesmo matiz com croma baixo (0,005–0,04), em
 *   degraus fixos de luminosidade: fundo L 0,18 → cartão +0,045 → secundário +0,09 → borda +0,12.
 *   Assim o cartão sempre se destaca do fundo (antes alguns ficavam quase iguais);
 * - nos claros o cartão é MAIS claro que o fundo (papel sobre a mesa), como nos apps atuais;
 * - destaque, sucesso e erro ficam a ≥ 60° de matiz um do outro (âmbar ≠ terracota ≠ verde) e com
 *   luminosidade parecida, para nenhum "gritar" mais que o outro;
 * - todos passam AA (≥ 4,5:1) nos pares de texto: ver theme.test.ts.
 */
export const PRESETS: Record<string, { label: string; colors: Palette }> = {
  // Escuro quente: neutros puxados para o âmbar (h 70), âmbar de destaque e sálvia de sucesso.
  cozy: {
    label: "Cozy · lareira",
    colors: {
      background: "#15110c",
      card: "#201b15",
      foreground: "#f2eae0",
      "muted-foreground": "#b5a99b",
      primary: "#f3ae51",
      accent: "#90be76",
      destructive: "#e6715b",
      secondary: "#2b251f",
      border: "#332d25",
    },
  },
  // Claro de papel: fundo creme, cartões quase brancos (sobem em vez de afundar), tinta sépia.
  pergaminho: {
    label: "Pergaminho · claro",
    colors: {
      background: "#fef2df",
      card: "#fffcf5",
      foreground: "#322714",
      "muted-foreground": "#685c47",
      primary: "#9c5313",
      accent: "#427138",
      destructive: "#b33830",
      secondary: "#f1e3cc",
      border: "#e1d2ba",
    },
  },
  // Verde profundo com ouro: neutros h 160, sucesso verde-folha separado do fundo pela luminosidade.
  floresta: {
    label: "Floresta · musgo",
    colors: {
      background: "#09150e",
      card: "#111f18",
      foreground: "#dcf1e5",
      "muted-foreground": "#94b4a1",
      primary: "#e6c45a",
      accent: "#73cb87",
      destructive: "#e4785d",
      secondary: "#1b2b22",
      border: "#213229",
    },
  },
  // Índigo frio com ouro e turquesa: o par quente/frio dá contraste sem gritar. Combina com a cena noturna.
  noite: {
    label: "Noite estrelada",
    colors: {
      background: "#10101e",
      card: "#191a2a",
      foreground: "#e7e9ff",
      "muted-foreground": "#a5a7ce",
      primary: "#f2c36a",
      accent: "#62cfce",
      destructive: "#e97078",
      secondary: "#242437",
      border: "#2b2c40",
    },
  },
  // Neon de fliperama: roxo quase preto, rosa de destaque, ciano de sucesso.
  arcade: {
    label: "Neon · fliperama",
    colors: {
      background: "#10091c",
      card: "#1a1228",
      foreground: "#f0e4ff",
      "muted-foreground": "#b2a0d6",
      primary: "#ff71bb",
      accent: "#40e5e5",
      destructive: "#fb794a",
      secondary: "#251c35",
      border: "#2d233f",
    },
  },
  // Neutro sem tingimento (croma ~0): para quem quer só o âmbar como cor.
  grafite: {
    label: "Grafite · neutro",
    colors: {
      background: "#101214",
      card: "#1a1c1e",
      foreground: "#e9ebf0",
      "muted-foreground": "#a7abb1",
      primary: "#f5ae4b",
      accent: "#6dc88f",
      destructive: "#eb635e",
      secondary: "#252729",
      border: "#2c2e31",
    },
  },
  // Claro frio: branco-azulado, destaque azul. Único tema com destaque não quente.
  nuvem: {
    label: "Nuvem · claro frio",
    colors: {
      background: "#eef4fc",
      card: "#fbfdff",
      foreground: "#1f2a38",
      "muted-foreground": "#525f6f",
      primary: "#2e62c9",
      accent: "#187c49",
      destructive: "#c52c2a",
      secondary: "#dee5ee",
      border: "#ced5df",
    },
  },
  // Escuro azul-petróleo: neutros h 225, destaque água-marinha (h 195) e sucesso verde (h 150).
  oceano: {
    label: "Oceano · profundo",
    colors: {
      background: "#02141b",
      card: "#081f27",
      foreground: "#d1f1ff",
      "muted-foreground": "#82b3c8",
      primary: "#62dedd",
      accent: "#79d28d",
      destructive: "#f2716a",
      secondary: "#112a34",
      border: "#16323d",
    },
  },
  // Claro lilás: fundo levemente violeta, destaque violeta (h 295). Par claro do Neon.
  lavanda: {
    label: "Lavanda · claro",
    colors: {
      background: "#f5f1ff",
      card: "#fdfcff",
      foreground: "#2b2538",
      "muted-foreground": "#60596f",
      primary: "#6c4ab3",
      accent: "#007a4d",
      destructive: "#c2272d",
      secondary: "#e7e1f3",
      border: "#d6d1e3",
    },
  },
};

/** Tema criado em Configurações → Aparência e salvo com nome: vira um card ao lado dos prontos. */
export type CustomTheme = { id: string; label: string; colors: Palette };

/** `preset` de um tema salvo pela pessoa. */
export const customPreset = (id: string) => `custom:${id}`;

export async function loadCustomThemes(): Promise<CustomTheme[]> {
  const raw = await getPref("custom_themes");
  if (!raw) return [];
  try {
    const list = JSON.parse(raw) as CustomTheme[];
    return Array.isArray(list) ? list.filter((t) => t && typeof t.id === "string" && t.colors) : [];
  } catch (e) {
    warn("temas salvos ilegíveis", e);
    return [];
  }
}

export async function saveCustomThemes(list: CustomTheme[]) {
  await setPref("custom_themes", JSON.stringify(list));
}

/** Cores padrão: main.tsx aplica antes da primeira pintura (index.css não repete os valores). */
export const DEFAULT_THEME: Theme = { preset: "cozy", colors: PRESETS.cozy.colors, font: "geist", fontScale: 100, pixelTitles: true, motion: true };

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
  root.fontFamily = (FONTS[t.font] ?? FONTS.geist).stack;
  root.colorScheme = contrastOn(c.background).isLight ? "light" : "dark";
  document.documentElement.classList.toggle("no-pixel-titles", !t.pixelTitles);
  document.documentElement.classList.toggle("reduce-motion", !t.motion);
  emit("theme", t);
}

/** Tema atual, atualizado quando Configurações → Aparência muda. */
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
  if (!(t.font in FONTS)) t.font = DEFAULT_THEME.font;
  // Tema pronto sempre usa as cores atuais do código (correções de contraste chegam sozinhas).
  return t.preset in PRESETS ? { ...t, colors: PRESETS[t.preset].colors } : t;
}

export async function saveTheme(t: Theme) {
  applyTheme(t);
  await setPref("theme", JSON.stringify(t));
}
