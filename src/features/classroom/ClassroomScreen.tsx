import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotionConfig } from "motion/react";
import { Loader2, Mic, Volume2, VolumeX } from "lucide-react";
import { NativeSelect } from "@/components/fields";
import { toast, toastError } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  commands,
  events,
  type ClassReport_Serialize as ClassReport,
  type OpenClassInfo,
  type Evaluation_Serialize as Evaluation,
  type Student,
  type StudentInfo,
  type TopicRef,
} from "@/lib/bindings";
import { accTone, formatDate, plural } from "@/lib/format";
import { useKey, useTauriEvent } from "@/lib/hooks";
import { spring } from "@/lib/motion";
import { getFlag, saveFlag } from "@/lib/prefs";
import { CLASS_XP } from "@/lib/rules";
import { sfx } from "@/lib/sound";
import { useHasPtVoice } from "@/lib/speech";
import { errorMessage, warn } from "@/lib/utils";
import { Avatar } from "./students";
import { speak, stopSpeaking, useVoice } from "./voice";

type Msg = { role: "teacher" | "student"; student?: Student; text: string };

export default function ClassroomScreen() {
  const [topics, setTopics] = useState<TopicRef[]>([]);
  const [topicId, setTopicId] = useState<number | null>(null);
  const [classId, setClassId] = useState<number | null>(null);
  const [report, setReport] = useState<ClassReport | null>(null);
  const [error, setError] = useState("");

  const [open, setOpen] = useState<OpenClassInfo[]>([]);

  const loadTopics = useCallback(() => {
    commands.listAllTopics().then(setTopics, (e) => setError(errorMessage(e)));
    commands.openClasses().then(setOpen, (e) => (warn("aulas em andamento", e), setOpen([])));
  }, []);
  useEffect(loadTopics, [loadTopics]);

  const topic = topics.find((t) => t.id === topicId) ?? null;

  if (classId !== null && topic) {
    return (
      <Lesson
        classId={classId}
        topic={topic}
        onFinish={(r) => {
          setReport(r);
          setClassId(null);
          sfx("chime");
        }}
      />
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <h1 className="retro text-sm text-primary">Sala de aula</h1>
      <p className="text-sm text-muted-foreground">
        Explique o tópico para 6 alunos que não sabem nada da matéria. Um avaliador oculto compara sua explicação com o material e os
        alunos perguntam exatamente onde você ficou fraco.
      </p>

      {report && <ReportCard report={report} onClose={() => setReport(null)} />}

      {open.map((o) => (
        <motion.div
          key={o.id}
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-wrap items-center gap-3 rounded-2xl border border-primary/40 bg-primary/10 p-3"
        >
          <p className="min-w-0 flex-1 text-sm">
            <b>Aula em andamento:</b> {o.topic} <span className="text-muted-foreground">· {o.subject} · {o.lines} falas · {formatDate(o.held_at)}</span>
          </p>
          <Button
            size="sm"
            onClick={() => {
              setTopicId(o.topic_id);
              setClassId(o.id);
              setReport(null);
            }}
          >
            Continuar
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void commands.discardClass(o.id).then(loadTopics, toastError)}>
            Descartar
          </Button>
        </motion.div>
      ))}

      <div className="grid gap-5 @2xl:grid-cols-[280px_1fr]">
        <div className="space-y-2">
          <Label htmlFor="class-topic">Tópico</Label>
          <NativeSelect id="class-topic" value={topicId ?? ""} onChange={(e) => setTopicId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Escolha um tópico…</option>
            {topics.map((t) => (
              <option key={t.id} value={t.id}>
                {t.has_material ? "📘 " : ""}
                {t.subject} — {t.name}
              </option>
            ))}
          </NativeSelect>
          {topics.length === 0 && <p className="text-xs text-muted-foreground">Cadastre tópicos em Matérias primeiro.</p>}
          <History topicId={topicId} />
        </div>

        {topic ? (
          <MaterialPanel
            key={topic.id}
            topic={topic}
            onChanged={loadTopics}
            onStart={async () => {
              try {
                setClassId(await commands.startClass(topic.id));
                setReport(null);
                setError("");
              } catch (e) {
                setError(errorMessage(e));
              }
            }}
          />
        ) : (
          <p className="self-center text-center text-muted-foreground">Escolha um tópico para preparar a aula.</p>
        )}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

function MaterialPanel({ topic, onStart, onChanged }: { topic: TopicRef; onStart: () => void; onChanged: () => void }) {
  const [text, setText] = useState("");
  const [path, setPath] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    commands.getTopicMaterial(topic.id).then(
      (m) => {
        setText(m.material ?? "");
        setPath(m.material_path);
      },
      (e) => setStatus(errorMessage(e)),
    );
  }, [topic.id]);

  async function save(value = text) {
    try {
      await commands.setTopicMaterial(topic.id, value);
      setStatus("Material salvo");
      onChanged();
    } catch (e) {
      setStatus(errorMessage(e));
    }
  }

  async function importFile(file: File) {
    const content = await file.text();
    setText(content);
    await save(content);
  }

  async function grifo() {
    setBusy(true);
    setStatus("O Grifo está montando a apostila pelo Claude… pode levar alguns minutos.");
    try {
      const m = await commands.generateApostila(topic.id);
      setText(m.material ?? "");
      setPath(m.material_path);
      setStatus("Apostila gerada e anexada como material de referência");
      onChanged();
    } catch (e) {
      setStatus(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3 rounded-lg border border-border bg-card p-4">
      <h2 className="font-semibold">
        Material de referência — {topic.name} <span className="text-sm text-muted-foreground">({topic.subject})</span>
      </h2>
      <Textarea
        rows={12}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => void save()}
        placeholder="Cole aqui o trecho da lei, o resumo ou a apostila do Grifo (.md)…"
        aria-label="Material de referência"
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={() => void save()}>
          Salvar
        </Button>
        <label className="cursor-pointer rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary">
          Importar .md/.txt
          <input
            type="file"
            accept=".md,.txt,.markdown"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && void importFile(e.target.files[0])}
          />
        </label>
        <Button variant="secondary" disabled={busy} onClick={() => void grifo()}>
          {busy ? "Gerando…" : "Gerar apostila com o Grifo"}
        </Button>
        {path && (
          <Button variant="ghost" onClick={() => commands.openMaterial(topic.id).catch(toastError)}>
            Abrir apostila
          </Button>
        )}
      </div>
      {status && <p className="text-sm text-muted-foreground">{status}</p>}
      <Button onClick={onStart} disabled={!text.trim() || busy}>
        Começar a aula
      </Button>
    </section>
  );
}

function Lesson({ classId, topic, onFinish }: { classId: number; topic: TopicRef; onFinish: (r: ClassReport) => void }) {
  const [students, setStudents] = useState<StudentInfo[]>([]);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [active, setActive] = useState<Student | null>(null);
  const speaker = students.find((s) => s.id === active);
  const [bubble, setBubble] = useState("");
  const [speaking, setSpeaking] = useState(false);
  const [board, setBoard] = useState<Evaluation | null>(null);
  const [aloud, setAloud] = useState(true);
  const [error, setError] = useState("");
  const log = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const reduce = useReducedMotionConfig();
  const hasVoice = useHasPtVoice();
  const aloudRef = useRef(aloud);
  aloudRef.current = aloud && hasVoice;

  const voice = useVoice(
    useCallback((text: string) => {
      setDraft((d) => (d.trim() ? `${d.trim()} ${text}` : text));
      sfx("coin");
      requestAnimationFrame(() => input.current?.focus());
    }, []),
    useCallback((msg: string) => toast(msg, "error"), []),
  );

  useEffect(() => {
    commands.listStudents().then(setStudents, toastError);
    void getFlag("class_voice", true).then(setAloud);
    // Retomada: aula aberta continua de onde parou (nova aula volta vazia).
    commands.classState(classId).then(
      (s) => {
        setMessages(s.lines.map((l) => ({ role: l.role === "teacher" ? "teacher" : "student", student: l.student ?? undefined, text: l.text })));
        if (s.evaluation) setBoard(s.evaluation);
      },
      (e) => warn("retomar a aula", e),
    );
    return () => stopSpeaking();
  }, [classId]);

  useTauriEvent(events.classEvent, (e) => {
    if (e.class_id !== classId) return;
    switch (e.type) {
      case "evaluating":
        setThinking(true);
        break;
      case "board":
        setBoard(e.evaluation);
        break;
      case "asking":
        setThinking(false);
        setActive(e.student);
        setBubble("");
        sfx("nav");
        break;
      case "token":
        setBubble((b) => b + e.text);
        break;
      case "done":
        setBubble(e.text);
        setMessages((m) => [...m, { role: "student", student: e.student, text: e.text }]);
        if (aloudRef.current) speak(e.text, e.student, () => setSpeaking(true), () => setSpeaking(false));
        break;
    }
  });

  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight, behavior: reduce ? "auto" : "smooth" });
  }, [messages, reduce]);

  // Segurar Espaço (fora da caixa de texto) = falar.
  useKey((e) => {
    if (e.code !== "Space" || e.repeat || busy) return;
    e.preventDefault();
    void voice.start();
  });
  useKey((e) => {
    if (e.code !== "Space") return;
    e.preventDefault();
    void voice.stop();
  }, "keyup");

  async function send() {
    const text = draft.trim();
    if (!text || busy) return;
    stopSpeaking();
    setMessages((m) => [...m, { role: "teacher", text }]);
    setDraft("");
    setBusy(true);
    setError("");
    try {
      await commands.sendExplanation(classId, text);
    } catch (e) {
      setError(errorMessage(e));
      setThinking(false);
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    stopSpeaking();
    try {
      onFinish(await commands.finishClass(classId));
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  function toggleAloud() {
    const next = !aloud;
    setAloud(next);
    if (!next) stopSpeaking();
    saveFlag("class_voice", next);
  }

  const nameOf = useMemo(() => new Map(students.map((s) => [s.id, s.name])), [students]);

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col gap-4">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="retro min-w-0 flex-1 truncate text-sm text-primary">Aula: {topic.name}</h1>
        <button
          onClick={toggleAloud}
          disabled={!hasVoice}
          title={hasVoice ? (aloud ? "Alunos falam em voz alta" : "Alunos mudos") : "O Windows não tem voz em português instalada"}
          aria-pressed={aloud && hasVoice}
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-muted-foreground hover:bg-secondary disabled:opacity-40"
        >
          {aloud && hasVoice ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
          {aloud && hasVoice ? "Com voz" : "Sem voz"}
        </button>
        <Button variant="secondary" onClick={() => void finish()} disabled={busy}>
          Encerrar aula e ver boletim
        </Button>
      </header>

      <div className="grid gap-4 @4xl:grid-cols-[1fr_300px]">
        {/* Turma em semicírculo */}
        <div className="relative h-64 overflow-hidden rounded-2xl border border-border bg-gradient-to-b from-card to-secondary/40">
          {/* Fala do aluno num balão central: nas pontas do semicírculo ele saía cortado. */}
          <AnimatePresence>
            {speaker && (bubble || busy) && !thinking && (
              <motion.div
                key={speaker.id}
                initial={reduce ? false : { opacity: 0, y: -6, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.12 } }}
                transition={spring.soft}
                className="absolute inset-x-0 top-3 z-20 mx-auto max-h-[45%] w-[min(28rem,80%)] overflow-y-auto rounded-2xl border border-border bg-background p-3 text-sm shadow-lift"
                aria-live="polite"
              >
                <span className="mb-0.5 block text-xs font-semibold text-primary">{speaker.name}</span>
                {bubble || "…"}
              </motion.div>
            )}
          </AnimatePresence>
          {students.map((s, i) => {
            const angle = Math.PI * (i / Math.max(1, students.length - 1));
            const x = 50 - 42 * Math.cos(angle);
            const y = 22 + 55 * Math.sin(angle);
            const isActive = active === s.id;
            return (
              <div key={s.id} className="absolute flex -translate-x-1/2 flex-col items-center" style={{ left: `${x}%`, top: `${y}%`, zIndex: isActive ? 10 : 1 }}>
                <AnimatePresence>
                  {thinking && (
                    <motion.span
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ delay: i * 0.08 }}
                      className="absolute bottom-full mb-1 rounded-full bg-background px-2 text-xs text-muted-foreground shadow-soft"
                      aria-hidden
                    >
                      <motion.span animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1.2, delay: i * 0.15 }}>
                        • • •
                      </motion.span>
                    </motion.span>
                  )}
                </AnimatePresence>
                {/* parado: respira; pensando: inclina a cabeça; perguntando: levanta a mão e pula; falando: pulsa */}
                <motion.div
                  animate={
                    reduce
                      ? undefined
                      : isActive && speaking
                        ? { scale: [1, 1.06, 1], y: 0, rotate: 0 }
                        : isActive
                          ? { y: [0, -10, 0], rotate: [0, -4, 0] }
                          : thinking
                            ? { rotate: [0, i % 2 ? 4 : -4, 0], y: 0 }
                            : { y: [0, -2, 0] }
                  }
                  transition={{ repeat: Infinity, duration: isActive && speaking ? 0.45 : isActive ? 0.9 : thinking ? 1.6 : 2.6 + i * 0.2, delay: isActive ? 0 : i * 0.25, ease: "easeInOut" }}
                  className="relative"
                >
                  <Avatar student={s.id} scale={isActive ? 6 : 5} title={s.name} />
                  <AnimatePresence>
                    {isActive && !thinking && (
                      <motion.span initial={{ scale: 0, rotate: -40 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0 }} transition={spring.bouncy} className="absolute -top-2 -right-4 text-lg" aria-hidden>
                        ✋
                      </motion.span>
                    )}
                  </AnimatePresence>
                </motion.div>
                <div className="mt-1 h-2 w-14 rounded-sm bg-secondary" aria-hidden />
                <span className={`mt-1 text-[11px] ${isActive ? "font-semibold text-primary" : "text-muted-foreground"}`}>{s.name.split(",")[0]}</span>
              </div>
            );
          })}
        </div>

        {/* Quadro-negro: o que você cobriu aparece escrito a giz */}
        <aside className="rounded-xl border-[6px] border-[#6b4f33] bg-[#22382b] p-3 text-[#e9efe2] shadow-[inset_0_0_30px_rgba(0,0,0,0.35)]">
          <h2 className="retro mb-2 text-[10px] opacity-80">Quadro</h2>
          {!board ? (
            <p className="text-sm opacity-60">Os temas que você cobrir aparecem aqui.</p>
          ) : (
            <ul className="space-y-1 text-sm" style={{ fontFamily: "'Segoe Print', 'Comic Sans MS', cursive" }}>
              {[...board.cobertos.map((c) => ["✓", c, 1] as const), ...board.rasos.map((c) => ["~", c, 0.65] as const)].map(([mark, c, op], i) => (
                <motion.li
                  key={`${mark}${c}`}
                  initial={{ clipPath: "inset(0 100% 0 0)" }}
                  animate={{ clipPath: "inset(0 0% 0 0)" }}
                  transition={{ duration: 0.7, delay: i * 0.12, ease: "easeOut" }}
                  style={{ opacity: op }}
                >
                  {mark} {c}
                </motion.li>
              ))}
            </ul>
          )}
        </aside>
      </div>

      <div ref={log} className="min-h-40 flex-1 space-y-2 overflow-y-auto rounded-2xl border border-border bg-card p-3">
        {messages.length === 0 && <p className="text-sm text-muted-foreground">Comece explicando o primeiro bloco do conteúdo. Segure Espaço para falar.</p>}
        {messages.map((m, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={spring.soft}
            className={m.role === "teacher" ? "ml-auto max-w-[80%] rounded-2xl rounded-br-sm bg-secondary p-2.5" : "max-w-[80%]"}
          >
            <p className="text-xs text-muted-foreground">{m.role === "teacher" ? "Você" : (nameOf.get(m.student as Student) ?? "Aluno")}</p>
            <p className="whitespace-pre-wrap">{m.text}</p>
          </motion.div>
        ))}
        {thinking && <p className="text-sm text-muted-foreground">A turma está pensando…</p>}
      </div>

      <div className="flex items-stretch gap-2">
        <div className="relative flex-1">
          <Textarea
            ref={input}
            rows={3}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && e.ctrlKey) void send();
            }}
            placeholder="Explique um bloco do conteúdo… (Ctrl+Enter envia · segure Espaço fora daqui para falar)"
            aria-label="Sua explicação"
            disabled={busy}
          />
          <AnimatePresence>
            {voice.phase !== "idle" && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 flex items-center justify-center gap-3 rounded-md bg-card/95 backdrop-blur-sm"
                aria-live="polite"
              >
                {voice.phase === "recording" ? (
                  <>
                    <span className="size-2.5 animate-pulse rounded-full bg-destructive" />
                    <div className="flex h-10 items-center gap-[3px]" aria-hidden>
                      {voice.levels.map((l, i) => (
                        <motion.span key={i} className="w-1 rounded-full bg-primary" animate={{ height: 4 + l * 34 }} transition={{ duration: 0.08 }} />
                      ))}
                    </div>
                    <span className="text-sm text-muted-foreground">Ouvindo… solte para transcrever</span>
                  </>
                ) : (
                  <span className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" /> Transcrevendo no seu PC…
                  </span>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <div className="flex flex-col gap-2">
          <Button
            variant={voice.phase === "recording" ? "destructive" : "secondary"}
            onClick={() => void (voice.phase === "recording" ? voice.stop() : voice.start())}
            disabled={busy || voice.phase === "transcribing"}
            aria-label={voice.phase === "recording" ? "Parar e transcrever" : "Falar"}
            title="Falar (ou segure Espaço)"
            className="h-full min-w-12"
          >
            <Mic />
          </Button>
        </div>
        <Button onClick={() => void send()} disabled={busy || !draft.trim()} className="h-auto min-w-24">
          {busy ? <Loader2 className="animate-spin" /> : null} Explicar
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

function ReportCard({ report, onClose }: { report: ClassReport; onClose?: () => void }) {
  const e = report.evaluation;
  const score = report.coverage_score ?? 0;
  const color = accTone(score / 100);
  return (
    <section className="space-y-3 rounded-lg border-2 border-primary bg-card p-4">
      <header className="flex items-center justify-between">
        <h2 className="font-semibold">
          Boletim — {report.topic} <span className="text-sm text-muted-foreground">{formatDate(report.held_at)}</span>
        </h2>
        {onClose && (
          <Button size="sm" variant="ghost" onClick={onClose}>
            Fechar
          </Button>
        )}
      </header>
      <div className="flex items-baseline gap-3">
        <span className={`retro text-3xl ${color}`}>{Math.round(score)}</span>
        <span className="text-sm text-muted-foreground">de cobertura · +{CLASS_XP} XP</span>
      </div>
      <p className="text-sm">
        {report.next_review_days ? `Reaula em ${plural(report.next_review_days, "dia", "dias")}.` : "Ciclo de revisão concluído para este tópico!"}
      </p>
      <div className="grid gap-3 text-sm @lg:grid-cols-3">
        <List title="Erros" items={e.erros} className="text-destructive" />
        <List title="Omitidos" items={e.omitidos} className="text-primary" />
        <List title="Rasos" items={e.rasos} className="text-muted-foreground" />
      </div>
    </section>
  );
}

function List({ title, items, className }: { title: string; items: string[]; className: string }) {
  return (
    <div>
      <h3 className={`font-medium ${className}`}>
        {title} ({items.length})
      </h3>
      <ul className="list-inside list-disc text-muted-foreground">
        {items.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
    </div>
  );
}

function History({ topicId }: { topicId: number | null }) {
  const [reports, setReports] = useState<ClassReport[]>([]);
  const [open, setOpen] = useState<ClassReport | null>(null);
  useEffect(() => {
    commands.listClassReports(topicId).then(setReports, (e) => (warn("boletins anteriores", e), setReports([])));
  }, [topicId]);
  if (reports.length === 0) return null;
  return (
    <div className="space-y-2 pt-3">
      <h3 className="text-sm font-medium">Boletins anteriores</h3>
      <ul className="space-y-1 text-sm">
        {reports.slice(0, 8).map((r) => (
          <li key={r.id}>
            <button className="text-left hover:text-primary" onClick={() => setOpen(open?.id === r.id ? null : r)}>
              <b>{Math.round(r.coverage_score ?? 0)}</b> · {r.topic} <span className="text-muted-foreground">{formatDate(r.held_at)}</span>
            </button>
          </li>
        ))}
      </ul>
      {open && <ReportCard report={open} />}
    </div>
  );
}
