/**
 * Distribui em colunas lendo por linha (1ª, 2ª, 3ª coluna, volta para a 1ª), cada cartão na coluna
 * mais baixa (altura estimada). Colunas CSS enchem a 1ª coluna inteira antes da 2ª.
 */
export function masonry<T>(items: T[], columns: number, height: (x: T) => number): T[][] {
  const cols: T[][] = Array.from({ length: columns }, () => []);
  const h = new Array<number>(columns).fill(0);
  for (const x of items) {
    const i = h.indexOf(Math.min(...h));
    cols[i].push(x);
    h[i] += height(x);
  }
  return cols;
}

