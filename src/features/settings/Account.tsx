import { useEffect, useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { ArrowLeft, CloudUpload, LogIn, LogOut, Mail, Palette, Users } from "lucide-react";
import { Mascot } from "@/components/Mascot";
import { toast, toastError } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { commands, type AccountStatus, type Plan } from "@/lib/bindings";
import { emit } from "@/lib/bus";
import { forgetCloudAccess } from "@/lib/cloud";
import { formatDate } from "@/lib/format";
import { breathe } from "@/lib/motion";
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
    <section className="mx-auto max-w-xl space-y-5 rounded-2xl border border-border bg-card p-6 shadow-soft">
      <div className="flex items-center gap-4">
        <span className="grid size-16 place-items-center rounded-2xl bg-secondary">
          <Mascot look={plan?.active ? "crown" : "base"} scale={3} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="retro text-[10px] text-primary">Grifo Quest Cloud</p>
          <p className="truncate font-semibold">{status.email}</p>
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

      <div
        className={cn(
          "rounded-xl border p-4 text-sm",
          planError ? "border-destructive/40 bg-destructive/5" : plan?.active ? "border-primary/40 bg-primary/5" : "border-border bg-secondary/50",
        )}
      >
        {planError ? (
          <p className="text-destructive">{planError}</p>
        ) : !plan ? (
          <p className="text-muted-foreground">Conferindo a assinatura…</p>
        ) : plan.active ? (
          <p>
            <span className="font-semibold">Assinatura ativa</span>
            {plan.current_period_end ? ` até ${formatDate(plan.current_period_end)}` : ""}. Comunidade e backup na nuvem liberados.
          </p>
        ) : (
          <p className="text-muted-foreground">
            <span className="font-semibold text-foreground">Sem assinatura ativa.</span> Seus estudos continuam no seu PC como sempre; a assinatura libera a
            comunidade e o backup na nuvem.
          </p>
        )}
      </div>
      <Perks />
    </section>
  );
}

function Perks() {
  return (
    <ul className="grid gap-2 sm:grid-cols-3">
      <Perk icon={<Users className="size-4" />} title="Comunidade" text="Comunidades por concurso, recados e amigos." />
      <Perk icon={<CloudUpload className="size-4" />} title="Backup" text="Seus estudos salvos na nuvem." />
      <Perk icon={<Palette className="size-4" />} title="Skins" text="Visuais novos para o Grifinho." />
    </ul>
  );
}

function Perk({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <li className="space-y-1 rounded-xl bg-secondary/50 p-3">
      <span className="flex items-center gap-1.5 text-sm font-medium text-primary">
        {icon} {title}
      </span>
      <span className="block text-xs text-muted-foreground">{text}</span>
    </li>
  );
}

function SignIn({ onDone }: { onDone: (s: AccountStatus) => void }) {
  const [mode, setMode] = useState<"password" | "code">("password");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const run = async (f: () => Promise<void>) => {
    setBusy(true);
    try {
      await f();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  const submit = () =>
    run(async () => {
      if (mode === "password") {
        const s = await commands.accountSignInPassword(email, password);
        setPassword("");
        onDone(s);
      } else if (sent) {
        onDone(await commands.accountVerifyCode(email, code));
      } else {
        await commands.accountSendCode(email);
        setSent(true);
        toast("Código enviado. Confira o e-mail (e o spam).", "success");
      }
    });
  const ready = !!email.trim() && (mode === "password" ? !!password : !sent || code.replace(/\D/g, "").length >= 6);
  const pick = (m: "password" | "code") => {
    setMode(m);
    setSent(false);
    setCode("");
  };

  return (
    <section className="mx-auto max-w-md space-y-6 rounded-2xl border border-border bg-card p-7 shadow-soft">
      <div className="flex flex-col items-center gap-3 text-center">
        <motion.div {...breathe}>
          <Mascot look="crown" scale={5} />
        </motion.div>
        <div className="space-y-1">
          <h2 className="retro text-xs text-primary">Grifo Quest Cloud</h2>
          <p className="text-sm text-muted-foreground">Entre para usar a comunidade e o backup na nuvem. É opcional: sem conta, o app funciona igual no seu PC.</p>
        </div>
      </div>

      <div role="tablist" aria-label="Jeito de entrar" className="grid grid-cols-2 gap-1 rounded-xl bg-secondary p-1">
        {(
          [
            ["password", "E-mail e senha"],
            ["code", "Código no e-mail"],
          ] as const
        ).map(([m, label]) => (
          <button
            key={m}
            role="tab"
            aria-selected={mode === m}
            onClick={() => pick(m)}
            className={cn("rounded-lg py-1.5 text-sm transition-colors", mode === m ? "bg-card font-medium shadow-soft" : "text-muted-foreground hover:text-foreground")}
          >
            {label}
          </button>
        ))}
      </div>

      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (ready) void submit();
        }}
      >
        {mode === "code" && sent ? (
          <div className="space-y-2 text-center">
            <p className="text-sm">
              Enviamos um código para <span className="font-medium">{email}</span>.
            </p>
            <Input
              aria-label="Código"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              value={code}
              disabled={busy}
              placeholder="000000"
              onChange={(e) => setCode(e.target.value)}
              className="h-12 text-center font-mono text-2xl tracking-[0.5em]"
            />
            <button type="button" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" onClick={() => pick("code")}>
              <ArrowLeft className="size-3" /> Trocar e-mail
            </button>
          </div>
        ) : (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="account-email">E-mail</Label>
              <Input id="account-email" type="email" autoComplete="email" autoFocus value={email} disabled={busy} onChange={(e) => setEmail(e.target.value)} className="h-10" />
            </div>
            {mode === "password" && (
              <div className="space-y-1.5">
                <Label htmlFor="account-password">Senha</Label>
                <Input
                  id="account-password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  disabled={busy}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-10"
                />
              </div>
            )}
          </>
        )}
        <Button type="submit" size="lg" className="h-10 w-full" disabled={busy || !ready}>
          {mode === "password" || sent ? <LogIn /> : <Mail />}
          {busy ? "Aguarde…" : mode === "password" || sent ? "Entrar" : "Enviar código"}
        </Button>
      </form>
      <Perks />
    </section>
  );
}
