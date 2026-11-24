import type { Evaluation_Serialize as Evaluation } from "@/lib/bindings";

export type OutlineItem = { title: string; text: string };

/**
 * Pontos do roteiro ("- **Conceito**: explicação") para mostrar como lista. Aceita `-`, `*`, `1.`;
 * linha sem negrito vira só texto. Material colado sem lista vira [] (a tela mostra o texto puro).
 */
export function outlineItems(md: string): OutlineItem[] {
  const out: OutlineItem[] = [];
  for (const raw of md.split(/\r?\n/)) {
    const m = raw.trim().match(/^(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (!m) continue;
    const line = m[1].trim();
    const bold = line.match(/^\*\*(.+?)\*\*\s*[:—–-]?\s*(.*)$/);
    out.push(bold ? { title: bold[1].trim(), text: bold[2].trim() } : { title: "", text: line.replace(/\*\*/g, "") });
  }
  return out;
}

/** Nota 0–100 igual à do backend (`domain::classroom::coverage`): coberto 1, raso 0,5. */
export function coverage(e: Evaluation | null): number {
  if (!e) return 0;
  const all = e.cobertos.length + e.rasos.length + e.omitidos.length + e.erros.length;
  return all === 0 ? 0 : Math.round((100 * (e.cobertos.length + e.rasos.length * 0.5)) / all);
}
