import { useEffect, useState } from "react";
import { ArrowLeft, Check, Plus, Search, UserRound, Users } from "lucide-react";
import { MascotEmpty } from "@/components/MascotEmpty";
import { Skeleton } from "@/components/motion";
import { SearchInput, NativeSelect } from "@/components/fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { commands } from "@/lib/bindings";
import { emit } from "@/lib/bus";
import { myUserId } from "@/lib/cloud";
import { plural } from "@/lib/format";
import { warn } from "@/lib/utils";
import {
  acceptFriend,
  blockedIds,
  CATEGORIES,
  createCommunity,
  incomingRequests,
  listCommunities,
  myProfile,
  searchProfiles,
  updateMyProfile,
  type Category,
} from "./api";
import { CommunityView } from "./CommunityView";
import { EditProfile, provisionalHandle } from "./EditProfile";
import { ProfileView } from "./ProfileView";
import { TopicView } from "./TopicView";
import { Avatar, Box, PersonLink, useAction, useLoad, type Open, type Route } from "./ui";

/** Comunidade do Grifo Quest Cloud (só para assinantes; o menu nem mostra para os outros). */
export default function CommunityScreen() {
  const me = useLoad(myUserId, []);
  const [stack, setStack] = useState<Route[]>([{ kind: "home" }]);
  const route = stack[stack.length - 1] ?? { kind: "home" };
  const open: Open = (r) => setStack((s) => [...s, r]);
  const back = () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
  const blocks = useLoad(blockedIds, []);
  useSyncStats(me.data);

  if (me.error) {
    return (
      <MascotEmpty title="A comunidade não abriu" text={me.error}>
        <Button variant="outline" onClick={() => emit("navigate", "config")}>
          Abrir Config → Conta
        </Button>
      </MascotEmpty>
    );
  }
  if (!me.data) return <Skeleton className="h-96 rounded-2xl" />;
  const uid = me.data;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex items-center gap-3">
        {stack.length > 1 && (
          <Button variant="ghost" size="sm" onClick={back}>
            <ArrowLeft /> Voltar
          </Button>
        )}
        <h1 className="retro text-sm text-primary">Comunidade</h1>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setStack([{ kind: "home" }])}>
            <Users /> Início
          </Button>
          <Button variant="outline" size="sm" onClick={() => open({ kind: "profile", id: uid })}>
            <UserRound /> Meu perfil
          </Button>
        </div>
      </div>

      {route.kind === "home" && <Home me={uid} open={open} />}
      {route.kind === "profile" && <ProfileView key={route.id} id={route.id} me={uid} open={open} blocked={blocks.data ?? new Set()} onBlocksChanged={blocks.reload} />}
      {route.kind === "community" && <CommunityView key={route.id} id={route.id} me={uid} open={open} back={back} />}
      {route.kind === "topic" && <TopicView key={route.id} id={route.id} me={uid} open={open} back={back} />}
    </div>
  );
}

/** Leva nível, XP e ofensiva do app para o perfil público (uma vez por abertura da tela). */
function useSyncStats(me: string | null) {
  useEffect(() => {
    if (!me) return;
    commands.getDashboard().then(
      (d) => updateMyProfile({ level: d.level.level, xp: d.xp, streak: d.streak.days }).catch((e) => warn("enviar nível ao perfil", e)),
      (e) => warn("ler o painel", e),
    );
  }, [me]);
}

function Home({ me, open }: { me: string; open: Open }) {
  const profile = useLoad(myProfile, []);
  const requests = useLoad(incomingRequests, []);
  const { busy, act } = useAction();
  const p = profile.data;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)]">
      <div className="min-w-0 space-y-4">
        {p && provisionalHandle(p.handle) && (
          <div className="space-y-2">
            <p className="text-sm">Bem-vindo à comunidade! Escolha seu @ e como você aparece para os outros.</p>
            <EditProfile profile={p} onSaved={profile.reload} />
          </div>
        )}
        <Communities open={open} />
      </div>

      <aside className="space-y-4">
        {p && (
          <button onClick={() => open({ kind: "profile", id: me })} className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-4 text-left shadow-soft hover:border-primary/50">
            <Avatar avatar={p.avatar} scale={3} className="size-16" />
            <span className="min-w-0">
              <span className="block truncate font-semibold">{p.display_name}</span>
              <span className="block truncate text-sm text-muted-foreground">@{p.handle}</span>
            </span>
          </button>
        )}
        {!!requests.data?.length && (
          <Box title="Pedidos de amizade" count={requests.data.length}>
            <ul className="space-y-2">
              {requests.data.map((r) => (
                <li key={r.id} className="flex items-center gap-2">
                  <Avatar avatar={r.avatar} scale={2} className="size-9" />
                  <PersonLink p={r} open={open} className="min-w-0 flex-1 truncate text-left" />
                  <Button size="xs" disabled={busy} onClick={() => void act(() => acceptFriend(r.id), "Agora vocês são amigos").then((ok) => ok && requests.reload())}>
                    <Check /> Aceitar
                  </Button>
                </li>
              ))}
            </ul>
          </Box>
        )}
        <People open={open} />
      </aside>
    </div>
  );
}

