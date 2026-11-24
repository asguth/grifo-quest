export const STAGES = ["Previsto", "Autorizado", "Edital", "Inscrições", "Prova"];

/** Prova já aconteceu (aditivo, convocação, resultado): o backend marca "prova realizada". */
export function isDone(status: string | null): boolean {
  return (status ?? "").toLowerCase().includes("realizada");
}

/** Etapa da linha do tempo a partir do status livre do rastreador. -1 = não sabe. */
export function stageOf(status: string | null): number {
  const s = (status ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (s.includes("inscric")) return 3;
  if (s.includes("edital")) return 2;
  if (s.includes("autoriz") || s.includes("banca")) return 1;
  if (s.includes("previst")) return 0;
  if (s.includes("prova") || s.includes("resultado")) return 4;
  return -1;
}
