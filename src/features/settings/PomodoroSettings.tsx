import { useEffect, useState, type ReactNode } from "react";
import { Bell, BellRing, Check, Coffee, Eye, Layers, Play, Repeat, Target, Timer, Volume2 } from "lucide-react";
import { toastError } from "@/components/toast";
import { Switch } from "@/components/ui/switch";
import { commands, type PomodoroConfig_Serialize as PomodoroConfig } from "@/lib/bindings";
import { LAYOUTS, PRESETS, usePomodoroView, type PomodoroLayout } from "@/lib/pomodoro";
import { cn, warn } from "@/lib/utils";

/** Configurações → Pomodoro: tempos, ciclo, início automático, avisos, sons e o visual do relógio. */
export function PomodoroSettings() {
  const [cfg, setCfg] = useState<PomodoroConfig | null>(null);
  const [view, setView] = usePomodoroView();

  useEffect(() => {
    commands.getPomodoroConfig().then(setCfg, toastError);
  }, []);

  if (!cfg) return null;
  // grava a cada mudança (sem botão "Salvar"): o próximo pomodoro já usa
  const save = (patch: Partial<PomodoroConfig>) => {
    const next = { ...cfg, ...patch };
    setCfg(next);
    commands.setPomodoroConfig(next).catch((e) => {
      toastError(e);
      warn("salvar o pomodoro", e);
    });
  };
  const preset = PRESETS.find((p) => p.focus === cfg.focus_min && p.short === cfg.break_min && p.long === cfg.long_break_min && p.every === cfg.long_every);
  const cycleMin = cfg.long_every > 0 ? cfg.focus_min * cfg.long_every + cfg.break_min * (cfg.long_every - 1) + cfg.long_break_min : cfg.focus_min + cfg.break_min;

  return (
    <div className="space-y-4">
      <Section icon={<Layers />} title="Ritmo" text="Escolha um pronto ou ajuste cada tempo abaixo.">
        <div className="grid gap-2 @lg:grid-cols-2 @3xl:grid-cols-4">
          {PRESETS.map((p) => {
            const on = preset?.id === p.id;
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={on}
                onClick={() => save({ focus_min: p.focus, break_min: p.short, long_break_min: p.long, long_every: p.every })}
                className={cn("space-y-0.5 rounded-xl border-2 p-3 text-left transition-colors", on ? "border-primary bg-primary/5" : "border-border hover:border-primary/50")}
              >
                <span className="flex items-center justify-between text-sm font-semibold">
                  {p.label} {on && <Check className="size-4 text-primary" />}
                </span>
                <span className="block text-xs text-muted-foreground">{p.hint}</span>
              </button>
            );
          })}
        </div>
        {!preset && <p className="text-xs text-primary">Personalizado</p>}
      </Section>

      <Section icon={<Timer />} title="Tempos">
        <div className="grid gap-4 @2xl:grid-cols-2">
          <Slider label="Foco" value={cfg.focus_min} min={5} max={120} step={5} unit="min" onChange={(v) => save({ focus_min: v })} />
          <Slider label="Pausa curta" value={cfg.break_min} min={1} max={30} step={1} unit="min" onChange={(v) => save({ break_min: v })} />
          <Slider label="Pausa longa" value={cfg.long_break_min} min={5} max={60} step={5} unit="min" disabled={cfg.long_every === 0} onChange={(v) => save({ long_break_min: v })} />
          <Slider
            label="Pausa longa a cada"
            value={cfg.long_every}
            min={0}
            max={8}
            step={1}
            unit={cfg.long_every === 1 ? "foco" : "focos"}
            zero="nunca"
            onChange={(v) => save({ long_every: v })}
          />
        </div>
        <CycleBar cfg={cfg} />
        <p className="text-xs text-muted-foreground">
          Um ciclo completo leva <strong className="text-foreground">{cycleMin} min</strong>
          {cfg.long_every > 0 && ` (${cfg.long_every} focos de ${cfg.focus_min} min)`}.
        </p>
      </Section>

      <Section icon={<Repeat />} title="Sequência">
        <Toggle
          icon={<Coffee />}
          title="Começar a pausa sozinha"
          hint="Quando o foco acaba, a pausa já começa a contar. Desligado, ela espera você tocar em Continuar."
          checked={cfg.auto_start_breaks}
          onChange={(v) => save({ auto_start_breaks: v })}
        />
        <Toggle
          icon={<Play />}
          title="Começar o próximo foco sozinho"
          hint="Pomodoros em sequência sem tocar em nada. Desligado, o próximo foco espera você voltar."
          checked={cfg.auto_start_focus}
          onChange={(v) => save({ auto_start_focus: v })}
        />
      </Section>

      <Section icon={<Bell />} title="Avisos e sons">
        <Toggle icon={<BellRing />} title="Notificação do Windows" hint="Aparece no canto da tela ao fim de cada foco e pausa, mesmo com o app na bandeja." checked={cfg.notify} onChange={(v) => save({ notify: v })} />
        <Toggle icon={<Volume2 />} title="Sino ao terminar a fase" hint="Som curto quando o foco ou a pausa acaba (com o app aberto)." checked={view.endSound} onChange={(v) => setView({ endSound: v })} />
        <Toggle icon={<Timer />} title="Tique-taque durante o foco" hint="Um clique baixinho a cada segundo, para entrar no ritmo." checked={view.tick} onChange={(v) => setView({ tick: v })} />
      </Section>

      <Section icon={<Eye />} title="Visual do relógio" text="Vale para a aba Foco do Estudo.">
        <div className="grid gap-2 @lg:grid-cols-2 @3xl:grid-cols-4">
          {LAYOUTS.map((l) => {
            const on = view.layout === l.id;
            return (
              <button
                key={l.id}
                type="button"
                aria-pressed={on}
                onClick={() => setView({ layout: l.id })}
                className={cn("space-y-2 rounded-xl border-2 p-3 text-left transition-colors", on ? "border-primary bg-primary/5" : "border-border hover:border-primary/50")}
              >
                <LayoutThumb layout={l.id} />
                <span className="flex items-center justify-between text-sm font-semibold">
                  {l.label} {on && <Check className="size-4 text-primary" />}
                </span>
                <span className="block text-xs text-muted-foreground">{l.hint}</span>
              </button>
            );
          })}
        </div>
        <Toggle title="Grifinho estudando junto" hint="O mascote fica ao lado do relógio (cochila quando você pausa)." checked={view.mascot} onChange={(v) => setView({ mascot: v })} />
        <Toggle title="Bolinhas do ciclo" hint="Mostra quantos focos faltam para a pausa longa." checked={view.cycleDots} onChange={(v) => setView({ cycleDots: v })} />
        <Toggle title="Tempo no título da janela" hint="O relógio aparece na barra de tarefas do Windows enquanto conta." checked={view.titleClock} onChange={(v) => setView({ titleClock: v })} />
      </Section>

      <Section icon={<Target />} title="Meta do dia">
        <Slider label="Pomodoros por dia" value={view.dailyGoal} min={1} max={16} step={1} unit={view.dailyGoal === 1 ? "pomodoro" : "pomodoros"} onChange={(v) => setView({ dailyGoal: v })} />
        <p className="text-xs text-muted-foreground">
          Dá {Math.round((view.dailyGoal * cfg.focus_min) / 6) / 10} h de foco. O Foco mostra quanto falta hoje.
        </p>
      </Section>
    </div>
  );
}

