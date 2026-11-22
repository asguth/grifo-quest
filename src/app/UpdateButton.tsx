import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Download } from "lucide-react";
import { installUpdate, useUpdate } from "@/lib/update";
import { cn } from "@/lib/utils";

/** Botão do menu lateral: aparece só quando há atualização pronta. */
export function UpdateButton({ collapsed }: { collapsed: boolean }) {
  const update = useUpdate();
  const [busy, setBusy] = useState(false);
  return (
    <AnimatePresence>
      {update && (
        <motion.button
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void installUpdate().finally(() => setBusy(false));
          }}
          title={`Atualizar para a versão ${update.version} (o app reinicia)`}
          className={cn(
            "flex h-9 w-full items-center gap-3 rounded-lg bg-accent px-3 text-xs font-medium text-accent-foreground shadow-soft disabled:opacity-60",
            collapsed && "justify-center px-0",
          )}
        >
          <Download className="size-4 shrink-0" />
          {!collapsed && (busy ? "Instalando…" : `Atualizar para ${update.version}`)}
        </motion.button>
      )}
    </AnimatePresence>
  );
}
