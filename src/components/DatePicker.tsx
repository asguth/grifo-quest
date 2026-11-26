import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const WEEK = ["D", "S", "T", "Q", "Q", "S", "S"];

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
function todayIso(): string {
  const t = new Date();
  return iso(t.getFullYear(), t.getMonth(), t.getDate());
}

/** "2026-11-25" → "25/11/2026". */
export function brDate(v: string): string {
  const [y, m, d] = v.split("-");
  return y && m && d ? `${d}/${m}/${y}` : "";
}

/**
 * Calendário em português no tema do app (o `<input type="date">` do WebView segue o idioma do
 * Windows e o visual do sistema). Valor em "AAAA-MM-DD"; vazio = sem data.
 */
export function DatePicker({
  value,
  onChange,
  placeholder = "Escolher data",
  className,
  min,
  autoFocus,
  "aria-label": ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  /** Datas antes desta ficam apagadas. */
  min?: string;
  autoFocus?: boolean;
  "aria-label"?: string;
}) {
  const [open, setOpen] = useState(!!autoFocus && !value);
  const base = value || todayIso();
  const [view, setView] = useState({ y: Number(base.slice(0, 4)), m: Number(base.slice(5, 7)) - 1 });
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const first = new Date(view.y, view.m, 1).getDay();
  const days = new Date(view.y, view.m + 1, 0).getDate();
  const cells: (number | null)[] = [...Array<null>(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const today = todayIso();
  const shift = (n: number) => setView((v) => ({ y: v.y + Math.floor((v.m + n) / 12), m: (((v.m + n) % 12) + 12) % 12 }));

  return (
    <div ref={root} className={cn("relative", className)}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex h-9 w-full items-center gap-2 rounded-md border border-input bg-transparent px-3 text-left text-sm transition-colors hover:border-primary/50",
          !value && "text-muted-foreground",
          open && "border-primary",
        )}
      >
        <CalendarDays className="size-4 shrink-0 text-primary" />
        <span className="flex-1 truncate">{value ? brDate(value) : placeholder}</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.12 }}
            className="absolute top-full left-0 z-50 mt-1.5 w-72 space-y-2 rounded-2xl border border-border bg-card p-3 shadow-lift"
            role="dialog"
            aria-label="Calendário"
          >
            <div className="flex items-center gap-1">
              <button type="button" aria-label="Mês anterior" className="grid size-8 place-items-center rounded-lg hover:bg-secondary" onClick={() => shift(-1)}>
                <ChevronLeft className="size-4" />
              </button>
              <span className="flex-1 text-center text-sm font-semibold capitalize">
                {MONTHS[view.m]} {view.y}
              </span>
              <button type="button" aria-label="Próximo mês" className="grid size-8 place-items-center rounded-lg hover:bg-secondary" onClick={() => shift(1)}>
                <ChevronRight className="size-4" />
              </button>
            </div>
            <div className="grid grid-cols-7 gap-0.5 text-center text-[11px] text-muted-foreground">
              {WEEK.map((w, i) => (
                <span key={i} className="py-1">
                  {w}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-0.5">
              {cells.map((d, i) => {
                if (d === null) return <span key={i} />;
                const v = iso(view.y, view.m, d);
                const selected = v === value;
                const disabled = !!min && v < min;
                return (
                  <button
                    key={i}
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      onChange(v);
                      setOpen(false);
                    }}
                    className={cn(
                      "tabular grid h-8 place-items-center rounded-lg text-sm transition-colors",
                      selected ? "bg-primary font-semibold text-primary-foreground" : "hover:bg-secondary",
                      !selected && v === today && "ring-1 ring-primary/60",
                      disabled && "pointer-events-none opacity-30",
                    )}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
            <div className="flex justify-between border-t border-border pt-2 text-xs">
              <button
                type="button"
                className="rounded px-2 py-1 text-muted-foreground hover:text-foreground"
                onClick={() => {
                  onChange("");
                  setOpen(false);
                }}
              >
                Limpar
              </button>
              <button
                type="button"
                className="rounded px-2 py-1 font-medium text-primary hover:bg-primary/10"
                onClick={() => {
                  onChange(today);
                  setView({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 });
                  setOpen(false);
                }}
              >
                Hoje
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
