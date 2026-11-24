import { useEffect, useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { Check, Play } from "lucide-react";
import type { Navigate } from "@/app/nav";
import { Count, Skeleton } from "@/components/motion";
import { ProgressBar } from "@/components/Progress";
import { toastError } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { dailyProgress } from "@/features/study/daily";
import {
  commands,
  type Contest_Serialize as Contest,
  type Dashboard_Serialize as Dashboard,
  type NewsItem,
  type Profile_Serialize as Profile,
  type StudyHome,
} from "@/lib/bindings";
import { isoDay, lastDays, weekStart } from "@/lib/dates";
import { ago, feedColor, formatDate, hours, plural, shortDate } from "@/lib/format";
import { cn, errorMessage, warn } from "@/lib/utils";
import { isDone } from "@/features/world/contests";

export function Panel(props: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex h-full flex-col gap-3 overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-soft">
      <header className="flex items-center justify-between gap-2">
        <h2 className="retro text-[11px] text-primary">{props.title}</h2>
        {props.action}
      </header>
      {props.children}
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

function LinkButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} className="text-xs text-muted-foreground underline-offset-2 hover:text-primary hover:underline">
      {children}
    </button>
  );
}

export function MissionsWidget({ d }: { d: Dashboard }) {
  return (
    <Panel title="Missões do dia">
      {d.missions.length === 0 && <Empty>Cadastre matérias para receber missões.</Empty>}
      <ul className="space-y-3">
        {d.missions.map((m) => (
          <li key={m.id} className="space-y-1">
            <div className="flex justify-between gap-2 text-sm">
              <span className={cn("flex items-center gap-1.5", m.done && "text-success")}>
                {m.done && <DrawnCheck />}
                <span className={cn(m.done && "line-through decoration-success/50 decoration-2")}>{m.description}</span>
              </span>
              <span className="retro shrink-0 text-[10px] text-primary">+{m.xp_reward} XP</span>
            </div>
            <ProgressBar value={m.progress / m.target} className="rounded-sm" tone="bg-accent" />
            <p className="text-xs text-muted-foreground">
              {Math.min(m.progress, m.target)}/{m.target}
            </p>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/** Check que se desenha (traço SVG), para missão concluída. */
function DrawnCheck() {
  return (
    <svg viewBox="0 0 16 16" className="size-4 shrink-0" aria-hidden>
      <motion.path
        d="M3 8.5 L6.5 12 L13 4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.5, ease: "easeOut", delay: 0.2 }}
      />
    </svg>
  );
}

export function TodayWidget({ go }: { go: Navigate }) {
  const [h, setH] = useState<StudyHome | null>(null);
  const [error, setError] = useState("");
  useEffect(() => void commands.studyHome().then(setH, (e) => setError(errorMessage(e))), []);
  if (error) {
    return (
      <Panel title="Sessão de hoje">
        <Empty>Não consegui carregar a sessão: {error}</Empty>
      </Panel>
    );
  }
  if (!h) {
    return (
      <Panel title="Sessão de hoje">
        <Skeleton className="h-16 rounded-lg" />
      </Panel>
    );
  }
  const { left, frac } = dailyProgress(h);
  const extras = [
    h.errors_due ? `${plural(h.errors_due, "erro", "erros")} para revisar` : "",
    h.cards_due ? plural(h.cards_due, "flashcard", "flashcards") : "",
    h.cycle_next ? `próxima no ciclo: ${h.cycle_next.name}` : "",
  ].filter(Boolean);
  return (
    <Panel title="Sessão de hoje">
      <div className="flex flex-1 flex-wrap items-center gap-4">
        <div className="min-w-40 flex-1 space-y-2">
          <p className="text-lg font-semibold">
            {left > 0 ? (
              <>
                Faltam <span className="text-primary">{left}</span> de {h.daily_goal} questões
              </>
            ) : (
              "Meta batida hoje! 🎉"
            )}
          </p>
          <ProgressBar value={frac} label="Meta do dia" />
          <p className="text-xs text-muted-foreground">{extras.length ? extras.join(" · ") : "Nada vencido. Bora pra frente."}</p>
        </div>
        <Button variant="secondary" onClick={() => go("foco")}>
          <Play /> {left > 0 ? "Começar" : "Mais questões"}
        </Button>
      </div>
    </Panel>
  );
}

export function WeeklyWidget({ d }: { d: Dashboard }) {
  const [p, setP] = useState<Profile | null>(null);
  useEffect(() => void commands.getProfile().then(setP, (e) => warn("ler o perfil", e)), []);
  const start = isoDay(weekStart());
  const week = d.activity.filter((a) => a.day >= start);
  const questions = week.reduce((n, a) => n + a.questions, 0);
  const studied = week.reduce((n, a) => n + a.study_minutes, 0) / 60;
  const days = p?.study_days.length ?? 5;
  const goals = [
    { label: "questões", value: questions, goal: (p?.daily_questions ?? 20) * days, fmt: (x: number) => String(Math.round(x)) },
    { label: "horas", value: studied, goal: (p?.hours_per_day ?? 2) * days, fmt: hours },
  ];
  return (
    <Panel title="Metas da semana">
      <ul className="space-y-3">
        {goals.map((g) => {
          const frac = Math.min(1, g.value / Math.max(0.01, g.goal));
          return (
            <li key={g.label} className="space-y-1">
              <div className="flex items-baseline justify-between text-sm">
                <span>
                  <b className="tabular">{g.fmt(g.value)}</b>{" "}
                  <span className="text-muted-foreground">
                    de {g.fmt(g.goal)} {g.label}
                  </span>
                </span>
                {frac >= 1 && <Check className="size-4 text-success" />}
              </div>
              <ProgressBar value={frac} tone={frac >= 1 ? "bg-success" : "bg-primary"} />
            </li>
          );
        })}
      </ul>
      <p className="mt-auto text-[11px] text-muted-foreground">Semana de segunda a domingo · meta = rotina do seu perfil.</p>
    </Panel>
  );
}

export function RecordsWidget({ d }: { d: Dashboard }) {
  const best = d.activity.reduce((m, a) => (a.questions > m.questions ? a : m), { day: "", questions: 0, study_minutes: 0 });
  const total = d.activity.reduce((n, a) => n + a.questions, 0);
  const studied = Math.round(d.activity.reduce((n, a) => n + a.study_minutes, 0) / 60);
  const items: [number, string][] = [
    [total, "questões no ano"],
    [studied, "horas de estudo"],
    [best.questions, best.day ? `no melhor dia (${shortDate(best.day)})` : "no melhor dia"],
  ];
  return (
    <Panel title="Recordes">
      <ul className="grid gap-2">
        {items.map(([n, l]) => (
          <li key={l} className="flex items-baseline gap-2">
            <span className="retro tabular text-lg text-primary">
              <Count to={n} />
            </span>
            <span className="text-xs text-muted-foreground">{l}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export function CountdownWidget({ d, go }: { d: Dashboard; go: Navigate }) {
  const [next, ...rest] = d.exams;
  return (
    <Panel title="Dias até a prova" action={<LinkButton onClick={() => go("mundo")}>gerenciar</LinkButton>}>
      {!next ? (
        <Empty>Nenhuma prova marcada. Adicione em Mundo → Provas.</Empty>
      ) : (
        <>
          <div className="flex items-baseline gap-3">
            <span className="retro tabular text-4xl text-primary">
              <Count to={next.days_left} />
            </span>
            <span className="text-sm text-muted-foreground">{next.days_left === 1 ? "dia" : "dias"}</span>
          </div>
          <p className="font-medium">
            {next.name}
            <span className="text-sm text-muted-foreground"> · {[formatDate(next.exam_date), next.banca].filter(Boolean).join(" · ")}</span>
          </p>
          {rest.length > 0 && (
            <ul className="space-y-1 border-t border-border pt-2 text-sm text-muted-foreground">
              {rest.slice(0, 3).map((e) => (
                <li key={e.id}>
                  <b className="text-foreground">{e.days_left}d</b> · {e.name}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Panel>
  );
}

/** Intensidade 0–4 do dia no mapa de calor (questões + minutos/3). */
function heat(score: number): number {
  if (score <= 0) return 0;
  if (score < 15) return 1;
  if (score < 40) return 2;
  if (score < 80) return 3;
  return 4;
}

export function HeatmapWidget({ d }: { d: Dashboard }) {
  // 53 semanas terminando hoje; colunas = semanas (domingo no topo).
  const today = new Date();
  const days = lastDays(53 * 7 - (6 - today.getDay()));
  const byDay = new Map(d.activity.map((a) => [a.day, a]));
  const activeDays = d.activity.filter((a) => a.questions > 0 || a.study_minutes > 0).length;
  return (
    <Panel title="Mapa de calor">
      <p className="text-sm text-muted-foreground">{plural(activeDays, "dia", "dias")} com estudo no último ano</p>
      <div className="overflow-x-auto pb-1">
        <div className="grid grid-flow-col grid-rows-7 gap-[3px]" style={{ width: "max-content" }}>
          {days.map((day) => {
            const iso = isoDay(day);
            const a = byDay.get(iso);
            const lv = heat(a ? a.questions + a.study_minutes / 3 : 0);
            return (
              <div
                key={iso}
                title={`${formatDate(iso)}: ${a?.questions ?? 0} questões, ${a?.study_minutes ?? 0} min de estudo`}
                className="size-3 rounded-[2px]"
                style={{ background: lv === 0 ? "var(--secondary)" : `color-mix(in srgb, var(--accent) ${25 + lv * 18}%, var(--secondary))` }}
              />
            );
          })}
        </div>
      </div>
    </Panel>
  );
}

export function ReviewsWidget({ d, go }: { d: Dashboard; go: Navigate }) {
  return (
    <Panel title="Fila de revisão" action={<LinkButton onClick={() => go("sala")}>ir para a sala</LinkButton>}>
      {d.reviews.length === 0 ? (
        <Empty>Nenhuma reaula nos próximos 7 dias.</Empty>
      ) : (
        <ul className="space-y-1.5 text-sm">
          {d.reviews.map((r) => (
            <li key={r.id} className="flex justify-between gap-2">
              <span>
                {r.topic} <span className="text-muted-foreground">· {r.subject}</span>
              </span>
              <span className={r.overdue ? "text-destructive" : "text-muted-foreground"}>{r.overdue ? "hoje" : formatDate(r.due_at)}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export function NewsWidget({ go }: { go: Navigate }) {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [error, setError] = useState("");
  useEffect(() => void commands.listNews(5).then(setNews, (e) => setError(errorMessage(e))), []);
  const markRead = (n: NewsItem) => {
    setNews((list) => list.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
    commands.setNewsRead(n.id, true).catch(toastError);
  };
  return (
    <Panel title="Notícias" action={<LinkButton onClick={() => go("mundo")}>ver todas</LinkButton>}>
      {error && <Empty>{error}</Empty>}
      {news.length === 0 && !error && <Empty>Buscando notícias… (atualiza a cada 3 horas)</Empty>}
      <ul className="space-y-1">
        {news.map((n) => (
          <li key={n.id} className="group flex items-start gap-3 rounded-lg p-1.5 hover:bg-secondary/50">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg text-[11px] font-bold text-white" style={{ background: feedColor(n.feed) }} aria-hidden>
              {n.feed.slice(0, 2).toUpperCase()}
            </span>
            <button
              className="min-w-0 flex-1 text-left"
              onClick={() => {
                markRead(n);
                commands.openLink(n.link).catch(toastError);
              }}
            >
              <span className={cn("line-clamp-2 text-sm leading-snug", n.read ? "text-muted-foreground" : "font-medium")}>{n.title}</span>
              <span className="text-[11px] text-muted-foreground">
                {n.feed} · {ago(n.published_at)}
              </span>
            </button>
            <button
              onClick={() => markRead(n)}
              aria-label={n.read ? "Lida" : "Marcar como lida"}
              title={n.read ? "Lida" : "Marcar como lida"}
              className={cn(
                "mt-1 grid size-6 shrink-0 place-items-center rounded-full border transition-colors",
                n.read ? "border-success bg-success text-white" : "border-border opacity-0 group-hover:opacity-100 hover:border-success",
              )}
            >
              <Check className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export function ContestsWidget({ go }: { go: Navigate }) {
  const [contests, setContests] = useState<Contest[]>([]);
  // Só os que ainda dá para fazer: prova realizada (aditivo, convocação) fica no rastreador.
  useEffect(() => void commands.listContests().then((all) => setContests(all.filter((c) => !isDone(c.status))), (e) => warn("ler os concursos", e)), []);
  return (
    <Panel title="Concursos da sua área" action={<LinkButton onClick={() => go("mundo")}>rastreador</LinkButton>}>
      {contests.length === 0 && <Empty>Defina sua área em Config e busque com o Claude em Mundo → Concursos.</Empty>}
      <ul className="space-y-2 text-sm">
        {contests.slice(0, 5).map((c) => (
          <li key={c.id}>
            <button className="text-left hover:text-primary" onClick={() => commands.openLink(c.url).catch(toastError)}>
              {c.followed && "★ "}
              {c.title}
            </button>
            <p className="text-xs text-muted-foreground">{[c.status, c.banca, c.deadline && `até ${formatDate(c.deadline)}`].filter(Boolean).join(" · ")}</p>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
