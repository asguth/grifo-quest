import { getVersion } from "@tauri-apps/api/app";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { Bot, Bug, Cog, DatabaseBackup, Lightbulb, Newspaper, Paintbrush, Plug, RotateCcw, Save, Timer, Trash2 } from "lucide-react";
import { SectionTabs } from "@/components/SectionTabs";
import { NativeSelect } from "@/components/fields";
import { Segmented } from "@/components/Segmented";
import { toast, toastError } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  commands,
  type AppConfig_Serialize as AppConfig,
  type BackupFile,
  type Feed,
  type CloudStatus,
  type GpuInfo,
  type Route,
  type PomodoroConfig,
} from "@/lib/bindings";
import { emit } from "@/lib/bus";
import { getFlag, saveFlag } from "@/lib/prefs";
import { reportIssue } from "@/lib/report";
import { QUICK_LOG_SHORTCUT } from "@/lib/rules";
import { setSoundEnabled, setSoundVolume, sfx, soundEnabled, soundVolume } from "@/lib/sound";
import {
  COLOR_TOKENS,
  customPreset,
  DEFAULT_THEME,
  FONTS,
  loadCustomThemes,
  PRESETS,
  saveCustomThemes,
  saveTheme,
  useTheme,
  type ColorToken,
  type CustomTheme,
  type FontId,
  type Palette,
  type Theme,
} from "@/lib/theme";
import { installUpdate, useUpdate } from "@/lib/update";
import { errorMessage, warn } from "@/lib/utils";
import { TagInput, splitTags } from "@/components/TagInput";
import { Integrations } from "./Integrations";

type Tab = "integracoes" | "aparencia" | "pomodoro" | "concursos" | "ia" | "sistema";

export default function SettingsScreen() {
  const [tab, setTab] = useState<Tab>("integracoes");
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <h1 className="retro text-sm text-primary">Config</h1>
      <SectionTabs
        label="Seções da Config"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "integracoes", label: "Integrações", icon: Plug },
          { id: "aparencia", label: "Aparência", icon: Paintbrush },
          { id: "pomodoro", label: "Pomodoro", icon: Timer },
          { id: "concursos", label: "Concursos", icon: Newspaper },
          { id: "ia", label: "IA", icon: Bot },
          { id: "sistema", label: "Sistema", icon: Cog },
        ]}
      />
      {tab === "integracoes" && <Integrations />}
      {tab === "aparencia" && <Appearance />}
      {tab === "pomodoro" && <Pomodoro />}
      {tab === "concursos" && <ContestsAndNews />}
      {tab === "ia" && <Ai />}
      {tab === "sistema" && <System />}
    </div>
  );
}

function Card({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-lg border border-border bg-card p-4">
      {title && <h2 className="font-semibold">{title}</h2>}
      {children}
    </section>
  );
}

/** Recado curto ao lado do botão ("Salvo"), que some sozinho. */
function useStatus() {
  const [status, setStatus] = useState("");
  useEffect(() => {
    if (!status) return;
    const id = setTimeout(() => setStatus(""), 2500);
    return () => clearTimeout(id);
  }, [status]);
  return [status, setStatus] as const;
}

/** Miniatura de um tema: cartão sobre o fundo com texto, texto suave, botão e as 3 cores de estado. */
function ThemeCard({ label, colors, active, onPick, onDelete }: { label: string; colors: Palette; active: boolean; onPick: () => void; onDelete?: () => void }) {
  return (
    <div className="relative">
      <button
        onClick={onPick}
        aria-pressed={active}
        className={`w-full overflow-hidden rounded-xl border-2 text-left text-sm transition-transform hover:-translate-y-0.5 ${active ? "border-primary" : "border-border"}`}
        style={{ background: colors.background, color: colors.foreground }}
      >
        <span className="m-2.5 mb-2 block space-y-1.5 rounded-lg p-2.5" style={{ background: colors.card, border: `1px solid ${colors.border}` }}>
          <span className="block h-1.5 w-3/4 rounded-full" style={{ background: colors.foreground }} />
          <span className="block h-1.5 w-1/2 rounded-full" style={{ background: colors["muted-foreground"] }} />
          <span className="flex items-center gap-1 pt-0.5">
            <span className="h-3.5 w-10 rounded" style={{ background: colors.primary }} />
            <span className="h-3.5 w-6 rounded" style={{ background: colors.secondary }} />
            <span className="ml-auto size-2.5 rounded-full" style={{ background: colors.accent }} />
            <span className="size-2.5 rounded-full" style={{ background: colors.destructive }} />
          </span>
        </span>
        <span className="block truncate px-3 pb-2.5 pr-8 font-medium">{label}</span>
      </button>
      {onDelete && (
        <button
          onClick={onDelete}
          aria-label={`Apagar o tema ${label}`}
          title="Apagar este tema"
          className="absolute right-2 bottom-2 grid size-6 place-items-center rounded-md opacity-60 hover:opacity-100"
          style={{ color: colors.foreground }}
        >
          <Trash2 className="size-3.5" />
        </button>
      )}
    </div>
  );
}

