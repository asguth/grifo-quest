import { describe, expect, it } from "vitest";
import { contrastOn, PRESETS } from "./theme";

/** Contraste WCAG 2 entre duas cores #rrggbb. */
function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    const [r, g, b2] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b2;
  };
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

describe("temas prontos passam no contraste AA (texto ≥ 4,5:1)", () => {
  for (const [id, { colors: c }] of Object.entries(PRESETS)) {
    it(id, () => {
      const pairs: [string, string, string][] = [
        ["texto / fundo", c.foreground, c.background],
        ["texto / cartão", c.foreground, c.card],
        ["texto suave / fundo", c["muted-foreground"], c.background],
        ["texto suave / cartão", c["muted-foreground"], c.card],
        ["texto do botão / destaque", contrastOn(c.primary).fg, c.primary],
        ["destaque / fundo", c.primary, c.background],
      ];
      const fails = pairs.filter(([, a, b]) => contrast(a, b) < 4.5).map(([n, a, b]) => `${n}: ${contrast(a, b).toFixed(2)}`);
      expect(fails).toEqual([]);
    });
  }
});

describe("contrastOn", () => {
  it("texto escuro em destaque claro, texto claro em destaque escuro", () => {
    expect(contrastOn("#e0a84f")).toMatchObject({ isLight: true, fg: "#1b1a17" });
    expect(contrastOn("#93561a")).toMatchObject({ isLight: false, fg: "#fffaf0" });
  });
});
