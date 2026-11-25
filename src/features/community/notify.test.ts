import { describe as suite, expect, it } from "vitest";
import type { Notification } from "./api";
import { describe, groupNotifications } from "./notify";

const actor = (id: string) => ({ id, handle: id, display_name: id.toUpperCase(), avatar: "base", photo_url: null });
const n = (id: string, kind: Notification["kind"], who: string, ref: string | null, at: string, read = false): Notification => ({
  id,
  kind,
  ref_id: ref,
  read,
  created_at: at,
  actor: actor(who),
});

suite("notificações", () => {
  it("junta penas no mesmo post e separa recados", () => {
    const g = groupNotifications([
      n("1", "feather", "ana", "p1", "2026-11-25T10:00:00Z"),
      n("2", "feather", "bia", "p1", "2026-11-25T11:00:00Z", true),
      n("3", "scrap", "ana", "s1", "2026-11-25T09:00:00Z"),
      n("4", "scrap", "ana", "s2", "2026-11-25T08:00:00Z"),
    ]);
    expect(g).toHaveLength(3);
    expect(g[0]?.actors.map((a) => a.id)).toEqual(["ana", "bia"]);
    expect(g[0]?.unread).toBe(true);
    expect(g[0]?.created_at).toBe("2026-11-25T11:00:00Z");
  });

  it("frase no singular e no plural", () => {
    expect(describe({ kind: "feather", actors: [actor("ana")] })).toEqual({ who: "ANA", what: "deu uma pena na sua publicação" });
    expect(describe({ kind: "feather", actors: [actor("ana"), actor("bia"), actor("caio")] }).who).toBe("ANA e mais 2");
  });
});