function Appearance() {
  const theme = useTheme();
  const update = (t: Theme) => saveTheme(t).catch(toastError);
  const [customs, setCustoms] = useState<CustomTheme[]>([]);
  const [name, setName] = useState("");
  useEffect(() => void loadCustomThemes().then(setCustoms), []);

  async function saveAsTheme() {
    const t: CustomTheme = { id: Date.now().toString(36), label: name.trim() || `Meu tema ${customs.length + 1}`, colors: theme.colors };
    const next = [...customs, t];
    try {
      await saveCustomThemes(next);
      setCustoms(next);
      setName("");
      await update({ ...theme, preset: customPreset(t.id) });
      toast(`Tema "${t.label}" salvo nos temas prontos`, "success");
    } catch (e) {
      toastError(e);
    }
  }

  async function removeTheme(id: string) {
    const next = customs.filter((t) => t.id !== id);
    try {
      await saveCustomThemes(next);
      setCustoms(next);
    } catch (e) {
      toastError(e);
    }
  }

  return (
    <div className="space-y-4">
      <Card title="Tema pronto">
        <div className="grid gap-2 @lg:grid-cols-3">
          {Object.entries(PRESETS).map(([id, p]) => (
            <ThemeCard key={id} label={p.label} colors={p.colors} active={theme.preset === id} onPick={() => update({ ...theme, preset: id, colors: p.colors })} />
          ))}
          {customs.map((t) => (
            <ThemeCard
              key={t.id}
              label={t.label}
              colors={t.colors}
              active={theme.preset === customPreset(t.id)}
              onPick={() => update({ ...theme, preset: customPreset(t.id), colors: t.colors })}
              onDelete={() => void removeTheme(t.id)}
            />
          ))}
        </div>
      </Card>

      <Card title="Cores personalizadas">
        <div className="grid gap-3 @lg:grid-cols-3">
          {(Object.keys(COLOR_TOKENS) as ColorToken[]).map((token) => (
            <label key={token} className="flex items-center gap-2 text-sm">
              <input
                type="color"
                value={theme.colors[token]}
                onChange={(e) => update({ ...theme, preset: "custom", colors: { ...theme.colors, [token]: e.target.value } })}
                className="h-8 w-10 cursor-pointer rounded border border-input bg-transparent"
              />
              {COLOR_TOKENS[token]}
            </label>
          ))}
        </div>
        <form
          className="flex flex-wrap items-center gap-2 border-t border-border pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            void saveAsTheme();
          }}
        >
          <Input className="w-auto min-w-48 flex-1" value={name} onChange={(e) => setName(e.target.value)} placeholder="Dê um nome ao seu tema" aria-label="Nome do tema" maxLength={40} />
          <Button type="submit" size="sm" variant="secondary">
            <Save /> Salvar como tema
          </Button>
          <p className="w-full text-xs text-muted-foreground">Ele aparece junto dos temas prontos, para voltar a ele com um clique.</p>
        </form>
      </Card>

      <Card title="Texto">
        <div className="space-y-1">
          <Label htmlFor="font-family">Fonte</Label>
          <NativeSelect id="font-family" value={theme.font} onChange={(e) => update({ ...theme, font: e.target.value as FontId })}>
            {(Object.keys(FONTS) as FontId[]).map((id) => (
              <option key={id} value={id} style={{ fontFamily: FONTS[id].stack }}>
                {FONTS[id].label}
              </option>
            ))}
          </NativeSelect>
          <p className="text-sm text-muted-foreground" style={{ fontFamily: FONTS[theme.font].stack }}>
            A Lei Geral de Proteção de Dados vale para todo tratamento de dados pessoais. 0123456789
          </p>
        </div>
        <div className="space-y-1">
          <Label htmlFor="font-scale">Tamanho da fonte: {theme.fontScale}%</Label>
          <input
            id="font-scale"
            type="range"
            min={85}
            max={130}
            step={5}
            value={theme.fontScale}
            onChange={(e) => update({ ...theme, fontScale: Number(e.target.value) })}
            className="w-full accent-[var(--primary)]"
          />
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor="pixel-titles">Títulos e números em fonte pixel</Label>
          <Switch id="pixel-titles" checked={theme.pixelTitles} onCheckedChange={(v) => update({ ...theme, pixelTitles: v })} />
        </div>
      </Card>

      <Card title="Movimento">
        <div className="flex items-center justify-between">
          <Label htmlFor="motion">Animações e cena de fundo</Label>
          <Switch id="motion" checked={theme.motion} onCheckedChange={(v) => update({ ...theme, motion: v })} />
        </div>
        <p className="text-xs text-muted-foreground">Desligado, o app fica estático (útil se o movimento incomodar).</p>
      </Card>

      <Button variant="secondary" onClick={() => update(DEFAULT_THEME)}>
        Restaurar tema padrão
      </Button>
    </div>
  );
}

