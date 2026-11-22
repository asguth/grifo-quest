import { useRef, useState } from "react";
import { AnimatePresence } from "motion/react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { XpBurst } from "@/components/motion";
import { commands, type QuickLogResult_Serialize } from "@/lib/bindings";
import { useWindowFocus } from "@/lib/hooks";
import { sfx } from "@/lib/sound";
import { errorMessage, warn } from "@/lib/utils";

const win = getCurrentWindow();
const hide = () => win.hide().catch((e) => warn("esconder o lançamento rápido", e));

export default function QuickLog() {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [last, setLast] = useState<{ key: number; result: QuickLogResult_Serialize } | null>(null);
  const input = useRef<HTMLInputElement>(null);

  // Cada vez que o atalho reabre a janela: campo limpo e focado. Perdeu o foco: some.
  useWindowFocus((focused) => {
    if (focused) {
      setError("");
      input.current?.focus();
    } else {
      void hide();
    }
  });

  async function save() {
    try {
      const result = await commands.quickLog(text);
      setLast({ key: Date.now(), result });
      if (result.mission_xp > 0) sfx("chime");
      setText("");
      setError("");
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") void save();
    if (e.key === "Escape") void hide();
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
            {last.result.mission_xp > 0 && <span className="block text-accent">Missão concluída! +{last.result.mission_xp} XP</span>}
          </p>
        )}
        <AnimatePresence>{last && <XpBurst key={last.key} amount={last.result.xp_gained + last.result.mission_xp} className="right-0 bottom-0 text-lg" />}</AnimatePresence>
      </div>
    </div>
  );
}
