import { useSyncExternalStore } from "react";
import { commands, events, type TutorTurn } from "@/lib/bindings";
import { toast } from "@/components/toast";
import { emit } from "@/lib/bus";
import { errorMessage, warn } from "@/lib/utils";
import { requestStudyTab } from "./tabRequest";

/**
 * Conversa do Tira-dúvidas FORA da tela: sair da aba no meio de uma resposta não perde nada — ela
 * continua chegando e, se a pessoa não estiver vendo, o Grifinho avisa com "Ver resposta".
 */
export type TutorState = {
  subjectId: number | null;
  topicId: number | null;
  turns: TutorTurn[];
  /** Resposta sendo escrita (o último turno do Grifo ainda está chegando). */
  busy: boolean;
  /** Quando a pergunta foi feita (para o "ainda pensando…"). */
  since: number | null;
};

let state: TutorState = { subjectId: null, topicId: null, turns: [], busy: false, since: null };
const listeners = new Set<() => void>();
const set = (patch: Partial<TutorState>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};

/** A aba está na tela? (sem ela, o fim da resposta vira aviso) */
let visible = false;
export const setTutorVisible = (v: boolean) => {
  visible = v;
};

let question = 0;
let listening = false;

/** Pedaços da resposta (streaming do Ollama) entrando no último turno. Assina uma vez só. */
function listen() {
  if (listening) return;
  listening = true;
  events.tutorToken
    .listen(({ payload }) => {
      if (payload.id !== question || !state.busy) return;
      const turns = state.turns.slice();
      const last = turns[turns.length - 1];
      turns[turns.length - 1] = { ...last, text: last.text + payload.text };
      set({ turns });
    })
    .catch((e) => warn("assinar respostas do Grifo", e));
}

export function useTutor(): TutorState {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => state,
  );
}

export function setTutorContext(subjectId: number | null, topicId: number | null) {
  // trocar de matéria começa outra conversa
  if (subjectId !== state.subjectId) set({ subjectId, topicId, turns: [] });
  else set({ topicId });
}

export function clearTutor() {
  if (!state.busy) set({ turns: [] });
}

export async function askTutor(text: string) {
  const q = text.trim();
  if (!q || state.busy) return;
  listen();
  const id = ++question;
  const history: TutorTurn[] = [...state.turns, { role: "aluno", text: q }];
  set({ turns: [...history, { role: "grifo", text: "" }], busy: true, since: Date.now() });
  try {
    const answer = await commands.askTutor(id, state.subjectId, state.topicId, history);
    const turns = state.turns.slice();
    turns[turns.length - 1] = { role: "grifo", text: answer };
    set({ turns, busy: false, since: null });
    if (!visible) {
      toast("Respondi a sua dúvida!", "success", {
        label: "Ver resposta",
        onClick: () => {
          requestStudyTab("duvidas");
          emit("navigate", "foco");
        },
      });
    }
  } catch (e) {
    const turns = state.turns.slice(0, -1);
    set({ turns, busy: false, since: null });
    toast(`O Grifo não conseguiu responder: ${errorMessage(e)}`, "error");
  }
}
