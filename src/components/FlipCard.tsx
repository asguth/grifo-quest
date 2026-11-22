import { AnimatePresence, motion } from "motion/react";
import { spring } from "@/lib/motion";
import { sfx } from "@/lib/sound";
import { cn } from "@/lib/utils";

type Side = { label: string; text: string };

/** Cartão que vira em 3D. Troque `id` para o próximo entrar deslizando. */
export function FlipCard({ id, flipped, onFlip, front, back }: { id: number; flipped: boolean; onFlip: () => void; front: Side; back: Side }) {
  return (
    <div className="w-full max-w-xl [perspective:1200px]">
      <AnimatePresence mode="wait">
        <motion.button
          key={id}
          onClick={() => {
            sfx("flip");
            onFlip();
          }}
          initial={{ opacity: 0, x: 40, scale: 0.96 }}
          animate={{ opacity: 1, x: 0, scale: 1, rotateY: flipped ? 180 : 0 }}
          exit={{ opacity: 0, x: -40, transition: { duration: 0.14 } }}
          transition={spring.soft}
          style={{ transformStyle: "preserve-3d" }}
          className="relative block h-72 w-full cursor-pointer"
          aria-label={flipped ? "Verso do cartão" : "Frente do cartão: clique para virar"}
        >
          <Face {...front} />
          <Face {...back} back />
        </motion.button>
      </AnimatePresence>
    </div>
  );
}

function Face({ label, text, back }: Side & { back?: boolean }) {
  return (
    <span
      className={cn(
        "absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-2xl border p-8 text-center shadow-lift [backface-visibility:hidden]",
        back ? "border-primary/40 bg-surface [transform:rotateY(180deg)]" : "border-border bg-card",
      )}
    >
      <span className="text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">{label}</span>
      <span className="text-xl leading-snug font-medium whitespace-pre-line">{text}</span>
    </span>
  );
}
