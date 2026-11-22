import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { BookX, Check, ChevronDown, Flag, Layers, Loader2, Play, Swords, X } from "lucide-react";
import { Chip } from "@/components/fields";
import { Skeleton } from "@/components/motion";
import { toast, toastError } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { commands, type ErrorEntry_Serialize as ErrorEntry } from "@/lib/bindings";
import { isoDay } from "@/lib/dates";
import { plural, shortDate } from "@/lib/format";
import { itemIn, listIn } from "@/lib/motion";
import { ERROR_EXIT_STREAK, ERROR_INTERVALS_TEXT } from "@/lib/rules";
import { cn } from "@/lib/utils";
import { answerLabel, LETTERS, parseOptions, questionToCard, REPORT_HINT, reportQuestion } from "./question";
import { startKey, type Start } from "./shared";

/** Caderno de erros navegável: o que você errou, quando volta, gabarito e comentário. */
export function ErrorsTab({ start, starting, onChange }: { start: Start; starting: string | null; onChange: () => void }) {
  const [items, setItems] = useState<ErrorEntry[] | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [subject, setSubject] = useState<string | null>(null);
  const today = isoDay(new Date());

  const load = useCallback(() => void commands.errorList().then(setItems, toastError), []);
  useEffect(load, [load]);

  const subjects = useMemo(() => {
    const m = new Map<string, { color: string; n: number }>();
    for (const e of items ?? []) m.set(e.subject, { color: e.color, n: (m.get(e.subject)?.n ?? 0) + 1 });
    return [...m.entries()].sort((a, b) => b[1].n - a[1].n);
  }, [items]);

  if (items === null) return <div className="space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>;

  const due = items.filter((e) => e.due_at <= today).length;
  const shown = items.filter((e) => !subject || e.subject === subject);

  const drop = (e: ErrorEntry) => {
    setItems((xs) => xs && xs.filter((x) => x.question_id !== e.question_id));
    onChange();
  };

  async function mastered(e: ErrorEntry) {
    try {
      await commands.removeError(e.question_id);
      drop(e);
      toast("Tirada do caderno", "success");
    } catch (err) {
      toastError(err);
    }
  }

  async function report(e: ErrorEntry) {
    if (await reportQuestion(e.question_id)) drop(e);
  }

  return (
    <div className="space-y-5">
      <section className="flex flex-wrap items-center gap-5 rounded-2xl border border-border bg-card p-5">
        <BookX className="size-8 text-destructive" />
        <div className="min-w-48 flex-1">
          <p className="text-lg font-semibold">{due ? `${plural(due, "questão volta", "questões voltam")} hoje` : items.length ? "Nada vencido hoje" : "Caderno limpo"}</p>
          <p className="text-sm text-muted-foreground">
            {plural(items.length, "questão", "questões")} no caderno. Cada erro volta em {ERROR_INTERVALS_TEXT} e sai quando você acerta {ERROR_EXIT_STREAK} vezes seguidas.
          </p>
        </div>
        <Button size="lg" disabled={!due || !!starting} onClick={() => void start("erros")}>
          <Play /> {due === 1 ? "Revisar a vencida" : due ? `Revisar as ${due} vencidas` : "Revisar as vencidas"}
        </Button>
      </section>

      {items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          As questões que você errar nas sessões aparecem aqui, com o gabarito comentado e a data em que voltam.
        </p>
      ) : (
        <>
          {subjects.length > 1 && (
            <div className="flex flex-wrap gap-2">
              <Chip on={subject === null} onClick={() => setSubject(null)}>
                Todas <span className="opacity-60">{items.length}</span>
              </Chip>
              {subjects.map(([name, s]) => (
                <Chip key={name} on={subject === name} onClick={() => setSubject(name)}>
                  <span className="size-2 rounded-full" style={{ background: s.color }} /> {name} <span className="opacity-60">{s.n}</span>
                </Chip>
              ))}
            </div>
          )}

          <motion.ul variants={listIn} initial="hidden" animate="show" className="space-y-2">
              {shown.map((e) => {
                const isOpen = open === e.question_id;
                const options = parseOptions(e.options);
                const late = e.due_at <= today;
                return (
                  <motion.li key={e.question_id} variants={itemIn} className="overflow-hidden rounded-xl border border-border bg-card">
                    <button className="flex w-full items-start gap-3 p-3.5 text-left" onClick={() => setOpen(isOpen ? null : e.question_id)} aria-expanded={isOpen}>
                      <span className="mt-1.5 size-2 shrink-0 rounded-full" style={{ background: e.color }} />
                      <span className="min-w-0 flex-1 space-y-1">
                        <span className={cn("block text-sm", !isOpen && "line-clamp-2")}>{e.statement}</span>
                        <span className="flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                          <span>
                            {e.subject} · {e.topic}
                          </span>
                          {e.banca && <span>· {e.banca}</span>}
                          <span>· errou {e.misses}×</span>
                        </span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-1">
                        <span className={cn("text-xs font-medium", late ? "text-destructive" : "text-muted-foreground")}>{late ? "hoje" : shortDate(e.due_at)}</span>
                        <span className="flex gap-0.5" title={`${e.streak} de ${ERROR_EXIT_STREAK} acertos seguidos`} aria-label={`${e.streak} de ${ERROR_EXIT_STREAK} acertos seguidos`}>
                          {Array.from({ length: ERROR_EXIT_STREAK }, (_, i) => (
                            <span key={i} className={cn("size-1.5 rounded-full", i < e.streak ? "bg-success" : "bg-secondary")} />
                          ))}
                        </span>
                      </span>
                      <ChevronDown className={cn("mt-1 size-4 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
                    </button>

                    <AnimatePresence initial={false}>
                      {isOpen && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                          <div className="space-y-3 border-t border-border/60 px-3.5 py-3 pl-8">
                            {e.format === "ce" ? (
                              <p className="text-sm">
                                Gabarito: <strong className="text-success">{answerLabel(e.answer)}</strong>
                                {e.last_answer && e.last_answer !== e.answer && (
                                  <>
                                    {" "}
                                    · você marcou <strong className="text-destructive">{answerLabel(e.last_answer)}</strong>
                                  </>
                                )}
                              </p>
                            ) : (
                              <ul className="space-y-1">
                                {options.map((o, i) => {
                                  const l = LETTERS[i];
                                  const right = l === e.answer;
                                  const mine = l === e.last_answer && !right;
                                  return (
                                    <li key={l} className={cn("flex gap-2 rounded-lg px-2 py-1 text-sm", right && "bg-success/10", mine && "bg-destructive/10")}>
                                      <span className={cn("w-4 font-semibold", right ? "text-success" : mine ? "text-destructive" : "text-muted-foreground")}>{l}</span>
                                      <span className="flex-1">{o}</span>
                                      {right && <Check className="size-4 shrink-0 text-success" />}
                                      {mine && <X className="size-4 shrink-0 text-destructive" />}
                                    </li>
                                  );
                                })}
                              </ul>
                            )}
                            <p className="rounded-lg bg-secondary/50 p-3 text-sm leading-relaxed whitespace-pre-line">{e.explanation}</p>
                            <div className="flex flex-wrap gap-2">
                              <Button size="sm" variant="secondary" disabled={!!starting} onClick={() => void start("topico", { topic: e.topic_id, n: 10 })}>
                                {starting === startKey("topico", { topic: e.topic_id }) ? <Loader2 className="animate-spin" /> : <Swords />} Treinar o tópico
                              </Button>
                              <Button size="sm" variant="secondary" onClick={() => void questionToCard(e.question_id)}>
                                <Layers /> Virar flashcard
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => void mastered(e)}>
                                <Check /> Já domino
                              </Button>
                              <span className="flex-1" />
                              <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => void report(e)} title={REPORT_HINT}>
                                <Flag /> Questão com problema
                              </Button>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.li>
                );
              })}
          </motion.ul>
        </>
      )}
    </div>
  );
}

