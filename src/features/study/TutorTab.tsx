import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUp, BookOpen, Check, Copy, Cpu, Lightbulb, ListTree, MessageSquarePlus, Sparkles, Square, Target, Wand2, Cloud, type LucideIcon } from "lucide-react";
import { Mascot } from "@/components/Mascot";
import { PickMenu, type PickOption } from "@/components/PickMenu";
import { toastError } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { commands, type Subject, type Topic, type TutorModel } from "@/lib/bindings";
import { spring } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { liteMarkdown } from "./lite-markdown";
import {
  AUTO_MODEL,
  askTutor,
  clearTutor,
  loadTutorModels,
  setTutorContext,
  setTutorModel,
  setTutorVisible,
  stopTutor,
  useTutor,
  type ChatTurn,
} from "./tutorStore";

/** Sugestões para começar: um clique já pergunta. */
const STARTERS: { icon: LucideIcon; title: string; q: string }[] = [
  { icon: BookOpen, title: "Do zero", q: "Me explica isso como se eu nunca tivesse visto" },
  { icon: Target, title: "Pegadinhas", q: "Qual a pegadinha que a banca mais usa aqui?" },
  { icon: ListTree, title: "Resumo", q: "Faz um resumo em 5 tópicos" },
  { icon: Lightbulb, title: "Exemplo", q: "Me dá um exemplo prático" },
];

const ALL = "__all__";

function modelIcon(id: string): LucideIcon {
  if (id === AUTO_MODEL) return Wand2;
  if (id.startsWith("ollama:")) return Cpu;
  if (id === "claude") return Sparkles;
  return Cloud;
}

const toOptions = (models: TutorModel[]): PickOption<string>[] =>
  models.map((m) => ({ value: m.id, label: m.label, detail: m.detail, group: m.group || undefined, icon: modelIcon(m.id) }));

