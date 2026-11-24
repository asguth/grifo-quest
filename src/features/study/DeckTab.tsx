import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { Layers, Pencil, Play, Plus, Sparkles, Trash2 } from "lucide-react";
import { Chip, NativeSelect, SearchInput } from "@/components/fields";
import { Skeleton } from "@/components/motion";
import { toast, toastError } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Sheet } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { commands, type DeckCard_Serialize as DeckCard, type Subject, type Topic } from "@/lib/bindings";
import { isoDay } from "@/lib/dates";
import { plural } from "@/lib/format";
import { itemIn, listIn } from "@/lib/motion";
import { NEW_CARDS_PER_DAY } from "@/lib/rules";
import { sfx } from "@/lib/sound";
import { cn, warn } from "@/lib/utils";
import { CardGenerator } from "./CardGenerator";

const SOURCE: Record<string, string> = { grifo: "IA", erro: "Erro", manual: "Seu" };
/** Mostra no máximo isso de uma vez (baralho grande não trava a tela). */
const PAGE = 120;

function dueLabel(c: DeckCard, today: string) {
  if (c.reps + c.interval_days === 0) return { text: "novo", tone: "text-primary" };
  if (c.due_at <= today) return { text: "hoje", tone: "text-destructive" };
  const days = Math.round((new Date(c.due_at).getTime() - new Date(today).getTime()) / 86_400_000);
  return { text: days === 1 ? "amanhã" : `em ${days} dias`, tone: "text-muted-foreground" };
}

type Editor = { id: number | null; subject: number | null; topic: number | null; front: string; back: string };

