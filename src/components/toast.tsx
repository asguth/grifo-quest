import { useSyncExternalStore } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CircleAlert, CircleCheck, Info, X } from "lucide-react";
import { Mascot } from "@/components/Mascot";
import { spring } from "@/lib/motion";
import { sfx } from "@/lib/sound";
import { cn, errorMessage } from "@/lib/utils";

type ToastKind = "info" | "success" | "error";
type ToastAction = { label: string; onClick: () => void };
type ToastItem = { id: number; kind: ToastKind; text: string; action?: ToastAction };

let toasts: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function dismiss(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

/**
 * Aviso flutuante no canto: o Grifinho com a mensagem num balão. Erros ficam 6 s; o resto, 3 s;
 * com botão de ação (ex.: "Ver resposta"), 10 s.
 */
export function toast(text: string, kind: ToastKind = "info", action?: ToastAction) {
  const id = nextId++;
  if (kind !== "info") sfx(kind);
  toasts = [...toasts.slice(-3), { id, kind, text, action }];
  emit();
  setTimeout(() => dismiss(id), action ? 10_000 : kind === "error" ? 6000 : 3000);
}

/** Falha de uma ação que o usuário pediu (salvar, gerar, apagar). */
export function toastError(e: unknown) {
  toast(errorMessage(e), "error");
}

const ICON = { info: Info, success: CircleCheck, error: CircleAlert } as const;
const TONE = { info: "text-primary", success: "text-success", error: "text-destructive" } as const;
const BORDER = { info: "border-primary/50", success: "border-success/50", error: "border-destructive/60" } as const;

export function Toaster() {
  const items = useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => toasts,
  );
  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-96 max-w-[calc(100vw-2rem)] flex-col items-end gap-3" role="status">
      <AnimatePresence initial={false}>
        {items.map((t, i) => {
          const Icon = ICON[t.kind];
          const last = i === items.length - 1;
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, x: 32, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 32, transition: { duration: 0.15 } }}
              transition={spring.bouncy}
              className="pointer-events-auto flex items-end gap-2"
            >
              {/* balão de fala com a "pontinha" apontando para o Grifinho */}
              <div className={cn("relative flex min-w-0 flex-1 items-start gap-2.5 rounded-2xl border bg-card p-3 text-sm shadow-lift", BORDER[t.kind])}>
                <Icon className={cn("mt-0.5 size-4 shrink-0", TONE[t.kind])} />
                <div className="min-w-0 flex-1 space-y-2">
                  <p>{t.text}</p>
                  {t.action && (
                    <button
                      onClick={() => {
                        t.action?.onClick();
                        dismiss(t.id);
                      }}
                      className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:opacity-90"
                    >
                      {t.action.label}
                    </button>
                  )}
                </div>
                <button onClick={() => dismiss(t.id)} aria-label="Fechar aviso" className="text-muted-foreground hover:text-foreground">
                  <X className="size-3.5" />
                </button>
                <span className={cn("absolute -right-[7px] bottom-4 size-3 rotate-45 border-t border-r bg-card", BORDER[t.kind])} aria-hidden />
              </div>
              {/* o Grifinho só no aviso mais recente (vários avisos empilhados não viram um bando) */}
              <motion.div
                className={cn("shrink-0", !last && "invisible")}
                animate={{ y: [0, -5, 0] }}
                transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
              >
                <Mascot look={t.kind === "success" ? "cap" : "base"} scale={2.5} />
              </motion.div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
