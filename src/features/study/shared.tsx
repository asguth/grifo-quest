import { MascotEmpty } from "@/components/MascotEmpty";
import { ImportEditalButton } from "@/features/onboarding/ImportEdital";
import type { SessionKind } from "@/lib/bindings";

export type Tab = "hoje" | "questoes" | "cards" | "erros" | "desempenho" | "foco";

/** Começa uma sessão de questões (o tipo + tópico ou matéria + quantas). */
export type Start = (kind: SessionKind, opts?: { topic?: number; subject?: number; n?: number }) => Promise<void>;

/** Identifica qual botão está começando a sessão (para o giro de carregando). */
export function startKey(kind: SessionKind, opts: { topic?: number; subject?: number } = {}) {
  return `${kind}:${opts.topic ?? ""}:${opts.subject ?? ""}`;
}

/** Estado vazio com o atalho para montar o edital (quem pulou no assistente não fica perdido). */
export function NoTopics({ onImported, text }: { onImported: () => void; text: string }) {
  return (
    <MascotEmpty title="Seu edital ainda está vazio" text={text}>
      <ImportEditalButton size="lg" onApplied={onImported} />
    </MascotEmpty>
  );
}
