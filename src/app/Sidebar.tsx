import { getVersion } from "@tauri-apps/api/app";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { PanelLeftClose, PanelLeftOpen, Pause, Play } from "lucide-react";
import { Mascot } from "@/components/Mascot";
import { PersonPhoto } from "@/components/PersonPhoto";
import type { Account } from "@/lib/access";
import { tierOf } from "@/lib/tiers";
import { commands, type NavBadges } from "@/lib/bindings";
import { spring } from "@/lib/motion";
import { getFlag, saveFlag } from "@/lib/prefs";
import { clock, timerFraction, timerLabel, timerSeconds, useTimer } from "@/lib/timer";
import { sfx } from "@/lib/sound";
import { cn, warn } from "@/lib/utils";
import { badgeOf, visibleSlots, type Navigate, type SlotId } from "./nav";
import { UpdateButton } from "./UpdateButton";
import { toastError } from "@/components/toast";
import { PixelBar } from "@/features/focus/PixelRing";
import { requestStudyTab } from "@/features/study/tabRequest";
import { requestSettingsTab } from "@/features/settings/tabRequest";

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

export function Sidebar({ slot, go, account }: { slot: SlotId; go: Navigate; account: Account }) {
  const [collapsed, setCollapsed] = useState(false);
  const [timer, setTimer] = useTimer();
  const [version, setVersion] = useState("");
  useEffect(() => void getVersion().then(setVersion, (e) => warn("versão do app", e)), []);
  const onBreak = timer.mode === "pomodoro" && timer.phase === "break";
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
      <div className={cn("mb-4 flex h-10 items-center gap-2.5 overflow-hidden", collapsed ? "justify-center" : "px-1.5")}>
        <span className="shrink-0">
          <Mascot scale={2} />
        </span>
        {!collapsed && <span className="retro truncate text-[10px] text-primary">Grifo Quest</span>}
      </div>

      <AccountChip account={account} collapsed={collapsed} go={go} />

      {visibleSlots(account.community).map((s) => {
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
            data-tour={s.id}
            title={collapsed ? s.label : undefined}
            className={cn(
              // recolhido: ícone no centro exato (com px-3 ele ficava 3 px para a esquerda)
              "group relative flex h-10 items-center gap-3 rounded-lg text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
              collapsed ? "justify-center px-0" : "px-3",
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
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              className={cn(
                "relative overflow-hidden rounded-xl border bg-secondary/50 shadow-soft",
                onBreak ? "border-success/40" : "border-primary/40",
              )}
            >
              {/* O cartão inteiro leva à aba Foco; o botão de pausa fica por cima, à direita. */}
              <button
                onClick={() => {
                  requestStudyTab("foco");
                  go("foco");
                }}
                title="Abrir o Foco"
                className={cn("block w-full text-left transition-colors hover:bg-secondary", collapsed ? "px-1 py-2" : "p-2.5 pr-11")}
              >
                <span className={cn("flex items-center gap-2", collapsed && "flex-col gap-1")}>
                  <motion.span
                    className="shrink-0"
                    animate={timer.paused ? { rotate: -8, opacity: 0.6 } : { y: [0, -2, 0], rotate: 0, opacity: 1 }}
                    transition={timer.paused ? { duration: 0.3 } : { duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
                  >
                    <Mascot look="cap" scale={1.5} />
                  </motion.span>
                  <span className="min-w-0 flex-1">
                    {!collapsed && (
                      <span className={cn("retro block truncate text-[8px]", onBreak ? "text-success" : "text-primary")}>
                        {timer.paused ? "PAUSADO" : timerLabel(timer).toUpperCase()}
                      </span>
                    )}
                    <span className={cn("retro tabular block", collapsed ? "text-center text-[9px]" : "mt-1 text-sm", timer.paused && "animate-pulse")}>
                      {clock(timerSeconds(timer))}
                    </span>
                  </span>
                </span>
                <PixelBar value={timerFraction(timer)} tone={onBreak ? "var(--accent)" : "var(--primary)"} className="mt-2" />
              </button>
              {!collapsed && (
                <button
                  onClick={() => void commands.togglePause().then(setTimer, toastError)}
                  aria-label={timer.paused ? "Continuar" : "Pausar"}
                  title={timer.paused ? "Continuar" : "Pausar"}
                  className="absolute top-2.5 right-2 grid size-7 place-items-center rounded-lg bg-card/80 text-foreground hover:bg-primary hover:text-primary-foreground"
                >
                  {timer.paused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <UpdateButton collapsed={collapsed} />

        <button
          onClick={toggle}
          aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
          className={cn("flex h-9 w-full items-center gap-3 rounded-lg text-xs text-muted-foreground hover:bg-secondary/70 hover:text-foreground", collapsed ? "justify-center px-0" : "px-3")}
        >
          {collapsed ? <PanelLeftOpen className="size-4 shrink-0" /> : <PanelLeftClose className="size-4 shrink-0" />}
          {!collapsed && "Recolher"}
        </button>
        {/* versão bem discreta no canto (para saber o que está instalado sem abrir a Config) */}
        {version && (
          <p className={cn("tabular pointer-events-none px-3 text-[10px] text-muted-foreground opacity-35 select-none", collapsed && "px-0 text-center")} aria-label={`Versão ${version}`}>
            v{version}
          </p>
        )}
      </div>
    </motion.nav>
  );
}

/** Quem está logado: nome, foto e plano. Leva à Config → Conta. */
function AccountChip({ account, collapsed, go }: { account: Account; collapsed: boolean; go: Navigate }) {
  if (!account.available) return null;
  const tier = tierOf(account.plan);
  const openAccount = () => {
    requestSettingsTab("conta");
    go("config");
  };
  // sem login, nada no menu: quem não assina não é incomodado (a conta fica em Config → Conta)
  if (!account.signedIn) return null;
  return (
    <button
      onClick={openAccount}
      title={collapsed ? account.name : account.email}
      className={cn("mb-3 flex items-center gap-2.5 rounded-xl bg-secondary/60 p-1.5 text-left hover:bg-secondary", collapsed && "justify-center")}
    >
      <PersonPhoto p={{ id: account.id, display_name: account.name, photo_url: account.photo }} size={36} />
      {!collapsed && (
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{account.name}</span>
          <span className="block truncate text-[11px]" style={tier ? { color: tier.tone.fg } : undefined}>
            {tier ? tier.name : account.community ? "Cloud ativo" : "sem assinatura"}
          </span>
        </span>
      )}
    </button>
  );
}
