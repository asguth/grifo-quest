import { myUserId, rest } from "@/lib/cloud";

/** Comunidade do Grifo Quest Cloud: tipos e chamadas (tabelas do `grifo-cloud`). */

export type Profile = {
  id: string;
  handle: string;
  display_name: string;
  bio: string;
  target: string;
  avatar: string;
  level: number;
  xp: number;
  streak: number;
  show_stats: boolean;
  created_at: string;
};

export type Mini = Pick<Profile, "id" | "handle" | "display_name" | "avatar">;

export const CATEGORIES = { concurso: "Concurso", materia: "Matéria", banca: "Banca", geral: "Geral" } as const;
export type Category = keyof typeof CATEGORIES;

export type Community = {
  id: string;
  name: string;
  description: string;
  category: Category;
  owner_id: string;
  member_count: number;
  created_at: string;
};

export type Role = "owner" | "mod" | "member";
export type Member = { role: Role; user: Mini };

export type Topic = {
  id: string;
  community_id: string;
  author_id: string;
  title: string;
  body: string;
  pinned: boolean;
  locked: boolean;
  reply_count: number;
  last_post_at: string;
  created_at: string;
  author: Mini;
};

export type Post = { id: string; topic_id: string; author_id: string; body: string; created_at: string; author: Mini };
export type Scrap = { id: string; to_id: string; from_id: string; body: string; created_at: string; from: Mini };
export type Testimonial = Scrap & { approved: boolean };
export type Friendship = { requester_id: string; addressee_id: string; status: "pending" | "accepted" };
export type ReportKind = "profile" | "community" | "topic" | "post" | "scrap" | "testimonial";

