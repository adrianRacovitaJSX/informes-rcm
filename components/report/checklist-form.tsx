"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, ArrowRight, Camera, ChevronDown, MessageSquareText } from "lucide-react"
import { toast } from "sonner"
import { AppShell, type ShellUser } from "@/components/layout/app-shell"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { NativeSelect } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { StepNav, StepFooter } from "./step-nav"
import { MediaUploader } from "./media-uploader"
import { useAutosave, SaveIndicator } from "@/hooks/use-autosave"
import { CHECKLIST, STATUS_META, TOTAL_ITEMS, type ItemStatus } from "@/lib/checklist"
import { type ItemResult, type MediaDTO, type ReportDTO } from "@/lib/report-types"
import { cn } from "@/lib/utils"

const STATUSES: ItemStatus[] = ["ok", "atencion", "mal", "na"]
const activeCls: Record<ItemStatus, string> = {
  ok: "border-emerald-500 bg-emerald-500/20 text-emerald-300",
  atencion: "border-amber-500 bg-amber-500/20 text-amber-300",
  mal: "border-red-500 bg-red-500/20 text-red-300",
  na: "border-zinc-400 bg-zinc-500/20 text-zinc-300",
}

// Lista plana de los 51 puntos con su sección
const STEPS = CHECKLIST.flatMap((section) =>
  section.items.map((item, i) => ({ item, section, firstOfSection: i === 0 }))
)