/** Baralho: revisar o dia, gerar com IA, achar, criar, editar e apagar cartões. */
export function DeckTab({
  review,
  onChange,
  generate = false,
  onGenerateChange,
}: {
  review: () => void;
  onChange: () => void;
  /** Gaveta "Gerar com IA" aberta (controlada pela tela de Estudo, que abre de outros lugares). */
  generate?: boolean;
  onGenerateChange?: (open: boolean) => void;
}) {
  const [cards, setCards] = useState<DeckCard[] | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [filter, setFilter] = useState<number | "all" | "none">("all");
  const [query, setQuery] = useState("");
  const [editor, setEditor] = useState<Editor | null>(null);
  const today = isoDay(new Date());

  const load = useCallback(async () => {
    try {
      setCards(await commands.listCards());
    } catch (e) {
      toastError(e);
    }
  }, []);
  useEffect(() => {
    void load();
    void commands.listSubjects().then(setSubjects, (e) => warn("ler as matérias", e));
  }, [load]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (cards ?? []).filter(
      (c) =>
        (filter === "all" || (filter === "none" ? c.subject_id === null : c.subject_id === filter)) &&
        (!q || c.front.toLowerCase().includes(q) || c.back.toLowerCase().includes(q) || (c.topic ?? "").toLowerCase().includes(q)),
    );
  }, [cards, filter, query]);

  const due = (cards ?? []).filter((c) => c.reps + c.interval_days > 0 && c.due_at <= today).length;
  const fresh = Math.min(NEW_CARDS_PER_DAY, (cards ?? []).filter((c) => c.reps + c.interval_days === 0).length);
  const counts = useMemo(() => {
    const m = new Map<number | null, number>();
    for (const c of cards ?? []) m.set(c.subject_id, (m.get(c.subject_id) ?? 0) + 1);
    return m;
  }, [cards]);

  async function remove(c: DeckCard) {
    if (!window.confirm("Apagar este cartão?")) return;
    setCards((cs) => cs && cs.filter((x) => x.id !== c.id));
    try {
      await commands.deleteCard(c.id);
      onChange();
    } catch (e) {
      toastError(e);
      void load();
    }
  }

  if (cards === null) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28 rounded-2xl" />
        <div className="grid gap-3 @@4xl:grid-cols-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28 rounded-xl" />)}</div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="flex flex-wrap items-center gap-5 rounded-2xl border border-border bg-card p-5">
        <Layers className="size-8 text-primary" />
        <div className="min-w-48 flex-1">
          <p className="text-lg font-semibold">{due + fresh > 0 ? `${due} para revisar${fresh ? ` + ${plural(fresh, "novo", "novos")}` : ""}` : "Baralho em dia"}</p>
          <p className="text-sm text-muted-foreground">
            {plural(cards.length, "cartão", "cartões")} · repetição espaçada: o que você lembra volta cada vez mais tarde. Até {NEW_CARDS_PER_DAY} novos por dia.
          </p>
        </div>
        <Button variant="ghost" onClick={() => setEditor({ id: null, subject: null, topic: null, front: "", back: "" })}>
          <Plus /> Novo cartão
        </Button>
        <Button variant="secondary" onClick={() => onGenerateChange?.(true)}>
          <Sparkles /> Gerar com IA
        </Button>
        <Button size="lg" disabled={due + fresh === 0} onClick={review}>
          <Play /> Revisar agora
        </Button>
      </section>

      {cards.length === 0 ? (
        <div className="space-y-2 rounded-2xl border border-dashed border-border p-10 text-center">
          <p className="font-semibold">Seu baralho está vazio</p>
          <p className="mx-auto max-w-lg text-sm text-muted-foreground">
            Gere cartões com a IA a partir de um tópico do edital ou de um texto seu, crie à mão (lei seca, prazos, exceções) ou vire flashcard a
            questão que errar.
          </p>
          <Button className="mt-2" onClick={() => onGenerateChange?.(true)}>
            <Sparkles /> Gerar meus primeiros cartões
          </Button>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput value={query} onChange={setQuery} placeholder="Procurar no baralho" className="w-64" />
            <Chip on={filter === "all"} onClick={() => setFilter("all")}>
              Todos <span className="opacity-60">{cards.length}</span>
            </Chip>
            {subjects
              .filter((s) => counts.has(s.id))
              .map((s) => (
                <Chip key={s.id} on={filter === s.id} onClick={() => setFilter(s.id)}>
                  <span className="size-2 rounded-full" style={{ background: s.color }} /> {s.name} <span className="opacity-60">{counts.get(s.id)}</span>
                </Chip>
              ))}
            {counts.has(null) && (
              <Chip on={filter === "none"} onClick={() => setFilter("none")}>
                Sem matéria <span className="opacity-60">{counts.get(null)}</span>
              </Chip>
            )}
          </div>

          <motion.ul variants={listIn} initial="hidden" animate="show" className="grid gap-3 @@4xl:grid-cols-2">
            {shown.slice(0, PAGE).map((c) => {
                const d = dueLabel(c, today);
                return (
                  <motion.li key={c.id} variants={itemIn} className="group relative flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
                    <p className="line-clamp-3 pr-14 text-sm font-medium whitespace-pre-line">{c.front}</p>
                    <p className="line-clamp-2 text-sm whitespace-pre-line text-muted-foreground">{c.back}</p>
                    <p className="mt-auto flex items-center gap-2 text-[11px] text-muted-foreground">
                      {c.color && <span className="size-2 shrink-0 rounded-full" style={{ background: c.color }} />}
                      <span className="min-w-0 flex-1 truncate">{c.topic ?? "sem tópico"}</span>
                      <span className="rounded bg-secondary px-1.5">{SOURCE[c.source] ?? c.source}</span>
                      <span className={cn("font-medium", d.tone)}>{d.text}</span>
                    </p>
                    <span className="absolute top-2 right-2 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                      <button
                        className="rounded p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                        aria-label="Editar cartão"
                        onClick={() => setEditor({ id: c.id, subject: c.subject_id, topic: c.topic_id, front: c.front, back: c.back })}
                      >
                        <Pencil className="size-3.5" />
                      </button>
                      <button className="rounded p-1.5 text-muted-foreground hover:bg-secondary hover:text-destructive" aria-label="Apagar cartão" onClick={() => void remove(c)}>
                        <Trash2 className="size-3.5" />
                      </button>
                    </span>
                  </motion.li>
                );
              })}
          </motion.ul>
          {shown.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Nenhum cartão com esse filtro.</p>}
          {shown.length > PAGE && <p className="text-center text-xs text-muted-foreground">Mostrando {PAGE} de {shown.length}. Use a busca para achar o resto.</p>}
        </>
      )}

      <Sheet
        open={generate}
        onOpenChange={(o) => onGenerateChange?.(o)}
        title="Gerar flashcards com IA"
        description="Tópico do edital, tema livre ou texto colado. Você revisa antes de salvar."
      >
        <CardGenerator
          subjects={subjects}
          onSaved={() => {
            void load();
            onChange();
          }}
        />
      </Sheet>

      <Sheet open={editor !== null} onOpenChange={(o) => !o && setEditor(null)} title={editor?.id ? "Editar cartão" : "Novo cartão"} description="Ctrl+Enter salva. Uma ideia por cartão: pergunta curta, resposta curta.">
        {editor && (
          <CardEditor
            key={editor.id ?? "new"}
            initial={editor}
            subjects={subjects}
            onSaved={(keepOpen) => {
              void load();
              onChange();
              if (!keepOpen) setEditor(null);
            }}
          />
        )}
      </Sheet>
    </div>
  );
}


