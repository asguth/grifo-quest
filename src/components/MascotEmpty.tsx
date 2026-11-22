import type { ReactNode } from "react";
import { motion } from "motion/react";
import { Mascot } from "@/components/Mascot";
import { breathe } from "@/lib/motion";
import { cn } from "@/lib/utils";

/** Estado vazio com o Grifinho respirando, o recado e a ação que resolve. */
export function MascotEmpty({ title, text, children, className, scale = 6 }: { title?: string; text: string; children?: ReactNode; className?: string; scale?: number }) {
  return (
    <div className={cn("flex flex-col items-center gap-4 rounded-3xl border border-dashed border-border py-14 text-center", className)}>
      <motion.div {...breathe}>
        <Mascot scale={scale} />
      </motion.div>
      <div className="space-y-1">
        {title && <p className="font-semibold">{title}</p>}
        <p className="max-w-md text-sm text-muted-foreground">{text}</p>
      </div>
      {children}
    </div>
  );
}
