import { describe, expect, it } from "vitest";
import { issueUrl } from "./report";

describe("issueUrl", () => {
  it("preenche o formulário de bug pelos ids dos campos", () => {
    const u = new URL(issueUrl("bug", { title: "Mundo travou", version: "0.1.0", system: "Windows 10/11", where: "mundo", error: "boom" }));
    expect(u.origin + u.pathname).toBe("https://github.com/asguth/grifo-quest/issues/new");
    expect(Object.fromEntries(u.searchParams)).toEqual({ template: "bug.yml", title: "Mundo travou", versao: "0.1.0", sistema: "Windows 10/11", tela: "mundo", erro: "boom" });
  });
  it("corta mensagens enormes", () => {
    const u = new URL(issueUrl("bug", { version: "1", system: "x", error: "a".repeat(5000) }));
    expect(u.searchParams.get("erro")).toHaveLength(1500);
  });
  it("ideia não leva sistema nem erro", () => {
    const u = new URL(issueUrl("ideia", { version: "1", system: "x", error: "e" }));
    expect(u.searchParams.has("erro")).toBe(false);
    expect(u.searchParams.get("template")).toBe("ideia.yml");
  });
});
