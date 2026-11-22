import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowRight, Check, Loader2, Search, Trash2 } from "lucide-react";
import { Chip } from "@/components/fields";
import { Mascot } from "@/components/Mascot";
import Scenery from "@/components/Scenery";
import { StatTile } from "@/components/StatTile";
import { toastError } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Integrations } from "@/features/settings/Integrations";
import { ExamForm, toggleFollow, useContestSearch, useExams, useNextExam } from "@/features/world/exams";
import { commands, type Contest_Serialize as Contest, type PomodoroConfig, type Profile_Serialize as Profile } from "@/lib/bindings";
import { hours as fmtHours, plural } from "@/lib/format";
import { breathe, spring } from "@/lib/motion";
import { sfx } from "@/lib/sound";
import { cn, warn } from "@/lib/utils";
import { SubjectPlanner } from "./SubjectPlanner";

const AREAS = ["Policial", "Fiscal", "Tribunais", "Bancária", "Saúde", "Educação", "TI", "Controle", "Administrativa", "Legislativa"];
const DAYS = ["D", "S", "T", "Q", "Q", "S", "S"];
const DAY_NAMES = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

/** Passos do assistente. `skip`: pode pular. `speech`: o que o Grifo diz no balão. */
const STEPS: { id: string; title: string; skip?: boolean; speech: (nome: string) => string }[] = [
  { id: "oi", title: "Oi!", speech: () => "Oi! Eu sou o Grifo. Em uns 3 minutos eu monto o seu QG de estudos." },
  { id: "voce", title: "Você", speech: () => "Primeiro: como eu te chamo, e qual área você está mirando?" },
  { id: "provas", title: "Provas", skip: true, speech: (nome) => `Prazer, ${nome}! Tem alguma prova em vista? Se não tiver, eu procuro as abertas na sua área.` },
  { id: "rotina", title: "Rotina", speech: () => "Agora a rotina. Seja honesto(a): constância ganha de maratona." },
  { id: "materias", title: "Matérias", skip: true, speech: () => "Hora das matérias. Me dá o edital (ou o cargo) que eu monto tudo pra você revisar." },
  { id: "integracoes", title: "Integrações", skip: true, speech: () => "Quase lá! Vamos ligar a IA local e o Claude. Cada botão faz tudo sozinho." },
  { id: "pronto", title: "Pronto", speech: (nome) => `Tudo pronto, ${nome}! Bora pro primeiro pomodoro?` },
];

const LAST = STEPS.length - 1;
/** Do passo Matérias em diante o Grifinho já está de boné. */
const CAP_FROM = STEPS.findIndex((s) => s.id === "materias");
/** As pílulas do assistente são maiores que os filtros do resto do app. */
const CHIP = "px-3.5 text-sm";

