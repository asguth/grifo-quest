import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { commands, type QuickLogResult_Serialize } from "@/lib/bindings";
import { errorMessage } from "@/lib/utils";

const win = getCurrentWindow();

export default function QuickLog() {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [last, setLast] = useState<{ key: number; result: QuickLogResult_Serialize } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const reduceMotion = useReducedMotion();

  // Cada vez que o atalho reabre a janela: campo limpo e focado.
  useEffect(() => {
    const unlisten = win.onFocusChanged(({ payload: focused }) => {
      if (focused) {
        setError("");
        input.current?.focus();
      } else {
        void win.hide();
      }
    });
    return () => void unlisten.then((f) => f());
  }, []);

  async function save() {
    try {
      const result = await commands.quickLog(text);
      setLast({ key: Date.now(), result });
      setText("");
      setError("");
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") void save();
    if (e.key === "Escape") void win.hide();
  }

  return (
    <div data-tauri-drag-region className="flex h-screen flex-col gap-3 border-2 border-primary bg-background p-5">
      <h1 data-tauri-drag-region className="retro text-xs text-primary">
        Lançar questões
      </h1>
      <input
        ref={input}
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="30 15 lgpd fgv"
        aria-label="total certas matéria banca"
        className="h-11 rounded-md border border-input bg-card px-3 text-base outline-none focus:border-primary"
      />
      <p className="text-xs text-muted-foreground">total · certas · matéria · banca (opcional) — Enter salva, Esc fecha</p>

      <div className="relative flex-1">
        {error && <p className="text-sm text-destructive">{error}</p>}
        {last && !error && (
          <p className="text-sm">
            {last.result.correct}/{last.result.total} em <b>{last.result.subject}</b>
            {last.result.banca && ` · ${last.result.banca}`}
          </p>
        )}
        <AnimatePresence>
          {last && (
            <motion.span
              key={last.key}
              className="retro absolute right-0 bottom-0 text-lg text-accent"
              initial={{ opacity: 0, y: reduceMotion ? 0 : 10 }}
              animate={{ opacity: [0, 1, 1, 0], y: reduceMotion ? 0 : -30 }}
              transition={{ duration: 1.4, ease: "easeOut" }}
            >
              +{last.result.xp_gained} XP
            </motion.span>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
