import { useState } from "react";
import { Ban, Check, Pencil, Trash2, UserMinus, UserPlus } from "lucide-react";
import { MascotEmpty } from "@/components/MascotEmpty";
import { Skeleton } from "@/components/motion";
import { Button } from "@/components/ui/button";
import { ago, formatDate } from "@/lib/format";
import {
  acceptFriend,
  approveTestimonial,
  block,
  communitiesOf,
  deleteScrap,
  deleteTestimonial,
  friendsOf,
  friendshipWith,
  profileById,
  removeFriend,
  requestFriend,
  scrapsOf,
  sendScrap,
  testimonialsOf,
  unblock,
  writeTestimonial,
  type Profile,
} from "./api";
import { EditProfile } from "./EditProfile";
import { Avatar, Box, Composer, PeopleGrid, PersonLink, ReportButton, useAction, useLoad, type Open } from "./ui";

/** Perfil estilo Orkut: cartão à esquerda, recados e depoimentos no meio, amigos e comunidades à direita. */
export function ProfileView({ id, me, open, blocked, onBlocksChanged }: { id: string; me: string; open: Open; blocked: Set<string>; onBlocksChanged: () => void }) {
  const self = id === me;
  const profile = useLoad(() => profileById(id), [id]);
  const [editing, setEditing] = useState(false);

  if (profile.error) return <p className="text-sm text-destructive">{profile.error}</p>;
  if (!profile.data) return <Skeleton className="h-80 rounded-2xl" />;
  const p = profile.data;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,240px)_minmax(0,1fr)_minmax(0,260px)]">
      <aside className="space-y-4">
        <section className="space-y-3 rounded-2xl border border-border bg-card p-4 text-center shadow-soft">
          <Avatar avatar={p.avatar} scale={6} className="mx-auto size-32" />
          <div>
            <p className="text-lg font-semibold">{p.display_name}</p>
            <p className="text-sm text-muted-foreground">@{p.handle}</p>
          </div>
          {p.target && <p className="text-sm">🎯 {p.target}</p>}
          {p.bio && <p className="text-left text-sm whitespace-pre-wrap text-muted-foreground">{p.bio}</p>}
          {p.show_stats && (
            <div className="grid grid-cols-3 gap-1 rounded-xl bg-secondary p-2 text-xs">
              <Stat label="nível" value={p.level} />
              <Stat label="XP" value={p.xp} />
              <Stat label="ofensiva" value={p.streak} />
            </div>
          )}
          <p className="text-xs text-muted-foreground">desde {formatDate(p.created_at)}</p>
          {self ? (
            <Button variant="outline" size="sm" className="w-full" onClick={() => setEditing(!editing)}>
              <Pencil /> {editing ? "Fechar edição" : "Editar perfil"}
            </Button>
          ) : (
            <Relationship other={p} blocked={blocked.has(p.id)} onBlocksChanged={onBlocksChanged} />
          )}
        </section>
      </aside>

      <div className="min-w-0 space-y-4">
        {editing && self && (
          <EditProfile
            profile={p}
            onSaved={() => {
              setEditing(false);
              profile.reload();
            }}
          />
        )}
        <Scraps profile={p} me={me} open={open} />
        <Testimonials profile={p} me={me} open={open} />
      </div>

      <aside className="space-y-4">
        <Friends id={p.id} open={open} />
        <Communities id={p.id} open={open} />
      </aside>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="tabular font-semibold">{value.toLocaleString("pt-BR")}</p>
      <p className="text-muted-foreground">{label}</p>
    </div>
  );
}

function Relationship({ other, blocked, onBlocksChanged }: { other: Profile; blocked: boolean; onBlocksChanged: () => void }) {
  const f = useLoad(() => friendshipWith(other.id), [other.id]);
  const { busy, act } = useAction();
  const run = (g: () => Promise<unknown>, done: string) => void act(g, done).then((ok) => ok && f.reload());
  const status = f.data?.status;
  const incoming = f.data?.requester_id === other.id;

  return (
    <div className="space-y-2">
      {!f.data && (
        <Button size="sm" className="w-full" disabled={busy || blocked} onClick={() => run(() => requestFriend(other.id), "Pedido de amizade enviado")}>
          <UserPlus /> Adicionar amigo
        </Button>
      )}
      {status === "pending" && incoming && (
        <Button size="sm" className="w-full" disabled={busy} onClick={() => run(() => acceptFriend(other.id), "Agora vocês são amigos")}>
          <Check /> Aceitar amizade
        </Button>
      )}
      {status === "pending" && !incoming && <p className="text-xs text-muted-foreground">Pedido de amizade enviado.</p>}
      {status === "accepted" && (
        <Button variant="outline" size="sm" className="w-full" disabled={busy} onClick={() => run(() => removeFriend(other.id), "Amizade desfeita")}>
          <UserMinus /> Desfazer amizade
        </Button>
      )}
      <div className="flex flex-wrap justify-center gap-1">
        <Button
          variant="ghost"
          size="xs"
          className="text-muted-foreground"
          disabled={busy}
          onClick={() => void act(() => (blocked ? unblock(other.id) : block(other.id)), blocked ? "Desbloqueado" : "Bloqueado").then((ok) => ok && onBlocksChanged())}
        >
          <Ban /> {blocked ? "Desbloquear" : "Bloquear"}
        </Button>
        <ReportButton kind="profile" target={other.id} />
      </div>
    </div>
  );
}

