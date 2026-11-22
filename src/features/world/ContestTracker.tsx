import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CalendarPlus, ExternalLink, Loader2, Search, Star, Trash2 } from "lucide-react";
import { Skeleton } from "@/components/motion";
import { toast, toastError } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { commands, type Contest_Serialize as Contest } from "@/lib/bindings";
import { formatDate } from "@/lib/format";
import { itemIn, listIn, spring } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { STAGES, stageOf } from "./contests";
import { createExam, toggleFollow, useContestSearch } from "./exams";

export function ContestTracker() {
  const [items, setItems] = useState<Contest[] | null>(null);
  const load = useCallback(() => void commands.listContests().then(setItems, toastError), []);
  useEffect(load, [load]);
  const { searching: busy, search } = useContestSearch(load);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-4">
        <div className="min-w-60 flex-1">
          <p className="font-medium">Rastreador de concursos</p>
          <p className="text-xs text-muted-foreground">O Claude pesquisa na web pela sua área (1–3 min). Notícias com suas palavras-chave também entram aqui, e o mesmo concurso vindo de fontes diferentes vira um só.</p>
        </div>
        <Button disabled={busy} onClick={() => void search()}>
          {busy ? <Loader2 className="animate-spin" /> : <Search />} {busy ? "Pesquisando…" : "Buscar com Claude"}
        </Button>
      </div>

      {items === null ? (
        <div className="grid gap-3 md:grid-cols-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-44 rounded-2xl" />)}</div>
      ) : items.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Nenhum concurso rastreado ainda.</p>
      ) : (
        <motion.ul variants={listIn} initial="hidden" animate="show" className="grid gap-3 md:grid-cols-2">
          {items.map((c) => (
            <ContestCard key={c.id} c={c} reload={load} />
          ))}
        </motion.ul>
      )}
    </section>
  );
}

function ContestCard({ c, reload }: { c: Contest; reload: () => void }) {
  const [dating, setDating] = useState(false);
  const [date, setDate] = useState(c.deadline ?? "");
  const stage = stageOf(c.status);

  async function follow() {
    if (await toggleFollow(c)) reload();
  }

  async function toExam() {
    if (await createExam({ name: c.org ?? c.title, exam_date: date, banca: c.banca, role: null })) {
      toast("Prova marcada: a contagem regressiva já aparece no Início", "success");
      setDating(false);
    }
  }

  async function remove() {
    try {
      await commands.deleteContest(c.id);
      reload();
    } catch (e) {
      toastError(e);
    }
  }

  return (
    <motion.li variants={itemIn} className={cn("space-y-3 rounded-2xl border bg-card p-4 shadow-soft", c.followed ? "border-primary/50" : "border-border")}>
      <div className="flex items-start gap-2">
        <button className="min-w-0 flex-1 text-left font-semibold leading-snug hover:text-primary" onClick={() => commands.openLink(c.url).catch(toastError)}>
          {c.title}
        </button>
        <motion.button
          whileTap={{ scale: 0.8, rotate: -20 }}
          onClick={() => void follow()}
          aria-pressed={c.followed}
          aria-label={c.followed ? "Deixar de seguir" : "Seguir"}
          title={c.followed ? "Seguindo" : "Seguir"}
          className={cn("rounded-full p-1", c.followed ? "text-primary" : "text-muted-foreground hover:text-primary")}
        >
          <Star className="size-5" fill={c.followed ? "currentColor" : "none"} />
        </motion.button>
      </div>

      {c.summary && <p className="text-sm text-muted-foreground">{c.summary}</p>}

      <ol className="flex items-center gap-1" aria-label={`Etapa: ${stage >= 0 ? STAGES[stage] : "desconhecida"}`}>
        {STAGES.map((s, i) => (
          <li key={s} className="flex flex-1 flex-col items-center gap-1">
            <motion.span
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ ...spring.soft, delay: i * 0.05 }}
              className={cn("h-1.5 w-full origin-left rounded-full", i <= stage ? "bg-primary" : "bg-secondary")}
            />
            <span className={cn("text-[10px]", i === stage ? "font-semibold text-primary" : "text-muted-foreground")}>{s}</span>
          </li>
        ))}
      </ol>

      <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {c.org && <Field k="Órgão" v={c.org} />}
        {c.banca && <Field k="Banca" v={c.banca} />}
        {c.vacancies && <Field k="Vagas" v={c.vacancies} />}
        {c.salary && <Field k="Salário" v={c.salary} />}
        {c.deadline && <Field k="Prazo" v={formatDate(c.deadline)} />}
      </dl>

      <AnimatePresence initial={false}>
        {dating && (
          <motion.form
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            onSubmit={(e) => (e.preventDefault(), void toExam())}
            className="flex items-center gap-2 overflow-hidden"
          >
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-8 w-44" aria-label="Data da prova" autoFocus />
            <Button size="sm" type="submit" disabled={date.length !== 10}>
              Salvar
            </Button>
            <Button size="sm" variant="ghost" type="button" onClick={() => setDating(false)}>
              Cancelar
            </Button>
          </motion.form>
        )}
      </AnimatePresence>

      <div className="flex items-center gap-1">
        {!dating && (
          <Button size="sm" variant="secondary" onClick={() => setDating(true)}>
            <CalendarPlus /> Marcar prova
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => commands.openLink(c.url).catch(toastError)}>
          <ExternalLink /> Fonte
        </Button>
        <span className="flex-1" />
        <span className="text-[10px] text-muted-foreground">via {c.source}</span>
        <button onClick={() => void remove()} aria-label={`Remover ${c.title}`} className="rounded p-1 text-muted-foreground hover:text-destructive">
          <Trash2 className="size-3.5" />
        </button>
      </div>
    </motion.li>
  );
}

function Field({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="inline text-muted-foreground">{k}: </dt>
      <dd className="inline">{v}</dd>
    </div>
  );
}
