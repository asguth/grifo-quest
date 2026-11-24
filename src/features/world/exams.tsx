import { useCallback, useEffect, useState } from "react";
import { toast, toastError } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { commands, type Contest_Serialize as Contest, type Exam_Serialize as Exam, type ExamInput_Deserialize as ExamInput } from "@/lib/bindings";
import { sfx } from "@/lib/sound";
import { warn } from "@/lib/utils";

/** Provas marcadas (a mais próxima primeiro), com criar e apagar. Erros viram aviso. */
export function useExams() {
  const [exams, setExams] = useState<Exam[]>([]);
  const reload = useCallback(() => void commands.listExams().then(setExams, toastError), []);
  useEffect(reload, [reload]);

  const remove = async (id: number) => {
    try {
      await commands.deleteExam(id);
      reload();
    } catch (e) {
      toastError(e);
    }
  };
  return { exams, reload, remove };
}

/** Marca uma prova. `true` se deu certo (a contagem regressiva já aparece no Início). */
export async function createExam(input: ExamInput): Promise<boolean> {
  try {
    await commands.createExam(input);
    sfx("coin");
    return true;
  } catch (e) {
    toastError(e);
    return false;
  }
}

/** A prova mais próxima (preenche cargo e banca do importador de edital). Carrega quando `active`. */
export function useNextExam(active = true) {
  const [exam, setExam] = useState<Exam | null>(null);
  useEffect(() => {
    if (active) void commands.listExams().then((e) => setExam(e[0] ?? null), (e) => warn("ler as provas", e));
  }, [active]);
  return exam;
}

const EMPTY = { name: "", exam_date: "", banca: "", role: "" };

/** Formulário de uma linha para marcar prova. */
export function ExamForm({ onCreated }: { onCreated: () => void }) {
  const [form, setForm] = useState(EMPTY);
  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (await createExam({ name: form.name, exam_date: form.exam_date, banca: form.banca || null, role: form.role || null })) {
      setForm(EMPTY);
      onCreated();
    }
  }

  return (
    // container próprio: o formulário também aparece no assistente inicial, fora da área principal
    <form onSubmit={submit} className="@container">
      <div className="grid gap-2 @2xl:grid-cols-[minmax(0,1.4fr)_150px_minmax(0,1fr)_minmax(0,1fr)_auto]">
      <Input value={form.name} onChange={set("name")} placeholder="Prova (ex.: TRT-2)" aria-label="Nome da prova" />
      <Input type="date" value={form.exam_date} onChange={set("exam_date")} aria-label="Data da prova" />
      <Input value={form.banca} onChange={set("banca")} placeholder="Banca" aria-label="Banca" />
      <Input value={form.role} onChange={set("role")} placeholder="Cargo" aria-label="Cargo" />
      <Button type="submit" disabled={!form.name || !form.exam_date}>
        Adicionar
      </Button>
      </div>
    </form>
  );
}

/** Rastreador: o Claude pesquisa concursos da área configurada (1–3 min). */
export function useContestSearch(onFound: () => void) {
  const [searching, setSearching] = useState(false);
  async function search() {
    setSearching(true);
    try {
      const n = await commands.searchContestsWithClaude();
      toast(n > 0 ? `${n} concursos novos encontrados` : "Nada novo por enquanto", n > 0 ? "success" : "info");
      onFound();
    } catch (e) {
      toastError(e);
    } finally {
      setSearching(false);
    }
  }
  return { searching, search };
}

/** Segue/deixa de seguir um concurso. `true` se mudou. */
export async function toggleFollow(c: Contest): Promise<boolean> {
  sfx(c.followed ? "nav" : "coin");
  try {
    await commands.setContestFollowed(c.id, !c.followed);
    return true;
  } catch (e) {
    toastError(e);
    return false;
  }
}
