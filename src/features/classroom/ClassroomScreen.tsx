import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotionConfig } from "motion/react";
import { ArrowLeft, BookOpen, Loader2, Mic, Pencil, RefreshCw, Send, Sparkles, Volume2, VolumeX } from "lucide-react";
import { Skeleton } from "@/components/motion";
import { ProgressRing } from "@/components/Progress";
import { toast, toastError } from "@/components/toast";
import { Button } from "@/components/ui/button";
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
import { itemIn, listIn, spring } from "@/lib/motion";
import { getFlag, saveFlag } from "@/lib/prefs";
import { CLASS_XP } from "@/lib/rules";
import { sfx } from "@/lib/sound";
import { useHasPtVoice } from "@/lib/speech";
import { cn, errorMessage, warn } from "@/lib/utils";
import { coverage, outlineItems } from "./outline";
import { Avatar } from "./students";
import { TopicPicker } from "./TopicPicker";
import { speak, stopSpeaking, useVoice } from "./voice";

type Msg = { role: "teacher" | "student"; student?: Student; text: string };

/**
 * Sala de aula: escolha o tópico → o Grifo monta o roteiro em segundos → você explica para 6 alunos
 * que não sabem nada → boletim. A apostila do Grifo não é mais necessária (era lenta demais).
 */
