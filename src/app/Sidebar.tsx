import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Mascot } from "@/components/Mascot";
import { commands, type NavBadges } from "@/lib/bindings";
import { spring } from "@/lib/motion";
import { getFlag, saveFlag } from "@/lib/prefs";
import { clock, timerLabel, timerSeconds, useTimer } from "@/lib/timer";
import { sfx } from "@/lib/sound";
import { cn, warn } from "@/lib/utils";
import { badgeOf, SLOTS, type Navigate, type SlotId } from "./nav";
import { UpdateButton } from "./UpdateButton";

function useBadges(slot: SlotId) {
  const [b, setB] = useState<NavBadges>({ unread_news: 0, reviews_due: 0, study_due: 0 });
  useEffect(() => {
    const load = () => commands.navBadges().then(setB, (e) => warn("contadores do menu", e));
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [slot]); // recarrega ao trocar de tela (ex.: depois de ler notícias)
  return b;
}

export function Sidebar({ slot, go }: { slot: SlotId; go: Navigate }) {
  const [collapsed, setCollapsed] = useState(false);
  const [timer] = useTimer();
  const badges = useBadges(slot);
  const badgeBySlot = badgeOf(badges);

  useEffect(() => void getFlag("sidebar_collapsed", false).then(setCollapsed), []);
  const toggle = () => {
    setCollapsed(!collapsed);
    saveFlag("sidebar_collapsed", !collapsed);
  };

  return (
    <motion.nav
      aria-label="Navegação"
      animate={{ width: collapsed ? 72 : 232 }}
      transition={spring.soft}
      className="relative z-10 flex shrink-0 flex-col gap-1 border-r border-border bg-card/80 px-3 py-4 backdrop-blur-md"
    >
      <div className="mb-4 flex h-10 items-center gap-2.5 overflow-hidden px-1.5">
        <span className="shrink-0">
          <Mascot scale={2} />
        </span>
        {!collapsed && <span className="retro truncate text-[10px] text-primary">Grifo Quest</span>}
      </div>

      {SLOTS.map((s, i) => {
        const active = slot === s.id;
        const badge = badgeBySlot[s.id] ?? 0;
        const Icon = s.icon;
        return (
          <button
            key={s.id}
            onClick={() => {
              if (!active) sfx("nav");
              go(s.id);
            }}
            aria-current={active ? "page" : undefined}
            title={collapsed ? `${s.label} (${i + 1})` : undefined}
            className={cn(
              "group relative flex h-10 items-center gap-3 rounded-lg px-3 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
              active ? "text-primary-foreground" : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground",
            )}
          >
            {active && (
              <motion.span
                layoutId="nav-active"
                className="absolute inset-0 rounded-lg bg-primary shadow-soft"
                transition={spring.snappy}
              />
            )}
            <Icon className="relative size-[18px] shrink-0" strokeWidth={2} />
            {!collapsed && <span className="relative flex-1 truncate text-left font-medium">{s.label}</span>}
            {!collapsed && !badge && (
              <kbd className="relative text-[10px] opacity-0 transition-opacity group-hover:opacity-50">{i + 1}</kbd>
            )}
            <AnimatePresence>
              {badge > 0 && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0 }}
                  className={cn(
                    "tabular relative grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[10px] font-semibold",
                    active ? "bg-primary-foreground text-primary" : "bg-destructive text-white",
                    collapsed && "absolute top-1 right-1 h-4 min-w-4",
                  )}
                >
                  {badge > 99 ? "99+" : badge}
                </motion.span>
              )}
            </AnimatePresence>
          </button>
        );
      })}

      <div className="mt-auto space-y-2">
        <AnimatePresence>
          {timer.mode !== "idle" && (
            <motion.button
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              onClick={() => go("foco")}
              title="Abrir o Estudo"
              className={cn("relative w-full overflow-hidden rounded-lg border border-border bg-secondary/60 text-left", collapsed ? "px-0.5 py-2" : "p-2.5")}
            >
              {timer.mode === "pomodoro" && (
                <span
                  className="absolute inset-y-0 left-0 bg-primary/15 transition-[width] duration-1000 ease-linear"
                  style={{ width: `${(1 - timer.remaining / Math.max(1, timer.total)) * 100}%` }}
                />
              )}
              <span className="relative flex items-center gap-2">
                {!collapsed && <span className={cn("size-2 shrink-0 rounded-full bg-primary", !timer.paused && "animate-pulse")} />}
                {!collapsed && (
                  <span className="truncate text-xs text-muted-foreground">
                    {timerLabel(timer)}
                    {timer.paused && " · pausado"}
                  </span>
                )}
                <span className={cn("tabular ml-auto font-semibold", collapsed ? "mx-auto text-[11px]" : "text-sm", timer.paused && "opacity-60")}>
                  {clock(timerSeconds(timer))}
                </span>
              </span>
            </motion.button>
          )}
        </AnimatePresence>

        <UpdateButton collapsed={collapsed} />

        <button
          onClick={toggle}
          aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
          className="flex h-9 w-full items-center gap-3 rounded-lg px-3 text-xs text-muted-foreground hover:bg-secondary/70 hover:text-foreground"
        >
          {collapsed ? <PanelLeftOpen className="size-4 shrink-0" /> : <PanelLeftClose className="size-4 shrink-0" />}
          {!collapsed && "Recolher"}
        </button>
      </div>
    </motion.nav>
  );
}
