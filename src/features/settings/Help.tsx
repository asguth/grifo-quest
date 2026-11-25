import { getVersion } from "@tauri-apps/api/app";
import { useEffect, useState } from "react";
import { Bug, Lightbulb, Loader2, MessageSquareReply, Send } from "lucide-react";
import { Segmented } from "@/components/Segmented";
import { toast, toastError } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAccount } from "@/lib/access";
import { rest } from "@/lib/cloud";
import { ago } from "@/lib/format";
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

/** Config → Sistema → Ajuda: problema ou ideia direto para o banco do Grifo Quest Cloud (só com conta). */
export function HelpCard() {
  const account = useAccount();
  const [kind, setKind] = useState<Kind>("bug");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [mine, setMine] = useState<Feedback[]>([]);

  const load = () =>
    void rest<Feedback[]>("feedback?select=id,kind,title,body,status,reply,created_at&order=created_at.desc&limit=10").then(setMine, (e) =>
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
      load();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-4 rounded-lg border border-border bg-card p-4">
      <div>
        <h2 className="font-semibold">Ajuda</h2>
        <p className="text-sm text-muted-foreground">Achou um problema ou teve uma ideia? Manda direto para quem faz o Grifo Quest. A versão do app e o sistema vão junto.</p>
      </div>

      {!account.available ? (
        // build sem nuvem (fork do código aberto): o GitHub continua sendo o caminho
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => void reportIssue("bug")}>
            <Bug /> Reportar no GitHub
          </Button>
          <Button size="sm" variant="secondary" onClick={() => void reportIssue("ideia")}>
            <Lightbulb /> Sugerir no GitHub
          </Button>
        </div>
      ) : !account.signedIn ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-secondary/50 px-4 py-3">
          <p className="text-sm text-muted-foreground">Entre na sua conta do Grifo Quest Cloud para enviar (por enquanto, só beta testers).</p>
          <Button size="sm" variant="secondary" onClick={() => requestSettingsTab("conta")}>
            Entrar na conta
          </Button>
        </div>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (title.trim().length >= 3) void send();
          }}
        >
          <Segmented
            label="Tipo"
            value={kind}
            onChange={setKind}
            options={[
              ["bug", "Problema"],
              ["idea", "Ideia"],
            ]}
          />
          <Input
            value={title}
            maxLength={140}
            disabled={busy}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={kind === "bug" ? "O que deu errado? (ex.: Mundo travou ao abrir notícia)" : "Sua ideia em uma frase"}
          />
          <Textarea
            rows={4}
            value={body}
            maxLength={5000}
            disabled={busy}
            onChange={(e) => setBody(e.target.value)}
            placeholder={kind === "bug" ? "Como aconteceu? O que você esperava?" : "Conte mais: como ajudaria nos seus estudos?"}
          />
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={busy || title.trim().length < 3}>
              {busy ? <Loader2 className="animate-spin" /> : <Send />} Enviar
            </Button>
          </div>
        </form>
      )}

      {account.signedIn && mine.length > 0 && (
        <div className="space-y-2 border-t border-border pt-3">
          <h3 className="text-sm font-medium">Seus envios</h3>
          <ul className="space-y-1.5">
            {mine.map((f) => (
              <li key={f.id} className="rounded-lg border border-border px-3 py-2 text-sm">
                <div className="flex items-center gap-2">
                  {f.kind === "bug" ? <Bug className="size-3.5 shrink-0 text-muted-foreground" /> : <Lightbulb className="size-3.5 shrink-0 text-muted-foreground" />}
                  <span className="min-w-0 flex-1 truncate">{f.title}</span>
                  <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px]", FEEDBACK_STATUS[f.status][1])}>{FEEDBACK_STATUS[f.status][0]}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{ago(f.created_at)}</span>
                </div>
                {f.reply && (
                  <p className="mt-1.5 flex gap-1.5 rounded-md bg-primary/10 px-2 py-1.5 text-xs">
                    <MessageSquareReply className="size-3.5 shrink-0 text-primary" /> {f.reply}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
