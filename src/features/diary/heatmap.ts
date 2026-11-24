/** Calendário do mapa de calor, no formato do GitHub: colunas = semanas (domingo no topo). */

export const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
export const WEEKS = 53;

export type HeatGrid = {
  /** `weeks[c][r]`: dia da semana `r` (0 = domingo) da coluna `c`; `null` = depois de hoje. */
  weeks: (Date | null)[][];
  /** Rótulo do mês na coluna em que ele começa. */
  months: { col: number; label: string }[];
};

/** 53 semanas terminando na semana de `today` (a última coluna fica parcial, como no GitHub). */
export function heatGrid(today: Date, weeks = WEEKS): HeatGrid {
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const start = new Date(end);
  start.setDate(end.getDate() - end.getDay() - (weeks - 1) * 7);
  const cols: (Date | null)[][] = [];
  for (let c = 0; c < weeks; c++) {
    const col: (Date | null)[] = [];
    for (let r = 0; r < 7; r++) {
      const d = new Date(start);
      d.setDate(start.getDate() + c * 7 + r);
      col.push(d > end ? null : d);
    }
    cols.push(col);
  }
  // Mês novo = a coluna tem o dia 1 (ou é a primeira). A primeira só leva rótulo se o próximo
  // estiver a 3+ colunas, senão os dois se sobrepõem.
  const months: HeatGrid["months"] = [];
  cols.forEach((col, c) => {
    const first = col.find((d) => d?.getDate() === 1);
    if (first) months.push({ col: c, label: MONTHS[first.getMonth()] });
  });
  const firstDay = cols[0][0];
  if (firstDay && (months.length === 0 || months[0].col >= 3)) months.unshift({ col: 0, label: MONTHS[firstDay.getMonth()] });
  return { weeks: cols, months };
}
