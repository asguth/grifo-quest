import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Maximize2, Minimize2, Pause, Play, Settings2, SkipForward, Square } from "lucide-react";
import { NativeSelect } from "@/components/fields";
import { Mascot } from "@/components/Mascot";
import { Segmented } from "@/components/Segmented";
import { toastError } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { requestSettingsTab } from "@/features/settings/tabRequest";
import { commands, type PomodoroToday, type Subject, type TimerKind } from "@/lib/bindings";
import { emit } from "@/lib/bus";
import { spring } from "@/lib/motion";
import { usePomodoroView, type PomodoroView } from "@/lib/pomodoro";
import { sfx } from "@/lib/sound";
import { clock, timerFraction, timerLabel, timerSeconds, useTimer, type TimerView } from "@/lib/timer";
import { cn } from "@/lib/utils";
import { PixelRing } from "./PixelRing";

type Mode = "pomodoro" | "stopwatch";

/** Rótulo e frase da fase atual. */
function phaseText(t: TimerView): { badge: string; line: string } {
  if (t.mode === "idle") return { badge: "POMODORO", line: "pronto para começar" };
  if (t.mode === "stopwatch") return { badge: t.paused ? "PAUSADO" : timerLabel(t).toUpperCase(), line: timerLabel(t).toLowerCase() };
  const onBreak = t.phase === "break";
  if (t.waiting) return { badge: onBreak ? "PAUSA" : "FOCO", line: onBreak ? "a pausa espera você: toque em Continuar" : "próximo foco esperando você" };
  if (t.paused) return { badge: "PAUSADO", line: "tempo congelado" };
  if (onBreak) return { badge: t.long_break ? "PAUSA LONGA" : "PAUSA", line: t.long_break ? "pausa longa: sai da tela, caminha" : "levanta, água, alonga" };
  return { badge: "FOCO", line: "foco total" };
}

