export { cn } from "cn";

/** Mensagem legível de um erro vindo de um command Tauri (AppError) ou do JS. */
export function errorMessage(e: unknown): string {
  if (typeof e === "object" && e !== null && "message" in e) return String(e.message);
  return String(e);
}

/**
 * Falha de algo que roda em segundo plano (carga de painel, preferência): não interrompe o usuário,
 * fica no console. Ações que o usuário pediu usam `toastError`.
 */
export function warn(what: string, e: unknown) {
  console.warn(`[grifo] ${what}:`, errorMessage(e));
}
