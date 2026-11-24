import { Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Dashboard_Serialize as Dashboard } from "@/lib/bindings";
import { isoDay, lastDays, shortDay } from "@/lib/dates";
import { hours } from "@/lib/format";
import { QUICK_LOG_SHORTCUT } from "@/lib/rules";
import { Empty, Panel } from "./widgets";

const tooltipStyle = {
  contentStyle: { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--foreground)" },
  cursor: { fill: "var(--secondary)" },
};
const axis = { stroke: "var(--muted-foreground)", fontSize: 12 };

export function AccuracyWidget({ d }: { d: Dashboard }) {
  const data = d.accuracy
    .filter((s) => s.total > 0)
    .map((s) => ({ name: s.name, pct: Math.round((100 * s.correct) / s.total), color: s.color, total: s.total }));
  return (
    <Panel title="% de acerto (30 dias)">
      {data.length === 0 ? (
        <Empty>Lance questões com {QUICK_LOG_SHORTCUT} para ver seu acerto.</Empty>
      ) : (
        <ResponsiveContainer width="100%" height={Math.max(120, data.length * 34)}>
          <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24 }}>
            <XAxis type="number" domain={[0, 100]} unit="%" {...axis} />
            <YAxis type="category" dataKey="name" width={130} {...axis} />
            <Tooltip {...tooltipStyle} formatter={(v, _n, p) => [`${v}% de ${p.payload.total} questões`, "Acerto"]} />
            <Bar dataKey="pct" radius={[0, 3, 3, 0]}>
              {data.map((s) => (
                <Cell key={s.name} fill={s.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </Panel>
  );
}

export function HoursWidget({ d }: { d: Dashboard }) {
  const data = lastDays(7).map((day) => {
    const iso = isoDay(day);
    const min = (kind: string) => d.week_hours.find((h) => h.day === iso && h.kind === kind)?.minutes ?? 0;
    return { day: shortDay(day), estudo: +(min("estudo") / 60).toFixed(1), trabalho: +(min("trabalho") / 60).toFixed(1) };
  });
  const total = (k: "estudo" | "trabalho") => hours(data.reduce((acc, x) => acc + x[k], 0));
  return (
    <Panel title="Estudo × trabalho">
      <p className="text-sm text-muted-foreground">
        Semana: <b className="text-accent">{total("estudo")}h</b> de estudo · <b className="text-primary">{total("trabalho")}h</b>{" "}
        de trabalho
      </p>
      <ResponsiveContainer width="100%" height={170}>
        <BarChart data={data}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis dataKey="day" interval="preserveStartEnd" minTickGap={8} {...axis} />
          <YAxis unit="h" width={36} {...axis} />
          <Tooltip {...tooltipStyle} />
          <Legend />
          <Bar dataKey="estudo" name="Estudo" fill="var(--accent)" radius={[3, 3, 0, 0]} />
          <Bar dataKey="trabalho" name="Trabalho" fill="var(--primary)" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </Panel>
  );
}

export function QuestionsWidget({ d }: { d: Dashboard }) {
  const data = lastDays(30).map((day) => ({
    day: `${day.getDate()}/${day.getMonth() + 1}`,
    questoes: d.activity.find((a) => a.day === isoDay(day))?.questions ?? 0,
  }));
  return (
    <Panel title="Questões por dia">
      <ResponsiveContainer width="100%" height={170}>
        <BarChart data={data}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis dataKey="day" interval="preserveStartEnd" minTickGap={16} {...axis} />
          <YAxis width={28} allowDecimals={false} {...axis} />
          <Tooltip {...tooltipStyle} />
          <Bar dataKey="questoes" name="Questões" fill="var(--primary)" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </Panel>
  );
}