function CardEditor({ initial, subjects, onSaved }: { initial: Editor; subjects: Subject[]; onSaved: (keepOpen: boolean) => void }) {
  const [f, setF] = useState(initial);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [saving, setSaving] = useState(false);
  const frontRef = useRef<HTMLTextAreaElement>(null);
  const isNew = f.id === null;

  useEffect(() => {
    if (f.subject === null) return setTopics([]);
    void commands.listTopics(f.subject).then(setTopics, (e) => (warn("ler os tópicos", e), setTopics([])));
  }, [f.subject]);

  async function save() {
    if (!f.front.trim() || !f.back.trim() || saving) return;
    setSaving(true);
    try {
      if (f.id === null) {
        const n = await commands.createCard(f.topic, f.front, f.back);
        if (!n) return toast("Já existe um cartão com essa frente", "info");
        sfx("coin");
        toast("Cartão criado. Pode escrever o próximo.", "success");
        setF({ ...f, front: "", back: "" }); // mantém matéria e tópico: costuma criar vários seguidos
        frontRef.current?.focus();
        onSaved(true);
      } else {
        await commands.updateCard(f.id, f.front, f.back);
        toast("Cartão salvo", "success");
        onSaved(false);
      }
    } catch (e) {
      toastError(e);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      className="max-w-2xl space-y-4 p-6"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && e.ctrlKey) {
          e.preventDefault();
          void save();
        }
      }}
    >
      {isNew && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="card-subject">Matéria (opcional)</Label>
            <NativeSelect id="card-subject" value={f.subject ?? ""} onChange={(e) => setF({ ...f, subject: e.target.value ? Number(e.target.value) : null, topic: null })}>
              <option value="">Sem matéria</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-1">
            <Label htmlFor="card-topic">Tópico</Label>
            <NativeSelect id="card-topic" value={f.topic ?? ""} disabled={f.subject === null} onChange={(e) => setF({ ...f, topic: e.target.value ? Number(e.target.value) : null })}>
              <option value="">{f.subject === null ? "Escolha a matéria" : "Sem tópico"}</option>
              {topics.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </NativeSelect>
          </div>
        </div>
      )}
      <div className="space-y-1">
        <Label htmlFor="card-front">Frente (pergunta)</Label>
        <Textarea id="card-front" ref={frontRef} autoFocus rows={4} value={f.front} onChange={(e) => setF({ ...f, front: e.target.value })} placeholder="Prazo para impetrar mandado de segurança?" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="card-back">Verso (resposta)</Label>
        <Textarea id="card-back" rows={4} value={f.back} onChange={(e) => setF({ ...f, back: e.target.value })} placeholder="120 dias da ciência do ato (Lei 12.016/09, art. 23)" />
      </div>
      <Button type="submit" disabled={saving || !f.front.trim() || !f.back.trim()}>
        {isNew ? "Criar cartão" : "Salvar"} <kbd className="ml-1 text-[10px] opacity-60">Ctrl+Enter</kbd>
      </Button>
    </form>
  );
}
