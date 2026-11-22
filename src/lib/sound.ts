import { getFlag, saveFlag } from "@/lib/prefs";

let enabled: Promise<boolean> | null = null;

export function soundEnabled(): Promise<boolean> {
  enabled ??= getFlag("sound", true);
  return enabled;
}

export function setSoundEnabled(on: boolean) {
  enabled = Promise.resolve(on);
  saveFlag("sound", on);
}

/** Uma nota: frequência (Hz), duração (s), forma de onda e, opcional, deslize até outra frequência. */
type Note = { f: number; d: number; w?: OscillatorType; to?: number; gap?: number };

/** Paleta de sons 8-bit (estilo chiptune), gerados na hora: nada de arquivo de áudio. */
const SFX = {
  /** Trocar de tela / abrir painel: blip curto e baixo. */
  nav: [{ f: 880, d: 0.035, w: "triangle" }],
  open: [{ f: 523, d: 0.05, w: "triangle", to: 784 }],
  /** Virar cartão. */
  flip: [{ f: 330, d: 0.07, w: "square", to: 660 }],
  /** Acerto / XP: a "moedinha" clássica. */
  coin: [{ f: 988, d: 0.06 }, { f: 1319, d: 0.16 }],
  success: [{ f: 523, d: 0.07 }, { f: 659, d: 0.07 }, { f: 784, d: 0.12 }],
  error: [{ f: 196, d: 0.09 }, { f: 147, d: 0.16, gap: 0.02 }],
  /** Missão concluída. */
  chime: [{ f: 523, d: 0.09 }, { f: 659, d: 0.09 }, { f: 784, d: 0.09 }, { f: 1047, d: 0.18 }],
  levelup: [
    { f: 392, d: 0.08 }, { f: 523, d: 0.08 }, { f: 659, d: 0.08 }, { f: 784, d: 0.08 },
    { f: 1047, d: 0.1 }, { f: 784, d: 0.06 }, { f: 1047, d: 0.3 },
  ],
} satisfies Record<string, Note[]>;

export type Sfx = keyof typeof SFX;

let ctx: AudioContext | null = null;

export function sfx(name: Sfx) {
  void soundEnabled().then((on) => {
    if (!on) return;
    ctx ??= new AudioContext();
    let t = ctx.currentTime + 0.01;
    for (const n of SFX[name] as Note[]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = n.w ?? "square";
      osc.frequency.setValueAtTime(n.f, t);
      if (n.to) osc.frequency.exponentialRampToValueAtTime(n.to, t + n.d);
      // Quadrada é alta: volume baixo e corte rápido para não cansar.
      gain.gain.setValueAtTime(n.w === "triangle" ? 0.09 : 0.045, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + n.d);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + n.d + 0.02);
      t += n.d + (n.gap ?? 0.005);
    }
  });
}
