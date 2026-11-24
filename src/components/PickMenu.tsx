import { useState, type ReactNode } from "react";
import { Popover } from "radix-ui";
import { Check, ChevronDown, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type PickOption<T extends string> = {
  value: T;
  label: string;
  /** Linha pequena embaixo do rótulo. */
  detail?: string;
  /** Opções com o mesmo grupo ficam juntas, com o nome do grupo em cima. */
  group?: string;
  icon?: LucideIcon;
};

/**
 * Escolha única em menu suspenso (pílula + lista com grupos), no visual do app. Para listas longas
 * de texto puro (tópicos do edital) o `NativeSelect` continua melhor.
 */
export function PickMenu<T extends string>({
  value,
  onChange,
  options,
  label,
  icon,
  className,
  align = "start",
  prefix,
}: {
  value: T;
  onChange: (v: T) => void;
  options: PickOption<T>[];
  /** Nome para leitores de tela ("Ordenar por"). */
  label: string;
  icon?: LucideIcon;
  className?: string;
  align?: "start" | "end";
  /** Texto antes do valor na pílula ("Ordem:"). */
  prefix?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  const Icon = current?.icon ?? icon;
  const groups = [...new Set(options.map((o) => o.group ?? ""))];
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        aria-label={label}
        className={cn(
          "inline-flex h-8 max-w-full min-w-0 items-center gap-1.5 rounded-lg border border-border bg-secondary px-2.5 text-[0.8rem] font-medium shadow-xs transition-colors outline-none",
          "hover:border-[color-mix(in_oklch,var(--border),var(--primary)_45%)] focus-visible:ring-3 focus-visible:ring-ring/50 data-[state=open]:border-primary/60",
          className,
        )}
      >
        {Icon && <Icon className="size-3.5 shrink-0 text-primary" />}
        {prefix && <span className="shrink-0 text-muted-foreground">{prefix}</span>}
        <span className="truncate">{current?.label ?? "—"}</span>
        <ChevronDown className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align={align}
          sideOffset={6}
          collisionPadding={12}
          className="z-50 max-h-[min(420px,var(--radix-popover-content-available-height))] w-max max-w-[min(360px,90vw)] min-w-[var(--radix-popover-trigger-width)] overflow-y-auto rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-lift data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
        >
          <div role="listbox" aria-label={label}>
            {groups.map((g) => (
              <div key={g} className="not-first:mt-1 not-first:border-t not-first:border-border not-first:pt-1">
                {g && <p className="px-2.5 pt-1.5 pb-1 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">{g}</p>}
                {options
                  .filter((o) => (o.group ?? "") === g)
                  .map((o) => {
                    const OIcon = o.icon;
                    const on = o.value === value;
                    return (
                      <button
                        key={o.value}
                        role="option"
                        aria-selected={on}
                        onClick={() => {
                          onChange(o.value);
                          setOpen(false);
                        }}
                        className={cn(
                          "flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors outline-none",
                          on ? "bg-primary/12 text-foreground" : "hover:bg-secondary focus-visible:bg-secondary",
                        )}
                      >
                        {OIcon && <OIcon className={cn("mt-0.5 size-4 shrink-0", on ? "text-primary" : "text-muted-foreground")} />}
                        <span className="min-w-0 flex-1">
                          <span className={cn("block truncate", on && "font-medium")}>{o.label}</span>
                          {o.detail && <span className="block truncate text-xs text-muted-foreground">{o.detail}</span>}
                        </span>
                        <Check className={cn("mt-0.5 size-4 shrink-0 text-primary", !on && "invisible")} />
                      </button>
                    );
                  })}
              </div>
            ))}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
