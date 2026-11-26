import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Play, X } from "lucide-react";
import { Mascot, tierOf } from "@/components/Mascot";
import { Count } from "@/components/motion";
import { ProgressBar } from "@/components/Progress";
import Scenery from "@/components/Scenery";
import { StatTile } from "@/components/StatTile";
import { PixelCalendar, PixelFlame, PixelSword } from "@/components/PixelIcons";
import { Button } from "@/components/ui/button";
import { dailyProgress } from "@/features/study/daily";
import { commands, type Dashboard_Serialize as Dashboard, type StudyHome } from "@/lib/bindings";
import { greeting } from "@/lib/dates";
import { plural } from "@/lib/format";
import { useWindowFocus } from "@/lib/hooks";
import { itemIn, listIn, spring } from "@/lib/motion";
import { sfx } from "@/lib/sound";
import { warn } from "@/lib/utils";

/** Some sozinha depois disso (a não ser que o mouse esteja em cima). */
const AUTO_HIDE_S = 30;

/** Janela compacta que aparece quando o Windows liga (e em Configurações → Sistema → Ver agora). */
export default function Welcome() {
  const [d, setD] = useState<Dashboard | null>(null);
  const [home, setHome] = useState<StudyHome | null>(null);
  const [name, setName] = useState("");
  const [left, setLeft] = useState(AUTO_HIDE_S);
  const [hover, setHover] = useState(false);
  const close = () => getCurrentWindow().close().catch((e) => warn("fechar as boas-vindas", e));

  // Janela transparente: o cartão arredondado é o que aparece.
  useEffect(() => {
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
  }, []);

  // Recarrega sempre que a janela aparece (pode ficar escondida o dia todo).
  const load = () => {
    setLeft(AUTO_HIDE_S);
    commands.getDashboard().then(setD, (e) => warn("boas-vindas: painel", e));
    commands.studyHome().then(setHome, (e) => warn("boas-vindas: sessão de hoje", e));
    commands.getProfile().then((p) => setName(p.name.trim()), (e) => warn("boas-vindas: perfil", e));
    sfx("open");
  };
  useEffect(load, []);
  useWindowFocus((focused) => focused && load());

  useEffect(() => {
    if (hover) return;
    if (left <= 0) return void close();
    const id = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [left, hover]);

  const goal = home ? dailyProgress(home).left : null;
  const exam = d?.exams[0];
  const today = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="h-screen p-2" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={spring.soft}
        className="relative flex h-full flex-col overflow-hidden rounded-3xl border border-border bg-background shadow-lift"
      >
        <div data-tauri-drag-region className="relative h-32 shrink-0">
          <Scenery className="absolute inset-0" />
          <button onClick={() => void close()} aria-label="Fechar" className="absolute top-3 right-3 z-10 grid size-7 place-items-center rounded-full bg-black/30 text-white hover:bg-black/50">
            <X className="size-4" />
          </button>
          <motion.div
            className="absolute -bottom-6 left-6"
            initial={{ y: -120, scaleY: 1.2 }}
            animate={{ y: [-120, 0, -10, 0], scaleY: [1.2, 0.8, 1.05, 1], scaleX: [0.9, 1.2, 0.95, 1] }}
            transition={{ duration: 0.9, times: [0, 0.55, 0.8, 1], delay: 0.2, ease: "easeOut" }}
            style={{ originY: 1 }}
          >
            <Mascot look={tierOf(d?.level.level ?? 1)} scale={6} />
          </motion.div>
        </div>

        <motion.div variants={listIn} initial="hidden" animate="show" className="flex flex-1 flex-col gap-4 px-6 pt-9 pb-5">
          <motion.div variants={itemIn}>
            <p className="text-xs text-muted-foreground first-letter:uppercase">{today}</p>
            <h1 className="text-2xl font-semibold">
              {greeting(new Date().getHours())}
              {name ? `, ${name}` : ""}!
            </h1>
          </motion.div>

          <motion.div variants={itemIn} className="grid grid-cols-3 gap-2 text-center">
            <StatTile className={TILE} valueClass="text-lg" value={<Count to={d?.streak.days ?? 0} />} label="dias seguidos" icon={<PixelFlame off={!d?.streak.days} />} />
            <StatTile className={TILE} valueClass="text-lg" value={<Count to={goal ?? 0} />} label={goal === 0 ? "meta batida!" : "faltam hoje"} icon={<PixelSword />} />
            <StatTile className={TILE} valueClass="text-lg" value={<Count to={exam?.days_left ?? 0} />} label={exam ? `dias p/ ${exam.name}` : "sem prova marcada"} icon={<PixelCalendar />} />
          </motion.div>

          {d && d.missions.length > 0 && (
            <motion.ul variants={itemIn} className="space-y-1.5 rounded-2xl bg-card p-3 text-sm">
              {d.missions.slice(0, 3).map((m) => (
                <li key={m.id} className="flex items-center gap-2">
                  <span className={m.done ? "text-success" : "text-muted-foreground"}>{m.done ? "✔" : "○"}</span>
                  <span className={m.done ? "text-muted-foreground line-through" : ""}>{m.description}</span>
                </li>
              ))}
            </motion.ul>
          )}

          {home && (home.errors_due > 0 || home.cards_due > 0) && (
            <motion.p variants={itemIn} className="text-xs text-muted-foreground">
              Para revisar hoje: {[home.errors_due && plural(home.errors_due, "erro", "erros"), home.cards_due && plural(home.cards_due, "flashcard", "flashcards")].filter(Boolean).join(" e ")}.
            </motion.p>
          )}

          <motion.div variants={itemIn} className="mt-auto space-y-2">
            <Button size="lg" className="h-11 w-full text-base" onClick={() => commands.openMain("foco").catch((e) => warn("abrir a janela principal", e))}>
              <Play /> Começar a sessão de hoje
            </Button>
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => commands.openMain(null).catch((e) => warn("abrir a janela principal", e))}>
                Abrir o Grifo Quest
              </Button>
              <Button variant="ghost" className="flex-1" onClick={() => void close()}>
                Depois
              </Button>
            </div>
          </motion.div>
        </motion.div>

        {/* Tempo até sumir sozinha (para quando o mouse está em cima). */}
        <ProgressBar value={left / AUTO_HIDE_S} className="h-1 rounded-none" tone="bg-primary/60" transition={{ duration: 1, ease: "linear" }} label="Fecha sozinha" />
      </motion.div>
    </div>
  );
}

const TILE = "border-0 px-2 py-3";
