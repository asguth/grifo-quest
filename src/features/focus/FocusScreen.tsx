import { useEffect, useState } from "react";
import { Button } from "@/components/ui/8bit/button";
import { Progress } from "@/components/ui/8bit/progress";
import { Button as PlainButton } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { commands, type Kind, type Subject, type TimerView_Serialize as TimerView } from "@/lib/bindings";
import { errorMessage } from "@/lib/utils";

type Mode = "pomodoro" | "stopwatch";

function clock(secs: number): string {
  const h = Math.floor(secs / 3600);
  const mm = String(Math.floor((secs % 3600) / 60)).padStart(2, "0");
  const ss = String(secs % 60).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Toggle de duas opções, sem dependência extra. */
function Toggle<T extends string>(props: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={props.label} className="inline-flex rounded-md bg-card p-1">
      {props.options.map(([v, text]) => (
        <PlainButton
          key={v}
          role="radio"
          aria-checked={props.value === v}
          size="sm"
          variant={props.value === v ? "default" : "ghost"}
          onClick={() => props.onChange(v)}
        >
          {text}
        </PlainButton>
      ))}
    </div>
  );
}

export default function FocusScreen() {
  const [timer, setTimer] = useState<TimerView>({ mode: "idle" });
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [mode, setMode] = useState<Mode>("pomodoro");
  const [kind, setKind] = useState<Kind>("estudo");
  const [subjectId, setSubjectId] = useState<number | null>(null);
  const [error, setError] = useState("");

  // ponytail: polling de 1 s do estado que vive no Rust; trocar por evento Tauri se pesar.
  useEffect(() => {
    const poll = () => commands.timerStatus().then(setTimer, (e) => setError(errorMessage(e)));
    void poll();
    const id = setInterval(poll, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    commands.listSubjects().then(setSubjects, (e) => setError(errorMessage(e)));
  }, []);

  async function run(action: () => Promise<TimerView>) {
    try {
      setTimer(await action());
      setError("");
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const start = () =>
    run(() =>
      mode === "pomodoro" ? commands.startPomodoro(subjectId) : commands.startStopwatch(kind, kind === "estudo" ? subjectId : null),
    );

  const subjectName = (id: number | null) => subjects.find((s) => s.id === id)?.name;
  const showSubject = timer.mode === "idle" && (mode === "pomodoro" || kind === "estudo");

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-6 pt-6">
      <h1 className="retro text-sm text-primary">Foco</h1>

      {timer.mode === "idle" ? (
        <>
          <Toggle label="Modo" value={mode} onChange={setMode} options={[["pomodoro", "Pomodoro"], ["stopwatch", "Cronômetro"]]} />
          {mode === "stopwatch" && (
            <Toggle label="Tipo" value={kind} onChange={setKind} options={[["estudo", "Estudo"], ["trabalho", "Trabalho"]]} />
          )}
          {showSubject && (
            <div className="w-full max-w-xs space-y-1">
              <Label htmlFor="focus-subject">Matéria</Label>
              <select
                id="focus-subject"
                value={subjectId ?? ""}
                onChange={(e) => setSubjectId(e.target.value ? Number(e.target.value) : null)}
                className="h-9 w-full rounded-md border border-input bg-background px-2"
              >
                <option value="">Sem matéria</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <p className="retro text-5xl text-muted-foreground" aria-hidden>
            00:00
          </p>
          <Button onClick={() => void start()}>Iniciar</Button>
        </>
      ) : (
        <>
          <p className="text-muted-foreground">
            {timer.mode === "pomodoro"
              ? timer.phase === "focus"
                ? "Foco"
                : "Pausa"
              : timer.kind === "estudo"
                ? "Estudo"
                : "Trabalho"}
            {subjectName(timer.subject_id) && ` · ${subjectName(timer.subject_id)}`}
          </p>
          <p role="timer" className={`retro text-5xl ${timer.mode === "pomodoro" && timer.phase === "break" ? "text-accent" : "text-primary"}`}>
            {clock(timer.mode === "pomodoro" ? timer.remaining : timer.elapsed)}
          </p>
          {timer.mode === "pomodoro" && (
            <Progress className="w-full max-w-xs" value={100 - (timer.remaining / timer.total) * 100} />
          )}
          <Button variant="secondary" onClick={() => void run(commands.stopTimer)}>
            {timer.mode === "pomodoro" ? "Cancelar" : "Parar e salvar"}
          </Button>
          {timer.mode === "stopwatch" && <p className="text-xs text-muted-foreground">Sessões com menos de 1 min não são salvas.</p>}
        </>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
