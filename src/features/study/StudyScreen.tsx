import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, BarChart3, BookX, Crosshair, Layers, ListChecks, Minus, Play, RefreshCw, Sun, Swords, Timer, TrendingDown, TrendingUp, type LucideIcon } from "lucide-react";
import { Mascot } from "@/components/Mascot";
import { Count, Skeleton } from "@/components/motion";
import { ProgressBar, ProgressRing } from "@/components/Progress";
import { SectionTabs } from "@/components/SectionTabs";
import { toastError } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { commands, type SessionInfo, type SessionReport, type StudyHome, type WeakTopic } from "@/lib/bindings";
import { accTone, pct, plural } from "@/lib/format";
import { breathe, itemIn, listIn, spring } from "@/lib/motion";
import { ERROR_EXIT_STREAK, ERROR_INTERVALS_TEXT, REFORCO_SIZE } from "@/lib/rules";
import { sfx } from "@/lib/sound";
import { cn, errorMessage } from "@/lib/utils";
import { CardReview } from "./CardReview";
import { DeckTab } from "./DeckTab";
import { ErrorsTab } from "./ErrorsTab";
import { PerformanceTab } from "./PerformanceTab";
import { PracticeTab } from "./PracticeTab";
import { QuestionRunner } from "./QuestionRunner";
import { dailyProgress } from "./daily";
import { NoTopics, startKey, type Start, type Tab } from "./shared";
import { getStudyTab, setStudyTab } from "./tabRequest";
import { useAppEvent } from "@/lib/bus";

const FocusScreen = lazy(() => import("@/features/focus/FocusScreen"));

type View = { k: "tabs" } | { k: "run"; s: SessionInfo } | { k: "report"; r: SessionReport } | { k: "review" };

const TABS: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: "hoje", label: "Hoje", icon: Sun },
  { id: "questoes", label: "Questões", icon: ListChecks },
  { id: "cards", label: "Flashcards", icon: Layers },
  { id: "erros", label: "Erros", icon: BookX },
  { id: "desempenho", label: "Desempenho", icon: BarChart3 },
  { id: "foco", label: "Foco", icon: Timer },
];

