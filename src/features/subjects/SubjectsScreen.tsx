import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { BookOpenText, Check, Pencil, Plus, Trash2 } from "lucide-react";
import { MascotEmpty } from "@/components/MascotEmpty";
import { Skeleton } from "@/components/motion";
import { ProgressBar } from "@/components/Progress";
import { toastError } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { MaterialPanel } from "@/features/material/MaterialPanel";
import { ImportEditalButton } from "@/features/onboarding/ImportEdital";
import { commands, type Subject, type SubjectInput, type Topic } from "@/lib/bindings";
import { pct } from "@/lib/format";
import { itemIn, listIn, spring } from "@/lib/motion";
import { sfx } from "@/lib/sound";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

export default function SubjectsScreen() {
  const [subjects, setSubjects] = useState<Subject[] | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [editor, setEditor] = useState<{ id: number | null; form: SubjectInput } | null>(null);
  // Matéria nova nasce na cor de destaque do tema (o seletor de cor só aceita hex).
  const accent = useTheme().colors.primary;

  const reload = useCallback(async () => {
    try {
      const list = await commands.listSubjects();
      setSubjects(list);
      setSelected((s) => (s !== null && list.some((x) => x.id === s) ? s : (list[0]?.id ?? null)));
    } catch (e) {
      toastError(e);
    }
  }, []);
  useEffect(() => void reload(), [reload]);

  async function saveSubject(e: React.FormEvent) {
    e.preventDefault();
    if (!editor) return;
    try {
      if (editor.id === null) setSelected(await commands.createSubject(editor.form));
      else await commands.updateSubject(editor.id, editor.form);
      setEditor(null);
      await reload();
    } catch (err) {
      toastError(err);
    }
  }

  async function remove(s: Subject) {
    if (!window.confirm(`Apagar "${s.name}" com todos os tópicos e lançamentos?`)) return;
    await commands.deleteSubject(s.id).catch(toastError);
    await reload();
  }

  if (subjects === null) {
    return (
      <div className="grid gap-6 @2xl:grid-cols-[320px_minmax(0,1fr)]">
        <Skeleton className="h-80 rounded-2xl" />
        <Skeleton className="h-80 rounded-2xl" />
      </div>
    );
  }

  const topics = subjects.reduce((n, s) => n + s.topic_count, 0);
  const overall = topics ? subjects.reduce((n, s) => n + (s.progress ?? 0) * s.topic_count, 0) / topics : 0;
  const current = subjects.find((s) => s.id === selected);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end gap-4">
        <div className="min-w-0 flex-1 space-y-2">
          <h1 className="retro text-sm text-primary">Edital verticalizado</h1>
          {topics > 0 && (
            <div className="flex max-w-md items-center gap-3">
              <ProgressBar value={overall} className="flex-1" />
              <span className="tabular text-sm text-muted-foreground">
                <strong className="text-foreground">{pct(overall)}</strong> de {topics} tópicos
              </span>
            </div>
          )}
        </div>
        <Button variant="ghost" onClick={() => setEditor({ id: null, form: { name: "", color: accent, exam_weight: 1 } })}>
          <Plus /> Nova matéria
        </Button>
        <ImportEditalButton label="Importar do edital" onApplied={() => void reload()} />
      </header>

      {subjects.length === 0 ? (
        <MascotEmpty title="Seu edital ainda está vazio" text="Mande o PDF do edital (ou só o nome do cargo) e eu monto matérias e tópicos para você revisar.">
          <ImportEditalButton size="lg" label="Importar do edital" onApplied={() => void reload()} />
        </MascotEmpty>
      ) : (
        <div className="grid items-start gap-6 @2xl:grid-cols-[320px_minmax(0,1fr)]">
          <motion.ul variants={listIn} initial="hidden" animate="show" className="space-y-1">
            {subjects.map((s) => (
              <motion.li key={s.id} variants={itemIn}>
                <div
                  className={cn(
                    "group relative rounded-xl px-3 py-2.5 transition-colors",
                    s.id === selected ? "bg-card shadow-soft ring-1 ring-border" : "hover:bg-card/60",
                  )}
                >
                  <button className="w-full space-y-1.5 text-left" onClick={() => setSelected(s.id)}>
                    <span className="flex items-center gap-2">
                      <span className="size-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{s.name}</span>
                      <span className="tabular text-xs text-muted-foreground">{pct(s.progress ?? 0)}</span>
                    </span>
                    <ProgressBar value={s.progress ?? 0} className="h-1.5" color={s.color} />
                    <span className="block text-[11px] text-muted-foreground">
                      {s.topic_count} tópicos · peso {s.exam_weight ?? 1}
                    </span>
                  </button>
                  <span className="absolute top-2 right-12 hidden gap-0.5 group-hover:flex">
                    <button aria-label={`Editar ${s.name}`} className="rounded p-1 text-muted-foreground hover:text-foreground" onClick={() => setEditor({ id: s.id, form: { name: s.name, color: s.color, exam_weight: s.exam_weight ?? 1 } })}>
                      <Pencil className="size-3.5" />
                    </button>
                    <button aria-label={`Apagar ${s.name}`} className="rounded p-1 text-muted-foreground hover:text-destructive" onClick={() => void remove(s)}>
                      <Trash2 className="size-3.5" />
                    </button>
                  </span>
                </div>
              </motion.li>
            ))}
          </motion.ul>

          <AnimatePresence mode="wait">
            {current && (
              <motion.div key={current.id} className="min-w-0" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, transition: { duration: 0.1 } }} transition={spring.soft}>
                <TopicsPanel subject={current} onChange={() => void reload()} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      <Sheet open={editor !== null} onOpenChange={(o) => !o && setEditor(null)} title={editor?.id === null ? "Nova matéria" : "Editar matéria"}>
        {editor && (
          <form onSubmit={saveSubject} className="max-w-md space-y-4 p-6">
            <div className="space-y-1">
              <Label htmlFor="subject-name">Nome</Label>
              <Input id="subject-name" autoFocus value={editor.form.name} onChange={(e) => setEditor({ ...editor, form: { ...editor.form, name: e.target.value } })} placeholder="Direito Constitucional" />
            </div>
            <div className="flex gap-3">
              <div className="space-y-1">
                <Label htmlFor="subject-color">Cor</Label>
                <input
                  id="subject-color"
                  type="color"
                  value={editor.form.color}
                  onChange={(e) => setEditor({ ...editor, form: { ...editor.form, color: e.target.value } })}
                  className="h-9 w-14 cursor-pointer rounded border border-input bg-transparent"
                />
              </div>
              <div className="flex-1 space-y-1">
                <Label htmlFor="subject-weight">Peso no edital (nº de questões ou peso)</Label>
                <Input
                  id="subject-weight"
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  value={editor.form.exam_weight ?? 1}
                  onChange={(e) => setEditor({ ...editor, form: { ...editor.form, exam_weight: e.target.valueAsNumber || 0 } })}
                />
              </div>
            </div>
            <Button type="submit" disabled={!editor.form.name.trim()}>
              {editor.id === null ? "Criar matéria" : "Salvar"}
            </Button>
          </form>
        )}
      </Sheet>
    </div>
  );
}

const CHECKS = [
  ["theory", "Teoria", "T"],
  ["practice", "Questões", "Q"],
] as const;

function TopicsPanel({ subject, onChange }: { subject: Subject; onChange: () => void }) {
  const [topics, setTopics] = useState<Topic[] | null>(null);
  const [paste, setPaste] = useState("");
  const [adding, setAdding] = useState(false);
  const [material, setMaterial] = useState<Topic | null>(null);

  const reload = useCallback(async () => {
    setTopics(await commands.listTopics(subject.id));
  }, [subject.id]);
  useEffect(() => void reload().catch(toastError), [reload]);

  async function setChecks(t: Topic, patch: Partial<Pick<Topic, "theory" | "practice" | "reviews">>) {
    const next = { ...t, ...patch };
    const before = (t.theory ? 1 : 0) + (t.practice ? 1 : 0) + t.reviews;
    const after = (next.theory ? 1 : 0) + (next.practice ? 1 : 0) + next.reviews;
    setTopics((ts) => ts && ts.map((x) => (x.id === t.id ? next : x))); // otimista: o clique responde na hora
    sfx(after === 5 && before < 5 ? "success" : after > before ? "coin" : "nav");
    try {
      await commands.setTopicChecks(t.id, next.theory, next.practice, next.reviews);
      onChange();
    } catch (e) {
      toastError(e);
      void reload();
    }
  }

  async function removeTopic(t: Topic) {
    if (!window.confirm(`Apagar o tópico "${t.name}" com materiais e questões dele?`)) return;
    try {
      await commands.deleteTopic(t.id);
      await reload();
      onChange();
    } catch (e) {
      toastError(e);
    }
  }

  async function addTopics() {
    try {
      await commands.addTopics(subject.id, paste);
      setPaste("");
      setAdding(false);
      await reload();
      onChange();
    } catch (e) {
      toastError(e);
    }
  }

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-soft">
      <header className="flex items-center gap-3">
        <span className="size-3 rounded-full" style={{ background: subject.color }} />
        <h2 className="min-w-0 flex-1 truncate text-lg font-semibold">{subject.name}</h2>
        <span className="hidden text-[11px] text-muted-foreground @lg:block">T = teoria · Q = questões · R = revisões</span>
        <Button size="sm" variant="ghost" onClick={() => setAdding((a) => !a)}>
          <Plus /> Tópicos
        </Button>
      </header>

      <AnimatePresence>
        {adding && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="space-y-2 overflow-hidden">
            <Textarea rows={4} autoFocus value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={"Um tópico por linha\nPrincípios fundamentais\nDireitos e garantias fundamentais"} aria-label="Novos tópicos" />
            <Button size="sm" disabled={!paste.trim()} onClick={() => void addTopics()}>
              Adicionar tópicos
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {topics === null ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-9 rounded-lg" />)}</div>
      ) : topics.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Sem tópicos. Cole a lista do edital em “Tópicos” ou importe o edital inteiro.</p>
      ) : (
        <motion.ul variants={listIn} initial="hidden" animate="show" className="divide-y divide-border/60">
          {topics.map((t) => {
            const full = t.theory && t.practice && t.reviews === 3;
            return (
              <motion.li key={t.id} variants={itemIn} className="group flex items-center gap-2 py-1.5">
                <span className={cn("min-w-0 flex-1 truncate text-sm", full && "text-muted-foreground line-through decoration-success/60")}>{t.name}</span>
                {CHECKS.map(([key, label, short]) => (
                  <CheckBox key={key} on={t[key]} label={`${label}: ${t.name}`} onClick={() => void setChecks(t, { [key]: !t[key] })}>
                    {short}
                  </CheckBox>
                ))}
                <span className="flex items-center gap-0.5 pl-1" role="group" aria-label={`Revisões de ${t.name}`}>
                  {[1, 2, 3].map((n) => (
                    <CheckBox key={n} round on={t.reviews >= n} label={`Revisão ${n}`} onClick={() => void setChecks(t, { reviews: t.reviews >= n ? n - 1 : n })}>
                      {`R${n}`}
                    </CheckBox>
                  ))}
                </span>
                <button onClick={() => setMaterial(t)} className="ml-1 rounded p-1 text-muted-foreground hover:text-primary" aria-label={`Material de ${t.name}`} title="Materiais do Grifo">
                  <BookOpenText className="size-4" />
                </button>
                <button
                  onClick={() => void removeTopic(t)}
                  className="rounded p-1 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive"
                  aria-label={`Apagar ${t.name}`}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </motion.li>
            );
          })}
        </motion.ul>
      )}

      <Sheet open={material !== null} onOpenChange={(o) => !o && setMaterial(null)} title={material?.name ?? ""} description={`${subject.name} · materiais do Grifo`}>
        {material && <MaterialPanel topicId={material.id} topicName={material.name} />}
      </Sheet>
    </section>
  );
}

function CheckBox({ on, onClick, label, children, round }: { on: boolean; onClick: () => void; label: string; children: string; round?: boolean }) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.85 }}
      onClick={onClick}
      aria-pressed={on}
      aria-label={label}
      title={label}
      className={cn(
        "grid h-7 place-items-center border text-[10px] font-semibold transition-colors",
        round ? "w-7 rounded-full" : "w-8 rounded-md",
        on ? "border-success bg-success text-white" : "border-border text-muted-foreground hover:border-success/60",
      )}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span key={String(on)} initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={spring.bouncy}>
          {on && !round ? <Check className="size-3.5" strokeWidth={3} /> : children}
        </motion.span>
      </AnimatePresence>
    </motion.button>
  );
}
