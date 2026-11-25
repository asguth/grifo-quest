import { useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { BookOpenCheck, CircleCheck, Feather, HelpCircle, MessageCircle, Sparkles, Target, Trash2 } from "lucide-react";
import { Skeleton } from "@/components/motion";
import { TierBadge } from "@/components/TierBadge";
import { toastError } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { commands } from "@/lib/bindings";
import { ago, duration, pct, plural } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  answerDaily,
  comment,
  commentsOf,
  createDaily,
  dailyResult,
  feedItem,
  deleteComment,
  deleteItem,
  giveFeather,
  markSolved,
  myFeathers,
  publish,
  takeFeather,
  type Community,
  type DailyQuestion,
  type DailyResult,
  type FeedItem,
  type FeedKind,
} from "./api";
import { Box, Composer, PersonLink, PersonPhoto, ReportButton, useAction, useLoad, type Open } from "./ui";

// ---- conselho do dia ------------------------------------------------------------------------

const TIPS = [
  "Revisão espaçada vence decoreba. Abra seus flashcards antes do café.",
  "Errou? Ótimo: o caderno de erros é onde a aprovação mora.",
  "Lei seca se lê com lápis na mão: grife prazos, exceções e competências.",
  "Uma hora de foco vale mais que três com o celular do lado.",
  "Questão da banca ensina o jeito de cobrar. Faça antes de ler a teoria inteira.",
  "Dormir bem também é estudar: a memória se organiza à noite.",
  "Simulado cronometrado treina o que nenhum resumo treina: a prova.",
  "Comece pela matéria que você evita. Ela costuma ser a que mais rende ponto.",
  "Explique em voz alta o que estudou. Se travar, achou a lacuna.",
  "Constância > intensidade. Melhor 2 h todo dia que 10 h no domingo.",
  "Pausa de 5 min a cada 25 não é preguiça, é manutenção do cérebro.",
  "Leia o edital de novo: o conteúdo programático é o mapa do tesouro.",
];

export function TipOfTheDay() {
  const day = Math.floor(Date.now() / 86_400_000);
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-4">
      <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
      <div>
        <p className="retro text-[9px] text-primary">Conselho do Grifinho</p>
        <p className="mt-1 text-sm">{TIPS[day % TIPS.length]}</p>
      </div>
    </div>
  );
}

// ---- publicar ------------------------------------------------------------------------------

