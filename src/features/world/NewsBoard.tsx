import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, CheckCheck, ExternalLink, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { Chip, NativeSelect, SearchInput } from "@/components/fields";
import { Skeleton } from "@/components/motion";
import { toast, toastError } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { commands, type NewsItem } from "@/lib/bindings";
import { ago, feedColor } from "@/lib/format";
import { useWidth } from "@/lib/hooks";
import { masonry } from "./masonry";
import { spring } from "@/lib/motion";
import { NEWS_RELEVANT } from "@/lib/rules";
import { sfx } from "@/lib/sound";
import { cn } from "@/lib/utils";

const TAG_LABEL: Record<string, string> = {
  edital: "Edital",
  inscricoes: "Inscrições",
  prova: "Prova",
  resultado: "Resultado",
  nomeacao: "Nomeação",
  previsto: "Previsto",
  prorrogacao: "Prorrogação",
  outros: "Outros",
};

type Filter = "todas" | "nao_lidas" | "area";

const tagsOf = (n: NewsItem) => (n.tags ? n.tags.split(",").filter(Boolean) : []);
const isMine = (n: NewsItem) => (n.relevance ?? 0) >= NEWS_RELEVANT;

/** Cartões por "página": o resto entra quando a rolagem chega perto do fim. */
const PAGE = 24;
/** Largura mínima de uma coluna do mosaico (px). */
const COLUMN_MIN = 300;

const estimate = (n: NewsItem) => (n.image_url ? 300 : 160) + ((n.summary ?? n.description) ? 60 : 0) + Math.min(n.title.length, 140) * 0.4;

