import { useEffect, useState } from "react";

/** Vozes pt-BR do Windows (ou qualquer pt, se não houver pt-BR). */
export function ptVoices(): SpeechSynthesisVoice[] {
  const all = window.speechSynthesis?.getVoices() ?? [];
  const br = all.filter((v) => v.lang.toLowerCase().startsWith("pt-br"));
  return br.length ? br : all.filter((v) => v.lang.toLowerCase().startsWith("pt"));
}

/** O WebView2 entrega a lista de vozes depois da página: reavalia a cada `voiceschanged`. */
export function useHasPtVoice() {
  const [has, setHas] = useState(() => ptVoices().length > 0);
  useEffect(() => {
    const synth = window.speechSynthesis;
    if (!synth) return;
    const update = () => setHas(ptVoices().length > 0);
    synth.addEventListener("voiceschanged", update);
    update();
    return () => synth.removeEventListener("voiceschanged", update);
  }, []);
  return has;
}
