import type { Mini, Notification, NotificationKind } from "./api";

/** Notificações parecidas juntas: penas e comentários no mesmo post viram uma linha só. */
export type NotificationGroup = {
  key: string;
  kind: NotificationKind;
  ref_id: string | null;
  actors: Mini[];
  ids: string[];
  unread: boolean;
  created_at: string;
};

const GROUPED: NotificationKind[] = ["feather", "comment", "reply"];

export function groupNotifications(list: Notification[]): NotificationGroup[] {
  const groups = new Map<string, NotificationGroup>();
  for (const n of list) {
    const key = GROUPED.includes(n.kind) && n.ref_id ? `${n.kind}:${n.ref_id}` : n.id;
    const g = groups.get(key);
    if (!g) {
      groups.set(key, { key, kind: n.kind, ref_id: n.ref_id, actors: [n.actor], ids: [n.id], unread: !n.read, created_at: n.created_at });
      continue;
    }
    g.ids.push(n.id);
    g.unread ||= !n.read;
    if (!g.actors.some((a) => a.id === n.actor.id)) g.actors.push(n.actor);
    if (n.created_at > g.created_at) g.created_at = n.created_at;
  }
  return [...groups.values()].sort((a, b) => b.created_at.localeCompare(a.created_at));
}

const VERB: Record<NotificationKind, [string, string]> = {
  scrap: ["deixou um recado para você", "deixaram recados para você"],
  testimonial: ["escreveu um depoimento sobre você", "escreveram depoimentos sobre você"],
  friend_request: ["quer ser seu amigo", "querem ser seus amigos"],
  friend_accept: ["aceitou seu pedido de amizade", "aceitaram seu pedido de amizade"],
  feather: ["deu uma pena na sua publicação", "deram penas na sua publicação"],
  comment: ["comentou na sua publicação", "comentaram na sua publicação"],
  reply: ["respondeu seu tópico", "responderam seu tópico"],
};

/** "Ana", "Ana e Bruno", "Ana e mais 3" + o verbo no singular ou plural. */
export function describe(g: Pick<NotificationGroup, "kind" | "actors">): { who: string; what: string } {
  const [first, second] = g.actors;
  const n = g.actors.length;
  const who = n <= 1 ? (first?.display_name ?? "Alguém") : n === 2 ? `${first?.display_name} e ${second?.display_name}` : `${first?.display_name} e mais ${n - 1}`;
  const [one, many] = VERB[g.kind];
  return { who, what: n > 1 ? many : one };
}
