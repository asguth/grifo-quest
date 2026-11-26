import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, Loader2, Sparkles, Trash2 } from "lucide-react";
import { NativeSelect } from "@/components/fields";
import { Segmented } from "@/components/Segmented";
import { Skeleton } from "@/components/motion";
import { toast, toastError } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { commands, type CardDraft, type Subject, type Topic } from "@/lib/bindings";
import { itemIn, listIn } from "@/lib/motion";
import { sfx } from "@/lib/sound";
import { cn, errorMessage, warn } from "@/lib/utils";

type Draft = CardDraft & { keep: boolean };
const COUNTS: ["5" | "10" | "20", string][] = [
  ["5", "5"],
  ["10", "10"],
  ["20", "20"],
];

/**
 * Gerar flashcards com IA: escolha um tópico do edital, um tema livre e/ou cole um texto. A IA
 * devolve uma prévia; você desmarca ou edita o que quiser e salva no baralho.
 */
export function CardGenerator({ subjects, onSaved }: { subjects: Subject[]; onSaved: (n: number) => void }) {
  const [subject, setSubject] = useState<number | null>(null);
  const [topic, setTopic] = useState<number | null>(null);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [theme, setTheme] = useState("");
  const [text, setText] = useState("");
  const [showText, setShowText] = useState(false);
  const [count, setCount] = useState<"5" | "10" | "20">("10");
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [busy, setBusy] = useState<"gen" | "save" | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (subject === null) {
      setTopics([]);
      return;
    }
    void commands.listTopics(subject).then(setTopics, (e) => (warn("ler os tópicos", e), setTopics([])));
  }, [subject]);

  const canGenerate = topic !== null || theme.trim() !== "" || text.trim() !== "";

  async function generate() {
    setBusy("gen");
    setError("");
    setDrafts(null);
    try {
      const cs = await commands.generateCards(topic, theme, text, Number(count));
      setDrafts(cs.map((c) => ({ ...c, keep: true })));
      sfx("coin");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    const chosen = (drafts ?? []).filter((d) => d.keep && d.front.trim() && d.back.trim());
    if (!chosen.length) return;
    setBusy("save");
    try {
      const n = await commands.saveCards(topic, chosen.map(({ front, back }) => ({ front, back })));
      toast(n === chosen.length ? `${n} cartões no baralho` : `${n} novos no baralho (${chosen.length - n} já existiam)`, "success");
      sfx("chime");
      setDrafts(null);
      onSaved(n);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(null);
    }
  }

  const edit = (i: number, patch: Partial<Draft>) => setDrafts((ds) => ds && ds.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  const kept = drafts?.filter((d) => d.keep).length ?? 0;

  return (
    <div className="grid gap-6 p-6 @3xl:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (canGenerate && !busy) void generate();
        }}
      >
        <div className="space-y-1">
          <Label htmlFor="gen-subject">Matéria</Label>
          <NativeSelect id="gen-subject" value={subject ?? ""} onChange={(e) => (setSubject(e.target.value ? Number(e.target.value) : null), setTopic(null))}>
            <option value="">Nenhuma (tema livre)</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1">
          <Label htmlFor="gen-topic">Tópico do edital</Label>
          <NativeSelect id="gen-topic" value={topic ?? ""} disabled={subject === null} onChange={(e) => setTopic(e.target.value ? Number(e.target.value) : null)}>
            <option value="">{subject === null ? "Escolha a matéria" : "Escolha o tópico"}</option>
            {topics.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1">
          <Label htmlFor="gen-theme">Foco (opcional)</Label>
          <Input id="gen-theme" value={theme} onChange={(e) => setTheme(e.target.value)} placeholder="ex.: prazos do mandado de segurança" />
        </div>
        {showText ? (
          <div className="space-y-1">
            <Label htmlFor="gen-text">Texto base</Label>
            <Textarea id="gen-text" rows={7} value={text} onChange={(e) => setText(e.target.value)} placeholder="Cole aqui um artigo de lei, um resumo ou anotações: os cartões saem só dele." />
          </div>
        ) : (
          <button type="button" className="text-sm text-primary hover:underline" onClick={() => setShowText(true)}>
            + Colar um texto para virar cartões
          </button>
        )}
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm">Quantos cartões</span>
          <Segmented label="Quantos cartões" value={count} onChange={setCount} options={COUNTS} />
        </div>
        <Button type="submit" size="lg" className="w-full" disabled={!canGenerate || !!busy}>
          {busy === "gen" ? <Loader2 className="animate-spin" /> : <Sparkles />} {busy === "gen" ? "Gerando…" : "Gerar cartões"}
        </Button>
        {error && <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
        <p className="text-xs text-muted-foreground">Usa a IA de “Materiais rápidos” de Configurações → IA.</p>
      </form>

      <section className="min-w-0 space-y-3">
        {busy === "gen" ? (
          <div className="space-y-2" aria-live="polite">
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Sparkles className="size-4 text-primary" /> A IA está escrevendo os cartões…
            </p>
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
          </div>
        ) : drafts ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <p className="flex-1 text-sm">
                <b>{kept}</b> de {drafts.length} marcados · edite o que quiser antes de salvar
              </p>
              <Button disabled={!kept || !!busy} onClick={() => void save()}>
                {busy === "save" ? <Loader2 className="animate-spin" /> : <Check />} Salvar {kept} no baralho
              </Button>
            </div>
            <motion.ul variants={listIn} initial="hidden" animate="show" className="space-y-2">
              <AnimatePresence>
                {drafts.map((d, i) => (
                  <motion.li
                    key={i}
                    variants={itemIn}
                    exit="exit"
                    className={cn("grid gap-2 rounded-xl border bg-card p-3 transition-opacity @xl:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)_auto]", d.keep ? "border-border" : "border-dashed border-border opacity-50")}
                  >
                    <input type="checkbox" checked={d.keep} onChange={(e) => edit(i, { keep: e.target.checked })} aria-label={`Manter o cartão ${i + 1}`} className="mt-2 size-4 accent-[var(--primary)]" />
                    <Textarea rows={2} value={d.front} onChange={(e) => edit(i, { front: e.target.value })} aria-label={`Frente do cartão ${i + 1}`} className="min-h-0 text-sm font-medium" />
                    <Textarea rows={2} value={d.back} onChange={(e) => edit(i, { back: e.target.value })} aria-label={`Verso do cartão ${i + 1}`} className="min-h-0 text-sm" />
                    <button
                      className="self-start rounded p-1.5 text-muted-foreground hover:bg-secondary hover:text-destructive"
                      aria-label={`Descartar o cartão ${i + 1}`}
                      onClick={() => setDrafts((ds) => ds && ds.filter((_, j) => j !== i))}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </motion.li>
                ))}
              </AnimatePresence>
            </motion.ul>
          </>
        ) : (
          <div className="grid h-full min-h-60 place-items-center rounded-2xl border border-dashed border-border p-8 text-center">
            <div className="max-w-sm space-y-2">
              <Sparkles className="mx-auto size-8 text-primary" />
              <p className="font-medium">Cartões prontos em segundos</p>
              <p className="text-sm text-muted-foreground">
                Escolha um tópico do edital, escreva um foco ou cole um texto. Você revisa a prévia antes de qualquer cartão entrar no baralho.
              </p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
