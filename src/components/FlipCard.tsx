import { AnimatePresence, motion } from "motion/react";
import { ease } from "@/lib/motion";
import { sfx } from "@/lib/sound";
import { cn } from "@/lib/utils";

type Side = { label: string; text: string };

/**
 * Cartão no estilo do Anki que vira em 3D: frente = pergunta; verso = pergunta pequena em cima,
 * linha, resposta embaixo. Troque `id` para o próximo entrar deslizando.
 * O giro é por tempo (não mola) para ser visível e igual em qualquer tela.
 */
export function FlipCard({ id, flipped, onFlip, front, back }: { id: number; flipped: boolean; onFlip: () => void; front: Side; back: Side }) {
  return (
    <div className="w-full max-w-2xl [perspective:1600px]">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={id}
          initial={{ opacity: 0, x: 60, rotate: 2 }}
          animate={{ opacity: 1, x: 0, rotate: 0 }}
          exit={{ opacity: 0, x: -60, rotate: -2, transition: { duration: 0.18, ease: ease.inOut } }}
          transition={{ duration: 0.32, ease: ease.out }}
        >
          <motion.button
            type="button"
            onClick={() => {
              sfx("flip");
              onFlip();
            }}
            initial={false}
            animate={{ rotateY: flipped ? 180 : 0 }}
            transition={{ duration: 0.55, ease: ease.inOut }}
            style={{ transformStyle: "preserve-3d" }}
            className="relative block h-80 w-full cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background"
            aria-label={flipped ? "Verso do cartão: clique para ver a frente" : "Frente do cartão: clique para virar"}
          >
            <Face>
              <span className="text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">{front.label}</span>
              <span className="text-xl leading-snug font-medium whitespace-pre-line">{front.text}</span>
              <span className="absolute bottom-3 text-[11px] text-muted-foreground/70">clique ou Espaço para virar</span>
            </Face>
            <Face back>
              <span className="line-clamp-3 text-sm whitespace-pre-line text-muted-foreground">{front.text}</span>
              <span className="h-px w-2/3 bg-border" />
              <span className="text-[11px] font-semibold tracking-widest text-primary uppercase">{back.label}</span>
              <span className="text-xl leading-snug font-medium whitespace-pre-line">{back.text}</span>
            </Face>
          </motion.button>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function Face({ back, children }: { back?: boolean; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "absolute inset-0 flex flex-col items-center justify-center gap-4 overflow-y-auto rounded-3xl border p-8 text-center shadow-lift [backface-visibility:hidden]",
        back ? "border-primary/40 bg-surface [transform:rotateY(180deg)]" : "border-border bg-card",
      )}
    >
      {children}
    </span>
  );
}
