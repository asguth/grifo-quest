import { describe, expect, it } from "vitest";
import { greeting, periodOf } from "./dates";

describe("periodOf", () => {
  it("cobre o dia inteiro nas fronteiras", () => {
    expect([0, 4, 5, 7, 8, 16, 17, 18, 19, 23].map(periodOf)).toEqual([
      "madrugada", "madrugada", "amanhecer", "amanhecer", "dia", "dia", "entardecer", "entardecer", "noite", "noite",
    ]);
  });
});

describe("greeting", () => {
  it("vira tarde ao meio-dia, mesmo dentro do período 'dia'", () => {
    expect([3, 6, 11, 12, 16, 18, 21].map(greeting)).toEqual([
      "Madrugada de estudo", "Bom dia", "Bom dia", "Boa tarde", "Boa tarde", "Boa tarde", "Boa noite",
    ]);
  });
});
