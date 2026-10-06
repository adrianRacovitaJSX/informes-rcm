"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { AlertTriangle, ArrowLeft, CheckCircle2, Eye, FileDown, FileText, Loader2, RefreshCw } from "lucide-react"
import { toast } from "sonner"
import { AppShell, type ShellUser } from "@/components/layout/app-shell"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { StepNav, StepFooter } from "./step-nav"
import { useAutosave, SaveIndicator } from "@/hooks/use-autosave"
import { CHECKLIST, STATUS_META, TOTAL_ITEMS, findItem } from "@/lib/checklist"
import { carTitle, computeStats, type ReportDTO } from "@/lib/report-types"
import { cn, formatDateTime } from "@/lib/utils"

export function SummaryForm({ initial, user }: { initial: ReportDTO; user?: ShellUser }) {
  const router = useRouter()
  const [r, setR] = useState(initial)
  const [generating, setGenerating] = useState(false)
  const { flush, state } = useAutosave(initial.id)

  const stats = useMemo(() => computeStats(r.items, TOTAL_ITEMS), [r.items])
  const problems = useMemo(
    () =>
      Object.entries(r.items)
        .filter(([, v]) => v.status === "mal" || v.status === "atencion")
        .map(([id, v]) => ({ id, item: findItem(id), status: v.status!, note: v.note }))
        .filter((p) => p.item)
        .sort((a) => (a.status === "mal" ? -1 : 1)),
    [r.items]
  )
  const pendientes = useMemo(
    () => CHECKLIST.flatMap((s) => s.items.filter((it) => !r.items[it.id]?.status)),
    [r.items]
  )
  const complete = pendientes.length === 0

  async function generate() {
    if (!complete) {
      toast.error(`Faltan ${pendientes.length} puntos por revisar`)
      router.push(`/informes/${r.id}/revision`)
      return
    }
    setGenerating(true)
    try {
      await flush()
      const res = await fetch(`/api/informes/${r.id}/generar`, { method: "POST" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Error generando el informe")
      setR(data.informe)
      toast.success("Informe generado")
      router.push(`/informes/${r.id}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error")
    } finally {
      setGenerating(false)
    }
  }

  return (
    <AppShell back="/" title="Informe" right={<SaveIndicator state={state} />} user={user}>
      <StepNav reportId={r.id} current="resumen" />

      <div className="space-y-4 pb-28">
        <Card>
          <CardContent className="p-4 sm:p-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">Resumen de la revisión</p>
            <h2 className="mt-1 text-xl font-bold">{carTitle(r)}</h2>
            <p className="text-sm text-muted-foreground">{[r.matricula?.toUpperCase(), r.anio, r.km ? `${r.km.toLocaleString("es-ES")} km` : null].filter(Boolean).join(" · ")}</p>
            <div className="mt-4 grid grid-cols-4 gap-2">
              {(
                [
                  ["ok", stats.ok, STATUS_META.ok.short],
                  ["atencion", stats.atencion, STATUS_META.atencion.short],
                  ["mal", stats.mal, STATUS_META.mal.short],
                  ["na", stats.na, "N/A"],
                ] as const
              ).map(([k, n, label]) => (
                <div key={k} className={cn("rounded-xl border p-2.5 text-center", k === "ok" ? "border-emerald-500/30" : k === "atencion" ? "border-amber-500/30" : k === "mal" ? "border-red-500/30" : "border-border")}>
                  <p className={cn("text-2xl font-bold", k === "ok" ? "text-emerald-400" : k === "atencion" ? "text-amber-400" : k === "mal" ? "text-red-400" : "text-muted-foreground")}>{n}</p>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>
            {complete ? (
              <p className="mt-3 flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
                <CheckCircle2 className="size-4 shrink-0" /> Los {TOTAL_ITEMS} puntos están revisados.
              </p>
            ) : (
              <Link href={`/informes/${r.id}/revision`} className="mt-3 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                <AlertTriangle className="size-4 shrink-0" />
                Faltan {pendientes.length} puntos por revisar: {pendientes.slice(0, 3).map((p) => p.label).join(", ")}{pendientes.length > 3 ? "…" : ""}
              </Link>
            )}
          </CardContent>
        </Card>

        {problems.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Incidencias detectadas</CardTitle>
              <CardDescription>Se listarán destacadas en el informe.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {problems.map((p) => (
                  <li key={p.id} className="flex items-start gap-2.5 text-sm">
                    <Badge variant={p.status} className="mt-0.5 shrink-0">{STATUS_META[p.status].short}</Badge>
                    <div className="min-w-0">
                      <p className="font-medium leading-snug">{p.item!.label}</p>
                      {p.note ? <p className="text-xs text-muted-foreground">{p.note}</p> : null}
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-4 text-sm text-muted-foreground">No se han detectado incidencias.</CardContent>
          </Card>
        )}

        {r.pdfUrl ? (
          <Card>
            <CardHeader>
              <CardTitle>Informe generado</CardTitle>
              <CardDescription>Generado el {formatDateTime(r.pdfGeneradoAt)}. Si cambias algo, vuelve a generarlo.</CardDescription>
            </CardHeader>
            <CardContent className="flex gap-2">
              <Button asChild variant="secondary" className="flex-1"><a href={r.pdfUrl} target="_blank" rel="noreferrer"><FileDown /> Descargar PDF</a></Button>
              <Button asChild variant="outline" className="flex-1"><Link href={`/informes/${r.id}`}><Eye /> Ver</Link></Button>
            </CardContent>
          </Card>
        ) : null}
      </div>

      <StepFooter>
        <Button variant="outline" size="lg" onClick={() => router.push(`/informes/${r.id}/conclusiones`)} className="shrink-0" aria-label="Anterior"><ArrowLeft /></Button>
        <Button asChild variant="secondary" size="lg" className="shrink-0" title="Vista previa del PDF">
          <a href={`/api/informes/${r.id}/pdf`} target="_blank" rel="noreferrer"><Eye /></a>
        </Button>
        <Button size="lg" onClick={generate} disabled={generating} className="min-w-0 flex-1">
          {generating ? <Loader2 className="animate-spin" /> : r.pdfUrl ? <RefreshCw /> : <FileText />}
          <span className="truncate">{generating ? "Generando…" : r.pdfUrl ? "Regenerar PDF" : "Generar informe PDF"}</span>
        </Button>
      </StepFooter>
    </AppShell>
  )
}
