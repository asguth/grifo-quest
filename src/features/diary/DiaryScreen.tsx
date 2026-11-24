import { Suspense, useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, rectSortingStrategy, SortableContext, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AnimatePresence, motion, useAnimationControls, useReducedMotionConfig } from "motion/react";
import { Check, EyeOff, GripVertical, LayoutGrid, Play, Plus, RotateCcw, Scaling } from "lucide-react";
import type { Navigate } from "@/app/nav";
import { celebrateLevel } from "@/components/LevelUp";
import { Mascot, tierOf } from "@/components/Mascot";
import { PixelFlame, PixelShield } from "@/components/PixelIcons";
import { Skeleton } from "@/components/motion";
import { ProgressBar } from "@/components/Progress";
import { StatTile } from "@/components/StatTile";
import { toastError } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { ImportEditalButton } from "@/features/onboarding/ImportEdital";
import { commands, type Dashboard_Serialize as Dashboard } from "@/lib/bindings";
import { greeting } from "@/lib/dates";
import { plural } from "@/lib/format";
import { itemIn, listIn, spring } from "@/lib/motion";
import { sfx } from "@/lib/sound";
import { cn, errorMessage, warn } from "@/lib/utils";
import { DEFAULT_LAYOUT, isFull, loadLayout, NEXT_SIZE, saveLayout, SIZE_LABEL, SPAN, WIDGETS, type WidgetId, type WidgetSlot } from "./layout";

