import type { ReactNode } from "react";
import { Ban, CalendarClock, Check, EyeOff, MessageCircle, Pencil, Target, UserMinus, UserPlus } from "lucide-react";
import { Skeleton } from "@/components/motion";
import { TierBadge } from "@/components/TierBadge";
import { Button } from "@/components/ui/button";
import { formatDate, plural } from "@/lib/format";
import { toneOf } from "@/lib/image";
import { acceptFriend, block, communitiesOf, friendsOf, friendshipWith, profileById, profileFeed, removeFriend, requestFriend, unblock, type Profile } from "./api";
import { FeedList, PostBox } from "./Feed";
import { Box, CommunityPhoto, PersonPhoto, ReportButton, useAction, useLoad, type Open } from "./ui";

/**
 * Perfil: capa e foto no topo; à esquerda (como no Orkut) o "sobre", os amigos com a quantidade e as
 * comunidades embaixo; no centro, só as publicações da pessoa.
 */
export function ProfileView({
  id,
  me,
  open,
  blocked,
  onBlocksChanged,
  onEdit,
  onMessage,
}: {
  id: string;
  me: string;
  open: Open;
  blocked: Set<string>;
  onBlocksChanged: () => void;
  /** Só no próprio perfil. */
  onEdit?: () => void;
  onMessage: (id: string) => void;
}) {
  const self = id === me;
  const profile = useLoad(() => profileById(id), [id]);

  if (profile.error) return <p className="text-sm text-destructive">{profile.error}</p>;
  if (!profile.data) return <Skeleton className="h-80 rounded-2xl" />;
  const p = profile.data;

  return (
    <div className="space-y-5">
      <Header p={p}>
        {self ? (
          <Button variant="outline" size="sm" onClick={onEdit}>
            <Pencil /> Editar perfil
          </Button>
        ) : (
          <Relationship other={p} blocked={blocked.has(p.id)} onBlocksChanged={onBlocksChanged} onMessage={() => onMessage(p.id)} />
        )}
      </Header>

      <div className="grid gap-5 md:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
        <aside className="space-y-4">
          <About p={p} />
          {self || p.show_friends !== false ? <Friends id={p.id} open={open} hidden={self && p.show_friends === false} /> : <Hidden what="Os amigos" />}
          {self || p.show_communities !== false ? (
            <Communities id={p.id} open={open} hidden={self && p.show_communities === false} />
          ) : (
            <Hidden what="As comunidades" />
          )}
        </aside>
        <main className="min-w-0">
          <FeedList
            load={() => profileFeed(p.id)}
            deps={[p.id]}
            me={me}
            open={open}
            empty={self ? "Você ainda não publicou nada." : `${p.display_name.split(" ")[0]} ainda não publicou nada.`}
            top={(add) => (self ? <PostBox me={p} onPublished={add} /> : null)}
          />
        </main>
      </div>
    </div>
  );
}

/** Capa (foto ou cor da pessoa) com a foto de perfil sobreposta. */
export function Header({ p, children }: { p: Pick<Profile, "id" | "display_name" | "handle" | "photo_url" | "cover_url" | "badge">; children?: ReactNode }) {
  const hue = toneOf(p.id);
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
      <div
        className="h-36 bg-cover bg-center sm:h-44"
        style={p.cover_url ? { backgroundImage: `url("${p.cover_url}")` } : { background: `linear-gradient(120deg, oklch(0.72 0.1 ${hue}), oklch(0.6 0.12 ${(hue + 60) % 360}))` }}
      />
      <div className="flex flex-wrap items-end gap-4 px-5 pb-4">
        <PersonPhoto p={p} size={112} className="relative z-10 -mt-14 ring-4 ring-card" />
        <div className="min-w-0 flex-1 pt-2">
          <p className="flex flex-wrap items-center gap-2 text-2xl font-semibold">
            <span className="truncate">{p.display_name}</span>
            <TierBadge plan={p.badge} />
          </p>
          <p className="text-sm text-muted-foreground">@{p.handle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">{children}</div>
      </div>
    </section>
  );
}

function About({ p }: { p: Profile }) {
  const hasExam = p.share_exam && p.exam_name && p.exam_date;
  return (
    <Box title="Sobre">
      {p.target && (
        <p className="flex items-start gap-2 text-sm">
          <Target className="mt-0.5 size-4 shrink-0 text-primary" /> {p.target}
        </p>
      )}
      {hasExam && (
        <p className="flex items-start gap-2 text-sm">
          <CalendarClock className="mt-0.5 size-4 shrink-0 text-primary" /> {p.exam_name} em {formatDate(p.exam_date)}
        </p>
      )}
      {p.bio && <p className="text-sm whitespace-pre-wrap text-muted-foreground">{p.bio}</p>}
      {p.show_stats && (
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-secondary/70 p-2 text-center text-xs">
          <Stat value={p.level} label="nível" />
          <Stat value={p.xp} label="XP" />
          <Stat value={p.streak} label={p.streak === 1 ? "dia" : "dias"} />
        </div>
      )}
      <p className="text-xs text-muted-foreground">Membro desde {formatDate(p.created_at)}</p>
    </Box>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <p className="tabular text-sm font-semibold">{value.toLocaleString("pt-BR")}</p>
      <p className="text-muted-foreground">{label}</p>
    </div>
  );
}