function Scraps({ profile, me, open }: { profile: Profile; me: string; open: Open }) {
  const list = useLoad(() => scrapsOf(profile.id), [profile.id]);
  const { act } = useAction();
  const self = profile.id === me;
  return (
    <Box title="Recados" count={list.data?.length}>
      <Composer
        placeholder={self ? "Deixe um recado no seu próprio mural…" : `Deixe um recado para ${profile.display_name}…`}
        max={1000}
        label="Enviar recado"
        onSend={(t) => act(() => sendScrap(profile.id, t)).then((ok) => (ok && list.reload(), ok))}
      />
      {list.error && <p className="text-sm text-destructive">{list.error}</p>}
      {list.data?.length === 0 && <p className="text-sm text-muted-foreground">Nenhum recado ainda.</p>}
      <ul className="space-y-2">
        {list.data?.map((s) => (
          <li key={s.id} className="flex gap-3 rounded-xl bg-secondary/60 p-3">
            <Avatar avatar={s.from.avatar} scale={2} className="size-10" />
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-sm">
                <PersonLink p={s.from} open={open} /> <span className="text-xs text-muted-foreground">{ago(s.created_at)}</span>
              </p>
              <p className="text-sm break-words whitespace-pre-wrap">{s.body}</p>
              <div className="flex flex-wrap gap-1">
                {(self || s.from_id === me) && (
                  <Button variant="ghost" size="xs" className="text-muted-foreground" onClick={() => void act(() => deleteScrap(s.id)).then((ok) => ok && list.reload())}>
                    <Trash2 /> Apagar
                  </Button>
                )}
                {s.from_id !== me && <ReportButton kind="scrap" target={s.id} />}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </Box>
  );
}

function Testimonials({ profile, me, open }: { profile: Profile; me: string; open: Open }) {
  const list = useLoad(() => testimonialsOf(profile.id), [profile.id]);
  const { act } = useAction();
  const self = profile.id === me;
  const visible = list.data?.filter((t) => t.approved || self || t.from_id === me) ?? [];
  const already = list.data?.some((t) => t.from_id === me);
  return (
    <Box title="Depoimentos" count={list.data?.filter((t) => t.approved).length}>
      {!self && !already && (
        <Composer
          placeholder={`Escreva um depoimento sobre ${profile.display_name} (aparece depois que a pessoa aprovar)…`}
          max={2000}
          label="Enviar depoimento"
          onSend={(t) => act(() => writeTestimonial(profile.id, t), "Depoimento enviado para aprovação").then((ok) => (ok && list.reload(), ok))}
        />
      )}
      {list.error && <p className="text-sm text-destructive">{list.error}</p>}
      {visible.length === 0 && <p className="text-sm text-muted-foreground">Nenhum depoimento ainda.</p>}
      <ul className="space-y-2">
        {visible.map((t) => (
          <li key={t.id} className="space-y-1 rounded-xl border border-border p-3">
            <p className="text-sm">
              <PersonLink p={t.from} open={open} /> <span className="text-xs text-muted-foreground">{ago(t.created_at)}</span>
              {!t.approved && <span className="ml-2 rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">aguardando aprovação</span>}
            </p>
            <p className="text-sm break-words whitespace-pre-wrap">{t.body}</p>
            <div className="flex flex-wrap gap-1">
              {self && !t.approved && (
                <Button size="xs" onClick={() => void act(() => approveTestimonial(t.id), "Depoimento aprovado").then((ok) => ok && list.reload())}>
                  <Check /> Aprovar
                </Button>
              )}
              {(self || t.from_id === me) && (
                <Button variant="ghost" size="xs" className="text-muted-foreground" onClick={() => void act(() => deleteTestimonial(t.id)).then((ok) => ok && list.reload())}>
                  <Trash2 /> {self && !t.approved ? "Recusar" : "Apagar"}
                </Button>
              )}
              {t.from_id !== me && <ReportButton kind="testimonial" target={t.id} />}
            </div>
          </li>
        ))}
      </ul>
    </Box>
  );
}

function Friends({ id, open }: { id: string; open: Open }) {
  const list = useLoad(() => friendsOf(id), [id]);
  return (
    <Box title="Amigos" count={list.data?.length}>
      {list.data ? <PeopleGrid people={list.data} open={open} empty="Ainda sem amigos." /> : <Skeleton className="h-32 rounded-xl" />}
    </Box>
  );
}

function Communities({ id, open }: { id: string; open: Open }) {
  const list = useLoad(() => communitiesOf(id), [id]);
  if (list.data?.length === 0) {
    return (
      <Box title="Comunidades" count={0}>
        <MascotEmpty scale={3} text="Nenhuma comunidade ainda." className="py-6" />
      </Box>
    );
  }
  return (
    <Box title="Comunidades" count={list.data?.length}>
      <ul className="space-y-1">
        {list.data?.slice(0, 9).map((c) => (
          <li key={c.id}>
            <button onClick={() => open({ kind: "community", id: c.id })} className="w-full truncate rounded-lg px-2 py-1.5 text-left text-sm hover:bg-secondary">
              {c.name} <span className="text-xs text-muted-foreground">({c.member_count})</span>
            </button>
          </li>
        ))}
      </ul>
    </Box>
  );
}