export function NewsBoard() {
  const [items, setItems] = useState<NewsItem[] | null>(null);
  const [filter, setFilter] = useState<Filter>("todas");
  const [tag, setTag] = useState<string | null>(null);
  const [feed, setFeed] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<NewsItem | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const [gridRef, width] = useWidth<HTMLDivElement>();
  const columns = Math.max(1, Math.min(3, Math.floor((width + 16) / (COLUMN_MIN + 16))));
  const sentinel = useRef<HTMLDivElement>(null);

  const load = useCallback(() => void commands.listNews(300).then(setItems, toastError), []);
  useEffect(load, [load]);

  const patch = (id: number, p: Partial<NewsItem>) => setItems((list) => list && list.map((x) => (x.id === id ? { ...x, ...p } : x)));

  async function setRead(n: NewsItem, read: boolean) {
    patch(n.id, { read });
    if (read) sfx("coin");
    await commands.setNewsRead(n.id, read).catch(toastError);
  }

  async function readAll() {
    try {
      await commands.markAllNewsRead();
      sfx("success");
      load();
    } catch (e) {
      toastError(e);
    }
  }

  async function refresh() {
    setRefreshing(true);
    try {
      const n = await commands.refreshNews();
      toast(n > 0 ? `${n} notícias novas. Capas e resumos chegam em segundo plano.` : "Nada novo por enquanto", n > 0 ? "success" : "info");
      load();
    } catch (e) {
      toastError(e);
    } finally {
      setRefreshing(false);
    }
  }

  const feeds = useMemo(() => [...new Set((items ?? []).map((n) => n.feed))], [items]);
  const unread = (items ?? []).filter((n) => !n.read).length;
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (items ?? []).filter(
      (n) =>
        (filter !== "nao_lidas" || !n.read) &&
        (filter !== "area" || isMine(n)) &&
        (!tag || tagsOf(n).includes(tag)) &&
        (!feed || n.feed === feed) &&
        (!needle || `${n.title} ${n.summary ?? ""} ${n.description ?? ""}`.toLowerCase().includes(needle)),
    );
  }, [items, filter, tag, feed, q]);

  // Filtro novo volta para a primeira página.
  useEffect(() => setLimit(PAGE), [filter, tag, feed, q]);

  // Destaque: a primeira não lida com capa (senão, a primeira com capa).
  const featured = shown.find((n) => !n.read && n.image_url) ?? shown.find((n) => n.image_url) ?? null;
  const rest = shown.filter((n) => n !== featured);
  const page = rest.slice(0, limit);
  const cols = useMemo(() => masonry(page, columns, estimate), [page, columns]);

  // Rolou até perto do fim: mais uma página.
  useEffect(() => {
    const el = sentinel.current;
    if (!el || limit >= rest.length) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setLimit((l) => l + PAGE), { rootMargin: "600px" });
    io.observe(el);
    return () => io.disconnect();
  }, [limit, rest.length]);

  if (items === null) {
    return (
      <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
        {[220, 260, 200, 240, 210, 230].map((h, i) => (
          <Skeleton key={i} className="rounded-2xl" style={{ height: h }} />
        ))}
      </div>
    );
  }

  return (
    <section ref={gridRef} className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput value={q} onChange={setQ} placeholder="Buscar nas notícias" className="min-w-56 flex-1" />
        <Button variant="ghost" size="sm" disabled={!unread} onClick={() => void readAll()}>
          <CheckCheck /> Marcar tudo como lido
        </Button>
        <Button variant="secondary" size="sm" disabled={refreshing} onClick={() => void refresh()}>
          <RefreshCw className={cn(refreshing && "animate-spin")} /> Atualizar
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {(
          [
            ["todas", `Todas (${items.length})`],
            ["nao_lidas", `Não lidas (${unread})`],
            ["area", "Da minha área"],
          ] as const
        ).map(([v, label]) => (
          <Chip key={v} on={filter === v} onClick={() => setFilter(v)}>
            {label}
          </Chip>
        ))}
        <span className="mx-1 h-5 w-px bg-border" />
        {Object.entries(TAG_LABEL)
          .filter(([t]) => items.some((n) => tagsOf(n).includes(t)))
          .map(([t, label]) => (
            <Chip key={t} on={tag === t} onClick={() => setTag(tag === t ? null : t)}>
              {label}
            </Chip>
          ))}
        {feeds.length > 1 && (
          <NativeSelect value={feed ?? ""} onChange={(e) => setFeed(e.target.value || null)} className="ml-auto h-8 w-auto max-w-52 rounded-full text-xs" aria-label="Fonte">
            <option value="">Todas as fontes</option>
            {feeds.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </NativeSelect>
        )}
      </div>

      {shown.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          {items.length === 0 ? "Nenhuma notícia ainda. Clique em Atualizar." : "Nada com esses filtros."}
        </p>
      ) : (
        <>
          {featured && <Featured n={featured} onOpen={() => (setOpen(featured), void setRead(featured, true))} />}
          <div className="flex items-start gap-4">
            {cols.map((col, c) => (
              <div key={c} className="min-w-0 flex-1 space-y-4">
                {col.map((n, row) => (
                  <Card
                    key={n.id}
                    n={n}
                    // entrada por linha, só nos primeiros: quem chega rolando já aparece
                    delay={Math.min(row * columns + c, 12) * 0.035}
                    onOpen={() => (setOpen(n), void setRead(n, true))}
                    onToggle={() => void setRead(n, !n.read)}
                  />
                ))}
              </div>
            ))}
          </div>
          {limit < rest.length && <div ref={sentinel} className="h-px" />}
        </>
      )}

      <Reader n={open} onClose={() => setOpen(null)} onUnread={(n) => void setRead(n, false).then(() => setOpen(null))} onUpdate={(n) => (patch(n.id, n), setOpen(n))} />
    </section>
  );
}

/** Capa: imagem da notícia ou, sem imagem (ou quebrada), faixa com a cor da fonte. */
function Cover({ n, className }: { n: NewsItem; className?: string }) {
  const [broken, setBroken] = useState(false);
  if (!n.image_url || broken) {
    return (
      <div className={cn("grid place-items-center text-2xl font-black text-white/80", className)} style={{ background: `linear-gradient(135deg, ${feedColor(n.feed)}, color-mix(in oklch, ${feedColor(n.feed)}, black 35%))` }}>
        {n.feed.slice(0, 2).toUpperCase()}
      </div>
    );
  }
  return <img src={n.image_url} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} className={cn("object-cover", className)} />;
}

function Tags({ n }: { n: NewsItem }) {
  const tags = tagsOf(n);
  if (!tags.length && !isMine(n)) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {isMine(n) && <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">da sua área</span>}
      {tags.map((t) => (
        <span key={t} className="rounded-full bg-secondary px-2 py-0.5 text-[10px]">
          {TAG_LABEL[t] ?? t}
        </span>
      ))}
    </div>
  );
}

