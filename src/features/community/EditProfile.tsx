import { useState } from "react";
import { lookOf, Mascot, tierOf, UNLOCKS, type MascotLook } from "@/components/Mascot";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { emit } from "@/lib/bus";
import { cn } from "@/lib/utils";
import { HANDLE_OK, normalizeHandle, updateMyProfile, type Profile } from "./api";
import { useAction } from "./ui";

const LOOKS: { id: MascotLook; label: string }[] = [
  { id: "base", label: "Grifinho" },
  { id: "cap", label: "Formando" },
  { id: "crown", label: "Coroado" },
];
const RANK: Record<MascotLook, number> = { base: 0, cap: 1, crown: 2 };

/** O @ provisório que o servidor dá a toda conta nova. */
export const provisionalHandle = (h: string) => h.startsWith("grifo_");

/** Editar o próprio perfil. Avatares mais vistosos liberam com o nível do app (skins pagas virão depois). */
export function EditProfile({ profile, onSaved }: { profile: Profile; onSaved: () => void }) {
  const [handle, setHandle] = useState(provisionalHandle(profile.handle) ? "" : profile.handle);
  const [name, setName] = useState(profile.display_name);
  const [target, setTarget] = useState(profile.target);
  const [bio, setBio] = useState(profile.bio);
  const [avatar, setAvatar] = useState<MascotLook>(lookOf(profile.avatar));
  const [showStats, setShowStats] = useState(profile.show_stats);
  const { busy, act } = useAction();
  const unlocked = RANK[tierOf(profile.level)];
  const handleOk = HANDLE_OK.test(handle);

  return (
    <form
      className="space-y-4 rounded-2xl border border-primary/40 bg-card p-4 shadow-soft"
      onSubmit={(e) => {
        e.preventDefault();
        void act(
          () => updateMyProfile({ handle, display_name: name.trim(), target: target.trim(), bio: bio.trim(), avatar, show_stats: showStats }),
          "Perfil salvo",
        ).then((ok) => {
          if (!ok) return;
          emit("account"); // nome e avatar novos no menu
          onSaved();
        });
      }}
    >
      <h2 className="font-semibold">Seu perfil</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="p-handle">@ (3 a 20: letras, números e _)</Label>
          <Input id="p-handle" value={handle} placeholder="seu_arroba" onChange={(e) => setHandle(normalizeHandle(e.target.value))} aria-invalid={!!handle && !handleOk} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="p-name">Nome</Label>
          <Input id="p-name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="p-target">Concurso ou cargo que você quer</Label>
        <Input id="p-target" value={target} maxLength={80} placeholder="Ex.: Analista do TRT-SP" onChange={(e) => setTarget(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="p-bio">Quem sou eu</Label>
        <Textarea id="p-bio" value={bio} maxLength={300} onChange={(e) => setBio(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label>Avatar</Label>
        <div className="flex flex-wrap gap-2">
          {LOOKS.map((l) => {
            const locked = RANK[l.id] > unlocked;
            const unlock = l.id === "base" ? null : UNLOCKS[l.id];
            return (
              <button
                key={l.id}
                type="button"
                disabled={locked}
                onClick={() => setAvatar(l.id)}
                title={locked && unlock ? `Libera no nível ${unlock.level}` : l.label}
                className={cn(
                  "flex w-24 flex-col items-center gap-1 rounded-xl border-2 p-2 text-xs",
                  avatar === l.id ? "border-primary" : "border-border",
                  locked && "opacity-40",
                )}
              >
                <Mascot look={l.id} scale={3} title={l.label} />
                {locked && unlock ? `nível ${unlock.level}` : l.label}
              </button>
            );
          })}
        </div>
      </div>
      <label className="flex items-center gap-3 text-sm">
        <Switch checked={showStats} onCheckedChange={setShowStats} />
        Mostrar meu nível, XP e ofensiva no perfil
      </label>
      <div className="flex justify-end">
        <Button type="submit" disabled={busy || !handleOk || !name.trim()}>
          Salvar perfil
        </Button>
      </div>
    </form>
  );
}