function Section({ icon, title, text, children }: { icon: ReactNode; title: string; text?: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-3">
        <span className="grid size-9 place-items-center rounded-xl bg-primary/15 text-primary [&_svg]:size-4.5">{icon}</span>
        <div>
          <h2 className="font-semibold">{title}</h2>
          {text && <p className="text-xs text-muted-foreground">{text}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  unit,
  zero,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  zero?: string;
  disabled?: boolean;
  onChange: (v: number) => void;
}) {
  const [v, setV] = useState(value);
  useEffect(() => {
    setV(value);
  }, [value]);
  return (
    <label className={cn("block space-y-2 rounded-xl bg-secondary/40 p-3", disabled && "opacity-50")}>
      <span className="flex items-center justify-between text-sm">
        <span>{label}</span>
        <span className="tabular rounded-md bg-card px-2 py-0.5 font-semibold">{v === 0 && zero ? zero : `${v} ${unit}`}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={v}
        disabled={disabled}
        onChange={(e) => setV(Number(e.target.value))}
        // grava ao soltar (arrastar não dispara uma gravação por passo)
        onPointerUp={() => v !== value && onChange(v)}
        onKeyUp={() => v !== value && onChange(v)}
        className="w-full accent-[var(--primary)]"
      />
    </label>
  );
}

function Toggle({ icon, title, hint, checked, onChange }: { icon?: ReactNode; title: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-border p-3 transition-colors hover:bg-secondary/30">
      {icon && <span className="text-muted-foreground [&_svg]:size-4">{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

/** Desenho do ciclo: blocos de foco e de pausa na proporção do tempo. */
function CycleBar({ cfg }: { cfg: PomodoroConfig }) {
  const n = Math.max(1, cfg.long_every || 1);
  const parts: { kind: "focus" | "short" | "long"; min: number }[] = [];
  for (let i = 0; i < n; i++) {
    parts.push({ kind: "focus", min: cfg.focus_min });
    if (i < n - 1) parts.push({ kind: "short", min: cfg.break_min });
  }
  parts.push(cfg.long_every > 0 ? { kind: "long", min: cfg.long_break_min } : { kind: "short", min: cfg.break_min });
  return (
    <div className="space-y-1.5">
      <div className="flex h-3 gap-1 overflow-hidden rounded-full" aria-hidden>
        {parts.map((p, i) => (
          <span
            key={i}
            style={{ flexGrow: p.min }}
            className={cn("h-full rounded-full", p.kind === "focus" ? "bg-primary" : p.kind === "long" ? "bg-sky-500" : "bg-success/70")}
          />
        ))}
      </div>
      <div className="flex gap-3 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="size-2 rounded-full bg-primary" /> foco
        </span>
        <span className="flex items-center gap-1">
          <span className="size-2 rounded-full bg-success/70" /> pausa
        </span>
        {cfg.long_every > 0 && (
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-full bg-sky-500" /> pausa longa
          </span>
        )}
      </div>
    </div>
  );
}

/** Miniatura de cada visual do relógio. */
function LayoutThumb({ layout }: { layout: PomodoroLayout }) {
  return (
    <span className="grid h-20 place-items-center rounded-lg bg-background/60">
      {layout === "pixel" && (
        <svg viewBox="0 0 40 40" className="size-14">
          {Array.from({ length: 16 }, (_, i) => {
            const a = (i / 16) * 2 * Math.PI - Math.PI / 2;
            return <rect key={i} x={20 + 15 * Math.cos(a) - 1.6} y={20 + 15 * Math.sin(a) - 1.2} width={3.2} height={2.4} fill={i < 10 ? "var(--primary)" : "var(--border)"} />;
          })}
          <text x="20" y="23" textAnchor="middle" fontSize="8" fill="currentColor" fontFamily="monospace">
            25
          </text>
        </svg>
      )}
      {layout === "anel" && (
        <svg viewBox="0 0 40 40" className="size-14">
          <circle cx="20" cy="20" r="15" fill="none" stroke="var(--border)" strokeWidth="3" />
          <circle cx="20" cy="20" r="15" fill="none" stroke="var(--primary)" strokeWidth="3" strokeLinecap="round" strokeDasharray="94" strokeDashoffset="35" transform="rotate(-90 20 20)" />
          <text x="20" y="23" textAnchor="middle" fontSize="8" fill="currentColor">
            25
          </text>
        </svg>
      )}
      {layout === "digital" && (
        <span className="w-4/5 space-y-1.5 text-center">
          <span className="retro block text-lg text-primary">25:00</span>
          <span className="block h-1 overflow-hidden rounded-full bg-border">
            <span className="block h-full w-3/5 bg-primary" />
          </span>
        </span>
      )}
      {layout === "minimo" && <span className="tabular text-2xl font-light">25:00</span>}
    </span>
  );
}
