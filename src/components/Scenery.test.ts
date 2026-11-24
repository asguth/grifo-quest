import { describe, expect, it } from "vitest";
import { artWidth, ridge } from "./Scenery";

describe("ridge", () => {
  it("só tem traços retos (cara de pixel) e fecha o contorno no chão", () => {
    expect(ridge(1.3, 52, 18, 6)).toMatch(/^M0 90( V-?\d+ H\d+)+ V90 Z$/);
  });

  it("é a mesma silhueta para a mesma semente", () => {
    expect(ridge(4.1, 52, 14, 4)).toBe(ridge(4.1, 52, 14, 4));
    expect(ridge(4.1, 52, 14, 4)).not.toBe(ridge(7.7, 52, 14, 4));
  });
});

describe("artWidth", () => {
  it("pixel da arte com tamanho fixo: janela larga alonga a paisagem", () => {
    expect(artWidth(2000, 300)).toBe(Math.ceil((2048 * 90) / 300));
    expect(artWidth(4000, 300)).toBeGreaterThan(artWidth(2000, 300));
  });
  it("em tela estreita a arte acompanha a área (a lua não é cortada)", () => {
    // monitor em pé de 900 px: sobra ~620 px para a cena
    const w = artWidth(620, 300);
    expect(w).toBe(Math.ceil(((620 + 48) * 90) / 300));
    expect(w - 58 + 9).toBeLessThanOrEqual(w); // borda direita da lua dentro da arte
    expect(artWidth(10, 300)).toBe(120);
  });
});
