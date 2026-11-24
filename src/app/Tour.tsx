import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { Mascot } from "@/components/Mascot";
import { Button } from "@/components/ui/button";
import { QUICK_LOG_SHORTCUT } from "@/lib/rules";
import { sfx } from "@/lib/sound";
import { spring } from "@/lib/motion";
import { cn } from "@/lib/utils";
import type { Navigate, SlotId } from "./nav";

/** Um passo do tour. `slot`: tela aberta e item do menu destacado; sem slot = cartão no meio. */
type Step = { slot?: SlotId; title: string; text: string };

export const TOUR: Step[] = [
  { title: "Bem-vindo ao seu QG!", text: "Vou te mostrar onde fica cada coisa. Leva 1 minuto, e dá para pular quando quiser." },
  { slot: "diario", title: "Início", text: "Missões do dia, XP, sequência e seus gráficos. Em “Editar início” você arrasta e redimensiona os widgets." },
  { slot: "foco", title: "Estudo", text: "O coração do app: sessão de questões do dia, flashcards, caderno de erros, desempenho e o pomodoro." },
  { slot: "sala", title: "Sala de aula", text: "Você explica o tópico e os alunos virtuais perguntam justamente onde você ficou raso. Ensinar fixa." },
  { slot: "materias", title: "Matérias", text: "Seu edital verticalizado: teoria, questões e 3 revisões por tópico, e os materiais do Grifo." },
  { slot: "mundo", title: "Mundo", text: "Notícias de concursos, o rastreador da sua área e a contagem regressiva das suas provas." },
  { slot: "config", title: "Config", text: "Temas, IA, integrações e notícias. Achou um problema? Config → Sistema → Reportar." },
  { title: "Uma última dica", text: `${QUICK_LOG_SHORTCUT} lança questões feitas fora do app, de qualquer lugar do Windows. Bons estudos!` },
];

type Rect = { x: number; y: number; w: number; h: number };
const PAD = 6;

function rectOf(slot: SlotId | undefined): Rect | null {
  const el = slot && document.querySelector<HTMLElement>(`[data-tour="${slot}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left - PAD, y: r.top - PAD, w: r.width + PAD * 2, h: r.height + PAD * 2 };
}

/**
 * Tour da primeira vez: escurece a tela, recorta um "holofote" no item do menu, abre a tela dele e
 * o Grifinho explica. → / Enter avança, ← volta, Esc pula.
 */
export function Tour({ go, onClose }: { go: Navigate; onClose: () => void }) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const step = TOUR[i];
  const last = i === TOUR.length - 1;

  const measure = useCallback(() => setRect(rectOf(step.slot)), [step.slot]);
  useLayoutEffect(() => {
    if (step.slot) go(step.slot);
    measure();
  }, [step.slot, go, measure]);
  useEffect(() => {
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  const next = useCallback(() => {
    sfx("nav");
    if (last) onClose();
    else setI((n) => n + 1);
  }, [last, onClose]);
  const back = useCallback(() => setI((n) => Math.max(0, n - 1)), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight" || e.key === "Enter") next();
      else if (e.key === "ArrowLeft") back();
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    // captura: as teclas do tour não chegam aos atalhos das telas
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [next, back, onClose]);

  // Cartão ao lado do item destacado (o menu fica à esquerda); sem alvo, no meio da tela.
  const cardStyle = rect
    ? { left: rect.x + rect.w + 18, top: Math.min(Math.max(16, rect.y - 40), window.innerHeight - 260) }
    : { left: "50%", top: "50%", x: "-50%", y: "-50%" };

  return (
    <div role="dialog" aria-modal aria-label="Tutorial" className="fixed inset-0 z-50">
      {/* Fundo escuro com o recorte: a sombra enorme do retângulo escurece todo o resto. */}
      <motion.div
        className="pointer-events-none absolute rounded-xl ring-2 ring-primary"
        initial={false}
        animate={
          rect
            ? { left: rect.x, top: rect.y, width: rect.w, height: rect.h, opacity: 1 }
            : { left: "50%", top: "50%", width: 0, height: 0, opacity: 1 }
        }
        transition={spring.soft}
        style={{ boxShadow: "0 0 0 9999px rgb(0 0 0 / 0.62)" }}
      />
      {/* Clique fora não fecha (evita pular sem querer); só bloqueia o app por baixo. */}
      <div className="absolute inset-0" />

      <AnimatePresence mode="wait">
        <motion.section
          key={i}
          initial={{ opacity: 0, scale: 0.96, ...(rect ? { x: -8 } : {}) }}
          animate={{ opacity: 1, scale: 1, ...(rect ? { x: 0 } : {}) }}
          exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.12 } }}
          transition={spring.soft}
          style={cardStyle}
          className="absolute w-[min(380px,calc(100vw-2rem))] rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-lift"
        >
          <div className="flex gap-4">
            <motion.div className="shrink-0" animate={{ y: [0, -4, 0] }} transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}>
              <Mascot look={i >= TOUR.length - 2 ? "cap" : "base"} scale={4} />
            </motion.div>
            <div className="min-w-0 space-y-1.5">
              <h2 className="retro text-xs text-primary">{step.title}</h2>
              <p className="text-sm leading-relaxed">{step.text}</p>
            </div>
          </div>

          <footer className="mt-5 flex items-center gap-2">
            <div className="mr-auto flex gap-1" aria-label={`Passo ${i + 1} de ${TOUR.length}`}>
              {TOUR.map((_, n) => (
                <motion.span
                  key={n}
                  animate={{ width: n === i ? 16 : 6, opacity: n <= i ? 1 : 0.35 }}
                  className={cn("block h-1.5 rounded-full", n <= i ? "bg-primary" : "bg-foreground")}
                />
              ))}
            </div>
            {!last && (
              <Button size="sm" variant="ghost" onClick={onClose}>
                <X /> Pular
              </Button>
            )}
            {i > 0 && (
              <Button size="sm" variant="secondary" onClick={back} aria-label="Voltar">
                <ArrowLeft />
              </Button>
            )}
            <Button size="sm" onClick={next} autoFocus>
              {last ? "Começar!" : i === 0 ? "Mostrar" : "Próximo"} {!last && <ArrowRight />}
            </Button>
          </footer>
        </motion.section>
      </AnimatePresence>
    </div>
  );
}
