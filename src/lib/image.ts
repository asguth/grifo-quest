/** Foto escolhida pela pessoa → quadrado WebP pequeno (corta o centro), pronto para enviar. */
export async function squareWebp(file: File, size: number): Promise<Blob> {
  if (!file.type.startsWith("image/")) throw new Error("Escolha uma imagem (JPG, PNG, WebP ou GIF).");
  if (file.size > 15 * 1024 * 1024) throw new Error("Imagem grande demais (máximo 15 MB).");
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Não deu para processar a imagem.");
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
  bitmap.close();
  const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/webp", 0.85));
  if (!blob) throw new Error("Não deu para converter a imagem.");
  return blob;
}

/** Capa 3:1 em WebP (corta o centro), 1200×400. */
export async function coverWebp(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/")) throw new Error("Escolha uma imagem (JPG, PNG, WebP ou GIF).");
  if (file.size > 15 * 1024 * 1024) throw new Error("Imagem grande demais (máximo 15 MB).");
  const bitmap = await createImageBitmap(file);
  const [w, h] = [1200, 400];
  const scale = Math.max(w / bitmap.width, h / bitmap.height);
  const sw = w / scale;
  const sh = h / scale;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Não deu para processar a imagem.");
  ctx.drawImage(bitmap, (bitmap.width - sw) / 2, (bitmap.height - sh) / 2, sw, sh, 0, 0, w, h);
  bitmap.close();
  const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/webp", 0.82));
  if (!blob) throw new Error("Não deu para converter a imagem.");
  return blob;
}

/** Nome de arquivo novo a cada troca (o endereço muda e nenhum cache mostra a foto antiga). */
export function photoName(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.webp`;
}

/** "Ana Paula Souza" → "AS"; "ana" → "AN". */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = words[0] ?? "";
  const last = words.length > 1 ? (words[words.length - 1] ?? "") : "";
  return (last ? `${first[0] ?? ""}${last[0] ?? ""}` : first.slice(0, 2)).toUpperCase();
}

/** Cor estável por pessoa (mesmo id, mesma cor), entre tons que funcionam no claro e no escuro. */
export function toneOf(id: string): number {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % 360;
}
