import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Layers, Sparkles } from "lucide-react";
import { FlipCard } from "@/components/FlipCard";
import { Skeleton } from "@/components/motion";
import { ProgressBar } from "@/components/Progress";
import { toastError } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { commands, type CardRow, type Grade } from "@/lib/bindings";
import { useClaimDigits, useKey } from "@/lib/hooks";
import { spring } from "@/lib/motion";
import { sfx } from "@/lib/sound";
import { cn } from "@/lib/utils";
import { intervalLabel } from "./cards";

const GRADES: { g: Grade; label: string; tone: string }[] = [
  { g: "again", label: "Errei", tone: "text-destructive" },
  { g: "hard", label: "Difícil", tone: "text-primary" },
  { g: "good", label: "Bom", tone: "text-success" },
  { g: "easy", label: "Fácil", tone: "text-sky-500" },
];

/** Cartão na fila da sessão; `relearn` = voltou depois de um "Errei" (contador vermelho do Anki). */
type Item = CardRow & { relearn: boolean };

/**
 * Revisão no estilo do Anki: Espaço vira, 1–4 dá a nota, cada botão mostra quando o cartão volta.
 * "Errei" grava a nota e devolve o cartão ao fim da fila desta sessão (reaprender); a nota de novo
 * na volta não pesa duas vezes.
 */
export function CardReview({ onDone, onGenerate }: { onDone: () => void; onGenerate?: () => void }) {
  const [queue, setQueue] = useState<Item[] | null>(null);
  const [total, setTotal] = useState(0);
  const [done, setDone] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [stats, setStats] = useState({ again: 0, ok: 0 });

  useEffect(() => {
    commands.cardsDue(100).then((cs) => {
      setQueue(cs.map((c) => ({ ...c, relearn: false })));
      setTotal(cs.length);
    }, toastError);
  }, []);
  useClaimDigits();

  const card = queue?.[0];
  const counts = {
    novo: queue?.filter((c) => c.is_new && !c.relearn).length ?? 0,
    reaprender: queue?.filter((c) => c.relearn).length ?? 0,
    revisar: queue?.filter((c) => !c.is_new && !c.relearn).length ?? 0,
  };

  async function grade(g: Grade) {
    if (!card || !flipped) return;
    sfx(g === "again" ? "error" : "coin");
    const rest = (queue ?? []).slice(1);
    setFlipped(false);
    if (g === "again") {
      setQueue([...rest, { ...card, relearn: true }]);
    } else {
      setQueue(rest);
      setDone((n) => n + 1);
    }
    if (!card.relearn) {
      setStats((s) => (g === "again" ? { ...s, again: s.again + 1 } : { ...s, ok: s.ok + 1 }));
      try {
        await commands.reviewCard(card.id, g);
      } catch (e) {
        toastError(e);
      }
    }
  }

  const flip = () => {
    sfx("flip");
    setFlipped((f) => !f);
  };

  useKey((e) => {
    if (e.code === "Space" || e.key === "Enter") {
      e.preventDefault();
      // como no Anki: vira; virado, Espaço/Enter = "Bom"
      if (card && !flipped) flip();
      else if (card) void grade("good");
      return;
    }
    const n = Number(e.key);
    if (n >= 1 && n <= GRADES.length) void grade(GRADES[n - 1].g);
  });

  if (queue === null) return <Skeleton className="mx-auto h-80 max-w-2xl rounded-3xl" />;
  if (!card) {
    return (
      <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={spring.soft} className="flex flex-col items-center gap-4 py-16 text-center">
        <Layers className="size-10 text-primary" />
        <p className="text-lg font-semibold">{total ? "Parabéns! Você terminou o baralho de hoje." : "Nenhum cartão para hoje"}</p>
        {total > 0 && (
          <p className="text-sm text-muted-foreground">
            {stats.ok} lembrou · {stats.again} vão voltar amanhã
          </p>
        )}
        {!total && <p className="max-w-sm text-sm text-muted-foreground">Gere cartões com a IA, crie à mão ou vire flashcard as questões que errar.</p>}
        <div className="flex gap-2">
          {onGenerate && (
            <Button variant="secondary" onClick={onGenerate}>
              <Sparkles /> Gerar cartões com IA
            </Button>
          )}
          <Button onClick={onDone}>Voltar</Button>
        </div>
      </motion.div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-6 py-4">
      <div className="flex w-full max-w-2xl items-center gap-4 text-xs text-muted-foreground">
        <span className="flex gap-3 font-semibold tabular" aria-label="Novos, reaprender e revisar">
          <span className="text-sky-500" title="Novos">{counts.novo}</span>
          <span className="text-destructive" title="Reaprender">{counts.reaprender}</span>
          <span className="text-success" title="Revisar">{counts.revisar}</span>
        </span>
        <ProgressBar value={total ? done / total : 0} className="h-1.5 flex-1" />
        {card.topic && <span className="max-w-48 truncate">{card.topic}</span>}
      </div>

      <FlipCard
        id={card.id * 10 + (card.relearn ? 1 : 0)}
        flipped={flipped}
        onFlip={flip}
        front={{ label: card.source === "erro" ? "Questão que você errou" : card.relearn ? "De novo" : "Pergunta", text: card.front }}
        back={{ label: "Resposta", text: card.back }}
      />

      <div className="flex min-h-20 flex-wrap justify-center gap-2">
        {flipped ? (
          GRADES.map((x, n) => (
            <motion.div key={x.g} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring.snappy, delay: n * 0.04 }}>
              <Button variant="secondary" className="min-w-28 flex-col gap-0 py-7" onClick={() => void grade(x.g)}>
                <span className="text-[11px] text-muted-foreground tabular">{card.relearn && x.g !== "again" ? "ok" : intervalLabel(card.next[n] ?? 1)}</span>
                <span className={cn("font-semibold", x.tone)}>
                  {x.label} <kbd className="text-[10px] opacity-50">{n + 1}</kbd>
                </span>
              </Button>
            </motion.div>
          ))
        ) : (
          <Button size="lg" className="min-w-56 py-7" onClick={flip}>
            Mostrar resposta <kbd className="ml-1 opacity-50">Espaço</kbd>
          </Button>
        )}
      </div>
    </div>
  );
}
