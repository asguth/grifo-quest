import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Megaphone, Sparkles, TriangleAlert, X } from "lucide-react";
import { Mascot } from "@/components/Mascot";
import { commands, type Announcement } from "@/lib/bindings";
import { useAppEvent } from "@/lib/bus";
import { getPref, setPref } from "@/lib/prefs";
import { spring } from "@/lib/motion";
import { cn, warn } from "@/lib/utils";

const LABEL: Record<string, [string, typeof Megaphone, string]> = {
  info: ["Novidade", Sparkles, "text-primary bg-primary/15"],
  update: ["Atualização", Megaphone, "text-success bg-success/15"],
  warning: ["Importante", TriangleAlert, "text-destructive bg-destructive/15"],
};

/** Confere avisos novos de tempos em tempos (o app fica aberto o dia todo na bandeja). */
const POLL_MS = 15 * 60 * 1000;

async function seen(): Promise<string[]> {
  const raw = await getPref("seen_announcements");
  try {
    const v: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Aviso do time para todos (com ou sem conta): faixa no topo, centralizada, com X. Cada aviso
 * aparece uma vez só por pessoa. Quem publica vê na hora (evento `announcements`).
 */
export function AnnouncementPopup() {
  const [queue, setQueue] = useState<Announcement[]>([]);
  const [tick, setTick] = useState(0);
  useAppEvent("announcements", () => setTick((t) => t + 1));

  useEffect(() => {
    let live = true;
    const check = () =>
      Promise.all([commands.announcements(), seen()]).then(
        ([list, done]) => {
          if (!live) return;
          setQueue((q) => {
            const known = new Set(q.map((a) => a.id));
            const fresh = list.filter((a) => !done.includes(a.id) && !known.has(a.id)).reverse();
            return [...q, ...fresh];
          });
        },
        (e) => warn("ler os avisos", e),
      );
    // espera o app assentar (a janela acabou de abrir)
    const first = setTimeout(() => void check(), tick ? 300 : 1500);
    const every = setInterval(() => void check(), POLL_MS);
    return () => {
      live = false;
      clearTimeout(first);
      clearInterval(every);
    };
  }, [tick]);

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
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[90] flex justify-center px-4">
      <AnimatePresence mode="wait">
        {current && (
          <motion.div
            key={current.id}
            role="status"
            aria-live="polite"
            initial={{ y: -80, opacity: 0, scale: 0.96 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: -40, opacity: 0, transition: { duration: 0.15 } }}
            transition={spring.bouncy}
            className="pointer-events-auto relative flex w-full max-w-xl items-start gap-3 rounded-2xl border border-border bg-card/95 p-4 pr-11 shadow-lift backdrop-blur-xl"
          >
            <Mascot look="cap" scale={3} />
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium", tone)}>
                  <Icon className="size-3" /> {label}
                </span>
                {queue.length > 1 && <span className="text-[11px] text-muted-foreground">+{queue.length - 1}</span>}
              </div>
              <p className="font-semibold leading-snug">{current.title}</p>
              {current.body && <p className="max-h-40 overflow-y-auto text-sm whitespace-pre-wrap text-muted-foreground">{current.body}</p>}
            </div>
            <button onClick={close} aria-label="Fechar aviso" className="absolute top-3 right-3 grid size-7 place-items-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground">
              <X className="size-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
