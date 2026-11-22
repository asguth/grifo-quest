import { useEffect, useState } from "react";
import { commands, events, type UpdateInfo } from "@/lib/bindings";
import { useTauriEvent } from "@/lib/hooks";
import { toastError } from "@/components/toast";
import { warn } from "@/lib/utils";

/** Versão nova já baixada (o Rust procura sozinho ao abrir e a cada 6 h). */
export function useUpdate() {
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  useEffect(() => {
    commands.updateStatus().then(setUpdate, (e) => warn("atualização", e));
  }, []);
  useTauriEvent(events.updateReady, setUpdate);
  return update;
}

export function installUpdate() {
  return commands.installUpdate().catch(toastError);
}
