import { useCallback, useEffect, useState } from "react";
import { ExternalLink, KeyRound, Loader2, Trash2 } from "lucide-react";
import { NativeSelect } from "@/components/fields";
import { toast, toastError } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { commands, type Cloud, type CloudStatus } from "@/lib/bindings";
import { cn } from "@/lib/utils";

/**
 * Gemini, GPT e Grok com a chave de API da própria pessoa. A chave vai direto para o Cofre de
 * Credenciais do Windows; o front nunca a lê de volta (só sabe se existe).
 */
export function CloudKeys({ onChange }: { onChange?: () => void }) {
  const [list, setList] = useState<CloudStatus[] | null>(null);
  const load = useCallback(() => void commands.cloudStatus().then(setList, toastError), []);
  useEffect(load, [load]);
  if (!list) return null;
  return (
    <div className="space-y-2">
      {list.map((c) => (
        <CloudRow
          key={c.id}
          c={c}
          onChange={() => {
            load();
            onChange?.();
          }}
        />
      ))}
    </div>
  );
}

function CloudRow({ c, onChange }: { c: CloudStatus; onChange: () => void }) {
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [models, setModels] = useState<string[] | null>(null);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  }

  const save = () =>
    run(async () => {
      await commands.setCloudKey(c.id, key);
      setKey("");
      onChange();
      // testa na hora: chave errada aparece já
      setModels(await commands.cloudModels(c.id));
      toast(`${c.label} conectado`, "success");
    });

  const test = () => run(async () => setModels(await commands.cloudModels(c.id)));

  const remove = () =>
    run(async () => {
      await commands.setCloudKey(c.id, "");
      setModels(null);
      onChange();
    });

  const pickModel = (model: string) =>
    run(async () => {
      const cfg = await commands.getConfig();
      await commands.setConfig({ ...cfg, cloud_models: { ...cfg.cloud_models, [c.id as Cloud]: model } });
      onChange();
    });

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-background/40 p-2.5">
      <span className="w-14 text-sm font-semibold">{c.label}</span>
      <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", c.has_key ? "bg-success/15 text-success" : "bg-secondary text-muted-foreground")}>
        {c.has_key ? "chave salva" : "sem chave"}
      </span>
      {c.has_key ? (
        <>
          {models ? (
            <NativeSelect value={c.model} onChange={(e) => void pickModel(e.target.value)} className="h-8 w-auto max-w-56 text-xs" aria-label={`Modelo do ${c.label}`}>
              {!models.includes(c.model) && <option value={c.model}>{c.model}</option>}
              {models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </NativeSelect>
          ) : (
            <span className="text-xs text-muted-foreground">modelo: {c.model}</span>
          )}
          <span className="ml-auto flex gap-1.5">
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => void test()}>
              {busy && <Loader2 className="animate-spin" />} {models ? "Testado ✓" : "Testar e ver modelos"}
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => void remove()} aria-label={`Apagar a chave do ${c.label}`}>
              <Trash2 />
            </Button>
          </span>
        </>
      ) : (
        <form
          className="ml-auto flex min-w-60 flex-1 gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (key.trim()) void save();
          }}
        >
          <Input type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder="Cole a chave de API" aria-label={`Chave do ${c.label}`} className="h-8" />
          <Button size="sm" type="submit" disabled={busy || !key.trim()}>
            {busy ? <Loader2 className="animate-spin" /> : <KeyRound />} Salvar
          </Button>
          <Button size="sm" type="button" variant="ghost" onClick={() => commands.openLink(c.key_page).catch(toastError)} title="Criar uma chave no site">
            <ExternalLink />
          </Button>
        </form>
      )}
    </div>
  );
}
