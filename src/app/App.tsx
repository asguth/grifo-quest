import { useEffect, useState } from "react";
import { Button } from "@/components/ui/8bit/button";
import SubjectsScreen from "@/features/subjects/SubjectsScreen";
import SettingsScreen from "@/features/settings/SettingsScreen";

const SLOTS = [
  { id: "diario", label: "Diário" },
  { id: "foco", label: "Foco" },
  { id: "sala", label: "Sala" },
  { id: "materias", label: "Matérias" },
  { id: "config", label: "Config" },
] as const;

type SlotId = (typeof SLOTS)[number]["id"];

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.matches("input, textarea, select, [contenteditable]");
}

function Soon({ what }: { what: string }) {
  return <p className="text-muted-foreground">{what} chega nas próximas fases.</p>;
}

export default function App() {
  const [slot, setSlot] = useState<SlotId>("materias");

  // Atalhos 1–5 da hotbar (ignorados enquanto digita).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const i = Number(e.key) - 1;
      if (!isTyping(e.target) && !e.ctrlKey && !e.altKey && SLOTS[i]) setSlot(SLOTS[i].id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex h-screen flex-col">
      <main className="flex-1 overflow-y-auto p-6">
        {slot === "diario" && <Soon what="O Diário (painel)" />}
        {slot === "foco" && <Soon what="O Pomodoro" />}
        {slot === "sala" && <Soon what="A Sala de aula" />}
        {slot === "materias" && <SubjectsScreen />}
        {slot === "config" && <SettingsScreen />}
      </main>

      <nav aria-label="Navegação" className="flex justify-center gap-4 border-t border-border bg-card px-4 py-4">
        {SLOTS.map((s, i) => (
          <Button
            key={s.id}
            variant={slot === s.id ? "default" : "secondary"}
            aria-current={slot === s.id ? "page" : undefined}
            onClick={() => setSlot(s.id)}
            className="h-12 min-w-24 flex-col gap-0.5 text-[10px]"
          >
            <span className="text-[8px] opacity-60">{i + 1}</span>
            {s.label}
          </Button>
        ))}
      </nav>
    </div>
  );
}