function Hero({ d, name, go }: { d: Dashboard; name: string; go: Navigate }) {
  const reduce = useReducedMotionConfig();
  const jump = useAnimationControls();
  const done = d.missions.filter((m) => m.done).length;
  const missionsLeft = d.missions.length - done;

  // Clique no mascote: agacha (squash), pula (stretch) e assenta.
  function poke() {
    sfx("coin");
    void jump.start({
      y: [0, 4, -26, 0],
      scaleY: [1, 0.8, 1.12, 1],
      scaleX: [1, 1.15, 0.92, 1],
      transition: { duration: 0.55, times: [0, 0.2, 0.55, 1], ease: "easeOut" },
    });
  }

  return (
    <section className="relative flex flex-wrap items-center gap-6 overflow-hidden rounded-3xl border border-border/60 bg-glass p-6 shadow-lift backdrop-blur-md">
      <motion.button
        onClick={poke}
        aria-label="Cutucar o Grifinho"
        className="relative"
        animate={reduce ? undefined : { y: [0, -4, 0] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
      >
        <motion.div animate={jump} style={{ originY: 1 }}>
          <Mascot look={tierOf(d.level.level)} scale={6} title={`Grifinho, nível ${d.level.level}`} />
        </motion.div>
      </motion.button>

      <div className="relative min-w-60 flex-1 space-y-3">
        <p className="text-muted-foreground">
          {greeting(new Date().getHours())}
          {name ? `, ${name}` : ""}! {d.missions.length === 0 ? "" : missionsLeft > 0 ? `${missionsLeft === 1 ? "Falta" : "Faltam"} ${plural(missionsLeft, "missão", "missões")} hoje.` : "Missões do dia concluídas. 🏆"}
        </p>
        <div className="flex items-baseline gap-3">
          <span className="retro text-lg text-primary">Nível {d.level.level}</span>
          <span className="retro tabular text-[10px] text-muted-foreground">
            {d.level.current}/{d.level.needed} XP
          </span>
        </div>
        <ProgressBar value={d.level.needed > 0 ? d.level.current / d.level.needed : 0} className="h-3 w-full max-w-md" transition={spring.slow} label="Progresso de XP" />
      </div>

      <div className="relative flex items-center gap-6">
        <StatTile className={HERO_STAT} tone="text-foreground" label="dias seguidos" value={d.streak.days} icon={<PixelFlame off={d.streak.days === 0} />} />
        <StatTile className={HERO_STAT} tone="text-foreground" label={d.streak.shield_available ? "escudo pronto" : "escudo usado"} value={d.streak.shield_available ? 1 : 0} icon={<PixelShield off={!d.streak.shield_available} />} />
        <Button size="lg" className="h-11 shadow-soft" onClick={() => go("foco")}>
          <Play /> Estudar agora
        </Button>
      </div>
    </section>
  );
}

const HERO_STAT = "border-0 bg-transparent p-0";

/** Um widget na grade. Em modo edição: arrasta, troca tamanho, esconde. */
function Tile({ slot, editing, onResize, onHide, children }: { slot: WidgetSlot; editing: boolean; onResize: () => void; onHide: () => void; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: slot.id, disabled: !editing });
  const style: CSSProperties = { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 20 : undefined };
  return (
    // Div de fora: arrasto (transform do dnd-kit). Div de dentro: entrada animada (transform do Motion).
    <div
      ref={setNodeRef}
      style={style}
      className={cn("relative min-h-[190px]", isFull(slot.id) ? "col-span-full" : SPAN[slot.size], editing && !isDragging && "wiggle", isDragging && "opacity-80")}
      {...(editing ? { ...attributes, ...listeners } : {})}
    >
      <motion.div variants={itemIn} className={cn("h-full", editing && "pointer-events-none select-none")}>
        {children}
      </motion.div>
      {editing && (
        <div className="absolute inset-0 cursor-grab rounded-2xl ring-2 ring-primary/50 ring-dashed active:cursor-grabbing">
          <div className="absolute top-2 right-2 flex gap-1" onPointerDown={(e) => e.stopPropagation()}>
            <span className="grid size-7 place-items-center rounded-md bg-card/90 text-muted-foreground" aria-hidden>
              <GripVertical className="size-4" />
            </span>
            {!isFull(slot.id) && (
              <button onClick={onResize} className="flex h-7 items-center gap-1 rounded-md bg-card/90 px-2 text-xs font-medium hover:text-primary" aria-label={`Tamanho: ${SIZE_LABEL[slot.size]}. Trocar`}>
                <Scaling className="size-3.5" /> {SIZE_LABEL[slot.size]}
              </button>
            )}
            <button onClick={onHide} className="grid size-7 place-items-center rounded-md bg-card/90 hover:text-destructive" aria-label={`Esconder ${WIDGETS[slot.id].label}`}>
              <EyeOff className="size-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DiaryScreen({ go }: { go: Navigate }) {
  const [d, setD] = useState<Dashboard | null>(null);
  const [layout, setLayout] = useState<WidgetSlot[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [noSubjects, setNoSubjects] = useState(false);
  const doneBefore = useRef<number | null>(null);
  const levelBefore = useRef<number | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  useEffect(() => void commands.getProfile().then((p) => setName(p.name.trim()), (e) => warn("ler o perfil", e)), []);

  const load = useCallback(async () => {
    try {
      const next = await commands.getDashboard();
      const done = next.missions.filter((m) => m.done).length;
      if (doneBefore.current !== null && done > doneBefore.current) sfx("chime");
      if (levelBefore.current !== null && next.level.level > levelBefore.current) celebrateLevel(next.level.level);
      doneBefore.current = done;
      levelBefore.current = next.level.level;
      setD(next);
      setError("");
      setNoSubjects((await commands.listSubjects()).length === 0);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    void load();
    void loadLayout().then(setLayout);
    const id = setInterval(load, 60_000);
    window.addEventListener("focus", load);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", load);
    };
  }, [load]);

  function change(next: WidgetSlot[]) {
    setLayout(next);
    saveLayout(next).catch(toastError);
  }

  function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const from = layout.findIndex((w) => w.id === e.active.id);
    const to = layout.findIndex((w) => w.id === e.over?.id);
    sfx("nav");
    change(arrayMove(layout, from, to));
  }

  const patch = (id: WidgetId, p: Partial<WidgetSlot>) => change(layout.map((w) => (w.id === id ? { ...w, ...p } : w)));

  if (error) return <p className="text-destructive">{error}</p>;
  if (!d) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-36 rounded-3xl" />
        <div className="grid gap-4 @xl:grid-cols-2 @4xl:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-48 rounded-2xl" />)}</div>
      </div>
    );
  }

  const visible = layout.filter((w) => w.enabled);
  const hidden = layout.filter((w) => !w.enabled);

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <Hero d={d} name={name} go={go} />

      {noSubjects && (
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-wrap items-center gap-4 rounded-2xl border border-primary/40 bg-primary/10 p-5"
        >
          <div className="min-w-60 flex-1 space-y-1">
            <p className="font-semibold">Falta só o seu edital</p>
            <p className="text-sm text-muted-foreground">
              Sem matérias o Grifo não monta questões, ciclo nem revisões. Arraste o PDF do edital (ou diga o cargo) e eu separo matérias e tópicos para você revisar.
            </p>
          </div>
          <Button variant="ghost" onClick={() => go("materias")}>
            Cadastrar à mão
          </Button>
          <ImportEditalButton size="lg" onApplied={() => void load()} />
        </motion.section>
      )}

      <div className="flex items-center justify-end gap-2">
        <AnimatePresence initial={false}>
          {editing && (
            <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="mr-auto flex items-center gap-2 text-sm text-muted-foreground">
              Arraste para reordenar · <Scaling className="size-3.5" /> muda o tamanho · <EyeOff className="size-3.5" /> esconde
            </motion.div>
          )}
        </AnimatePresence>
        {editing ? (
          <>
            <Button size="sm" variant="ghost" onClick={() => change(DEFAULT_LAYOUT)}>
              <RotateCcw /> Padrão
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setDrawer(true)}>
              <Plus /> Adicionar widget {hidden.length > 0 && <span className="text-muted-foreground">({hidden.length})</span>}
            </Button>
            <Button size="sm" onClick={() => (setEditing(false), sfx("success"))}>
              <Check /> Pronto
            </Button>
          </>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            <LayoutGrid /> Editar início
          </Button>
        )}
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={visible.map((w) => w.id)} strategy={rectSortingStrategy}>
          <motion.div variants={listIn} initial="hidden" animate="show" className="grid grid-flow-dense auto-rows-[minmax(190px,auto)] gap-4 @xl:grid-cols-2 @4xl:grid-cols-3">
            {visible.map((w) => {
              const View = WIDGETS[w.id].view;
              return (
              <Tile key={w.id} slot={w} editing={editing} onResize={() => patch(w.id, { size: NEXT_SIZE[w.size] })} onHide={() => patch(w.id, { enabled: false })}>
                <Suspense fallback={<Skeleton className="h-full min-h-40 rounded-2xl" />}>
                  <View d={d} go={go} />
                </Suspense>
              </Tile>
              );
            })}
          </motion.div>
        </SortableContext>
      </DndContext>

      <Sheet open={drawer} onOpenChange={setDrawer} title="Adicionar widget" description="Os escondidos ficam aqui. Clique para pôr de volta no fim da grade.">
        <div className="space-y-2 p-6">
          {hidden.length === 0 && <p className="text-sm text-muted-foreground">Todos os widgets já estão no Início.</p>}
          {hidden.map((w) => (
            <button
              key={w.id}
              onClick={() => {
                change([...layout.filter((x) => x.id !== w.id), { ...w, enabled: true }]);
                sfx("coin");
              }}
              className="flex w-full items-center gap-3 rounded-xl border border-border bg-card p-3 text-left hover:border-primary/60"
            >
              <Plus className="size-4 text-primary" />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{WIDGETS[w.id].label}</span>
                <span className="block text-xs text-muted-foreground">{WIDGETS[w.id].hint}</span>
              </span>
              <span className="text-xs text-muted-foreground">{isFull(w.id) ? "largura toda" : SIZE_LABEL[w.size]}</span>
            </button>
          ))}
        </div>
      </Sheet>
    </div>
  );
}
