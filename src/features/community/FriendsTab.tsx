import { useEffect, useState } from "react";
import { Check, Search, X } from "lucide-react";
import { Skeleton } from "@/components/motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { acceptFriend, friendsOf, incomingRequests, removeFriend, searchProfiles } from "./api";
import { Box, PersonLink, PersonPhoto, useAction, useLoad, type Open } from "./ui";

/** Aba Amigos: pedidos recebidos, seus amigos e busca de pessoas. */
export function FriendsTab({ me, open }: { me: string; open: Open }) {
  const requests = useLoad(incomingRequests, []);
  const friends = useLoad(() => friendsOf(me), [me]);
  const { busy, act } = useAction();
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setQuery(q), 300);
    return () => clearTimeout(t);
  }, [q]);
  const found = useLoad(() => searchProfiles(query), [query]);

  return (
    <div className="space-y-4">
      {!!requests.data?.length && (
        <Box title="Pedidos de amizade" count={requests.data.length}>
          <ul className="space-y-2">
            {requests.data.map((r) => (
              <li key={r.id} className="flex items-center gap-3">
                <PersonPhoto p={r} size={40} />
                <span className="min-w-0 flex-1">
                  <PersonLink p={r} open={open} className="block truncate text-left" />
                  <span className="block text-xs text-muted-foreground">@{r.handle}</span>
                </span>
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    void act(() => acceptFriend(r.id), "Agora vocês são amigos").then((ok) => {
                      if (ok) {
                        requests.reload();
                        friends.reload();
                      }
                    })
                  }
                >
                  <Check /> Aceitar
                </Button>
                <Button variant="ghost" size="sm" disabled={busy} onClick={() => void act(() => removeFriend(r.id)).then((ok) => ok && requests.reload())} aria-label="Recusar">
                  <X />
                </Button>
              </li>
            ))}
          </ul>
        </Box>
      )}

      <Box title="Encontrar pessoas">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-8" value={q} placeholder="Buscar por nome ou @" onChange={(e) => setQ(e.target.value)} />
        </div>
        {query && found.data?.length === 0 && <p className="text-sm text-muted-foreground">Ninguém encontrado.</p>}
        <ul className="grid gap-2 sm:grid-cols-2">
          {found.data
            ?.filter((p) => p.id !== me)
            .map((p) => (
              <li key={p.id}>
                <button onClick={() => open({ kind: "profile", id: p.id })} className="flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-secondary">
                  <PersonPhoto p={p} size={40} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{p.display_name}</span>
                    <span className="block truncate text-xs text-muted-foreground">@{p.handle}</span>
                  </span>
                </button>
              </li>
            ))}
        </ul>
      </Box>

      <Box title="Seus amigos" count={friends.data?.length}>
        {!friends.data && <Skeleton className="h-24 rounded-xl" />}
        {friends.data?.length === 0 && <p className="text-sm text-muted-foreground">Busque pessoas acima e mande um pedido de amizade.</p>}
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
          {friends.data?.map((f) => (
            <li key={f.id}>
              <button onClick={() => open({ kind: "profile", id: f.id })} className="flex w-full flex-col items-center gap-1.5 rounded-xl p-2 hover:bg-secondary">
                <PersonPhoto p={f} size={56} />
                <span className="w-full truncate text-center text-xs">{f.display_name}</span>
              </button>
            </li>
          ))}
        </ul>
      </Box>
    </div>
  );
}
