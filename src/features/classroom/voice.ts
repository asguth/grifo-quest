import { useCallback, useRef, useState } from "react";
import { commands, events, type Student } from "@/lib/bindings";
import { useTauriEvent } from "@/lib/hooks";
import { ptVoices } from "@/lib/speech";
import { errorMessage } from "@/lib/utils";
import { STUDENTS } from "./students";

type VoicePhase = "idle" | "recording" | "transcribing";

const BARS = 28;

/** Gravar → transcrever no PC (whisper.cpp). `levels` alimenta a onda animada. */
export function useVoice(onText: (text: string) => void, onError: (msg: string) => void) {
  const [phase, setPhase] = useState<VoicePhase>("idle");
  const [levels, setLevels] = useState<number[]>(() => Array(BARS).fill(0));
  const busy = useRef(false);

  useTauriEvent(events.voiceLevel, (v) => setLevels((l) => [...l.slice(1), v ?? 0]));

  const start = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      await commands.voiceStart();
      setPhase("recording");
    } catch (e) {
      busy.current = false;
      onError(errorMessage(e));
    }
  }, [onError]);

  const stop = useCallback(async () => {
    if (!busy.current) return;
    setPhase("transcribing");
    try {
      const text = await commands.voiceStop();
      if (text) onText(text);
      else onError("Não entendi nada. Fale mais perto do microfone?");
    } catch (e) {
      onError(errorMessage(e));
    } finally {
      busy.current = false;
      setPhase("idle");
      setLevels(Array(BARS).fill(0));
    }
  }, [onText, onError]);

  return { phase, levels, start, stop };
}

/** O aluno fala a pergunta com a voz do Windows (offline, sem custo). */
export function speak(text: string, student: Student, onStart: () => void, onEnd: () => void) {
  const synth = window.speechSynthesis;
  const voices = ptVoices();
  if (!synth || !voices.length) return onEnd();
  synth.cancel();
  const p = STUDENTS[student].persona;
  const u = new SpeechSynthesisUtterance(text);
  u.voice = voices[p.voice % voices.length];
  u.lang = u.voice.lang;
  u.pitch = p.pitch;
  u.rate = p.rate;
  u.onstart = onStart;
  u.onend = onEnd;
  u.onerror = onEnd;
  synth.speak(u);
}

export function stopSpeaking() {
  window.speechSynthesis?.cancel();
}
