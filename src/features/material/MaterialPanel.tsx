import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { BookOpenText, ExternalLink, FileText, Layers, ListChecks, Loader2, Sparkles, Trash2, TriangleAlert, Lightbulb, X } from "lucide-react";
import { MascotEmpty } from "@/components/MascotEmpty";
import { Skeleton } from "@/components/motion";
import { toast, toastError } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { commands, events, type MaterialKind, type Material, type MaterialView } from "@/lib/bindings";
import { parseUtc } from "@/lib/format";
import { useTauriEvent } from "@/lib/hooks";
import { itemIn, listIn } from "@/lib/motion";
import { CANCELLED, FLASHCARDS_PER_MATERIAL } from "@/lib/rules";
import { cn, errorMessage } from "@/lib/utils";
import { FlashcardDeck } from "./FlashcardDeck";
import { parseFlashcards } from "./flashcards";
import { PAPER_DESK, paperDocument } from "./paper";

const PROVIDER_LABEL: Record<string, string> = { ollama: "Ollama", claude: "Claude", gemini: "Gemini", openai: "GPT", grok: "Grok", deepseek: "DeepSeek", glm: "GLM", custom: "Outra IA" };

const KINDS: { id: MaterialKind; label: string; hint: string; icon: typeof FileText }[] = [
  { id: "resumo", label: "Resumo", hint: "Teoria enxuta com caixas de dica e pegadinha", icon: BookOpenText },
  { id: "questoes", label: "Questões", hint: "Inéditas, no estilo da banca, com gabarito comentado", icon: ListChecks },
  { id: "flashcards", label: "Flashcards", hint: `${FLASHCARDS_PER_MATERIAL} cartões frente/verso`, icon: Layers },
  { id: "pegadinhas", label: "Pegadinhas", hint: "Como a banca troca as palavras", icon: TriangleAlert },
  { id: "mnemonico", label: "Mnemônicos", hint: "Siglas e frases para listas", icon: Lightbulb },
];
const LABEL = Object.fromEntries(KINDS.map((k) => [k.id, k.label])) as Record<string, string>;

