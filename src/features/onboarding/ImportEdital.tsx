import { useState } from "react";
import { FileUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { useNextExam } from "@/features/world/exams";
import { SubjectPlanner } from "./SubjectPlanner";

/**
 * Botão "Montar meu edital" que abre o importador em qualquer tela (Início, Estudo, Matérias).
 * Quem pulou o passo no assistente cai aqui sem precisar caçar a tela certa.
 */
export function ImportEditalButton({ onApplied, label = "Montar meu edital", size = "default" }: { onApplied?: () => void; label?: string; size?: "default" | "lg" }) {
  const [open, setOpen] = useState(false);
  const exam = useNextExam(open);
  return (
    <>
      <Button size={size} onClick={() => setOpen(true)}>
        <FileUp /> {label}
      </Button>
      <Sheet open={open} onOpenChange={setOpen} title="Montar meu edital" description="Pelo PDF do edital (IA local) ou pelo cargo (Claude pesquisa o edital). Você revisa antes de salvar.">
        <div className="h-full overflow-y-auto p-6">
          <SubjectPlanner
            key={exam?.id ?? 0}
            defaultRole={exam?.role ?? ""}
            defaultBanca={exam?.banca ?? ""}
            onApplied={() => {
              setOpen(false);
              onApplied?.();
            }}
          />
        </div>
      </Sheet>
    </>
  );
}
