import { useEffect, useRef, useState } from "react";
import { ArrowLeft, MessageCircle, Send } from "lucide-react";
import { Skeleton } from "@/components/motion";
import { toastError } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ago } from "@/lib/format";
import { cn, warn } from "@/lib/utils";
import { conversations, markThreadRead, profileById, sendMessage, thread, type Message, type Mini } from "./api";
import { PersonPhoto, useLoad, type Open } from "./ui";

/** Repete `f` a cada `ms` enquanto o componente está na tela. */
function useEvery(ms: number, f: () => void) {
  const latest = useRef(f);
  useEffect(() => {
    latest.current = f;
  });
  useEffect(() => {
    const t = setInterval(() => latest.current(), ms);
    return () => clearInterval(t);
  }, [ms]);
}

/** Mensagens privadas: lista de conversas à esquerda, a conversa aberta à direita. */
export function MessagesTab({ me, open, start, onUnreadChange }: { me: string; open: Open; start?: string | null; onUnreadChange: () => void }) {
  const list = useLoad(conversations, []);
  const [selected, setSelected] = useState<string | null>(start ?? null);
  useEvery(20_000, list.reload);
  useEffect(() => {
    if (start) setSelected(start);
  }, [start]);

  const current = list.data?.find((c) => c.id === selected);

  return (
    <div className="grid h-[calc(100vh-11rem)] min-h-[420px] overflow-hidden rounded-2xl border border-border bg-card shadow-soft md:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
      <aside className={cn("min-h-0 overflow-y-auto border-r border-border", selected && "hidden md:block")}>
        <p className="border-b border-border px-4 py-3 font-semibold">Mensagens</p>
        {!list.data && !list.error && (
          <div className="space-y-2 p-3">
            <Skeleton className="h-14 rounded-xl" />
            <Skeleton className="h-14 rounded-xl" />
          </div>
        )}
        {list.error && <p className="p-4 text-sm text-destructive">{list.error}</p>}
        {list.data?.length === 0 && !selected && (
          <p className="p-4 text-sm text-muted-foreground">Nenhuma conversa ainda. Abra o perfil de alguém e toque em "Mensagem".</p>
        )}
        <ul>
          {list.data?.map((c) => (
            <li key={c.id}>
              <button
                onClick={() => setSelected(c.id)}
                className={cn("flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-secondary/60", c.id === selected && "bg-secondary")}
              >
                <PersonPhoto p={c} size={44} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span className={cn("truncate text-sm", c.unread > 0 && "font-semibold")}>{c.display_name}</span>
                    <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">{ago(c.last_at)}</span>
                  </span>
                  <span className={cn("block truncate text-xs", c.unread > 0 ? "text-foreground" : "text-muted-foreground")}>
                    {c.last_from_me ? "Você: " : ""}
                    {c.last_body}
                  </span>
                </span>
                {c.unread > 0 && <span className="tabular grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">{c.unread}</span>}
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section className={cn("flex min-h-0 flex-col", !selected && "hidden md:flex")}>
        {selected ? (
          <Thread
            key={selected}
            me={me}
            other={selected}
            known={current}
            open={open}
            onBack={() => setSelected(null)}
            onActivity={() => {
              list.reload();
              onUnreadChange();
            }}
          />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
            <MessageCircle className="size-8" />
            Escolha uma conversa.
          </div>
        )}
      </section>
    </div>
  );
}

function Thread({ me, other, known, open, onBack, onActivity }: { me: string; other: string; known?: Mini; open: Open; onBack: () => void; onActivity: () => void }) {
  const person = useLoad(async () => known ?? (await profileById(other)), [other]);
  const msgs = useLoad(() => thread(other), [other]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const count = msgs.data?.length ?? 0;
  const unreadFromThem = msgs.data?.some((m) => m.from_id === other && !m.read_at) ?? false;

  useEvery(8_000, msgs.reload);
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [count]);
  // marca como lido uma vez por leva de mensagens novas (o `onActivity` muda a cada render do pai)
  const activity = useRef(onActivity);
  const marked = useRef(-1);
  useEffect(() => {
    activity.current = onActivity;
  });
  useEffect(() => {
    if (!unreadFromThem || marked.current === count) return;
    marked.current = count;
    markThreadRead(other).then(() => activity.current(), (e) => warn("marcar mensagens como lidas", e));
  }, [unreadFromThem, other, count]);

  const send = () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    sendMessage(other, body)
      .then((m) => {
        setText("");
        if (m) msgs.setData((d) => [...(d ?? []), m]);
        onActivity();
      }, toastError)
      .finally(() => setSending(false));
  };

  const p = person.data;
  return (
    <>
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <Button variant="ghost" size="icon-sm" className="md:hidden" onClick={onBack} aria-label="Voltar">
          <ArrowLeft />
        </Button>
        {p && (
          <button onClick={() => open({ kind: "profile", id: p.id })} className="flex min-w-0 items-center gap-3 text-left">
            <PersonPhoto p={p} size={36} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{p.display_name}</span>
              <span className="block truncate text-xs text-muted-foreground">@{p.handle}</span>
            </span>
          </button>
        )}
      </header>

      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-4 py-4">
        {msgs.error && <p className="text-sm text-destructive">{msgs.error}</p>}
        {msgs.data?.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">Diga oi! A conversa é só entre vocês dois.</p>}
        {msgs.data?.map((m, i) => (
          <Bubble key={m.id} m={m} mine={m.from_id === me} showTime={i === (msgs.data?.length ?? 0) - 1 || gap(m, msgs.data?.[i + 1])} />
        ))}
        <div ref={bottom} />
      </div>

      <form
        className="flex items-end gap-2 border-t border-border p-3"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <Textarea
          value={text}
          maxLength={2000}
          placeholder="Escreva uma mensagem…"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // Enter envia; Shift+Enter quebra a linha
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          className="max-h-32 min-h-10 flex-1 resize-none py-2"
        />
        <Button type="submit" size="icon-lg" disabled={sending || !text.trim()} aria-label="Enviar">
          <Send />
        </Button>
      </form>
    </>
  );
}

/** Mostra a hora quando a próxima mensagem vem bem depois (ou é de outra pessoa). */
function gap(m: Message, next: Message | undefined): boolean {
  if (!next) return true;
  return next.from_id !== m.from_id || Date.parse(next.created_at) - Date.parse(m.created_at) > 5 * 60_000;
}

function Bubble({ m, mine, showTime }: { m: Message; mine: boolean; showTime: boolean }) {
  return (
    <div className={cn("flex flex-col", mine ? "items-end" : "items-start")}>
      <p
        className={cn(
          "max-w-[75%] rounded-2xl px-3.5 py-2 text-sm break-words whitespace-pre-wrap",
          mine ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md bg-secondary",
        )}
      >
        {m.body}
      </p>
      {showTime && (
        <span className="mt-0.5 px-1 text-[10px] text-muted-foreground">
          {ago(m.created_at)}
          {mine && m.read_at ? " · visto" : ""}
        </span>
      )}
    </div>
  );
}

