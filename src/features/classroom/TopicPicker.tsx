import { useMemo, useState } from "react";
import { BookCheck, ChevronRight } from "lucide-react";
import { SearchInput } from "@/components/fields";
import type { TopicRef } from "@/lib/bindings";
import { fold } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Escolha de tópico agrupada por matéria, com busca. Substitui o <select> com "Matéria — tópico"
 * em centenas de linhas (ilegível depois de importar um edital grande).
 */
export function TopicPicker({ topics, value, onChange }: { topics: TopicRef[]; value: number | null; onChange: (id: number) => void }) {
  const [q, setQ] = useState("");
  const selected = topics.find((t) => t.id === value);
  const [open, setOpen] = useState<Set<string>>(() => new Set(selected ? [selected.subject] : []));

  const groups = useMemo(() => {
    const needle = fold(q.trim());
    const map = new Map<string, TopicRef[]>();
    for (const t of topics) {
      if (needle && !fold(`${t.subject} ${t.name}`).includes(needle)) continue;
      map.set(t.subject, [...(map.get(t.subject) ?? []), t]);
    }
    return [...map.entries()];
  }, [topics, q]);

  const toggle = (s: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });

  return (
    <div className="space-y-2">
      <SearchInput value={q} onChange={setQ} placeholder="Buscar tópico ou matéria" />
      <div className="max-h-[52vh] space-y-1 overflow-y-auto rounded-xl border border-border bg-card p-1.5">
        {groups.length === 0 && <p className="p-3 text-sm text-muted-foreground">Nada com “{q}”.</p>}
        {groups.map(([subject, list]) => {
          // buscando: tudo aberto; senão, só as que a pessoa abriu
          const isOpen = q.trim() !== "" || open.has(subject);
          return (
            <div key={subject}>
              <button
                onClick={() => toggle(subject)}
                aria-expanded={isOpen}
                className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-sm font-semibold hover:bg-secondary"
              >
                <ChevronRight className={cn("size-3.5 shrink-0 transition-transform", isOpen && "rotate-90")} />
                <span className="min-w-0 flex-1 truncate">{subject}</span>
                <span className="text-xs font-normal text-muted-foreground">{list.length}</span>
              </button>
              {isOpen && (
                <ul className="ml-5 border-l border-border pl-2">
                  {list.map((t) => (
                    <li key={t.id}>
                      <button
                        onClick={() => onChange(t.id)}
                        aria-pressed={t.id === value}
                        title={t.name}
                        className={cn(
                          "flex w-full items-start gap-1.5 rounded-md px-2 py-1 text-left text-sm",
                          t.id === value ? "bg-primary text-primary-foreground" : "hover:bg-secondary",
                        )}
                      >
                        <span className="line-clamp-2 min-w-0 flex-1">{t.name}</span>
                        {t.has_material && <BookCheck className="mt-0.5 size-3.5 shrink-0 opacity-70" aria-label="tem material" />}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
      <p className="flex items-center gap-1 text-xs text-muted-foreground">
        <BookCheck className="size-3.5" /> já tem material para a aula
      </p>
    </div>
  );
}
