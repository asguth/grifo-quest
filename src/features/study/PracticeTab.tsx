import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, Crosshair, Hourglass, Loader2, Play, Swords } from "lucide-react";
import { NativeSelect } from "@/components/fields";
import { Skeleton } from "@/components/motion";
import { toastError } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { commands, type Subject, type Topic } from "@/lib/bindings";
import { itemIn, listIn } from "@/lib/motion";
import { REFORCO_SIZE } from "@/lib/rules";
import { cn } from "@/lib/utils";
import { NoTopics, startKey, type Start } from "./shared";

const SIZES = [10, 15, 20, 30];

function Count({ value, onChange, label, options = SIZES }: { value: number; onChange: (n: number) => void; label: string; options?: number[] }) {
  return (
    <NativeSelect value={value} onChange={(e) => onChange(Number(e.target.value))} className="h-8 w-auto" aria-label={label}>
      {options.map((n) => (
        <option key={n} value={n}>
          {n} questões
        </option>
      ))}
    </NativeSelect>
  );
}

/** Treino livre: por matéria ou tópico, reforço e simulado. */
export function PracticeTab({ starting, start, hasTopics, onImported }: { starting: string | null; start: Start; hasTopics: boolean; onImported: () => void }) {
  const [subjects, setSubjects] = useState<Subject[] | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [n, setN] = useState(15);
  const [simN, setSimN] = useState(30);

  const load = () => void commands.listSubjects().then(setSubjects, toastError);
  useEffect(load, []);

  if (!hasTopics) return <NoTopics onImported={() => (onImported(), load())} text="Monte o edital para treinar por matéria, por tópico ou fazer simulados." />;

  return (
    <div className="grid items-start gap-4 @4xl:grid-cols-[1.5fr_1fr]">
      <section className="space-y-3 rounded-2xl border border-border bg-card p-5">
        <header className="flex flex-wrap items-center gap-2">
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold">Treinar por matéria</h2>
            <p className="text-xs text-muted-foreground">A matéria inteira puxa os tópicos em que você mais erra. Abra para escolher um tópico.</p>
          </div>
          <Count value={n} onChange={setN} label="Questões por treino" />
        </header>
        {subjects === null ? (
          <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 rounded-xl" />)}</div>
        ) : (
          <motion.ul variants={listIn} initial="hidden" animate="show" className="space-y-1">
            {subjects.map((s) => (
              <motion.li key={s.id} variants={itemIn} className="rounded-xl border border-transparent hover:border-border">
                <div className="flex items-center gap-3 px-2 py-2">
                  <button
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    onClick={() => setOpen(open === s.id ? null : s.id)}
                    aria-expanded={open === s.id}
                  >
                    <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open === s.id && "rotate-180")} />
                    <span className="size-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{s.name}</span>
                      <span className="block text-[11px] text-muted-foreground">
                        {s.topic_count} tópicos · peso {s.exam_weight ?? 1} · edital {Math.round((s.progress ?? 0) * 100)}%
                      </span>
                    </span>
                  </button>
                  <Button size="sm" variant="secondary" disabled={!!starting || s.topic_count === 0} onClick={() => void start("topico", { subject: s.id, n })}>
                    {starting === startKey("topico", { subject: s.id }) ? <Loader2 className="animate-spin" /> : <Play />} Treinar
                  </Button>
                </div>
                <AnimatePresence initial={false}>
                  {open === s.id && <Topics subjectId={s.id} starting={starting} onTrain={(t) => void start("topico", { topic: t, n: Math.min(n, 10) })} />}
                </AnimatePresence>
              </motion.li>
            ))}
          </motion.ul>
        )}
      </section>

      <div className="grid content-start gap-4">
        <section className="space-y-3 rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center gap-2">
            <Crosshair className="size-5 text-destructive" />
            <h2 className="flex-1 font-semibold">Reforço</h2>
          </div>
          <p className="text-sm text-muted-foreground">{REFORCO_SIZE} questões dos seus tópicos mais fracos, metade do caderno de erros vencido.</p>
          <Button variant="secondary" disabled={!!starting} onClick={() => void start("reforco")}>
            <Swords /> Começar reforço
          </Button>
        </section>

        <section className="space-y-3 rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center gap-2">
            <Hourglass className="size-5 text-primary" />
            <h2 className="flex-1 font-semibold">Simulado</h2>
          </div>
          <p className="text-sm text-muted-foreground">Prova cronometrada (~3 min por questão), distribuída pelo peso das matérias. Gabarito só no fim, como no dia.</p>
          <div className="flex items-center gap-2">
            <Count value={simN} onChange={setSimN} label="Questões do simulado" options={[10, 20, 30, 50, 80, 120]} />
            <Button disabled={!!starting} onClick={() => void start("simulado", { n: simN })}>
              {starting === startKey("simulado") ? <Loader2 className="animate-spin" /> : <Play />} Iniciar
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {simN} questões · {Math.round((simN * 3) / 60 * 10) / 10} h de prova
          </p>
        </section>
      </div>
    </div>
  );
}

function Topics({ subjectId, starting, onTrain }: { subjectId: number; starting: string | null; onTrain: (topicId: number) => void }) {
  const [topics, setTopics] = useState<Topic[] | null>(null);
  useEffect(() => void commands.listTopics(subjectId).then(setTopics, toastError), [subjectId]);
  return (
    <motion.ul initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden pl-9">
      {topics === null && (
        <li>
          <Skeleton className="my-2 h-8 rounded-lg" />
        </li>
      )}
      {topics?.length === 0 && <li className="py-2 text-xs text-muted-foreground">Sem tópicos nesta matéria.</li>}
      {topics?.map((t) => (
        <li key={t.id} className="group flex items-center gap-2 border-t border-border/50 py-1.5 pr-2">
          <span className={cn("min-w-0 flex-1 truncate text-sm", t.practice && "text-muted-foreground")}>{t.name}</span>
          {t.practice && <span className="text-[10px] text-success">questões ✓</span>}
          <Button size="sm" variant="ghost" className="h-7 opacity-60 group-hover:opacity-100" disabled={!!starting} onClick={() => onTrain(t.id)}>
            {starting === startKey("topico", { topic: t.id }) ? <Loader2 className="animate-spin" /> : <Play />} Treinar
          </Button>
        </li>
      ))}
    </motion.ul>
  );
}
