import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { Layers, Pencil, Play, Plus, RotateCw, Sparkles, Trash2 } from "lucide-react";
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

type Status = "all" | "today" | "new" | "learning" | "mastered";
/** Intervalo a partir do qual o cartão conta como dominado (dias). */
const MASTERED_DAYS = 21;

function statusOf(c: DeckCard, today: string): Exclude<Status, "all"> {
  if (c.reps + c.interval_days === 0) return "new";
  if (c.due_at <= today) return "today";
  return c.interval_days >= MASTERED_DAYS ? "mastered" : "learning";
}

const STATUS: Record<Exclude<Status, "all">, { label: string; tone: string; dot: string }> = {
  today: { label: "Revisar hoje", tone: "text-destructive", dot: "bg-destructive" },
  new: { label: "Novo", tone: "text-primary", dot: "bg-primary" },
  learning: { label: "Aprendendo", tone: "text-amber-400", dot: "bg-amber-400" },
  mastered: { label: "Dominado", tone: "text-success", dot: "bg-success" },
};

/** Cartão do baralho: frente com a pergunta; clique (ou Enter/Espaço) vira e mostra a resposta. */
function DeckCardView({ c, today, onEdit, onRemove }: { c: DeckCard; today: string; onEdit: () => void; onRemove: () => void }) {
  const [flipped, setFlipped] = useState(false);
  const st = STATUS[statusOf(c, today)];
  const d = dueLabel(c, today);
  const flip = () => {
    sfx("flip");
    setFlipped((f) => !f);
  };
  const tools = (
    <span className="flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
      <button
        className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
        aria-label="Editar cartão"
        onClick={(e) => {
          e.stopPropagation();
          onEdit();
        }}
      >
        <Pencil className="size-3.5" />
      </button>
      <button
        className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-destructive"
        aria-label="Apagar cartão"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
      >
        <Trash2 className="size-3.5" />
      </button>
    </span>
  );
  return (
    <motion.li variants={itemIn} className="group [perspective:1200px]">
      <motion.div
        role="button"
        tabIndex={0}
        aria-pressed={flipped}
        aria-label={flipped ? "Verso: clique para ver a pergunta" : "Frente: clique para ver a resposta"}
        onClick={flip}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            flip();
          }
        }}
        initial={false}
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={{ duration: 0.45, ease: [0.4, 0, 0.2, 1] }}
        style={{ transformStyle: "preserve-3d" }}
        className="relative h-52 cursor-pointer rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {/* frente */}
        <div className="absolute inset-0 flex flex-col rounded-2xl border border-border bg-card p-4 shadow-soft transition-colors [backface-visibility:hidden] group-hover:border-primary/40">
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            {c.color && <span className="size-2 shrink-0 rounded-full" style={{ background: c.color }} />}
            <span className="min-w-0 flex-1 truncate">{c.topic ?? "sem tópico"}</span>
            {tools}
          </div>
          <p className="my-auto line-clamp-5 py-2 text-center text-[15px] leading-snug font-medium whitespace-pre-line">{c.front}</p>
          <div className="flex items-center gap-2 text-[11px]">
            <span className={cn("flex items-center gap-1 font-medium", st.tone)}>
              <span className={cn("size-1.5 rounded-full", st.dot)} /> {st.label}
            </span>
            <span className="text-muted-foreground">· {SOURCE[c.source] ?? c.source}</span>
            <span className="ml-auto flex items-center gap-1 text-muted-foreground">
              <RotateCw className="size-3" /> virar
            </span>
          </div>
        </div>
        {/* verso */}
        <div className="absolute inset-0 flex flex-col rounded-2xl border border-primary/40 bg-surface p-4 shadow-soft [backface-visibility:hidden] [transform:rotateY(180deg)]">
          <p className="line-clamp-2 text-xs text-muted-foreground">{c.front}</p>
          <span className="my-2 h-px w-full bg-border" />
          <p className="text-[11px] font-semibold tracking-widest text-primary uppercase">Resposta</p>
          <p className="mt-1 line-clamp-5 flex-1 overflow-hidden text-[15px] leading-snug whitespace-pre-line">{c.back}</p>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span>
              Próxima revisão: <span className={cn("font-medium", d.tone)}>{d.text}</span>
            </span>
            <span className="ml-auto">{plural(c.reps, "revisão", "revisões")}</span>
          </div>
        </div>
      </motion.div>
    </motion.li>
  );
}

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
  const [status, setStatus] = useState<Status>("all");
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

  const bySubject = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (cards ?? []).filter(
      (c) =>
        (filter === "all" || (filter === "none" ? c.subject_id === null : c.subject_id === filter)) &&
        (!q || c.front.toLowerCase().includes(q) || c.back.toLowerCase().includes(q) || (c.topic ?? "").toLowerCase().includes(q)),
    );
  }, [cards, filter, query]);
  const shown = status === "all" ? bySubject : bySubject.filter((c) => statusOf(c, today) === status);

  const tally = useMemo(() => {
    const t = { today: 0, new: 0, learning: 0, mastered: 0 };
    for (const c of cards ?? []) t[statusOf(c, today)]++;
    return t;
  }, [cards, today]);
  const due = tally.today;
  const fresh = Math.min(NEW_CARDS_PER_DAY, tally.new);
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
        <Skeleton className="h-36 rounded-2xl" />
        <div className="grid gap-3 @2xl:grid-cols-2 @5xl:grid-cols-3">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-52 rounded-2xl" />)}</div>
      </div>
    );
  }

  const total = cards.length;
  const masteredPct = total ? Math.round((tally.mastered / total) * 100) : 0;

  return (
    <div className="space-y-5">
      <section className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-soft">
        <div className="flex flex-wrap items-center gap-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary/15 text-primary">
            <Layers className="size-6" />
          </span>
          <div className="min-w-48 flex-1">
            <p className="text-lg font-semibold">{due + fresh > 0 ? `${due + fresh} ${due + fresh === 1 ? "cartão" : "cartões"} para hoje` : "Baralho em dia"}</p>
            <p className="text-sm text-muted-foreground">Repetição espaçada: o que você lembra volta cada vez mais tarde. Até {NEW_CARDS_PER_DAY} novos por dia.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={() => setEditor({ id: null, subject: null, topic: null, front: "", back: "" })}>
              <Plus /> Novo cartão
            </Button>
            <Button variant="secondary" onClick={() => onGenerateChange?.(true)}>
              <Sparkles /> Gerar com IA
            </Button>
            <Button size="lg" disabled={due + fresh === 0} onClick={review}>
              <Play /> Revisar agora
            </Button>
          </div>
        </div>
        {total > 0 && (
          <>
            <div className="grid grid-cols-2 gap-2 @2xl:grid-cols-4">
              {(["today", "new", "learning", "mastered"] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => setStatus(status === k ? "all" : k)}
                  aria-pressed={status === k}
                  className={cn("rounded-xl border p-3 text-left transition-colors", status === k ? "border-primary bg-primary/5" : "border-transparent bg-secondary/40 hover:border-border")}
                >
                  <p className={cn("tabular text-2xl font-semibold", STATUS[k].tone)}>{tally[k]}</p>
                  <p className="text-xs text-muted-foreground">{STATUS[k].label}</p>
                </button>
              ))}
            </div>
            <div className="space-y-1">
              <div className="flex h-2 overflow-hidden rounded-full bg-secondary">
                {(["mastered", "learning", "today", "new"] as const).map((k) => (
                  <span key={k} className={cn("h-full", STATUS[k].dot)} style={{ width: `${(tally[k] / total) * 100}%` }} />
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {plural(total, "cartão", "cartões")} · {masteredPct}% dominados (intervalo de {MASTERED_DAYS}+ dias)
              </p>
            </div>
          </>
        )}
      </section>

      {total === 0 ? (
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
              Todas as matérias <span className="opacity-60">{total}</span>
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
          <p className="text-xs text-muted-foreground">Toque num cartão para ver a resposta. Para valer a revisão, use Revisar agora.</p>

          <motion.ul key={`${filter}-${status}`} variants={listIn} initial="hidden" animate="show" className="grid gap-3 @2xl:grid-cols-2 @5xl:grid-cols-3">
            {shown.slice(0, PAGE).map((c) => (
              <DeckCardView
                key={c.id}
                c={c}
                today={today}
                onEdit={() => setEditor({ id: c.id, subject: c.subject_id, topic: c.topic_id, front: c.front, back: c.back })}
                onRemove={() => void remove(c)}
              />
            ))}
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