export default function StudyScreen() {
  const [view, setView] = useState<View>({ k: "tabs" });
  const [tab, setTabState] = useState<Tab>(getStudyTab);
  const [home, setHome] = useState<StudyHome | null>(null);
  const [homeError, setHomeError] = useState("");
  const [starting, setStarting] = useState<string | null>(null);

  const setTab = (t: Tab) => {
    setStudyTab(t);
    setTabState(t);
  };
  // Pedido do menu (mini-timer): troca a aba, mas não derruba uma sessão de questões em andamento.
  useAppEvent("studyTab", (t) => {
    if (view.k === "tabs" && TABS.some((x) => x.id === t)) setTabState(t as Tab);
  });

  const load = useCallback(() => {
    setHomeError("");
    void commands.studyHome().then(setHome, (e) => setHomeError(errorMessage(e)));
  }, []);
  useEffect(load, [load]);

  const start: Start = async (kind, opts = {}) => {
    setStarting(startKey(kind, opts));
    try {
      const s = await commands.startSession(kind, opts.topic ?? null, opts.n ?? null, opts.subject ?? null);
      sfx("success");
      setView({ k: "run", s });
    } catch (e) {
      toastError(e);
    } finally {
      setStarting(null);
    }
  };

  const back = () => {
    setView({ k: "tabs" });
    load();
  };

  const badge: Partial<Record<Tab, number>> = { erros: home?.errors_due, cards: home?.cards_due };

  return (
    <AnimatePresence mode="wait">
      <motion.div key={view.k} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, transition: { duration: 0.12 } }} transition={spring.soft}>
        {view.k === "run" && <QuestionRunner session={view.s} onFinish={(r) => setView({ k: "report", r })} />}
        {view.k === "report" && <Report r={view.r} onBack={back} onReforco={() => void start("reforco")} />}
        {view.k === "review" && (
          <div className="space-y-6">
            <header className="flex items-center gap-3">
              <Button size="sm" variant="ghost" onClick={back}>
                <ArrowLeft /> Flashcards
              </Button>
              <h1 className="text-lg font-semibold">Revisão do dia</h1>
            </header>
            <CardReview onDone={back} />
          </div>
        )}
        {view.k === "tabs" && (
          <div className="@container space-y-6">
            <SectionTabs
              label="Seções do estudo"
              value={tab}
              onChange={(t) => {
                sfx("nav");
                setTab(t);
              }}
              tabs={TABS.map((t) => ({ ...t, badge: badge[t.id] ?? 0 }))}
            />

            <AnimatePresence mode="wait">
              <motion.div key={tab} role="tabpanel" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, transition: { duration: 0.1 } }} transition={spring.soft}>
                {tab === "hoje" && <Home home={home} error={homeError} retry={load} starting={starting} start={start} setTab={setTab} review={() => setView({ k: "review" })} />}
                {tab === "questoes" && <PracticeTab starting={starting} start={start} hasTopics={home?.has_topics ?? true} onImported={load} />}
                {tab === "cards" && <DeckTab review={() => setView({ k: "review" })} onChange={load} />}
                {tab === "erros" && <ErrorsTab start={start} starting={starting} onChange={load} />}
                {tab === "desempenho" && <PerformanceTab start={start} />}
                {tab === "foco" && (
                  <Suspense fallback={<Skeleton className="mx-auto size-56 rounded-full" />}>
                    <FocusScreen />
                  </Suspense>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

function Home({
  home,
  error,
  retry,
  starting,
  start,
  setTab,
  review,
}: {
  home: StudyHome | null;
  error: string;
  retry: () => void;
  starting: string | null;
  start: Start;
  setTab: (t: Tab) => void;
  review: () => void;
}) {
  if (error) {
    return (
      <div className="mx-auto max-w-md space-y-3 rounded-2xl border border-border bg-card p-6 text-center">
        <p className="font-semibold">Não consegui montar o seu dia</p>
        <p className="text-sm text-muted-foreground">{error}</p>
        <Button variant="secondary" onClick={retry}>
          <RefreshCw /> Tentar de novo
        </Button>
      </div>
    );
  }
  if (!home) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-44 rounded-3xl" />
        <div className="grid gap-4 @3xl:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-36 rounded-2xl" />)}</div>
      </div>
    );
  }
  if (!home.has_topics) return <NoTopics onImported={retry} text="Monte o edital e eu gero as questões de cada tópico no estilo da sua banca, com caderno de erros e revisões." />;

  const { left, frac } = dailyProgress(home);

  return (
    <div className="space-y-6">
      <section className="relative flex flex-wrap items-center gap-6 overflow-hidden rounded-3xl border border-border bg-card p-6 shadow-lift">
        <ProgressRing value={frac} size={96} stroke={9} tone={frac >= 1 ? "stroke-success" : "stroke-primary"} transition={{ ...spring.soft, delay: 0.15 }} label={`${pct(frac)} da meta`} />
        <div className="min-w-60 flex-1 space-y-2">
          <p className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">Sessão de hoje</p>
          <h1 className="text-2xl font-semibold">
            {left > 0 ? (
              <>
                Faltam <span className="text-primary">{left}</span> questões
              </>
            ) : (
              "Meta do dia batida! 🎉"
            )}
          </h1>
          <p className="text-sm text-muted-foreground">
            Montada pelos seus pontos fracos{home.errors_due ? ` + ${home.errors_due} do caderno de erros` : ""}.
            {home.cycle_next && (
              <>
                {" "}
                Próxima no ciclo: <span className="font-medium" style={{ color: home.cycle_next.color }}>{home.cycle_next.name}</span>.
              </>
            )}
          </p>
        </div>
        <Button size="lg" className="h-12 min-w-56 text-base shadow-soft" disabled={!!starting} onClick={() => void start("diaria")}>
          <Play /> {left > 0 ? `Começar ${left} questões` : "Fazer mais 10"}
        </Button>
      </section>

      <div className="grid gap-4 @4xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
          <header className="flex items-center gap-2">
            <Crosshair className="size-5 text-destructive" />
            <h2 className="flex-1 font-semibold">Pontos fracos</h2>
            <Button size="sm" variant="secondary" disabled={!!starting} onClick={() => void start("reforco")}>
              <Swords /> Reforço ({REFORCO_SIZE})
            </Button>
          </header>
          <motion.ul variants={listIn} initial="hidden" animate="show" className="space-y-1.5">
            {home.weak.map((w) => (
              <WeakRow key={w.topic_id} w={w} busy={starting === startKey("topico", { topic: w.topic_id })} onTrain={() => void start("topico", { topic: w.topic_id, n: 10 })} />
            ))}
          </motion.ul>
          <p className="text-[11px] text-muted-foreground">Peso = quanto você erra (erros recentes pesam mais) × peso da matéria × tempo sem ver × erros vencidos.</p>
        </section>

        <div className="grid content-start gap-4">
          <ModeTile
            icon={BookX}
            title="Caderno de erros"
            text={home.errors_due ? `${home.errors_due === 1 ? "1 questão volta" : `${home.errors_due} questões voltam`} hoje (${ERROR_INTERVALS_TEXT} até acertar ${ERROR_EXIT_STREAK} seguidas).` : "Nada vencido hoje."}
            action={home.errors_due ? "Revisar erros" : "Ver caderno"}
            onClick={() => (home.errors_due ? void start("erros") : setTab("erros"))}
            tone="text-destructive"
          />
          <ModeTile
            icon={Layers}
            title="Flashcards"
            text={home.cards_due ? `${plural(home.cards_due, "cartão", "cartões")} para hoje.` : "Nenhum cartão vencido."}
            action={home.cards_due ? "Revisar cartões" : "Abrir baralho"}
            onClick={() => (home.cards_due ? review() : setTab("cards"))}
            tone="text-primary"
          />
          <ModeTile icon={ListChecks} title="Treino livre e simulado" text="Escolha a matéria ou o tópico, ou faça uma prova cronometrada." action="Escolher" onClick={() => setTab("questoes")} tone="text-success" />
          <button onClick={() => setTab("foco")} className="flex items-center gap-3 rounded-2xl border border-dashed border-border p-4 text-left hover:bg-card/60">
            <Timer className="size-5 text-muted-foreground" />
            <span className="text-sm">
              <span className="font-medium">Foco livre</span> <span className="text-muted-foreground">— pomodoro ou cronômetro para teoria, videoaula, lei seca</span>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

const TREND = {
  melhorando: { icon: TrendingUp, cls: "text-success", label: "melhorando" },
  piorando: { icon: TrendingDown, cls: "text-destructive", label: "piorando" },
  estavel: { icon: Minus, cls: "text-muted-foreground", label: "estável" },
  sem_dados: { icon: Minus, cls: "text-muted-foreground/40", label: "poucos dados" },
} as const;


function WeakRow({ w, busy, onTrain }: { w: WeakTopic; busy: boolean; onTrain: () => void }) {
  const t = TREND[w.trend];
  const Icon = t.icon;
  const acc = w.accuracy ?? null;
  return (
    <motion.li variants={itemIn} className="group flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-secondary/40">
      <span className="size-2 shrink-0 rounded-full" style={{ background: w.color }} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{w.topic}</span>
        <span className="block truncate text-[11px] text-muted-foreground">
          {w.subject} · {w.answered ? `${w.answered} respondidas` : "nunca treinado"}
          {w.errors_due > 0 && <span className="text-destructive"> · {plural(w.errors_due, "erro vencido", "erros vencidos")}</span>}
        </span>
      </span>
      <span className="w-20">
        <span className={cn("tabular block text-right text-xs font-semibold", accTone(acc))}>{pct(acc)}</span>
        <ProgressBar value={acc ?? 0} className="mt-1 h-1" color={w.color} />
      </span>
      <Icon className={cn("size-4 shrink-0", t.cls)} aria-label={t.label} />
      <Button size="sm" variant="ghost" className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100" disabled={busy} onClick={onTrain}>
        Treinar
      </Button>
    </motion.li>
  );
}

function ModeTile({ icon: Icon, title, text, action, onClick, tone }: { icon: LucideIcon; title: string; text: string; action: string; onClick: () => void; tone: string }) {
  return (
    <section className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4">
      <Icon className={cn("size-5 shrink-0", tone)} />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{text}</p>
      </div>
      <Button size="sm" variant="secondary" onClick={onClick}>
        {action}
      </Button>
    </section>
  );
}

function Report({ r, onBack, onReforco }: { r: SessionReport; onBack: () => void; onReforco: () => void }) {
  const score = r.total ? Math.round((r.correct / r.total) * 100) : 0;
  useEffect(() => sfx(score >= 80 ? "levelup" : "success"), [score]);
  const mins = Math.round(r.seconds / 60);
  return (
    <div className="mx-auto max-w-2xl space-y-6 py-4 text-center">
      <motion.div initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={spring.bouncy} className="space-y-2">
        <motion.div {...breathe} className="mx-auto w-fit">
          <Mascot look={score >= 80 ? "cap" : "base"} scale={6} />
        </motion.div>
        <p className="retro tabular text-5xl text-primary">
          <Count to={score} suffix="%" />
        </p>
        <p className="text-muted-foreground">
          {r.correct} de {r.total} · {mins} min · <span className="text-primary">+{r.xp} XP</span>
        </p>
        <p className="text-sm">{score >= 80 ? "Mandou muito bem!" : score >= 60 ? "Bom ritmo. Os erros já foram para o caderno." : "Dia de aprender: cada erro virou revisão marcada."}</p>
      </motion.div>
      {r.by_subject.length > 0 && (
        <motion.ul variants={listIn} initial="hidden" animate="show" className="space-y-2 rounded-2xl border border-border bg-card p-4 text-left">
          {r.by_subject.map((s) => (
            <motion.li key={s.subject} variants={itemIn} className="flex items-center gap-3 text-sm">
              <span className="w-44 truncate">{s.subject}</span>
              <ProgressBar value={s.correct / Math.max(1, s.total)} className="flex-1" color={s.color} transition={{ ...spring.soft, delay: 0.3 }} />
              <span className="tabular w-14 text-right text-muted-foreground">
                {s.correct}/{s.total}
              </span>
            </motion.li>
          ))}
        </motion.ul>
      )}
      <div className="flex justify-center gap-2">
        <Button variant={score < 80 ? "secondary" : "default"} onClick={onBack}>
          Voltar
        </Button>
        {score < 80 && r.total > 0 && (
          <Button onClick={onReforco}>
            <Swords /> Reforçar os pontos fracos
          </Button>
        )}
      </div>
    </div>
  );
}
