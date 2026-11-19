import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/8bit/button";
import { Button as PlainButton } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { commands, type Subject, type SubjectInput, type Topic, type TopicStatus } from "@/lib/bindings";
import { errorMessage } from "@/lib/utils";

const EMPTY: SubjectInput = { name: "", color: "#e0a84f", exam_weight: 1 };
const STATUS_LABEL: Record<TopicStatus, string> = {
  nao_visto: "Não visto",
  estudando: "Estudando",
  dominado: "Dominado",
};

export default function SubjectsScreen() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [form, setForm] = useState<SubjectInput>(EMPTY);
  const [editing, setEditing] = useState<number | null>(null);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    try {
      setSubjects(await commands.listSubjects());
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  useEffect(() => void reload(), [reload]);

  async function run(action: () => Promise<unknown>) {
    try {
      await action();
      setError("");
      await reload();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    void run(async () => {
      if (editing === null) await commands.createSubject(form);
      else await commands.updateSubject(editing, form);
      setForm(EMPTY);
      setEditing(null);
    });
  }

  function startEdit(s: Subject) {
    setEditing(s.id);
    setForm({ name: s.name, color: s.color, exam_weight: s.exam_weight ?? 1 });
  }

  function remove(s: Subject) {
    if (!confirm(`Apagar "${s.name}" com todos os tópicos e lançamentos?`)) return;
    void run(async () => {
      await commands.deleteSubject(s.id);
      if (selected === s.id) setSelected(null);
    });
  }

  const current = subjects.find((s) => s.id === selected);

  return (
    <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-[1fr_1.3fr]">
      <section className="space-y-4">
        <h1 className="retro text-sm text-primary">Matérias</h1>

        <form onSubmit={submit} className="space-y-3 rounded-lg bg-card p-4">
          <div className="space-y-1">
            <Label htmlFor="subject-name">Nome</Label>
            <Input
              id="subject-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Direito Constitucional"
            />
          </div>
          <div className="flex gap-3">
            <div className="space-y-1">
              <Label htmlFor="subject-color">Cor</Label>
              <input
                id="subject-color"
                type="color"
                value={form.color}
                onChange={(e) => setForm({ ...form, color: e.target.value })}
                className="h-9 w-14 cursor-pointer rounded border border-input bg-transparent"
              />
            </div>
            <div className="flex-1 space-y-1">
              <Label htmlFor="subject-weight">Peso no edital</Label>
              <Input
                id="subject-weight"
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={form.exam_weight ?? 1}
                onChange={(e) => setForm({ ...form, exam_weight: e.target.valueAsNumber || 0 })}
              />
            </div>
          </div>
          <div className="flex gap-3 pt-1">
            <Button type="submit" font="normal">
              {editing === null ? "Adicionar" : "Salvar"}
            </Button>
            {editing !== null && (
              <PlainButton type="button" variant="ghost" onClick={() => (setEditing(null), setForm(EMPTY))}>
                Cancelar
              </PlainButton>
            )}
          </div>
        </form>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <ul className="space-y-1">
          {subjects.map((s) => (
            <li
              key={s.id}
              className={`flex items-center gap-2 rounded-md px-3 py-2 ${s.id === selected ? "bg-secondary" : "hover:bg-card"}`}
            >
              <span className="size-3 shrink-0 rounded-sm" style={{ background: s.color }} />
              <button className="flex-1 text-left" onClick={() => setSelected(s.id)}>
                {s.name}
                <span className="ml-2 text-xs text-muted-foreground">peso {s.exam_weight ?? 1}</span>
              </button>
              <PlainButton size="sm" variant="ghost" onClick={() => startEdit(s)}>
                Editar
              </PlainButton>
              <PlainButton size="sm" variant="ghost" className="text-destructive" onClick={() => remove(s)}>
                Apagar
              </PlainButton>
            </li>
          ))}
          {subjects.length === 0 && <li className="text-sm text-muted-foreground">Nenhuma matéria ainda.</li>}
        </ul>
      </section>

      {current ? (
        <TopicsPanel key={current.id} subject={current} />
      ) : (
        <p className="self-center text-center text-muted-foreground">Escolha uma matéria para ver os tópicos.</p>
      )}
    </div>
  );
}

function TopicsPanel({ subject }: { subject: Subject }) {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [paste, setPaste] = useState("");
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    setTopics(await commands.listTopics(subject.id));
  }, [subject.id]);

  useEffect(() => void reload().catch((e) => setError(errorMessage(e))), [reload]);

  async function run(action: () => Promise<unknown>) {
    try {
      await action();
      setError("");
      await reload();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">
        Tópicos de <span style={{ color: subject.color }}>{subject.name}</span>
      </h2>

      <div className="space-y-2 rounded-lg bg-card p-4">
        <Label htmlFor="topics-paste">Cole os tópicos do edital (um por linha)</Label>
        <Textarea
          id="topics-paste"
          rows={5}
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          placeholder={"Princípios fundamentais\nDireitos e garantias fundamentais\n..."}
        />
        <Button
          font="normal"
          disabled={!paste.trim()}
          onClick={() => void run(() => commands.addTopics(subject.id, paste).then(() => setPaste("")))}
        >
          Adicionar tópicos
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <ul className="space-y-1">
        {topics.map((t) => (
          <li key={t.id} className="flex items-center gap-2 rounded-md px-3 py-1.5 hover:bg-card">
            <span className="flex-1">{t.name}</span>
            <select
              aria-label={`Status de ${t.name}`}
              value={t.status}
              onChange={(e) => void run(() => commands.setTopicStatus(t.id, e.target.value as TopicStatus))}
              className="rounded border border-input bg-background px-2 py-1 text-sm"
            >
              {Object.entries(STATUS_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <PlainButton
              size="sm"
              variant="ghost"
              className="text-destructive"
              aria-label={`Apagar ${t.name}`}
              onClick={() => void run(() => commands.deleteTopic(t.id))}
            >
              ×
            </PlainButton>
          </li>
        ))}
        {topics.length === 0 && <li className="text-sm text-muted-foreground">Sem tópicos ainda.</li>}
      </ul>
    </section>
  );
}
