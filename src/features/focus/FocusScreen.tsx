import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Pause, Play, Square } from "lucide-react";
import { NativeSelect } from "@/components/fields";
import { Mascot } from "@/components/Mascot";
import { Segmented } from "@/components/Segmented";
import { toastError } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { commands, type Subject, type TimerKind } from "@/lib/bindings";
import { spring } from "@/lib/motion";
import { sfx } from "@/lib/sound";
import { clock, timerFraction, timerLabel, timerSeconds, useTimer, type TimerView } from "@/lib/timer";
import { cn } from "@/lib/utils";
import { PixelRing } from "./PixelRing";

/** Relógio em blocos de pixel, com o Grifinho estudando ao lado (cochila quando pausa). */
function TimerRing({ t }: { t: TimerView }) {
  const onBreak = t.mode === "pomodoro" && t.phase === "break";
  const paused = t.mode !== "idle" && t.paused;
  const tone = onBreak ? "var(--accent)" : "var(--primary)";
  const label = t.mode === "idle" ? "pronto para começar" : onBreak ? "pausa: levanta, água, alonga" : t.mode === "pomodoro" ? "foco total" : timerLabel(t).toLowerCase();
  return (
    <div className="flex flex-wrap items-center justify-center gap-6">
      <PixelRing value={timerFraction(t)} tone={tone} paused={paused}>
        <span
          className={cn("retro mb-2 rounded-full px-2.5 py-1 text-[9px]", onBreak ? "bg-success/15 text-success" : "bg-primary/15 text-primary")}
        >
          {t.mode === "idle" ? "POMODORO" : paused ? "PAUSADO" : timerLabel(t).toUpperCase()}
        </span>
        <p className={cn("retro tabular text-4xl", onBreak ? "text-success" : "text-primary", paused && "animate-pulse")}>{clock(timerSeconds(t))}</p>
        <p className="mt-2 text-xs text-muted-foreground">{label}</p>
      </PixelRing>
      <motion.div
        className="hidden @xl:block"
        animate={paused || t.mode === "idle" ? { y: 0, rotate: paused ? -8 : 0, opacity: paused ? 0.6 : 1 } : { y: [0, -5, 0], rotate: 0, opacity: 1 }}
        transition={paused || t.mode === "idle" ? { duration: 0.4 } : { duration: onBreak ? 2.6 : 1.4, repeat: Infinity, ease: "easeInOut" }}
        title={paused ? "Zzz…" : "Grifinho estudando junto"}
      >
        <Mascot look="cap" scale={5} />
        {paused && <p className="retro mt-1 text-center text-[9px] text-muted-foreground">zzz…</p>}
      </motion.div>
    </div>
  );
}

type Mode = "pomodoro" | "stopwatch";

/** Foco livre: pomodoro ou cronômetro de estudo/trabalho, com pausa. */
export default function FocusScreen() {
  const [timer, setTimer] = useTimer();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [mode, setMode] = useState<Mode>("pomodoro");
  const [kind, setKind] = useState<TimerKind>("estudo");
  const [subjectId, setSubjectId] = useState<number | null>(null);

  useEffect(() => void commands.listSubjects().then(setSubjects, toastError), []);

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

  return (
    <div className="@container flex flex-col items-center gap-5">
      <motion.div initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={spring.soft}>
        <TimerRing t={timer} />
      </motion.div>

      {timer.mode === "idle" ? (
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
          <Button size="lg" className="min-w-40" onClick={() => void start()}>
            <Play /> Iniciar
          </Button>
        </>
      ) : (
        <>
          {subjectName && <p className="text-sm text-muted-foreground">{subjectName}</p>}
          <div className="flex gap-2">
            <Button size="lg" className="min-w-36" onClick={() => void run(commands.togglePause)}>
              {timer.paused ? <Play /> : <Pause />} {timer.paused ? "Continuar" : "Pausar"}
            </Button>
            <Button size="lg" variant="secondary" onClick={() => void run(commands.stopTimer)}>
              <Square /> Parar
            </Button>
          </div>
          <p className="max-w-xs text-center text-xs text-muted-foreground">
            Parar grava o tempo estudado (a partir de 1 min). No pomodoro, o XP de pomodoro só vem ao completar o foco.
          </p>
        </>
      )}
    </div>
  );
}
