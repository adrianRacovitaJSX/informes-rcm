"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowRight, Images } from "lucide-react"
import { AppShell, type ShellUser } from "@/components/layout/app-shell"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { NativeSelect } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { StepNav, StepFooter } from "./step-nav"
import { MediaUploader } from "./media-uploader"
import { useAutosave, SaveIndicator } from "@/hooks/use-autosave"
import type { ReportDTO } from "@/lib/report-types"

const COMBUSTIBLES = ["", "Gasolina", "Diésel", "Híbrido", "Híbrido enchufable", "Eléctrico", "GLP", "GNC"]
const CAMBIOS = ["", "Manual", "Automático"]

export function VehicleForm({ initial, user }: { initial: ReportDTO; user?: ShellUser }) {
  const router = useRouter()
  const [r, setR] = useState(initial)
  const { save, flush, state } = useAutosave(initial.id)

  function set<K extends keyof ReportDTO>(key: K, value: ReportDTO[K]) {
    setR((prev) => ({ ...prev, [key]: value }))
    save({ [key]: value })
  }
  const text = (key: keyof ReportDTO) => ({
    value: (r[key] as string) ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => set(key, e.target.value as never),
  })
  const num = (key: "anio" | "km" | "precio") => ({
    value: r[key] ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(key, e.target.value === "" ? null : Number(e.target.value)),
  })

  async function next() {
    await flush()
    router.push(`/informes/${r.id}/revision`)
  }

  return (
    <AppShell back="/" title="Datos del vehículo" right={<SaveIndicator state={state} />} user={user}>
      <StepNav reportId={r.id} current="vehiculo" />
      <div className="space-y-4 pb-24">
        <Card>
          <CardHeader>
            <CardTitle>Identificación</CardTitle>
            <CardDescription>Lo básico para encabezar el informe.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            <Field label="Marca" className="col-span-1"><Input {...text("marca")} placeholder="BMW" autoCapitalize="words" /></Field>
            <Field label="Modelo"><Input {...text("modelo")} placeholder="Serie 3" autoCapitalize="words" /></Field>
            <Field label="Versión / motor" className="col-span-2"><Input {...text("version")} placeholder="320d 190cv M Sport" /></Field>
            <Field label="Matrícula"><Input {...text("matricula")} placeholder="1234 ABC" className="font-mono uppercase" autoCapitalize="characters" /></Field>
            <Field label="Bastidor (VIN)"><Input {...text("bastidor")} placeholder="WBA…" className="font-mono uppercase" autoCapitalize="characters" /></Field>
            <Field label="Año"><Input type="number" inputMode="numeric" {...num("anio")} placeholder="2019" /></Field>
            <Field label="Kilómetros"><Input type="number" inputMode="numeric" {...num("km")} placeholder="85000" /></Field>
            <Field label="Combustible">
              <NativeSelect {...text("combustible")}>{COMBUSTIBLES.map((c) => <option key={c} value={c}>{c || "—"}</option>)}</NativeSelect>
            </Field>
            <Field label="Cambio">
              <NativeSelect {...text("cambio")}>{CAMBIOS.map((c) => <option key={c} value={c}>{c || "—"}</option>)}</NativeSelect>
            </Field>
            <Field label="Color"><Input {...text("color")} placeholder="Negro" /></Field>
            <Field label="Precio (€)"><Input type="number" inputMode="numeric" {...num("precio")} placeholder="18500" /></Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Observaciones</CardTitle>
            <CardDescription>Historial, facturas, ITV, dueños anteriores…</CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea {...text("observaciones")} placeholder="Lo que convenga dejar por escrito sobre el vehículo" className="min-h-28" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Images className="size-4 text-primary" />Fotos generales</CardTitle>
            <CardDescription>Exterior por los cuatro lados, interior, cuadro con los km… Saldrán en la portada del informe.</CardDescription>
          </CardHeader>
          <CardContent>
            <MediaUploader
              reportId={r.id}
              itemId={null}
              media={r.media.filter((m) => m.itemId === null)}
              onChange={(next) => setR((prev) => ({ ...prev, media: [...prev.media.filter((m) => m.itemId !== null), ...next] }))}
            />
          </CardContent>
        </Card>
      </div>

      <StepFooter>
        <Button onClick={next} size="lg" className="w-full">
          Empezar revisión <ArrowRight />
        </Button>
      </StepFooter>
    </AppShell>
  )
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label>{label}</Label>
      {children}
    </div>
  )
}
