import { useCallback, useEffect, useRef, useState, type DependencyList, type ReactNode } from "react";
import { Camera, Flag, Users } from "lucide-react";
import { toast, toastError } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { PersonPhoto } from "@/components/PersonPhoto";
import { cn, errorMessage } from "@/lib/utils";
import { report, type Mini, type ReportKind } from "./api";

/** Para onde a tela da comunidade está olhando. */
export type Route = { kind: "home" } | { kind: "profile"; id: string } | { kind: "community"; id: string } | { kind: "topic"; id: string } | { kind: "item"; id: string };
export type Open = (r: Route) => void;

export { PersonPhoto };

/** Foto da comunidade (quadrada); sem foto, um ícone neutro. */
export function CommunityPhoto({ c, size = 48, className }: { c: { photo_url: string | null }; size?: number; className?: string }) {
  const style = { width: size, height: size };
  if (c.photo_url) return <img src={c.photo_url} alt="" style={style} className={cn("shrink-0 rounded-xl bg-secondary object-cover", className)} loading="lazy" />;
  return (
    <span style={style} className={cn("grid shrink-0 place-items-center rounded-xl bg-secondary text-muted-foreground", className)}>
      <Users className="size-1/2" />
    </span>
  );
}

/** Botão que abre o seletor de imagem. `onPick` recebe o arquivo. */
export function PhotoButton({ label, onPick, busy, className }: { label: string; onPick: (f: File) => void; busy?: boolean; className?: string }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) onPick(f);
        }}
      />
      <Button type="button" variant="outline" size="sm" disabled={busy} className={className} onClick={() => input.current?.click()}>
        <Camera /> {busy ? "Enviando…" : label}
      </Button>
    </>
  );
}

/** Nome clicável de alguém (abre o perfil). */
export function PersonLink({ p, open, className }: { p: Mini; open: Open; className?: string }) {
  return (
    <button className={cn("font-medium underline-offset-4 hover:text-primary hover:underline", className)} onClick={() => open({ kind: "profile", id: p.id })}>
      {p.display_name}
    </button>
  );
}

/** Caixa com título e contador. */
export function Box({ title, count, action, children, className }: { title?: string; count?: number; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("space-y-3 rounded-2xl border border-border bg-card p-4 shadow-soft", className)}>
      {(title || action) && (
        <header className="flex items-center gap-2">
          {title && (
            <h2 className="text-sm font-semibold">
              {title}
              {count !== undefined && <span className="ml-1.5 font-normal text-muted-foreground">({count})</span>}
            </h2>
          )}
          <span className="ml-auto">{action}</span>
        </header>
      )}
      {children}
    </section>
  );
}

/** Grade 3×3 de pessoas (amigos, membros). */
export function PeopleGrid({ people, open, empty }: { people: Mini[]; open: Open; empty: string }) {
  if (people.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="grid grid-cols-3 gap-2">
      {people.slice(0, 9).map((p) => (
        <li key={p.id}>
          <button onClick={() => open({ kind: "profile", id: p.id })} className="flex w-full flex-col items-center gap-1 rounded-xl p-1.5 hover:bg-secondary">
            <PersonPhoto p={p} size={48} />
            <span className="w-full truncate text-center text-xs">{p.display_name}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Carrega dados assíncronos de novo quando `deps` mudam; `reload` refaz. Erro vira texto. */
export function useLoad<T>(load: () => Promise<T>, deps: DependencyList) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  const latest = useRef(load);
  useEffect(() => {
    latest.current = load;
  });
  useEffect(() => {
    let live = true;
    latest.current().then(
      (d) => {
        if (!live) return;
        setData(d);
        setError("");
      },
      (e) => {
        if (live) setError(errorMessage(e));
      },
    );
    return () => {
      live = false;
    };
  }, [...deps, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, reload, setData };
}

/** Executa uma ação (enviar, apagar…) com aviso de erro e trava contra clique duplo. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const act = async (f: () => Promise<unknown>, done?: string) => {
    if (busy) return false;
    setBusy(true);
    try {
      await f();
      if (done) toast(done, "success");
      return true;
    } catch (e) {
      toastError(e);
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { busy, act };
}

/** Caixa de texto com botão de enviar (recado, resposta, comentário). Limpa ao enviar. */
export function Composer({ placeholder, max, label, onSend, compact }: { placeholder: string; max: number; label: string; onSend: (text: string) => Promise<boolean>; compact?: boolean }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const left = max - text.length;
  return (
    <form
      className={cn(compact ? "flex items-end gap-2" : "space-y-2")}
      onSubmit={(e) => {
        e.preventDefault();
        if (!text.trim() || busy) return;
        setBusy(true);
        void onSend(text.trim()).then((ok) => {
          setBusy(false);
          if (ok) setText("");
        });
      }}
    >
      <Textarea value={text} maxLength={max} placeholder={placeholder} onChange={(e) => setText(e.target.value)} className={compact ? "min-h-9 flex-1 py-1.5" : "min-h-20"} />
      <div className={cn("flex items-center justify-end gap-3", compact && "shrink-0")}>
        {!compact && left < 100 && <span className="tabular text-xs text-muted-foreground">{left}</span>}
        <Button type="submit" size="sm" disabled={busy || !text.trim()}>
          {label}
        </Button>
      </div>
    </form>
  );
}

/** Botão "Denunciar" que abre o motivo ali mesmo. */
export function ReportButton({ kind, target }: { kind: ReportKind; target: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const { busy, act } = useAction();
  if (!open) {
    return (
      <Button variant="ghost" size="xs" className="text-muted-foreground" onClick={() => setOpen(true)} title="Denunciar">
        <Flag /> Denunciar
      </Button>
    );
  }
  return (
    <form
      className="mt-2 w-full space-y-2 rounded-xl border border-border bg-secondary p-3"
      onSubmit={(e) => {
        e.preventDefault();
        void act(() => report(kind, target, reason.trim()), "Denúncia enviada. Obrigado!").then((ok) => {
          if (ok) {
            setOpen(false);
            setReason("");
          }
        });
      }}
    >
      <Textarea value={reason} maxLength={500} placeholder="O que há de errado? (spam, ofensa, golpe…)" onChange={(e) => setReason(e.target.value)} className="min-h-16" />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
        <Button type="submit" size="sm" variant="destructive" disabled={busy || !reason.trim()}>
          Enviar denúncia
        </Button>
      </div>
    </form>
  );
}
