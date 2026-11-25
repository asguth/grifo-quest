import { useEffect, useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { Check, CloudUpload, LogIn, LogOut, Palette, Sparkles, Users } from "lucide-react";
import { Mascot } from "@/components/Mascot";
import { PersonPhoto } from "@/components/PersonPhoto";
import { TierBadge } from "@/components/TierBadge";
import { toast, toastError } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { commands, type AccountStatus, type Plan } from "@/lib/bindings";
import { emit } from "@/lib/bus";
import { forgetCloudAccess } from "@/lib/cloud";
import { formatDate } from "@/lib/format";
import { useAccount } from "@/lib/access";
import { breathe } from "@/lib/motion";
import { TIERS, type Tier } from "@/lib/tiers";
import { cn, errorMessage, warn } from "@/lib/utils";

/** Este build tem a nuvem? (a versão base responde que não e a aba Conta nem aparece) */
export function useCloudAvailable(): boolean {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    commands.accountStatus().then((s) => setAvailable(s.available), (e) => warn("ler a conta", e));
  }, []);
  return available;
}

/** Avisa o resto do app (menu, Comunidade) que a conta mudou. */
function accountChanged() {
  forgetCloudAccess();
  emit("account");
}

/** Config → Conta: entrar e ver a assinatura do Grifo Quest Cloud. */
export function Account() {
  const [status, setStatus] = useState<AccountStatus | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [planError, setPlanError] = useState("");
  const account = useAccount();

  const load = async () => {
    const s = await commands.accountStatus();
    setStatus(s);
    setPlan(null);
    setPlanError("");
    if (s.signed_in) commands.accountPlan().then(setPlan, (e) => setPlanError(errorMessage(e)));
  };
  useEffect(() => {
    load().catch(toastError);
  }, []);

  if (!status) return null;
  if (!status.signed_in) {
    return (
      <SignIn
        onDone={(s) => {
          accountChanged();
          void load().then(() => toast(`Bem-vindo, ${s.email ?? ""}!`, "success"));
        }}
      />
    );
  }

  return (
    <div className="space-y-5">
      <section className="space-y-5 rounded-2xl border border-border bg-card p-6 shadow-soft">
        <div className="flex flex-wrap items-center gap-4">
          <PersonPhoto p={{ id: account.id || status.email || "", display_name: account.name || status.email || "?", photo_url: account.photo }} size={64} />
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2 text-lg font-semibold">
              <span className="truncate">{account.name || status.email}</span>
              <TierBadge plan={plan?.active ? plan.plan : null} />
            </p>
            <p className="truncate text-sm text-muted-foreground">{status.email}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              commands.accountSignOut().then(() => {
                accountChanged();
                return load();
              }, toastError);
            }}
          >
            <LogOut /> Sair
          </Button>
        </div>
        <p className={cn("rounded-xl px-4 py-3 text-sm", planError ? "bg-destructive/10 text-destructive" : "bg-secondary/60")}>
          {planError
            ? planError
            : !plan
              ? "Conferindo a assinatura…"
              : plan.active
                ? `Assinatura ativa${plan.current_period_end ? ` até ${formatDate(plan.current_period_end)}` : ""}.`
                : "Sem assinatura ativa. Seus estudos continuam no seu PC como sempre."}
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Planos</h2>
        <div className="grid gap-3 md:grid-cols-3">
          {TIERS.map((t) => (
            <TierCard key={t.id} tier={t} current={!!plan?.active && plan.plan === t.id} />
          ))}
        </div>
        <p className="text-xs text-muted-foreground">O pagamento pelo app chega em breve. Sem plano, o Grifo Quest continua completo no seu PC.</p>
      </section>
    </div>
  );
}

function TierCard({ tier, current }: { tier: Tier; current: boolean }) {
  return (
    <div
      className="flex flex-col gap-3 rounded-2xl border bg-card p-5 shadow-soft"
      style={{ borderColor: current ? tier.tone.fg : undefined, boxShadow: current ? `0 0 0 1px ${tier.tone.fg}` : undefined }}
    >
      <div className="flex items-center justify-between gap-2">
        <TierBadge plan={tier.id} />
        {current && <span className="text-xs font-medium" style={{ color: tier.tone.fg }}>Seu plano</span>}
      </div>
      <p className="text-sm text-muted-foreground">{tier.tagline}</p>
      <ul className="flex-1 space-y-1.5 text-sm">
        {tier.perks.map((perk) => (
          <li key={perk} className="flex gap-2">
            <Check className="mt-0.5 size-4 shrink-0" style={{ color: tier.tone.fg }} /> {perk}
          </li>
        ))}
      </ul>
      {!current && (
        <Button variant="outline" size="sm" onClick={() => toast("O pagamento pelo app chega em breve.")}>
          Quero este
        </Button>
      )}
    </div>
  );
}

function Perks() {
  return (
    <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      <Perk icon={<Users className="size-4" />} title="Comunidade" text="Fórum por concurso, amigos e mensagens." />
      <Perk icon={<Sparkles className="size-4" />} title="IA na nuvem" text="Sem precisar de placa de vídeo." soon />
      <Perk icon={<CloudUpload className="size-4" />} title="Backup" text="Seus estudos salvos na nuvem." soon />
      <Perk icon={<Palette className="size-4" />} title="Skins" text="Visuais novos para o Grifinho." soon />
    </ul>
  );
}

function Perk({ icon, title, text, soon }: { icon: ReactNode; title: string; text: string; soon?: boolean }) {
  return (
    <li className="space-y-1 rounded-xl bg-secondary/50 p-3">
      <span className={cn("flex items-center gap-1.5 text-sm font-medium", soon ? "text-muted-foreground" : "text-primary")}>
        {icon} {title}
        {soon && <span className="ml-auto rounded-full bg-card px-2 py-0.5 text-[10px] font-normal text-muted-foreground">em breve</span>}
      </span>
      <span className="block text-xs text-muted-foreground">{text}</span>
    </li>
  );
}

function SignIn({ onDone }: { onDone: (s: AccountStatus) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const ready = !!email.trim() && !!password;

  const submit = async () => {
    setBusy(true);
    try {
      const s = await commands.accountSignInPassword(email, password);
      setPassword("");
      onDone(s);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-6 rounded-2xl border border-border bg-card p-7 shadow-soft">
      <div className="flex flex-col items-center gap-3 text-center">
        <motion.div {...breathe}>
          <Mascot look="crown" scale={5} />
        </motion.div>
        <div className="max-w-md space-y-1">
          <h2 className="retro text-xs text-primary">Grifo Quest Cloud</h2>
          <p className="text-sm text-muted-foreground">Entre para usar a comunidade. É opcional: sem conta, o app funciona igual no seu PC.</p>
        </div>
      </div>

      <form
        className="mx-auto max-w-md space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (ready) void submit();
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="account-email">E-mail</Label>
          <Input id="account-email" type="email" autoComplete="email" autoFocus value={email} disabled={busy} onChange={(e) => setEmail(e.target.value)} className="h-10" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="account-password">Senha</Label>
          <Input id="account-password" type="password" autoComplete="current-password" value={password} disabled={busy} onChange={(e) => setPassword(e.target.value)} className="h-10" />
        </div>
        <Button type="submit" size="lg" className="h-10 w-full" disabled={busy || !ready}>
          <LogIn /> {busy ? "Entrando…" : "Entrar"}
        </Button>
      </form>
      <Perks />
    </section>
  );
}
