import { describe, expect, it } from "vitest";
import { cloudMessage } from "./cloud";

describe("cloudMessage", () => {
  it("repassa o aviso do próprio banco", () => {
    expect(cloudMessage(400, JSON.stringify({ code: "P0001", message: "Calma! Muitas mensagens" }))).toBe("Calma! Muitas mensagens");
  });
  it("traduz erros conhecidos", () => {
    expect(cloudMessage(409, JSON.stringify({ code: "23505", message: "duplicate key" }))).toContain("já existe");
    expect(cloudMessage(403, JSON.stringify({ code: "42501", message: "rls" }))).toContain("assinatura");
  });
  it("aguenta corpo que não é JSON", () => {
    expect(cloudMessage(500, "boom")).toContain("boom");
  });
});
