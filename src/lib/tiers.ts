/** Planos do Grifo Quest Cloud (o texto `plan` do servidor). O selo do plano aparece no perfil. */
export type TierId = "escudeiro" | "forjador" | "ancestral";

export type Tier = {
  id: TierId;
  name: string;
  /** Uma linha do que o plano é. */
  tagline: string;
  perks: string[];
  /** Cores do selo: fundo, texto e borda (funcionam no claro e no escuro). */
  tone: { bg: string; fg: string; ring: string };
};

export const TIERS: Tier[] = [
  {
    id: "escudeiro",
    name: "Escudeiro do Grifo",
    tagline: "Sua entrada na comunidade do Grifo.",
    perks: ["Comunidade, fórum e mensagens", "IA na nuvem sem placa de vídeo (em breve)", "Backup dos estudos na nuvem (em breve)"],
    tone: { bg: "oklch(0.62 0.1 230 / 0.16)", fg: "oklch(0.72 0.12 230)", ring: "oklch(0.62 0.1 230 / 0.45)" },
  },
  {
    id: "forjador",
    name: "Forjador de Penas",
    tagline: "Quem ajuda a forjar o Grifo Quest.",
    perks: ["Tudo do Escudeiro", "Prévia das novidades antes de todo mundo", "Seu voto no que vem a seguir"],
    tone: { bg: "oklch(0.65 0.15 45 / 0.16)", fg: "oklch(0.74 0.15 50)", ring: "oklch(0.65 0.15 45 / 0.45)" },
  },
  {
    id: "ancestral",
    name: "Grifo Ancestral",
    tagline: "Fundador: está com o Grifo desde o primeiro voo.",
    perks: ["Tudo do Forjador", "Selo de fundador para sempre no perfil", "Nome nos créditos do app"],
    tone: { bg: "oklch(0.8 0.14 90 / 0.18)", fg: "oklch(0.82 0.15 85)", ring: "oklch(0.8 0.14 90 / 0.55)" },
  },
];

export function tierOf(plan: string | null | undefined): Tier | null {
  return TIERS.find((t) => t.id === plan) ?? null;
}