function when(iso: string) {
  return parseUtc(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/** Materiais do Grifo de um tópico: gerar (rápido ou completo), listar e ler na própria tela. */
export function MaterialPanel({ topicId, topicName }: { topicId: number; topicName: string }) {
  const [list, setList] = useState<Material[] | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [view, setView] = useState<MaterialView | null>(null);
  const [busy, setBusy] = useState<{ kind: MaterialKind; full: boolean } | null>(null);
  const [progress, setProgress] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [study, setStudy] = useState(true);

  const load = useCallback(async () => {
    try {
      const items = await commands.listMaterials(topicId);
      setList(items);
      setSelected((s) => s ?? items[0]?.id ?? null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [topicId]);
  useEffect(() => void load(), [load]);

  useEffect(() => {
    if (selected === null) return setView(null);
    setView(null);
    commands.materialView(selected).then(setView, (e) => setError(errorMessage(e)));
  }, [selected]);

  useTauriEvent(events.grifoEvent, (e) => {
    if (e.topic_id === topicId) setProgress((p) => [...p.slice(-5), e.text]);
  });

  async function generate(kind: MaterialKind, full: boolean) {
    setBusy({ kind, full });
    setProgress([]);
    setError("");
    try {
      const r = await commands.generateMaterial(topicId, kind, full);
      if (r.note) toast(r.note, "info");
      toast(`${LABEL[kind]} pronto`, "success");
      setSelected(r.material.id);
      await load();
    } catch (e) {
      const msg = errorMessage(e);
      if (msg !== CANCELLED) setError(msg);
    } finally {
      setBusy(null);
    }
  }

  async function remove(m: Material) {
    if (!window.confirm(`Apagar este ${LABEL[m.kind].toLowerCase()}?`)) return;
    try {
      await commands.deleteMaterial(m.id);
      if (selected === m.id) setSelected(null);
      await load();
    } catch (e) {
      toastError(e);
    }
  }

  const doc = useMemo(() => {
    if (!view) return null;
    if (view.html) return view.html;
    if (view.markdown) return paperDocument(view.markdown, `${LABEL[view.material.kind]} — ${topicName}`);
    return null;
  }, [view, topicName]);

  const cards = useMemo(
    () => (view?.material.kind === "flashcards" && view.markdown ? parseFlashcards(view.markdown) : []),
    [view],
  );

  return (
    <div className="grid h-full grid-cols-[300px_minmax(0,1fr)]">
      <aside className="flex min-h-0 flex-col gap-5 overflow-y-auto border-r border-border p-5">
        <section className="space-y-2">
          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Gerar agora</h3>
          <motion.div variants={listIn} initial="hidden" animate="show" className="grid gap-1.5">
            {KINDS.map((k, i) => {
              const Icon = k.icon;
              const running = busy?.kind === k.id && !busy.full;
              return (
                <motion.button
                  key={k.id}
                  variants={itemIn}
                  whileTap={{ scale: 0.98 }}
                  disabled={!!busy}
                  onClick={() => void generate(k.id, false)}
                  className={cn(
                    "group flex items-start gap-3 rounded-lg border p-2.5 text-left transition-colors disabled:opacity-50",
                    i === 0 ? "border-primary/50 bg-primary/10 hover:bg-primary/15" : "border-border hover:bg-secondary/60",
                  )}
                >
                  {running ? <Loader2 className="mt-0.5 size-4 animate-spin text-primary" /> : <Icon className="mt-0.5 size-4 text-primary" />}
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{k.label}</span>
                    <span className="block text-xs text-muted-foreground">{k.hint}</span>
                  </span>
                </motion.button>
              );
            })}
          </motion.div>
          <p className="text-[11px] text-muted-foreground">Rápido e grátis pelo Ollama (ou o que estiver em Config → IA).</p>
        </section>

        <section className="space-y-2 rounded-lg border border-dashed border-border p-3">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <Sparkles className="size-4 text-primary" /> Apostila completa
          </p>
          <p className="text-xs text-muted-foreground">
            O Claude roda a skill do Grifo inteira: A4 ilustrado, com fontes conferidas. Leva alguns minutos e usa bastante da sua assinatura.
          </p>
          <Button size="sm" variant="secondary" disabled={!!busy} onClick={() => void generate("resumo", true)}>
            {busy?.full ? <Loader2 className="animate-spin" /> : null}
            Gerar com Claude
          </Button>
        </section>

        <AnimatePresence>
          {busy && (
            <motion.section
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: { duration: 0.12 } }}
              className="space-y-2 rounded-lg bg-secondary/60 p-3"
              aria-live="polite"
            >
              <div className="flex items-center gap-2 text-sm font-medium">
                <Loader2 className="size-4 animate-spin text-primary" />
                <span className="flex-1">Gerando {LABEL[busy.kind].toLowerCase()}…</span>
                <button
                  onClick={() => commands.cancelMaterial(topicId).catch(toastError)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive"
                >
                  <X className="size-3.5" /> Cancelar
                </button>
              </div>
              <ul className="space-y-0.5 text-xs text-muted-foreground">
                {progress.map((p, i) => (
                  <motion.li key={`${i}-${p}`} initial={{ opacity: 0, x: -6 }} animate={{ opacity: i === progress.length - 1 ? 1 : 0.55, x: 0 }} className="truncate">
                    {p}
                  </motion.li>
                ))}
              </ul>
            </motion.section>
          )}
        </AnimatePresence>

        {error && <p className="rounded-md bg-destructive/10 p-2.5 text-sm text-destructive">{error}</p>}

        <section className="space-y-2">
          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Seus materiais</h3>
          {list === null ? (
            <div className="space-y-1.5">
              {[0, 1].map((i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
            </div>
          ) : list.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nada ainda. Comece pelo resumo.</p>
          ) : (
            <motion.ul variants={listIn} initial="hidden" animate="show" className="space-y-1">
              {list.map((m) => (
                <motion.li key={m.id} variants={itemIn} layout>
                  <div
                    className={cn(
                      "group flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm",
                      selected === m.id ? "bg-secondary" : "hover:bg-secondary/50",
                    )}
                  >
                    <button className="min-w-0 flex-1 text-left" onClick={() => setSelected(m.id)}>
                      <span className="block font-medium">
                        {LABEL[m.kind]} {m.full && <span className="ml-1 rounded bg-primary/15 px-1 text-[10px] text-primary">apostila</span>}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {when(m.created_at)} · {PROVIDER_LABEL[m.provider] ?? m.provider}
                      </span>
                    </button>
                    <button onClick={() => void remove(m)} aria-label="Apagar material" className="opacity-0 transition-opacity group-hover:opacity-60 hover:!opacity-100">
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </motion.li>
              ))}
            </motion.ul>
          )}
        </section>
      </aside>

      <div className="relative min-h-0" style={{ background: PAPER_DESK }}>
        {cards.length > 0 && (
          <div className="absolute top-3 left-1/2 z-10 flex -translate-x-1/2 gap-1 rounded-lg bg-card p-1 shadow-soft">
            <button
              onClick={() =>
                view &&
                void commands.cardsFromMaterial(view.material.id).then(
                  (n) => toast(n ? `${n} cartões no seu baralho (revisão espaçada em Estudo)` : "Esses cartões já estavam no baralho", "success"),
                  toastError,
                )
              }
              className="rounded-md px-3 py-1 text-sm text-primary hover:bg-primary/10"
            >
              Salvar no baralho
            </button>
            {([[true, "Estudar"], [false, "Ver folha"]] as const).map(([v, label]) => (
              <button
                key={label}
                onClick={() => setStudy(v)}
                className={cn("rounded-md px-3 py-1 text-sm", study === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        {cards.length > 0 && study ? (
          <FlashcardDeck key={view?.material.id} cards={cards} />
        ) : doc ? (
          <>
            <iframe title="Material" sandbox="" srcDoc={doc} className="size-full border-0" />
            {view?.material.path && (
              <Button size="sm" variant="secondary" className="absolute top-3 right-4 shadow-soft" onClick={() => commands.openMaterialFile(view.material.id).catch(toastError)}>
                <ExternalLink /> Abrir arquivo / imprimir
              </Button>
            )}
          </>
        ) : selected !== null && !view ? (
          <div className="mx-auto mt-10 max-w-[820px] space-y-3 rounded-md bg-white p-12">
            {[80, 95, 60, 90, 70].map((w, i) => (
              <Skeleton key={i} className="h-4 rounded" style={{ width: `${w}%`, opacity: 0.5 }} />
            ))}
          </div>
        ) : view?.material.path ? (
          <EmptyState text="Este material é um PDF." action={<Button onClick={() => commands.openMaterialFile(view.material.id).catch(toastError)}>Abrir PDF</Button>} />
        ) : (
          <EmptyState
            text={busy ? "O Grifo está escrevendo…" : "Escolha um material para gerar. O resumo também vira a referência da Sala de aula."}
            action={busy ? null : <Button onClick={() => void generate("resumo", false)}>Gerar resumo</Button>}
          />
        )}
      </div>
    </div>
  );
}

function EmptyState({ text, action }: { text: string; action: React.ReactNode }) {
  return (
    <MascotEmpty text={text} scale={5} className="h-full justify-center rounded-none border-0 bg-background p-8">
      {action}
    </MascotEmpty>
  );
}
