import { useEffect, useState } from "react";
import { Bug, Eye, EyeOff, Lightbulb, Loader2, Megaphone, Send, Terminal, Trash2 } from "lucide-react";
import { NativeSelect } from "@/components/fields";
import { Segmented } from "@/components/Segmented";
import { toast, toastError } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { rest } from "@/lib/cloud";
import { ago } from "@/lib/format";
import { cn, warn } from "@/lib/utils";
import { FEEDBACK_STATUS, type Feedback } from "./Help";

type Kind = "info" | "update" | "warning";
type Row = { id: string; title: string; body: string; kind: Kind; active: boolean; created_at: string };

export const ANNOUNCEMENT_KIND: Record<Kind, string> = { info: "Novidade", update: "Atualização", warning: "Importante" };

/** A conta logada é dev? (`admins` no servidor; quem decide de verdade é o RLS). */
export function useIsAdmin(signedIn: boolean): boolean {
  const [admin, setAdmin] = useState(false);
  useEffect(() => {
    if (!signedIn) {
      setAdmin(false);
      return;
    }
    rest<boolean>("rpc/is_admin", { method: "POST", body: {} }).then(
      (v) => setAdmin(v === true),
      (e) => warn("conferir admin", e),
    );
  }, [signedIn]);
  return admin;
}

/** Config → Conta, só para dev: avisos para todo mundo e caixa de entrada da Ajuda. */
export function AdminPanel() {
  return (
    <section className="space-y-5 rounded-2xl border border-primary/40 bg-card p-6 shadow-soft">
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-xl bg-primary/15 text-primary">
          <Terminal className="size-5" />
        </span>
        <div>
          <h2 className="font-semibold">Painel do dev</h2>
          <p className="text-sm text-muted-foreground">Só a sua conta vê isto.</p>
        </div>
      </div>
      <Announcements />
      <Inbox />
    </section>
  );
}

function Announcements() {
  const [rows, setRows] = useState<Row[]>([]);
  const [kind, setKind] = useState<Kind>("info");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => void rest<Row[]>("announcements?select=id,title,body,kind,active,created_at&order=created_at.desc&limit=20").then(setRows, toastError);
  useEffect(load, []);

  async function publish() {
    setBusy(true);
    try {
      await rest("announcements", { method: "POST", body: { kind, title: title.trim(), body: body.trim() } });
      toast("Aviso publicado: aparece para todos ao abrir o app", "success");
      setTitle("");
      setBody("");
      load();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  }

  const patch = (id: string, b: Partial<Row>) => void rest(`announcements?id=eq.${id}`, { method: "PATCH", body: b }).then(load, toastError);
  const remove = (id: string) => void rest(`announcements?id=eq.${id}`, { method: "DELETE" }).then(load, toastError);

  return (
    <div className="space-y-3">
      <h3 className="flex items-center gap-2 text-sm font-medium">
        <Megaphone className="size-4 text-primary" /> Aviso para todos os usuários
      </h3>
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (title.trim().length >= 3) void publish();
        }}
      >
        <Segmented label="Tipo do aviso" value={kind} onChange={setKind} options={Object.entries(ANNOUNCEMENT_KIND) as [Kind, string][]} />
        <Input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="Título (ex.: Versão 0.5 chegou!)" />
        <Textarea rows={3} value={body} maxLength={4000} onChange={(e) => setBody(e.target.value)} placeholder="Mensagem (aparece num popup ao abrir o app, uma vez por pessoa)" />
        <div className="flex justify-end">
          <Button type="submit" size="sm" disabled={busy || title.trim().length < 3}>
            {busy ? <Loader2 className="animate-spin" /> : <Send />} Publicar
          </Button>
        </div>
      </form>
      {rows.length > 0 && (
        <ul className="space-y-1.5">
          {rows.map((r) => (
            <li key={r.id} className={cn("flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm", !r.active && "opacity-60")}>
              <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[11px]">{ANNOUNCEMENT_KIND[r.kind]}</span>
              <span className="min-w-0 flex-1 truncate">{r.title}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{ago(r.created_at)}</span>
              <button className="text-muted-foreground hover:text-foreground" title={r.active ? "Esconder" : "Mostrar de novo"} onClick={() => patch(r.id, { active: !r.active })}>
                {r.active ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
              </button>
              <button className="text-muted-foreground hover:text-destructive" title="Apagar" onClick={() => remove(r.id)}>
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type Incoming = Feedback & { author_id: string };

function Inbox() {
  const [rows, setRows] = useState<Incoming[]>([]);
  const [filter, setFilter] = useState<"open" | "all">("open");
  const [reply, setReply] = useState<Record<string, string>>({});

  const load = () => {
    const where = filter === "open" ? "&status=in.(open,doing)" : "";
    void rest<Incoming[]>(`feedback?select=*${where}&order=created_at.desc&limit=50`).then(setRows, toastError);
  };
  useEffect(load, [filter]);

  const patch = (id: string, b: Partial<Feedback>) =>
    void rest(`feedback?id=eq.${id}`, { method: "PATCH", body: b }).then(() => {
      toast("Atualizado", "success");
      load();
    }, toastError);

  return (
    <div className="space-y-3 border-t border-border pt-4">
      <div className="flex items-center gap-3">
        <h3 className="flex-1 text-sm font-medium">Caixa de entrada da Ajuda</h3>
        <Segmented
          label="Filtro"
          value={filter}
          onChange={setFilter}
          options={[
            ["open", "Abertos"],
            ["all", "Todos"],
          ]}
        />
      </div>
      {rows.length === 0 && <p className="text-sm text-muted-foreground">Nada por aqui.</p>}
      <ul className="space-y-2">
        {rows.map((f) => (
          <li key={f.id} className="space-y-2 rounded-xl border border-border p-3 text-sm">
            <div className="flex items-center gap-2">
              {f.kind === "bug" ? <Bug className="size-4 shrink-0 text-destructive" /> : <Lightbulb className="size-4 shrink-0 text-primary" />}
              <span className="min-w-0 flex-1 font-medium">{f.title}</span>
              <NativeSelect className="h-8 w-40" value={f.status} onChange={(e) => patch(f.id, { status: e.target.value as Feedback["status"] })}>
                {Object.entries(FEEDBACK_STATUS).map(([k, [label]]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            </div>
            {f.body && <p className="whitespace-pre-wrap text-muted-foreground">{f.body}</p>}
            <p className="text-xs text-muted-foreground">{[ago(f.created_at), f.app_version && `v${f.app_version}`, f.system].filter(Boolean).join(" · ")}</p>
            <div className="flex gap-2">
              <Input
                className="h-8"
                placeholder={f.reply ? `Resposta: ${f.reply}` : "Responder (a pessoa vê em Ajuda)"}
                value={reply[f.id] ?? ""}
                onChange={(e) => setReply({ ...reply, [f.id]: e.target.value })}
              />
              <Button size="sm" variant="secondary" disabled={!reply[f.id]?.trim()} onClick={() => (patch(f.id, { reply: reply[f.id].trim() }), setReply({ ...reply, [f.id]: "" }))}>
                <Send />
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
