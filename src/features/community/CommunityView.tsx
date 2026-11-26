import { useState } from "react";
import { CalendarDays, Crown, Lock, LogIn, LogOut, MessageSquare, Pencil, Pin, Plus, ScrollText, Shield, ShieldCheck, ShieldOff, Trash2, Users } from "lucide-react";
import { Skeleton } from "@/components/motion";
import { Segmented } from "@/components/Segmented";
import { toastError } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ago, formatDate, plural } from "@/lib/format";
import { toneOf } from "@/lib/image";
import { PersonPhoto } from "@/components/PersonPhoto";
import { cn } from "@/lib/utils";
import {
  CATEGORIES,
  community as loadCommunity,
  createTopic,
  dailyQuestion,
  deleteCommunity,
  joinCommunity,
  leaveCommunity,
  members as loadMembers,
  setCommunityCover,
  setCommunityPhoto,
  setMemberRole,
  topicsOf,
  updateCommunity,
  type Community,
  type Member,
} from "./api";
import { DailyQuestionCard } from "./Feed";
import { Box, CommunityPhoto, PersonLink, PhotoButton, ReportButton, useAction, useLoad, type Open } from "./ui";

type Section = "forum" | "membros";

/** Página de uma comunidade (funciona como fórum): capa, sobre e regras, questão do dia, tópicos e membros. */
export function CommunityView({ id, me, open, back }: { id: string; me: string; open: Open; back: () => void }) {
  const c = useLoad(() => loadCommunity(id), [id]);
  const m = useLoad(() => loadMembers(id), [id]);
  const daily = useLoad(() => dailyQuestion(id), [id]);
  const { busy, act } = useAction();
  const [section, setSection] = useState<Section>("forum");
  const [uploading, setUploading] = useState<"photo" | "cover" | null>(null);
  const [editing, setEditing] = useState(false);

  if (c.error) return <p className="text-sm text-destructive">{c.error}</p>;
  if (!c.data) return <Skeleton className="h-80 rounded-2xl" />;
  const info = c.data;
  const mine = m.data?.find((x) => x.user.id === me);
  const owner = info.owner_id === me;
  const mod = mine?.role === "owner" || mine?.role === "mod";
  const mods = m.data?.filter((x) => x.role !== "member") ?? [];
  const hue = toneOf(info.id);
  const reloadAll = () => {
    c.reload();
    m.reload();
  };
  const upload = (kind: "photo" | "cover", f: File) => {
    setUploading(kind);
    (kind === "photo" ? setCommunityPhoto(id, f) : setCommunityCover(id, f))
      .then(() => c.reload(), toastError)
      .finally(() => setUploading(null));
  };

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
        <div
          className="relative h-36 bg-cover bg-center sm:h-48"
          style={
            info.cover_url
              ? { backgroundImage: `url("${info.cover_url}")` }
              : { background: `linear-gradient(120deg, oklch(0.62 0.13 ${hue}), oklch(0.45 0.12 ${(hue + 50) % 360}))` }
          }
        >
          {mod && (
            <div className="absolute right-3 bottom-3">
              <PhotoButton shape="cover" label="Trocar capa" busy={uploading === "cover"} onPick={(f) => upload("cover", f)} className="bg-card/80 backdrop-blur" />
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-end gap-4 px-5 pb-5">
          <CommunityPhoto c={info} size={112} className="relative z-10 -mt-14 rounded-2xl ring-4 ring-card" />
          <div className="min-w-0 flex-1 space-y-1 pt-2">
            <span className="inline-block rounded-full bg-primary/15 px-2.5 py-0.5 text-[11px] font-medium tracking-wide text-primary uppercase">{CATEGORIES[info.category]}</span>
            <h2 className="truncate text-2xl font-semibold">{info.name}</h2>
            <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Users className="size-4" /> {plural(info.member_count, "membro", "membros")}
              </span>
              <span className="flex items-center gap-1.5">
                <Shield className="size-4" /> {plural(mods.length, "moderador", "moderadores")}
              </span>
              <span className="flex items-center gap-1.5">
                <CalendarDays className="size-4" /> desde {formatDate(info.created_at)}
              </span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!mine && m.data && (
              <Button disabled={busy} onClick={() => void act(() => joinCommunity(id), "Você entrou na comunidade").then((ok) => ok && reloadAll())}>
                <LogIn /> Participar
              </Button>
            )}
            {mine && (
              <span className="rounded-full bg-success/15 px-3 py-1 text-xs font-medium text-success">
                {mine.role === "owner" ? "Você é o dono" : mine.role === "mod" ? "Você modera" : "Você participa"}
              </span>
            )}
            {mod && <PhotoButton label="Foto da comunidade" busy={uploading === "photo"} onPick={(f) => upload("photo", f)} />}
            {mod && (
              <Button variant="outline" size="sm" onClick={() => setEditing((e) => !e)}>
                <Pencil /> Editar
              </Button>
            )}
            {mine && !owner && (
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => void act(() => leaveCommunity(id), "Você saiu da comunidade").then((ok) => ok && reloadAll())}>
                <LogOut /> Sair
              </Button>
            )}
            {owner && (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive"
                disabled={busy}
                onClick={() => {
                  if (window.confirm(`Apagar a comunidade "${info.name}" com todo o conteúdo? Não dá para desfazer.`)) {
                    void act(() => deleteCommunity(id), "Comunidade apagada").then((ok) => ok && back());
                  }
                }}
              >
                <Trash2 /> Apagar
              </Button>
            )}
            {!owner && <ReportButton kind="community" target={id} />}
          </div>
        </div>
      </section>

      {editing && (
        <EditCommunity
          c={info}
          onDone={(saved) => {
            setEditing(false);
            if (saved) c.reload();
          }}
        />
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,300px)]">
        <div className="min-w-0 space-y-4">
          {(daily.data || mine) && <DailyQuestionCard question={daily.data ?? null} community={info} canCreate={!!mine} onCreated={(q) => daily.setData(q)} />}

          <Segmented
            label="Seções da comunidade"
            value={section}
            onChange={setSection}
            options={[
              ["forum", "Fórum"],
              ["membros", `Membros (${info.member_count})`],
            ]}
          />

          {section === "forum" && <Forum id={id} member={!!mine} open={open} />}
          {section === "membros" && <Members id={id} me={me} list={m.data} viewerMod={mod} viewerOwner={owner} open={open} reload={m.reload} />}
        </div>

        <aside className="space-y-4">
          <Box title="Sobre">
            {info.description ? (
              <p className="text-sm whitespace-pre-wrap text-muted-foreground">{info.description}</p>
            ) : (
              <p className="text-sm text-muted-foreground">{mod ? "Sem descrição ainda. Use Editar para contar do que se trata." : "Sem descrição."}</p>
            )}
          </Box>
          {(info.rules || mod) && (
            <Box title="Regras" action={<ScrollText className="size-4 text-primary" />}>
              {info.rules ? (
                <ol className="list-inside list-decimal space-y-1 text-sm text-muted-foreground">
                  {info.rules
                    .split("\n")
                    .map((r) => r.replace(/^\s*\d+[.)-]\s*/, "").trim())
                    .filter(Boolean)
                    .map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                </ol>
              ) : (
                <p className="text-sm text-muted-foreground">Nenhuma regra ainda. Moderadores podem escrever em Editar.</p>
              )}
            </Box>
          )}
          <Box title="Moderação" count={mods.length}>
            <ul className="space-y-2">
              {mods.map((x) => (
                <li key={x.user.id} className="flex items-center gap-3 text-sm">
                  <RolePhoto m={x} size={36} />
                  <span className="min-w-0 flex-1">
                    <PersonLink p={x.user} open={open} className="block truncate text-left" />
                    <span className={cn("block text-xs", x.role === "owner" ? "text-red-400" : "text-blue-400")}>{ROLE_LABEL[x.role]}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Box>
        </aside>
      </div>
    </div>
  );
}

/** Descrição e regras (dono ou moderador). */
function EditCommunity({ c, onDone }: { c: Community; onDone: (saved: boolean) => void }) {
  const [description, setDescription] = useState(c.description);
  const [rules, setRules] = useState(c.rules ?? "");
  const { busy, act } = useAction();
  return (
    <Box title="Editar comunidade">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void act(() => updateCommunity(c.id, { description: description.trim(), rules: rules.trim() }), "Comunidade atualizada").then((ok) => ok && onDone(true));
        }}
      >
        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="community-desc">
            Sobre
          </label>
          <Textarea id="community-desc" value={description} maxLength={1000} onChange={(e) => setDescription(e.target.value)} className="min-h-24" placeholder="Do que se trata, para quem é, o que se compartilha aqui…" />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="community-rules">
            Regras <span className="font-normal text-muted-foreground">(uma por linha)</span>
          </label>
          <Textarea
            id="community-rules"
            value={rules}
            maxLength={2000}
            onChange={(e) => setRules(e.target.value)}
            className="min-h-24"
            placeholder={"Respeito sempre\nSem spam ou venda de material\nDúvida? Diga a matéria no título"}
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => onDone(false)}>
            Cancelar
          </Button>
          <Button type="submit" disabled={busy}>
            Salvar
          </Button>
        </div>
      </form>
    </Box>
  );
}

