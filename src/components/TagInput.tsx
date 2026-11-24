import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Plus, X } from "lucide-react";
import { spring } from "@/lib/motion";
import { cn } from "@/lib/utils";

/** Separa um texto colado ("ANPD, LGPD\nTI") em itens limpos. */
export function splitTags(text: string): string[] {
  return text
    .split(/[,;\n]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

/**
 * Lista de palavras em fichas: digita e aperta Enter (ou vírgula) para adicionar, × para tirar,
 * Backspace na caixa vazia tira a última. Colar uma lista separada por vírgula ou linha também vale.
 * `suggestions` aparecem como fichas tracejadas de um clique.
 */
export function TagInput({
  id,
  value,
  onChange,
  placeholder,
  suggestions = [],
}: {
  id?: string;
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  suggestions?: string[];
}) {
  const [draft, setDraft] = useState("");
  const has = (t: string) => value.some((v) => v.toLowerCase() === t.toLowerCase());
  const add = (items: string[]) => {
    const fresh = items.filter((t, i) => !has(t) && items.findIndex((x) => x.toLowerCase() === t.toLowerCase()) === i);
    if (fresh.length) onChange([...value, ...fresh]);
    setDraft("");
  };
  const remove = (t: string) => onChange(value.filter((v) => v !== t));
  const left = suggestions.filter((s) => !has(s));

  return (
    <div className="space-y-2">
      <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-lg border border-input bg-background p-1.5 transition-colors focus-within:border-primary/60 focus-within:ring-3 focus-within:ring-ring/20">
        <AnimatePresence initial={false}>
          {value.map((t) => (
            <motion.span
              key={t}
              layout
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={spring.snappy}
              className="inline-flex h-7 items-center gap-1 rounded-md bg-primary/15 pr-1 pl-2.5 text-[0.8rem] font-medium text-primary"
            >
              {t}
              <button type="button" onClick={() => remove(t)} aria-label={`Tirar ${t}`} className="grid size-5 place-items-center rounded hover:bg-primary/20">
                <X className="size-3" />
              </button>
            </motion.span>
          ))}
        </AnimatePresence>
        <input
          id={id}
          value={draft}
          onChange={(e) => {
            const v = e.target.value;
            // vírgula ou ponto e vírgula digitados fecham a ficha na hora
            if (/[,;]/.test(v)) add(splitTags(v));
            else setDraft(v);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (draft.trim()) add([draft.trim()]);
            } else if (e.key === "Backspace" && !draft && value.length) {
              remove(value[value.length - 1]);
            }
          }}
          onBlur={() => draft.trim() && add([draft.trim()])}
          onPaste={(e) => {
            const text = e.clipboardData.getData("text");
            if (/[,;\n]/.test(text)) {
              e.preventDefault();
              add(splitTags(`${draft},${text}`));
            }
          }}
          placeholder={value.length ? "Adicionar outra…" : placeholder}
          className="h-7 min-w-40 flex-1 bg-transparent px-1.5 text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
      {left.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Sugestões:</span>
          {left.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => add([s])}
              className={cn("inline-flex h-6 items-center gap-1 rounded-md border border-dashed border-border px-2 text-xs text-muted-foreground transition-colors hover:border-primary/60 hover:text-primary")}
            >
              <Plus className="size-3" /> {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
