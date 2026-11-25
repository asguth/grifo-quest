import { myUserId, rest, uploadImage } from "@/lib/cloud";
import { coverWebp, photoName, squareWebp } from "@/lib/image";

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
  photo_url: string | null;
  cover_url: string | null;
  /** Plano ativo (selo), calculado pelo servidor. */
  badge?: string | null;
  share_activity: boolean;
  share_exam: boolean;
  exam_name: string | null;
  exam_date: string | null;
  created_at: string;
};

export type Mini = Pick<Profile, "id" | "handle" | "display_name" | "avatar" | "photo_url" | "badge">;

export const CATEGORIES = { concurso: "Concurso", materia: "Matéria", banca: "Banca", geral: "Geral" } as const;
export type Category = keyof typeof CATEGORIES;

export type Community = {
  id: string;
  name: string;
  description: string;
  category: Category;
  owner_id: string;
  member_count: number;
  photo_url: string | null;
  /** Capa larga (moderador troca). */
  cover_url?: string | null;
  /** Regras da comunidade (moderador edita). */
  rules?: string;
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
export type Friendship = { requester_id: string; addressee_id: string; status: "pending" | "accepted" };
export type ReportKind = "profile" | "community" | "topic" | "post" | "scrap" | "testimonial" | "feed" | "comment";

const MINI = "id,handle,display_name,avatar,photo_url,badge";
const one = <T,>(rows: T[]): T | null => rows[0] ?? null;
const enc = encodeURIComponent;
/** Busca livre sem quebrar a sintaxe de filtro do PostgREST (vírgula, parênteses, curingas). */
export const searchTerm = (q: string) => q.replace(/[,()*%\\:"']/g, " ").trim();
const RETURN = "return=representation";

// ---- perfis -------------------------------------------------------------------------------

export async function myProfile(): Promise<Profile | null> {
  return one(await rest<Profile[]>(`profiles?id=eq.${await myUserId()}&select=*,badge`));
}

export async function profileById(id: string): Promise<Profile | null> {
  return one(await rest<Profile[]>(`profiles?id=eq.${enc(id)}&select=*,badge`));
}

export type ProfilePatch = Partial<
  Pick<Profile, "handle" | "display_name" | "bio" | "target" | "avatar" | "show_stats" | "level" | "xp" | "streak" | "photo_url" | "cover_url" | "share_activity" | "share_exam" | "exam_name" | "exam_date">
>;

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
  return rest<Profile[]>(`rpc/friends_of?uid=${enc(id)}&select=*,badge`);
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

// ---- fotos --------------------------------------------------------------------------------

/** Troca a foto de perfil: recorta, envia e grava o endereço no perfil. */
export async function setMyPhoto(file: File): Promise<string> {
  const url = await uploadImage(`avatars/${await myUserId()}/${photoName()}`, await squareWebp(file, 320));
  await updateMyProfile({ photo_url: url });
  return url;
}

/** Capa do perfil (faixa larga no topo). */
export async function uploadMyCover(file: File): Promise<string> {
  return uploadImage(`avatars/${await myUserId()}/cover-${photoName()}`, await coverWebp(file));
}

/** Foto de perfil enviada (sem gravar no perfil: o Editar perfil grava tudo junto ao salvar). */
export async function uploadMyPhoto(file: File): Promise<string> {
  return uploadImage(`avatars/${await myUserId()}/${photoName()}`, await squareWebp(file, 320));
}

/** Foto da comunidade (dono ou moderador). */
export async function setCommunityPhoto(id: string, file: File): Promise<string> {
  const url = await uploadImage(`communities/${id}/${photoName()}`, await squareWebp(file, 480));
  await rest(`communities?id=eq.${enc(id)}`, { method: "PATCH", body: { photo_url: url } });
  return url;
}

/** Capa da comunidade (dono ou moderador). */
export async function setCommunityCover(id: string, file: File): Promise<string> {
  const url = await uploadImage(`communities/${id}/cover-${photoName()}`, await coverWebp(file));
  await rest(`communities?id=eq.${enc(id)}`, { method: "PATCH", body: { cover_url: url } });
  return url;
}

/** Moderador promove membro; só o dono tira alguém da moderação (o servidor confere). */
export function setMemberRole(community: string, user: string, role: Exclude<Role, "owner">) {
  return rest("rpc/set_member_role", { method: "POST", body: { cid: community, uid: user, new_role: role } });
}

export function updateCommunity(id: string, patch: Partial<Pick<Community, "name" | "description" | "category" | "rules">>) {
  return rest(`communities?id=eq.${enc(id)}`, { method: "PATCH", body: patch });
}

// ---- mural --------------------------------------------------------------------------------

export type FeedKind = "post" | "question" | "activity";
export type Activity = { minutes?: number; questions?: number; correct?: number; xp?: number; subject?: string };

export type FeedItem = {
  id: string;
  author_id: string;
  kind: FeedKind;
  community_id: string | null;
  body: string;
  data: Activity;
  solved: boolean;
  accepted_comment: string | null;
  feather_count: number;
  comment_count: number;
  created_at: string;
  author: Mini;
  community: Pick<Community, "id" | "name" | "photo_url"> | null;
};

export type FeedComment = { id: string; item_id: string; author_id: string; body: string; created_at: string; author: Mini };

const ITEM = `*,author:profiles!author_id(${MINI}),community:communities(id,name,photo_url)`;

/** Mural de casa (você, amigos e suas comunidades), mais novo primeiro; `before` pagina. */
export function homeFeed(before?: string): Promise<FeedItem[]> {
  const b = before ? `&before=${enc(before)}` : "";
  return rest<FeedItem[]>(`rpc/home_feed?lim=20${b}&select=${ITEM}`);
}

export function communityFeed(id: string, before?: string): Promise<FeedItem[]> {
  const b = before ? `&created_at=lt.${enc(before)}` : "";
  return rest<FeedItem[]>(`feed_items?community_id=eq.${enc(id)}${b}&select=${ITEM}&order=created_at.desc&limit=20`);
}

export async function feedItem(id: string): Promise<FeedItem | null> {
  return one(await rest<FeedItem[]>(`feed_items?id=eq.${enc(id)}&select=${ITEM}`));
}

/** Atividades de hoje (Brasília) destas pessoas: quem já estudou hoje. */
export async function studiedToday(people: string[]): Promise<Set<string>> {
  if (people.length === 0) return new Set();
  const start = new Date(`${brasiliaDay()}T00:00:00-03:00`).toISOString();
  const rows = await rest<{ author_id: string }[]>(
    `feed_items?kind=eq.activity&created_at=gte.${enc(start)}&author_id=in.(${people.map(enc).join(",")})&select=author_id`,
  );
  return new Set(rows.map((r) => r.author_id));
}

export function profileFeed(id: string): Promise<FeedItem[]> {
  return rest<FeedItem[]>(`feed_items?author_id=eq.${enc(id)}&select=${ITEM}&order=created_at.desc&limit=20`);
}

export async function publish(item: { kind: FeedKind; body: string; community_id?: string | null; data?: Activity }): Promise<FeedItem | null> {
  return one(await rest<FeedItem[]>(`feed_items?select=${ITEM}`, { method: "POST", body: item, prefer: RETURN }));
}

export function deleteItem(id: string) {
  return rest(`feed_items?id=eq.${enc(id)}`, { method: "DELETE" });
}

/** Dúvida resolvida, com a resposta escolhida em destaque (`null` = volta a aberta). */
export function markSolved(id: string, comment: string | null) {
  return rest(`feed_items?id=eq.${enc(id)}`, { method: "PATCH", body: { solved: comment !== null, accepted_comment: comment } });
}

/** Quais destes itens já têm a minha pena. */
export async function myFeathers(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await rest<{ item_id: string }[]>(`feathers?user_id=eq.${await myUserId()}&item_id=in.(${ids.map(enc).join(",")})&select=item_id`);
  return new Set(rows.map((r) => r.item_id));
}

export function giveFeather(item: string) {
  return rest(`feathers`, { method: "POST", body: { item_id: item } });
}

export async function takeFeather(item: string) {
  return rest(`feathers?item_id=eq.${enc(item)}&user_id=eq.${await myUserId()}`, { method: "DELETE" });
}

export function commentsOf(item: string): Promise<FeedComment[]> {
  return rest<FeedComment[]>(`feed_comments?item_id=eq.${enc(item)}&select=*,author:profiles!author_id(${MINI})&order=created_at&limit=200`);
}

export function comment(item: string, body: string) {
  return rest(`feed_comments`, { method: "POST", body: { item_id: item, body } });
}

export function deleteComment(id: string) {
  return rest(`feed_comments?id=eq.${enc(id)}`, { method: "DELETE" });
}

// ---- notificações -------------------------------------------------------------------------

export type NotificationKind = "scrap" | "testimonial" | "friend_request" | "friend_accept" | "feather" | "comment" | "reply";
export type Notification = { id: string; kind: NotificationKind; ref_id: string | null; read: boolean; created_at: string; actor: Mini };

export function notifications(): Promise<Notification[]> {
  return rest<Notification[]>(`notifications?select=id,kind,ref_id,read,created_at,actor:profiles!actor_id(${MINI})&order=created_at.desc&limit=40`);
}

export async function unreadCount(): Promise<number> {
  const rows = await rest<{ id: string }[]>(`notifications?read=eq.false&select=id&limit=99`);
  return rows.length;
}

export function markRead(ids: string[]) {
  return rest(`notifications?id=in.(${ids.map(enc).join(",")})`, { method: "PATCH", body: { read: true } });
}

export function markAllRead() {
  return rest(`notifications?read=eq.false`, { method: "PATCH", body: { read: true } });
}

// ---- liga e recados recentes --------------------------------------------------------------

export type LeagueRow = Mini & { xp: number };

export function weeklyLeague(): Promise<LeagueRow[]> {
  return rest<LeagueRow[]>(`rpc/weekly_league`);
}

// ---- questão do dia -----------------------------------------------------------------------

export type DailyQuestion = { id: string; community_id: string; day: string; statement: string; options: string[]; created_at: string };
export type DailyResult = { choice: number; answer: number; explanation: string; votes: number[] };

const DAILY = "id,community_id,day,statement,options,created_at";

/** Dia de hoje no fuso de Brasília (o servidor usa o mesmo para `day`). */
export function brasiliaDay(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(now);
}

export async function dailyQuestion(community: string): Promise<DailyQuestion | null> {
  return one(await rest<DailyQuestion[]>(`daily_questions?community_id=eq.${enc(community)}&day=eq.${brasiliaDay()}&select=${DAILY}`));
}

export type DailyWithCommunity = DailyQuestion & { community: { name: string } };

/** Questão do dia de uma comunidade sua (para o mural de casa). */
export async function dailyFromMine(): Promise<DailyWithCommunity | null> {
  const ids = (await communitiesOf(await myUserId())).map((c) => c.id);
  if (ids.length === 0) return null;
  return one(
    await rest<DailyWithCommunity[]>(
      `daily_questions?community_id=in.(${ids.join(",")})&day=eq.${brasiliaDay()}&select=${DAILY},community:communities(name)&order=created_at&limit=1`,
    ),
  );
}

export async function createDaily(community: string, q: { statement: string; options: string[]; answer: number; explanation: string }): Promise<DailyQuestion | null> {
  return one(await rest<DailyQuestion[]>(`daily_questions?select=${DAILY}`, { method: "POST", body: { community_id: community, ...q }, prefer: RETURN }));
}

export function dailyResult(id: string): Promise<DailyResult | null> {
  return rest<DailyResult | null>(`rpc/daily_result`, { method: "POST", body: { qid: id } });
}

export function answerDaily(id: string, pick: number): Promise<DailyResult | null> {
  return rest<DailyResult | null>(`rpc/answer_daily`, { method: "POST", body: { qid: id, pick } });
}

// ---- mensagens privadas -------------------------------------------------------------------

export type Message = { id: string; from_id: string; to_id: string; body: string; read_at: string | null; created_at: string };
export type Conversation = Mini & { last_body: string; last_at: string; last_from_me: boolean; unread: number };

export function conversations(): Promise<Conversation[]> {
  return rest<Conversation[]>(`rpc/conversations`);
}

/** Conversa com alguém, da mais antiga para a mais nova (últimas 200). */
export async function thread(other: string): Promise<Message[]> {
  const me = await myUserId();
  const o = enc(other);
  const rows = await rest<Message[]>(
    `messages?or=(and(from_id.eq.${me},to_id.eq.${o}),and(from_id.eq.${o},to_id.eq.${me}))&order=created_at.desc&limit=200`,
  );
  return rows.reverse();
}

export async function sendMessage(to: string, body: string): Promise<Message | null> {
  return one(await rest<Message[]>(`messages`, { method: "POST", body: { to_id: to, body }, prefer: RETURN }));
}

export async function markThreadRead(other: string) {
  return rest(`messages?from_id=eq.${enc(other)}&to_id=eq.${await myUserId()}&read_at=is.null`, { method: "PATCH", body: { read_at: new Date().toISOString() } });
}

export async function unreadMessages(): Promise<number> {
  const rows = await rest<{ id: string }[]>(`messages?to_id=eq.${await myUserId()}&read_at=is.null&select=id&limit=99`);
  return rows.length;
}