const ROLE_LABEL: Record<Member["role"], string> = { owner: "Dono", mod: "Moderador", member: "Membro" };
/** Anel da foto: vermelho = dono, azul = moderador. */
const ROLE_RING: Record<Member["role"], string> = {
  owner: "bg-gradient-to-br from-red-500 via-rose-500 to-orange-400",
  mod: "bg-gradient-to-br from-sky-400 via-blue-500 to-indigo-500",
  member: "bg-border",
};

/** Foto redonda com anel do papel e selo (coroa / escudo). */
function RolePhoto({ m, size = 72 }: { m: Member; size?: number }) {
  return (
    <span className="relative inline-block">
      <span className={cn("block rounded-full p-[3px]", ROLE_RING[m.role], m.role !== "member" && "shadow-lift")}>
        <PersonPhoto p={m.user} size={size} className="ring-2 ring-card" />
      </span>
      {m.role !== "member" && (
        <span
          className={cn(
            "absolute -right-0.5 -bottom-0.5 grid size-6 place-items-center rounded-full text-white ring-2 ring-card",
            m.role === "owner" ? "bg-red-500" : "bg-blue-500",
          )}
          title={ROLE_LABEL[m.role]}
        >
          {m.role === "owner" ? <Crown className="size-3.5" /> : <ShieldCheck className="size-3.5" />}
        </span>
      )}
    </span>
  );
}

