import { getVersion } from "@tauri-apps/api/app";
import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Bug, Inbox, LifeBuoy, Lightbulb, Loader2, MessageSquareReply, Send, X } from "lucide-react";
import { toast, toastError } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAccount } from "@/lib/access";
import { rest } from "@/lib/cloud";
import { ago } from "@/lib/format";
import { spring } from "@/lib/motion";
import { reportIssue, systemName } from "@/lib/report";
import { cn, warn } from "@/lib/utils";
import { requestSettingsTab } from "./tabRequest";

type Kind = "bug" | "idea";

export type Feedback = {
  id: string;
  kind: Kind;
  title: string;
  body: string;
  status: "open" | "doing" | "done" | "wont";
  reply: string | null;
  created_at: string;
  app_version?: string | null;
  system?: string | null;
};

export const FEEDBACK_STATUS: Record<Feedback["status"], [string, string]> = {
  open: ["Recebido", "bg-secondary text-muted-foreground"],
  doing: ["Em andamento", "bg-primary/15 text-primary"],
  done: ["Resolvido", "bg-success/15 text-success"],
  wont: ["Não vai entrar", "bg-destructive/10 text-destructive"],
};

/** Configurações → Sistema → Ajuda: cartão com botões; o formulário abre num popup. Vai direto para o banco do Grifo Quest Cloud (só com conta). */
export function HelpCard() {
  const account = useAccount();
  const [open, setOpen] = useState<null | "form" | "mine">(null);
  const [kind, setKind] = useState<Kind>("bug");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [mine, setMine] = useState<Feedback[]>([]);

  const load = () =>
    void rest<Feedback[]>("feedback?select=id,kind,title,body,status,reply,created_at&order=created_at.desc&limit=20").then(setMine, (e) =>
      warn("ler os pedidos de ajuda", e),
    );
  useEffect(() => {
    if (account.signedIn) load();
  }, [account.signedIn]);

  async function send() {
    setBusy(true);
    try {
      let version: string | null = null;
      try {
        version = await getVersion();
      } catch (e) {
        warn("versão do app", e);
      }
      await rest("feedback", { method: "POST", body: { kind, title: title.trim(), body: body.trim(), app_version: version, system: systemName() } });
      toast(kind === "bug" ? "Problema enviado. Obrigado!" : "Ideia enviada. Obrigado!", "success");
      setTitle("");
      setBody("");
      setOpen(null);
      load();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  }

  const begin = (k: Kind) => {
    if (!account.available) return void reportIssue(k === "bug" ? "bug" : "ideia");
    if (!account.signedIn) return requestSettingsTab("conta");
    setKind(k);
    setOpen("form");
  };
  const answered = mine.filter((f) => f.reply).length;

  return (
    <section className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-card p-4">
      <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/15 text-primary">
        <LifeBuoy className="size-5" />
      </span>
      <div className="min-w-60 flex-1">
        <h2 className="font-semibold">Ajuda</h2>
        <p className="text-sm text-muted-foreground">
          {!account.available
            ? "Achou um problema ou teve uma ideia? Abre o GitHub com a versão já preenchida."
            : account.signedIn
              ? "Achou um problema ou teve uma ideia? Manda direto para quem faz o Grifo Quest."
              : "Entre na sua conta (por enquanto, beta testers) para falar direto com o time."}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => begin("bug")}>
          <Bug /> Reportar problema
        </Button>
        <Button variant="secondary" onClick={() => begin("idea")}>
          <Lightbulb /> Sugerir ideia
        </Button>
        {account.signedIn && mine.length > 0 && (
          <Button variant="ghost" onClick={() => setOpen("mine")}>
            <Inbox /> Meus envios
            {answered > 0 && <span className="rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">{answered}</span>}
          </Button>
        )}
      </div>

      <Popup open={open !== null} onClose={() => setOpen(null)} title={open === "mine" ? "Meus envios" : kind === "bug" ? "Reportar um problema" : "Sugerir uma ideia"}>
        {open === "form" && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (title.trim().length >= 3) void send();
            }}
          >
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ["bug", Bug, "Problema", "Algo quebrou ou não funciona"],
                  ["idea", Lightbulb, "Ideia", "Algo que ajudaria nos estudos"],
                ] as const
              ).map(([k, Icon, label, hint]) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={kind === k}
                  onClick={() => setKind(k)}
                  className={cn("flex items-start gap-2 rounded-xl border-2 p-3 text-left transition-colors", kind === k ? "border-primary bg-primary/5" : "border-border hover:border-primary/50")}
                >
                  <Icon className={cn("mt-0.5 size-4 shrink-0", kind === k ? "text-primary" : "text-muted-foreground")} />
                  <span>
                    <span className="block text-sm font-semibold">{label}</span>
                    <span className="block text-xs text-muted-foreground">{hint}</span>
                  </span>
                </button>
              ))}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="help-title">{kind === "bug" ? "O que deu errado?" : "Sua ideia em uma frase"}</Label>
              <Input
                id="help-title"
                autoFocus
                value={title}
                maxLength={140}
                disabled={busy}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={kind === "bug" ? "Ex.: o Mundo travou ao abrir uma notícia" : "Ex.: revisão por áudio no caminho do trabalho"}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="help-body">{kind === "bug" ? "Como aconteceu?" : "Conte mais"}</Label>
              <Textarea
                id="help-body"
                rows={5}
                value={body}
                maxLength={5000}
                disabled={busy}
                onChange={(e) => setBody(e.target.value)}
                placeholder={kind === "bug" ? "O que você fez antes, o que esperava e o que apareceu." : "Como isso ajudaria nos seus estudos?"}
              />
            </div>
            <p className="text-xs text-muted-foreground">A versão do app e o sistema vão junto, para a gente achar o problema mais rápido. Você vê a resposta em Meus envios.</p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(null)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={busy || title.trim().length < 3}>
                {busy ? <Loader2 className="animate-spin" /> : <Send />} Enviar
              </Button>
            </div>
          </form>
        )}
        {open === "mine" && (
          <ul className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
            {mine.map((f) => (
              <li key={f.id} className="space-y-1.5 rounded-xl border border-border p-3 text-sm">
                <div className="flex items-center gap-2">
                  {f.kind === "bug" ? <Bug className="size-4 shrink-0 text-muted-foreground" /> : <Lightbulb className="size-4 shrink-0 text-muted-foreground" />}
                  <span className="min-w-0 flex-1 truncate font-medium">{f.title}</span>
                  <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px]", FEEDBACK_STATUS[f.status][1])}>{FEEDBACK_STATUS[f.status][0]}</span>
                </div>
                <p className="text-xs text-muted-foreground">{ago(f.created_at)}</p>
                {f.reply && (
                  <p className="flex gap-1.5 rounded-lg bg-primary/10 px-2.5 py-2 text-xs">
                    <MessageSquareReply className="size-3.5 shrink-0 text-primary" /> {f.reply}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Popup>
    </section>
  );
}

/** Janela por cima da tela (fecha no X, no fundo ou com Esc). */
function Popup({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("keydown", esc);
    };
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[85] grid place-items-center bg-black/60 p-6 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ y: 16, scale: 0.97 }}
            animate={{ y: 0, scale: 1 }}
            exit={{ y: 8, opacity: 0 }}
            transition={spring.soft}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-lg space-y-4 rounded-3xl border border-border bg-card p-6 shadow-lift"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">{title}</h2>
              <button onClick={onClose} aria-label="Fechar" className="grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground">
                <X className="size-4" />
              </button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
