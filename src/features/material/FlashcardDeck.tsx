import { useState } from "react";
import { motion } from "motion/react";
import { Check, RotateCcw, X } from "lucide-react";
import { FlipCard } from "@/components/FlipCard";
import { ProgressBar } from "@/components/Progress";
import { Button } from "@/components/ui/button";
import { useKey } from "@/lib/hooks";
import { spring } from "@/lib/motion";
import { sfx } from "@/lib/sound";
import type { Card } from "./flashcards";

/** Estudo ativo: vira o cartão (Espaço), marca errei (←) / acertei (→), repete só os errados no fim. */
export function FlashcardDeck({ cards }: { cards: Card[] }) {
  const [deck, setDeck] = useState(cards);
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [wrong, setWrong] = useState<Card[]>([]);
  const [right, setRight] = useState(0);
  const done = i >= deck.length;
  const card = deck[i];

  function answer(ok: boolean) {
    if (!flipped || done) return;
    if (ok) setRight((r) => r + 1);
    else setWrong((w) => [...w, card]);
    // O último cartão já toca a fanfarra do fim; os outros, o acerto/erro.
    if (i + 1 >= deck.length) sfx(ok && !wrong.length ? "levelup" : "success");
    else sfx(ok ? "coin" : "error");
    setFlipped(false);
    setI((n) => n + 1);
  }

  function restart(only: Card[]) {
    setDeck(only);
    setI(0);
    setFlipped(false);
    setWrong([]);
    setRight(0);
  }

  const flip = () => {
    sfx("flip");
    setFlipped((f) => !f);
  };

  useKey((e) => {
    if (e.code === "Space") {
      e.preventDefault();
      if (!done) flip();
    } else if (e.key === "ArrowLeft") answer(false);
    else if (e.key === "ArrowRight") answer(true);
  });

  if (done) {
    const pct = deck.length ? Math.round((right / deck.length) * 100) : 0;
    return (
      <div className="flex h-full flex-col items-center justify-center gap-5 bg-background p-8 text-center">
        <motion.p initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={spring.bouncy} className="retro tabular text-4xl text-primary">
          {pct}%
        </motion.p>
        <p className="text-muted-foreground">
          {right} de {deck.length} de primeira. {wrong.length ? `Faltaram ${wrong.length}.` : "Gabaritou!"}
        </p>
        <div className="flex gap-2">
          {wrong.length > 0 && <Button onClick={() => restart(wrong)}>Repetir os {wrong.length} que errei</Button>}
          <Button variant="secondary" onClick={() => restart(cards)}>
            <RotateCcw /> Recomeçar tudo
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 bg-background p-8">
      <div className="flex w-full max-w-xl items-center gap-3 text-xs text-muted-foreground">
        <span className="tabular">
          {i + 1}/{deck.length}
        </span>
        <ProgressBar value={i / deck.length} className="h-1.5 flex-1" />
        <span className="text-success">{right} ✓</span>
        <span className="text-destructive">{wrong.length} ✗</span>
      </div>

      <FlipCard id={i} flipped={flipped} onFlip={() => setFlipped((f) => !f)} front={{ label: "Pergunta", text: card.front }} back={{ label: "Resposta", text: card.back }} />

      <div className="flex items-center gap-3">
        {flipped ? (
          <>
            <Button variant="secondary" className="min-w-32 text-destructive" onClick={() => answer(false)}>
              <X /> Errei <kbd className="ml-1 opacity-50">←</kbd>
            </Button>
            <Button className="min-w-32" onClick={() => answer(true)}>
              <Check /> Acertei <kbd className="ml-1 opacity-50">→</kbd>
            </Button>
          </>
        ) : (
          <Button className="min-w-40" onClick={() => (sfx("flip"), setFlipped(true))}>
            Virar <kbd className="ml-1 opacity-50">Espaço</kbd>
          </Button>
        )}
      </div>
    </div>
  );
}
