import { describe, expect, it } from "vitest";
import { masonry } from "./masonry";

describe("masonry", () => {
  it("lê por linha: os primeiros itens vão um para cada coluna", () => {
    expect(masonry([1, 2, 3, 4, 5, 6], 3, () => 1)).toEqual([[1, 4], [2, 5], [3, 6]]);
  });
  it("próximo item vai para a coluna mais baixa", () => {
    // 10 é alto: a 1ª coluna recebe só ele, o resto se divide entre as outras
    expect(masonry([10, 1, 1, 1, 1], 2, (x) => x)).toEqual([[10], [1, 1, 1, 1]]);
  });
  it("uma coluna só", () => {
    expect(masonry(["a", "b"], 1, () => 1)).toEqual([["a", "b"]]);
  });
});
