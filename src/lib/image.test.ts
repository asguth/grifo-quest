import { describe, expect, it } from "vitest";
import { initials, toneOf } from "./image";

describe("iniciais", () => {
  it("primeira e última palavra", () => {
    expect(initials("Ana Paula Souza")).toBe("AS");
    expect(initials("  joão ")).toBe("JO");
    expect(initials("")).toBe("?");
  });
  it("cor estável por id", () => {
    expect(toneOf("abc")).toBe(toneOf("abc"));
    expect(toneOf("abc")).toBeGreaterThanOrEqual(0);
    expect(toneOf("abc")).toBeLessThan(360);
  });
});
