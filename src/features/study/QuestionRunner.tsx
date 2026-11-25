import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useAnimationControls } from "motion/react";
import { ArrowRight, BookOpenText, Check, Coffee, Flag, Layers, Lightbulb, Loader2, Pause, Play, Timer, X } from "lucide-react";
import { celebrateLevel } from "@/components/LevelUp";
import { Mascot } from "@/components/Mascot";
import { Skeleton, XpBurst } from "@/components/motion";
import { ProgressBar } from "@/components/Progress";
import { toast, toastError } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { PAPER_DESK, paperDocument } from "@/features/material/paper";
import { commands, events, type AnswerResult, type QuestionView, type SessionInfo, type SessionReport } from "@/lib/bindings";
import { useKey, useTauriEvent } from "@/lib/hooks";
import { breathe, spring } from "@/lib/motion";
import { sfx } from "@/lib/sound";
import { clock, useTimer, type TimerView } from "@/lib/timer";
import { cn, warn } from "@/lib/utils";
import { answerLabel, LETTERS, questionToCard, REPORT_HINT, reportQuestion } from "./question";

/** Markdown da IA como texto puro (nada de HTML da IA na janela principal). */
function plain(md: string) {
  return md
    .replace(/^#+\s*/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/(^|\s)[*_](.+?)[*_]/g, "$1$2")
    .replace(/^>\s?/gm, "")
    .replace(/`/g, "");
}

type Done = { q: QuestionView; chosen: string; result: AnswerResult };

export function QuestionRunner({ session, onFinish }: { session: SessionInfo; onFinish: (r: SessionReport) => void }) {
  const exam = session.kind === "simulado";
  const [q, setQ] = useState<QuestionView | null>(null);
  const [loading, setLoading] = useState<string | null>("Separando as questões…");
  const [chosen, setChosen] = useState<string | null>(null);
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [explain, setExplain] = useState<string | null>(null);
  const [explaining, setExplaining] = useState(false);
  const [burst, setBurst] = useState(0);
  const [split, setSplit] = useState(false);
  const [history, setHistory] = useState<Done[]>([]);
  const [timeLeft, setTimeLeft] = useState(session.time_limit_min ? session.time_limit_min * 60 : null);
  const started = useRef(Date.now());
  /** Só mostra "gerando…" enquanto espera a próxima (a pré-geração em segundo plano também avisa). */
  const waiting = useRef(true);
  const card = useAnimationControls();
  const [timer, setTimer] = useTimer();

  useTauriEvent(events.studyEvent, (e) => {
    if (waiting.current) setLoading(e.text);
  });

  const finish = useCallback(async () => {
    try {
      const report = await commands.finishSession(session.id);
      onFinish(report);
      // versão Cloud: vira card no mural se a pessoa compartilha os estudos (carregado só aqui)
      void import("@/features/community/share").then((m) => m.shareSession(report)).catch((e) => warn("publicar a sessão no mural", e));
    } catch (e) {
      toastError(e);
    }
  }, [onFinish, session.id]);

  const fetching = useRef(false);
  const next = useCallback(async () => {
    if (fetching.current) return;
    fetching.current = true;
    waiting.current = true;
    setLoading((l) => l ?? "Buscando a próxima…");
    setChosen(null);
    setResult(null);
    setExplain(null);
    try {
      const nq = await commands.nextQuestion(session.id);
      if (!nq) return void finish();
      setQ(nq);
      started.current = Date.now();
    } catch (e) {
      toastError(e);
    } finally {
      fetching.current = false;
      waiting.current = false;
      setLoading(null);
    }
  }, [session.id, finish]);

  // Busca a primeira questão uma vez só: cada chamada consome uma vaga da sessão no backend.
  const booted = useRef(false);
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    void next();
  }, [next]);

  // Simulado: relógio da prova; ao zerar, entrega.
  useEffect(() => {
    if (timeLeft === null) return;
    if (timeLeft <= 0) {
      toast("Tempo esgotado: prova entregue", "info");
      void finish();
      return;
    }
    const id = setTimeout(() => setTimeLeft((t) => (t === null ? t : t - 1)), 1000);
    return () => clearTimeout(id);
  }, [timeLeft, finish]);

  async function choose(answer: string) {
    if (!q || result || chosen) return;
    setChosen(answer);
    try {
      const r = await commands.answerQuestion(session.id, q.id, answer, Math.round((Date.now() - started.current) / 1000));
      setHistory((h) => [...h, { q, chosen: answer, result: r }]);
      if (exam) {
        sfx("nav");
        return void next(); // simulado: gabarito só no fim
      }
      setResult(r);
      if (r.correct) {
        sfx("coin");
        setBurst((b) => b + 1);
        void card.start({ scale: [1, 1.015, 1], transition: { duration: 0.35 } });
      } else {
        sfx("error");
        void card.start({ x: [0, -10, 9, -6, 4, 0], transition: { duration: 0.4 } });
      }
      if (r.mission_xp > 0) toast(`Missão concluída! +${r.mission_xp} XP`, "success");
      if (r.level_up) celebrateLevel(r.level_up);
    } catch (e) {
      setChosen(null);
      toastError(e);
    }
  }

  async function report() {
    if (q && (await reportQuestion(q.id))) void next();
  }

  async function explainMore() {
    if (!q || !chosen) return;
    setExplaining(true);
    try {
      setExplain(await commands.explainQuestion(q.id, chosen));
    } catch (e) {
      toastError(e);
    } finally {
      setExplaining(false);
    }
  }

  // Teclado: letras/C/E escolhem, Enter avança, M abre o material.
  useKey((e) => {
    const k = e.key.toUpperCase();
    if (k === "M") return setSplit((s) => !s);
    if (!q) return;
    if (result && !loading && (e.key === "Enter" || e.key === "ArrowRight")) return void next();
    if (result) return;
    if (q.format === "ce" && (k === "C" || k === "E")) return void choose(k);
    const i = LETTERS.indexOf(k);
    if (q.format === "ae" && i >= 0 && i < q.options.length) void choose(k);
  });

  const onBreak = timer.mode === "pomodoro" && timer.phase === "break" && !timer.paused;
  const answered = history.length;
  const hits = history.filter((h) => h.result.correct).length;

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col gap-4">
      <header className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-48 flex-1 items-center gap-3">
          <span className="tabular text-sm font-semibold">
            {q?.position ?? Math.min(answered + 1, session.planned)}/{session.planned}
          </span>
          <ProgressBar value={answered / session.planned} className="flex-1" label="Questões respondidas" />
          {!exam && answered > 0 && (
            <span className="tabular text-xs text-muted-foreground">
              {hits} ✓ · {answered - hits} ✗
            </span>
          )}
        </div>
        {timeLeft !== null && (
          <span className={cn("tabular flex items-center gap-1.5 rounded-lg bg-secondary px-2.5 py-1 text-sm font-semibold", timeLeft < 300 && "text-destructive")}>
            <Timer className="size-4" /> {clock(timeLeft)}
          </span>
        )}
        <PomodoroChip t={timer} setT={setTimer} />
        <Button size="sm" variant={split ? "default" : "ghost"} onClick={() => setSplit((s) => !s)} title="Abrir o material ao lado (M)">
          <BookOpenText /> Material
        </Button>
        <Button size="sm" variant="ghost" onClick={() => void finish()}>
          {exam ? "Entregar prova" : "Encerrar"}
        </Button>
      </header>

      <SplitPane open={split && !!q} right={q ? <MaterialPreview topicId={q.topic_id} topic={q.topic} /> : null}>
        <div className="relative h-full overflow-y-auto pr-1">
          <AnimatePresence mode="wait">
            {loading || !q ? (
              <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex h-full flex-col items-center justify-center gap-4 text-center">
                <motion.div {...breathe}>
                  <Mascot scale={5} />
                </motion.div>
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" /> {loading ?? "Carregando…"}
                </p>
                <p className="max-w-sm text-xs text-muted-foreground">Questões novas são geradas uma vez e ficam guardadas: da próxima vez abre na hora.</p>
              </motion.div>
            ) : (
              <motion.article
                key={q.id}
                initial={{ opacity: 0, y: 14, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, x: -24, transition: { duration: 0.14 } }}
                transition={spring.soft}
                className="mx-auto max-w-3xl space-y-4 pb-6"
              >
                <motion.div animate={card} className="relative space-y-4 rounded-2xl border border-border bg-card p-6 shadow-soft">
                  {burst > 0 && result?.correct && <XpBurst key={burst} amount={result.xp_gained} />}
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="size-2 rounded-full" style={{ background: q.color }} />
                    <span className="font-medium text-foreground">{q.subject}</span>
                    <span>· {q.topic}</span>
                    {q.banca && <span className="rounded bg-secondary px-1.5 py-0.5">{q.banca}</span>}
                    {q.difficulty && <span className="rounded bg-secondary px-1.5 py-0.5">{q.difficulty}</span>}
                    {q.from_errors && <span className="rounded bg-destructive/15 px-1.5 py-0.5 text-destructive">caderno de erros</span>}
                  </div>
                  <p className="text-[17px] leading-relaxed whitespace-pre-line">{q.statement}</p>

                  {q.format === "ce" ? (
                    <div className="grid grid-cols-2 gap-3">
                      {["C", "E"].map((k) => (
                        <Option key={k} letter={k} text={answerLabel(k)} chosen={chosen} result={result} onPick={() => void choose(k)} />
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {q.options.map((o, i) => (
                        <Option key={i} letter={LETTERS[i]} text={o} chosen={chosen} result={result} onPick={() => void choose(LETTERS[i])} />
                      ))}
                    </div>
                  )}
                  {!result && <p className="text-xs text-muted-foreground">Teclado: {q.format === "ce" ? "C ou E" : `A–${LETTERS[q.options.length - 1]}`} para responder · M abre o material</p>}
                </motion.div>

                <AnimatePresence>
                  {result && (
                    <motion.section
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={spring.soft}
                      className={cn("space-y-3 rounded-2xl border p-5", result.correct ? "border-success/40 bg-success/10" : "border-destructive/40 bg-destructive/10")}
                    >
                      <p className={cn("flex items-center gap-2 font-semibold", result.correct ? "text-success" : "text-destructive")}>
                        {result.correct ? <Check className="size-5" /> : <X className="size-5" />}
                        {result.correct ? `Acertou! +${result.xp_gained} XP` : `Gabarito: ${answerLabel(result.answer)}`}
                      </p>
                      <p className="text-sm leading-relaxed whitespace-pre-line">{result.explanation}</p>
                      {explain && <p className="rounded-xl bg-card p-4 text-sm leading-relaxed whitespace-pre-line">{plain(explain)}</p>}
                      <div className="flex flex-wrap gap-2">
                        {!explain && (
                          <Button size="sm" variant="secondary" disabled={explaining} onClick={() => void explainMore()}>
                            {explaining ? <Loader2 className="animate-spin" /> : <Lightbulb />} Explicar melhor
                          </Button>
                        )}
                        {!result.correct && (
                          <Button size="sm" variant="secondary" onClick={() => void questionToCard(q.id)}>
                            <Layers /> Virar flashcard
                          </Button>
                        )}
                        <span className="flex-1" />
                        <Button size="sm" variant="ghost" className="text-muted-foreground" title={REPORT_HINT} onClick={() => void report()}>
                          <Flag /> Problema
                        </Button>
                        <Button onClick={() => void next()}>
                          Próxima <ArrowRight /> <kbd className="ml-1 text-[10px] opacity-60">Enter</kbd>
                        </Button>
                      </div>
                    </motion.section>
                  )}
                </AnimatePresence>
              </motion.article>
            )}
          </AnimatePresence>

          {/* Pausa do pomodoro: a sessão espera. */}
          <AnimatePresence>
            {onBreak && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-10 grid place-items-center rounded-2xl bg-background/85 backdrop-blur-sm">
                <div className="space-y-3 text-center">
                  <Coffee className="mx-auto size-10 text-success" />
                  <p className="text-lg font-semibold">Pausa do pomodoro</p>
                  <p className="retro tabular text-3xl text-success">{clock(timer.mode === "pomodoro" ? timer.remaining : 0)}</p>
                  <p className="text-sm text-muted-foreground">Levanta, bebe água. As questões te esperam.</p>
                  <Button variant="ghost" onClick={() => void commands.stopTimer().then(setTimer, toastError)}>
                    Pular a pausa
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </SplitPane>
    </div>
  );
}

function Option({ letter, text, chosen, result, onPick }: { letter: string; text: string; chosen: string | null; result: AnswerResult | null; onPick: () => void }) {
  const isRight = result && result.answer === letter;
  const isWrongPick = result && chosen === letter && !result.correct;
  return (
    <motion.button
      type="button"
      whileHover={result ? undefined : { x: 3 }}
      whileTap={result ? undefined : { scale: 0.99 }}
      disabled={!!result || !!chosen}
      onClick={onPick}
      className={cn(
        "flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors",
        !result && "border-border hover:border-primary/60 hover:bg-secondary/50",
        isRight && "border-success bg-success/15",
        isWrongPick && "border-destructive bg-destructive/15",
        result && !isRight && !isWrongPick && "border-border opacity-60",
        chosen === letter && !result && "border-primary bg-primary/10",
      )}
    >
      <span
        className={cn(
          "grid size-7 shrink-0 place-items-center rounded-lg text-xs font-bold",
          isRight ? "bg-success text-white" : isWrongPick ? "bg-destructive text-white" : "bg-secondary",
        )}
      >
        {letter}
      </span>
      <span className="pt-0.5 text-[15px] leading-snug">{text}</span>
    </motion.button>
  );
}

/** Pomodoro junto da sessão: inicia, pausa e mostra o tempo. */
function PomodoroChip({ t, setT }: { t: TimerView; setT: (t: TimerView) => void }) {
  const act = (fn: () => Promise<TimerView>) => void fn().then(setT, toastError);
  if (t.mode === "idle") {
    return (
      <Button size="sm" variant="ghost" onClick={() => act(() => commands.startPomodoro(null))} title="Começar um pomodoro junto">
        <Timer /> Pomodoro
      </Button>
    );
  }
  const secs = t.mode === "pomodoro" ? t.remaining : t.elapsed;
  return (
    <button onClick={() => act(commands.togglePause)} className="tabular flex items-center gap-1.5 rounded-lg bg-secondary px-2.5 py-1 text-sm" title={t.paused ? "Continuar" : "Pausar"}>
      {t.paused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
      <span className={cn(t.mode === "pomodoro" && t.phase === "break" && "text-success")}>{clock(secs)}</span>
    </button>
  );
}

/** Dois painéis com divisor arrastável (proporção lembrada na sessão). */
function SplitPane({ open, right, children }: { open: boolean; right: ReactNode; children: ReactNode }) {
  const [pct, setPct] = useState(55);
  const box = useRef<HTMLDivElement>(null);
  function drag(e: React.PointerEvent) {
    const el = box.current;
    if (!el) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const r = el.getBoundingClientRect();
      setPct(Math.min(75, Math.max(30, ((ev.clientX - r.left) / r.width) * 100)));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }
  return (
    <div ref={box} className="flex min-h-0 flex-1">
      <div className="min-w-0" style={{ width: open ? `${pct}%` : "100%" }}>
        {children}
      </div>
      {open && (
        <>
          <div role="separator" aria-orientation="vertical" onPointerDown={drag} className="mx-1.5 w-1.5 shrink-0 cursor-col-resize rounded-full bg-border transition-colors hover:bg-primary" />
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={spring.soft} className="min-w-0 flex-1 overflow-hidden rounded-2xl border border-border">
            {right}
          </motion.div>
        </>
      )}
    </div>
  );
}

/** Material do tópico ao lado das questões (o mais recente que não seja flashcard). */
function MaterialPreview({ topicId, topic }: { topicId: number; topic: string }) {
  const [doc, setDoc] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setDoc(undefined);
    const list = (await commands.listMaterials(topicId)).filter((m) => m.kind !== "flashcards");
    const pick = list.find((m) => m.kind === "resumo") ?? list[0];
    if (!pick) return setDoc(null);
    const v = await commands.materialView(pick.id);
    setDoc(v.html ?? (v.markdown ? paperDocument(v.markdown, topic) : null));
  }, [topicId, topic]);
  useEffect(
    () =>
      void load().catch((e) => {
        warn("material ao lado das questões", e);
        setDoc(null);
      }),
    [load],
  );

  async function quick() {
    setBusy(true);
    try {
      await commands.generateMaterial(topicId, "resumo", false);
      await load();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  }

  if (doc === undefined) return <Skeleton className="h-full" />;
  if (doc === null)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-card p-6 text-center">
        <p className="text-sm text-muted-foreground">Ainda não tem material de “{topic}”.</p>
        <Button disabled={busy} onClick={() => void quick()}>
          {busy && <Loader2 className="animate-spin" />} Gerar resumo rápido
        </Button>
      </div>
    );
  return <iframe title={`Material de ${topic}`} sandbox="" srcDoc={doc} className="size-full border-0" style={{ background: PAPER_DESK }} />;
}