function Pomodoro() {
  const [cfg, setCfg] = useState<PomodoroConfig>({ focus_min: 25, break_min: 5 });
  const [status, show] = useStatus();
  useEffect(() => void commands.getPomodoroConfig().then(setCfg, (e) => show(errorMessage(e))), [show]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      await commands.setPomodoroConfig(cfg);
      show("Salvo");
    } catch (err) {
      show(errorMessage(err));
    }
  }
  const minutes = (k: keyof PomodoroConfig) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setCfg({ ...cfg, [k]: e.target.valueAsNumber || 0 });

  return (
    <Card>
      <form onSubmit={save} className="flex flex-wrap items-end gap-4">
        <div className="space-y-1">
          <Label htmlFor="focus-min">Foco (min)</Label>
          <Input id="focus-min" type="number" min={1} max={180} className="w-24" value={cfg.focus_min} onChange={minutes("focus_min")} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="break-min">Pausa (min)</Label>
          <Input id="break-min" type="number" min={1} max={60} className="w-24" value={cfg.break_min} onChange={minutes("break_min")} />
        </div>
        <Button type="submit">Salvar</Button>
        <span className="text-sm text-accent">{status}</span>
      </form>
    </Card>
  );
}

function useAppConfig() {
  const [cfg, setCfg] = useState<AppConfig | null>(null);
  const [status, show] = useStatus();
  useEffect(() => void commands.getConfig().then(setCfg, (e) => show(errorMessage(e))), [show]);
  const save = async (next: AppConfig) => {
    try {
      await commands.setConfig(next);
      setCfg(next);
      show("Salvo");
    } catch (e) {
      show(errorMessage(e));
    }
  };
  return { cfg, setCfg, save, status };
}

