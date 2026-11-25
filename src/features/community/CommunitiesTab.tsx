import { useEffect, useState } from "react";
import { ImagePlus, Plus } from "lucide-react";
import { NativeSelect, SearchInput } from "@/components/fields";
import { Skeleton } from "@/components/motion";
import { toastError } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { plural } from "@/lib/format";
import { CATEGORIES, communitiesOf, createCommunity, deleteCommunity, listCommunities, setCommunityPhoto, type Category } from "./api";
import { Box, CommunityPhoto, useLoad, type Open } from "./ui";

/** Aba Comunidades: buscar, entrar e criar (com foto obrigatória). */
export function CommunitiesTab({ me, open }: { me: string; open: Open }) {
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setQuery(q), 300);
    return () => clearTimeout(t);
  }, [q]);
  const list = useLoad(() => listCommunities(query), [query]);
  const mine = useLoad(() => communitiesOf(me), [me]);

  return (
    <div className="space-y-5">
      {!!mine.data?.length && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Suas comunidades</h2>
          <ul className="flex gap-3 overflow-x-auto pb-1">
            {mine.data.map((c) => (
              <li key={c.id} className="shrink-0">
                <button onClick={() => open({ kind: "community", id: c.id })} className="flex w-24 flex-col items-center gap-1.5 rounded-xl p-1.5 hover:bg-secondary">
                  <CommunityPhoto c={c} size={72} className="rounded-2xl" />
                  <span className="line-clamp-2 w-full text-center text-xs">{c.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <h2 className="text-sm font-semibold">Descobrir</h2>
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput value={q} onChange={setQ} placeholder="Buscar comunidade (TRT, Direito Administrativo, FCC…)" className="min-w-60 flex-1" />
        <Button variant={creating ? "ghost" : "default"} onClick={() => setCreating(!creating)}>
          <Plus /> {creating ? "Cancelar" : "Criar comunidade"}
        </Button>
      </div>
      {creating && (
        <NewCommunity
          onCreated={(id) => {
            setCreating(false);
            open({ kind: "community", id });
          }}
        />
      )}
      {list.error && <p className="text-sm text-destructive">{list.error}</p>}
      {!list.data && !list.error && <Skeleton className="h-48 rounded-2xl" />}
      {list.data?.length === 0 && (
        <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {query ? "Nada encontrado. Que tal criar?" : "Nenhuma comunidade ainda. Crie a primeira!"}
        </p>
      )}
      <ul className="grid gap-3 sm:grid-cols-2">
        {list.data?.map((c) => (
          <li key={c.id}>
            <button
              onClick={() => open({ kind: "community", id: c.id })}
              className="flex h-full w-full gap-3 rounded-2xl border border-border bg-card p-3 text-left shadow-soft transition-colors hover:border-primary/50"
            >
              <CommunityPhoto c={c} size={64} />
              <span className="min-w-0 flex-1">
                <span className="block text-[11px] tracking-wide text-muted-foreground uppercase">{CATEGORIES[c.category]}</span>
                <span className="block truncate font-medium">{c.name}</span>
                {c.description && <span className="line-clamp-2 block text-xs text-muted-foreground">{c.description}</span>}
                <span className="mt-1 block text-xs">{plural(c.member_count, "membro", "membros")}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Criar comunidade: nome, tipo, descrição e foto (obrigatória). */
function NewCommunity({ onCreated }: { onCreated: (id: string) => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<Category>("concurso");
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!photo) return;
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  const ready = name.trim().length >= 3 && !!photo;
  const submit = async () => {
    if (!photo) return;
    setBusy(true);
    let createdId: string | null = null;
    try {
      const c = await createCommunity({ name: name.trim(), description: description.trim(), category });
      if (!c) throw new Error("A comunidade não foi criada.");
      createdId = c.id;
      await setCommunityPhoto(c.id, photo);
      onCreated(c.id);
    } catch (e) {
      // sem a foto a comunidade não fica: desfaz para a pessoa tentar de novo
      if (createdId) await deleteCommunity(createdId).catch(() => undefined);
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box title="Nova comunidade">
      <form
        className="flex flex-col gap-4 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (ready) void submit();
        }}
      >
        <label className="flex w-32 shrink-0 cursor-pointer flex-col items-center gap-2 text-center text-xs text-muted-foreground">
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) setPhoto(f);
            }}
          />
          {preview ? (
            <img src={preview} alt="" className="size-28 rounded-2xl object-cover" />
          ) : (
            <span className="grid size-28 place-items-center rounded-2xl border-2 border-dashed border-border hover:border-primary/60">
              <ImagePlus className="size-7" />
            </span>
          )}
          {preview ? "Trocar foto" : "Foto da comunidade (obrigatória)"}
        </label>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap gap-2">
            <Input className="min-w-56 flex-1" value={name} maxLength={60} placeholder="Nome (ex.: TRT-SP 2027 – Analista)" onChange={(e) => setName(e.target.value)} />
            <NativeSelect value={category} onChange={(e) => setCategory(e.target.value as Category)} aria-label="Tipo">
              {Object.entries(CATEGORIES).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </NativeSelect>
          </div>
          <Textarea value={description} maxLength={1000} placeholder="Do que se trata? Regras da comunidade…" onChange={(e) => setDescription(e.target.value)} />
          <div className="flex items-center justify-end gap-3">
            {!photo && <span className="text-xs text-muted-foreground">Escolha uma foto para criar.</span>}
            <Button type="submit" disabled={busy || !ready}>
              {busy ? "Criando…" : "Criar comunidade"}
            </Button>
          </div>
        </div>
      </form>
    </Box>
  );
}
