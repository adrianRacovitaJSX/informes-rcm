"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { AlertTriangle, CheckCircle2, Loader2, Mail } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { ReportDTO } from "@/lib/report-types"
import { formatDateTime } from "@/lib/utils"

/** El mecánico escribe nombre y email del cliente; el informe sale en un email automático con el PDF adjunto. */
export function SendEmailCard({ report: r }: { report: ReportDTO }) {
  const router = useRouter()
  const [nombre, setNombre] = useState(r.clienteNombre ?? "")
  const [email, setEmail] = useState(r.clienteEmail ?? "")
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Si se regeneró el PDF después del último envío, el cliente tiene una versión antigua
  const desactualizado = !!r.emailEnviadoAt && !!r.pdfGeneradoAt && new Date(r.pdfGeneradoAt) > new Date(r.emailEnviadoAt)

  async function send(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!nombre.trim()) return setError("Escribe el nombre del cliente")
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError("El email no es válido")
    setSending(true)
    try {
      const res = await fetch(`/api/informes/${r.id}/enviar-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre, email }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "No se pudo enviar")
      toast.success(`Informe enviado a ${email.trim()}`)
      router.refresh()
    } catch (err) {
      const msg = err instanceof Error ? err.message : "No se pudo enviar"
      setError(msg)
      toast.error(msg, { duration: 8000 })
    } finally {
      setSending(false)
    }
  }

  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <form onSubmit={send} className="space-y-3" noValidate>
          <div>
            <p className="flex items-center gap-2 font-semibold"><Mail className="size-4 text-primary" /> Enviar al cliente</p>
            <p className="text-xs text-muted-foreground">Le llega un email con el PDF adjunto, el resumen y el código para verificarlo.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="cliente-nombre">Nombre del cliente</Label>
              <Input id="cliente-nombre" autoComplete="off" value={nombre} onChange={(e) => setNombre(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cliente-email">Email</Label>
              <Input
                id="cliente-email"
                type="email"
                inputMode="email"
                autoCapitalize="none"
                autoComplete="off"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>
          {error ? (
            <p role="alert" className="flex items-start gap-1.5 text-sm text-red-400"><AlertTriangle className="mt-0.5 size-4 shrink-0" /> {error}</p>
          ) : null}
          <Button type="submit" disabled={sending} className="w-full">
            {sending ? <Loader2 className="animate-spin" /> : <Mail />} {r.emailEnviadoAt ? "Volver a enviar" : "Enviar por email"}
          </Button>
          {r.emailEnviadoAt ? (
            <p className={desactualizado ? "flex items-start gap-1.5 text-xs text-amber-400" : "flex items-start gap-1.5 text-xs text-emerald-400"}>
              {desactualizado ? <AlertTriangle className="mt-px size-3.5 shrink-0" /> : <CheckCircle2 className="mt-px size-3.5 shrink-0" />}
              <span>
                Enviado a {r.clienteEmail} el {formatDateTime(r.emailEnviadoAt)}.
                {desactualizado ? " El PDF se ha regenerado después: vuelve a enviarlo para que tenga la versión buena." : ""}
              </span>
            </p>
          ) : null}
        </form>
      </CardContent>
    </Card>
  )
}
