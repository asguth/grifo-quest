import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Hourglass, Minus, Play, Target, TrendingDown, TrendingUp } from "lucide-react";
import { Skeleton } from "@/components/motion";
import { ProgressBar } from "@/components/Progress";
import { StatTile } from "@/components/StatTile";
import { toastError } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { commands, type Performance, type SubjectPerf } from "@/lib/bindings";
import { isoDay, lastDays, shortDay } from "@/lib/dates";
import { accBg, accTone, duration, formatDate, parseUtc, pct, shortDate } from "@/lib/format";
import { itemIn, listIn, spring } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { type Start } from "./shared";

const ratio = (c: number, t: number) => (t > 0 ? c / t : null);

/** Peso × o que você ainda erra: onde está a maior fatia de pontos que a prova pode tirar de você. */
function risk(s: SubjectPerf) {
  const acc = ratio(s.correct_30, s.answered_30) ?? ratio(s.correct, s.answered);
  return (s.weight ?? 1) * (1 - (acc ?? 0.5)); // sem dados conta como 50%: não some do radar
}

/** Data local (dd/mm) de um datetime UTC do SQLite. */
const localDay = (utc: string) => shortDate(isoDay(parseUtc(utc)));

export function PerformanceTab({ start }: { start: Start }) {
  const [p, setP] = useState<Performance | null>(null);
  useEffect(() => void commands.performance().then(setP, toastError), []);

  if (!p) return <div className="grid grid-cols-2 gap-4 @3xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div>;

  const answered30 = p.subjects.reduce((n, s) => n + s.answered_30, 0);
  const correct30 = p.subjects.reduce((n, s) => n + s.correct_30, 0);
  const minutes30 = p.subjects.reduce((n, s) => n + (s.minutes_30 ?? 0), 0);
  const last = p.simulados[0];
  const ranked = [...p.subjects].filter((s) => (s.weight ?? 1) > 0).sort((a, b) => risk(b) - risk(a));
  const totalRisk = ranked.reduce((n, s) => n + risk(s), 0) || 1;

  if (p.subjects.length === 0) {
    return <p className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">Cadastre as matérias e responda algumas questões: aqui aparece onde você ganha e perde pontos.</p>;
  }

  return (
    <div className="space-y-5">
      <motion.div variants={listIn} initial="hidden" animate="show" className="grid grid-cols-2 gap-3 @3xl:grid-cols-4">
        <Kpi label="questões em 30 dias" value={answered30.toLocaleString("pt-BR")} />
        <Kpi label="de acerto em 30 dias" value={pct(ratio(correct30, answered30))} tone={accTone(ratio(correct30, answered30))} />
        <Kpi label="de estudo cronometrado (30 dias)" value={duration(minutes30)} />
        <Kpi label={last ? `no último simulado (${localDay(last.started_at)})` : "nenhum simulado ainda"} value={last ? pct(ratio(last.correct, last.total)) : "—"} tone={accTone(last ? ratio(last.correct, last.total) : null)} />
      </motion.div>

      <div className="grid items-start gap-4 @4xl:grid-cols-[1fr_1.3fr]">
        <section className="space-y-3 rounded-2xl border border-border bg-card p-5">
          <header className="flex items-center gap-2">
            <Target className="size-5 text-destructive" />
            <h2 className="font-semibold">Onde você mais perde pontos</h2>
          </header>
          <p className="text-xs text-muted-foreground">Peso da matéria × quanto você ainda erra. A barra é a fatia dos pontos em risco na prova.</p>
          <ul className="space-y-2.5">
            {ranked.slice(0, 5).map((s, i) => {
              const share = risk(s) / totalRisk;
              const acc = ratio(s.correct_30, s.answered_30) ?? ratio(s.correct, s.answered);
              return (
                <li key={s.id} className="group space-y-1">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="tabular w-4 text-xs text-muted-foreground">{i + 1}</span>
                    <span className="size-2 shrink-0 rounded-full" style={{ background: s.color }} />
                    <span className="min-w-0 flex-1 truncate font-medium">{s.name}</span>
                    <span className={cn("tabular text-xs", accTone(acc))}>{acc === null ? "sem dados" : `${pct(acc)} acerto`}</span>
                    <Button size="sm" variant="ghost" className="h-7 opacity-60 group-hover:opacity-100" onClick={() => void start("topico", { subject: s.id, n: 15 })}>
                      <Play /> Treinar
                    </Button>
                  </div>
                  <ProgressBar value={share} className="ml-6 h-1.5" tone="bg-destructive/70" transition={{ ...spring.soft, delay: 0.1 + i * 0.05 }} />
                </li>
              );
            })}
          </ul>
        </section>

        <Daily daily={p.daily} />
      </div>

      <section className="overflow-x-auto rounded-2xl border border-border bg-card p-5">
        <h2 className="mb-3 font-semibold">Por matéria</h2>
        <table className="w-full min-w-[620px] text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr>
              <th className="pb-2 font-medium">Matéria</th>
              <th className="pb-2 text-right font-medium">Peso</th>
              <th className="pb-2 text-right font-medium">Questões (30 d)</th>
              <th className="w-48 pb-2 pl-4 font-medium">Acerto (30 d)</th>
              <th className="pb-2 text-center font-medium">Tendência</th>
              <th className="pb-2 text-right font-medium">Tempo (30 d)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {p.subjects.map((s) => {
              const acc = ratio(s.correct_30, s.answered_30);
              const prev = ratio(s.correct_prev, s.answered_prev);
              const delta = acc !== null && prev !== null ? acc - prev : null;
              const T = delta === null || Math.abs(delta) < 0.05 ? Minus : delta > 0 ? TrendingUp : TrendingDown;
              return (
                <tr key={s.id}>
                  <td className="py-2">
                    <span className="flex items-center gap-2">
                      <span className="size-2 shrink-0 rounded-full" style={{ background: s.color }} />
                      <span className="truncate">{s.name}</span>
                    </span>
                  </td>
                  <td className="tabular py-2 text-right text-muted-foreground">{s.weight ?? 1}</td>
                  <td className="tabular py-2 text-right">{s.answered_30 || <span className="text-muted-foreground">0</span>}</td>
                  <td className="py-2 pl-4">
                    <span className="flex items-center gap-2">
                      <ProgressBar value={acc ?? 0} className="h-1.5 flex-1" color={s.color} />
                      <span className={cn("tabular w-10 text-right text-xs font-semibold", accTone(acc))}>{pct(acc)}</span>
                    </span>
                  </td>
                  <td className="py-2">
                    <T
                      className={cn("mx-auto size-4", delta === null ? "text-muted-foreground/40" : delta >= 0.05 ? "text-success" : delta <= -0.05 ? "text-destructive" : "text-muted-foreground")}
                      aria-label={delta === null ? "sem dados" : `${delta > 0 ? "+" : ""}${Math.round(delta * 100)} pontos em relação aos 30 dias anteriores`}
                    />
                  </td>
                  <td className="tabular py-2 text-right text-muted-foreground">{s.minutes_30 ? duration(s.minutes_30) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="space-y-3 rounded-2xl border border-border bg-card p-5">
        <header className="flex items-center gap-2">
          <Hourglass className="size-5 text-primary" />
          <h2 className="flex-1 font-semibold">Simulados</h2>
          <Button size="sm" variant="secondary" onClick={() => void start("simulado", { n: 30 })}>
            <Play /> Fazer um de 30
          </Button>
        </header>
        {p.simulados.length === 0 ? (
          <p className="text-sm text-muted-foreground">Faça um simulado por semana: treina o tempo de prova e mostra se a nota está subindo.</p>
        ) : (
          <div className="flex h-32 items-end gap-2">
            {[...p.simulados].reverse().map((s) => {
              const a = ratio(s.correct, s.total) ?? 0;
              return (
                <div key={s.id} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${localDay(s.started_at)}: ${s.correct}/${s.total} em ${Math.round(s.seconds / 60)} min`}>
                  <span className={cn("tabular text-[10px] font-semibold", accTone(a))}>{Math.round(a * 100)}</span>
                  <motion.div className={cn("w-full max-w-10 rounded-t-md", accBg(a))} initial={{ height: 0 }} animate={{ height: `${a * 80}%` }} transition={spring.soft} />
                  <span className="text-[10px] text-muted-foreground">{localDay(s.started_at)}</span>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <motion.div variants={itemIn}>
      <StatTile value={value} label={label} tone={tone ?? "text-foreground"} className="text-left" />
    </motion.div>
  );
}

function Daily({ daily }: { daily: Performance["daily"] }) {
  const by = new Map(daily.map((d) => [d.day, d]));
  const days = lastDays(30);
  const max = Math.max(1, ...daily.map((d) => d.answered));
  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-5">
      <h2 className="font-semibold">Questões por dia</h2>
      <div className="flex h-36 items-end gap-[3px]" role="img" aria-label="Questões respondidas por dia nos últimos 30 dias">
        {days.map((d) => {
          const k = isoDay(d);
          const x = by.get(k);
          const a = x ? x.correct / Math.max(1, x.answered) : 0;
          return (
            <div key={k} className="flex h-full flex-1 items-end" title={x ? `${formatDate(k)}: ${x.answered} questões, ${Math.round(a * 100)}% de acerto` : `${formatDate(k)}: nada`}>
              <motion.div
                className={cn("w-full rounded-t-sm", x ? accBg(a) : "bg-secondary")}
                initial={{ height: 0 }}
                animate={{ height: x ? `${Math.max(4, (x.answered / max) * 100)}%` : "3px" }}
                transition={spring.soft}
              />
            </div>
          );
        })}
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>{shortDay(days[0])} {shortDate(isoDay(days[0]))}</span>
        <span>hoje</span>
      </div>
      <p className="text-[11px] text-muted-foreground">Cor = acerto do dia (verde ≥ 80%, âmbar ≥ 60%). Conta as do app e as lançadas pelo lançamento rápido.</p>
    </section>
  );
}
