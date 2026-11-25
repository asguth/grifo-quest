import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Megaphone, Sparkles, TriangleAlert, X } from "lucide-react";
import { Mascot } from "@/components/Mascot";
import { Button } from "@/components/ui/button";
import { commands, type Announcement } from "@/lib/bindings";
import { getPref, setPref } from "@/lib/prefs";
import { spring } from "@/lib/motion";
import { cn, warn } from "@/lib/utils";

const LABEL: Record<string, [string, typeof Megaphone, string]> = {
  info: ["Novidade", Sparkles, "text-primary bg-primary/15"],
  update: ["Atualização", Megaphone, "text-success bg-success/15"],
  warning: ["Importante", TriangleAlert, "text-destructive bg-destructive/15"],
};

async function seen(): Promise<string[]> {
  const raw = await getPref("seen_announcements");
  try {
    const v: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** Aviso do dev para todos: aparece uma vez por pessoa, ao abrir o app (sem conta também). */
export function AnnouncementPopup() {
  const [queue, setQueue] = useState<Announcement[]>([]);

  useEffect(() => {
    // espera o app assentar (a janela acabou de abrir)
    const t = setTimeout(() => {
      Promise.all([commands.announcements(), seen()]).then(
        ([list, done]) => setQueue(list.filter((a) => !done.includes(a.id)).reverse()),
        (e) => warn("ler os avisos", e),
      );
    }, 1500);
    return () => clearTimeout(t);
  }, []);

  const current = queue[0];
  function close() {
    if (!current) return;
    void seen()
      .then((done) => setPref("seen_announcements", JSON.stringify([...done, current.id].slice(-50))))
      .catch((e) => warn("salvar aviso visto", e));
    setQueue((q) => q.slice(1));
  }

  const [label, Icon, tone] = LABEL[current?.kind ?? "info"] ?? LABEL.info;
  return (
    <AnimatePresence>
      {current && (
        <motion.div
          key={current.id}
          className="fixed inset-0 z-[90] grid place-items-center bg-black/60 p-6 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={close}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="announcement-title"
            initial={{ y: 24, scale: 0.95 }}
            animate={{ y: 0, scale: 1 }}
            exit={{ y: 12, scale: 0.97, opacity: 0 }}
            transition={spring.bouncy}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-lg space-y-4 rounded-3xl border border-border bg-card p-7 shadow-lift"
          >
            <button onClick={close} aria-label="Fechar" className="absolute right-4 top-4 text-muted-foreground hover:text-foreground">
              <X className="size-4" />
            </button>
            <div className="flex items-center gap-4">
              <Mascot look="cap" scale={4} />
              <div className="space-y-1.5">
                <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium", tone)}>
                  <Icon className="size-3.5" /> {label}
                </span>
                <h2 id="announcement-title" className="text-lg font-semibold leading-snug">
                  {current.title}
                </h2>
              </div>
            </div>
            {current.body && <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{current.body}</p>}
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground">{queue.length > 1 ? `+${queue.length - 1} aviso(s)` : "Recado do time do Grifo Quest"}</span>
              <Button autoFocus onClick={close}>
                Entendi
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
