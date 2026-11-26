import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Crosshair, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { spring } from "@/lib/motion";
import { cn } from "@/lib/utils";

/** `square`: foto (círculo/quadrado); `cover`: capa 3:1. */
export type CropShape = "square" | "round" | "cover";

type Request = { file: File; shape: CropShape; title: string; resolve: (f: File | null) => void };

let request: ((r: Request) => void) | null = null;

/**
 * Abre o editor e devolve a imagem já recortada (WebP, no formato pedido), ou `null` se a pessoa
 * cancelar. Precisa do `<CropHost />` montado (fica no App).
 */
export function cropImage(file: File, shape: CropShape, title = "Ajustar a imagem"): Promise<File | null> {
  if (!file.type.startsWith("image/")) return Promise.reject(new Error("Escolha uma imagem (JPG, PNG, WebP ou GIF)."));
  if (file.size > 15 * 1024 * 1024) return Promise.reject(new Error("Imagem grande demais (máximo 15 MB)."));
  const open = request;
  if (!open) return Promise.resolve(file);
  return new Promise((resolve) => open({ file, shape, title, resolve }));
}

const RATIO: Record<CropShape, number> = { square: 1, round: 1, cover: 3 };
const MAX_ZOOM = 4;
/** Lado maior da imagem recortada (depois cada uso reduz ao tamanho final). */
const OUT_MAX = 1600;

export function CropHost() {
  const [req, setReq] = useState<Request | null>(null);
  useEffect(() => {
    request = setReq;
    return () => {
      request = null;
    };
  }, []);
  const done = (f: File | null) => {
    req?.resolve(f);
    setReq(null);
  };
  return (
    <AnimatePresence>
      {req && (
        <motion.div
          className="fixed inset-0 z-[95] grid place-items-center bg-black/70 p-6 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => done(null)}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={req.title}
            initial={{ y: 20, scale: 0.96 }}
            animate={{ y: 0, scale: 1 }}
            exit={{ y: 10, opacity: 0 }}
            transition={spring.soft}
            onClick={(e) => e.stopPropagation()}
            className={cn("w-full space-y-4 rounded-3xl border border-border bg-card p-6 shadow-lift", req.shape === "cover" ? "max-w-3xl" : "max-w-md")}
          >
            <Editor key={req.file.name + req.file.size} req={req} onDone={done} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Editor({ req, onDone }: { req: Request; onDone: (f: File | null) => void }) {
  const [src, setSrc] = useState("");
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
  const [box, setBox] = useState(0); // largura do quadro na tela
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [saving, setSaving] = useState(false);
  const frame = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const img = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const url = URL.createObjectURL(req.file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [req.file]);
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBox(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const ratio = RATIO[req.shape];
  const cw = box;
  const ch = box / ratio;
  const base = nat && cw ? Math.max(cw / nat.w, ch / nat.h) : 1;
  const s = base * zoom;

  /** Mantém a imagem cobrindo o quadro inteiro (sem faixa vazia). */
  const clamp = (p: { x: number; y: number }, scale = s) => {
    if (!nat) return p;
    const mx = Math.max(0, (nat.w * scale - cw) / 2);
    const my = Math.max(0, (nat.h * scale - ch) / 2);
    return { x: Math.min(mx, Math.max(-mx, p.x)), y: Math.min(my, Math.max(-my, p.y)) };
  };
  const setZoomClamped = (z: number) => {
    const next = Math.min(MAX_ZOOM, Math.max(1, z));
    setZoom(next);
    setPos((p) => clamp(p, base * next));
  };

  const down = (e: ReactPointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y };
  };
  const move = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (d) setPos(clamp({ x: d.px + e.clientX - d.x, y: d.py + e.clientY - d.y }));
  };

  async function confirm() {
    const el = img.current;
    if (!el || !nat || !cw) return;
    setSaving(true);
    try {
      const sx = (nat.w * s) / 2 - cw / 2 - pos.x;
      const sy = (nat.h * s) / 2 - ch / 2 - pos.y;
      const sw = cw / s;
      const sh = ch / s;
      const out = Math.min(1, OUT_MAX / Math.max(sw, sh));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(sw * out);
      canvas.height = Math.round(sh * out);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Não deu para processar a imagem.");
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(el, sx / s, sy / s, sw, sh, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/webp", 0.92));
      onDone(blob ? new File([blob], "recorte.webp", { type: "image/webp" }) : null);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div>
        <h2 className="font-semibold">{req.title}</h2>
        <p className="text-sm text-muted-foreground">Arraste para posicionar e use o zoom para enquadrar.</p>
      </div>
      <div
        ref={frame}
        className="relative w-full cursor-grab touch-none overflow-hidden rounded-2xl bg-secondary select-none active:cursor-grabbing"
        style={{ aspectRatio: String(ratio) }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        onWheel={(e) => setZoomClamped(zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08))}
      >
        {src && (
          <img
            ref={img}
            src={src}
            alt=""
            draggable={false}
            onLoad={(e) => setNat({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
            className="pointer-events-none absolute top-1/2 left-1/2 max-w-none origin-center"
            style={nat ? { width: nat.w, height: nat.h, transform: `translate(-50%, -50%) translate(${pos.x}px, ${pos.y}px) scale(${s})` } : { opacity: 0 }}
          />
        )}
        {/* máscara do círculo: a foto de perfil aparece redonda */}
        {req.shape === "round" && <div className="pointer-events-none absolute inset-0 rounded-full shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]" />}
        {/* regra dos terços */}
        <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3 opacity-30">
          {Array.from({ length: 9 }, (_, i) => (
            <span key={i} className="border border-white/40" />
          ))}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button type="button" aria-label="Diminuir zoom" className="text-muted-foreground hover:text-foreground" onClick={() => setZoomClamped(zoom - 0.25)}>
          <ZoomOut className="size-4" />
        </button>
        <input
          type="range"
          min={1}
          max={MAX_ZOOM}
          step={0.01}
          value={zoom}
          onChange={(e) => setZoomClamped(Number(e.target.value))}
          className="w-full accent-[var(--primary)]"
          aria-label="Zoom"
        />
        <button type="button" aria-label="Aumentar zoom" className="text-muted-foreground hover:text-foreground" onClick={() => setZoomClamped(zoom + 0.25)}>
          <ZoomIn className="size-4" />
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => setPos({ x: 0, y: 0 })}>
          <Crosshair /> Centralizar
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setZoom(1);
            setPos({ x: 0, y: 0 });
          }}
        >
          <RotateCcw /> Recomeçar
        </Button>
        <span className="flex-1" />
        <Button type="button" variant="ghost" onClick={() => onDone(null)}>
          Cancelar
        </Button>
        <Button type="button" disabled={!nat || saving} onClick={() => void confirm()}>
          Usar esta
        </Button>
      </div>
    </>
  );
}
