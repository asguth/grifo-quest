import { describe, expect, it } from "vitest";
import { liteMarkdown } from "./lite-markdown";

describe("liteMarkdown", () => {
  it("formata o básico", () => {
    expect(liteMarkdown("**Legítimo interesse** é base legal.\n\n- art. 7º\n- art. 10")).toBe(
      "<p><strong>Legítimo interesse</strong> é base legal.</p><ul><li>art. 7º</li><li>art. 10</li></ul>",
    );
  });
  it("nunca deixa passar HTML do modelo", () => {
    const out = liteMarkdown('<img src=x onerror="alert(1)"> <script>x</script>');
    expect(out).not.toContain("<img");
    expect(out).not.toContain("<script");
    expect(out).toContain("&lt;script&gt;");
  });
});
