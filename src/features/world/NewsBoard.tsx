import { openLink } from "@/components/ExternalLink";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  AlignLeft,
  ArrowDownUp,
  CalendarRange,
  Check,
  CheckCheck,
  ExternalLink,
  FilterX,
  LayoutDashboard,
  LayoutGrid,
  List,
  Loader2,
  RefreshCw,
  Rss,
  Sparkles,
  Star,
  type LucideIcon,
} from "lucide-react";
import { SearchInput } from "@/components/fields";
import { Skeleton } from "@/components/motion";
import { PickMenu } from "@/components/PickMenu";
import { toast, toastError } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { commands, type NewsItem } from "@/lib/bindings";
import { ago, feedColor, fold } from "@/lib/format";
import { useWidth } from "@/lib/hooks";
import { spring } from "@/lib/motion";
import { getPref, setPref } from "@/lib/prefs";
import { NEWS_RELEVANT } from "@/lib/rules";
import { sfx } from "@/lib/sound";
import { cn, warn } from "@/lib/utils";
import { masonry } from "./masonry";
import { DEFAULT_VIEW, groupNews, inPeriod, parseView, sortNews, timeOf, type NewsLayout, type NewsPeriod, type NewsSort, type NewsView } from "./news";

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

/** Cor do ponto de cada etiqueta: fases do concurso em ordem (amarelo → verde), resto neutro. */
const TAG_COLOR: Record<string, string> = {
  previsto: "#8a7fb0",
  edital: "#e0a84f",
  inscricoes: "#d9b45a",
  prova: "#c8644a",
  resultado: "#5f8fa3",
  nomeacao: "#6fae6a",
  prorrogacao: "#c98a4a",
};

const LAYOUTS: { id: NewsLayout; label: string; icon: LucideIcon }[] = [
  { id: "mosaico", label: "Mosaico", icon: LayoutDashboard },
  { id: "grade", label: "Grade", icon: LayoutGrid },
  { id: "lista", label: "Lista", icon: List },
  { id: "manchetes", label: "Manchetes", icon: AlignLeft },
];

const SORTS: { value: NewsSort; label: string; detail: string }[] = [
  { value: "recentes", label: "Mais recentes", detail: "as novas primeiro" },
  { value: "antigas", label: "Mais antigas", detail: "as antigas primeiro" },
  { value: "relevantes", label: "Mais relevantes", detail: "o que mais interessa à sua área" },
  { value: "fonte", label: "Por fonte", detail: "agrupadas por site" },
];

const PERIODS: { value: NewsPeriod; label: string }[] = [
  { value: "hoje", label: "Hoje" },
  { value: "semana", label: "Últimos 7 dias" },
  { value: "mes", label: "Últimos 30 dias" },
  { value: "tudo", label: "Qualquer data" },
];

type Filter = "todas" | "nao_lidas" | "area";
const ALL_FEEDS = "__all__";

const tagsOf = (n: NewsItem) => (n.tags ? n.tags.split(",").filter(Boolean) : []);
const isMine = (n: NewsItem) => (n.relevance ?? 0) >= NEWS_RELEVANT;
const hhmm = (n: NewsItem) => (timeOf(n) ? new Date(timeOf(n)).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "");

/** Cartões por "página": o resto entra quando a rolagem chega perto do fim. */
const PAGE = 24;
/** Largura mínima de uma coluna do mosaico (px). */
const COLUMN_MIN = 300;

const estimate = (n: NewsItem) => (n.image_url ? 300 : 160) + ((n.summary ?? n.description) ? 60 : 0) + Math.min(n.title.length, 140) * 0.4;

