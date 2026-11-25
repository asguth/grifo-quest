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
  /** Visual do Grifinho escolhido no perfil. */
  avatar: string;
  /** Assinatura ativa: libera a Comunidade (quem decide de verdade é o servidor). */
  community: boolean;
};

export const NO_ACCOUNT: Account = { available: false, signedIn: false, email: "", name: "", avatar: "base", community: false };

async function loadAccount(): Promise<Account> {
  const s = await commands.accountStatus();
  if (!s.available) return NO_ACCOUNT;
  const email = s.email ?? "";
  const base: Account = { ...NO_ACCOUNT, available: true, signedIn: s.signed_in, email, name: email.split("@")[0] ?? "" };
  if (!s.signed_in) return base;
  let community = false;
  try {
    community = (await commands.accountPlan()).active;
  } catch (e) {
    warn("conferir a assinatura", e);
  }
  if (!community || !s.user_id) return { ...base, community };
  try {
    const rows = await rest<{ display_name: string; avatar: string }[]>(`profiles?id=eq.${s.user_id}&select=display_name,avatar`);
    const p = rows[0];
    return p ? { ...base, community, name: p.display_name, avatar: p.avatar } : { ...base, community };
  } catch (e) {
    warn("ler o perfil", e);
    return { ...base, community };
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