function ContestsAndNews() {
  const { cfg, setCfg, save, status } = useAppConfig();
  // sugestões a partir da própria área ("Proteção de dados / regulação" → duas fichas)
  const suggestions = cfg ? splitTags(cfg.interest_area.replace(/\//g, ",")).filter((t) => t.length <= 40) : [];

  return (
    <div className="space-y-4">
      {cfg && (
        <Card title="Sua área (rastreador)">
          <div className="space-y-1">
            <Label htmlFor="area">Área de interesse</Label>
            <Input
              id="area"
              value={cfg.interest_area}
              onChange={(e) => setCfg({ ...cfg, interest_area: e.target.value })}
              placeholder="Proteção de dados / regulação / TI no governo federal"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="keywords">Palavras-chave</Label>
            <p className="text-xs text-muted-foreground">Escreva e aperte Enter para adicionar. Elas filtram as notícias e viram itens do rastreador.</p>
            <TagInput
              id="keywords"
              value={cfg.keywords}
              onChange={(keywords) => setCfg({ ...cfg, keywords })}
              placeholder="Ex.: ANPD, LGPD, analista de TI"
              suggestions={suggestions}
            />
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={() => void save(cfg)}>
              Salvar
            </Button>
            <span className="text-sm text-accent">{status}</span>
          </div>
        </Card>
      )}
      <Feeds />
    </div>
  );
}

function Feeds() {
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const load = useCallback(() => {
    commands.listFeeds().then(setFeeds, (e) => setError(errorMessage(e)));
  }, []);
  useEffect(load, [load]);

  async function run(action: () => Promise<unknown>) {
    try {
      await action();
      setError("");
      load();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <Card title="Feeds de notícias (RSS)">
      <ul className="divide-y divide-border">
        {feeds.map((f) => (
          <li key={f.id} className="flex items-center gap-3 py-2">
            <Switch checked={f.active} onCheckedChange={(v) => void run(() => commands.setFeedActive(f.id, v))} aria-label={`Ativar ${f.name}`} />
            <div className="min-w-0 flex-1">
              <p className="truncate">{f.name}</p>
              <p className="truncate text-xs text-muted-foreground">{f.url}</p>
            </div>
            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => void run(() => commands.deleteFeed(f.id))}>
              Remover
            </Button>
          </li>
        ))}
      </ul>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void run(() => commands.addFeed(name || url, url).then(() => (setName(""), setUrl(""))));
        }}
      >
        <Input className="w-40" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome" aria-label="Nome do feed" />
        <Input className="min-w-60 flex-1" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://site.com/feed" aria-label="URL do feed" />
        <Button type="submit" disabled={!url}>
          Adicionar
        </Button>
      </form>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </Card>
  );
}

const CUSTOM = "__custom__";

/**
 * Modelo do Ollama: catálogo (o recomendado para a placa primeiro, os que não cabem marcados) ou
 * "Personalizado…", que abre um campo para qualquer tag do Ollama.
 */
function ModelPicker({ id, value, gpu, onChange }: { id: string; value: string; gpu: GpuInfo; onChange: (m: string) => void }) {
  const known = gpu.options.some((o) => o.name === value);
  const [custom, setCustom] = useState(!known);
  const options = [...gpu.options].sort((a, b) => Number(b.name === gpu.model) - Number(a.name === gpu.model) || Number(b.fits) - Number(a.fits));
  return (
    <div className="flex flex-wrap gap-2">
      <NativeSelect
        id={id}
        className="w-auto min-w-64 flex-1"
        value={custom ? CUSTOM : value}
        onChange={(e) => {
          if (e.target.value === CUSTOM) return setCustom(true);
          setCustom(false);
          onChange(e.target.value);
        }}
      >
        {options.map((o) => (
          <option key={o.name} value={o.name}>
            {o.name} · {o.size}
            {o.name === gpu.model ? " · recomendado para a sua placa" : o.fits ? "" : " · não cabe na sua placa"}
          </option>
        ))}
        <option value={CUSTOM}>Personalizado…</option>
      </NativeSelect>
      {custom && (
        <Input
          className="w-auto min-w-48 flex-1"
          value={value}
          onChange={(e) => onChange(e.target.value.trim())}
          placeholder="tag do Ollama, ex.: llama3.3:70b"
          aria-label="Modelo personalizado"
        />
      )}
    </div>
  );
}

/** Opções de rota: Ollama só com placa de vídeo, nuvem só com chave (e a atual sempre, para não sumir). */
function routeOptions(local: boolean, clouds: CloudStatus[], current: Route): [Route, string][] {
  const all: [Route, string][] = [
    ...(local ? ([["auto", "Automático"], ["ollama", "Ollama"]] as [Route, string][]) : []),
    ["claude", "Claude"],
    ["chatgpt", "ChatGPT"],
    ...clouds.filter((c) => c.has_key).map((c) => [c.id, c.label] as [Route, string]),
  ];
  if (!all.some(([v]) => v === current)) all.push([current, current === "auto" ? "Automático" : current]);
  return all;
}

