import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Pause, Play, Square } from "lucide-react";
import { NativeSelect } from "@/components/fields";
import { ProgressRing } from "@/components/Progress";
import { Segmented } from "@/components/Segmented";
import { toastError } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { commands, type Subject, type TimerKind } from "@/lib/bindings";
import { spring } from "@/lib/motion";
import { sfx } from "@/lib/sound";
import { clock, timerLabel, timerSeconds, useTimer, type TimerView } from "@/lib/timer";
import { cn } from "@/lib/utils";

/** Anel do pomodoro: enche no foco, esvazia na pausa. O cronômetro dá uma volta por hora. */
function TimerRing({ t }: { t: TimerView }) {
  const frac = t.mode === "pomodoro" ? 1 - t.remaining / Math.max(1, t.total) : t.mode === "stopwatch" ? (t.elapsed % 3600) / 3600 : 0;
  const onBreak = t.mode === "pomodoro" && t.phase === "break";
  return (
    <ProgressRing value={frac} size={220} stroke={8} tone={onBreak ? "stroke-success" : "stroke-primary"} transition={{ duration: 0.9, ease: "linear" }}>
      <p className={cn("retro tabular text-4xl", onBreak ? "text-success" : "text-primary", t.mode !== "idle" && t.paused && "animate-pulse opacity-60")}>{clock(timerSeconds(t))}</p>
      <p className="mt-1 text-xs text-muted-foreground">{t.mode === "idle" ? "pronto" : `${timerLabel(t)}${t.paused ? " · pausado" : ""}`}</p>
    </ProgressRing>
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
    <div className="flex flex-col items-center gap-5">
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
