import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, BookOpenCheck, CalendarClock, HelpCircle, Home, LayoutList, MessageCircle, MessageSquareText, Trophy, UserRound, Users, UsersRound } from "lucide-react";
import { MascotEmpty } from "@/components/MascotEmpty";
import { Skeleton } from "@/components/motion";
import { SectionTabs } from "@/components/SectionTabs";
import { Button } from "@/components/ui/button";
import { commands } from "@/lib/bindings";
import { emit } from "@/lib/bus";
import { myUserId } from "@/lib/cloud";
import { plural } from "@/lib/format";
import { cn, warn } from "@/lib/utils";
import {
  blockedIds,
  dailyFromMine,
  friendsOf,
  homeFeed,
  myProfile,
  studiedToday,
  unreadMessages,
  updateMyProfile,
  weeklyLeague,
  type FeedKind,
  type LeagueRow,
  type Profile,
} from "./api";
import { CommunitiesTab } from "./CommunitiesTab";
import { CommunityView } from "./CommunityView";
import { EditProfile, provisionalHandle } from "./EditProfile";
import { DailyQuestionCard, FeedList, ItemView, PostBox, TipOfTheDay } from "./Feed";
import { FriendsTab } from "./FriendsTab";
import { MessagesTab } from "./MessagesTab";
import { NotificationBell, type NotificationTarget } from "./Notifications";
import { ProfileView } from "./ProfileView";
import { TopicView } from "./TopicView";
import { Box, PersonPhoto, useLoad, type Open, type Route } from "./ui";

type Tab = "mural" | "comunidades" | "amigos" | "mensagens" | "perfil";

/** Comunidade do Grifo Quest Cloud (só para assinantes; o menu nem mostra para os outros). */
export default function CommunityScreen() {
  const me = useLoad(myUserId, []);
  const profile = useLoad(myProfile, [me.data]);
  const [tab, setTab] = useState<Tab>("mural");
  const [editing, setEditing] = useState(false);
  const [chatWith, setChatWith] = useState<string | null>(null);
  const [stack, setStack] = useState<Route[]>([]);
  const unread = useUnreadMessages();
  const blocks = useLoad(blockedIds, []);
  useSyncStats(profile.data);

  const route = stack[stack.length - 1];
  const goTab = (t: Tab) => {
    setStack([]);
    setEditing(false);
    if (t !== "mensagens") setChatWith(null);
    setTab(t);
  };
  const message = (id: string) => {
    setChatWith(id);
    goTab("mensagens");
  };
  const open: Open = (r) => {
    if (r.kind === "profile" && r.id === me.data) return goTab("perfil");
    setStack((s) => [...s, r]);
  };
  const back = () => setStack((s) => s.slice(0, -1));
  const onNotification = (t: NotificationTarget) => {
    if (t.kind === "self") goTab("perfil");
    else if (t.kind === "friends") goTab("amigos");
    else open(t);
  };

  if (me.error) {
    return (
      <MascotEmpty title="A comunidade não abriu" text={me.error}>
        <Button variant="outline" onClick={() => emit("navigate", "config")}>
          Abrir Config → Conta
        </Button>
      </MascotEmpty>
    );
  }
  if (!me.data || !profile.data) return <Skeleton className="h-96 rounded-2xl" />;
  const uid = me.data;
  const my = profile.data;
  const profileChanged = () => {
    profile.reload();
    emit("account");
  };

  // Primeira visita: escolher o @ antes de tudo.
  if (provisionalHandle(my.handle)) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <h1 className="retro text-sm text-primary">Comunidade</h1>
        <p className="text-sm">Bem-vindo! Escolha seu @, sua foto e como você aparece para os outros.</p>
        <EditProfile profile={my} onSaved={profileChanged} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <SectionTabs
            label="Seções da comunidade"
            value={stack.length ? ("" as Tab) : tab}
            onChange={(t) => goTab(t)}
            tabs={[
              { id: "mural", label: "Mural", icon: Home },
              { id: "comunidades", label: "Comunidades", icon: UsersRound },
              { id: "amigos", label: "Amigos", icon: Users },
              { id: "mensagens", label: "Mensagens", icon: MessageCircle, badge: unread.count },
              { id: "perfil", label: "Perfil", icon: UserRound },
            ]}
          />
        </div>
        <NotificationBell onGo={onNotification} />
      </div>

      {route ? (
        <div className="space-y-4">
          <Button variant="ghost" size="sm" onClick={back}>
            <ArrowLeft /> Voltar
          </Button>
          {route.kind === "profile" && (
            <ProfileView key={route.id} id={route.id} me={uid} open={open} blocked={blocks.data ?? new Set()} onBlocksChanged={blocks.reload} onMessage={message} />
          )}
          {route.kind === "community" && <CommunityView key={route.id} id={route.id} me={uid} open={open} back={back} />}
          {route.kind === "topic" && <TopicView key={route.id} id={route.id} me={uid} open={open} back={back} />}
          {route.kind === "item" && <ItemView key={route.id} id={route.id} me={uid} open={open} back={back} />}
        </div>
      ) : tab === "mural" ? (
        <Mural me={my} open={open} goTab={goTab} />
      ) : (
        <div>
          {tab === "comunidades" && <CommunitiesTab me={uid} open={open} />}
          {tab === "amigos" && <FriendsTab me={uid} open={open} />}
          {tab === "mensagens" && <MessagesTab me={uid} open={open} start={chatWith} onUnreadChange={unread.refresh} />}
          {tab === "perfil" &&
            (editing ? (
              <EditProfile
                profile={my}
                onCancel={() => setEditing(false)}
                onSaved={() => {
                  setEditing(false);
                  profileChanged();
                }}
              />
            ) : (
              <ProfileView key={`${my.cover_url ?? ""}|${my.photo_url ?? ""}`} id={uid} me={uid} open={open} blocked={new Set()} onBlocksChanged={blocks.reload} onEdit={() => setEditing(true)} onMessage={message} />
            ))}
        </div>
      )}
    </div>
  );
}

