import { useSyncExternalStore } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CircleAlert, CircleCheck, Info, X } from "lucide-react";
import { sfx } from "@/lib/sound";
import { cn, errorMessage } from "@/lib/utils";

type ToastKind = "info" | "success" | "error";
type ToastItem = { id: number; kind: ToastKind; text: string };

let toasts: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function dismiss(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

/** Aviso flutuante no canto. Erros ficam 6 s; o resto, 3 s. */
export function toast(text: string, kind: ToastKind = "info") {
  const id = nextId++;
  if (kind !== "info") sfx(kind);
  toasts = [...toasts.slice(-3), { id, kind, text }];
  emit();
  setTimeout(() => dismiss(id), kind === "error" ? 6000 : 3000);
}

/** Falha de uma ação que o usuário pediu (salvar, gerar, apagar). */
export function toastError(e: unknown) {
  toast(errorMessage(e), "error");
}

const ICON = { info: Info, success: CircleCheck, error: CircleAlert } as const;
const TONE = { info: "text-primary", success: "text-success", error: "text-destructive" } as const;

export function Toaster() {
  const items = useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => toasts,
  );
  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-80 flex-col gap-2" role="status">
      <AnimatePresence initial={false}>
        {items.map((t) => {
          const Icon = ICON[t.kind];
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, x: 24, scale: 0.96 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 24, transition: { duration: 0.15 } }}
              className="pointer-events-auto flex items-start gap-2.5 rounded-xl border border-border bg-glass p-3 text-sm shadow-lift backdrop-blur-md"
            >
              <Icon className={cn("mt-0.5 size-4 shrink-0", TONE[t.kind])} />
              <span className="flex-1">{t.text}</span>
              <button onClick={() => dismiss(t.id)} aria-label="Fechar aviso" className="text-muted-foreground hover:text-foreground">
                <X className="size-3.5" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
