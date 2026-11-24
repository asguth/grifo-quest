import { describe, expect, it } from "vitest";

/** Texto de todos os .ts/.tsx de `src` (o Vite lê na hora do teste). */
const sources = import.meta.glob<string>(["../**/*.{ts,tsx}", "!../**/*.test.{ts,tsx}"], { query: "?raw", import: "default", eager: true });

/**
 * `useEffect(() => algo())` devolve o que `algo` devolver. Se não for função (ex.: o `scrollIntoView`
 * do WebView2 novo devolve Promise), o React tenta chamá-lo ao desmontar ("destroy is not a function")
 * e a tela inteira cai. Corpo sempre entre chaves, `() => void algo()` ou `() => () => limpeza()`.
 */
describe("efeitos do React", () => {
  it("não devolvem o valor de uma expressão", () => {
    const bad = Object.entries(sources).flatMap(([file, text]) =>
      text
        .split("\n")
        .map((line, i) => ({ line: line.trim(), at: `${file}:${i + 1}` }))
        // `() => on(...)` (bus) devolve a função de cancelar: liberado com o comentário `effect-cleanup`
        .filter(({ line }) => /use(Layout)?Effect\(\(\) => (?!\{|void |\(\) =>)/.test(line) && !line.includes("effect-cleanup")),
    );
    expect(Object.keys(sources).length).toBeGreaterThan(50);
    expect(bad.map((b) => `${b.at}  ${b.line}`)).toEqual([]);
  });
});