const MINI = "id,handle,display_name,avatar";
const one = <T,>(rows: T[]): T | null => rows[0] ?? null;
const enc = encodeURIComponent;
/** Busca livre sem quebrar a sintaxe de filtro do PostgREST (vírgula, parênteses, curingas). */
export const searchTerm = (q: string) => q.replace(/[,()*%\\:"']/g, " ").trim();
const RETURN = "return=representation";

// ---- perfis -------------------------------------------------------------------------------

export async function myProfile(): Promise<Profile | null> {
  return one(await rest<Profile[]>(`profiles?id=eq.${await myUserId()}`));
}

export async function profileById(id: string): Promise<Profile | null> {
  return one(await rest<Profile[]>(`profiles?id=eq.${enc(id)}`));
}

export type ProfilePatch = Partial<Pick<Profile, "handle" | "display_name" | "bio" | "target" | "avatar" | "show_stats" | "level" | "xp" | "streak">>;

export async function updateMyProfile(patch: ProfilePatch): Promise<Profile | null> {
  return one(await rest<Profile[]>(`profiles?id=eq.${await myUserId()}`, { method: "PATCH", body: patch, prefer: RETURN }));
}

export async function searchProfiles(q: string): Promise<Mini[]> {
  const t = searchTerm(q);
  if (!t) return [];
  return rest<Mini[]>(`profiles?select=${MINI}&or=(handle.ilike.*${enc(t)}*,display_name.ilike.*${enc(t)}*)&order=display_name&limit=30`);
}

// ---- amigos -------------------------------------------------------------------------------

export function friendsOf(id: string): Promise<Profile[]> {
  return rest<Profile[]>(`rpc/friends_of?uid=${enc(id)}`);
}

const pair = (a: string, b: string) => `or=(and(requester_id.eq.${a},addressee_id.eq.${b}),and(requester_id.eq.${b},addressee_id.eq.${a}))`;

export async function friendshipWith(other: string): Promise<Friendship | null> {
  return one(await rest<Friendship[]>(`friendships?${pair(await myUserId(), other)}`));
}

export function requestFriend(other: string) {
  return rest(`friendships`, { method: "POST", body: { addressee_id: other } });
}

export async function acceptFriend(requester: string) {
  return rest(`friendships?requester_id=eq.${enc(requester)}&addressee_id=eq.${await myUserId()}`, { method: "PATCH", body: { status: "accepted" } });
}

export async function removeFriend(other: string) {
  return rest(`friendships?${pair(await myUserId(), other)}`, { method: "DELETE" });
}

export async function incomingRequests(): Promise<Mini[]> {
  const rows = await rest<{ requester: Mini }[]>(`friendships?addressee_id=eq.${await myUserId()}&status=eq.pending&select=requester:profiles!requester_id(${MINI})&order=created_at.desc`);
  return rows.map((r) => r.requester);
}

// ---- recados e depoimentos ------------------------------------------------------------------

export function scrapsOf(id: string): Promise<Scrap[]> {
  return rest<Scrap[]>(`scraps?to_id=eq.${enc(id)}&select=*,from:profiles!from_id(${MINI})&order=created_at.desc&limit=50`);
}

export function sendScrap(to: string, body: string) {
  return rest(`scraps`, { method: "POST", body: { to_id: to, body } });
}

export function deleteScrap(id: string) {
  return rest(`scraps?id=eq.${enc(id)}`, { method: "DELETE" });
}

export function testimonialsOf(id: string): Promise<Testimonial[]> {
  return rest<Testimonial[]>(`testimonials?to_id=eq.${enc(id)}&select=*,from:profiles!from_id(${MINI})&order=created_at.desc`);
}

export function writeTestimonial(to: string, body: string) {
  return rest(`testimonials`, { method: "POST", body: { to_id: to, body } });
}

export function approveTestimonial(id: string) {
  return rest(`rpc/approve_testimonial`, { method: "POST", body: { tid: id } });
}

export function deleteTestimonial(id: string) {
  return rest(`testimonials?id=eq.${enc(id)}`, { method: "DELETE" });
}

// ---- comunidades --------------------------------------------------------------------------

export function listCommunities(q: string): Promise<Community[]> {
  const t = searchTerm(q);
  const filter = t ? `&name=ilike.*${enc(t)}*` : "";
  return rest<Community[]>(`communities?select=*${filter}&order=member_count.desc,created_at.desc&limit=40`);
}

export async function communitiesOf(user: string): Promise<Community[]> {
  const rows = await rest<{ community: Community }[]>(`community_members?user_id=eq.${enc(user)}&select=community:communities(*)&order=joined_at.desc`);
  return rows.map((r) => r.community);
}

export async function community(id: string): Promise<Community | null> {
  return one(await rest<Community[]>(`communities?id=eq.${enc(id)}`));
}

export function members(id: string): Promise<Member[]> {
  return rest<Member[]>(`community_members?community_id=eq.${enc(id)}&select=role,user:profiles!user_id(${MINI})&order=joined_at&limit=200`);
}

export async function createCommunity(c: Pick<Community, "name" | "description" | "category">): Promise<Community | null> {
  return one(await rest<Community[]>(`communities`, { method: "POST", body: c, prefer: RETURN }));
}

export function joinCommunity(id: string) {
  return rest(`community_members`, { method: "POST", body: { community_id: id } });
}

export async function leaveCommunity(id: string) {
  return rest(`community_members?community_id=eq.${enc(id)}&user_id=eq.${await myUserId()}`, { method: "DELETE" });
}

export function removeMember(community: string, user: string) {
  return rest(`community_members?community_id=eq.${enc(community)}&user_id=eq.${enc(user)}`, { method: "DELETE" });
}

export function deleteCommunity(id: string) {
  return rest(`communities?id=eq.${enc(id)}`, { method: "DELETE" });
}

// ---- fórum --------------------------------------------------------------------------------

export function topicsOf(community: string): Promise<Topic[]> {
  return rest<Topic[]>(`topics?community_id=eq.${enc(community)}&select=*,author:profiles!author_id(${MINI})&order=pinned.desc,last_post_at.desc&limit=60`);
}

export async function topic(id: string): Promise<Topic | null> {
  return one(await rest<Topic[]>(`topics?id=eq.${enc(id)}&select=*,author:profiles!author_id(${MINI})`));
}

export async function createTopic(community: string, title: string, body: string): Promise<Topic | null> {
  return one(await rest<Topic[]>(`topics?select=*,author:profiles!author_id(${MINI})`, { method: "POST", body: { community_id: community, title, body }, prefer: RETURN }));
}

export function setTopicFlags(id: string, flags: Partial<Pick<Topic, "pinned" | "locked">>) {
  return rest(`topics?id=eq.${enc(id)}`, { method: "PATCH", body: flags });
}

export function deleteTopic(id: string) {
  return rest(`topics?id=eq.${enc(id)}`, { method: "DELETE" });
}

export function postsOf(topicId: string): Promise<Post[]> {
  return rest<Post[]>(`posts?topic_id=eq.${enc(topicId)}&select=*,author:profiles!author_id(${MINI})&order=created_at&limit=500`);
}

export function reply(topicId: string, body: string) {
  return rest(`posts`, { method: "POST", body: { topic_id: topicId, body } });
}

export function deletePost(id: string) {
  return rest(`posts?id=eq.${enc(id)}`, { method: "DELETE" });
}

// ---- segurança ----------------------------------------------------------------------------

export function report(kind: ReportKind, target: string, reason: string) {
  return rest(`reports`, { method: "POST", body: { kind, target_id: target, reason } });
}

export function block(user: string) {
  return rest(`blocks`, { method: "POST", body: { blocked_id: user } });
}

export async function unblock(user: string) {
  return rest(`blocks?blocker_id=eq.${await myUserId()}&blocked_id=eq.${enc(user)}`, { method: "DELETE" });
}

export async function blockedIds(): Promise<Set<string>> {
  const rows = await rest<{ blocked_id: string }[]>(`blocks?select=blocked_id`);
  return new Set(rows.map((r) => r.blocked_id));
}

/** @ válido no servidor: 3–20 de a–z, 0–9 e _. */
export function normalizeHandle(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 20);
}

export const HANDLE_OK = /^[a-z0-9_]{3,20}$/;
