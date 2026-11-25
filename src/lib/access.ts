import { useEffect, useState } from "react";
import { commands } from "@/lib/bindings";
import { useAppEvent } from "@/lib/bus";
import { rest } from "@/lib/cloud";
import { warn } from "@/lib/utils";

/** Conta do Grifo Quest Cloud como o menu mostra. `available` falso = versão base (nada de conta). */
export type Account = {
  available: boolean;
  signedIn: boolean;
  email: string;
  /** Nome do perfil da comunidade; sem perfil (sem assinatura), a parte antes do @ do e-mail. */
  name: string;
  /** Para a cor das iniciais (estável por pessoa). */
  id: string;
  /** Foto do perfil da comunidade, se tiver. */
  photo: string | null;
  /** Assinatura ativa: libera a Comunidade (quem decide de verdade é o servidor). */
  community: boolean;
  /** Plano ativo (escudeiro, forjador, ancestral). */
  plan: string | null;
};

export const NO_ACCOUNT: Account = { available: false, signedIn: false, email: "", name: "", id: "", photo: null, community: false, plan: null };

async function loadAccount(): Promise<Account> {
  const s = await commands.accountStatus();
  if (!s.available) return NO_ACCOUNT;
  const email = s.email ?? "";
  const base: Account = { ...NO_ACCOUNT, available: true, signedIn: s.signed_in, email, id: s.user_id ?? email, name: email.split("@")[0] ?? "" };
  if (!s.signed_in) return base;
  let community = false;
  let plan: string | null = null;
  try {
    const p = await commands.accountPlan();
    community = p.active;
    plan = p.active ? p.plan : null;
  } catch (e) {
    warn("conferir a assinatura", e);
  }
  if (!community || !s.user_id) return { ...base, community, plan };
  try {
    const rows = await rest<{ display_name: string; photo_url: string | null }[]>(`profiles?id=eq.${s.user_id}&select=display_name,photo_url`);
    const p = rows[0];
    return p ? { ...base, community, plan, name: p.display_name, photo: p.photo_url } : { ...base, community, plan };
  } catch (e) {
    warn("ler o perfil", e);
    return { ...base, community, plan };
  }
}

/** Estado da conta; reconfere quando alguém entra, sai ou muda o perfil (evento `account`). */
export function useAccount(): Account {
  const [account, setAccount] = useState<Account>(NO_ACCOUNT);
  const [tick, setTick] = useState(0);
  useAppEvent("account", () => setTick((t) => t + 1));
  useEffect(() => {
    let live = true;
    loadAccount().then(
      (a) => {
        if (live) setAccount(a);
      },
      (e) => warn("ler a conta", e),
    );
    return () => {
      live = false;
    };
  }, [tick]);
  return account;
}
