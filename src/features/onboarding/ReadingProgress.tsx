import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, Loader2 } from "lucide-react";
import { Mascot } from "@/components/Mascot";
import { ProgressBar } from "@/components/Progress";
import { spring } from "@/lib/motion";
import { cn } from "@/lib/utils";

/** Estado da leitura do edital (evento `plannerEvent` do Rust; a etapa 1 é do próprio front). */
export type Reading = { step: number; text: string; progress: number | null; found: string[] };

const STEPS = ["Ler o PDF", "Achar o conteúdo programático", "Separar matérias e tópicos", "Revisar e juntar repetidas"];

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/**
 * Leitura do edital passo a passo, com relógio correndo, estimativa de quanto falta (pela média
 * das partes já lidas) e as matérias aparecendo na hora: quem nunca usou IA local não acha que
 * travou (uma parte no Ollama leva 30–60 s).
 */
export function ReadingProgress({ reading }: { reading: Reading }) {
  const started = useRef(Date.now());
  const partsStarted = useRef<number | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  if (reading.step === 3 && reading.progress !== null && partsStarted.current === null) partsStarted.current = Date.now();

  const elapsed = (now - started.current) / 1000;
  // falta ≈ tempo por parte já lida × partes que faltam
  const p = reading.progress ?? 0;
  const eta = reading.step === 3 && partsStarted.current && p > 0 && p < 1 ? ((now - partsStarted.current) / 1000 / p) * (1 - p) : null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring.soft}
      className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-soft"
      aria-live="polite"
    >
      <div className="flex items-start gap-4">
        <motion.div className="shrink-0" animate={{ y: [0, -4, 0], rotate: [0, -3, 0, 3, 0] }} transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}>
          <Mascot look="cap" scale={4} />
        </motion.div>
        <div className="min-w-0 flex-1 space-y-2">
          <ol className="space-y-1">
            {STEPS.map((label, i) => {
              const n = i + 1;
              const done = n < reading.step;
              const current = n === reading.step;
              return (
                <li key={label} className={cn("flex items-center gap-2 text-sm", done ? "text-muted-foreground" : current ? "font-medium" : "text-muted-foreground/60")}>
                  <span className={cn("grid size-5 shrink-0 place-items-center rounded-full border", done ? "border-success bg-success text-white" : current ? "border-primary text-primary" : "border-border")}>
                    {done ? <Check className="size-3" strokeWidth={3} /> : current ? <Loader2 className="size-3 animate-spin" /> : <span className="text-[10px]">{n}</span>}
                  </span>
                  {label}
                </li>
              );
            })}
          </ol>
        </div>
        <div className="shrink-0 text-right">
          <p className="retro tabular text-sm text-primary">{mmss(elapsed)}</p>
          {eta !== null && <p className="text-xs text-muted-foreground">falta ~{mmss(eta)}</p>}
        </div>
      </div>

      <div className="space-y-1.5">
        <p className="text-sm text-muted-foreground">{reading.text}</p>
        {reading.progress !== null && <ProgressBar value={reading.progress} className="h-2" />}
      </div>

      {reading.found.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Matérias encontradas até agora ({reading.found.length})</p>
          <ul className="flex flex-wrap gap-1.5">
            <AnimatePresence initial={false}>
              {reading.found.map((name) => (
                <motion.li
                  key={name}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={spring.bouncy}
                  className="rounded-full bg-secondary px-2.5 py-1 text-xs"
                >
                  {name}
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </div>
      )}
    </motion.section>
  );
}