const hhmm = (at: number) => new Date(at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

/** Tira-dúvidas ("Pergunte ao Grifo"): chat com a IA escolhida sobre a matéria ou o tópico. */
export default function TutorTab() {
  const s = useTutor();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [text, setText] = useState("");
  const [now, setNow] = useState(Date.now());
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setTutorVisible(true);
    commands.listSubjects().then(setSubjects, toastError);
    void loadTutorModels();
    return () => setTutorVisible(false);
  }, []);
  useEffect(() => {
    if (s.subjectId === null) {
      setTopics([]);
      return;
    }
    commands.listTopics(s.subjectId).then(setTopics, toastError);
  }, [s.subjectId]);
  // Sempre no fim da conversa. (Sem scrollIntoView: no WebView2 novo ele devolve Promise.)
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [s.turns]);
  // relógio do "ainda pensando…"
  useEffect(() => {
    if (!s.busy) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [s.busy]);
  // caixa de texto cresce com a pergunta (até ~8 linhas)
  useEffect(() => {
    const el = input.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [text]);

  const send = (q: string) => {
    if (!q.trim() || s.busy) return;
    void askTutor(q);
    setText("");
    input.current?.focus();
  };
  const waiting = s.busy && s.since !== null ? Math.floor((now - s.since) / 1000) : 0;
  const subject = subjects.find((x) => x.id === s.subjectId);
  const topic = topics.find((t) => t.id === s.topicId);
  const model = s.models?.find((m) => m.id === s.model);
  const local = s.model.startsWith("ollama:");

  return (
    <div className="flex h-[calc(100dvh-10.5rem)] min-h-[480px] flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-soft">
      {/* Cabeçalho: quem é, com quem fala e sobre o quê */}
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border bg-[color-mix(in_oklch,var(--card),var(--primary)_4%)] px-4 py-3">
        <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/12 ring-1 ring-primary/25">
          <Mascot look="cap" scale={2} />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="retro text-[11px] leading-5 text-primary">Pergunte ao Grifo</h2>
          <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
            <span className={cn("size-1.5 shrink-0 rounded-full", s.busy ? "animate-pulse bg-primary" : "bg-success")} />
            {s.busy ? "Escrevendo a resposta…" : topic ? topic.name : subject ? subject.name : "Pronto para qualquer matéria"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {s.models === null ? (
            <span className="h-8 w-36 animate-pulse rounded-lg bg-secondary" />
          ) : (
            <PickMenu label="IA que responde" value={s.model} onChange={setTutorModel} options={toOptions(s.models)} align="end" className="max-w-56" />
          )}
          <Button size="icon-sm" variant="secondary" disabled={s.busy || s.turns.length === 0} onClick={clearTutor} title="Nova conversa" aria-label="Nova conversa">
            <MessageSquarePlus />
          </Button>
        </div>
      </header>

      {/* Contexto: matéria e tópico (o material do tópico vira referência) */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2">
        <span className="text-xs text-muted-foreground">Sobre</span>
        <PickMenu
          label="Matéria"
          icon={BookOpen}
          value={s.subjectId === null ? ALL : String(s.subjectId)}
          onChange={(v) => setTutorContext(v === ALL ? null : Number(v), null)}
          options={[{ value: ALL, label: "Qualquer matéria" }, ...subjects.map((x) => ({ value: String(x.id), label: x.name }))]}
          className="max-w-64"
        />
        {topics.length > 0 && (
          <PickMenu
            label="Tópico"
            icon={ListTree}
            value={s.topicId === null ? ALL : String(s.topicId)}
            onChange={(v) => setTutorContext(s.subjectId, v === ALL ? null : Number(v))}
            options={[{ value: ALL, label: "A matéria toda" }, ...topics.map((t) => ({ value: String(t.id), label: t.name }))]}
            className="max-w-72"
          />
        )}
      </div>

      {/* Conversa */}
      <div ref={scroller} className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
        {s.turns.length === 0 ? (
          <Welcome
            subject={subject?.name}
            // sem matéria, "aqui" não diz nada: a sugestão vai para a caixa para a pessoa completar com o assunto
            onPick={(q) => {
              if (subject) return send(q);
              setText(`${q}: `);
              input.current?.focus();
            }}
          />
        ) : (
          <div className="mx-auto max-w-3xl space-y-5">
            {s.turns.map((t, i) => (
              <Bubble key={i} t={t} pending={s.busy && i === s.turns.length - 1} waiting={waiting} local={local} />
            ))}
          </div>
        )}
      </div>

      {/* Caixa de pergunta */}
      <form
        className="border-t border-border p-3"
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border border-border bg-background px-3 py-2 shadow-xs transition-colors focus-within:border-primary/60 focus-within:ring-3 focus-within:ring-ring/20">
          <textarea
            ref={input}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(text);
              }
            }}
            rows={1}
            placeholder={subject ? `Pergunte sobre ${subject.name}…` : "Escreva a sua dúvida…"}
            className="max-h-[200px] min-h-9 flex-1 resize-none bg-transparent py-1.5 text-sm outline-none placeholder:text-muted-foreground"
            aria-label="Sua dúvida"
          />
          {s.busy ? (
            <Button type="button" size="icon" variant="secondary" onClick={stopTutor} title="Parar a resposta" aria-label="Parar a resposta" className="rounded-xl">
              <Square className="size-3.5 fill-current" />
            </Button>
          ) : (
            <Button type="submit" size="icon" disabled={!text.trim()} title="Perguntar (Enter)" aria-label="Perguntar" className="rounded-xl">
              <ArrowUp />
            </Button>
          )}
        </div>
        <p className="mx-auto mt-1.5 max-w-3xl px-1 text-[11px] text-muted-foreground">
          Enter envia · Shift+Enter quebra a linha · {model ? `respondendo com ${model.id === AUTO_MODEL ? "a IA de Config → IA" : model.label}` : "carregando IAs…"} · pode sair da aba: eu aviso quando responder
        </p>
      </form>
    </div>
  );
}

