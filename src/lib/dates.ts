/** YYYY-MM-DD no fuso local (igual ao `date(x, 'localtime')` do SQLite). */
export function isoDay(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Os últimos `n` dias terminando hoje, do mais antigo ao mais novo. */
export function lastDays(n: number): Date[] {
  const today = new Date();
  return Array.from({ length: n }, (_, i) => new Date(today.getFullYear(), today.getMonth(), today.getDate() - (n - 1 - i)));
}

/** Segunda-feira desta semana (00:00 local). */
export function weekStart(): Date {
  const t = new Date();
  const back = (t.getDay() + 6) % 7;
  return new Date(t.getFullYear(), t.getMonth(), t.getDate() - back);
}

const WEEKDAY = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

export function shortDay(d: Date): string {
  return WEEKDAY[d.getDay()];
}

export type Period = "madrugada" | "amanhecer" | "dia" | "entardecer" | "noite";

export function periodOf(hour: number): Period {
  if (hour < 5) return "madrugada";
  if (hour < 8) return "amanhecer";
  if (hour < 17) return "dia";
  if (hour < 19) return "entardecer";
  return "noite";
}

/** Saudação pela hora (mesmos períodos da cena de fundo; o "dia" vira tarde ao meio-dia). */
export function greeting(hour: number): string {
  switch (periodOf(hour)) {
    case "madrugada":
      return "Madrugada de estudo";
    case "amanhecer":
      return "Bom dia";
    case "dia":
      return hour < 12 ? "Bom dia" : "Boa tarde";
    case "entardecer":
      return "Boa tarde";
    case "noite":
      return "Boa noite";
  }
}