function Ai() {
  const { cfg, setCfg, save, status } = useAppConfig();
  const [gpu, setGpu] = useState<GpuInfo | null>(null);
  const [clouds, setClouds] = useState<CloudStatus[]>([]);
  useEffect(() => {
    commands.gpuInfo().then(setGpu, (e) => warn("placa de vídeo", e));
    commands.cloudStatus().then(setClouds, (e) => warn("IAs na nuvem", e));
  }, []);
  if (!cfg || !gpu) return null;
  const local = gpu.local_ai;
  const field = (k: "ollama_url" | "student_model" | "evaluator_model" | "task_model" | "claude_cli") => (e: React.ChangeEvent<HTMLInputElement>) =>
    setCfg({ ...cfg, [k]: e.target.value });

  return (
    <div className="space-y-4">
      {!local && (
        <Card title="IA local (Ollama)">
          <p className="text-sm text-muted-foreground">
            <b className="text-foreground">Serviço indisponível</b> neste computador: nenhuma placa de vídeo dedicada com 4 GB ou mais
            {gpu.name ? ` (achei: ${gpu.name})` : ""}. Todas as tarefas de IA usam o Claude.
          </p>
        </Card>
      )}
      {local && (
      <Card title="IA local (Ollama)">
        <p className="text-xs text-muted-foreground">
          Placa: {gpu.name} ({Math.round(gpu.vram_mb / 1024)} GB). Modelo que cabe: <b className="text-foreground">{gpu.model}</b>.
        </p>
        <div className="space-y-1">
          <Label htmlFor="model-all">Modelo</Label>
          <ModelPicker
            id="model-all"
            value={cfg.task_model}
            gpu={gpu}
            onChange={(m) => setCfg({ ...cfg, task_model: m, student_model: m, evaluator_model: m })}
          />
          <p className="text-xs text-muted-foreground">
            Usado nos materiais rápidos, nos alunos da Sala e no avaliador. Um modelo só: dois não cabem juntos na placa e trocar custa
            ~1 min. Baixe o modelo novo em Integrações.
          </p>
        </div>
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Avançado: endereço e um modelo por papel</summary>
          <div className="mt-3 grid gap-3 @lg:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="ollama-url">Endereço do Ollama</Label>
              <Input id="ollama-url" value={cfg.ollama_url} onChange={field("ollama_url")} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="task-model">Tarefas (materiais rápidos)</Label>
              <ModelPicker id="task-model" value={cfg.task_model} gpu={gpu} onChange={(m) => setCfg({ ...cfg, task_model: m })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="student-model">Alunos da Sala</Label>
              <ModelPicker id="student-model" value={cfg.student_model} gpu={gpu} onChange={(m) => setCfg({ ...cfg, student_model: m })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="evaluator-model">Avaliador</Label>
              <ModelPicker id="evaluator-model" value={cfg.evaluator_model} gpu={gpu} onChange={(m) => setCfg({ ...cfg, evaluator_model: m })} />
            </div>
          </div>
        </details>
      </Card>
      )}
      <Card title="Quem faz cada tarefa">
        <p className="text-xs text-muted-foreground">
          {local ? "Automático = Ollama, e o Claude só se o Ollama estiver fora do ar. " : ""}
          Claude e ChatGPT usam a sua assinatura (conecte em Integrações). IAs por chave de API aparecem aqui depois de salvar a chave.
          O rastreador de concursos sempre usa o Claude (precisa de busca na internet).
        </p>
        {(
          [
            ["material_route", "Materiais rápidos do Grifo (resumo, questões, flashcards…)"],
            ["evaluator", "Sala de aula (avaliador e alunos)"],
          ] as const
        ).map(([key, label]) => (
          <div key={key} className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>{label}</span>
            <Segmented label={label} value={cfg[key]} onChange={(v) => setCfg({ ...cfg, [key]: v })} options={routeOptions(local, clouds, cfg[key])} />
          </div>
        ))}
      </Card>
      <Card title="Claude Code (rastreador, Grifo e avaliador opcional)">
        <div className="space-y-1">
          <Label htmlFor="claude-cli">Comando do Claude CLI</Label>
          <Input id="claude-cli" value={cfg.claude_cli} onChange={field("claude_cli")} />
          <p className="text-xs text-muted-foreground">
            Usa o Claude Code já logado nesta máquina (sua assinatura). Na geração de apostila, ele roda a skill do Grifo com permissão
            para criar arquivos na pasta da apostila.
          </p>
        </div>
      </Card>
      <div className="flex items-center gap-3">
        <Button onClick={() => void save(cfg)}>Salvar</Button>
        <span className="text-sm text-accent">{status}</span>
      </div>
    </div>
  );
}

function System() {
  const [autostart, setAutostart] = useState<boolean | null>(null);
  const [sound, setSound] = useState(true);
  const [volume, setVolume] = useState(70);
  const [welcome, setWelcome] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    isEnabled().then(setAutostart, (e) => setError(errorMessage(e)));
    void soundEnabled().then(setSound);
    void soundVolume().then(setVolume);
    void getFlag("welcome_on_boot", true).then(setWelcome);
  }, []);

  async function toggleAutostart(on: boolean) {
    try {
      await (on ? enable() : disable());
      setAutostart(on);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <div className="space-y-4">
      <Updates />
      <Card>
        <div className="flex items-center justify-between">
          <Label htmlFor="autostart">Abrir com o Windows (minimizado na bandeja)</Label>
          <Switch id="autostart" checked={autostart ?? false} disabled={autostart === null} onCheckedChange={toggleAutostart} />
        </div>
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="welcome">Boas-vindas ao ligar o PC (janela compacta com o dia de hoje)</Label>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => commands.showWelcome().catch(toastError)}>
              Ver agora
            </Button>
            <Switch
              id="welcome"
              checked={welcome}
              onCheckedChange={(v) => {
                setWelcome(v);
                saveFlag("welcome_on_boot", v);
              }}
            />
          </div>
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor="sound">Sons 8-bit</Label>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => sfx("chime")}>
              Testar
            </Button>
            <Switch
              id="sound"
              checked={sound}
              onCheckedChange={(v) => {
                setSound(v);
                setSoundEnabled(v);
              }}
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Label htmlFor="volume" className="shrink-0">
            Volume: {volume}%
          </Label>
          <input
            id="volume"
            type="range"
            min={0}
            max={100}
            step={5}
            value={volume}
            disabled={!sound}
            onChange={(e) => setVolume(Number(e.target.value))}
            onPointerUp={() => (setSoundVolume(volume), sfx("coin"))}
            onKeyUp={() => setSoundVolume(volume)}
            className="w-full accent-[var(--primary)] disabled:opacity-40"
          />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm">Perfil, rotina, provas e matérias</span>
          <Button size="sm" variant="secondary" onClick={() => emit("onboarding")}>
            Refazer configuração inicial
          </Button>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm">Tour pelo menu</span>
          <Button size="sm" variant="secondary" onClick={() => emit("tour")}>
            Ver tutorial de novo
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Atalho global: <kbd className="rounded bg-secondary px-1.5 py-0.5">{QUICK_LOG_SHORTCUT}</kbd> abre o lançamento rápido.
        </p>
      </Card>

      <Backups />
      <ResetData />

      <Card title="Ajuda">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="min-w-60 flex-1 text-sm text-muted-foreground">
            Abre o GitHub no navegador com versão e sistema já preenchidos. Você revisa antes de enviar (precisa de conta no GitHub).
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => void reportIssue("bug")}>
              <Bug /> Reportar problema
            </Button>
            <Button size="sm" variant="secondary" onClick={() => void reportIssue("ideia")}>
              <Lightbulb /> Sugerir ideia
            </Button>
          </div>
        </div>
      </Card>

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

