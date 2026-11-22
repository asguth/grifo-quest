import type { ComponentProps, ReactNode } from "react";
import { motion } from "motion/react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Filtro/opção em pílula. */
export function Chip({ on, onClick, children, className }: { on: boolean; onClick: () => void; children: ReactNode; className?: string }) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        "flex h-8 items-center justify-center gap-1.5 rounded-full border px-3 text-xs transition-colors",
        on ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-primary/60 hover:bg-secondary/60",
        className,
      )}
    >
      {children}
    </motion.button>
  );
}

/** Select nativo no visual dos campos do app (o do sistema é o mais acessível). */
export function NativeSelect({ className, ...props }: ComponentProps<"select">) {
  return <select className={cn("h-9 w-full rounded-md border border-input bg-background px-2 text-sm disabled:opacity-50", className)} {...props} />;
}

export function SearchInput({ value, onChange, placeholder, className }: { value: string; onChange: (v: string) => void; placeholder: string; className?: string }) {
  return (
    <div className={cn("relative", className)}>
      <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} className="pl-8" />
    </div>
  );
}
