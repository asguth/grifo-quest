import { useState } from "react";
import { Lock, LogIn, LogOut, MessageSquare, Pin, Plus, Trash2 } from "lucide-react";
import { Skeleton } from "@/components/motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ago, plural } from "@/lib/format";
import {
  CATEGORIES,
  community as loadCommunity,
  createTopic,
  deleteCommunity,
  joinCommunity,
  leaveCommunity,
  members as loadMembers,
  topicsOf,
} from "./api";
import { Box, PeopleGrid, PersonLink, ReportButton, useAction, useLoad, type Open } from "./ui";

/** Página de uma comunidade: descrição, membros e o fórum de tópicos. */
export function CommunityView({ id, me, open, back }: { id: string; me: string; open: Open; back: () => void }) {
  const c = useLoad(() => loadCommunity(id), [id]);
  const m = useLoad(() => loadMembers(id), [id]);
  const t = useLoad(() => topicsOf(id), [id]);
  const { busy, act } = useAction();
  const [writing, setWriting] = useState(false);

  if (c.error) return <p className="text-sm text-destructive">{c.error}</p>;
  if (!c.data) return <Skeleton className="h-80 rounded-2xl" />;
  const info = c.data;
  const mine = m.data?.find((x) => x.user.id === me);
  const owner = info.owner_id === me;
  const reloadAll = () => {
    c.reload();
    m.reload();
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,280px)]">
      <div className="min-w-0 space-y-4">
        <section className="space-y-2 rounded-2xl border border-border bg-card p-5 shadow-soft">
          <p className="text-xs text-muted-foreground uppercase">{CATEGORIES[info.category]}</p>
          <h2 className="text-xl font-semibold">{info.name}</h2>
          {info.description && <p className="text-sm whitespace-pre-wrap text-muted-foreground">{info.description}</p>}
          <p className="text-sm">{plural(info.member_count, "membro", "membros")}</p>
          <div className="flex flex-wrap gap-2 pt-1">
            {!mine && (
              <Button size="sm" disabled={busy} onClick={() => void act(() => joinCommunity(id), "Você entrou na comunidade").then((ok) => ok && reloadAll())}>
                <LogIn /> Participar
              </Button>
            )}
            {mine && !owner && (
              <Button variant="outline" size="sm" disabled={busy} onClick={() => void act(() => leaveCommunity(id), "Você saiu da comunidade").then((ok) => ok && reloadAll())}>
                <LogOut /> Sair
              </Button>
            )}
            {owner && (
              <Button
                variant="destructive"
                size="sm"
                disabled={busy}
                onClick={() => {
                  if (window.confirm(`Apagar a comunidade "${info.name}" com todos os tópicos? Não dá para desfazer.`)) {
                    void act(() => deleteCommunity(id), "Comunidade apagada").then((ok) => ok && back());
                  }
                }}
              >
                <Trash2 /> Apagar comunidade
              </Button>
            )}
            {!owner && <ReportButton kind="community" target={id} />}
          </div>
        </section>

        <Box
          title="Fórum"
          count={t.data?.length}
          action={
            mine && (
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
          {!mine && <p className="text-sm text-muted-foreground">Participe da comunidade para abrir tópicos e responder.</p>}
          {t.error && <p className="text-sm text-destructive">{t.error}</p>}
          {t.data?.length === 0 && <p className="text-sm text-muted-foreground">Nenhum tópico ainda. Que tal começar a conversa?</p>}
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
      </div>

      <aside className="space-y-4">
        <Box title="Membros" count={info.member_count}>
          {m.data ? <PeopleGrid people={m.data.map((x) => x.user)} open={open} empty="Ninguém ainda." /> : <Skeleton className="h-32 rounded-xl" />}
        </Box>
        {m.data && (
          <Box title="Moderação">
            <ul className="space-y-1 text-sm">
              {m.data
                .filter((x) => x.role !== "member")
                .map((x) => (
                  <li key={x.user.id}>
                    <PersonLink p={x.user} open={open} /> <span className="text-xs text-muted-foreground">{x.role === "owner" ? "dono" : "moderador"}</span>
                  </li>
                ))}
            </ul>
          </Box>
        )}
      </aside>
    </div>
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
