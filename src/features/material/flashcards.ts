export type Card = { front: string; back: string };

/** Lê a tabela `| Frente | Verso |` que o Grifo gera. Ignora cabeçalho, separador e linhas incompletas. */
export function parseFlashcards(markdown: string): Card[] {
  const cards: Card[] = [];
  for (const raw of markdown.split("\n")) {
    const line = raw.trim();
    if (!line.startsWith("|")) continue;
    const cells = line.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
    if (cells.length < 2 || cells.every((c) => /^:?-{2,}:?$/.test(c))) continue;
    const [front, back] = cells;
    if (!front || !back || /^frente$/i.test(front)) continue;
    cards.push({ front: strip(front), back: strip(back) });
  }
  return cards;
}

/** Tira só a marcação simples de ênfase (o cartão mostra texto puro). */
function strip(s: string) {
  return s.replace(/\*\*(.+?)\*\*/g, "$1").replace(/(^|\s)\*(.+?)\*/g, "$1$2").replace(/<br\s*\/?>/gi, "\n");
}
