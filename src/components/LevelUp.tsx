import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { MASCOT_PALETTE, Mascot, tierOf, UNLOCKS } from "@/components/Mascot";
import { emit, useAppEvent } from "@/lib/bus";
import { ease, spring } from "@/lib/motion";
import { sfx } from "@/lib/sound";

/** Dispara a festa de nível novo de qualquer lugar (questões, pomodoro, missões). */
export function celebrateLevel(level: number) {
  emit("levelup", level);
}

const CONFETTI = ["var(--primary)", "var(--accent)", MASCOT_PALETTE.crown, "#ffffff", MASCOT_PALETTE.beak];

/** Quanto a festa fica na tela antes de sumir sozinha. */
const SHOW_S = 3.4;

function unlockText(level: number): string {
  const tier = tierOf(level);
  return tier !== "base" && UNLOCKS[tier].level === level ? UNLOCKS[tier].text : "Constância é o seu superpoder.";
}

/** Tela cheia curta: mascote pula, "NÍVEL N", confete pixelado. Some sozinha ou no clique. */
export function LevelUpOverlay() {
  const [level, setLevel] = useState<number | null>(null);

  useAppEvent("levelup", (n) => {
    setLevel(n);
    sfx("levelup");
  });

  // Confete: 36 quadradinhos saindo do centro em direções e distâncias diferentes.
  const bits = useMemo(
    () =>
      Array.from({ length: 36 }, (_, i) => {
        const a = (i / 36) * Math.PI * 2 + (i % 3) * 0.2;
        const dist = 140 + ((i * 53) % 180);
        return { x: Math.cos(a) * dist, y: Math.sin(a) * dist - 60, size: 6 + (i % 3) * 3, color: CONFETTI[i % CONFETTI.length], delay: (i % 6) * 0.02 };
      }),
    [],
  );

  return (
    <AnimatePresence>
      {level !== null && (
        <motion.div
          key={level}
          role="alert"
          aria-label={`Subiu para o nível ${level}`}
          onClick={() => setLevel(null)}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 1] }}
          transition={{ duration: SHOW_S, times: [0, 0.07, 1] }}
          onAnimationComplete={() => setLevel(null)}
          exit={{ opacity: 0, transition: { duration: 0.25 } }}
          className="fixed inset-0 z-[60] grid cursor-pointer place-items-center bg-background/80 backdrop-blur-sm"
        >
          <div className="relative grid place-items-center">
            {bits.map((b, i) => (
              <motion.span
                key={i}
                className="absolute"
                style={{ width: b.size, height: b.size, background: b.color }}
                initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
                animate={{ x: b.x, y: [0, b.y, b.y + 220], opacity: [1, 1, 0], rotate: 180 }}
                transition={{ duration: 1.8, delay: 0.25 + b.delay, ease: ease.out }}
              />
            ))}
            {/* Mascote: agacha (squash), pula (stretch) e assenta */}
            <motion.div
              initial={{ y: 40, scaleY: 0.7, scaleX: 1.2 }}
              animate={{ y: [40, -50, 0], scaleY: [0.7, 1.15, 1], scaleX: [1.2, 0.9, 1] }}
              transition={{ duration: 0.7, times: [0, 0.5, 1], ease: "easeOut" }}
              style={{ originY: 1 }}
            >
              <Mascot look={tierOf(level)} scale={10} title={`Grifinho, nível ${level}`} />
            </motion.div>
            <motion.p
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ ...spring.bouncy, delay: 0.35 }}
              className="retro mt-6 text-3xl text-primary drop-shadow-[0_3px_0_rgba(0,0,0,0.5)]"
            >
              NÍVEL {level}!
            </motion.p>
            <motion.p initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }} className="mt-2 text-sm text-muted-foreground">
              {unlockText(level)}
            </motion.p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