/** O relógio no visual escolhido em Configurações → Pomodoro. */
function Clock({ t, layout, big }: { t: TimerView; layout: PomodoroView["layout"]; big?: boolean }) {
  const onBreak = t.mode === "pomodoro" && t.phase === "break";
  const paused = t.mode !== "idle" && t.paused;
  const tone = onBreak ? (t.mode === "pomodoro" && t.long_break ? "#0ea5e9" : "var(--accent)") : "var(--primary)";
  const text = phaseText(t);
  const frac = timerFraction(t);
  const digits = clock(timerSeconds(t));
  const color = onBreak ? "text-success" : "text-primary";
  const badge = (
    <span className={cn("retro rounded-full px-2.5 py-1 text-[9px]", onBreak ? "bg-success/15 text-success" : "bg-primary/15 text-primary")}>{text.badge}</span>
  );

  if (layout === "pixel") {
    return (
      <PixelRing value={frac} tone={tone} paused={paused} size={big ? 380 : 260}>
        <span className="mb-2">{badge}</span>
        <p className={cn("retro tabular", big ? "text-6xl" : "text-4xl", color, paused && "animate-pulse")}>{digits}</p>
        <p className="mt-2 text-xs text-muted-foreground">{text.line}</p>
      </PixelRing>
    );
  }
  if (layout === "anel") {
    const size = big ? 380 : 260;
    const r = 45;
    const c = 2 * Math.PI * r;
    return (
      <div className="relative grid place-items-center" style={{ width: size, height: size }}>
        <svg viewBox="0 0 100 100" className="absolute inset-0 size-full -rotate-90" aria-hidden>
          <circle cx="50" cy="50" r={r} fill="none" stroke="var(--border)" strokeWidth="4" />
          <motion.circle
            cx="50"
            cy="50"
            r={r}
            fill="none"
            stroke={tone}
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={c}
            animate={{ strokeDashoffset: c * (1 - frac) }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            style={{ filter: `drop-shadow(0 0 6px ${tone})` }}
          />
        </svg>
        <div className="flex flex-col items-center">
          <span className="mb-2">{badge}</span>
          <p className={cn("tabular font-semibold tracking-tight", big ? "text-7xl" : "text-5xl", paused && "animate-pulse")}>{digits}</p>
          <p className="mt-2 text-xs text-muted-foreground">{text.line}</p>
        </div>
      </div>
    );
  }
  if (layout === "digital") {
    return (
      <div className={cn("flex flex-col items-center gap-4", big ? "w-[min(80vw,720px)]" : "w-[min(90%,480px)]")}>
        {badge}
        <p className={cn("retro tabular leading-none", big ? "text-8xl" : "text-6xl", color, paused && "animate-pulse")}>{digits}</p>
        <div className="h-3 w-full overflow-hidden rounded-full bg-secondary">
          <motion.div className="h-full rounded-full" style={{ background: tone }} animate={{ width: `${Math.round(frac * 100)}%` }} transition={{ duration: 0.8 }} />
        </div>
        <p className="text-xs text-muted-foreground">{text.line}</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-1 py-6">
      <p className={cn("tabular font-extralight tracking-tight", big ? "text-9xl" : "text-7xl", paused && "opacity-60")}>{digits}</p>
      <p className="text-xs tracking-widest text-muted-foreground uppercase">{text.badge.toLowerCase()}</p>
    </div>
  );
}

/** Bolinhas até a pausa longa: cheias = focos feitos neste ciclo. */
function CycleDots({ t }: { t: TimerView }) {
  if (t.mode !== "pomodoro" || t.long_every < 1) return null;
  const inCycle = t.cycle % t.long_every;
  // na pausa longa o ciclo acabou de fechar: todas cheias
  const filled = t.phase === "break" && t.long_break ? t.long_every : inCycle;
  return (
    <div className="flex items-center gap-1.5" title={`${filled} de ${t.long_every} focos até a pausa longa`}>
      {Array.from({ length: t.long_every }, (_, i) => (
        <span key={i} className={cn("size-2.5 rounded-full transition-colors", i < filled ? "bg-primary" : "bg-border", i === filled && t.phase === "focus" && !t.paused && "animate-pulse bg-primary/50")} />
      ))}
      <span className="ml-1 text-xs text-muted-foreground">pausa longa</span>
    </div>
  );
}

/** Sons e título da janela seguindo o timer (sino na troca de fase, tique-taque no foco). */
function useTimerEffects(t: TimerView, view: PomodoroView) {
  const last = useRef<string>("");
  const title = useRef(document.title);
  const phase = t.mode === "pomodoro" ? `${t.phase}-${t.cycle}` : t.mode;
  useEffect(() => {
    if (last.current && last.current !== phase && t.mode === "pomodoro" && view.endSound) sfx("bell");
    last.current = phase;
  }, [phase, t.mode, view.endSound]);
  const secs = timerSeconds(t);
  useEffect(() => {
    if (view.tick && t.mode === "pomodoro" && t.phase === "focus" && !t.paused) sfx("tick");
  }, [secs, view.tick, t]);
  useEffect(() => {
    const base = title.current;
    document.title = view.titleClock && t.mode !== "idle" ? `${clock(secs)} · ${timerLabel(t)} — Grifo Quest` : base;
  }, [secs, t, view.titleClock]);
  useEffect(() => {
    const base = title.current;
    return () => {
      document.title = base;
    };
  }, []);
}

/** Foco livre: pomodoro (ciclos, pausa longa, pular fase) ou cronômetro de estudo/trabalho. */
export default function FocusScreen() {
  const [timer, setTimer] = useTimer();
  const [view] = usePomodoroView();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [mode, setMode] = useState<Mode>("pomodoro");
  const [kind, setKind] = useState<TimerKind>("estudo");
  const [subjectId, setSubjectId] = useState<number | null>(null);
  const [today, setToday] = useState<PomodoroToday | null>(null);
  const [zen, setZen] = useState(false);
  useTimerEffects(timer, view);

  useEffect(() => {
    commands.listSubjects().then(setSubjects, toastError);
  }, []);
  const cycle = timer.mode === "pomodoro" ? timer.cycle : -1;
  useEffect(() => {
    commands.pomodoroToday().then(setToday, toastError);
  }, [cycle]);
  useEffect(() => {
    if (!zen) return;
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setZen(false);
    };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [zen]);

  async function run(action: () => Promise<TimerView>, sound: "nav" | "success" = "nav") {
    try {
      setTimer(await action());
      sfx(sound);
    } catch (e) {
      toastError(e);
    }
  }

  const start = () => run(() => (mode === "pomodoro" ? commands.startPomodoro(subjectId) : commands.startStopwatch(kind, kind === "estudo" ? subjectId : null)), "success");
  const subjectName = timer.mode !== "idle" ? subjects.find((s) => s.id === timer.subject_id)?.name : undefined;
  const showSubject = timer.mode === "idle" && (mode === "pomodoro" || kind === "estudo");
  const waiting = timer.mode === "pomodoro" && timer.waiting;

  const controls: ReactNode =
    timer.mode === "idle" ? (
      <Button size="lg" className="min-w-40" onClick={() => void start()}>
        <Play /> Iniciar
      </Button>
    ) : (
      <div className="flex flex-wrap justify-center gap-2">
        <Button size="lg" className={cn("min-w-36", waiting && "animate-pulse")} onClick={() => void run(commands.togglePause)}>
          {timer.paused ? <Play /> : <Pause />} {waiting ? (timer.mode === "pomodoro" && timer.phase === "break" ? "Começar pausa" : "Começar foco") : timer.paused ? "Continuar" : "Pausar"}
        </Button>
        {timer.mode === "pomodoro" && (
          <Button size="lg" variant="secondary" onClick={() => void run(commands.skipPhase)} title={timer.phase === "focus" ? "Pular para a pausa (o tempo estudado fica salvo)" : "Pular a pausa e voltar ao foco"}>
            <SkipForward /> {timer.phase === "focus" ? "Pular foco" : "Pular pausa"}
          </Button>
        )}
        <Button size="lg" variant="ghost" onClick={() => void run(commands.stopTimer)}>
          <Square /> Parar
        </Button>
      </div>
    );

  const goal = view.dailyGoal;
  const done = today?.done ?? 0;

  return (
    <div className="@container flex flex-col items-center gap-5">
      <div className="flex w-full items-center justify-end gap-1">
        <Button variant="ghost" size="sm" onClick={() => setZen(true)} title="Tela cheia, sem distração (Esc sai)">
          <Maximize2 /> Modo foco
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            requestSettingsTab("pomodoro");
            emit("navigate", "config");
          }}
          title="Tempos, sons e visual do pomodoro"
        >
          <Settings2 /> Ajustar
        </Button>
      </div>

      <motion.div initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={spring.soft} className="flex flex-wrap items-center justify-center gap-6">
        <Clock t={timer} layout={view.layout} />
        {view.mascot && view.layout !== "minimo" && <Grifinho t={timer} />}
      </motion.div>

      {view.cycleDots && <CycleDots t={timer} />}
      {subjectName && <p className="text-sm text-muted-foreground">{subjectName}</p>}

      {timer.mode === "idle" && (
        <>
          <Segmented label="Modo" value={mode} onChange={setMode} options={[["pomodoro", "Pomodoro"], ["stopwatch", "Cronômetro"]]} />
          {mode === "stopwatch" && <Segmented label="Tipo" value={kind} onChange={setKind} options={[["estudo", "Estudo"], ["trabalho", "Trabalho"]]} />}
          {showSubject && (
            <div className="w-full max-w-xs space-y-1">
              <Label htmlFor="focus-subject">Matéria</Label>
              <NativeSelect id="focus-subject" value={subjectId ?? ""} onChange={(e) => setSubjectId(e.target.value ? Number(e.target.value) : null)}>
                <option value="">Sem matéria</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
          )}
        </>
      )}
      {controls}

      <div className="w-full max-w-sm space-y-1.5 rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">Hoje</span>
          <span className="tabular text-muted-foreground">
            <strong className={cn(done >= goal ? "text-success" : "text-foreground")}>{done}</strong> de {goal} pomodoros · {today?.minutes ?? 0} min
          </span>
        </div>
        <div className="flex gap-1">
          {Array.from({ length: Math.max(goal, done) }, (_, i) => (
            <span key={i} className={cn("h-2 flex-1 rounded-full", i < done ? (i < goal ? "bg-primary" : "bg-success") : "bg-secondary")} />
          ))}
        </div>
        {done >= goal && <p className="text-xs text-success">Meta do dia batida! Daqui em diante é bônus.</p>}
      </div>

      <p className="max-w-sm text-center text-xs text-muted-foreground">
        Parar ou pular o foco grava o tempo estudado (a partir de 1 min). O XP de pomodoro só vem ao completar o foco.
      </p>

      <AnimatePresence>
        {zen && (
          <motion.div
            className="fixed inset-0 z-[80] flex flex-col items-center justify-center gap-8 bg-background"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <button onClick={() => setZen(false)} className="absolute top-5 right-5 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground">
              <Minimize2 className="size-4" /> Sair (Esc)
            </button>
            <Clock t={timer} layout={view.layout} big />
            {view.cycleDots && <CycleDots t={timer} />}
            {subjectName && <p className="text-muted-foreground">{subjectName}</p>}
            {controls}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Grifinho estudando ao lado (cochila quando pausa). */
function Grifinho({ t }: { t: TimerView }) {
  const onBreak = t.mode === "pomodoro" && t.phase === "break";
  const paused = t.mode !== "idle" && t.paused;
  return (
    <motion.div
      className="hidden @xl:block"
      animate={paused || t.mode === "idle" ? { y: 0, rotate: paused ? -8 : 0, opacity: paused ? 0.6 : 1 } : { y: [0, -5, 0], rotate: 0, opacity: 1 }}
      transition={paused || t.mode === "idle" ? { duration: 0.4 } : { duration: onBreak ? 2.6 : 1.4, repeat: Infinity, ease: "easeInOut" }}
      title={paused ? "Zzz…" : "Grifinho estudando junto"}
    >
      <Mascot look="cap" scale={5} />
      {paused && <p className="retro mt-1 text-center text-[9px] text-muted-foreground">zzz…</p>}
    </motion.div>
  );
}