function Relationship({ other, blocked, onBlocksChanged, onMessage }: { other: Profile; blocked: boolean; onBlocksChanged: () => void; onMessage: () => void }) {
  const f = useLoad(() => friendshipWith(other.id), [other.id]);
  const { busy, act } = useAction();
  const run = (g: () => Promise<unknown>, done: string) => void act(g, done).then((ok) => ok && f.reload());
  const status = f.data?.status;
  const incoming = f.data?.requester_id === other.id;

  return (
    <>
      {!blocked && (
        <Button size="sm" onClick={onMessage}>
          <MessageCircle /> Mensagem
        </Button>
      )}
      {!f.data && !blocked && (
        <Button variant="outline" size="sm" disabled={busy} onClick={() => run(() => requestFriend(other.id), "Pedido de amizade enviado")}>
          <UserPlus /> Adicionar
        </Button>
      )}
      {status === "pending" && incoming && (
        <Button variant="outline" size="sm" disabled={busy} onClick={() => run(() => acceptFriend(other.id), "Agora vocês são amigos")}>
          <Check /> Aceitar amizade
        </Button>
      )}
      {status === "pending" && !incoming && (
        <Button variant="outline" size="sm" disabled={busy} onClick={() => run(() => removeFriend(other.id), "Pedido cancelado")}>
          Pedido enviado
        </Button>
      )}
      {status === "accepted" && (
        <Button variant="outline" size="sm" disabled={busy} title="Desfazer amizade" onClick={() => run(() => removeFriend(other.id), "Amizade desfeita")}>
          <UserMinus /> Amigos
        </Button>
      )}
      <Button
        variant="ghost"
        size="sm"
        className="text-muted-foreground"
        disabled={busy}
        onClick={() => void act(() => (blocked ? unblock(other.id) : block(other.id)), blocked ? "Desbloqueado" : "Bloqueado").then((ok) => ok && onBlocksChanged())}
      >
        <Ban /> {blocked ? "Desbloquear" : "Bloquear"}
      </Button>
      <ReportButton kind="profile" target={other.id} />
    </>
  );
}

/** Seção escondida pela pessoa (Privacidade em Editar perfil). */
function Hidden({ what }: { what: string }) {
  return (
    <Box>
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <EyeOff className="size-4 shrink-0" /> {what} desta pessoa são privados.
      </p>
    </Box>
  );
}

/** Aviso no próprio perfil: só você vê esta lista. */
function OnlyYou() {
  return (
    <span className="flex items-center gap-1 text-[11px] font-normal text-muted-foreground" title="Escondido dos outros em Editar perfil → Privacidade">
      <EyeOff className="size-3" /> só você vê
    </span>
  );
}

function Friends({ id, open, hidden }: { id: string; open: Open; hidden?: boolean }) {
  const list = useLoad(() => friendsOf(id), [id]);
  const n = list.data?.length ?? 0;
  return (
    <Box title={list.data ? plural(n, "amigo", "amigos") : "Amigos"} action={hidden && <OnlyYou />}>
      {!list.data && <Skeleton className="h-28 rounded-xl" />}
      {list.data?.length === 0 && <p className="text-sm text-muted-foreground">Ainda sem amigos.</p>}
      <ul className="grid grid-cols-3 gap-2">
        {list.data?.slice(0, 9).map((f) => (
          <li key={f.id}>
            <button onClick={() => open({ kind: "profile", id: f.id })} className="flex w-full flex-col items-center gap-1 rounded-xl p-1 hover:bg-secondary">
              <PersonPhoto p={f} size={56} className="rounded-xl" />
              <span className="w-full truncate text-center text-[11px]">{f.display_name}</span>
            </button>
          </li>
        ))}
      </ul>
    </Box>
  );
}

function Communities({ id, open, hidden }: { id: string; open: Open; hidden?: boolean }) {
  const list = useLoad(() => communitiesOf(id), [id]);
  const n = list.data?.length ?? 0;
  return (
    <Box title={list.data ? plural(n, "comunidade", "comunidades") : "Comunidades"} action={hidden && <OnlyYou />}>
      {!list.data && <Skeleton className="h-28 rounded-xl" />}
      {list.data?.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma comunidade ainda.</p>}
      <ul className="grid grid-cols-3 gap-2">
        {list.data?.slice(0, 9).map((c) => (
          <li key={c.id}>
            <button onClick={() => open({ kind: "community", id: c.id })} className="flex w-full flex-col items-center gap-1 rounded-xl p-1 hover:bg-secondary">
              <CommunityPhoto c={c} size={56} />
              <span className="line-clamp-2 w-full text-center text-[11px] leading-tight">{c.name}</span>
            </button>
          </li>
        ))}
      </ul>
    </Box>
  );
}
