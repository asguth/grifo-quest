import { commands, type UiKey } from "@/lib/bindings";
import { warn } from "@/lib/utils";

export type { UiKey };

/** Valor salvo, ou `null` se não houver (ou se a leitura falhar: o chamador usa o padrão). */
export async function getPref(key: UiKey): Promise<string | null> {
  try {
    return await commands.getUiPref(key);
  } catch (e) {
    warn(`ler a preferência ${key}`, e);
    return null;
  }
}

export async function setPref(key: UiKey, value: string): Promise<void> {
  await commands.setUiPref(key, value);
}

/**
 * Liga/desliga salvo como "on"/"off". O backend lê `welcome_on_boot == "off"`, e versões antigas
 * gravavam `sidebar_collapsed` como "1"/"0": os dois formatos são lidos.
 */
export async function getFlag(key: UiKey, fallback: boolean): Promise<boolean> {
  const v = await getPref(key);
  if (v === "on" || v === "1") return true;
  if (v === "off" || v === "0") return false;
  return fallback;
}

async function setFlag(key: UiKey, on: boolean): Promise<void> {
  await setPref(key, on ? "on" : "off");
}

/** Grava sem esperar; falha vai para o console (preferência não é dado do usuário). */
export function saveFlag(key: UiKey, on: boolean) {
  setFlag(key, on).catch((e) => warn(`salvar a preferência ${key}`, e));
}
