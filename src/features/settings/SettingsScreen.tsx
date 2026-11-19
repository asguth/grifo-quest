import { useEffect, useState } from "react";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { errorMessage } from "@/lib/utils";

export default function SettingsScreen() {
  const [autostart, setAutostart] = useState<boolean | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    isEnabled().then(setAutostart, (e) => setError(errorMessage(e)));
  }, []);

  async function toggle(on: boolean) {
    try {
      await (on ? enable() : disable());
      setAutostart(on);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="retro text-sm text-primary">Config</h1>
      <div className="flex items-center justify-between rounded-lg bg-card p-4">
        <Label htmlFor="autostart">Abrir com o Windows (minimizado na bandeja)</Label>
        <Switch id="autostart" checked={autostart ?? false} disabled={autostart === null} onCheckedChange={toggle} />
      </div>
      <p className="text-sm text-muted-foreground">
        Atalho global: <kbd className="rounded bg-secondary px-1.5 py-0.5">Ctrl+Alt+Q</kbd> abre o lançamento rápido.
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
