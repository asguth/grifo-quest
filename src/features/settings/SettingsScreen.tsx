import { useEffect, useState } from "react";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { commands, type PomodoroConfig } from "@/lib/bindings";
import { errorMessage } from "@/lib/utils";

export default function SettingsScreen() {
  const [autostart, setAutostart] = useState<boolean | null>(null);
  const [pomodoro, setPomodoro] = useState<PomodoroConfig>({ focus_min: 25, break_min: 5 });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    isEnabled().then(setAutostart, (e) => setError(errorMessage(e)));
    commands.getPomodoroConfig().then(setPomodoro, (e) => setError(errorMessage(e)));
  }, []);

  async function toggle(on: boolean) {
    try {
      await (on ? enable() : disable());
      setAutostart(on);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function savePomodoro(e: React.FormEvent) {
    e.preventDefault();
    try {
      await commands.setPomodoroConfig(pomodoro);
      setSaved(true);
      setError("");
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  const minutes = (key: keyof PomodoroConfig) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setSaved(false);
    setPomodoro({ ...pomodoro, [key]: e.target.valueAsNumber || 0 });
  };

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="retro text-sm text-primary">Config</h1>

      <div className="flex items-center justify-between rounded-lg bg-card p-4">
        <Label htmlFor="autostart">Abrir com o Windows (minimizado na bandeja)</Label>
        <Switch id="autostart" checked={autostart ?? false} disabled={autostart === null} onCheckedChange={toggle} />
      </div>

      <form onSubmit={savePomodoro} className="flex items-end gap-4 rounded-lg bg-card p-4">
        <div className="space-y-1">
          <Label htmlFor="focus-min">Foco (min)</Label>
          <Input id="focus-min" type="number" min={1} max={180} className="w-24" value={pomodoro.focus_min} onChange={minutes("focus_min")} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="break-min">Pausa (min)</Label>
          <Input id="break-min" type="number" min={1} max={60} className="w-24" value={pomodoro.break_min} onChange={minutes("break_min")} />
        </div>
        <Button type="submit">Salvar</Button>
        {saved && <span className="text-sm text-accent">Salvo</span>}
      </form>

      <p className="text-sm text-muted-foreground">
        Atalho global: <kbd className="rounded bg-secondary px-1.5 py-0.5">Ctrl+Alt+Q</kbd> abre o lançamento rápido.
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
