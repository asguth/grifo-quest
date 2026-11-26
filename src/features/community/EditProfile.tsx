import { toastError } from "@/components/toast";
import { cropImage, type CropShape } from "@/components/ImageCropper";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Camera, ImageOff, Trash2 } from "lucide-react";
import { PersonPhoto } from "@/components/PersonPhoto";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { emit } from "@/lib/bus";
import { toneOf } from "@/lib/image";
import { cn } from "@/lib/utils";
import { HANDLE_OK, normalizeHandle, updateMyProfile, uploadMyCover, uploadMyPhoto, type Profile } from "./api";
import { useAction } from "./ui";

/** O @ provisório que o servidor dá a toda conta nova. */
export const provisionalHandle = (h: string) => h.startsWith("grifo_");

/** Imagem escolhida ainda não enviada (`File`), a atual (`string`) ou nenhuma (`null`). */
type ImagePick = File | string | null;

/** Endereço para mostrar a imagem escolhida (prévia local de arquivo ainda não enviado). */
function usePreview(pick: ImagePick): string | null {
  const [url, setUrl] = useState<string | null>(typeof pick === "string" ? pick : null);
  useEffect(() => {
    if (!(pick instanceof File)) {
      setUrl(pick);
      return;
    }
    const u = URL.createObjectURL(pick);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [pick]);
  return url;
}

function FilePicker({ onPick, children, className, label, shape }: { onPick: (f: File) => void; children: ReactNode; className?: string; label: string; shape: CropShape }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) cropImage(f, shape, label).then((c) => c && onPick(c), toastError);
        }}
      />
      <button type="button" aria-label={label} title={label} onClick={() => input.current?.click()} className={className}>
        {children}
      </button>
    </>
  );
}

/**
 * Editar perfil: a capa e a foto são a própria prévia (clique na câmera para trocar), campos abaixo e
 * a privacidade no fim. Nada vai ao servidor antes de "Salvar"; "Cancelar" desfaz tudo.
 */
