import { useCallback, useEffect, useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { Check, ChevronDown, Cpu, ExternalLink, KeyRound, Loader2, LogOut, Mic, Plug, RefreshCw } from "lucide-react";
import { Skeleton } from "@/components/motion";
import { EventProgress, type ProgressEntry } from "@/components/Progress";
import { toast, toastError } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { commands, events, type IntegrationsStatus, type McpTarget } from "@/lib/bindings";
import { useTauriEvent } from "@/lib/hooks";
import { itemIn, listIn } from "@/lib/motion";
import { useHasPtVoice } from "@/lib/speech";
import { cn } from "@/lib/utils";
import { CloudKeys } from "./CloudKeys";

type Tone = "ok" | "warn" | "off";
const TONE: Record<Tone, string> = {
  ok: "bg-success/15 text-success",
  warn: "bg-primary/15 text-primary",
  off: "bg-secondary text-muted-foreground",
};

function Pill({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium", TONE[tone])}>
      <span className="size-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}

function Row(props: { icon: typeof Cpu; name: string; tone: Tone; status: string; text: string; children?: ReactNode; log?: ReactNode }) {
  const Icon = props.icon;
  return (
    <motion.li variants={itemIn} className="flex gap-4 rounded-xl border border-border bg-card p-4 shadow-soft">
      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-secondary">
        <Icon className="size-5 text-primary" />
      </span>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold">{props.name}</h3>
          <Pill tone={props.tone}>{props.status}</Pill>
        </div>
        <p className="text-sm text-muted-foreground">{props.text}</p>
        {props.log}
        {props.children && <div className="flex flex-wrap gap-2 pt-1">{props.children}</div>}
      </div>
    </motion.li>
  );
}

/** Linha de progresso + barra das ações longas (eventos `integrationEvent`). */
function useProgress() {
  const [p, setP] = useState<Record<string, ProgressEntry>>({});
  useTauriEvent(events.integrationEvent, (e) => setP((old) => ({ ...old, [e.target]: e })));
  const clear = (...ts: string[]) => setP((old) => Object.fromEntries(Object.entries(old).filter(([k]) => !ts.includes(k))));
  return [p, clear] as const;
}

const gb = (mb: number) => `${Math.round(mb / 1024)} GB`;
const PLAN: Record<string, string> = { pro: "Pro", max: "Max", team: "Team", enterprise: "Enterprise", free: "Grátis" };

/** Marca de cada IA (letra no quadrado colorido: sem logotipo de terceiros). */
function Badge({ letter, className }: { letter: string; className: string }) {
  return <span className={cn("grid size-12 shrink-0 place-items-center rounded-2xl text-xl font-bold text-white shadow-soft", className)}>{letter}</span>;
}

type AccountProps = {
  badge: ReactNode;
  name: string;
  /** Para quem é ("quem assina o Claude Pro ou Max") */
  who: string;
  connected: boolean;
  installed: boolean;
  account?: string;
  busy: boolean;
  disabled: boolean;
  progress?: ProgressEntry;
  loginUrl?: string;
  onConnect: () => void;
  onTest: () => void;
  onLogout: () => void;
  extra?: ReactNode;
};

/** Cartão grande de uma IA por assinatura: um botão faz tudo (baixa se faltar e abre o login no navegador). */
function AccountCard(p: AccountProps) {
  return (
    <motion.div
      variants={itemIn}
      className={cn(
        "flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-soft transition-colors",
        p.connected ? "border-success/50" : "border-border",
      )}
    >
      <div className="flex items-start gap-3">
        {p.badge}
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-semibold">{p.name}</h3>
          <p className="text-sm text-muted-foreground">{p.who}</p>
        </div>
        {p.connected && (
          <span className="grid size-7 place-items-center rounded-full bg-success text-white" aria-label="Conectado">
            <Check className="size-4" />
          </span>
        )}
      </div>

      {p.connected ? (
        <p className="rounded-lg bg-success/10 px-3 py-2 text-sm">
          <b className="text-success">Conectado</b>
          {p.account ? <span className="text-muted-foreground"> · {p.account}</span> : null}
        </p>
      ) : (
        <ol className="space-y-1 text-sm text-muted-foreground">
          <li className={cn(p.installed && "text-success")}>1. {p.installed ? "Conector instalado ✓" : "O app baixa o conector oficial (um clique)"}</li>
          <li>2. O navegador abre: entre com sua conta e clique em autorizar</li>
          <li>3. Volte para cá: pronto</li>
        </ol>
      )}

      <EventProgress entry={p.progress} />
      {p.busy && p.loginUrl && (
        <p className="text-xs text-muted-foreground">
          O navegador não abriu?{" "}
          <button className="font-medium text-primary underline-offset-2 hover:underline" onClick={() => commands.openLink(p.loginUrl ?? "").catch(toastError)}>
            Abrir a página de login <ExternalLink className="inline size-3" />
          </button>
        </p>
      )}

      <div className="mt-auto flex flex-wrap gap-2">
        {p.connected ? (
          <>
            <Button variant="secondary" disabled={p.disabled} onClick={p.onTest}>
              {p.busy && <Loader2 className="animate-spin" />} Testar
            </Button>
            <Button variant="ghost" disabled={p.disabled} onClick={p.onLogout}>
              <LogOut /> Sair
            </Button>
          </>
        ) : (
          <Button size="lg" className="w-full" disabled={p.disabled} onClick={p.onConnect}>
            {p.busy ? <Loader2 className="animate-spin" /> : null}
            {p.busy ? "Aguardando o login no navegador…" : `Conectar ${p.name}`}
          </Button>
        )}
      </div>
      {p.extra}
    </motion.div>
  );
}

/**
 * `setup`: assistente inicial. Antes de olhar o status, ajusta os modelos à placa de vídeo; sem placa
 * dedicada, o Ollama nem aparece (em Config ele aparece como indisponível).
 */
export function Integrations({ setup = false }: { setup?: boolean }) {
  const [s, setS] = useState<IntegrationsStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [advanced, setAdvanced] = useState(false);
  const hasPtVoice = useHasPtVoice();
  const [progress, clear] = useProgress();

  const check = useCallback(async () => {
    setChecking(true);
    try {
      if (setup) await commands.applyHardwareDefaults();
      setS(await commands.integrationsStatus());
    } catch (e) {
      toastError(e);
    } finally {
      setChecking(false);
    }
  }, [setup]);
  useEffect(() => {
    void check();
  }, [check]);

  /** Roda uma ação longa com botão ocupado, aviso no fim e status atualizado. `targets` = progressos a limpar. */
  async function act(key: string, fn: () => Promise<unknown>, ok?: string, targets: string[] = [key]) {
    setBusy(key);
    try {
      const r = await fn();
      toast(typeof r === "string" && r ? r : (ok ?? "Pronto"), "success");
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(null);
      clear(...targets);
      void check();
    }
  }

  if (!s) {
    return (
      <div className="space-y-3">
        <div className="grid gap-3 @2xl:grid-cols-2">
          <Skeleton className="h-60 rounded-2xl" />
          <Skeleton className="h-60 rounded-2xl" />
        </div>
        {[0, 1].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
      </div>
    );
  }

  const missing = s.wanted_models.filter((m) => !s.ollama_models.some((have) => have === m || have === `${m}:latest`));
  const ollamaTone: Tone = !s.ollama_installed ? "off" : !s.ollama_running || missing.length ? "warn" : "ok";
  const ollamaStatus = !s.ollama_installed ? "Não instalado" : !s.ollama_running ? "Instalado, parado" : missing.length ? "Falta modelo" : "Pronto";
  const local = s.gpu.local_ai;
  const claudeOn = !!s.claude_account;
  const anyAi = claudeOn || s.chatgpt_logged_in || s.cloud_keys > 0 || (local && ollamaTone === "ok");
  const spin = (k: string) => busy === k && <Loader2 className="animate-spin" />;
  const plan = s.claude_account?.plan ? (PLAN[s.claude_account.plan] ?? s.claude_account.plan) : null;

  const connectClaude = () =>
    act(
      "claude",
      async () => {
        if (!s.claude_version) await commands.installClaude();
        return commands.claudeLogin();
      },
      "Claude conectado",
      ["claude", "claude-login"],
    );
  const connectChatgpt = () =>
    act(
      "chatgpt",
      async () => {
        if (!s.chatgpt_version) await commands.installChatgpt();
        return commands.chatgptLogin();
      },
      "ChatGPT conectado",
      ["chatgpt", "chatgpt-login"],
    );

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <h2 className="text-lg font-semibold">{anyAi ? "Sua IA está conectada" : "Conecte uma IA"}</h2>
            <p className="text-sm text-muted-foreground">
              Use a assinatura que você já tem. Sem chave, sem terminal: o navegador abre, você entra com a sua conta e pronto. Uma basta;
              com as duas, você escolhe quem faz cada tarefa em Config → IA.
            </p>
          </div>
          <Button size="sm" variant="ghost" onClick={() => void check()} disabled={checking} aria-label="Verificar de novo">
            <RefreshCw className={cn(checking && "animate-spin")} />
          </Button>
        </div>

        <motion.div variants={listIn} initial="hidden" animate="show" className="grid gap-3 @2xl:grid-cols-2">
          <AccountCard
            badge={<Badge letter="C" className="bg-[#d97757]" />}
            name="Claude"
            who="Para quem assina o Claude Pro ou Max."
            connected={claudeOn}
            installed={!!s.claude_version}
            account={[s.claude_account?.email, plan].filter(Boolean).join(" · ")}
            busy={busy === "claude" || busy === "test-claude"}
            disabled={!!busy}
            progress={progress.claude}
            loginUrl={progress["claude-login"]?.text}
            onConnect={() => void connectClaude()}
            onTest={() => void act("test-claude", commands.testClaude)}
            onLogout={() => void act("logout-claude", commands.claudeLogout, "Claude desconectado")}
            extra={
              !claudeOn &&
              s.claude_version && (
                <button className="self-start text-xs text-muted-foreground hover:text-foreground" disabled={!!busy} onClick={() => commands.claudeLoginTerminal().catch(toastError)}>
                  Prefere o terminal? Entrar pelo terminal
                </button>
              )
            }
          />
          <AccountCard
            badge={<Badge letter="G" className="bg-[#10a37f]" />}
            name="ChatGPT"
            who="Para quem assina o ChatGPT Plus, Pro ou Business."
            connected={s.chatgpt_logged_in}
            installed={!!s.chatgpt_version}
            account={s.chatgpt_version ? `conector v${s.chatgpt_version}` : undefined}
            busy={busy === "chatgpt" || busy === "test-chatgpt"}
            disabled={!!busy}
            progress={progress.chatgpt}
            loginUrl={progress["chatgpt-login"]?.text}
            onConnect={() => void connectChatgpt()}
            onTest={() => void act("test-chatgpt", commands.testChatgpt)}
            onLogout={() => void act("logout-chatgpt", commands.chatgptLogout, "ChatGPT desconectado")}
          />
        </motion.div>
      </section>

      <motion.ul variants={listIn} initial="hidden" animate="show" className="space-y-3">
        {local ? (
          <Row
            icon={Cpu}
            name="IA grátis no seu PC (Ollama)"
            tone={ollamaTone}
            status={ollamaStatus}
            text={
              s.ollama_running
                ? `Modelos baixados: ${s.ollama_models.join(", ") || "nenhum"}. Usado nas tarefas simples, nos alunos da Sala e no avaliador.`
                : `Roda na sua ${s.gpu.name ?? "placa de vídeo"} (${gb(s.gpu.vram_mb)}), de graça e offline. Modelo que cabe: ${s.gpu.model} (${s.gpu.model_size}).`
            }
            log={<EventProgress entry={progress.ollama ?? progress.model} />}
          >
            {!s.ollama_installed && (
              <Button disabled={!!busy} onClick={() => void act("ollama", commands.installOllama, "Ollama instalado")}>
                {spin("ollama")} Instalar Ollama
              </Button>
            )}
            {s.ollama_installed && !s.ollama_running && (
              <Button disabled={!!busy} onClick={() => void act("start", commands.startOllama, "Ollama rodando")}>
                {spin("start")} Abrir Ollama
              </Button>
            )}
            {s.ollama_running &&
              missing.map((m) => (
                <Button key={m} disabled={!!busy} onClick={() => void act("pull", () => commands.pullModel(m), `${m} baixado`, ["model"])}>
                  {spin("pull")} Baixar {m}
                </Button>
              ))}
            {s.ollama_running && !missing.length && (
              <Button variant="secondary" disabled={!!busy} onClick={() => void act("test-ollama", commands.testOllama)}>
                {spin("test-ollama")} Testar
              </Button>
            )}
          </Row>
        ) : (
          !setup && (
            <Row
              icon={Cpu}
              name="IA grátis no seu PC (Ollama)"
              tone="off"
              status="Indisponível"
              text={`Precisa de placa de vídeo dedicada com 4 GB ou mais${s.gpu.name ? ` (achei: ${s.gpu.name})` : ""}. Use o Claude ou o ChatGPT acima.`}
            />
          )
        )}

        <Row
          icon={Mic}
          name="Voz na sala de aula"
          tone={s.voice_installed && hasPtVoice ? "ok" : "warn"}
          status={!s.voice_installed ? "Não baixada" : hasPtVoice ? "Pronta" : "Falta a voz pt-BR do Windows"}
          text="Você fala, o seu PC transcreve (roda no processador e não usa a internet depois de baixar). Os alunos respondem com as vozes do Windows."
          log={<EventProgress entry={progress.voice} />}
        >
          {!s.voice_installed && (
            <Button disabled={!!busy} onClick={() => void act("voice", commands.installVoice, "Voz pronta: segure Espaço na sala de aula para falar")}>
              {spin("voice")} Baixar voz (~190 MB)
            </Button>
          )}
          {!hasPtVoice && (
            <Button variant="secondary" onClick={() => commands.openLink("ms-settings:speech").catch(toastError)} title="Configurações → Hora e idioma → Fala → Adicionar vozes → Português (Brasil)">
              Instalar vozes pt-BR do Windows
            </Button>
          )}
        </Row>
      </motion.ul>

      {!setup && (
        <McpCard
          s={s}
          busy={busy}
          connect={(key, target) => void act(key, () => commands.connectMcp(target))}
          spin={spin}
        />
      )}

      {!setup && (
        <section className="rounded-2xl border border-border">
          <button
            className="flex w-full items-center gap-3 p-4 text-left"
            onClick={() => setAdvanced((a) => !a)}
            aria-expanded={advanced}
          >
            <KeyRound className="size-5 text-muted-foreground" />
            <span className="flex-1">
              <span className="block font-medium">Avançado: chave de API</span>
              <span className="block text-xs text-muted-foreground">
                Gemini, GPT pela API, Grok, DeepSeek… cobrados por uso na sua conta do serviço. {s.cloud_keys > 0 && `${s.cloud_keys} chave(s) salva(s).`}
              </span>
            </span>
            <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", advanced && "rotate-180")} />
          </button>
          {advanced && (
            <div className="space-y-5 border-t border-border p-4">
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Cole a chave e escolha em Config → IA quem faz cada tarefa. A chave fica no Cofre de Credenciais do Windows.
                </p>
                <CloudKeys onChange={() => void check()} />
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

/** Seus dados dentro do Claude e do ChatGPT: o servidor MCP do Grifo (só leitura). */
function McpCard({
  s,
  busy,
  connect,
  spin,
}: {
  s: IntegrationsStatus;
  busy: string | null;
  connect: (key: string, target: McpTarget) => void;
  spin: (key: string) => ReactNode;
}) {
  const targets: { key: string; target: McpTarget; app: string; on: boolean; ready: boolean; hint: string }[] = [
    { key: "mcp-code", target: "claude_code", app: "Claude Code", on: s.mcp_code, ready: !!s.claude_version, hint: "Instale o Claude acima" },
    { key: "mcp-desktop", target: "claude_desktop", app: "Claude Desktop", on: s.mcp_desktop, ready: true, hint: "" },
    { key: "mcp-codex", target: "codex", app: "ChatGPT (Codex)", on: s.mcp_codex, ready: !!s.chatgpt_version, hint: "Instale o ChatGPT acima" },
  ];
  const connected = targets.filter((t) => t.on).length;
  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-soft">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
          <Plug className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold">Seus dados no Claude e no ChatGPT (MCP)</h3>
          <p className="text-sm text-muted-foreground">
            Conecte uma vez e pergunte no chat da IA: “como foi minha semana?”, “quais tópicos estão mais fracos?”. Ela só lê o seu progresso, nunca altera.
          </p>
        </div>
        {connected > 0 && (
          <span className="shrink-0 rounded-full bg-success/15 px-2.5 py-1 text-xs font-medium text-success">
            {connected} {connected === 1 ? "conectado" : "conectados"}
          </span>
        )}
      </div>
      {s.mcp_built ? (
        <ul className="grid gap-2 sm:grid-cols-3">
          {targets.map((t) => (
            <li key={t.key} className={cn("flex flex-col gap-2 rounded-xl border p-3", t.on ? "border-success/40 bg-success/5" : "border-border")}>
              <span className="flex items-center gap-2 text-sm font-medium">
                <span className={cn("size-2 rounded-full", t.on ? "bg-success" : "bg-muted-foreground/40")} />
                {t.app}
              </span>
              <span className="text-xs text-muted-foreground">{t.on ? "Conectado" : t.ready ? "Não conectado" : t.hint}</span>
              <Button size="sm" variant={t.on ? "ghost" : "secondary"} className="mt-auto" disabled={!!busy || !t.ready} onClick={() => connect(t.key, t.target)}>
                {spin(t.key)} {t.on ? "Reconectar" : "Conectar"}
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">O servidor MCP não veio junto com esta instalação. Reinstale o Grifo Quest.</p>
      )}
    </section>
  );
}
