import { commands, type SessionReport } from "@/lib/bindings";
import { myProfile, publish } from "./api";

/**
 * Fim de uma sessão de questões → card no mural dos amigos (e XP na liga da semana), só se a pessoa
 * ligou "Compartilhar meus estudos". Fora da versão Cloud, sem login ou sem assinatura, não faz nada.
 */
export async function shareSession(r: SessionReport): Promise<void> {
  if (r.total === 0) return;
  const s = await commands.accountStatus();
  if (!s.available || !s.signed_in) return;
  const p = await myProfile().catch(() => null);
  if (!p?.share_activity) return;
  const top = [...r.by_subject].sort((a, b) => b.total - a.total)[0];
  await publish({
    kind: "activity",
    body: "",
    data: {
      minutes: Math.max(1, Math.round(r.seconds / 60)),
      questions: r.total,
      correct: r.correct,
      xp: Math.min(Math.max(r.xp, 0), 9999),
      ...(top ? { subject: top.subject } : {}),
    },
  });
}
