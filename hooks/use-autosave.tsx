"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import type { ReportDTO } from "@/lib/report-types"

export type SaveState = "idle" | "dirty" | "saving" | "saved" | "error"

type Patch = Record<string, unknown>

/** Guarda cambios del informe con debounce; fusiona parches consecutivos. */
export function useAutosave(reportId: string, delay = 700) {
  const [state, setState] = useState<SaveState>("idle")
  const pending = useRef<Patch>({})
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inflight = useRef<Promise<void> | null>(null)

  const flush = useCallback(async (): Promise<ReportDTO | null> => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null }
    if (inflight.current) await inflight.current
    const patch = pending.current
    if (Object.keys(patch).length === 0) return null
    pending.current = {}
    setState("saving")
    let result: ReportDTO | null = null
    inflight.current = (async () => {
      try {
        const res = await fetch(`/api/informes/${reportId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        })
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Error guardando")
        result = (await res.json()).informe
        setState("saved")
      } catch (e) {
        // Reencolar el parche para reintentar
        pending.current = { ...patch, ...pending.current, items: { ...(patch.items as object), ...(pending.current.items as object) } }
        setState("error")
        toast.error(e instanceof Error ? e.message : "No se pudo guardar")
      } finally {
        inflight.current = null
      }
    })()
    await inflight.current
    return result
  }, [reportId])

  const save = useCallback(
    (patch: Patch) => {
      const prevItems = (pending.current.items as Record<string, unknown>) ?? {}
      const nextItems = (patch.items as Record<string, unknown>) ?? {}
      pending.current = { ...pending.current, ...patch, ...(patch.items ? { items: { ...prevItems, ...nextItems } } : {}) }
      setState("dirty")
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => void flush(), delay)
    },
    [flush, delay]
  )

  // Guardar al salir de la página
  useEffect(() => {
    const onHide = () => {
      if (Object.keys(pending.current).length === 0) return
      const body = JSON.stringify(pending.current)
      pending.current = {}
      fetch(`/api/informes/${reportId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body, keepalive: true })
    }
    window.addEventListener("pagehide", onHide)
    return () => window.removeEventListener("pagehide", onHide)
  }, [reportId])

  return { save, flush, state }
}

export function SaveIndicator({ state }: { state: SaveState }) {
  const map: Record<SaveState, { text: string; cls: string }> = {
    idle: { text: "", cls: "" },
    dirty: { text: "Sin guardar", cls: "text-muted-foreground" },
    saving: { text: "Guardando…", cls: "text-muted-foreground" },
    saved: { text: "Guardado", cls: "text-primary" },
    error: { text: "Error al guardar", cls: "text-red-400" },
  }
  const { text, cls } = map[state]
  if (!text) return null
  return <span className={`text-[11px] font-medium ${cls}`}>{text}</span>
}
