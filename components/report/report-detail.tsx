"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Car, ClipboardCheck, FileDown, FileText, Loader2, MessageSquareText, Pencil, RefreshCw, Share2, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { AppShell, type ShellUser } from "@/components/layout/app-shell"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { SendEmailCard } from "./send-email-card"
import { CHECKLIST, STATUS_META, TOTAL_ITEMS } from "@/lib/checklist"
import { carTitle, computeStats, type ReportDTO } from "@/lib/report-types"
import { cn, formatDateTime, formatKm } from "@/lib/utils"

export function ReportDetail({ report: r, user }: { report: ReportDTO; user?: ShellUser }) {
  const router = useRouter()
  const [busy, setBusy] = useState<"delete" | "resend" | null>(null)
  const stats = computeStats(r.items, TOTAL_ITEMS)

  async function remove() {
    if (!confirm("¿Eliminar este informe y todos sus archivos? No se puede deshacer.")) return
    setBusy("delete")
    const res = await fetch(`/api/informes/${r.id}`, { method: "DELETE" })
    if (res.ok) {
      toast.success("Informe eliminado")
      router.push("/")
    } else {
      toast.error("No se pudo eliminar")
      setBusy(null)
    }
  }

  async function resend() {
    setBusy("resend")
    try {
      const res = await fetch(`/api/informes/${r.id}/generar`, { method: "POST" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success("Informe regenerado")
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error")
    } finally {
      setBusy(null)
    }
  }

  async function share() {
    const url = r.pdfUrl?.startsWith("/") ? `${location.origin}${r.pdfUrl}` : r.pdfUrl
    if (!url) return
    if (navigator.share) {
      try { await navigator.share({ title: `Informe ${carTitle(r)}`, url }) } catch { /* cancelado */ }
    } else {
      await navigator.clipboard.writeText(url)
      toast.success("Enlace copiado")
    }
  }

  return (
    <AppShell back="/" title="Informe" user={user}>
      <div className="space-y-4">
        <Card className="overflow-hidden">
          <div className={cn("h-1.5", stats.mal > 0 ? "bg-red-500" : stats.atencion > 0 ? "bg-amber-500" : "bg-emerald-500")} />
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-xl font-bold leading-tight">{carTitle(r)}</h1>
                <p className="text-sm text-muted-foreground">{[r.matricula?.toUpperCase(), r.anio, formatKm(r.km) !== "—" ? formatKm(r.km) : null, r.combustible].filter(Boolean).join(" · ")}</p>
              </div>
              <Badge variant={r.status === "COMPLETADO" ? "ok" : "atencion"}>{r.status === "COMPLETADO" ? "Completado" : "Borrador"}</Badge>
            </div>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span><b className="text-emerald-400">{stats.ok}</b> OK</span>
              <span><b className="text-amber-400">{stats.atencion}</b> atención</span>
              <span><b className="text-red-400">{stats.mal}</b> mal</span>
              <span><b>{stats.na}</b> N/A</span>
              {r.autor ? <span className="ml-auto">Por {r.autor.name}</span> : null}
            </div>
          </CardContent>
        </Card>

        {r.pdfUrl ? <SendEmailCard report={r} /> : null}

        {r.pdfUrl ? (
          <Card>
            <CardContent className="space-y-3 p-4 sm:p-5">
              <p className="text-sm font-semibold">PDF generado {formatDateTime(r.pdfGeneradoAt)}</p>
              <div className="grid grid-cols-2 gap-2">
                <Button asChild><a href={r.pdfUrl} target="_blank" rel="noreferrer"><FileDown /> Descargar</a></Button>
                <Button variant="secondary" onClick={share}><Share2 /> Compartir</Button>
              </div>
              <div className="overflow-hidden rounded-xl border border-border bg-black">
                <iframe src={`${r.pdfUrl}#toolbar=0&view=FitH`} title="PDF" className="h-[70vh] w-full" />
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-4 text-sm text-muted-foreground">Este informe todavía no tiene PDF. Completa la revisión y genera el informe.</CardContent>
          </Card>
        )}

        {/* Resumen por secciones */}
        <div className="space-y-2">
          {CHECKLIST.map((s) => (
            <details key={s.id} className="group rounded-2xl border border-border bg-card/70">
              <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 font-semibold">
                {s.title}
                <span className="flex gap-1">
                  {(["ok", "atencion", "mal"] as const).map((st) => {
                    const n = s.items.filter((it) => r.items[it.id]?.status === st).length
                    return n ? <Badge key={st} variant={st}>{n}</Badge> : null
                  })}
                </span>
              </summary>
              <ul className="divide-y divide-border/70 border-t border-border/70">
                {s.items.map((it) => {
                  const res = r.items[it.id]
                  const media = r.media.filter((m) => m.itemId === it.id)
                  return (
                    <li key={it.id} className="flex items-start gap-3 px-4 py-2.5 text-sm">
                      <Badge variant={res?.status ?? "muted"} className="mt-0.5 w-20 justify-center shrink-0">{res?.status ? STATUS_META[res.status].short : "—"}</Badge>
                      <div className="min-w-0 flex-1">
                        <p className="leading-snug">{it.label}</p>
                        {res?.note ? <p className="text-xs text-muted-foreground">{res.note}</p> : null}
                        {media.length > 0 ? (
                          <div className="mt-1.5 flex gap-1.5 overflow-x-auto scrollbar-none">
                            {media.map((m) => (
                              <a key={m.id} href={m.url} target="_blank" rel="noreferrer" className="size-14 shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
                                {m.kind === "PHOTO" || m.thumbUrl ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={m.kind === "PHOTO" ? m.url : m.thumbUrl!} alt="" className="h-full w-full object-cover" loading="lazy" />
                                ) : <span className="flex h-full items-center justify-center text-[10px]">Vídeo</span>}
                              </a>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </li>
                  )
                })}
              </ul>
            </details>
          ))}
        </div>

        <Card>
          <CardContent className="space-y-3 p-4 sm:p-5">
            <div>
              <p className="flex items-center gap-2 font-semibold"><Pencil className="size-4 text-primary" /> Editar el informe</p>
              <p className="text-xs text-muted-foreground">
                Puedes corregir lo que haga falta. Al terminar, vuelve a generar el PDF para que los cambios queden en el documento.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button asChild variant="secondary"><Link href={`/informes/${r.id}/vehiculo`}><Car /> Datos del coche</Link></Button>
              <Button asChild variant="secondary"><Link href={`/informes/${r.id}/revision`}><ClipboardCheck /> Revisión</Link></Button>
              <Button asChild variant="secondary"><Link href={`/informes/${r.id}/conclusiones`}><MessageSquareText /> Conclusiones</Link></Button>
              <Button asChild variant="secondary"><Link href={`/informes/${r.id}/resumen`}><FileText /> Resumen</Link></Button>
            </div>
            <Button onClick={resend} disabled={busy !== null} className="w-full">
              {busy === "resend" ? <Loader2 className="animate-spin" /> : <RefreshCw />} Regenerar PDF
            </Button>
            {r.pdfUrl ? (
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Al regenerar se sustituye el PDF anterior. Si ya habías mandado una copia a alguien, esa copia deja de coincidir con la nueva y conviene reenviarla.
              </p>
            ) : null}
          </CardContent>
        </Card>

        <div className="flex gap-2 pt-1">
          <Button variant="destructive" onClick={remove} disabled={busy !== null} className="w-full">
            {busy === "delete" ? <Loader2 className="animate-spin" /> : <Trash2 />} Eliminar informe
          </Button>
        </div>
      </div>
    </AppShell>
  )
}