export function NewsBoard() {
  const [items, setItems] = useState<NewsItem[] | null>(null);
  const [view, setViewState] = useState<NewsView>(DEFAULT_VIEW);
  const [filter, setFilter] = useState<Filter>("todas");
  const [tag, setTag] = useState<string | null>(null);
  const [feed, setFeed] = useState<string>(ALL_FEEDS);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<NewsItem | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const [gridRef, width] = useWidth<HTMLDivElement>();
  const columns = Math.max(1, Math.min(3, Math.floor((width + 16) / (COLUMN_MIN + 16))));
  const sentinel = useRef<HTMLDivElement>(null);

  const load = useCallback(() => void commands.listNews(300).then(setItems, toastError), []);
  useEffect(load, [load]);
  useEffect(() => {
    void getPref("news_view").then((raw) => setViewState(parseView(raw)));
  }, []);
  const setView = (patch: Partial<NewsView>) => {
    const next = { ...view, ...patch };
    setViewState(next);
    setPref("news_view", JSON.stringify(next)).catch((e) => warn("salvar a visualização do Mundo", e));
  };

  const patch = (id: number, p: Partial<NewsItem>) => setItems((list) => list && list.map((x) => (x.id === id ? { ...x, ...p } : x)));

  async function setRead(n: NewsItem, read: boolean) {
    patch(n.id, { read });
    if (read) sfx("coin");
    await commands.setNewsRead(n.id, read).catch(toastError);
  }
  const openNews = (n: NewsItem) => {
    setOpen(n);
    void setRead(n, true);
  };

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

  // "agora" muda quando a lista recarrega (Hoje/Ontem certos sem relógio rodando)
  const now = useMemo(() => new Date(), [items]);
  const feeds = useMemo(() => [...new Set((items ?? []).map((n) => n.feed))].sort((a, b) => a.localeCompare(b, "pt-BR")), [items]);
  // contadores das abas respeitam período e fonte (o que a pessoa vê bate com o número)
  const scoped = useMemo(() => (items ?? []).filter((n) => inPeriod(n, view.period, now) && (feed === ALL_FEEDS || n.feed === feed)), [items, view.period, feed, now]);
  const unread = scoped.filter((n) => !n.read).length;
  const shown = useMemo(() => {
    const needle = fold(q.trim());
    const list = scoped.filter(
      (n) =>
        (filter !== "nao_lidas" || !n.read) &&
        (filter !== "area" || isMine(n)) &&
        (!tag || tagsOf(n).includes(tag)) &&
        (!needle || fold(`${n.title} ${n.summary ?? ""} ${n.description ?? ""} ${n.feed}`).includes(needle)),
    );
    return sortNews(list, view.sort);
  }, [scoped, filter, tag, q, view.sort]);

  // Filtro novo volta para a primeira página.
  useEffect(() => {
    setLimit(PAGE);
  }, [filter, tag, feed, q, view]);

  // Destaque (só no mosaico): a primeira não lida com capa (senão, a primeira com capa).
  const featured = view.layout === "mosaico" ? (shown.find((n) => !n.read && n.image_url) ?? shown.find((n) => n.image_url) ?? null) : null;
  const rest = featured ? shown.filter((n) => n !== featured) : shown;
  const page = rest.slice(0, limit);
  const cols = useMemo(() => masonry(page, columns, estimate), [page, columns]);
  const groups = useMemo(() => groupNews(page, view.sort, now), [page, view.sort, now]);

  // Rolou até perto do fim: mais uma página.
  useEffect(() => {
    const el = sentinel.current;
    if (!el || limit >= rest.length) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setLimit((l) => l + PAGE), { rootMargin: "600px" });
    io.observe(el);
    return () => io.disconnect();
  }, [limit, rest.length]);

  const filtered = filter !== "todas" || tag !== null || feed !== ALL_FEEDS || q.trim() !== "" || view.period !== "tudo";
  const clearFilters = () => {
    setFilter("todas");
    setTag(null);
    setFeed(ALL_FEEDS);
    setQ("");
    if (view.period !== "tudo") setView({ period: "tudo" });
  };

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
      {/* Barra de ferramentas: busca e ações | filtros e visualização */}
      <div className="space-y-3 rounded-2xl border border-border bg-card p-3 shadow-soft">
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput value={q} onChange={setQ} placeholder="Buscar por título, resumo ou fonte" className="min-w-56 flex-1" />
          <Button variant="secondary" size="sm" disabled={!unread} onClick={() => void readAll()}>
            <CheckCheck /> Marcar tudo como lido
          </Button>
          <Button variant="secondary" size="sm" disabled={refreshing} onClick={() => void refresh()}>
            <RefreshCw className={cn(refreshing && "animate-spin")} /> Atualizar
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div role="tablist" aria-label="Quais notícias" className="inline-flex rounded-xl border border-border bg-background p-1">
            {(
              [
                ["todas", "Todas", scoped.length],
                ["nao_lidas", "Não lidas", unread],
                ["area", "Da minha área", scoped.filter(isMine).length],
              ] as const
            ).map(([v, label, n]) => (
              <button
                key={v}
                role="tab"
                aria-selected={filter === v}
                onClick={() => setFilter(v)}
                className={cn("relative flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[0.8rem] font-medium transition-colors", filter === v ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
              >
                {filter === v && <motion.span layoutId="news-filter" className="absolute inset-0 rounded-lg bg-primary" transition={spring.snappy} />}
                <span className="relative">{label}</span>
                <span className={cn("tabular relative text-xs", filter === v ? "opacity-80" : "opacity-60")}>{n}</span>
              </button>
            ))}
          </div>
          <PickMenu label="Período" icon={CalendarRange} value={view.period} onChange={(period) => setView({ period })} options={PERIODS} />
          <PickMenu label="Ordenar por" icon={ArrowDownUp} value={view.sort} onChange={(sort) => setView({ sort })} options={SORTS} />
          {feeds.length > 1 && (
            <PickMenu
              label="Fonte"
              icon={Rss}
              value={feed}
              onChange={setFeed}
              options={[{ value: ALL_FEEDS, label: "Todas as fontes" }, ...feeds.map((f) => ({ value: f, label: f, detail: `${items.filter((n) => n.feed === f).length} notícias` }))]}
              className="max-w-52"
            />
          )}
          <div role="radiogroup" aria-label="Visualização" className="ml-auto inline-flex rounded-xl border border-border bg-background p-1">
            {LAYOUTS.map((l) => (
              <button
                key={l.id}
                role="radio"
                aria-checked={view.layout === l.id}
                aria-label={l.label}
                title={l.label}
                onClick={() => setView({ layout: l.id })}
                className={cn(
                  "relative grid size-7 place-items-center rounded-lg transition-colors",
                  view.layout === l.id ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {view.layout === l.id && <motion.span layoutId="news-layout" className="absolute inset-0 rounded-lg bg-primary" transition={spring.snappy} />}
                <l.icon className="relative size-4" />
              </button>
            ))}
          </div>
        </div>

        {/* Etiquetas da IA (fileira leve) + resumo do que está na tela */}
        <div className="flex flex-wrap items-center gap-1.5">
          {Object.entries(TAG_LABEL)
            .filter(([t]) => items.some((n) => tagsOf(n).includes(t)))
            .map(([t, label]) => (
              <button
                key={t}
                onClick={() => setTag(tag === t ? null : t)}
                aria-pressed={tag === t}
                className={cn(
                  "flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs transition-colors",
                  tag === t ? "bg-primary/15 font-medium text-primary ring-1 ring-primary/40" : "bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground",
                )}
              >
                <span className="size-1.5 rounded-full" style={{ background: TAG_COLOR[t] ?? "var(--muted-foreground)" }} />
                {label}
              </button>
            ))}
          <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            <span className="tabular">
              {shown.length} {shown.length === 1 ? "notícia" : "notícias"}
            </span>
            {filtered && (
              <Button variant="ghost" size="xs" onClick={clearFilters}>
                <FilterX /> Limpar filtros
              </Button>
            )}
          </span>
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-14 text-center text-sm text-muted-foreground">
          <p>{items.length === 0 ? "Nenhuma notícia ainda. Clique em Atualizar." : "Nada com esses filtros."}</p>
          {filtered && items.length > 0 && (
            <Button variant="secondary" size="sm" onClick={clearFilters}>
              <FilterX /> Limpar filtros
            </Button>
          )}
        </div>
      ) : (
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={view.layout} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, transition: { duration: 0.1 } }} transition={spring.soft} className="space-y-4">
            {view.layout === "mosaico" && (
              <>
                {featured && <Featured n={featured} onOpen={() => openNews(featured)} />}
                <div className="flex items-start gap-4">
                  {cols.map((col, c) => (
                    <div key={c} className="min-w-0 flex-1 space-y-4">
                      {col.map((n, row) => (
                        <Card
                          key={n.id}
                          n={n}
                          // entrada por linha, só nos primeiros: quem chega rolando já aparece
                          delay={Math.min(row * columns + c, 12) * 0.035}
                          onOpen={() => openNews(n)}
                          onToggle={() => void setRead(n, !n.read)}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              </>
            )}
            {view.layout === "grade" && (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
                {page.map((n, i) => (
                  <Card key={n.id} n={n} uniform delay={Math.min(i, 12) * 0.03} onOpen={() => openNews(n)} onToggle={() => void setRead(n, !n.read)} />
                ))}
              </div>
            )}
            {(view.layout === "lista" || view.layout === "manchetes") &&
              groups.map((g) => (
                <div key={g.label || "todas"} className="space-y-2">
                  {g.label && (
                    <h3 className="sticky top-0 z-10 -mx-1 flex items-center gap-2 bg-background/85 px-1 py-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase backdrop-blur">
                      {view.sort === "fonte" && <span className="size-2 rounded-full" style={{ background: feedColor(g.label) }} />}
                      {g.label}
                      <span className="tabular font-normal opacity-70">{g.items.length}</span>
                      <span className="h-px flex-1 bg-border" />
                    </h3>
                  )}
                  {view.layout === "lista" ? (
                    <div className="space-y-2">
                      {g.items.map((n) => (
                        <Row key={n.id} n={n} onOpen={() => openNews(n)} onToggle={() => void setRead(n, !n.read)} />
                      ))}
                    </div>
                  ) : (
                    <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
                      {g.items.map((n) => (
                        <Headline key={n.id} n={n} showDate={view.sort === "fonte" || view.sort === "relevantes"} onOpen={() => openNews(n)} onToggle={() => void setRead(n, !n.read)} />
                      ))}
                    </ul>
                  )}
                </div>
              ))}
          </motion.div>
        </AnimatePresence>
      )}
      {limit < rest.length && <div ref={sentinel} className="h-px" />}

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
        <span key={t} className="flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[10px]">
          <span className="size-1 rounded-full" style={{ background: TAG_COLOR[t] ?? "var(--muted-foreground)" }} />
          {TAG_LABEL[t] ?? t}
        </span>
      ))}
    </div>
  );
}

/** Botão redondo de lida/não lida (o mesmo em todas as visualizações). */
function ReadToggle({ n, onToggle, className }: { n: NewsItem; onToggle: () => void; className?: string }) {
  return (
    <motion.button
      whileTap={{ scale: 0.8 }}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      aria-pressed={n.read}
      aria-label={n.read ? "Marcar como não lida" : "Marcar como lida"}
      title={n.read ? "Lida (clique para desmarcar)" : "Marcar como lida"}
      className={cn("grid size-7 shrink-0 place-items-center rounded-full border transition-colors", n.read ? "border-success bg-success text-white" : "border-border hover:border-success hover:text-success", className)}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span key={String(n.read)} initial={{ scale: 0, rotate: -45 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0 }} transition={spring.bouncy}>
          <Check className="size-3.5" strokeWidth={3} />
        </motion.span>
      </AnimatePresence>
    </motion.button>
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
      <span className="absolute top-4 left-4 flex items-center gap-1.5 rounded-full bg-black/45 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur">
        <Star className="size-3 fill-current text-amber-300" /> Destaque
      </span>
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

/** Cartão do mosaico (altura livre) e da grade (`uniform`: capa sempre, mesma proporção). */
function Card({ n, delay, uniform, onOpen, onToggle }: { n: NewsItem; delay: number; uniform?: boolean; onOpen: () => void; onToggle: () => void }) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ ...spring.soft, delay }}
      whileHover={{ y: -3 }}
      className={cn(
        "group flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-soft transition-[opacity,border-color,box-shadow] hover:border-primary/40 hover:shadow-lift",
        n.read && "opacity-60 hover:opacity-100",
      )}
    >
      <button onClick={onOpen} className="block w-full flex-1 text-left">
        {uniform ? (
          <div className="relative aspect-[16/9] overflow-hidden">
            <Cover n={n} className="size-full transition-transform duration-500 group-hover:scale-105" />
          </div>
        ) : n.image_url ? (
          <div className="overflow-hidden">
            <Cover n={n} className="h-36 w-full transition-transform duration-500 group-hover:scale-105" />
          </div>
        ) : (
          <div className="h-1.5" style={{ background: feedColor(n.feed) }} />
        )}
        <div className="space-y-2 p-4">
          <Tags n={n} />
          <h3 className={cn("leading-snug", !n.read && "font-semibold", uniform && "line-clamp-3")}>{n.title}</h3>
          {(n.summary ?? n.description) && <p className={cn("text-sm text-muted-foreground", uniform ? "line-clamp-2" : "line-clamp-3")}>{n.summary ?? n.description}</p>}
        </div>
      </button>
      <footer className="flex items-center gap-2 px-4 pb-3 text-[11px] text-muted-foreground">
        <span className="size-2 rounded-full" style={{ background: feedColor(n.feed) }} />
        <span className="min-w-0 flex-1 truncate">
          {n.feed} · {ago(n.published_at)}
        </span>
        <ReadToggle n={n} onToggle={onToggle} />
      </footer>
    </motion.article>
  );
}

