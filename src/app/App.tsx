import { Component, lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { LevelUpOverlay } from "@/components/LevelUp";
import Scenery from "@/components/Scenery";
import { Toaster } from "@/components/toast";
import { commands, events } from "@/lib/bindings";
import { useAppEvent } from "@/lib/bus";
import { digitsClaimed, useKey, useTauriEvent } from "@/lib/hooks";
import { useTheme } from "@/lib/theme";
import { warn } from "@/lib/utils";
import { SLOTS, toSlot, type SlotId } from "./nav";
import { Sidebar } from "./Sidebar";
import { PageTransition, ScreenSkeleton } from "./transitions";

// Cada tela num chunk próprio: a janela abre rápido e só baixa o que for usado.
const DiaryScreen = lazy(() => import("@/features/diary/DiaryScreen"));
const StudyScreen = lazy(() => import("@/features/study/StudyScreen"));
const ClassroomScreen = lazy(() => import("@/features/classroom/ClassroomScreen"));
const SubjectsScreen = lazy(() => import("@/features/subjects/SubjectsScreen"));
const WorldScreen = lazy(() => import("@/features/world/WorldScreen"));
const SettingsScreen = lazy(() => import("@/features/settings/SettingsScreen"));
const Onboarding = lazy(() => import("@/features/onboarding/Onboarding"));

/** Erro numa tela não derruba o app: mostra o aviso e deixa tentar de novo. */
class ScreenBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="mx-auto mt-16 max-w-md space-y-3 rounded-2xl border border-border bg-card p-6 text-center shadow-soft">
        <p className="font-semibold">Esta tela tropeçou.</p>
        <p className="text-sm text-muted-foreground">{this.state.error.message}</p>
        <button className="text-sm text-primary underline-offset-4 hover:underline" onClick={() => this.setState({ error: null })}>
          Tentar de novo
        </button>
      </div>
    );
  }
}

export default function App() {
  const [slot, setSlot] = useState<SlotId>("diario");
  const { motion: motionOn } = useTheme();
  const [onboarding, setOnboarding] = useState<boolean | null>(null);

  useEffect(() => {
    commands.getProfile().then(
      (p) => setOnboarding(!p.onboarded),
      (e) => {
        warn("ler o perfil", e);
        setOnboarding(false);
      },
    );
  }, []);
  useAppEvent("onboarding", () => setOnboarding(true));
  // Boas-vindas do Windows pedem uma tela ("foco" = Estudo).
  useTauriEvent(events.navigateTo, (s) => {
    const target = toSlot(s);
    if (target) setSlot(target);
  });

  useKey((e) => {
    const target = SLOTS[Number(e.key) - 1];
    if (target && !digitsClaimed()) setSlot(target.id);
  });

  if (onboarding === null) return null;
  if (onboarding) {
    return (
      <>
        <Suspense fallback={null}>
          <Onboarding
            onDone={() => {
              setOnboarding(false);
              setSlot("diario");
            }}
          />
        </Suspense>
        <Toaster />
      </>
    );
  }

  const scenery = slot === "diario" && motionOn;
  return (
    <>
      <div className="flex h-screen overflow-hidden">
        <Sidebar slot={slot} go={setSlot} />

        <main className="relative flex-1 overflow-y-auto">
          <AnimatePresence>
            {scenery && (
              <motion.div
                key="scenery"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.5 }}
                className="absolute inset-x-0 top-0 h-[300px]"
              >
                <Scenery className="absolute inset-0" />
              </motion.div>
            )}
          </AnimatePresence>

          <div className={`relative mx-auto max-w-6xl px-8 pb-7 transition-[padding] duration-500 ${scenery ? "pt-44" : "pt-7"}`}>
            <Suspense fallback={<ScreenSkeleton />}>
              <AnimatePresence mode="wait">
                <PageTransition key={slot}>
                  <ScreenBoundary>
                    {slot === "diario" && <DiaryScreen go={setSlot} />}
                    {slot === "foco" && <StudyScreen />}
                    {slot === "sala" && <ClassroomScreen />}
                    {slot === "materias" && <SubjectsScreen />}
                    {slot === "mundo" && <WorldScreen />}
                    {slot === "config" && <SettingsScreen />}
                  </ScreenBoundary>
                </PageTransition>
              </AnimatePresence>
            </Suspense>
          </div>
        </main>
      </div>
      <Toaster />
      <LevelUpOverlay />
    </>
  );
}
