import { useCallback, useEffect, useState } from "react";
import { ExternalLink, KeyRound, Loader2, Trash2 } from "lucide-react";
import { toast, toastError } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { commands, type CloudStatus } from "@/lib/bindings";
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

  /** Grava um campo de `cloud_models` (modelo desta IA ou o endereço da "Outra IA"). */
  const saveField = (field: string, value: string) =>
    run(async () => {
      const cfg = await commands.getConfig();
      await commands.setConfig({ ...cfg, cloud_models: { ...cfg.cloud_models, [field]: value.trim() } });
      onChange();
    });

  const custom = c.id === "custom";
  const listId = `models-${c.id}`;

  return (
    <div className="space-y-2 rounded-lg border border-border bg-background/40 p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-24 text-sm font-semibold">{c.label}</span>
        <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", c.has_key ? "bg-success/15 text-success" : "bg-secondary text-muted-foreground")}>
          {c.has_key ? "chave salva" : "sem chave"}
        </span>
        {c.has_key ? (
          <>
            {/* modelo digitável: nem toda API lista os modelos; a lista (quando vem) só sugere */}
            <Input
              list={listId}
              defaultValue={c.model}
              key={c.model}
              onBlur={(e) => e.target.value.trim() !== c.model && void saveField(c.id, e.target.value)}
              placeholder="modelo (ex.: deepseek-chat)"
              aria-label={`Modelo do ${c.label}`}
              className="h-8 w-56 text-xs"
            />
            {models && (
              <datalist id={listId}>
                {models.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            )}
            <span className="ml-auto flex gap-1.5">
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => void test()}>
                {busy && <Loader2 className="animate-spin" />} {models ? `${models.length} modelos ✓` : "Testar e ver modelos"}
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
      {custom && (
        <div className="flex flex-wrap items-center gap-2 pl-1 text-xs text-muted-foreground">
          <span>Endereço da API (formato OpenAI):</span>
          <Input
            defaultValue={c.base_url}
            key={c.base_url}
            onBlur={(e) => e.target.value.trim() !== c.base_url && void saveField("custom_url", e.target.value)}
            placeholder="https://openrouter.ai/api/v1"
            aria-label="Endereço da API da outra IA"
            className="h-8 min-w-64 flex-1 text-xs"
          />
          <span className="w-full">OpenRouter (centenas de modelos), Groq, Mistral, LM Studio no seu PC… qualquer serviço com API no formato da OpenAI.</span>
        </div>
      )}
    </div>
  );
}