function Communities({ open }: { open: Open }) {
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setQuery(q), 300);
    return () => clearTimeout(t);
  }, [q]);
  const list = useLoad(() => listCommunities(query), [query]);

  return (
    <Box
      title="Comunidades"
      action={
        <Button size="sm" variant={creating ? "ghost" : "default"} onClick={() => setCreating(!creating)}>
          <Plus /> {creating ? "Cancelar" : "Criar comunidade"}
        </Button>
      }
    >
      {creating && (
        <NewCommunity
          onCreated={(id) => {
            setCreating(false);
            open({ kind: "community", id });
          }}
        />
      )}
      <SearchInput value={q} onChange={setQ} placeholder="Buscar comunidade (ex.: TRT, Direito Administrativo, FCC)" />
      {list.error && <p className="text-sm text-destructive">{list.error}</p>}
      {list.data?.length === 0 && <p className="text-sm text-muted-foreground">{query ? "Nada encontrado. Crie a primeira!" : "Nenhuma comunidade ainda. Crie a primeira!"}</p>}
      <ul className="grid gap-2 sm:grid-cols-2">
        {list.data?.map((c) => (
          <li key={c.id}>
            <button onClick={() => open({ kind: "community", id: c.id })} className="h-full w-full space-y-1 rounded-xl border border-border p-3 text-left hover:border-primary/50 hover:bg-secondary/40">
              <span className="block text-xs text-muted-foreground uppercase">{CATEGORIES[c.category]}</span>
              <span className="block truncate font-medium">{c.name}</span>
              {c.description && <span className="line-clamp-2 block text-xs text-muted-foreground">{c.description}</span>}
              <span className="block text-xs">{plural(c.member_count, "membro", "membros")}</span>
            </button>
          </li>
        ))}
      </ul>
    </Box>
  );
}

function NewCommunity({ onCreated }: { onCreated: (id: string) => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<Category>("concurso");
  const { busy, act } = useAction();
  return (
    <form
      className="space-y-2 rounded-xl bg-secondary/60 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        let created: string | null = null;
        void act(async () => {
          created = (await createCommunity({ name: name.trim(), description: description.trim(), category }))?.id ?? null;
        }, "Comunidade criada").then((ok) => {
          if (ok && created) onCreated(created);
        });
      }}
    >
      <div className="flex flex-wrap gap-2">
        <Input className="min-w-60 flex-1" value={name} maxLength={60} placeholder="Nome (ex.: TRT-SP 2027 – Analista)" onChange={(e) => setName(e.target.value)} />
        <NativeSelect value={category} onChange={(e) => setCategory(e.target.value as Category)} aria-label="Tipo">
          {Object.entries(CATEGORIES).map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </NativeSelect>
      </div>
      <Textarea value={description} maxLength={1000} placeholder="Do que se trata? Regras da comunidade…" onChange={(e) => setDescription(e.target.value)} />
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={busy || name.trim().length < 3}>
          Criar
        </Button>
      </div>
    </form>
  );
}

function People({ open }: { open: Open }) {
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setQuery(q), 300);
    return () => clearTimeout(t);
  }, [q]);
  const list = useLoad(() => searchProfiles(query), [query]);
  return (
    <Box title="Pessoas">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-8" value={q} placeholder="Buscar por nome ou @" onChange={(e) => setQ(e.target.value)} />
      </div>
      {list.error && <p className="text-sm text-destructive">{list.error}</p>}
      {query && list.data?.length === 0 && <p className="text-sm text-muted-foreground">Ninguém encontrado.</p>}
      <ul className="space-y-1">
        {list.data?.map((p) => (
          <li key={p.id}>
            <button onClick={() => open({ kind: "profile", id: p.id })} className="flex w-full items-center gap-2 rounded-lg p-1.5 text-left hover:bg-secondary">
              <Avatar avatar={p.avatar} scale={2} className="size-9" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{p.display_name}</span>
                <span className="block truncate text-xs text-muted-foreground">@{p.handle}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Box>
  );
}