/** Leva nível, XP, ofensiva e (se a pessoa quiser) a próxima prova para o perfil público. */
function useSyncStats(profile: Profile | null) {
  const shareExam = profile?.share_exam ?? false;
  const id = profile?.id;
  useEffect(() => {
    if (!id) return;
    void (async () => {
      const d = await commands.getDashboard();
      let exam: { exam_name: string | null; exam_date: string | null } = { exam_name: null, exam_date: null };
      if (shareExam) {
        const next = (await commands.listExams()).filter((e) => e.days_left >= 0).sort((a, b) => a.days_left - b.days_left)[0];
        if (next) exam = { exam_name: next.name, exam_date: next.exam_date.slice(0, 10) };
      }
      await updateMyProfile({ level: d.level.level, xp: d.xp, streak: d.streak.days, ...exam });
    })().catch((e) => warn("atualizar o perfil público", e));
  }, [id, shareExam]);
}

// ---- mural ---------------------------------------------------------------------------------

const FILTERS: { id: FeedKind | "all"; label: string; icon: typeof Home }[] = [
  { id: "all", label: "Tudo", icon: LayoutList },
  { id: "question", label: "Dúvidas", icon: HelpCircle },
  { id: "activity", label: "Estudos", icon: BookOpenCheck },
  { id: "post", label: "Posts", icon: MessageSquareText },
];

function Mural({ me, open, goTab }: { me: Profile; open: Open; goTab: (t: Tab) => void }) {
  const daily = useLoad(dailyFromMine, []);
  const [filter, setFilter] = useState<FeedKind | "all">("all");

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,300px)]">
      <div className="min-w-0 space-y-4">
        <FriendsToday me={me} open={open} goFriends={() => goTab("amigos")} />
        <FeedList
          load={homeFeed}
          deps={[me.id]}
          me={me.id}
          open={open}
          filter={filter}
          empty="Seu mural está vazio. Adicione amigos, entre em comunidades ou publique algo!"
          top={(add) => (
            <>
              <PostBox me={me} onPublished={add} />
              {daily.data && <DailyQuestionCard question={daily.data} title={`Questão do dia · ${daily.data.community.name}`} />}
              <div className="flex flex-wrap gap-1.5">
                {FILTERS.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setFilter(f.id)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors",
                      filter === f.id ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <f.icon className="size-3.5" /> {f.label}
                  </button>
                ))}
              </div>
            </>
          )}
        />
      </div>

      <aside className="space-y-4">
        <TipOfTheDay />
        <League me={me} open={open} onEnable={() => goTab("perfil")} />
        <FriendsExams me={me.id} open={open} />
      </aside>
    </div>
  );
}