export function EditProfile({ profile, onSaved, onCancel }: { profile: Profile; onSaved: () => void; onCancel?: () => void }) {
  const fresh = provisionalHandle(profile.handle);
  const [handle, setHandle] = useState(fresh ? "" : profile.handle);
  const [name, setName] = useState(fresh && profile.display_name === "Concurseiro" ? "" : profile.display_name);
  const [target, setTarget] = useState(profile.target);
  const [bio, setBio] = useState(profile.bio);
  const [photo, setPhoto] = useState<ImagePick>(profile.photo_url);
  const [cover, setCover] = useState<ImagePick>(profile.cover_url);
  const [showStats, setShowStats] = useState(profile.show_stats);
  const [showFriends, setShowFriends] = useState(profile.show_friends ?? true);
  const [showCommunities, setShowCommunities] = useState(profile.show_communities ?? true);
  const [shareActivity, setShareActivity] = useState(profile.share_activity);
  const [shareExam, setShareExam] = useState(profile.share_exam);
  const { busy, act } = useAction();
  const photoUrl = usePreview(photo);
  const coverUrl = usePreview(cover);
  const handleOk = HANDLE_OK.test(handle);
  const hue = toneOf(profile.id);

  const save = () =>
    act(async () => {
      const photo_url = photo instanceof File ? await uploadMyPhoto(photo) : photo;
      const cover_url = cover instanceof File ? await uploadMyCover(cover) : cover;
      await updateMyProfile({
        handle,
        display_name: name.trim(),
        target: target.trim(),
        bio: bio.trim(),
        photo_url,
        cover_url,
        show_stats: showStats,
        show_friends: showFriends,
        show_communities: showCommunities,
        share_activity: shareActivity,
        share_exam: shareExam,
        ...(shareExam ? {} : { exam_name: null, exam_date: null }),
      });
    }, "Perfil salvo").then((ok) => {
      if (!ok) return;
      emit("account"); // nome e foto novos no menu
      onSaved();
    });

  return (
    <form
      className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft"
      onSubmit={(e) => {
        e.preventDefault();
        if (handleOk && name.trim()) void save();
      }}
    >
      {/* capa + foto = prévia do topo do perfil */}
      <div className="group relative h-40 bg-cover bg-center sm:h-48" style={coverUrl ? { backgroundImage: `url("${coverUrl}")` } : { background: `linear-gradient(120deg, oklch(0.72 0.1 ${hue}), oklch(0.6 0.12 ${(hue + 60) % 360}))` }}>
        <div className="absolute top-3 right-3 flex gap-2">
          <FilePicker onPick={setCover} shape="cover" label="Trocar a capa" className="flex items-center gap-1.5 rounded-lg bg-black/55 px-3 py-1.5 text-xs font-medium text-white backdrop-blur hover:bg-black/70">
            <Camera className="size-4" /> {coverUrl ? "Trocar capa" : "Pôr capa"}
          </FilePicker>
          {coverUrl && (
            <button type="button" onClick={() => setCover(null)} title="Tirar a capa" aria-label="Tirar a capa" className="rounded-lg bg-black/55 p-1.5 text-white backdrop-blur hover:bg-black/70">
              <ImageOff className="size-4" />
            </button>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-4 px-6">
        <div className="relative -mt-14">
          <PersonPhoto p={{ id: profile.id, display_name: name || profile.display_name, photo_url: photoUrl }} size={112} className="ring-4 ring-card" />
          <FilePicker
            onPick={setPhoto}
            shape="round"
            label="Trocar a foto"
            className="absolute right-0 bottom-0 grid size-9 place-items-center rounded-full bg-primary text-primary-foreground shadow-lift ring-4 ring-card hover:brightness-110"
          >
            <Camera className="size-4" />
          </FilePicker>
        </div>
        <div className="pb-2 text-xs text-muted-foreground">
          {photoUrl ? (
            <button type="button" className="inline-flex items-center gap-1 hover:text-destructive" onClick={() => setPhoto(null)}>
              <Trash2 className="size-3.5" /> Tirar a foto (ficam as iniciais)
            </button>
          ) : (
            "Sem foto, aparecem as iniciais do seu nome."
          )}
        </div>
      </div>

      <div className="space-y-5 p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome" htmlFor="p-name">
            <Input id="p-name" value={name} maxLength={40} placeholder="Como você quer ser chamado" onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="@ (3 a 20: letras, números e _)" htmlFor="p-handle" error={!!handle && !handleOk ? "Use de 3 a 20 letras, números ou _" : undefined}>
            <div className="relative">
              <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm text-muted-foreground">@</span>
              <Input id="p-handle" className="pl-6" value={handle} placeholder="seu_arroba" onChange={(e) => setHandle(normalizeHandle(e.target.value))} aria-invalid={!!handle && !handleOk} />
            </div>
          </Field>
        </div>
        <Field label="Concurso ou cargo que você quer" htmlFor="p-target">
          <Input id="p-target" value={target} maxLength={80} placeholder="Analista do TRT-SP" onChange={(e) => setTarget(e.target.value)} />
        </Field>
        <Field label="Sobre você" htmlFor="p-bio" hint={`${bio.length}/300`}>
          <Textarea id="p-bio" value={bio} maxLength={300} placeholder="Rotina de estudos, matérias favoritas, o que te motiva…" onChange={(e) => setBio(e.target.value)} className="min-h-24" />
        </Field>

        <section className="space-y-3 rounded-xl border border-border p-4">
          <p className="text-sm font-semibold">Privacidade</p>
          <Toggle checked={showStats} onChange={setShowStats} title="Mostrar nível, XP e dias seguidos" />
          <Toggle checked={showFriends} onChange={setShowFriends} title="Mostrar meus amigos" text="Desligado, ninguém vê sua lista de amigos (a liga e o mural com os amigos continuam)." />
          <Toggle
            checked={showCommunities}
            onChange={setShowCommunities}
            title="Mostrar minhas comunidades"
            text="Desligado, só quem está na mesma comunidade vê que você participa."
          />
          <Toggle
            checked={shareActivity}
            onChange={setShareActivity}
            title="Compartilhar meus estudos"
            text="Cada sessão de questões vira uma publicação para os amigos, e você entra na liga da semana."
          />
          <Toggle checked={shareExam} onChange={setShareExam} title="Mostrar minha próxima prova" text="Usa a prova mais próxima de Mundo → Minhas provas." />
        </section>
      </div>

      <footer className="flex items-center justify-end gap-2 border-t border-border bg-secondary/30 px-6 py-3">
        {onCancel && (
          <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>
            Cancelar
          </Button>
        )}
        <Button type="submit" disabled={busy || !handleOk || !name.trim()}>
          {busy ? "Salvando…" : "Salvar perfil"}
        </Button>
      </footer>
    </form>
  );
}

function Field({ label, htmlFor, hint, error, children }: { label: string; htmlFor: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label htmlFor={htmlFor}>{label}</Label>
        {hint && <span className="tabular text-xs text-muted-foreground">{hint}</span>}
      </div>
      {children}
      {error && <p className={cn("text-xs text-destructive")}>{error}</p>}
    </div>
  );
}

function Toggle({ checked, onChange, title, text }: { checked: boolean; onChange: (v: boolean) => void; title: string; text?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 text-sm">
      <Switch checked={checked} onCheckedChange={onChange} className="mt-0.5" />
      <span>
        <span className="block">{title}</span>
        {text && <span className="block text-xs text-muted-foreground">{text}</span>}
      </span>
    </label>
  );
}