function Featured({ n, onOpen }: { n: NewsItem; onOpen: () => void }) {
  return (
    <motion.button
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring.soft}
      whileHover={{ scale: 1.005 }}
      onClick={onOpen}
      className="group relative block h-72 w-full overflow-hidden rounded-3xl text-left shadow-lift"
    >
      <Cover n={n} className="absolute inset-0 size-full transition-transform duration-700 group-hover:scale-105" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 space-y-2 p-6 text-white">
        <Tags n={n} />
        <h2 className="max-w-3xl text-2xl leading-tight font-semibold">{n.title}</h2>
        {n.summary && <p className="line-clamp-2 max-w-3xl text-sm text-white/80">{n.summary}</p>}
        <p className="text-xs text-white/70">
          {n.feed} · {ago(n.published_at)}
        </p>
      </div>
    </motion.button>
  );
}

function Card({ n, delay, onOpen, onToggle }: { n: NewsItem; delay: number; onOpen: () => void; onToggle: () => void }) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ ...spring.soft, delay }}
      className={cn("group overflow-hidden rounded-2xl border border-border bg-card shadow-soft transition-opacity", n.read && "opacity-60 hover:opacity-100")}>
      <button onClick={onOpen} className="block w-full text-left">
        {n.image_url ? <Cover n={n} className="h-36 w-full" /> : <div className="h-1.5" style={{ background: feedColor(n.feed) }} />}
        <div className="space-y-2 p-4">
          <Tags n={n} />
          <h3 className={cn("leading-snug", !n.read && "font-semibold")}>{n.title}</h3>
          {(n.summary ?? n.description) && <p className="line-clamp-3 text-sm text-muted-foreground">{n.summary ?? n.description}</p>}
        </div>
      </button>
      <footer className="flex items-center gap-2 px-4 pb-3 text-[11px] text-muted-foreground">
        <span className="size-2 rounded-full" style={{ background: feedColor(n.feed) }} />
        <span className="min-w-0 flex-1 truncate">
          {n.feed} · {ago(n.published_at)}
        </span>
        <motion.button
          whileTap={{ scale: 0.8 }}
          onClick={onToggle}
          aria-pressed={n.read}
          aria-label={n.read ? "Marcar como não lida" : "Marcar como lida"}
          title={n.read ? "Lida (clique para desmarcar)" : "Marcar como lida"}
          className={cn("grid size-7 place-items-center rounded-full border transition-colors", n.read ? "border-success bg-success text-white" : "border-border hover:border-success hover:text-success")}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span key={String(n.read)} initial={{ scale: 0, rotate: -45 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0 }} transition={spring.bouncy}>
              <Check className="size-3.5" strokeWidth={3} />
            </motion.span>
          </AnimatePresence>
        </motion.button>
      </footer>
    </motion.article>
  );
}

function Reader({ n, onClose, onUnread, onUpdate }: { n: NewsItem | null; onClose: () => void; onUnread: (n: NewsItem) => void; onUpdate: (n: NewsItem) => void }) {
  const [busy, setBusy] = useState(false);
  async function summarize() {
    if (!n) return;
    setBusy(true);
    try {
      onUpdate(await commands.summarizeNews(n.id));
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet open={n !== null} onOpenChange={(o) => !o && onClose()} title={n?.feed ?? ""} description={n ? ago(n.published_at) : undefined}>
      {n && (
        <div className="h-full overflow-y-auto">
          <Cover n={n} className="h-64 w-full" />
          <div className="mx-auto max-w-2xl space-y-5 p-6">
            <Tags n={n} />
            <h2 className="text-2xl leading-tight font-semibold">{n.title}</h2>
            {n.summary ? (
              <div className="space-y-1 rounded-2xl border border-primary/30 bg-primary/10 p-4">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                  <Sparkles className="size-3.5" /> Resumo do Grifo
                </p>
                <p className="text-sm leading-relaxed">{n.summary}</p>
              </div>
            ) : (
              <Button variant="secondary" disabled={busy} onClick={() => void summarize()}>
                {busy ? <Loader2 className="animate-spin" /> : <Sparkles />} Resumir com IA
              </Button>
            )}
            {n.description && <p className="leading-relaxed text-muted-foreground">{n.description}</p>}
            <div className="flex flex-wrap gap-2 border-t border-border pt-4">
              <Button onClick={() => commands.openLink(n.link).catch(toastError)}>
                <ExternalLink /> Ler a notícia completa
              </Button>
              <Button variant="ghost" onClick={() => onUnread(n)}>
                Marcar como não lida
              </Button>
            </div>
          </div>
        </div>
      )}
    </Sheet>
  );
}
