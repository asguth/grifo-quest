import { getVersion } from "@tauri-apps/api/app";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { Segmented } from "@/components/Segmented";
import { toastError } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  commands,
  type AppConfig_Serialize as AppConfig,
  type Feed,
  type PomodoroConfig,
} from "@/lib/bindings";
import { emit } from "@/lib/bus";
import { getFlag, saveFlag } from "@/lib/prefs";
import { QUICK_LOG_SHORTCUT } from "@/lib/rules";
import { setSoundEnabled, sfx, soundEnabled } from "@/lib/sound";
import { COLOR_TOKENS, DEFAULT_THEME, PRESETS, saveTheme, useTheme, type ColorToken, type Theme } from "@/lib/theme";
import { installUpdate, useUpdate } from "@/lib/update";
import { errorMessage, warn } from "@/lib/utils";
import { Integrations } from "./Integrations";

type Tab = "integracoes" | "aparencia" | "pomodoro" | "concursos" | "ia" | "sistema";

export default function SettingsScreen() {
  const [tab, setTab] = useState<Tab>("integracoes");
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="retro text-sm text-primary">Config</h1>
        <Segmented
          label="Seção"
          value={tab}
          onChange={setTab}
          options={[
            ["integracoes", "Integrações"],
            ["aparencia", "Aparência"],
            ["pomodoro", "Pomodoro"],
            ["concursos", "Concursos e notícias"],
            ["ia", "IA"],
            ["sistema", "Sistema"],
          ]}
        />
      </div>
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

function Appearance() {
  const theme = useTheme();
  const update = (t: Theme) => saveTheme(t).catch(toastError);

  return (
    <div className="space-y-4">
      <Card title="Tema pronto">
        <div className="grid gap-2 sm:grid-cols-3">
          {Object.entries(PRESETS).map(([id, p]) => (
            <button
              key={id}
              onClick={() => update({ ...theme, preset: id, colors: p.colors })}
              className={`rounded-md border-2 p-3 text-left text-sm ${theme.preset === id ? "border-primary" : "border-border"}`}
              style={{ background: p.colors.background, color: p.colors.foreground }}
            >
              <span className="mb-2 flex gap-1">
                {[p.colors.primary, p.colors.accent, p.colors.destructive, p.colors.card].map((c) => (
                  <span key={c} className="size-4 rounded-sm" style={{ background: c }} />
                ))}
              </span>
              {p.label}
            </button>
          ))}
        </div>
      </Card>

      <Card title="Cores personalizadas">
        <div className="grid gap-3 sm:grid-cols-3">
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
      </Card>

      <Card title="Texto">
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
        <p className="text-xs text-muted-foreground">Desligado, o app fica estático (útil se o movimento incomodar). O Windows com “mostrar animações” desligado também reduz.</p>
      </Card>

      <Button variant="ghost" onClick={() => update(DEFAULT_THEME)}>
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
  const [keywords, setKeywords] = useState("");
  useEffect(() => setKeywords(cfg?.keywords.join("\n") ?? ""), [cfg?.keywords]);

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
          <div className="space-y-1">
            <Label htmlFor="keywords">Palavras-chave (uma por linha) — filtram notícias e viram itens do rastreador</Label>
            <Textarea id="keywords" rows={4} value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder={"ANPD\nLGPD\nanalista de TI"} />
          </div>
          <div className="flex items-center gap-3">
            <Button
              onClick={() =>
                void save({
                  ...cfg,
                  keywords: keywords
                    .split("\n")
                    .map((k) => k.trim())
                    .filter(Boolean),
                })
              }
            >
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

function Ai() {
  const { cfg, setCfg, save, status } = useAppConfig();
  if (!cfg) return null;
  const field = (k: "ollama_url" | "student_model" | "evaluator_model" | "task_model" | "claude_cli") => (e: React.ChangeEvent<HTMLInputElement>) =>
    setCfg({ ...cfg, [k]: e.target.value });

  return (
    <div className="space-y-4">
      <Card title="IA local (Ollama)">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="ollama-url">Endereço</Label>
            <Input id="ollama-url" value={cfg.ollama_url} onChange={field("ollama_url")} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="student-model">Modelo dos alunos</Label>
            <Input id="student-model" value={cfg.student_model} onChange={field("student_model")} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="evaluator-model">Modelo do avaliador</Label>
            <Input id="evaluator-model" value={cfg.evaluator_model} onChange={field("evaluator_model")} />
          </div>
        </div>
      </Card>
      <Card title="Quem faz cada tarefa">
        <p className="text-xs text-muted-foreground">
          Automático = Ollama, e o Claude só se o Ollama estiver fora do ar. Rastreador e apostila completa sempre usam o Claude (precisam de internet e da skill inteira).
        </p>
        <div className="space-y-1">
          <Label htmlFor="task-model">Modelo do Ollama para tarefas (materiais rápidos)</Label>
          <Input id="task-model" value={cfg.task_model} onChange={field("task_model")} />
        </div>
        {(
          [
            ["material_route", "Materiais rápidos do Grifo (resumo, questões, flashcards…)"],
            ["evaluator", "Avaliador oculto da Sala de aula"],
          ] as const
        ).map(([key, label]) => (
          <div key={key} className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>{label}</span>
            <Segmented
              label={label}
              value={cfg[key]}
              onChange={(v) => setCfg({ ...cfg, [key]: v })}
              options={[
                ["auto", "Automático"],
                ["ollama", "Ollama"],
                ["claude", "Claude"],
              ]}
            />
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
  const [welcome, setWelcome] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    isEnabled().then(setAutostart, (e) => setError(errorMessage(e)));
    void soundEnabled().then(setSound);
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
            <Button size="sm" variant="ghost" onClick={() => commands.showWelcome().catch(toastError)}>
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
            <Button size="sm" variant="ghost" onClick={() => sfx("chime")}>
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
        <div className="flex items-center justify-between">
          <span className="text-sm">Perfil, rotina, provas e matérias</span>
          <Button size="sm" variant="secondary" onClick={() => emit("onboarding")}>
            Refazer configuração inicial
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Atalho global: <kbd className="rounded bg-secondary px-1.5 py-0.5">{QUICK_LOG_SHORTCUT}</kbd> abre o lançamento rápido.
        </p>
      </Card>

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
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
          <Button size="sm" variant="outline" disabled={checking} onClick={() => void check()}>
            {checking ? "Procurando…" : "Procurar atualizações"}
          </Button>
        )}
      </div>
    </Card>
  );
}
