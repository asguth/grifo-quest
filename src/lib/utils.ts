export { cn } from "cn"

/** Mensagem legível de um erro vindo de um command Tauri (AppError) ou do JS. */
export function errorMessage(e: unknown): string {
  if (typeof e === "object" && e !== null && "message" in e) return String(e.message);
  return String(e);
}
