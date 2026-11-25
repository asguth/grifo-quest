import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Bell, Check, Feather, Heart, Mail, MessageCircle, MessagesSquare, UserCheck, UserPlus, X } from "lucide-react";
import { Skeleton } from "@/components/motion";
import { toastError } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { ago } from "@/lib/format";
import { cn, warn } from "@/lib/utils";
import { acceptFriend, markRead, notifications, removeFriend, unreadCount, type NotificationKind } from "./api";
import { describe, groupNotifications, type NotificationGroup } from "./notify";
import { PersonPhoto, useLoad } from "./ui";

/** Para onde cada notificação leva (a tela da comunidade decide como abrir). */
export type NotificationTarget =
  | { kind: "item"; id: string }
  | { kind: "topic"; id: string }
  | { kind: "profile"; id: string }
  | { kind: "self" }
  | { kind: "friends" };

const ICON: Record<NotificationKind, typeof Bell> = {
  scrap: Mail,
  testimonial: Heart,
  friend_request: UserPlus,
  friend_accept: UserCheck,
  feather: Feather,
  comment: MessageCircle,
  reply: MessagesSquare,
};

function targetOf(g: NotificationGroup): NotificationTarget {
  const actor = g.actors[0]?.id ?? "";
  switch (g.kind) {
    case "feather":
    case "comment":
      return g.ref_id ? { kind: "item", id: g.ref_id } : { kind: "profile", id: actor };
    case "reply":
      return g.ref_id ? { kind: "topic", id: g.ref_id } : { kind: "profile", id: actor };
    case "scrap":
    case "testimonial":
      return { kind: "self" };
    case "friend_request":
      return { kind: "friends" };
    case "friend_accept":
      return { kind: "profile", id: actor };
  }
}

/** Sino com contador; abre um painel por cima da tela. Ao fechar, marca o que foi visto como lido. */
export function NotificationBell({ onGo }: { onGo: (t: NotificationTarget) => void }) {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) return;
    const check = () => unreadCount().then(setCount, (e) => warn("contar notificações", e));
    check();
    const t = setInterval(check, 60_000);
    return () => clearInterval(t);
  }, [open]);

  // clique fora ou Esc fecham
  useEffect(() => {
    if (!open) return;
    const click = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", click);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", click);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  return (
    <div ref={box} className="relative">
      <Button variant={open ? "default" : "outline"} size="icon-lg" className="relative" onClick={() => setOpen(!open)} aria-label="Notificações" aria-expanded={open}>
        <Bell />
        {count > 0 && (
          <span className="tabular absolute -top-1.5 -right-1.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-white">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </Button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full right-0 z-40 mt-2 w-[380px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-border bg-card shadow-lift"
          >
            <Panel
              onGo={(t) => {
                setOpen(false);
                onGo(t);
              }}
              onSeen={() => setCount(0)}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Panel({ onGo, onSeen }: { onGo: (t: NotificationTarget) => void; onSeen: () => void }) {
  const list = useLoad(async () => groupNotifications(await notifications()), []);
  const groups = list.data ?? [];
  const fresh = groups.filter((g) => g.unread);
  const old = groups.filter((g) => !g.unread);

  // ao fechar o painel, o que estava novo vira lido (o destaque fica visível enquanto ele está aberto)
  const unseen = useRef<string[]>([]);
  const seen = useRef(onSeen);
  useEffect(() => {
    unseen.current = fresh.flatMap((g) => g.ids);
    seen.current = onSeen;
  });
  useEffect(() => {
    return () => {
      const ids = unseen.current;
      if (ids.length) {
        markRead(ids).catch((e) => warn("marcar notificações", e));
        seen.current();
      }
    };
  }, []);

  return (
    <div className="max-h-[70vh] overflow-y-auto">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <p className="font-semibold">Notificações</p>
        {fresh.length > 0 && <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs text-primary">{fresh.length} novas</span>}
      </header>
      {list.error && <p className="p-4 text-sm text-destructive">{list.error}</p>}
      {!list.data && !list.error && (
        <div className="space-y-2 p-4">
          <Skeleton className="h-12 rounded-xl" />
          <Skeleton className="h-12 rounded-xl" />
        </div>
      )}
      {list.data && groups.length === 0 && (
        <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-sm text-muted-foreground">
          <Bell className="size-6" />
          Nada por aqui ainda. Quando alguém interagir com você, aparece aqui.
        </div>
      )}
      {fresh.length > 0 && <Section title="Novas" groups={fresh} onGo={onGo} onChanged={list.reload} />}
      {old.length > 0 && <Section title="Anteriores" groups={old} onGo={onGo} onChanged={list.reload} />}
    </div>
  );
}

function Section({ title, groups, onGo, onChanged }: { title: string; groups: NotificationGroup[]; onGo: (t: NotificationTarget) => void; onChanged: () => void }) {
  return (
    <section className="py-1">
      <p className="px-4 pt-2 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{title}</p>
      <ul>
        {groups.map((g) => (
          <Row key={g.key} g={g} onGo={onGo} onChanged={onChanged} />
        ))}
      </ul>
    </section>
  );
}

function Row({ g, onGo, onChanged }: { g: NotificationGroup; onGo: (t: NotificationTarget) => void; onChanged: () => void }) {
  const Icon = ICON[g.kind];
  const { who, what } = describe(g);
  const first = g.actors[0];
  const [answered, setAnswered] = useState<"accepted" | "declined" | null>(null);
  const friendAction = (accept: boolean) => {
    if (!first) return;
    (accept ? acceptFriend(first.id) : removeFriend(first.id)).then(() => {
      setAnswered(accept ? "accepted" : "declined");
      onChanged();
    }, toastError);
  };
  return (
    <li className={cn("relative", g.unread && "bg-primary/5")}>
      <button onClick={() => onGo(targetOf(g))} className="flex w-full items-start gap-3 px-4 py-2.5 text-left hover:bg-secondary/60">
        <span className="relative shrink-0">
          {first && <PersonPhoto p={first} size={40} />}
          <span className="absolute -right-1 -bottom-1 grid size-5 place-items-center rounded-full bg-card ring-2 ring-card">
            <Icon className="size-3.5 text-primary" />
          </span>
        </span>
        <span className="min-w-0 flex-1 text-sm">
          <span className="font-medium">{who}</span> <span className="text-muted-foreground">{what}</span>
          <span className="block text-xs text-muted-foreground">{ago(g.created_at)}</span>
        </span>
        {g.unread && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />}
      </button>
      {g.kind === "friend_request" && (
        <div className="flex gap-2 px-4 pb-2.5 pl-[68px]">
          {answered ? (
            <span className="text-xs text-muted-foreground">{answered === "accepted" ? "Agora vocês são amigos" : "Pedido recusado"}</span>
          ) : (
            <>
              <Button size="xs" onClick={() => friendAction(true)}>
                <Check /> Aceitar
              </Button>
              <Button size="xs" variant="ghost" onClick={() => friendAction(false)}>
                <X /> Recusar
              </Button>
            </>
          )}
        </div>
      )}
    </li>
  );
}
