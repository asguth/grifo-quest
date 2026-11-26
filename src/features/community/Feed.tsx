import { useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { BookOpenCheck, ChartBar, Plus, ChevronDown, ChevronUp, CircleCheck, Feather, HelpCircle, MessageCircle, PlusCircle, Sparkles, Target, Trash2 } from "lucide-react";
import { Skeleton } from "@/components/motion";
import { TierBadge } from "@/components/TierBadge";
import { toastError } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  pollResult,
  votePoll,
  deleteItem,
  giveFeather,
  markSolved,
  myFeathers,
  publish,
  takeFeather,
  type Community,
  type DailyQuestion,
  type DailyResult,
  type FeedComment,
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
  const [options, setOptions] = useState(["", ""]);
  const { busy, act } = useAction();
  const first = me.display_name.split(" ")[0] ?? "";
  const filled = options.map((o) => o.trim()).filter(Boolean);
  const ready = !!text.trim() && (kind !== "poll" || filled.length >= 2);

  if (!expanded) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 shadow-soft">
        <PersonPhoto p={me} size={40} />
        <button onClick={() => setExpanded(true)} className="flex-1 rounded-full bg-secondary/70 px-4 py-2.5 text-left text-sm text-muted-foreground hover:bg-secondary">
          O que você está estudando, {first}?
        </button>
        <Button
          variant="ghost"
          size="sm"
          title="Criar uma enquete"
          onClick={() => {
            setKind("poll");
            setExpanded(true);
          }}
        >
          <ChartBar /> Enquete
        </Button>
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
          created = await publish(kind === "poll" ? { kind, body: text.trim(), data: { options: filled } } : { kind, body: text.trim() });
        }).then((ok) => {
          if (ok && created) {
            setText("");
            setOptions(["", ""]);
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
          placeholder={
            kind === "question"
              ? "Qual é a sua dúvida? Dê contexto: matéria, banca, artigo…"
              : kind === "poll"
                ? "Qual é a pergunta da enquete? Ex.: Qual matéria vocês acham mais difícil?"
                : "Compartilhe uma dica, conquista ou material…"
          }
          className={cn("flex-1 border-0 bg-secondary/50 shadow-none focus-visible:ring-1", kind === "poll" ? "min-h-16" : "min-h-24")}
        />
      </div>
      {kind === "poll" && (
        <div className="space-y-2 pl-[52px]">
          {options.map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-secondary text-xs font-semibold">{i + 1}</span>
              <Input
                value={o}
                maxLength={80}
                placeholder={`Opção ${i + 1}`}
                onChange={(e) => setOptions(options.map((x, j) => (j === i ? e.target.value : x)))}
                className="h-9"
              />
              {options.length > 2 && (
                <button type="button" aria-label={`Tirar a opção ${i + 1}`} className="text-muted-foreground hover:text-destructive" onClick={() => setOptions(options.filter((_, j) => j !== i))}>
                  <Trash2 className="size-4" />
                </button>
              )}
            </div>
          ))}
          {options.length < 6 && (
            <Button type="button" variant="ghost" size="sm" onClick={() => setOptions([...options, ""])}>
              <Plus /> Adicionar opção
            </Button>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 pl-[52px]">
        <div role="tablist" className="flex gap-1 rounded-lg bg-secondary p-0.5">
          {(
            [
              ["post", "Post"],
              ["question", "Dúvida"],
              ["poll", "Enquete"],
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
          <Button type="submit" size="sm" disabled={busy || !ready}>
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
    <motion.article initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-soft">
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

      {item.kind === "activity" ? <ActivityBody item={item} /> : <p className={cn("break-words whitespace-pre-wrap", item.kind === "poll" ? "font-medium" : "text-sm")}>{item.body}</p>}
      {item.kind === "poll" && <PollBody item={item} />}

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

      <AnimatePresence initial={false}>
        {showComments && (
          <motion.div
            key="comments"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }}
            className="overflow-hidden"
          >
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
          </motion.div>
        )}
      </AnimatePresence>
    </motion.article>
  );
}

/** Enquete: vota com um clique; depois mostra as barras com a porcentagem (dá para trocar o voto). */
function PollBody({ item }: { item: FeedItem }) {
  const options = item.data.options ?? [];
  const result = useLoad(() => pollResult(item.id), [item.id]);
  const [busy, setBusy] = useState(false);
  const r = result.data;
  const votes = r?.votes ?? options.map(() => 0);
  const total = votes.reduce((a, b) => a + b, 0);
  const mine = r?.mine ?? null;
  const voted = mine !== null;
  const top = Math.max(0, ...votes);

  const vote = (i: number) => {
    if (busy) return;
    const next = mine === i ? null : i;
    // otimista: o placar anda na hora
    const before = r;
    const changed = votes.map((v, j) => v + (j === next ? 1 : 0) - (j === mine ? 1 : 0));
    result.setData({ votes: changed, mine: next });
    setBusy(true);
    votePoll(item.id, next, mine !== null)
      .catch((e) => {
        result.setData(before);
        toastError(e);
      })
      .finally(() => setBusy(false));
  };

  return (
    <div className="space-y-1.5">
      {options.map((o, i) => {
        const n = votes[i] ?? 0;
        const share = total ? n / total : 0;
        const leading = voted && n === top && n > 0;
        return (
          <button
            key={i}
            type="button"
            disabled={busy}
            onClick={() => vote(i)}
            className={cn(
              "relative w-full overflow-hidden rounded-xl border px-3 py-2.5 text-left text-sm transition-colors",
              mine === i ? "border-primary" : "border-border hover:border-primary/50",
            )}
          >
            {voted && (
              <motion.span
                className={cn("absolute inset-y-0 left-0", leading ? "bg-primary/20" : "bg-secondary")}
                initial={{ width: 0 }}
                animate={{ width: `${Math.round(share * 100)}%` }}
                transition={{ duration: 0.5, ease: "easeOut" }}
              />
            )}
            <span className="relative flex items-center gap-2">
              {voted ? (
                mine === i ? <CircleCheck className="size-4 shrink-0 text-primary" /> : <span className="size-4 shrink-0" />
              ) : (
                <span className="size-4 shrink-0 rounded-full border-2 border-muted-foreground/50" />
              )}
              <span className={cn("flex-1", leading && "font-semibold")}>{o}</span>
              {voted && <span className="tabular text-xs font-medium">{Math.round(share * 100)}%</span>}
            </span>
          </button>
        );
      })}
      <p className="text-xs text-muted-foreground">
        {plural(total, "voto", "votos")}
        {voted ? " · toque de novo para tirar ou escolha outra para trocar" : " · vote para ver o resultado"}
      </p>
    </div>
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

type SortMode = "new" | "old";
type Node = FeedComment & { children: Node[] };

/** Monta a árvore (respostas sob o pai) e ordena cada nível. A melhor resposta da dúvida vem primeiro. */
function threadOf(list: FeedComment[], sort: SortMode, accepted: string | null): Node[] {
  const byId = new Map<string, Node>(list.map((c) => [c.id, { ...c, children: [] }]));
  const roots: Node[] = [];
  for (const n of byId.values()) {
    const parent = n.parent_id ? byId.get(n.parent_id) : undefined;
    (parent ? parent.children : roots).push(n);
  }
  const cmp = (a: Node, b: Node) => {
    if (a.id === accepted || b.id === accepted) return Number(b.id === accepted) - Number(a.id === accepted);
    return sort === "new" ? b.created_at.localeCompare(a.created_at) : a.created_at.localeCompare(b.created_at);
  };
  const order = (ns: Node[]) => {
    ns.sort(cmp);
    ns.forEach((n) => order(n.children));
  };
  order(roots);
  return roots;
}

function countAll(ns: Node[]): number {
  return ns.reduce((n, c) => n + 1 + countAll(c.children), 0);
}

/** Respostas mais fundas que isso viram "continuar o fio" (não espremem a tela). */
const MAX_DEPTH = 5;

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
  const [sort, setSort] = useState<SortMode>("old");
  const [writing, setWriting] = useState(false);
  const { act } = useAction();
  const reload = () => {
    commentsOf(item.id).then((c) => {
      list.setData(c);
      onCount(c.length);
    }, toastError);
  };
  const tree = threadOf(list.data ?? [], sort, accepted);
  const ctx: ThreadCtx = {
    me,
    open,
    item,
    accepted,
    canAccept,
    onAccept,
    reply: (parent, text) => act(() => comment(item.id, text, parent)).then((ok) => (ok && reload(), ok)),
    remove: (id) => void act(() => deleteComment(id)).then((ok) => ok && reload()),
  };

  return (
    <div className="space-y-3 border-t border-border pt-3">
      {writing ? (
        <div className="rounded-xl border border-border bg-background/40 p-2 focus-within:border-primary/60">
          <Composer
            compact
            autoFocus
            placeholder={item.kind === "question" ? "Responder a dúvida…" : "No que você está pensando?"}
            max={1000}
            label="Comentar"
            onCancel={() => setWriting(false)}
            onSend={(t) => ctx.reply(null, t).then((ok) => (ok && setWriting(false), ok))}
          />
        </div>
      ) : (
        <button
          onClick={() => setWriting(true)}
          className="w-full rounded-full border border-border bg-background/40 px-4 py-2 text-left text-sm text-muted-foreground transition-colors hover:border-primary/50"
        >
          {item.kind === "question" ? "Responder a dúvida…" : "Adicione um comentário"}
        </button>
      )}

      {(list.data?.length ?? 0) > 1 && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <span>Ordenar:</span>
          {(
            [
              ["new", "Mais novos"],
              ["old", "Mais antigos"],
            ] as const
          ).map(([id, label]) => (
            <button key={id} onClick={() => setSort(id)} className={cn("rounded-full px-2 py-0.5", sort === id ? "bg-secondary font-medium text-foreground" : "hover:text-foreground")}>
              {label}
            </button>
          ))}
        </div>
      )}

      {list.error && <p className="text-sm text-destructive">{list.error}</p>}
      <div className="space-y-1">
        {tree.map((n) => (
          <Thread key={n.id} node={n} depth={0} ctx={ctx} />
        ))}
      </div>
    </div>
  );
}

type ThreadCtx = {
  me: string;
  open: Open;
  item: FeedItem;
  accepted: string | null;
  canAccept: boolean;
  onAccept: (id: string | null) => void;
  reply: (parent: string | null, text: string) => Promise<boolean>;
  remove: (id: string) => void;
};

/** Um comentário com as respostas embaixo; a linha à esquerda recolhe o fio inteiro. */
function Thread({ node: c, depth, ctx }: { node: Node; depth: number; ctx: ThreadCtx }) {
  const [collapsed, setCollapsed] = useState(false);
  const [replying, setReplying] = useState(false);
  const [deep, setDeep] = useState(false);
  const best = c.id === ctx.accepted;
  const hidden = countAll(c.children);

  if (collapsed) {
    return (
      <button onClick={() => setCollapsed(false)} className="flex w-full items-center gap-2 rounded-lg px-1 py-1.5 text-left text-xs text-muted-foreground hover:bg-secondary/50">
        <PlusCircle className="size-4 shrink-0" />
        <PersonPhoto p={c.author} size={20} />
        <span className="font-medium text-foreground">{c.author.display_name}</span>
        <span>· {ago(c.created_at)}</span>
        {hidden > 0 && <span>· {plural(hidden + 1, "comentário", "comentários")} recolhidos</span>}
      </button>
    );
  }

  return (
    <div className="flex gap-2">
      <div className="flex flex-col items-center">
        <button onClick={() => ctx.open({ kind: "profile", id: c.author.id })} aria-label={c.author.display_name}>
          <PersonPhoto p={c.author} size={28} />
        </button>
        {/* linha do fio: clicar recolhe */}
        <button onClick={() => setCollapsed(true)} aria-label="Recolher o fio" title="Recolher" className="group mt-1 flex w-4 flex-1 justify-center">
          <span className="w-px flex-1 bg-border transition-colors group-hover:w-0.5 group-hover:bg-primary" />
        </button>
      </div>
      <div className="min-w-0 flex-1 pb-2">
        <div className={cn("rounded-xl", best && "bg-success/10 px-2 py-1 ring-1 ring-success/40")}>
          <p className="flex flex-wrap items-center gap-x-1.5 text-xs">
            <PersonLink p={c.author} open={ctx.open} />
            {c.author_id === ctx.item.author_id && <span className="rounded bg-primary/15 px-1 text-[10px] font-semibold text-primary">autor</span>}
            <span className="text-muted-foreground">· {ago(c.created_at)}</span>
            {best && <span className="font-medium text-success">· ✓ melhor resposta</span>}
          </p>
          <p className="mt-0.5 text-sm break-words whitespace-pre-wrap">{c.body}</p>
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-0.5 text-xs text-muted-foreground">
          <button className="flex items-center gap-1 rounded-full px-2 py-1 font-medium hover:bg-secondary hover:text-foreground" onClick={() => setReplying((r) => !r)}>
            <MessageCircle className="size-3.5" /> Responder
          </button>
          {ctx.canAccept && c.author_id !== ctx.me && (
            <button className="flex items-center gap-1 rounded-full px-2 py-1 hover:bg-secondary hover:text-success" onClick={() => ctx.onAccept(best ? null : c.id)}>
              <CircleCheck className="size-3.5" /> {best ? "Desmarcar" : "Melhor resposta"}
            </button>
          )}
          {(c.author_id === ctx.me || ctx.item.author_id === ctx.me) && (
            <button
              className="flex items-center gap-1 rounded-full px-2 py-1 hover:bg-secondary hover:text-destructive"
              onClick={() => {
                if (window.confirm(hidden ? "Apagar o comentário e as respostas dele?" : "Apagar o comentário?")) ctx.remove(c.id);
              }}
            >
              <Trash2 className="size-3.5" /> Apagar
            </button>
          )}
        </div>
        {replying && (
          <div className="mt-2 rounded-xl border border-border bg-background/40 p-2 focus-within:border-primary/60">
            <Composer
              compact
              autoFocus
              placeholder={`Responder a ${c.author.display_name.split(" ")[0]}…`}
              max={1000}
              label="Responder"
              onCancel={() => setReplying(false)}
              onSend={(t) => ctx.reply(c.id, t).then((ok) => (ok && setReplying(false), ok))}
            />
          </div>
        )}
        {c.children.length > 0 &&
          (depth + 1 >= MAX_DEPTH && !deep ? (
            <button onClick={() => setDeep(true)} className="mt-1 text-xs font-medium text-primary hover:underline">
              Continuar o fio ({plural(hidden, "resposta", "respostas")}) →
            </button>
          ) : (
            <div className="mt-2 space-y-1">
              {c.children.map((n) => (
                <Thread key={n.id} node={n} depth={depth + 1} ctx={ctx} />
              ))}
            </div>
          ))}
      </div>
    </div>
  );
}

// ---- questão do dia ------------------------------------------------------------------------

/** Alvo da questão do dia; pulsa enquanto há questão sem resposta. */
function PulseTarget({ on }: { on: boolean }) {
  return (
    <span className="relative grid size-9 shrink-0 place-items-center">
      {on && <span className="absolute inset-0 animate-ping rounded-full bg-primary/40" />}
      <span className={cn("relative grid size-9 place-items-center rounded-full", on ? "bg-primary/20" : "bg-secondary")}>
        <Target className={cn("size-5", on ? "text-primary" : "text-muted-foreground")} />
      </span>
    </span>
  );
}

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
  const [expanded, setExpanded] = useState(false);
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
  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        aria-expanded={false}
        className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-left shadow-soft transition-colors hover:border-primary/50"
      >
        <PulseTarget on={!r} />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{title ?? "Questão do dia"}</span>
          <span className="block truncate text-xs text-muted-foreground">{r ? (r.choice === r.answer ? "Você acertou hoje ✓" : "Respondida. Veja o gabarito") : "Nova questão esperando sua resposta"}</span>
        </span>
        <ChevronDown className="size-4 text-muted-foreground" />
      </button>
    );
  }
  return (
    <Box
      title={title ?? "Questão do dia"}
      action={
        <button onClick={() => setExpanded(false)} aria-label="Minimizar a questão do dia" className="text-muted-foreground hover:text-foreground">
          <ChevronUp className="size-4" />
        </button>
      }
    >
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
