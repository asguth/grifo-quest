import { describe, expect, it } from "vitest";
import { HANDLE_OK, normalizeHandle, searchTerm } from "./api";

describe("comunidade", () => {
  it("@ vira o formato aceito pelo servidor", () => {
    expect(normalizeHandle("João Silva!")).toBe("joaosilva");
    expect(HANDLE_OK.test(normalizeHandle("Ana_2027"))).toBe(true);
    expect(HANDLE_OK.test("ab")).toBe(false);
  });
  it("busca não injeta filtro do PostgREST", () => {
    expect(searchTerm("trt,or=(id.eq.1)")).not.toMatch(/[,()]/);
    expect(searchTerm("  direito  ")).toBe("direito");
  });
});
