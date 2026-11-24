/** Intervalo do Anki em texto curto: "1 d", "12 d", "2 m", "1,5 a". */
export function intervalLabel(days: number): string {
  if (days < 30) return `${Math.max(1, Math.round(days))} d`;
  if (days < 365) return `${Math.round(days / 30)} m`;
  return `${(days / 365).toFixed(1).replace(".", ",").replace(",0", "")} a`;
}
