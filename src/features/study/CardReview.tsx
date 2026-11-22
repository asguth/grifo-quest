import { useEffect, useState } from "react";
import { Layers } from "lucide-react";
import { FlipCard } from "@/components/FlipCard";
import { Skeleton } from "@/components/motion";
import { ProgressBar } from "@/components/Progress";
import { toastError } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { commands, type CardRow, type Grade } from "@/lib/bindings";
import { useClaimDigits, useKey } from "@/lib/hooks";
import { sfx } from "@/lib/sound";
import { cn } from "@/lib/utils";

const GRADES: { g: Grade; label: string; hint: string; tone: string }[] = [
  { g: "again", label: "Errei", hint: "amanhã", tone: "text-destructive" },
  { g: "hard", label: "Difícil", hint: "logo", tone: "text-primary" },
  { g: "good", label: "Bom", hint: "alguns dias", tone: "text-success" },
  { g: "easy", label: "Fácil", hint: "bem depois", tone: "text-success" },
];

/** Revisão do baralho com repetição espaçada: Espaço vira, 1–4 dá a nota. */
export function CardReview({ onDone }: { onDone: () => void }) {
  const [cards, setCards] = useState<CardRow[] | null>(null);
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [stats, setStats] = useState({ again: 0, ok: 0 });

  useEffect(() => void commands.cardsDue(100).then(setCards, toastError), []);
  useClaimDigits();

  const card = cards?.[i];
  async function grade(g: Grade) {
    if (!card || !flipped) return;
    sfx(g === "again" ? "error" : "coin");
    setStats((s) => (g === "again" ? { ...s, again: s.again + 1 } : { ...s, ok: s.ok + 1 }));
    setFlipped(false);
    setI((n) => n + 1);
    try {
      await commands.reviewCard(card.id, g);
    } catch (e) {
      toastError(e);
    }
  }

  const flip = () => {
    sfx("flip");
    setFlipped((f) => !f);
  };

  useKey((e) => {
    if (e.code === "Space") {
      e.preventDefault();
      if (card) flip();
    }
    const n = Number(e.key);
    if (n >= 1 && n <= GRADES.length) void grade(GRADES[n - 1].g);
  });

  if (cards === null) return <Skeleton className="mx-auto h-72 max-w-xl rounded-2xl" />;
  if (!card) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <Layers className="size-10 text-primary" />
        <p className="text-lg font-semibold">{cards.length ? "Baralho do dia revisado!" : "Nenhum cartão para hoje"}</p>
        {cards.length > 0 && (
          <p className="text-sm text-muted-foreground">
            {stats.ok} lembrou · {stats.again} vão voltar amanhã
          </p>
        )}
        {!cards.length && <p className="max-w-sm text-sm text-muted-foreground">Gere flashcards de um tópico (Matérias → livro → Flashcards → Salvar no baralho) ou vire flashcard as questões que errar.</p>}
        <Button onClick={onDone}>Voltar</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-6 py-4">
      <div className="flex w-full max-w-xl items-center gap-3 text-xs text-muted-foreground">
        <span className="tabular">
          {i + 1}/{cards.length}
        </span>
        <ProgressBar value={i / cards.length} className="h-1.5 flex-1" />
        {card.topic && <span className="truncate">{card.topic}</span>}
      </div>
      <FlipCard
        id={card.id}
        flipped={flipped}
        onFlip={() => setFlipped((f) => !f)}
        front={{ label: card.source === "erro" ? "Questão que você errou" : "Pergunta", text: card.front }}
        back={{ label: "Resposta", text: card.back }}
      />
      {flipped ? (
        <div className="flex flex-wrap justify-center gap-2">
          {GRADES.map((x, n) => (
            <Button key={x.g} variant="secondary" className="min-w-28 flex-col gap-0 py-6" onClick={() => void grade(x.g)}>
              <span className={cn("font-semibold", x.tone)}>
                {x.label} <kbd className="text-[10px] opacity-50">{n + 1}</kbd>
              </span>
              <span className="text-[10px] text-muted-foreground">{x.hint}</span>
            </Button>
          ))}
        </div>
      ) : (
        <Button size="lg" className="min-w-40" onClick={() => (sfx("flip"), setFlipped(true))}>
          Virar <kbd className="ml-1 opacity-50">Espaço</kbd>
        </Button>
      )}
    </div>
  );
}
