import { useCallback, useEffect, useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { Bot, Cpu, Feather, Loader2, Mic, Plug, RefreshCw, Sparkles } from "lucide-react";
import { Skeleton } from "@/components/motion";
import { EventProgress, type ProgressEntry } from "@/components/Progress";
import { toast, toastError } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { commands, events, type IntegrationsStatus } from "@/lib/bindings";
import { useTauriEvent } from "@/lib/hooks";
import { itemIn, listIn } from "@/lib/motion";
import { useHasPtVoice } from "@/lib/speech";
import { cn } from "@/lib/utils";
import { CloudKeys } from "./CloudKeys";

type Tone = "ok" | "warn" | "off";
const TONE: Record<Tone, string> = {
  ok: "bg-success/15 text-success",
  warn: "bg-primary/15 text-primary",
  off: "bg-destructive/15 text-destructive",
};

function Pill({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium", TONE[tone])}>
      <span className="size-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}

function Row(props: { icon: typeof Bot; name: string; tone: Tone; status: string; text: string; children?: ReactNode; log?: ReactNode }) {
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
  const clear = (t: string) => setP(({ [t]: _, ...rest }) => rest);
  return [p, clear] as const;
}

const gb = (mb: number) => `${Math.round(mb / 1024)} GB`;

/**
 * `setup`: assistente inicial. Antes de olhar o status, ajusta os modelos à placa de vídeo; sem placa
 * dedicada, o Ollama nem aparece (em Config ele aparece como indisponível).
 */
export function Integrations({ setup = false }: { setup?: boolean }) {
  const [s, setS] = useState<IntegrationsStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
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
  useEffect(() => void check(), [check]);

  async function act(key: string, fn: () => Promise<unknown>, ok?: string) {
    setBusy(key);
    try {
      const r = await fn();
      toast(typeof r === "string" && r ? r : (ok ?? "Pronto"), "success");
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(null);
      clear(key === "pull" ? "model" : key);
      void check();
    }
  }

  if (!s) {
    return (
      <div className="space-y-3">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
      </div>
    );
  }

  const missing = s.wanted_models.filter((m) => !s.ollama_models.some((have) => have === m || have === `${m}:latest`));
  const ollamaTone: Tone = !s.ollama_installed ? "off" : !s.ollama_running || missing.length ? "warn" : "ok";
  const ollamaStatus = !s.ollama_installed ? "Não instalado" : !s.ollama_running ? "Instalado, parado" : missing.length ? "Falta modelo" : "Pronto";
  const local = s.gpu.local_ai;
  const cloudReady = s.cloud_keys > 0;
  const checks = [!!s.claude_version, s.mcp_code || s.mcp_desktop, s.voice_installed, ...(local ? [ollamaTone === "ok"] : [])];
  const ready = checks.filter(Boolean).length;
  const spin = (k: string) => busy === k && <Loader2 className="animate-spin" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <p className="flex-1 text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">
            {ready} de {checks.length}
          </span> integrações prontas. Cada botão faz tudo sozinho; você só confirma o que o Windows pedir.
        </p>
        <Button size="sm" variant="secondary" onClick={() => void check()} disabled={checking}>
          <RefreshCw className={cn(checking && "animate-spin")} /> Verificar de novo
        </Button>
      </div>

      <motion.ul variants={listIn} initial="hidden" animate="show" className="space-y-3">
        {local ? (
        <Row
          icon={Cpu}
          name="Ollama (IA local)"
          tone={ollamaTone}
          status={ollamaStatus}
          text={
            s.ollama_running
              ? `Modelos baixados: ${s.ollama_models.join(", ") || "nenhum"}. Usado nas tarefas simples, nos alunos da Sala e no avaliador.`
              : `Roda a IA na sua ${s.gpu.name ?? "placa de vídeo"} (${gb(s.gpu.vram_mb)}), de graça e offline. Modelo que cabe: ${s.gpu.model} (${s.gpu.model_size}). Faz resumos, questões rápidas e a Sala de aula.`
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
              <Button key={m} disabled={!!busy} onClick={() => void act("pull", () => commands.pullModel(m), `${m} baixado`)}>
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
              name="Ollama (IA local)"
              tone="off"
              status="Indisponível"
              text={`Nenhuma placa de vídeo dedicada com 4 GB ou mais${s.gpu.name ? ` (achei: ${s.gpu.name})` : ""}. As tarefas de IA vão para o Claude.`}
            />
          )
        )}

        <Row
          icon={Bot}
          name="Claude Code (sua assinatura)"
          tone={s.claude_version ? "ok" : "off"}
          status={s.claude_version ? s.claude_version : "Não encontrado"}
          text="Faz o que precisa de internet ou de capricho: rastreador de concursos, matérias pelo cargo e a apostila completa do Grifo."
          log={<EventProgress entry={progress.claude} />}
        >
          {!s.claude_version ? (
            <Button disabled={!!busy} onClick={() => void act("claude", commands.installClaude, "Claude Code instalado. Agora faça o login.")}>
              {spin("claude")} Instalar Claude Code
            </Button>
          ) : (
            <>
              <Button variant="secondary" disabled={!!busy} onClick={() => void act("login", commands.claudeLogin, "Faça o login no terminal que abriu")}>
                Entrar / trocar conta
              </Button>
              <Button variant="secondary" disabled={!!busy} onClick={() => void act("test-claude", commands.testClaude)}>
                {spin("test-claude")} Testar
              </Button>
            </>
          )}
        </Row>

        <Row
          icon={Sparkles}
          name="Outras IAs (sua chave de API)"
          tone={cloudReady ? "ok" : "warn"}
          status={cloudReady ? "Conectado" : "Opcional"}
          text="Gemini, GPT, Grok, DeepSeek, GLM ou qualquer IA com API no formato da OpenAI. Cole a chave e escolha em Config → IA quem faz cada tarefa. A chave fica no Cofre de Credenciais do Windows, e o uso é cobrado na sua conta do serviço."
        >
          <div className="w-full">
            <CloudKeys onChange={() => void check()} />
          </div>
        </Row>

        <Row
          icon={Plug}
          name="Seus dados no Claude (MCP)"
          tone={s.mcp_code || s.mcp_desktop ? "ok" : s.mcp_built ? "warn" : "off"}
          status={[s.mcp_code && "Claude Code", s.mcp_desktop && "Claude Desktop"].filter(Boolean).join(" + ") || (s.mcp_built ? "Não conectado" : "Não compilado")}
          text={
            s.mcp_built
              ? "Deixa o Claude ler seu progresso (somente leitura): \"quais tópicos eu mais erro?\", \"como foi minha semana?\"."
              : "O servidor ainda não foi compilado. Rode `cargo build -p grifo-quest-mcp --release` uma vez."
          }
        >
          {s.mcp_built && (
            <>
              <Button variant={s.mcp_code ? "secondary" : "default"} disabled={!!busy} onClick={() => void act("mcp-code", () => commands.connectMcp("claude_code"))}>
                {spin("mcp-code")} {s.mcp_code ? "Reconectar" : "Conectar"} ao Claude Code
              </Button>
              <Button variant={s.mcp_desktop ? "secondary" : "default"} disabled={!!busy} onClick={() => void act("mcp-desktop", () => commands.connectMcp("claude_desktop"))}>
                {spin("mcp-desktop")} {s.mcp_desktop ? "Reconectar" : "Conectar"} ao Claude Desktop
              </Button>
            </>
          )}
        </Row>

        <Row
          icon={Mic}
          name="Voz na sala de aula"
          tone={s.voice_installed && hasPtVoice ? "ok" : "warn"}
          status={!s.voice_installed ? "Não baixada" : hasPtVoice ? "Pronta" : "Falta a voz pt-BR do Windows"}
          text="Você fala, o seu PC transcreve (whisper.cpp oficial, roda no processador e não usa a internet depois de baixar). Os alunos respondem com as vozes do Windows."
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

        <Row
          icon={Feather}
          name="Grifo (skill de materiais)"
          tone="ok"
          status={`Embutida · v${s.grifo_version || "?"}`}
          text="Vem dentro do app. Funciona com o Ollama (rápido) e com o Claude (apostila completa) — não precisa instalar o plugin."
        />
      </motion.ul>
    </div>
  );
}
