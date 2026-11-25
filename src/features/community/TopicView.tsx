import { Lock, Pin, Trash2 } from "lucide-react";
import { Skeleton } from "@/components/motion";
import { Button } from "@/components/ui/button";
import { ago } from "@/lib/format";
import { deletePost, deleteTopic, members, postsOf, reply, setTopicFlags, topic as loadTopic, type Mini } from "./api";
import { Avatar, Box, Composer, PersonLink, ReportButton, useAction, useLoad, type Open } from "./ui";

/** Um tópico do fórum com as respostas, em ordem. */
export function TopicView({ id, me, open, back }: { id: string; me: string; open: Open; back: () => void }) {
  const t = useLoad(() => loadTopic(id), [id]);
  const posts = useLoad(() => postsOf(id), [id]);
  const roles = useLoad(async () => {
    const community = t.data?.community_id;
    return community ? members(community) : [];
  }, [t.data?.community_id]);
  const { busy, act } = useAction();

  if (t.error) return <p className="text-sm text-destructive">{t.error}</p>;
  if (!t.data) return <Skeleton className="h-80 rounded-2xl" />;
  const topic = t.data;
  const role = roles.data?.find((m) => m.user.id === me)?.role;
  const mod = role === "owner" || role === "mod";
  const member = !!role;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <article className="space-y-3 rounded-2xl border border-border bg-card p-5 shadow-soft">
        <div className="flex items-center gap-2">
          {topic.pinned && <Pin className="size-4 text-primary" />}
          {topic.locked && <Lock className="size-4 text-muted-foreground" />}
          <h2 className="text-lg font-semibold">{topic.title}</h2>
        </div>
        <Message author={topic.author} at={topic.created_at} body={topic.body} open={open} />
        <div className="flex flex-wrap gap-1">
          <Button variant="link" size="xs" onClick={() => open({ kind: "community", id: topic.community_id })}>
            Ver a comunidade
          </Button>
          {mod && (
            <>
              <Button variant="ghost" size="xs" disabled={busy} onClick={() => void act(() => setTopicFlags(id, { pinned: !topic.pinned })).then((ok) => ok && t.reload())}>
                <Pin /> {topic.pinned ? "Desafixar" : "Fixar"}
              </Button>
              <Button variant="ghost" size="xs" disabled={busy} onClick={() => void act(() => setTopicFlags(id, { locked: !topic.locked })).then((ok) => ok && t.reload())}>
                <Lock /> {topic.locked ? "Reabrir" : "Trancar"}
              </Button>
            </>
          )}
          {(mod || topic.author_id === me) && (
            <Button
              variant="ghost"
              size="xs"
              className="text-destructive"
              disabled={busy}
              onClick={() => {
                if (window.confirm("Apagar este tópico com todas as respostas?")) void act(() => deleteTopic(id), "Tópico apagado").then((ok) => ok && back());
              }}
            >
              <Trash2 /> Apagar tópico
            </Button>
          )}
          {topic.author_id !== me && <ReportButton kind="topic" target={id} />}
        </div>
      </article>

      <Box title="Respostas" count={posts.data?.length}>
        {posts.error && <p className="text-sm text-destructive">{posts.error}</p>}
        <ul className="space-y-3">
          {posts.data?.map((p) => (
            <li key={p.id} className="space-y-1 rounded-xl bg-secondary/60 p-3">
              <Message author={p.author} at={p.created_at} body={p.body} open={open} />
              <div className="flex flex-wrap gap-1">
                {(mod || p.author_id === me) && (
                  <Button variant="ghost" size="xs" className="text-muted-foreground" onClick={() => void act(() => deletePost(p.id)).then((ok) => ok && posts.reload())}>
                    <Trash2 /> Apagar
                  </Button>
                )}
                {p.author_id !== me && <ReportButton kind="post" target={p.id} />}
              </div>
            </li>
          ))}
        </ul>
        {topic.locked ? (
          <p className="text-sm text-muted-foreground">Tópico trancado pela moderação.</p>
        ) : member ? (
          <Composer
            placeholder="Escreva sua resposta…"
            max={5000}
            label="Responder"
            onSend={(text) =>
              act(() => reply(id, text)).then((ok) => {
                if (ok) {
                  posts.reload();
                  t.reload();
                }
                return ok;
              })
            }
          />
        ) : (
          <p className="text-sm text-muted-foreground">Participe da comunidade para responder.</p>
        )}
      </Box>
    </div>
  );
}

function Message({ author, at, body, open }: { author: Mini; at: string; body: string; open: Open }) {
  return (
    <div className="flex gap-3">
      <Avatar avatar={author.avatar} scale={2} className="size-10" />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm">
          <PersonLink p={author} open={open} /> <span className="text-xs text-muted-foreground">@{author.handle} · {ago(at)}</span>
        </p>
        <p className="text-sm break-words whitespace-pre-wrap">{body}</p>
      </div>
    </div>
  );
}