export function ChecklistForm({ initial, user }: { initial: ReportDTO; user?: ShellUser }) {
  const router = useRouter()
  const [r, setR] = useState(initial)
  const { save, flush, state } = useAutosave(initial.id)

  // Empezar por el primer punto sin revisar
  const [idx, setIdx] = useState(() => {
    const first = STEPS.findIndex((s) => !initial.items[s.item.id]?.status)
    return first === -1 ? 0 : first
  })

  const { item, section, firstOfSection } = STEPS[idx]
  const result: ItemResult = r.items[item.id] ?? {}
  const media = r.media.filter((m) => m.itemId === item.id)
  const hasDetails = !!result.note || media.length > 0 || Object.values(result.extras ?? {}).some(Boolean)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const open = detailsOpen || hasDetails || result.status === "atencion" || result.status === "mal"

  const revisados = useMemo(() => STEPS.filter((s) => r.items[s.item.id]?.status).length, [r.items])
  const isLast = idx === STEPS.length - 1

  function updateItem(patch: Partial<ItemResult>) {
    setR((prev) => {
      const current = prev.items[item.id] ?? {}
      const next: ItemResult = { ...current, ...patch, extras: { ...(current.extras ?? {}), ...(patch.extras ?? {}) } }
      save({ items: { [item.id]: next } })
      return { ...prev, items: { ...prev.items, [item.id]: next } }
    })
  }

  function setMedia(next: MediaDTO[]) {
    setR((prev) => ({ ...prev, media: [...prev.media.filter((m) => m.itemId !== item.id), ...next] }))
  }

  function goTo(next: number) {
    setDetailsOpen(false)
    setIdx(next)
    window.scrollTo({ top: 0 })
  }

  async function next() {
    if (!result.status) {
      toast.error("Marca el estado de este punto para continuar")
      return
    }
    if (isLast) {
      const pending = STEPS.findIndex((s) => !r.items[s.item.id]?.status)
      if (pending !== -1) {
        toast.warning(`Falta por revisar: ${STEPS[pending].item.label}`)
        goTo(pending)
        return
      }
      await flush()
      router.push(`/informes/${r.id}/resumen`)
      return
    }
    goTo(idx + 1)
  }

  async function back() {
    if (idx === 0) {
      await flush()
      router.push(`/informes/${r.id}/vehiculo`)
      return
    }
    goTo(idx - 1)
  }

  return (
    <AppShell back="/" title="Revisión" right={<SaveIndicator state={state} />} user={user}>
      <StepNav reportId={r.id} current="revision" />

      {/* Progreso */}
      <div className="mb-4">
        <div className="mb-1.5 flex items-center justify-between text-xs">
          <span className="font-semibold uppercase tracking-widest text-primary">{section.title}</span>
          <span className="font-semibold text-muted-foreground">Punto {idx + 1} de {TOTAL_ITEMS} · {revisados} revisados</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${((idx + 1) / TOTAL_ITEMS) * 100}%` }} />
        </div>
      </div>

      <div className="pb-28">
        {firstOfSection && section.intro ? (
          <p className="mb-3 rounded-xl border border-primary/20 bg-primary/5 px-3.5 py-2.5 text-xs leading-relaxed text-foreground/80">{section.intro}</p>
        ) : null}

        <div className={cn("rounded-2xl border bg-card/80", result.status ? `border-${STATUS_META[result.status].color}-500/40` : "border-border")}>
          <div className="p-4 sm:p-5">
            <h2 className="text-xl font-bold leading-tight">{item.label}</h2>
            {item.hint ? <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{item.hint}</p> : null}

            <div className="mt-4 grid grid-cols-2 gap-2">
              {STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => updateItem({ status: s })}
                  className={cn(
                    "h-14 rounded-xl border text-base font-bold transition-all active:scale-[0.97]",
                    result.status === s ? activeCls[s] : "border-border bg-background/40 text-muted-foreground hover:bg-accent"
                  )}
                >
                  {STATUS_META[s].label}
                </button>
              ))}
            </div>

            {!open ? (
              <button
                type="button"
                onClick={() => setDetailsOpen(true)}
                className="mt-3 flex w-full items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground"
              >
                <MessageSquareText className="size-4" />
                <Camera className="size-4" />
                Añadir nota, foto o vídeo
                <ChevronDown className="ml-auto size-4" />
              </button>
            ) : null}
          </div>

          {open ? (
            <div className="space-y-3 border-t border-border/70 p-4 sm:p-5">
              {item.extras?.length ? (
                <div className="grid grid-cols-2 gap-2.5">
                  {item.extras.map((e) => (
                    <div key={e.key} className="space-y-1">
                      <Label className="normal-case tracking-normal">{e.label}{e.unit ? ` (${e.unit})` : ""}</Label>
                      {e.type === "select" ? (
                        <NativeSelect value={result.extras?.[e.key] ?? ""} onChange={(ev) => updateItem({ extras: { [e.key]: ev.target.value } })}>
                          <option value="">—</option>
                          {e.options!.map((o) => <option key={o} value={o}>{o}</option>)}
                        </NativeSelect>
                      ) : (
                        <Input
                          type={e.type === "number" ? "number" : "text"}
                          inputMode={e.type === "number" ? "decimal" : undefined}
                          step={e.type === "number" ? "0.1" : undefined}
                          value={result.extras?.[e.key] ?? ""}
                          onChange={(ev) => updateItem({ extras: { [e.key]: ev.target.value } })}
                        />
                      )}
                    </div>
                  ))}
                </div>
              ) : null}
              <Textarea
                value={result.note ?? ""}
                onChange={(e) => updateItem({ note: e.target.value })}
                placeholder="Observaciones del mecánico…"
                className="min-h-20"
              />
              <MediaUploader key={item.id} reportId={r.id} itemId={item.id} media={media} onChange={setMedia} />
            </div>
          ) : null}
        </div>

        {/* Navegación rápida por puntos */}
        <div className="mt-4 flex flex-wrap gap-1">
          {STEPS.map((s, i) => {
            const st = r.items[s.item.id]?.status
            return (
              <button
                key={s.item.id}
                type="button"
                onClick={() => goTo(i)}
                title={s.item.label}
                aria-label={`Punto ${i + 1}: ${s.item.label}`}
                className={cn(
                  "size-3 rounded-full border transition-all",
                  i === idx ? "scale-125 border-primary bg-primary" : st ? `border-transparent bg-${STATUS_META[st].color}-500/70` : "border-border bg-muted"
                )}
              />
            )
          })}
        </div>
      </div>

      <StepFooter>
        <Button variant="outline" size="lg" onClick={back} className="shrink-0" aria-label="Anterior"><ArrowLeft /></Button>
        <Button size="lg" onClick={next} disabled={!result.status} className="flex-1">
          {isLast ? "Terminar revisión" : "Siguiente"} <ArrowRight />
        </Button>
      </StepFooter>
    </AppShell>
  )
}
