import { commands, type CloudAccess } from "@/lib/bindings";

/**
 * Cliente da API do Grifo Quest Cloud (PostgREST do Supabase). O token vem do Rust (`account_access`),
 * que guarda a sessão no cofre do Windows e renova antes de vencer; aqui só fica em memória.
 * Quem libera ou recusa cada leitura/escrita é o RLS do servidor (assinatura ativa).
 */

let cached: CloudAccess | null = null;

async function access(): Promise<CloudAccess> {
  if (cached && (cached.expires_at ?? 0) - Date.now() / 1000 > 60) return cached;
  cached = await commands.accountAccess();
  return cached;
}

/** Esquecer o token (sair da conta, trocar de conta). */
export function forgetCloudAccess() {
  cached = null;
}

export async function myUserId(): Promise<string> {
  return (await access()).user_id;
}

/** Erro do PostgREST → frase em português. */
export function cloudMessage(status: number, body: string): string {
  let code = "";
  let message = "";
  try {
    const v: unknown = JSON.parse(body);
    if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      code = typeof o.code === "string" ? o.code : "";
      message = typeof o.message === "string" ? o.message : "";
    }
  } catch {
    message = body;
  }
  if (code === "P0001" && message) return message; // mensagens do próprio banco (limite de frequência)
  if (code === "23505") return "Isso já existe (nome ou @ repetido).";
  if (code === "23514") return "Texto vazio, longo demais ou em formato inválido.";
  if (code === "42501" || status === 401 || status === 403) return "Sem permissão. Sua assinatura do Grifo Quest Cloud está ativa?";
  if (status === 404) return "Não encontrado (o servidor da comunidade pode estar desatualizado).";
  return `Comunidade (${status}): ${(message || body).slice(0, 200)}`;
}

type Init = { method?: "GET" | "POST" | "PATCH" | "DELETE"; body?: unknown; prefer?: string };

/** Chamada à API REST: `path` relativo a `/rest/v1/` (ex.: `profiles?handle=eq.ana`). */
export async function rest<T>(path: string, init: Init = {}): Promise<T> {
  const a = await access();
  const headers: Record<string, string> = { apikey: a.key, Authorization: `Bearer ${a.token}`, "Content-Type": "application/json" };
  if (init.prefer) headers.Prefer = init.prefer;
  let res: Response;
  try {
    res = await fetch(`${a.url}/rest/v1/${path}`, {
      method: init.method ?? "GET",
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new Error("Sem conexão com a comunidade.");
  }
  const text = await res.text();
  if (!res.ok) throw new Error(cloudMessage(res.status, text));
  return (text ? JSON.parse(text) : null) as T;
}

/** Envia uma imagem nova ao bucket público `media` e devolve o endereço público. */
export async function uploadImage(path: string, image: Blob): Promise<string> {
  const a = await access();
  let res: Response;
  try {
    res = await fetch(`${a.url}/storage/v1/object/media/${path}`, {
      method: "POST",
      // sem upsert: cada foto tem nome novo (o upsert exige mais permissões no Storage)
      headers: { apikey: a.key, Authorization: `Bearer ${a.token}`, "Content-Type": image.type },
      body: image,
    });
  } catch {
    throw new Error("Sem conexão para enviar a foto.");
  }
  if (!res.ok) throw new Error(cloudMessage(res.status, await res.text()));
  return `${a.url}/storage/v1/object/public/media/${path}`;
}