/** Caixa de publicar no seu mural (os amigos veem): uma linha com a sua foto que abre ao clicar. */
export function PostBox({ me, onPublished }: { me: { id: string; display_name: string; photo_url: string | null }; onPublished: (i: FeedItem) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [kind, setKind] = useState<Exclude<FeedKind, "activity">>("post");
  const [text, setText] = useState("");
  const { busy, act } = useAction();
  const first = me.display_name.split(" ")[0] ?? "";

  if (!expanded) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 shadow-soft">
        <PersonPhoto p={me} size={40} />
        <button onClick={() => setExpanded(true)} className="flex-1 rounded-full bg-secondary/70 px-4 py-2.5 text-left text-sm text-muted-foreground hover:bg-secondary">
          O que você está estudando, {first}?
        </button>
      </div>
    );
  }

  return (
    <form
      className="space-y-3 rounded-2xl border border-primary/40 bg-card p-4 shadow-soft"
      onSubmit={(e) => {
        e.preventDefault();
        let created: FeedItem | null = null;
        void act(async () => {
          created = await publish({ kind, body: text.trim() });
        }).then((ok) => {
          if (ok && created) {
            setText("");
            setExpanded(false);
            onPublished(created);
          }
        });
      }}
    >
      <div className="flex gap-3">
        <PersonPhoto p={me} size={40} />
        <Textarea
          autoFocus
          value={text}
          maxLength={2000}
          onChange={(e) => setText(e.target.value)}
          placeholder={kind === "question" ? "Qual é a sua dúvida? Dê contexto: matéria, banca, artigo…" : "Compartilhe uma dica, conquista ou material…"}
          className="min-h-24 flex-1 border-0 bg-secondary/50 shadow-none focus-visible:ring-1"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2 pl-[52px]">
        <div role="tablist" className="flex gap-1 rounded-lg bg-secondary p-0.5">
          {(
            [
              ["post", "Post"],
              ["question", "Dúvida"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={kind === k}
              onClick={() => setKind(k)}
              className={cn("rounded-md px-3 py-1 text-xs", kind === k ? "bg-card font-medium shadow-soft" : "text-muted-foreground")}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="ml-auto flex gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => setExpanded(false)}>
            Cancelar
          </Button>
          <Button type="submit" size="sm" disabled={busy || !text.trim()}>
            Publicar
          </Button>
        </span>
      </div>
    </form>
  );
}

/** Uma publicação sozinha (aberta por notificação), já com os comentários. */
export function ItemView({ id, me, open, back }: { id: string; me: string; open: Open; back: () => void }) {
  const item = useLoad(async () => {
    const i = await feedItem(id);
    return { i, mine: i ? (await myFeathers([id])).has(id) : false };
  }, [id]);
  if (item.error) return <p className="text-sm text-destructive">{item.error}</p>;
  if (!item.data) return <Skeleton className="h-40 rounded-2xl" />;
  if (!item.data.i) return <p className="text-sm text-muted-foreground">Esta publicação foi apagada.</p>;
  return <FeedCard item={item.data.i} me={me} open={open} feathered={item.data.mine} onDeleted={back} startOpen />;
}

// ---- lista ---------------------------------------------------------------------------------

/** Mural paginado. `load(before)` traz a próxima página (mais antiga). */
export function FeedList({
  load,
  me,
  open,
  top,
  deps,
  empty,
  filter = "all",
}: {
  load: (before?: string) => Promise<FeedItem[]>;
  me: string;
  open: Open;
  top?: (add: (i: FeedItem) => void) => ReactNode;
  deps: unknown[];
  empty: string;
  /** Mostra só um tipo (filtro do mural); a paginação continua trazendo tudo. */
  filter?: FeedKind | "all";
}) {
  const first = useLoad(async () => {
    const items = await load();
    return { items, feathers: await myFeathers(items.map((i) => i.id)), done: items.length < 20 };
  }, deps);
  const [more, setMore] = useState(false);
  const page = first.data;
  const shown = (page?.items ?? []).filter((i) => filter === "all" || i.kind === filter);
  const add = (i: FeedItem) => first.setData((d) => (d ? { ...d, items: [i, ...d.items] } : d));
  const remove = (id: string) => first.setData((d) => (d ? { ...d, items: d.items.filter((x) => x.id !== id) } : d));

  const loadMore = async () => {
    const last = page?.items[page.items.length - 1];
    if (!last) return;
    setMore(true);
    try {
      const items = await load(last.created_at);
      const f = await myFeathers(items.map((i) => i.id));
      first.setData((d) => (d ? { items: [...d.items, ...items], feathers: new Set([...d.feathers, ...f]), done: items.length < 20 } : d));
    } catch (e) {
      toastError(e);
    } finally {
      setMore(false);
    }
  };

  return (
    <div className="space-y-4">
      {top?.(add)}
      {first.error && <p className="text-sm text-destructive">{first.error}</p>}
      {!page && !first.error && (
        <>
          <Skeleton className="h-32 rounded-2xl" />
          <Skeleton className="h-32 rounded-2xl" />
        </>
      )}
      {page && shown.length === 0 && <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">{filter === "all" ? empty : "Nada desse tipo por aqui ainda."}</p>}
      {shown.map((i) => (
        <FeedCard key={i.id} item={i} me={me} open={open} feathered={!!page?.feathers.has(i.id)} onDeleted={() => remove(i.id)} />
      ))}
      {page && !page.done && (
        <Button variant="outline" className="w-full" disabled={more} onClick={() => void loadMore()}>
          {more ? "Carregando…" : "Ver mais"}
        </Button>
      )}
    </div>
  );
}

// ---- card ----------------------------------------------------------------------------------

export function FeedCard({ item, me, open, feathered, onDeleted, startOpen }: { item: FeedItem; me: string; open: Open; feathered: boolean; onDeleted: () => void; startOpen?: boolean }) {
  const [mine, setMine] = useState(feathered);
  const [count, setCount] = useState(item.feather_count);
  const [comments, setComments] = useState(item.comment_count);
  const [showComments, setShowComments] = useState(!!startOpen);
  const [solved, setSolved] = useState({ solved: item.solved, accepted: item.accepted_comment });
  const { act } = useAction();
  const own = item.author_id === me;

  const toggleFeather = () => {
    const next = !mine;
    setMine(next);
    setCount((c) => c + (next ? 1 : -1));
    (next ? giveFeather(item.id) : takeFeather(item.id)).catch((e) => {
      setMine(!next);
      setCount((c) => c + (next ? -1 : 1));
      toastError(e);
    });
  };

  return (
    <motion.article layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-soft">
      <header className="flex items-start gap-3">
        <button onClick={() => open({ kind: "profile", id: item.author.id })}>
          <PersonPhoto p={item.author} size={40} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-sm leading-tight">
            <PersonLink p={item.author} open={open} /> <TierBadge plan={item.author.badge} compact />
            {item.kind === "activity" && <span className="text-muted-foreground"> estudou</span>}
            {item.community && (
              <>
                <span className="text-muted-foreground"> em </span>
                <button className="font-medium hover:text-primary" onClick={() => item.community && open({ kind: "community", id: item.community.id })}>
                  {item.community.name}
                </button>
              </>
            )}
          </p>
          <p className="text-xs text-muted-foreground">{ago(item.created_at)}</p>
        </div>
        {item.kind === "question" && (
          <span className={cn("flex items-center gap-1 rounded-full px-2 py-0.5 text-xs", solved.solved ? "bg-success/15 text-success" : "bg-secondary text-muted-foreground")}>
            {solved.solved ? <CircleCheck className="size-3.5" /> : <HelpCircle className="size-3.5" />}
            {solved.solved ? "Resolvida" : "Dúvida"}
          </span>
        )}
      </header>

      {item.kind === "activity" ? <ActivityBody item={item} /> : <p className="text-sm break-words whitespace-pre-wrap">{item.body}</p>}

      <footer className="flex flex-wrap items-center gap-1 border-t border-border pt-2">
        <Button variant="ghost" size="sm" onClick={toggleFeather} className={cn(mine && "text-primary")} title={mine ? "Tirar a pena" : "Dar uma pena"}>
          <Feather className={cn(mine && "fill-current")} /> {count > 0 ? count : ""} {count === 1 ? "pena" : "penas"}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setShowComments(!showComments)}>
          <MessageCircle /> {comments > 0 ? comments : ""} {item.kind === "question" ? (comments === 1 ? "resposta" : "respostas") : "comentar"}
        </Button>
        <span className="ml-auto flex">
          {own ? (
            <Button
              variant="ghost"
              size="xs"
              className="text-muted-foreground"
              onClick={() => {
                if (window.confirm("Apagar esta publicação?")) void act(() => deleteItem(item.id)).then((ok) => ok && onDeleted());
              }}
            >
              <Trash2 /> Apagar
            </Button>
          ) : (
            <ReportButton kind="feed" target={item.id} />
          )}
        </span>
      </footer>

      {showComments && (
        <Comments
          item={item}
          me={me}
          open={open}
          accepted={solved.accepted}
          canAccept={own && item.kind === "question"}
          onAccept={(c) => {
            const prev = solved;
            setSolved({ solved: c !== null, accepted: c });
            markSolved(item.id, c).catch((e) => {
              setSolved(prev);
              toastError(e);
            });
          }}
          onCount={setComments}
        />
      )}
    </motion.article>
  );
}

function ActivityBody({ item }: { item: FeedItem }) {
  const d = item.data;
  const acc = d.questions ? (d.correct ?? 0) / d.questions : null;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl bg-secondary/60 p-3">
      <BookOpenCheck className="size-5 text-primary" />
      {!!d.minutes && <Pill>{duration(d.minutes)}</Pill>}
      {!!d.questions && <Pill>{plural(d.questions, "questão", "questões")}</Pill>}
      {acc !== null && <Pill tone={acc >= 0.7 ? "good" : undefined}>{pct(acc)} de acerto</Pill>}
      {d.subject && <span className="text-sm text-muted-foreground">em {d.subject}</span>}
      {!!d.xp && <span className="retro ml-auto text-[10px] text-primary">+{d.xp} XP</span>}
    </div>
  );
}

function Pill({ children, tone }: { children: ReactNode; tone?: "good" }) {
  return <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", tone === "good" ? "bg-success/15 text-success" : "bg-card")}>{children}</span>;
}

function Comments({
  item,
  me,
  open,
  accepted,
  canAccept,
  onAccept,
  onCount,
}: {
  item: FeedItem;
  me: string;
  open: Open;
  accepted: string | null;
  canAccept: boolean;
  onAccept: (id: string | null) => void;
  onCount: (n: number) => void;
}) {
  const list = useLoad(() => commentsOf(item.id), [item.id]);
  const { act } = useAction();
  const sorted = [...(list.data ?? [])].sort((a, b) => Number(b.id === accepted) - Number(a.id === accepted));
  const reload = () => {
    commentsOf(item.id).then((c) => {
      list.setData(c);
      onCount(c.length);
    }, toastError);
  };
  return (
    <div className="space-y-3 border-t border-border pt-3">
      {list.error && <p className="text-sm text-destructive">{list.error}</p>}
      {sorted.map((c) => (
        <div key={c.id} className={cn("flex gap-2.5 rounded-xl p-2", c.id === accepted && "bg-success/10 ring-1 ring-success/40")}>
          <PersonPhoto p={c.author} size={30} />
          <div className="min-w-0 flex-1">
            <p className="text-xs">
              <PersonLink p={c.author} open={open} /> <span className="text-muted-foreground">{ago(c.created_at)}</span>
              {c.id === accepted && <span className="ml-2 font-medium text-success">✓ melhor resposta</span>}
            </p>
            <p className="text-sm break-words whitespace-pre-wrap">{c.body}</p>
            <div className="flex gap-1">
              {canAccept && c.author_id !== me && (
                <Button variant="ghost" size="xs" onClick={() => onAccept(c.id === accepted ? null : c.id)}>
                  <CircleCheck /> {c.id === accepted ? "Desmarcar" : "Marcar como resposta"}
                </Button>
              )}
              {(c.author_id === me || item.author_id === me) && (
                <Button variant="ghost" size="xs" className="text-muted-foreground" onClick={() => void act(() => deleteComment(c.id)).then((ok) => ok && reload())}>
                  <Trash2 /> Apagar
                </Button>
              )}
            </div>
          </div>
        </div>
      ))}
      <Composer
        compact
        placeholder={item.kind === "question" ? "Responder a dúvida…" : "Escreva um comentário…"}
        max={1000}
        label="Enviar"
        onSend={(t) => act(() => comment(item.id, t)).then((ok) => (ok && reload(), ok))}
      />
    </div>
  );
}

// ---- questão do dia ------------------------------------------------------------------------

const LETTERS = ["A", "B", "C", "D", "E"];

/** Questão do dia de uma comunidade. Sem questão ainda, quem é membro pode gerar com a própria IA. */
export function DailyQuestionCard({
  question,
  community,
  canCreate,
  onCreated,
  title,
}: {
  question: DailyQuestion | null;
  community?: Pick<Community, "id" | "name" | "description">;
  canCreate?: boolean;
  onCreated?: (q: DailyQuestion) => void;
  title?: string;
}) {
  const result = useLoad(async () => (question ? dailyResult(question.id) : null), [question?.id]);
  const [busy, setBusy] = useState(false);
  const { act } = useAction();

  if (!question) {
    if (!canCreate || !community) return null;
    return (
      <Box title="Questão do dia">
        <p className="text-sm text-muted-foreground">Ninguém gerou a questão de hoje desta comunidade ainda.</p>
        <Button
          size="sm"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void act(async () => {
              const draft = await commands.dailyQuestionDraft(`${community.name}. ${community.description}`);
              const created = await createDaily(community.id, draft);
              if (created) onCreated?.(created);
            }).finally(() => setBusy(false));
          }}
        >
          <Target /> {busy ? "O Grifinho está escrevendo…" : "Gerar a questão de hoje (usa sua IA)"}
        </Button>
      </Box>
    );
  }

  const r: DailyResult | null = result.data ?? null;
  const total = r ? r.votes.reduce((a, b) => a + b, 0) : 0;
  return (
    <Box title={title ?? "Questão do dia"} action={<Target className="size-4 text-primary" />}>
      <p className="text-sm whitespace-pre-wrap">{question.statement}</p>
      <ul className="space-y-1.5">
        {question.options.map((o, i) => {
          const votes = r?.votes[i] ?? 0;
          const share = total ? votes / total : 0;
          const right = r && i === r.answer;
          const wrongPick = r && i === r.choice && i !== r.answer;
          return (
            <li key={i}>
              <button
                disabled={!!r || busy}
                onClick={() => {
                  setBusy(true);
                  answerDaily(question.id, i)
                    .then((res) => result.setData(res), toastError)
                    .finally(() => setBusy(false));
                }}
                className={cn(
                  "relative w-full overflow-hidden rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                  !r && "border-border hover:border-primary/60 hover:bg-secondary/50",
                  right && "border-success/60",
                  wrongPick && "border-destructive/60",
                  r && !right && !wrongPick && "border-border",
                )}
              >
                {r && <span className={cn("absolute inset-y-0 left-0", right ? "bg-success/15" : "bg-secondary")} style={{ width: `${Math.round(share * 100)}%` }} />}
                <span className="relative flex gap-2">
                  <span className="font-semibold">{LETTERS[i]})</span>
                  <span className="flex-1">{o}</span>
                  {r && <span className="tabular text-xs text-muted-foreground">{Math.round(share * 100)}%</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {r && (
        <div className="space-y-1 rounded-xl bg-secondary/60 p-3 text-sm">
          <p className={cn("font-medium", r.choice === r.answer ? "text-success" : "text-destructive")}>
            {r.choice === r.answer ? "Você acertou!" : `Resposta certa: ${LETTERS[r.answer] ?? "?"}`} · {plural(total, "resposta", "respostas")}
          </p>
          {r.explanation && <p className="whitespace-pre-wrap text-muted-foreground">{r.explanation}</p>}
        </div>
      )}
    </Box>
  );
}