export default function Onboarding({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [p, setP] = useState<Profile | null>(null);
  const [pomo, setPomo] = useState<PomodoroConfig | null>(null);
  const [customArea, setCustomArea] = useState("");

  useEffect(() => {
    commands.getProfile().then(setP, toastError);
    commands.getPomodoroConfig().then(setPomo, (e) => warn("ler o pomodoro", e));
  }, []);

  if (!p) return null;
  const current = STEPS[step];
  const id = current.id;
  const set = (patch: Partial<Profile>) => setP({ ...p, ...patch });

  /** Salva o que o passo atual mexeu. `false` se falhou (o aviso já apareceu). */
  async function saveStep(profile: Profile): Promise<boolean> {
    try {
      await commands.setProfile(profile);
      if (id === "rotina" && pomo) await commands.setPomodoroConfig(pomo);
      // A área também alimenta o rastreador de concursos.
      if (id === "voce" && profile.area) {
        const cfg = await commands.getConfig();
        if (!cfg.interest_area.trim()) await commands.setConfig({ ...cfg, interest_area: profile.area });
      }
      return true;
    } catch (e) {
      toastError(e);
      return false;
    }
  }

  async function go(delta: number) {
    if (delta > 0 && p && !(await saveStep(p))) return;
    sfx("nav");
    setDir(delta);
    setStep((s) => Math.min(LAST, Math.max(0, s + delta)));
  }

  async function finish() {
    if (p && (await saveStep({ ...p, onboarded: true }))) onDone();
  }

  const canNext = id !== "voce" || (p.name.trim().length > 0 && p.area.trim().length > 0);
  const edge = step === 0 || step === LAST;

  return (
    <div className="relative flex h-screen flex-col overflow-hidden bg-background">
      <Scenery className="absolute inset-x-0 top-0 h-[55vh]" />

      <div className="relative z-10 flex flex-1 items-center justify-center overflow-y-auto p-6">
        <div className="w-full max-w-3xl">
          <ol className="mb-5 flex items-center justify-center gap-2" aria-label="Passos">
            {STEPS.map((s, i) => (
              <li key={s.id} className="flex items-center gap-2">
                <motion.span
                  animate={{ width: i === step ? 28 : 8, opacity: i <= step ? 1 : 0.35 }}
                  transition={spring.snappy}
                  className={cn("block h-2 rounded-full", i <= step ? "bg-primary" : "bg-foreground")}
                  aria-current={i === step ? "step" : undefined}
                  title={s.title}
                />
              </li>
            ))}
          </ol>

          <div className="rounded-3xl border border-border/60 bg-glass p-7 shadow-lift backdrop-blur-xl">
            <div className="mb-6 flex items-end gap-4">
              <motion.div {...breathe} className="shrink-0">
                <motion.div key={step} initial={{ y: -14, scaleY: 0.9 }} animate={{ y: 0, scaleY: 1 }} transition={spring.bouncy}>
                  <Mascot look={step >= CAP_FROM ? "cap" : "base"} scale={edge ? 7 : 5} />
                </motion.div>
              </motion.div>
              <AnimatePresence mode="wait">
                <motion.p
                  key={step}
                  initial={{ opacity: 0, y: 8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, transition: { duration: 0.1 } }}
                  transition={spring.soft}
                  className="relative mb-4 rounded-2xl rounded-bl-sm border border-border bg-card px-4 py-3 text-[15px] leading-snug shadow-soft"
                >
                  {current.speech(p.name.trim() || "concurseiro(a)")}
                </motion.p>
              </AnimatePresence>
            </div>

            <AnimatePresence mode="wait" custom={dir}>
              <motion.section
                key={step}
                custom={dir}
                initial={{ opacity: 0, x: dir * 36 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: dir * -24, transition: { duration: 0.14 } }}
                transition={spring.soft}
                className="min-h-[220px]"
              >
                {id === "oi" && <Welcome />}
                {id === "voce" && (
                  <div className="space-y-5">
                    <Field label="Como o Grifo te chama?" id="ob-name">
                      <Input id="ob-name" autoFocus value={p.name} onChange={(e) => set({ name: e.target.value })} placeholder="Alberto" className="max-w-xs" />
                    </Field>
                    <Field label="Área que você mira">
                      <div className="flex flex-wrap gap-2">
                        {AREAS.map((a) => (
                          <Chip key={a} className={CHIP} on={p.area === a} onClick={() => set({ area: a })}>
                            {a}
                          </Chip>
                        ))}
                        <Input
                          value={customArea}
                          onChange={(e) => (setCustomArea(e.target.value), set({ area: e.target.value }))}
                          placeholder="Outra…"
                          className={cn("h-8 w-40", customArea && p.area === customArea && "border-primary")}
                          aria-label="Outra área"
                        />
                      </div>
                    </Field>
                    <Field label="Escolaridade dos cargos">
                      <div className="flex gap-2">
                        {(
                          [
                            ["medio", "Nível médio"],
                            ["superior", "Nível superior"],
                          ] as const
                        ).map(([v, l]) => (
                          <Chip key={v} className={CHIP} on={p.education === v} onClick={() => set({ education: v })}>
                            {l}
                          </Chip>
                        ))}
                      </div>
                    </Field>
                  </div>
                )}
                {id === "provas" && <Exams area={p.area} />}
                {id === "rotina" && pomo && <Routine p={p} set={set} pomo={pomo} setPomo={setPomo} />}
                {id === "materias" && <SubjectsStep />}
                {id === "integracoes" && (
                  <div className="max-h-[48vh] overflow-y-auto pr-1">
                    <Integrations />
                  </div>
                )}
                {id === "pronto" && <Done p={p} />}
              </motion.section>
            </AnimatePresence>

            <footer className="mt-6 flex items-center gap-3 border-t border-border pt-5">
              {!edge && (
                <Button variant="ghost" onClick={() => void go(-1)}>
                  <ArrowLeft /> Voltar
                </Button>
              )}
              {step === 0 && (
                <Button variant="ghost" onClick={() => void finish()}>
                  Pular, configuro depois
                </Button>
              )}
              <span className="flex-1" />
              {current.skip && (
                <Button variant="ghost" onClick={() => void go(1)}>
                  Pular este passo
                </Button>
              )}
              {step < LAST ? (
                // No passo Matérias a ação principal é "Adicionar ao meu edital"; aqui só avança.
                <Button size="lg" variant={id === "materias" ? "secondary" : "default"} className="min-w-36" disabled={!canNext} onClick={() => void go(1)}>
                  {step === 0 ? "Começar" : "Continuar"} <ArrowRight />
                </Button>
              ) : (
                <Button size="lg" className="min-w-44" onClick={() => void finish()}>
                  Entrar no Grifo Quest <ArrowRight />
                </Button>
              )}
            </footer>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, id, children }: { label: string; id?: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-sm text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

function Welcome() {
  const items = [
    ["🗺️", "Edital verticalizado", "matérias e tópicos montados do edital, com teoria, questões e revisões"],
    ["⚔️", "Missões e XP", "metas diárias nas matérias que mais precisam"],
    ["🧠", "IA que estuda junto", "resumos, questões e flashcards do Grifo; sala de aula com alunos virtuais"],
  ] as const;
  return (
    <ul className="grid gap-3">
      {items.map(([icon, title, text], i) => (
        <motion.li
          key={title}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring.soft, delay: 0.15 + i * 0.07 }}
          className="flex items-start gap-3"
        >
          <span className="text-xl">{icon}</span>
          <span>
            <span className="font-medium">{title}</span>
            <span className="text-muted-foreground"> — {text}</span>
          </span>
        </motion.li>
      ))}
    </ul>
  );
}

function Exams({ area }: { area: string }) {
  const { exams, reload, remove } = useExams();
  const [contests, setContests] = useState<Contest[] | null>(null);
  const loadContests = () => void commands.listContests().then(setContests, toastError);
  const { searching, search } = useContestSearch(loadContests);

  return (
    <div className="space-y-5">
      <ExamForm onCreated={reload} />
      {exams.length > 0 && (
        <ul className="space-y-1">
          {exams.map((x) => (
            <li key={x.id} className="flex items-center gap-3 rounded-lg bg-card px-3 py-2 text-sm">
              <span className="flex-1 font-medium">{x.name}</span>
              <span className="text-muted-foreground">{[x.banca, x.role].filter(Boolean).join(" · ")}</span>
              <span className="tabular text-primary">{plural(x.days_left, "dia", "dias")}</span>
              <button aria-label={`Apagar ${x.name}`} onClick={() => void remove(x.id)} className="text-muted-foreground hover:text-destructive">
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-3 rounded-xl border border-dashed border-border p-3">
        <p className="flex-1 text-sm text-muted-foreground">Sem prova marcada? O Claude procura concursos abertos ou previstos{area ? ` em ${area}` : ""} (1–2 min).</p>
        <Button variant="secondary" disabled={searching} onClick={() => void search()}>
          {searching ? <Loader2 className="animate-spin" /> : <Search />} Procurar
        </Button>
      </div>
      {contests && contests.length > 0 && (
        <ul className="max-h-48 space-y-1 overflow-y-auto">
          {contests.map((c) => (
            <li key={c.id} className="flex items-center gap-3 rounded-lg bg-card px-3 py-2 text-sm">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{c.title}</span>
                <span className="block truncate text-xs text-muted-foreground">{[c.banca, c.status, c.vacancies && `${c.vacancies} vagas`].filter(Boolean).join(" · ")}</span>
              </span>
              <Chip className={CHIP} on={c.followed} onClick={() => void toggleFollow(c).then((ok) => ok && loadContests())}>
                {c.followed ? "Seguindo" : "Seguir"}
              </Chip>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Routine({ p, set, pomo, setPomo }: { p: Profile; set: (x: Partial<Profile>) => void; pomo: PomodoroConfig; setPomo: (c: PomodoroConfig) => void }) {
  const hours = p.hours_per_day ?? 2;
  const perWeek = p.daily_questions * p.study_days.length;
  const pomodoros = Math.min(12, Math.max(1, Math.round((hours * 60) / 50)));
  const toggleDay = (d: number) => set({ study_days: p.study_days.includes(d) ? p.study_days.filter((x) => x !== d) : [...p.study_days, d].sort() });

  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <Field label={`Horas de estudo por dia: ${fmtHours(hours)} h`} id="ob-hours">
        <input
          id="ob-hours"
          type="range"
          min={0.5}
          max={8}
          step={0.5}
          value={hours}
          onChange={(e) => set({ hours_per_day: Number(e.target.value) })}
          className="w-full accent-[var(--primary)]"
        />
      </Field>
      <Field label="Dias de estudo">
        <div className="flex gap-1.5">
          {DAYS.map((d, i) => (
            <Chip key={i} on={p.study_days.includes(i)} onClick={() => toggleDay(i)} className="w-9 px-0 text-sm">
              <span aria-label={DAY_NAMES[i]}>{d}</span>
            </Chip>
          ))}
        </div>
      </Field>
      <Field label="Meta de questões por dia">
        <div className="flex flex-wrap items-center gap-1.5">
          {[10, 20, 30, 50].map((n) => (
            <Chip key={n} className={CHIP} on={p.daily_questions === n} onClick={() => set({ daily_questions: n })}>
              {n}
            </Chip>
          ))}
          <Input
            type="number"
            min={1}
            max={500}
            className="h-8 w-20"
            value={p.daily_questions}
            onChange={(e) => set({ daily_questions: Math.max(1, Number(e.target.value)) })}
            aria-label="Meta personalizada"
          />
        </div>
      </Field>
      <Field label="Duração do pomodoro">
        <div className="flex flex-wrap gap-1.5">
          {[25, 30, 45, 50].map((m) => (
            <Chip key={m} className={CHIP} on={pomo.focus_min === m} onClick={() => setPomo({ ...pomo, focus_min: m })}>
              {m} min
            </Chip>
          ))}
        </div>
      </Field>
      <motion.p
        key={`${perWeek}-${pomodoros}`}
        initial={{ opacity: 0.4 }}
        animate={{ opacity: 1 }}
        className="rounded-xl bg-secondary/60 p-3 text-sm sm:col-span-2"
      >
        Isso dá <strong className="text-primary">{perWeek} questões por semana</strong> e uma missão de{" "}
        <strong className="text-primary">{plural(pomodoros, "pomodoro", "pomodoros")}</strong> por dia.
      </motion.p>
    </div>
  );
}

function SubjectsStep() {
  const exam = useNextExam();
  const [count, setCount] = useState<number | null>(null);
  const loadCount = () => void commands.listSubjects().then((s) => setCount(s.length), (e) => warn("contar as matérias", e));
  useEffect(loadCount, []);
  return (
    <div className="max-h-[52vh] space-y-3 overflow-y-auto pr-1">
      {count !== null && count > 0 && (
        <p className="flex items-center gap-2 rounded-lg bg-success/10 px-3 py-2 text-sm text-success">
          <Check className="size-4" /> Você já tem {plural(count, "matéria", "matérias")}. Pode importar mais ou pular.
        </p>
      )}
      <SubjectPlanner key={exam?.id ?? 0} defaultRole={exam?.role ?? ""} defaultBanca={exam?.banca ?? ""} onApplied={loadCount} />
    </div>
  );
}

function Done({ p }: { p: Profile }) {
  const [stats, setStats] = useState<{ subjects: number; topics: number; exams: number } | null>(null);
  useEffect(() => {
    sfx("levelup");
    Promise.all([commands.listSubjects(), commands.listExams()]).then(
      ([s, e]) => setStats({ subjects: s.length, topics: s.reduce((n, x) => n + x.topic_count, 0), exams: e.length }),
      (e) => warn("resumo do assistente", e),
    );
  }, []);
  const items = stats
    ? [
        [String(stats.subjects), "matérias"],
        [String(stats.topics), "tópicos no edital"],
        [String(p.daily_questions), "questões por dia"],
        [String(stats.exams), stats.exams === 1 ? "prova marcada" : "provas marcadas"],
      ]
    : [];
  return (
    <div className="space-y-4">
      {stats?.subjects === 0 && (
        <p className="rounded-lg bg-primary/10 px-3 py-2 text-sm">
          Você pulou as matérias, sem problema: o <strong>Início</strong> vai mostrar o botão <strong>Montar meu edital</strong> até você cadastrar.
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {items.map(([n, l], i) => (
          <motion.div
            key={l}
            initial={{ opacity: 0, y: 16, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ ...spring.bouncy, delay: 0.2 + i * 0.08 }}
          >
            <StatTile value={n} label={l} valueClass="text-2xl" />
          </motion.div>
        ))}
      </div>
    </div>
  );
}
