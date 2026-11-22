import { useEffect, type ReactNode } from "react";
import { Dialog } from "radix-ui";
import { X } from "lucide-react";
import { sfx } from "@/lib/sound";

/** Painel que desliza da direita (Radix Dialog: foco preso, Esc fecha, leitor de tela ok). */
export function Sheet(props: { open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: string; children: ReactNode }) {
  useEffect(() => {
    if (props.open) sfx("open");
  }, [props.open]);
  return (
    <Dialog.Root open={props.open} onOpenChange={props.onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed inset-y-0 right-0 z-50 flex w-[min(1100px,94vw)] flex-col border-l border-border bg-background shadow-lift duration-300 data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=closed]:duration-150 data-[state=open]:animate-in data-[state=open]:slide-in-from-right">
          <header className="flex items-start gap-4 border-b border-border px-6 py-4">
            <div className="min-w-0 flex-1">
              <Dialog.Title className="truncate text-lg font-semibold">{props.title}</Dialog.Title>
              {props.description && <Dialog.Description className="text-sm text-muted-foreground">{props.description}</Dialog.Description>}
            </div>
            <Dialog.Close className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground" aria-label="Fechar">
              <X className="size-5" />
            </Dialog.Close>
          </header>
          <div className="min-h-0 flex-1">{props.children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