/** Faixa de amigos no topo do mural: anel colorido em quem já estudou hoje. */
function FriendsToday({ me, open, goFriends }: { me: Profile; open: Open; goFriends: () => void }) {
  const data = useLoad(async () => {
    const friends = await friendsOf(me.id);
    const studied = await studiedToday([me.id, ...friends.map((f) => f.id)]);
    // quem estudou hoje primeiro
    const sorted = [...friends].sort((a, b) => Number(studied.has(b.id)) - Number(studied.has(a.id)));
    return { friends: sorted, studied };
  }, [me.id]);
  if (!data.data) return null;
  const { friends, studied } = data.data;
  if (friends.length === 0) {
    return (
      <button onClick={goFriends} className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-border p-3 text-left text-sm text-muted-foreground hover:border-primary/50">
        <Users className="size-5" /> Adicione amigos para ver aqui quem já estudou hoje.
      </button>
    );
  }
  const people = [{ ...me, display_name: "Você" }, ...friends];
  return (
    <div className="rounded-2xl border border-border bg-card p-3 shadow-soft">
      <p className="mb-2 px-1 text-xs text-muted-foreground">
        {studied.size > 0 ? `${plural(studied.size, "pessoa já estudou", "pessoas já estudaram")} hoje` : "Ninguém estudou hoje ainda. Seja o primeiro!"}
      </p>
      <ul className="flex gap-3 overflow-x-auto pb-1">
        {people.map((p) => (
          <li key={p.id} className="shrink-0">
            <button onClick={() => open({ kind: "profile", id: p.id })} className="flex w-16 flex-col items-center gap-1" title={studied.has(p.id) ? "Já estudou hoje" : undefined}>
              <span className={cn("rounded-full p-0.5", studied.has(p.id) ? "bg-primary" : "bg-border")}>
                <PersonPhoto p={p} size={52} className="ring-2 ring-card" />
              </span>
              <span className="w-full truncate text-center text-[11px]">{p.display_name}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Liga da semana em pódio (top 3) e o resto em lista curta. */
function League({ me, open, onEnable }: { me: Profile; open: Open; onEnable: () => void }) {
  const rows = useLoad(weeklyLeague, [me.id]);
  const list = rows.data ?? [];
  const [first, second, third] = list;
  const rest = list.slice(3, 8);
  const myPos = list.findIndex((r) => r.id === me.id);
  return (
    <Box title="Liga da semana" action={<Trophy className="size-4 text-primary" />}>
      {rows.error && <p className="text-xs text-destructive">{rows.error}</p>}
      {!me.share_activity ? (
        <p className="text-sm text-muted-foreground">
          Compartilhe seus estudos para disputar com seus amigos.{" "}
          <button className="text-primary hover:underline" onClick={onEnable}>
            Ativar no perfil
          </button>
        </p>
      ) : list.length <= 1 ? (
        <p className="text-sm text-muted-foreground">Adicione amigos para disputar a liga. Ela recomeça toda segunda.</p>
      ) : null}
      {list.length > 1 && (
        <>
          <div className="grid grid-cols-3 items-end gap-1 pt-1">
            <Podium row={second} place={2} me={me.id} open={open} />
            <Podium row={first} place={1} me={me.id} open={open} />
            <Podium row={third} place={3} me={me.id} open={open} />
          </div>
          {rest.length > 0 && (
            <ol className="space-y-1">
              {rest.map((r, i) => (
                <li key={r.id} className={cn("flex items-center gap-2 rounded-lg px-1.5 py-1 text-sm", r.id === me.id && "bg-primary/10")}>
                  <span className="w-4 text-xs text-muted-foreground">{i + 4}</span>
                  <PersonPhoto p={r} size={22} />
                  <span className="min-w-0 flex-1 truncate">{r.id === me.id ? "Você" : r.display_name}</span>
                  <span className="tabular text-xs text-muted-foreground">{r.xp.toLocaleString("pt-BR")}</span>
                </li>
              ))}
            </ol>
          )}
          {myPos >= 8 && <p className="text-xs text-muted-foreground">Você está em {myPos + 1}º lugar.</p>}
        </>
      )}
    </Box>
  );
}

const PODIUM = { 1: "h-14 bg-primary/25", 2: "h-10 bg-primary/15", 3: "h-7 bg-primary/10" } as const;

function Podium({ row, place, me, open }: { row: LeagueRow | undefined; place: 1 | 2 | 3; me: string; open: Open }) {
  if (!row) return <span />;
  return (
    <button onClick={() => open({ kind: "profile", id: row.id })} className="flex min-w-0 flex-col items-center gap-1">
      <PersonPhoto p={row} size={place === 1 ? 48 : 38} className={cn(row.id === me && "ring-2 ring-primary")} />
      <span className="w-full truncate text-center text-[11px]">{row.id === me ? "Você" : row.display_name.split(" ")[0]}</span>
      <span className="tabular text-[10px] text-muted-foreground">{row.xp.toLocaleString("pt-BR")} XP</span>
      <span className={cn("retro grid w-full place-items-center rounded-t-lg text-[10px] text-primary", PODIUM[place])}>{place}º</span>
    </button>
  );
}

function FriendsExams({ me, open }: { me: string; open: Open }) {
  const friends = useLoad(() => friendsOf(me), [me]);
  const today = new Date().toISOString().slice(0, 10);
  const next = (friends.data ?? [])
    .filter((f) => f.share_exam && f.exam_date && f.exam_date >= today)
    .sort((a, b) => (a.exam_date ?? "").localeCompare(b.exam_date ?? ""))
    .slice(0, 4);
  if (next.length === 0) return null;
  return (
    <Box title="Provas dos amigos" action={<CalendarClock className="size-4 text-primary" />}>
      <ul className="space-y-2">
        {next.map((f) => {
          const days = Math.round((Date.parse(`${f.exam_date}T12:00:00`) - Date.now()) / 86_400_000);
          return (
            <li key={f.id}>
              <button onClick={() => open({ kind: "profile", id: f.id })} className="flex w-full items-center gap-2 text-left">
                <PersonPhoto p={f} size={32} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{f.display_name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {f.exam_name} · {days <= 0 ? "é hoje!" : `em ${plural(days, "dia", "dias")}`}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Box>
  );
}

/** Mensagens não lidas (badge da aba), reconferidas a cada 30 s. */
function useUnreadMessages() {
  const [count, setCount] = useState(0);
  const refresh = useCallback(() => {
    unreadMessages().then(setCount, (e) => warn("contar mensagens", e));
  }, []);
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 30_000);
    return () => clearInterval(t);
  }, [refresh]);
  return { count, refresh };
}
