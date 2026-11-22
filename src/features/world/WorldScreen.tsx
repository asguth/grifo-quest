import { useState } from "react";
import { Segmented } from "@/components/Segmented";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { ContestTracker } from "./ContestTracker";
import { ExamForm, useExams } from "./exams";
import { NewsBoard } from "./NewsBoard";

type Tab = "news" | "contests" | "exams";

export default function WorldScreen() {
  const [tab, setTab] = useState<Tab>("news");
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="retro text-sm text-primary">Mundo</h1>
        <Segmented
          label="Seção"
          value={tab}
          onChange={setTab}
          options={[
            ["news", "Notícias"],
            ["contests", "Concursos"],
            ["exams", "Minhas provas"],
          ]}
        />
      </div>
      {tab === "news" && <NewsBoard />}
      {tab === "contests" && <ContestTracker />}
      {tab === "exams" && <Exams />}
    </div>
  );
}

function Exams() {
  const { exams, reload, remove } = useExams();
  return (
    <section className="space-y-4">
      <div className="rounded-lg bg-card p-4">
        <ExamForm onCreated={reload} />
      </div>
      <ul className="space-y-2">
        {exams.map((e) => (
          <li key={e.id} className="flex items-center gap-4 rounded-lg border border-border bg-card p-3">
            <span className={`retro w-16 text-center text-lg ${e.days_left < 0 ? "text-muted-foreground" : "text-primary"}`}>{e.days_left < 0 ? "✓" : e.days_left}</span>
            <div className="flex-1">
              <p className="font-medium">{e.name}</p>
              <p className="text-xs text-muted-foreground">{[formatDate(e.exam_date), e.banca, e.role].filter(Boolean).join(" · ")}</p>
            </div>
            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => void remove(e.id)}>
              Apagar
            </Button>
          </li>
        ))}
        {exams.length === 0 && <li className="text-sm text-muted-foreground">Nenhuma prova marcada.</li>}
      </ul>
    </section>
  );
}
