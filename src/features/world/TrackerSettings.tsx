import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { TagInput, splitTags } from "@/components/TagInput";
import { toastError } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { commands, type AppConfig_Serialize as AppConfig } from "@/lib/bindings";

/**
 * Área de interesse e palavras-chave do rastreador. Aparece em Configurações → Concursos e no próprio
 * Mundo → Concursos (para ajustar sem sair da tela). `onSaved`: a tela de concursos recarrega.
 */
export function TrackerSettings({ onSaved }: { onSaved?: () => void }) {
  const [cfg, setCfg] = useState<AppConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    commands.getConfig().then(setCfg, toastError);
  }, []);
  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 2200);
    return () => clearTimeout(t);
  }, [saved]);

  if (!cfg) return null;
  // sugestões a partir da própria área ("Proteção de dados / regulação" → duas fichas)
  const suggestions = splitTags(cfg.interest_area.replace(/\//g, ",")).filter((t) => t.length <= 40);

  async function save() {
    if (!cfg) return;
    setSaving(true);
    try {
      // relê antes de gravar: o resto da configuração pode ter mudado em outra tela
      const fresh = await commands.getConfig();
      await commands.setConfig({ ...fresh, interest_area: cfg.interest_area, keywords: cfg.keywords });
      setSaved(true);
      onSaved?.();
    } catch (e) {
      toastError(e);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="tracker-area">Área de interesse</Label>
        <Input
          id="tracker-area"
          value={cfg.interest_area}
          onChange={(e) => setCfg({ ...cfg, interest_area: e.target.value })}
          placeholder="Proteção de dados / regulação / TI no governo federal"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="tracker-keywords">Palavras-chave</Label>
        <p className="text-xs text-muted-foreground">Escreva e aperte Enter para adicionar. Elas filtram as notícias e viram itens do rastreador.</p>
        <TagInput
          id="tracker-keywords"
          value={cfg.keywords}
          onChange={(keywords) => setCfg({ ...cfg, keywords })}
          placeholder="Ex.: ANPD, LGPD, analista de TI"
          suggestions={suggestions}
        />
      </div>
      <div className="flex items-center gap-3">
        <Button onClick={() => void save()} disabled={saving}>
          {saving && <Loader2 className="animate-spin" />} Salvar
        </Button>
        {saved && (
          <span className="flex items-center gap-1 text-sm text-success">
            <Check className="size-4" /> Salvo
          </span>
        )}
      </div>
    </div>
  );
}