/** Membros em cartões com foto; moderador promove membro e o dono tira da moderação. */
function Members({
  id,
  me,
  list,
  viewerMod,
  viewerOwner,
  open,
  reload,
}: {
  id: string;
  me: string;
  list: Member[] | null;
  viewerMod: boolean;
  viewerOwner: boolean;
  open: Open;
  reload: () => void;
}) {
  const { busy, act } = useAction();
  const [q, setQ] = useState("");
  if (!list) return <Skeleton className="h-40 rounded-2xl" />;
  const order = { owner: 0, mod: 1, member: 2 } as const;
  const shown = list
    .filter((x) => !q || x.user.display_name.toLowerCase().includes(q.toLowerCase()) || x.user.handle.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => order[a.role] - order[b.role]);
  const count = (r: Member["role"]) => list.filter((x) => x.role === r).length;
  return (
    <Box title="Membros" count={list.length} action={<Input className="h-8 w-44" placeholder="Procurar…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Procurar membro" />}>
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-red-500" /> Dono
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-blue-500" /> {plural(count("mod"), "moderador", "moderadores")}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-border" /> {plural(count("member"), "membro", "membros")}
        </span>
        {viewerMod && <span className="ml-auto">Moderadores nomeiam moderadores; só o dono tira alguém da moderação.</span>}
      </div>
      {shown.length === 0 && <p className="text-sm text-muted-foreground">Ninguém com esse nome.</p>}
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        {shown.map((x) => (
          <li
            key={x.user.id}
            className={cn(
              "group flex flex-col items-center gap-2 rounded-2xl border p-4 text-center transition-colors",
              x.role === "owner" ? "border-red-500/40 bg-red-500/5" : x.role === "mod" ? "border-blue-500/40 bg-blue-500/5" : "border-border hover:bg-secondary/40",
            )}
          >
            <button onClick={() => open({ kind: "profile", id: x.user.id })} aria-label={`Ver o perfil de ${x.user.display_name}`}>
              <RolePhoto m={x} />
            </button>
            <span className="w-full min-w-0">
              <PersonLink p={x.user} open={open} className="block w-full truncate" />
              <span className="block truncate text-xs text-muted-foreground">@{x.user.handle}</span>
            </span>
            <span
              className={cn(
                "rounded-full px-2.5 py-0.5 text-[11px] font-medium",
                x.role === "owner" ? "bg-red-500/15 text-red-400" : x.role === "mod" ? "bg-blue-500/15 text-blue-400" : "bg-secondary text-muted-foreground",
              )}
            >
              {x.user.id === me ? `${ROLE_LABEL[x.role]} · você` : ROLE_LABEL[x.role]}
            </span>
            {viewerMod && x.role === "member" && (
              <Button size="xs" variant="outline" disabled={busy} onClick={() => void act(() => setMemberRole(id, x.user.id, "mod"), `${x.user.display_name} agora modera`).then((ok) => ok && reload())}>
                <ShieldCheck /> Tornar moderador
              </Button>
            )}
            {x.role === "mod" && (viewerOwner || x.user.id === me) && (
              <Button size="xs" variant="ghost" disabled={busy} onClick={() => void act(() => setMemberRole(id, x.user.id, "member"), "Moderação removida").then((ok) => ok && reload())}>
                <ShieldOff /> {x.user.id === me ? "Deixar de moderar" : "Tirar moderação"}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </Box>
  );
}

function Forum({ id, member, open }: { id: string; member: boolean; open: Open }) {
  const t = useLoad(() => topicsOf(id), [id]);
  const { act } = useAction();
  const [writing, setWriting] = useState(false);
  return (
    <Box
      title="Fórum"
      count={t.data?.length}
      action={
        member && (
          <Button size="sm" variant={writing ? "ghost" : "default"} onClick={() => setWriting(!writing)}>
            <Plus /> {writing ? "Cancelar" : "Novo tópico"}
          </Button>
        )
      }
    >
      {writing && (
        <NewTopic
          onCreate={(title, body) =>
            act(() => createTopic(id, title, body), "Tópico criado").then((ok) => {
              if (ok) {
                setWriting(false);
                t.reload();
              }
              return ok;
            })
          }
        />
      )}
      {!member && <p className="text-sm text-muted-foreground">Participe da comunidade para abrir tópicos e responder.</p>}
      {t.error && <p className="text-sm text-destructive">{t.error}</p>}
      {t.data?.length === 0 && <p className="text-sm text-muted-foreground">Nenhum tópico ainda.</p>}
      <ul className="divide-y divide-border">
        {t.data?.map((topic) => (
          <li key={topic.id}>
            <button onClick={() => open({ kind: "topic", id: topic.id })} className="flex w-full items-center gap-3 rounded-lg px-2 py-3 text-left hover:bg-secondary/60">
              <MessageSquare className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 font-medium">
                  {topic.pinned && <Pin className="size-3.5 text-primary" />}
                  {topic.locked && <Lock className="size-3.5 text-muted-foreground" />}
                  <span className="truncate">{topic.title}</span>
                </span>
                <span className="block text-xs text-muted-foreground">
                  {topic.author.display_name} · {plural(topic.reply_count, "resposta", "respostas")} · {ago(topic.last_post_at)}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Box>
  );
}

function NewTopic({ onCreate }: { onCreate: (title: string, body: string) => Promise<boolean> }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="space-y-2 rounded-xl bg-secondary/60 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        setBusy(true);
        void onCreate(title.trim(), body.trim()).then(() => setBusy(false));
      }}
    >
      <Input value={title} maxLength={120} placeholder="Título do tópico" onChange={(e) => setTitle(e.target.value)} />
      <Textarea value={body} maxLength={5000} placeholder="Escreva sua dúvida, dica ou material…" onChange={(e) => setBody(e.target.value)} className="min-h-28" />
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={busy || title.trim().length < 3 || !body.trim()}>
          Publicar
        </Button>
      </div>
    </form>
  );
}