export default function ClassroomScreen() {
  const [topics, setTopics] = useState<TopicRef[]>([]);
  const [topicId, setTopicId] = useState<number | null>(null);
  const [classId, setClassId] = useState<number | null>(null);
  const [report, setReport] = useState<ClassReport | null>(null);
  const [open, setOpen] = useState<OpenClassInfo[]>([]);

  const loadTopics = useCallback(() => {
    commands.listAllTopics().then(setTopics, toastError);
    commands.openClasses().then(setOpen, (e) => (warn("aulas em andamento", e), setOpen([])));
  }, []);
  useEffect(() => {
    loadTopics();
  }, [loadTopics]);

  const topic = topics.find((t) => t.id === topicId) ?? null;

  async function start(id: number) {
    try {
      setClassId(await commands.startClass(id));
      setTopicId(id);
      setReport(null);
      sfx("nav");
    } catch (e) {
      toastError(e);
    }
  }

  if (classId !== null && topic) {
    return (
      <Lesson
        classId={classId}
        topic={topic}
        onExit={() => {
          setClassId(null);
          loadTopics();
        }}
        onFinish={(r) => {
          setReport(r);
          setClassId(null);
          loadTopics();
          sfx("chime");
        }}
      />
    );
  }

  if (report) {
    return (
      <ReportScreen
        report={report}
        onAgain={() => void start(report.topic_id)}
        onBack={() => setReport(null)}
      />
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <header className="flex flex-wrap items-end gap-4">
        <div className="min-w-0 flex-1 space-y-1">
          <h1 className="retro text-sm text-primary">Sala de aula</h1>
          <p className="text-sm text-muted-foreground">Ensinar é o jeito mais rápido de aprender. Explique o tópico para a turma; quem não entende pergunta.</p>
        </div>
        <ol className="flex flex-wrap gap-2 text-xs">
          {["Escolha o tópico", "Explique (voz ou texto)", "Veja o boletim"].map((s, i) => (
            <li key={s} className="flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1">
              <span className="grid size-4 place-items-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">{i + 1}</span>
              {s}
            </li>
          ))}
        </ol>
      </header>

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
            }}
          >
            Continuar
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void commands.discardClass(o.id).then(loadTopics, toastError)}>
            Descartar
          </Button>
        </motion.div>
      ))}

      <div className="grid gap-5 @3xl:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        <div className="space-y-3">
          <TopicPicker topics={topics} value={topicId} onChange={setTopicId} />
          {topics.length === 0 && <p className="text-xs text-muted-foreground">Cadastre tópicos em Matérias primeiro.</p>}
          <History topicId={topicId} />
        </div>

        {topic ? (
          <Prep key={topic.id} topic={topic} onStart={() => void start(topic.id)} />
        ) : (
          <div className="grid place-items-center rounded-2xl border border-dashed border-border p-10 text-center">
            <div className="space-y-3">
              <div className="flex justify-center gap-1">
                {(["curioso", "literal", "confuso", "advogado", "pragmatico", "timido"] as Student[]).map((s, i) => (
                  <motion.div key={s} animate={{ y: [0, -3, 0] }} transition={{ repeat: Infinity, duration: 2.4 + i * 0.2, delay: i * 0.2 }}>
                    <Avatar student={s} scale={4} />
                  </motion.div>
                ))}
              </div>
              <p className="font-medium">A turma está esperando</p>
              <p className="text-sm text-muted-foreground">Escolha um tópico à esquerda. O roteiro fica pronto em segundos.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Roteiro do tópico: a IA monta os pontos-chave (ou você cola o seu material) e a aula começa. */
function Prep({ topic, onStart }: { topic: TopicRef; onStart: () => void }) {
  const [text, setText] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const prepare = useCallback(
    async (regenerate: boolean) => {
      setBusy(true);
      setError("");
      try {
        const m = await commands.prepareClass(topic.id, regenerate);
        setText(m.material ?? "");
        if (regenerate) toast("Roteiro refeito", "success");
      } catch (e) {
        setError(errorMessage(e));
        setText((t) => t ?? "");
      } finally {
        setBusy(false);
      }
    },
    [topic.id],
  );
  useEffect(() => {
    void prepare(false);
  }, [prepare]);

  async function save(value: string) {
    try {
      await commands.setTopicMaterial(topic.id, value);
      setText(value);
    } catch (e) {
      toastError(e);
    }
  }

  const items = useMemo(() => outlineItems(text ?? ""), [text]);
  const ready = !!text?.trim() && !busy;

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-soft">
      <header className="flex flex-wrap items-start gap-3">
        <BookOpen className="mt-0.5 size-5 text-primary" />
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">{topic.name}</h2>
          <p className="text-xs text-muted-foreground">{topic.subject} · roteiro da aula: o avaliador oculto compara sua explicação com ele</p>
        </div>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => setEditing((e) => !e)}>
          <Pencil /> {editing ? "Ver roteiro" : "Editar / colar material"}
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => void prepare(true)} title="A IA escreve outro roteiro">
          <RefreshCw className={cn(busy && "animate-spin")} /> Refazer
        </Button>
      </header>

      {text === null || (busy && !text) ? (
        <div className="space-y-2" aria-live="polite">
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Sparkles className="size-4 text-primary" /> O Grifo está montando o roteiro…
          </p>
          {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-9 rounded-lg" />)}
        </div>
      ) : editing ? (
        <Textarea
          rows={14}
          defaultValue={text}
          onBlur={(e) => void save(e.target.value)}
          placeholder="Cole aqui o trecho da lei, seu resumo ou anotações. Uma linha por ponto: - **Conceito**: explicação"
          aria-label="Material de referência"
        />
      ) : items.length > 0 ? (
        <motion.ol variants={listIn} initial="hidden" animate="show" className="max-h-[48vh] space-y-1.5 overflow-y-auto pr-1">
          {items.map((it, i) => (
            <motion.li key={i} variants={itemIn} className="flex gap-3 rounded-lg bg-secondary/50 px-3 py-2 text-sm">
              <span className="tabular w-5 shrink-0 text-right font-semibold text-primary">{i + 1}</span>
              <span>
                {it.title && <b>{it.title}: </b>}
                <span className="text-muted-foreground">{it.text}</span>
              </span>
            </motion.li>
          ))}
        </motion.ol>
      ) : text.trim() ? (
        <p className="max-h-[48vh] overflow-y-auto text-sm whitespace-pre-wrap text-muted-foreground">{text}</p>
      ) : (
        <p className="text-sm text-muted-foreground">Sem roteiro ainda.</p>
      )}

      {error && (
        <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          {error} <span className="text-muted-foreground">Confira a IA em Configurações → Integrações, ou cole seu material em “Editar”.</span>
        </p>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-3 border-t border-border pt-4">
        <p className="min-w-0 flex-1 text-xs text-muted-foreground">
          Explique em blocos curtos. Segure <kbd className="rounded bg-secondary px-1">Espaço</kbd> para falar. Vale +{CLASS_XP} XP.
        </p>
        <Button size="lg" disabled={!ready} onClick={onStart}>
          Começar a aula
        </Button>
      </div>
    </section>
  );
}

function Lesson({ classId, topic, onFinish, onExit }: { classId: number; topic: TopicRef; onFinish: (r: ClassReport) => void; onExit: () => void }) {
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
      requestAnimationFrame(() => {
        input.current?.focus();
      });
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
  const score = coverage(board);
  const taught = messages.some((m) => m.role === "teacher");

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col gap-4">
      <header className="flex flex-wrap items-center gap-3">
        <Button size="sm" variant="ghost" onClick={onExit} aria-label="Sair da aula (ela fica salva para continuar)" title="Sair (a aula fica salva para continuar)">
          <ArrowLeft />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-semibold">{topic.name}</h1>
          <p className="truncate text-xs text-muted-foreground">{topic.subject}</p>
        </div>
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
        <Button onClick={() => void finish()} disabled={busy || !taught}>
          Encerrar e ver boletim
        </Button>
      </header>

      <div className="grid gap-4 @4xl:grid-cols-[minmax(0,1fr)_300px]">
        {/* Turma em semicírculo */}
        <div className="relative h-64 overflow-hidden rounded-2xl border border-border bg-gradient-to-b from-card to-secondary/40">
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
          {thinking && (
            <p className="absolute inset-x-0 top-4 z-20 flex items-center justify-center gap-2 text-sm text-muted-foreground" aria-live="polite">
              <Loader2 className="size-4 animate-spin" /> A turma está pensando no que você disse…
            </p>
          )}
          {students.map((s, i) => {
            const angle = Math.PI * (i / Math.max(1, students.length - 1));
            const x = 50 - 42 * Math.cos(angle);
            const y = 22 + 55 * Math.sin(angle);
            const isActive = active === s.id;
            return (
              <div key={s.id} className="absolute flex -translate-x-1/2 flex-col items-center" style={{ left: `${x}%`, top: `${y}%`, zIndex: isActive ? 10 : 1 }}>
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

        {/* Quadro: nota ao vivo + temas cobertos; os que faltam só aparecem como contagem */}
        <aside className="flex flex-col gap-3 rounded-xl border-[6px] border-[#6b4f33] bg-[#22382b] p-3 text-[#e9efe2] shadow-[inset_0_0_30px_rgba(0,0,0,0.35)]">
          <div className="flex items-center gap-3">
            <ProgressRing value={score / 100} size={64} stroke={6} tone="stroke-[#9be29b]" label={`Cobertura ${score}%`}>
              <span className="retro text-[11px]">{score}</span>
            </ProgressRing>
            <div className="text-xs leading-relaxed opacity-85">
              <p className="retro text-[10px] opacity-80">Quadro</p>
              {board ? (
                <>
                  <p>{plural(board.cobertos.length, "tema coberto", "temas cobertos")}</p>
                  {board.omitidos.length > 0 && <p>faltam {plural(board.omitidos.length, "tema", "temas")}</p>}
                  {board.erros.length > 0 && <p className="text-[#ffb4a8]">{plural(board.erros.length, "erro", "erros")} a corrigir</p>}
                </>
              ) : (
                <p>A nota sobe conforme você explica.</p>
              )}
            </div>
          </div>
          {board && (
            <ul className="max-h-44 space-y-1 overflow-y-auto text-sm" style={{ fontFamily: "'Segoe Print', 'Comic Sans MS', cursive" }}>
              {[...board.cobertos.map((c) => ["✓", c, 1] as const), ...board.rasos.map((c) => ["~", c, 0.65] as const), ...board.erros.map((c) => ["✗", c, 0.9] as const)].map(([mark, c, op], i) => (
                <motion.li
                  key={`${mark}${c}`}
                  initial={{ clipPath: "inset(0 100% 0 0)" }}
                  animate={{ clipPath: "inset(0 0% 0 0)" }}
                  transition={{ duration: 0.7, delay: i * 0.12, ease: "easeOut" }}
                  style={{ opacity: op }}
                  className={mark === "✗" ? "text-[#ffb4a8]" : undefined}
                >
                  {mark} {c}
                </motion.li>
              ))}
            </ul>
          )}
        </aside>
      </div>

      <div ref={log} className="min-h-40 flex-1 space-y-2 overflow-y-auto rounded-2xl border border-border bg-card p-3">
        {messages.length === 0 && (
          <div className="space-y-1 p-2 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Comece pelo começo: o que é {topic.name}?</p>
            <p>Explique um bloco curto (3–5 frases). A cada bloco, um aluno pergunta sobre o que ficou faltando.</p>
          </div>
        )}
        {messages.map((m, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={spring.soft}
            className={m.role === "teacher" ? "ml-auto max-w-[80%] rounded-2xl rounded-br-sm bg-primary/12 p-2.5" : "flex max-w-[85%] gap-2"}
          >
            {m.role === "student" && m.student && (
              <span className="shrink-0 pt-1">
                <Avatar student={m.student} scale={3} />
              </span>
            )}
            <div className={m.role === "student" ? "rounded-2xl rounded-tl-sm bg-secondary p-2.5" : undefined}>
              <p className="text-xs text-muted-foreground">{m.role === "teacher" ? "Você" : (nameOf.get(m.student as Student) ?? "Aluno")}</p>
              <p className="whitespace-pre-wrap">{m.text}</p>
            </div>
          </motion.div>
        ))}
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
        <Button
          variant={voice.phase === "recording" ? "destructive" : "secondary"}
          onClick={() => void (voice.phase === "recording" ? voice.stop() : voice.start())}
          disabled={busy || voice.phase === "transcribing"}
          aria-label={voice.phase === "recording" ? "Parar e transcrever" : "Falar"}
          title="Falar (ou segure Espaço)"
          className="h-auto min-w-12"
        >
          <Mic />
        </Button>
        <Button onClick={() => void send()} disabled={busy || !draft.trim()} className="h-auto min-w-28">
          {busy ? <Loader2 className="animate-spin" /> : <Send />} Explicar
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

function ReportScreen({ report, onAgain, onBack }: { report: ClassReport; onAgain: () => void; onBack: () => void }) {
  const score = Math.round(report.coverage_score ?? 0);
  const verdict = score >= 85 ? "Aula de mestre!" : score >= 60 ? "Boa aula" : "Ainda tem lacunas";
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={spring.soft} className="mx-auto max-w-3xl space-y-5">
      <section className="flex flex-wrap items-center gap-6 rounded-2xl border-2 border-primary bg-card p-6 shadow-lift">
        <ProgressRing value={score / 100} size={120} stroke={10} tone={score >= 60 ? "stroke-success" : "stroke-primary"} label={`Cobertura ${score}%`}>
          <span className={cn("retro text-2xl", accTone(score / 100))}>{score}</span>
        </ProgressRing>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="retro text-xs text-primary">Boletim</p>
          <h1 className="text-2xl font-semibold">{verdict}</h1>
          <p className="text-sm text-muted-foreground">
            {report.topic} · +{CLASS_XP} XP ·{" "}
            {report.next_review_days ? `reaula em ${plural(report.next_review_days, "dia", "dias")}` : "ciclo de revisão concluído!"}
          </p>
        </div>
      </section>
      <ReportLists e={report.evaluation} />
      <div className="flex flex-wrap gap-2">
        <Button size="lg" onClick={onAgain}>
          Dar outra aula deste tópico
        </Button>
        <Button size="lg" variant="secondary" onClick={onBack}>
          Escolher outro tópico
        </Button>
      </div>
    </motion.div>
  );
}

function ReportLists({ e }: { e: Evaluation }) {
  const groups: [string, string[], string][] = [
    ["Você explicou bem", e.cobertos, "text-success"],
    ["Ficou raso", e.rasos, "text-primary"],
    ["Faltou falar", e.omitidos, "text-muted-foreground"],
    ["Explicou errado", e.erros, "text-destructive"],
  ];
  return (
    <div className="grid gap-3 @lg:grid-cols-2">
      {groups.map(([title, items, tone]) => (
        <div key={title} className="rounded-xl border border-border bg-card p-4">
          <h3 className={cn("mb-2 text-sm font-semibold", tone)}>
            {title} ({items.length})
          </h3>
          {items.length ? (
            <ul className="list-inside list-disc space-y-0.5 text-sm text-muted-foreground">
              {items.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">—</p>
          )}
        </div>
      ))}
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
    <div className="space-y-2 rounded-xl border border-border bg-card p-3">
      <h3 className="text-sm font-medium">Boletins anteriores</h3>
      <ul className="space-y-1 text-sm">
        {reports.slice(0, 8).map((r) => (
          <li key={r.id}>
            <button className="flex w-full items-center gap-2 text-left hover:text-primary" onClick={() => setOpen(open?.id === r.id ? null : r)}>
              <b className={cn("tabular w-7", accTone((r.coverage_score ?? 0) / 100))}>{Math.round(r.coverage_score ?? 0)}</b>
              <span className="min-w-0 flex-1 truncate">{r.topic}</span>
              <span className="text-xs text-muted-foreground">{formatDate(r.held_at)}</span>
            </button>
          </li>
        ))}
      </ul>
      {open && <ReportLists e={open.evaluation} />}
    </div>
  );
}