/** Linha da lista: miniatura, título, uma linha de resumo e etiquetas. */
function Row({ n, onOpen, onToggle }: { n: NewsItem; onOpen: () => void; onToggle: () => void }) {
  return (
    <motion.article
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={spring.soft}
      className={cn("group flex items-center gap-4 rounded-2xl border border-border bg-card p-2.5 pr-4 transition-colors hover:border-primary/40", n.read && "opacity-60 hover:opacity-100")}
    >
      <button onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-4 text-left">
        <div className="h-20 w-32 shrink-0 overflow-hidden rounded-xl">
          <Cover n={n} className="size-full text-lg transition-transform duration-500 group-hover:scale-105" />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <h3 className={cn("line-clamp-2 leading-snug", !n.read && "font-semibold")}>{n.title}</h3>
          {(n.summary ?? n.description) && <p className="line-clamp-1 text-sm text-muted-foreground">{n.summary ?? n.description}</p>}
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full" style={{ background: feedColor(n.feed) }} />
              {n.feed}
            </span>
            <span>· {ago(n.published_at)}</span>
            <Tags n={n} />
          </div>
        </div>
      </button>
      <ReadToggle n={n} onToggle={onToggle} />
    </motion.article>
  );
}

/** Manchete: só texto, densa, para passar o olho em muitas de uma vez. */
function Headline({ n, showDate, onOpen, onToggle }: { n: NewsItem; showDate: boolean; onOpen: () => void; onToggle: () => void }) {
  return (
    <li className={cn("group flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-secondary/60", n.read && "text-muted-foreground")}>
      <span className="tabular w-11 shrink-0 text-xs text-muted-foreground">{showDate ? ago(n.published_at).replace("há ", "") : hhmm(n)}</span>
      <span className="hidden w-28 shrink-0 truncate rounded-md px-1.5 py-0.5 text-center text-[10px] font-semibold text-white sm:block" style={{ background: feedColor(n.feed) }} title={n.feed}>
        {n.feed}
      </span>
      <button onClick={onOpen} className={cn("min-w-0 flex-1 truncate text-left text-sm hover:text-primary", !n.read && "font-medium")} title={n.title}>
        {isMine(n) && <Star className="mr-1.5 mb-0.5 inline size-3.5 fill-primary text-primary" aria-label="Da sua área" />}
        {n.title}
      </button>
      {tagsOf(n)
        .slice(0, 2)
        .map((t) => (
          <span key={t} className="hidden shrink-0 items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[10px] md:flex">
            <span className="size-1 rounded-full" style={{ background: TAG_COLOR[t] ?? "var(--muted-foreground)" }} />
            {TAG_LABEL[t] ?? t}
          </span>
        ))}
      <ReadToggle n={n} onToggle={onToggle} className="size-6 opacity-60 group-hover:opacity-100" />
    </li>
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
              <Button onClick={() => openLink(n.link)}>
                <ExternalLink /> Ler a notícia completa
              </Button>
              <Button variant="secondary" onClick={() => onUnread(n)}>
                Marcar como não lida
              </Button>
            </div>
          </div>
        </div>
      )}
    </Sheet>
  );
}
