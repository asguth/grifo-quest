import { BookOpen, GraduationCap, Globe, House, Settings, Swords, Users, type LucideIcon } from "lucide-react";
import type { NavBadges } from "@/lib/bindings";

/** Telas do menu lateral, na ordem dos atalhos 1–7, Configurações sempre por último (Comunidade só aparece para assinante do Cloud). O id é o mesmo que o backend manda em `NavigateTo`. */
export const SLOTS = [
  { id: "diario", label: "Início", icon: House },
  { id: "foco", label: "Estudo", icon: Swords },
  { id: "sala", label: "Sala de aula", icon: GraduationCap },
  { id: "materias", label: "Matérias", icon: BookOpen },
  { id: "mundo", label: "Mundo", icon: Globe },
  { id: "comunidade", label: "Comunidade", icon: Users },
  { id: "config", label: "Configurações", icon: Settings },
] as const satisfies readonly { id: string; label: string; icon: LucideIcon }[];

export type SlotId = (typeof SLOTS)[number]["id"];
export type Navigate = (slot: SlotId) => void;

/** Texto vindo de fora (evento do backend) → tela conhecida, ou `null`. */
export function toSlot(s: string): SlotId | null {
  return SLOTS.find((x) => x.id === s)?.id ?? null;
}

/** Contador de cada tela no menu. */
export function badgeOf(b: NavBadges): Partial<Record<SlotId, number>> {
  return { mundo: b.unread_news, sala: b.reviews_due, foco: b.study_due };
}

/** Telas visíveis: Comunidade só com acesso (build Cloud + assinatura ativa). */
export function visibleSlots(community: boolean) {
  return SLOTS.filter((s) => s.id !== "comunidade" || community);
}
