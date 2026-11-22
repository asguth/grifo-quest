import type { ReactNode } from "react";
import { motion } from "motion/react";
import { Skeleton } from "@/components/motion";
import { ease } from "@/lib/motion";

/** Entrada padrão das telas: sobe 8px e aparece. */
export function PageTransition({ children }: { children: ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.22, ease: ease.out }}>
      {children}
    </motion.div>
  );
}

/** Tela inteira enquanto o código de uma tela carrega. */
export function ScreenSkeleton() {
  return (
    <div className="space-y-4" aria-busy aria-label="Carregando">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-32 w-full" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    </div>
  );
}