function Welcome({ subject, onPick }: { subject?: string; onPick: (q: string) => void }) {
  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center gap-5 py-6 text-center">
      <motion.div animate={{ y: [0, -6, 0] }} transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}>
        <Mascot look="cap" scale={5} />
      </motion.div>
      <div className="space-y-1.5">
        <p className="text-lg font-semibold">{subject ? `Bora de ${subject}?` : "Oi! Em que posso ajudar?"}</p>
        <p className="mx-auto max-w-md text-sm text-muted-foreground">Eu explico, dou exemplo e conto como a banca cobra. Escolha a matéria acima para eu usar o seu material.</p>
      </div>
      <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
        {STARTERS.map((x, i) => (
          <motion.button
            key={x.q}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...spring.soft, delay: 0.05 * i }}
            whileHover={{ y: -2 }}
            onClick={() => onPick(x.q)}
            className="group flex items-start gap-3 rounded-2xl border border-border bg-background/60 p-3.5 text-left transition-colors hover:border-primary/50 hover:bg-primary/5"
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary">
              <x.icon className="size-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium">{x.title}</span>
              <span className="block text-xs text-muted-foreground group-hover:text-foreground">{x.q}</span>
            </span>
          </motion.button>
        ))}
      </div>
    </div>
  );
}

function Bubble({ t, pending, waiting, local }: { t: ChatTurn; pending: boolean; waiting: number; local: boolean }) {
  const mine = t.role === "aluno";
  const [copied, setCopied] = useState(false);
  const copy = () =>
    navigator.clipboard.writeText(t.text).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      toastError,
    );

  if (mine) {
    return (
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={spring.soft} className="flex flex-col items-end gap-1">
        <div className="max-w-[80%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm text-primary-foreground shadow-soft">
          <p className="whitespace-pre-wrap">{t.text}</p>
        </div>
        <span className="px-1 text-[10px] text-muted-foreground">{hhmm(t.at)}</span>
      </motion.div>
    );
  }
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={spring.soft} className="group flex items-start gap-3">
      <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-primary/12 ring-1 ring-primary/20">
        <Mascot look="cap" scale={1.5} />
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="w-fit max-w-full rounded-2xl rounded-tl-md border border-border bg-background/70 px-4 py-3 text-sm">
          {t.text ? (
            <>
              {/* HTML já escapado em liteMarkdown: só as tags que ele mesmo gera */}
              <div className="tutor-md space-y-2 leading-relaxed" dangerouslySetInnerHTML={{ __html: liteMarkdown(t.text) }} />
              {pending && <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse rounded-sm bg-primary align-middle" />}
            </>
          ) : (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Dots />
              <span className="text-xs">
                {waiting >= 8 ? `pensando há ${waiting} s${local ? "" : " (IAs da nuvem e o Claude respondem de uma vez)"}` : "pensando…"}
              </span>
            </div>
          )}
        </div>
        {!pending && t.text && (
          <div className="flex items-center gap-2 px-1 text-[10px] text-muted-foreground">
            <span>
              Grifo{t.by ? ` · ${t.by}` : ""} · {hhmm(t.at)}
              {t.stopped && " · interrompida"}
            </span>
            <button onClick={() => void copy()} className="inline-flex items-center gap-1 rounded px-1 py-0.5 opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground focus-visible:opacity-100" aria-label="Copiar a resposta">
              <AnimatePresence mode="wait" initial={false}>
                {copied ? (
                  <motion.span key="ok" initial={{ scale: 0 }} animate={{ scale: 1 }} className="inline-flex items-center gap-1 text-success">
                    <Check className="size-3" /> copiado
                  </motion.span>
                ) : (
                  <motion.span key="copy" initial={{ scale: 0 }} animate={{ scale: 1 }} className="inline-flex items-center gap-1">
                    <Copy className="size-3" /> copiar
                  </motion.span>
                )}
              </AnimatePresence>
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}

/** Três pontinhos pulando ("digitando"). */
function Dots() {
  return (
    <span className="flex items-center gap-1" aria-hidden>
      {[0, 1, 2].map((i) => (
        <motion.span key={i} className="size-1.5 rounded-full bg-primary" animate={{ y: [0, -4, 0], opacity: [0.5, 1, 0.5] }} transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }} />
      ))}
    </span>
  );
}
