import { overlay, PixelSprite } from "@/components/PixelSprite";
import type { Student } from "@/lib/bindings";

type Look = { hair: string; skin: string; shirt: string; glasses?: boolean };
/** Jeito de falar (tom e velocidade) e qual voz pt-BR usar se houver várias. */
type Persona = { pitch: number; rate: number; voice: number };

/** Cada aluno da turma: aparência e voz. Camisetas em cores do tema combinam com qualquer paleta. */
export const STUDENTS: Record<Student, { look: Look; persona: Persona }> = {
  curioso: { look: { hair: "#4a2f1c", skin: "#e0b48a", shirt: "var(--primary)" }, persona: { pitch: 1.25, rate: 1.1, voice: 0 } },
  literal: { look: { hair: "#1d1d1d", skin: "#c58c5c", shirt: "#5f8fa3", glasses: true }, persona: { pitch: 0.9, rate: 0.95, voice: 1 } },
  confuso: { look: { hair: "#c96a2b", skin: "#f1c9a5", shirt: "#8a7fb0" }, persona: { pitch: 1.1, rate: 0.9, voice: 2 } },
  advogado: { look: { hair: "#2b2b2b", skin: "#8d5a3b", shirt: "var(--destructive)" }, persona: { pitch: 0.8, rate: 1.05, voice: 1 } },
  pragmatico: { look: { hair: "#6b4f33", skin: "#e8bf98", shirt: "var(--accent)" }, persona: { pitch: 1.0, rate: 1.15, voice: 0 } },
  timido: { look: { hair: "#d9c27a", skin: "#f3d6bd", shirt: "var(--muted-foreground)", glasses: true }, persona: { pitch: 1.35, rate: 0.85, voice: 2 } },
};

const FACE = [
  "..hhhhhh..",
  ".hhhhhhhh.",
  ".hssssssh.",
  ".ssssssss.",
  ".sspsspss.",
  ".ssssssss.",
  ".sssmmsss.",
  "..ssssss..",
  "..cccccc..",
  ".cccccccc.",
];

const WITH_GLASSES = overlay(FACE, ["..........", "..........", "..........", "..........", "..gpggpg.."]);

export function Avatar({ student, scale = 5, title }: { student: Student; scale?: number; title?: string }) {
  const look = STUDENTS[student].look;
  return (
    <PixelSprite
      map={look.glasses ? WITH_GLASSES : FACE}
      scale={scale}
      title={title}
      colors={{ h: look.hair, s: look.skin, p: "#1b1a17", m: "#8a3b2e", c: look.shirt, g: "#d8dde3" }}
    />
  );
}
