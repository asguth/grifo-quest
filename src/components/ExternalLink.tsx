import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ExternalLink, ShieldAlert } from "lucide-react";
import { toastError } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { commands } from "@/lib/bindings";
import { spring } from "@/lib/motion";

type Ask = { url: string; resolve: (go: boolean) => void };
let ask: ((a: Ask) => void) | null = null;

/** Endereços do próprio Windows (configurações de fala etc.) abrem sem aviso: não saem do PC. */
function isWeb(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

/**
 * Abre um site no navegador depois do aviso de segurança ("você está saindo do Grifo Quest").
 * Sempre pergunta: links vêm de notícias, concursos e da comunidade, escritos por outras pessoas.
 */
export async function openLink(url: string): Promise<void> {
  if (!url) return;
  if (isWeb(url) && ask) {
    const open = ask;
    const go = await new Promise<boolean>((resolve) => open({ url, resolve }));
    if (!go) return;
  }
  await commands.openLink(url).catch(toastError);
}

export function ExternalLinkHost() {
  const [req, setReq] = useState<Ask | null>(null);
  useEffect(() => {
    ask = setReq;
    return () => {
      ask = null;
    };
  }, []);
  const answer = (go: boolean) => {
    req?.resolve(go);
    setReq(null);
  };

  let host = "";
  let secure = false;
  try {
    const u = req ? new URL(req.url) : null;
    host = u?.hostname.replace(/^www\./, "") ?? "";
    secure = u?.protocol === "https:";
  } catch {
    host = req?.url ?? "";
  }

  return (
    <AnimatePresence>
      {req && (
        <motion.div
          className="fixed inset-0 z-[96] grid place-items-center bg-black/60 p-6 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => answer(false)}
        >
          <motion.div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="external-title"
            initial={{ y: 16, scale: 0.96 }}
            animate={{ y: 0, scale: 1 }}
            exit={{ y: 8, opacity: 0 }}
            transition={spring.soft}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Escape") answer(false);
            }}
            className="w-full max-w-md space-y-4 rounded-3xl border border-border bg-card p-6 shadow-lift"
          >
            <div className="flex items-start gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-amber-500/15 text-amber-400">
                <ShieldAlert className="size-6" />
              </span>
              <div className="min-w-0 space-y-1">
                <h2 id="external-title" className="font-semibold">
                  Você vai sair do Grifo Quest
                </h2>
                <p className="text-sm text-muted-foreground">Este link abre um site externo no seu navegador. Confira o endereço antes de continuar e nunca digite senhas em sites que você não reconhece.</p>
              </div>
            </div>
            <div className="space-y-1 rounded-xl border border-border bg-secondary/40 p-3">
              <p className="truncate text-sm font-semibold">{host}</p>
              <p className="line-clamp-2 font-mono text-[11px] break-all text-muted-foreground">{req.url}</p>
              {!secure && <p className="text-xs text-destructive">Conexão sem HTTPS: o que você enviar pode ser visto por outros.</p>}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => answer(false)}>
                Ficar aqui
              </Button>
              <Button autoFocus onClick={() => answer(true)}>
                <ExternalLink /> Abrir site
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
