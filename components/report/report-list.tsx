"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { Car, ChevronRight, FileCheck2, FileClock, Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { NewReportButton } from "./new-report-button"
import { carTitle, computeStats, type ReportDTO } from "@/lib/report-types"
import { TOTAL_ITEMS } from "@/lib/checklist"
import { formatDate, formatKm, cn } from "@/lib/utils"

export function ReportList({ informes }: { informes: ReportDTO[] }) {
  const [q, setQ] = useState("")
  const [filter, setFilter] = useState<"todos" | "BORRADOR" | "COMPLETADO">("todos")

  const list = useMemo(() => {
    const term = q.trim().toLowerCase()
    return informes.filter((r) => {
      if (filter !== "todos" && r.status !== filter) return false
      if (!term) return true
      return [r.marca, r.modelo, r.version, r.matricula, r.bastidor].join(" ").toLowerCase().includes(term)
    })
  }, [informes, q, filter])

  if (informes.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border py-14 text-center">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Car className="size-7" />
        </div>
        <div>
          <p className="font-semibold">Todavía no hay informes</p>
          <p className="text-sm text-muted-foreground">Crea el primero y empieza a revisar el coche.</p>
        </div>
        <NewReportButton />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por matrícula, marca, modelo…" className="pl-10" />
        </div>
      </div>
      <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
        {(
          [
            ["todos", "Todos"],
            ["BORRADOR", "En curso"],
            ["COMPLETADO", "Completados"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={cn(
              "shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors",
              filter === key ? "border-primary/40 bg-primary/15 text-primary" : "border-border text-muted-foreground hover:bg-accent"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <ul className="space-y-2.5">
        {list.map((r) => {
          const stats = computeStats(r.items, TOTAL_ITEMS)
          const pct = Math.round((stats.revisados / TOTAL_ITEMS) * 100)
          const done = r.status === "COMPLETADO"
          const href = done ? `/informes/${r.id}` : `/informes/${r.id}/${stats.revisados === 0 && !r.marca ? "vehiculo" : "revision"}`
          return (
            <li key={r.id}>
              <Link href={href} className="group flex items-center gap-3 rounded-2xl border border-border bg-card/80 p-3.5 transition-colors hover:border-primary/40 active:bg-accent">
                <div className={cn("flex size-11 shrink-0 items-center justify-center rounded-xl", done ? "bg-primary/15 text-primary" : "bg-amber-500/10 text-amber-400")}>
                  {done ? <FileCheck2 className="size-5" /> : <FileClock className="size-5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-semibold">{carTitle(r)}</p>
                    {r.matricula ? <span className="shrink-0 rounded border border-border px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-wider">{r.matricula.toUpperCase()}</span> : null}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {[r.anio, formatKm(r.km) !== "—" ? formatKm(r.km) : null, r.combustible].filter(Boolean).join(" · ") || "Sin datos del vehículo"}
                  </p>
                  <div className="mt-1.5 flex items-center gap-2">
                    {done ? (
                      <>
                        <Badge variant="ok">{stats.ok} OK</Badge>
                        {stats.atencion > 0 ? <Badge variant="atencion">{stats.atencion}</Badge> : null}
                        {stats.mal > 0 ? <Badge variant="mal">{stats.mal}</Badge> : null}
                      </>
                    ) : (
                      <>
                        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-[11px] text-muted-foreground">{stats.revisados}/{TOTAL_ITEMS}</span>
                      </>
                    )}
                    <span className="ml-auto text-[11px] text-muted-foreground">{formatDate(r.updatedAt)}</span>
                  </div>
                </div>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </Link>
            </li>
          )
        })}
        {list.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">Sin resultados.</p> : null}
      </ul>
    </div>
  )
}
