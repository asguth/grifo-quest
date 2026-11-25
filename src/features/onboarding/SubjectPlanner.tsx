import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { FileUp, Loader2, Plus, Search, X } from "lucide-react";
import { ReadingProgress, type Reading } from "./ReadingProgress";
import { toast, toastError } from "@/components/toast";
import { Segmented } from "@/components/Segmented";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { commands, events, type PlanSubject } from "@/lib/bindings";
import { useTauriEvent } from "@/lib/hooks";
import { itemIn, listIn } from "@/lib/motion";
import { cn } from "@/lib/utils";

type Mode = "edital" | "cargo";
/** Item da prévia com id estável (o nome muda enquanto o usuário edita). */
type Draft = PlanSubject & { key: number };
const MAX_PDF_MB = 30;

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",", 2)[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

/**
 * Monta matérias e tópicos automaticamente (edital em PDF/texto pela IA local, ou cargo pelo Claude),
 * mostra a prévia editável e só salva quando o usuário confirma.
 */
export function SubjectPlanner({ defaultRole = "", defaultBanca = "", onApplied }: { defaultRole?: string; defaultBanca?: string; onApplied?: () => void }) {
  const [mode, setMode] = useState<Mode>("edital");
  const [role, setRole] = useState(defaultRole);
  const [banca, setBanca] = useState(defaultBanca);
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<Reading | null>(null);
  const [plan, setPlan] = useState<Draft[] | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useTauriEvent(events.plannerEvent, setProgress);

  // A prova chega depois da primeira pintura: preenche só o que está vazio. Trocar a `key` para isso
  // remontava o componente e jogava fora o PDF que a pessoa já tinha mandado (tinha que mandar de novo).
  useEffect(() => {
    if (defaultRole) setRole((r) => r || defaultRole);
  }, [defaultRole]);
  useEffect(() => {
    if (defaultBanca) setBanca((b) => b || defaultBanca);
  }, [defaultBanca]);

  async function readPdf(file: File) {
    if (!file.name.toLowerCase().endsWith(".pdf")) return toast("Esse arquivo não é PDF. Para texto, use “cole o texto” abaixo.", "error");
    if (file.size > MAX_PDF_MB * 1024 * 1024) return toast(`PDF acima de ${MAX_PDF_MB} MB`, "error");
    setBusy(true);
    setProgress({ step: 1, text: `Lendo o PDF ${file.name}…`, progress: null, found: [] });
    try {
      setText(await commands.pdfText(await toBase64(file)));
      setFileName(file.name);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  async function run() {
    setBusy(true);
    setPlan(null);
    setProgress({ step: 2, text: mode === "cargo" ? "Preparando a pesquisa…" : "Procurando o conteúdo programático…", progress: null, found: [] });
    try {
      const p = mode === "cargo" ? await commands.planFromRole(role, banca || null) : await commands.planFromEdital(text, role || null);
      setPlan(p.map((s, key) => ({ ...s, key })));
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  async function apply() {
    if (!plan) return;
    setBusy(true);
    try {
      const n = await commands.applyPlan(plan.map(({ key: _, ...s }) => s));
      toast(`${plan.length} matérias e ${n} tópicos novos no seu edital`, "success");
      setPlan(null);
      onApplied?.();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  }

  const patch = (i: number, s: Partial<PlanSubject>) => setPlan((p) => p && p.map((x, j) => (j === i ? { ...x, ...s } : x)));
  const topics = plan?.reduce((n, s) => n + s.topics.length, 0) ?? 0;
  const canRun = !busy && (mode === "cargo" ? role.trim().length > 2 : text.trim().length > 50);

  return (
    <div className="space-y-5">
      {!plan && (
        <>
          <Segmented
            label="Como montar"
            value={mode}
            onChange={setMode}
            options={[
              ["edital", "Pelo edital (PDF ou texto)"],
              ["cargo", "Pelo cargo (pesquisa na web)"],
            ]}
          />

          {mode === "edital" ? (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                onDragOver={(e) => (e.preventDefault(), setDragging(true))}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  const f = e.dataTransfer.files[0];
                  if (f) void readPdf(f);
                }}
                className={cn(
                  "flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition-colors",
                  dragging ? "border-primary bg-primary/10" : "border-border hover:border-primary/60 hover:bg-secondary/40",
                )}
              >
                <FileUp className="size-7 text-primary" />
                <span className="font-medium">{fileName ? `📄 ${fileName}` : "Arraste o PDF do edital aqui ou clique para escolher"}</span>
                <span className="text-xs text-muted-foreground">
                  {fileName ? `${text.length.toLocaleString("pt-BR")} caracteres lidos` : "O texto é lido no seu PC; a IA local acha o conteúdo programático."}
                </span>
              </button>
              <input
                ref={fileInput}
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void readPdf(f);
                  e.target.value = "";
                }}
              />
              <details className="text-sm">
                <summary className="cursor-pointer text-muted-foreground">Ou cole o texto do conteúdo programático</summary>
                <Textarea
                  rows={6}
                  className="mt-2"
                  value={text}
                  onChange={(e) => (setText(e.target.value), setFileName(""))}
                  placeholder={"LÍNGUA PORTUGUESA: 1 Compreensão e interpretação de textos. 2 Ortografia oficial...\nDIREITO CONSTITUCIONAL: 1 Princípios fundamentais..."}
                />
              </details>
              <div className="space-y-1">
                <Label htmlFor="planner-role">Cargo (opcional, se o edital tiver vários)</Label>
                <Input id="planner-role" value={role} onChange={(e) => setRole(e.target.value)} placeholder="Técnico Judiciário – Área Administrativa" />
              </div>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px]">
              <div className="space-y-1">
                <Label htmlFor="planner-role2">Cargo</Label>
                <Input id="planner-role2" value={role} onChange={(e) => setRole(e.target.value)} placeholder="Agente da Polícia Federal" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="planner-banca">Banca (opcional)</Label>
                <Input id="planner-banca" value={banca} onChange={(e) => setBanca(e.target.value)} placeholder="Cebraspe" />
              </div>
              <p className="text-xs text-muted-foreground sm:col-span-2">
                O Claude procura o edital mais recente do cargo e extrai o conteúdo programático. Leva 1–3 min e usa um pouco da sua assinatura.
              </p>
            </div>
          )}

          <div className="flex items-center gap-3">
            <Button onClick={() => void run()} disabled={!canRun}>
              {busy ? <Loader2 className="animate-spin" /> : <Search />}
              Montar minhas matérias
            </Button>
          </div>
          {progress && <ReadingProgress reading={progress} />}
        </>
      )}

      {plan && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <p className="flex-1 text-sm">
              <span className="font-semibold">{plan.length} matérias</span> · {topics} tópicos. Revise: renomeie, ajuste o peso ou tire o que não cai.
            </p>
            <Button variant="ghost" onClick={() => setPlan(null)}>
              Voltar
            </Button>
            <Button onClick={() => void apply()} disabled={busy || plan.length === 0}>
              {busy && <Loader2 className="animate-spin" />} Adicionar ao meu edital
            </Button>
          </div>

          <motion.ul variants={listIn} initial="hidden" animate="show" className="max-h-[46vh] space-y-2 overflow-y-auto pr-1">
            <AnimatePresence initial={false}>
              {plan.map((s, i) => (
                <motion.li key={s.key} variants={itemIn} exit="exit" layout className="space-y-2 rounded-xl border border-border bg-card p-3">
                  <div className="flex items-center gap-2">
                    <Input className="h-8 flex-1 font-medium" value={s.name} onChange={(e) => patch(i, { name: e.target.value })} aria-label="Nome da matéria" />
                    <label className="flex items-center gap-1 text-xs text-muted-foreground">
                      peso
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        className="h-8 w-16"
                        value={s.weight ?? 1}
                        onChange={(e) => patch(i, { weight: Number(e.target.value) })}
                      />
                    </label>
                    <button onClick={() => setPlan(plan.filter((_, j) => j !== i))} className="rounded p-1 text-muted-foreground hover:text-destructive" aria-label={`Tirar ${s.name}`}>
                      <X className="size-4" />
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {s.topics.map((t, k) => (
                      <span key={k} className="group inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5 text-xs">
                        {t}
                        <button onClick={() => patch(i, { topics: s.topics.filter((_, m) => m !== k) })} className="opacity-40 group-hover:opacity-100" aria-label={`Tirar tópico ${t}`}>
                          <X className="size-3" />
                        </button>
                      </span>
                    ))}
                    <AddTopic onAdd={(t) => patch(i, { topics: [...s.topics, t] })} />
                  </div>
                </motion.li>
              ))}
            </AnimatePresence>
          </motion.ul>
        </div>
      )}
    </div>
  );
}

function AddTopic({ onAdd }: { onAdd: (t: string) => void }) {
  const [v, setV] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (v.trim()) onAdd(v.trim());
        setV("");
      }}
      className="inline-flex items-center gap-1 rounded-md border border-dashed border-border px-1.5"
    >
      <Plus className="size-3 text-muted-foreground" />
      <input value={v} onChange={(e) => setV(e.target.value)} placeholder="tópico" aria-label="Novo tópico" className="w-24 bg-transparent py-0.5 text-xs outline-none" />
    </form>
  );
}
