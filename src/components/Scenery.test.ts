import { describe, expect, it } from "vitest";
import { ridge } from "./Scenery";

describe("ridge", () => {
  it("só tem traços retos (cara de pixel) e fecha o contorno no chão", () => {
    expect(ridge(1.3, 52, 18, 6)).toMatch(/^M0 90( V-?\d+ H\d+)+ V90 Z$/);
  });

  it("é a mesma silhueta para a mesma semente", () => {
    expect(ridge(4.1, 52, 14, 4)).toBe(ridge(4.1, 52, 14, 4));
    expect(ridge(4.1, 52, 14, 4)).not.toBe(ridge(7.7, 52, 14, 4));
  });
});
