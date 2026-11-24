import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { Eraser, SendHorizontal } from "lucide-react";
import { NativeSelect } from "@/components/fields";
import { Mascot } from "@/components/Mascot";
import { toastError } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { commands, type Subject, type Topic } from "@/lib/bindings";
import { spring } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { liteMarkdown } from "./lite-markdown";
import { askTutor, clearTutor, setTutorContext, setTutorVisible, useTutor } from "./tutorStore";

/** Sugestões para começar (a pessoa clica e vira a pergunta). */
const STARTERS = ["Me explica isso como se eu nunca tivesse visto", "Qual a pegadinha que a banca mais usa aqui?", "Faz um resumo em 5 tópicos", "Me dá um exemplo prático"];

/** Tira-dúvidas ("Pergunte ao Grifo"): chat com a IA sobre a matéria ou o tópico escolhido. */
export default function TutorTab() {
  const s = useTutor();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [text, setText] = useState("");
  const [now, setNow] = useState(Date.now());
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTutorVisible(true);
    commands.listSubjects().then(setSubjects, toastError);
    return () => setTutorVisible(false);
  }, []);
  useEffect(() => {
    if (s.subjectId === null) return setTopics([]);
    commands.listTopics(s.subjectId).then(setTopics, toastError);
  }, [s.subjectId]);
  useEffect(() => bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" }), [s.turns]);
  // relógio do "ainda pensando…"
  useEffect(() => {
    if (!s.busy) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [s.busy]);

  const send = (q: string) => {
    void askTutor(q);
    setText("");
  };
  const waiting = s.busy && s.since !== null ? Math.floor((now - s.since) / 1000) : 0;
  const subject = subjects.find((x) => x.id === s.subjectId);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <header className="flex flex-wrap items-center gap-3">
        <h2 className="retro mr-auto text-xs text-primary">Pergunte ao Grifo</h2>
        <NativeSelect className="w-auto max-w-64" value={s.subjectId ?? ""} onChange={(e) => setTutorContext(e.target.value ? Number(e.target.value) : null, null)} aria-label="Matéria">
          <option value="">Qualquer matéria</option>
          {subjects.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </NativeSelect>
        {topics.length > 0 && (
          <NativeSelect className="w-auto max-w-72" value={s.topicId ?? ""} onChange={(e) => setTutorContext(s.subjectId, e.target.value ? Number(e.target.value) : null)} aria-label="Tópico">
            <option value="">A matéria toda</option>
            {topics.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name.length > 70 ? `${t.name.slice(0, 70)}…` : t.name}
              </option>
            ))}
          </NativeSelect>
        )}
        <Button size="sm" variant="ghost" disabled={s.busy || s.turns.length === 0} onClick={clearTutor} title="Começar outra conversa">
          <Eraser /> Limpar
        </Button>
      </header>

      <div className="min-h-[50vh] space-y-4 rounded-2xl border border-border bg-card p-4">
        {s.turns.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <motion.div animate={{ y: [0, -5, 0] }} transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}>
              <Mascot look="cap" scale={5} />
            </motion.div>
            <p className="max-w-md text-sm text-muted-foreground">
              {subject ? `Pergunte qualquer coisa de ${subject.name}.` : "Escolha a matéria (opcional) e pergunte."} Eu explico, dou exemplo e
              conto como a banca cobra. Pode sair da aba: eu aviso quando responder.
            </p>
            <div className="flex flex-wrap justify-center gap-1.5">
              {STARTERS.map((q) => (
                <button key={q} onClick={() => setText(q)} className="rounded-full bg-secondary px-3 py-1 text-xs hover:bg-primary/15 hover:text-primary">
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
        {s.turns.map((t, i) => {
          const mine = t.role === "aluno";
          const pending = !mine && s.busy && i === s.turns.length - 1;
          return (
            <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={spring.soft} className={cn("flex items-end gap-2", mine && "justify-end")}>
              {!mine && (
                <span className="shrink-0">
                  <Mascot look="cap" scale={2} />
                </span>
              )}
              <div className={cn("max-w-[85%] rounded-2xl px-4 py-2.5 text-sm", mine ? "bg-primary text-primary-foreground" : "border border-border bg-background")}>
                {mine ? (
                  <p className="whitespace-pre-wrap">{t.text}</p>
                ) : t.text ? (
                  // HTML já escapado em liteMarkdown: só as tags que ele mesmo gera
                  <div className="tutor-md space-y-2 leading-relaxed" dangerouslySetInnerHTML={{ __html: liteMarkdown(t.text) }} />
                ) : (
                  <p className="text-muted-foreground">
                    Pensando{waiting >= 8 ? ` há ${waiting} s… pode sair da aba, eu aviso quando responder` : "…"}
                  </p>
                )}
                {pending && t.text && <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-current align-middle" />}
              </div>
            </motion.div>
          );
        })}
        <div ref={bottom} />
      </div>

      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(text);
            }
          }}
          rows={2}
          placeholder="Escreva a sua dúvida (Enter envia, Shift+Enter quebra a linha)"
          className="min-h-12 flex-1 resize-none"
          aria-label="Sua dúvida"
        />
        <Button type="submit" size="lg" disabled={s.busy || !text.trim()} className="h-12">
          <SendHorizontal /> Perguntar
        </Button>
      </form>
    </div>
  );
}
