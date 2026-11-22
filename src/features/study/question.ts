import { toast, toastError } from "@/components/toast";
import { commands } from "@/lib/bindings";
import { warn } from "@/lib/utils";

/** Letras das alternativas (múltipla escolha A–E). */
export const LETTERS = ["A", "B", "C", "D", "E"];

/** Resposta como o aluno lê: C/E viram Certo/Errado; letras ficam como estão. */
export function answerLabel(a: string): string {
  return a === "C" ? "Certo" : a === "E" ? "Errado" : a;
}

/** Alternativas guardadas como JSON no caderno de erros. */
export function parseOptions(json: string): string[] {
  try {
    const v: unknown = JSON.parse(json || "[]");
    return Array.isArray(v) ? v.map(String) : [];
  } catch (e) {
    warn("alternativas ilegíveis no caderno de erros", e);
    return [];
  }
}

/** Vira flashcard a questão (geralmente a que você errou). */
export async function questionToCard(questionId: number) {
  try {
    const n = await commands.cardFromQuestion(questionId);
    toast(n ? "Virou flashcard" : "Já estava no baralho", "success");
  } catch (e) {
    toastError(e);
  }
}

/** Questão com problema: pergunta antes, tira das sessões e do caderno. `true` se reportou. */
export async function reportQuestion(questionId: number): Promise<boolean> {
  if (!window.confirm("Reportar esta questão? Ela sai das sessões e do caderno de erros (seu histórico fica).")) return false;
  try {
    await commands.reportQuestion(questionId);
    toast("Questão reportada: não volta mais", "success");
    return true;
  } catch (e) {
    toastError(e);
    return false;
  }
}

export const REPORT_HINT = "Gabarito errado, enunciado sem texto-base, lei desatualizada…";
