import { useSyncExternalStore } from "react";
import { commands, events, type TutorModel, type TutorTurn } from "@/lib/bindings";
import { toast } from "@/components/toast";
import { emit } from "@/lib/bus";
import { getPref, setPref } from "@/lib/prefs";
import { errorMessage, warn } from "@/lib/utils";
import { requestStudyTab } from "./tabRequest";

/** Fala na tela: o que vai ao backend (`TutorTurn`) mais quem respondeu e quando. */
export type ChatTurn = TutorTurn & { by?: string; at: number; stopped?: boolean };

/**
 * Conversa do Tira-dúvidas FORA da tela: sair da aba no meio de uma resposta não perde nada — ela
 * continua chegando e, se a pessoa não estiver vendo, o Grifinho avisa com "Ver resposta".
 */
export type TutorState = {
  subjectId: number | null;
  topicId: number | null;
  turns: ChatTurn[];
  /** Resposta sendo escrita (o último turno do Grifo ainda está chegando). */
  busy: boolean;
  /** Quando a pergunta foi feita (para o "ainda pensando…"). */
  since: number | null;
  /** IA escolhida (`id` de `tutor_models`); "auto" segue Configurações → IA. */
  model: string;
  /** IAs prontas agora; `null` = carregando. */
  models: TutorModel[] | null;
};

export const AUTO_MODEL = "auto";

let state: TutorState = { subjectId: null, topicId: null, turns: [], busy: false, since: null, model: AUTO_MODEL, models: null };
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

/** Lista as IAs prontas e volta para a escolhida da última vez (se ela ainda existir). */
export async function loadTutorModels() {
  try {
    const [models, saved] = await Promise.all([commands.tutorModels(), getPref("tutor_model")]);
    const model = saved && models.some((m) => m.id === saved) ? saved : state.model;
    set({ models, model: models.some((m) => m.id === model) ? model : AUTO_MODEL });
  } catch (e) {
    warn("listar as IAs do Tira-dúvidas", e);
    set({ models: [] });
  }
}

export function setTutorModel(model: string) {
  set({ model });
  setPref("tutor_model", model).catch((e) => warn("salvar a IA do Tira-dúvidas", e));
}

export function setTutorContext(subjectId: number | null, topicId: number | null) {
  // trocar de matéria começa outra conversa
  if (subjectId !== state.subjectId) {
    if (state.busy) question++; // a resposta da conversa antiga não cai na nova
    set({ subjectId, topicId, turns: [], busy: false, since: null });
  } else set({ topicId });
}

export function clearTutor() {
  if (!state.busy) set({ turns: [] });
}

/** Para de esperar: o que já chegou fica na tela; o resto da resposta é ignorado. */
export function stopTutor() {
  if (!state.busy) return;
  question++;
  const turns = state.turns.slice();
  const last = turns[turns.length - 1];
  if (last.text.trim()) turns[turns.length - 1] = { ...last, stopped: true };
  else turns.pop();
  set({ turns, busy: false, since: null });
}

export async function askTutor(text: string) {
  const q = text.trim();
  if (!q || state.busy) return;
  listen();
  const id = ++question;
  const now = Date.now();
  const history: ChatTurn[] = [...state.turns, { role: "aluno", text: q, at: now }];
  set({ turns: [...history, { role: "grifo", text: "", at: now }], busy: true, since: now });
  try {
    const answer = await commands.askTutor(
      id,
      state.subjectId,
      state.topicId,
      history.map(({ role, text }) => ({ role, text })),
      state.model,
    );
    if (id !== question) return; // parou ou começou outra conversa
    const turns = state.turns.slice();
    turns[turns.length - 1] = { role: "grifo", text: answer.text, by: answer.by, at: Date.now() };
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
    if (id !== question) return;
    set({ turns: state.turns.slice(0, -1), busy: false, since: null });
    toast(`O Grifo não conseguiu responder: ${errorMessage(e)}`, "error");
  }
}