/**
 * Zona de perigo: apaga matérias, questões, histórico e preferências e volta ao assistente inicial.
 * Pede para digitar APAGAR; antes de apagar o app guarda um backup (dá para voltar em Restaurar).
 */
function ResetData() {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const ok = typed.trim().toUpperCase() === "APAGAR";

  async function reset() {
    setBusy(true);
    try {
      await commands.resetDatabase();
    } catch (e) {
      toastError(e);
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-60 flex-1">
          <h2 className="font-semibold text-destructive">Começar do zero</h2>
          <p className="text-sm text-muted-foreground">
            Apaga matérias, questões, histórico, XP e preferências, e abre de novo a configuração inicial.
          </p>
        </div>
        {!open && (
          <Button size="sm" variant="destructive" onClick={() => setOpen(true)}>
            <Trash2 /> Apagar todos os dados
          </Button>
        )}
      </div>
      {open && (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (ok) void reset();
          }}
        >
          <p className="text-sm">
            Antes de apagar, o app guarda uma cópia em Documentos › Grifo Quest › backups (dá para voltar em “Restaurar um backup”).
            Chaves de API, modelos do Ollama e apostilas geradas continuam no PC. Para confirmar, digite <b>APAGAR</b>:
          </p>
          <div className="flex flex-wrap gap-2">
            <Input autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="APAGAR" aria-label="Digite APAGAR para confirmar" className="w-40" />
            <Button type="submit" size="sm" variant="destructive" disabled={!ok || busy}>
              {busy ? "Apagando…" : "Apagar e recomeçar"}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => (setOpen(false), setTyped(""))}>
              Cancelar
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}

/** Backup em um clique e restauração a partir da pasta de backups (confirma em dois cliques). */
function Backups() {
  const [list, setList] = useState<BackupFile[]>([]);
  const [confirm, setConfirm] = useState<string | null>(null);
  const load = useCallback(() => void commands.listBackups().then(setList, (e) => warn("listar backups", e)), []);
  useEffect(load, [load]);

  async function backup() {
    try {
      const path = await commands.backupDatabase();
      toast(`Backup salvo: ${path.split(/[\\/]/).pop()}`, "success");
      load();
    } catch (e) {
      toastError(e);
    }
  }

  async function restore(name: string) {
    try {
      await commands.restoreBackup(name);
    } catch (e) {
      toastError(e);
      setConfirm(null);
    }
  }

  return (
    <Card title="Seus dados">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="min-w-60 flex-1 text-sm text-muted-foreground">
          Tudo fica num arquivo só no seu PC. O backup copia esse arquivo para Documentos › Grifo Quest › backups (pode fazer com o app aberto).
        </p>
        <Button size="sm" variant="secondary" onClick={() => void backup()}>
          <DatabaseBackup /> Fazer backup agora
        </Button>
      </div>
      {list.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Restaurar um backup ({list.length})</summary>
          <p className="mt-2 text-xs text-muted-foreground">
            Antes de restaurar, o app guarda o estado atual como “antes-de-restaurar” na mesma pasta. Depois reinicia.
          </p>
          <ul className="mt-2 space-y-1.5">
            {list.map((b) => (
              <li key={b.name} className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5">
                <span className="min-w-0 flex-1 truncate font-mono text-xs">{b.name}</span>
                <span className="text-xs text-muted-foreground">{b.kb} KB</span>
                {confirm === b.name ? (
                  <>
                    <Button size="sm" variant="destructive" onClick={() => void restore(b.name)}>
                      Confirmar (reinicia)
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>
                      Cancelar
                    </Button>
                  </>
                ) : (
                  <Button size="sm" variant="secondary" onClick={() => setConfirm(b.name)}>
                    <RotateCcw /> Restaurar
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}

function Updates() {
  const ready = useUpdate();
  const [version, setVersion] = useState("");
  const [status, setStatus] = useState("");
  const [checking, setChecking] = useState(false);
  useEffect(() => void getVersion().then(setVersion, (e) => warn("versão do app", e)), []);

  async function check() {
    setChecking(true);
    setStatus("");
    try {
      const u = await commands.checkUpdate();
      setStatus(u ? `Versão ${u.version} baixada.` : "Você está na versão mais recente.");
    } catch (e) {
      toastError(e);
    } finally {
      setChecking(false);
    }
  }

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm">
          <p className="font-medium">Grifo Quest {version}</p>
          <p className="text-xs text-muted-foreground">
            {status || "Procura atualizações sozinho ao abrir e a cada 6 horas."}
          </p>
        </div>
        {ready ? (
          <Button size="sm" onClick={() => void installUpdate()}>
            Atualizar para {ready.version}
          </Button>
        ) : (
          <Button size="sm" variant="secondary" disabled={checking} onClick={() => void check()}>
            {checking ? "Procurando…" : "Procurar atualizações"}
          </Button>
        )}
      </div>
    </Card>
  );
}
