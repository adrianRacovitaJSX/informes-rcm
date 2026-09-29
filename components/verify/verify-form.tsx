"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { AlertTriangle, CheckCircle2, FileCheck2, FileWarning, Loader2, Search, ShieldCheck, Upload, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { VerificationResult } from "@/lib/verification"

type Lookup =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "found"; informe: VerificationResult }
  | { state: "notfound"; codigo: string }
  | { state: "error"; message: string }

type FileCheck = { state: "idle" } | { state: "hashing"; name: string } | { state: "match"; name: string } | { state: "mismatch"; name: string }

async function sha256(file: File) {
  const buf = await crypto.subtle.digest("SHA-256", await file.arrayBuffer())
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("")
}

export function VerifyForm({ initialCode }: { initialCode: string }) {
  const [codigo, setCodigo] = useState(initialCode)
  const [lookup, setLookup] = useState<Lookup>({ state: "idle" })
  const [file, setFile] = useState<FileCheck>({ state: "idle" })
  const [dragging, setDragging] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const verify = useCallback(async (value: string) => {
    const code = value.trim()
    if (!code) return
    setLookup({ state: "loading" })
    setFile({ state: "idle" })
    try {
      const res = await fetch(`/api/verificar?codigo=${encodeURIComponent(code)}`, { cache: "no-store" })
      const data = await res.json()
      if (res.status === 404) return setLookup({ state: "notfound", codigo: code.toUpperCase() })
      if (!res.ok) throw new Error(data.error ?? "No se pudo comprobar")
      setLookup({ state: "found", informe: data.informe })
      setCodigo(data.informe.codigo)
    } catch (e) {
      setLookup({ state: "error", message: e instanceof Error ? e.message : "No se pudo comprobar" })
    }
  }, [])

  // Si llega el código en el enlace (email del cliente), se comprueba al abrir
  useEffect(() => {
    if (!initialCode) return
    const t = setTimeout(() => verify(initialCode), 0)
    return () => clearTimeout(t)
  }, [initialCode, verify])

  async function checkFile(f: File | undefined) {
    if (!f || lookup.state !== "found") return
    setFile({ state: "hashing", name: f.name })
    // La huella se calcula en el navegador: el PDF no sale del dispositivo
    const hash = await sha256(f)
    setFile({ state: hash === lookup.informe.pdfHash ? "match" : "mismatch", name: f.name })
  }

  return (
    <div className="mt-8 space-y-5">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          verify(codigo)
        }}
        className="space-y-2"
      >
        <Label htmlFor="codigo">Código del informe</Label>
        <div className="flex gap-2">
          <Input
            id="codigo"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            placeholder="RCM-XXXX-XXXX"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            className="h-12 font-mono text-base uppercase tracking-wider"
          />
          <Button type="submit" size="lg" className="h-12 shrink-0" disabled={lookup.state === "loading" || !codigo.trim()}>
            {lookup.state === "loading" ? <Loader2 className="animate-spin" /> : <Search />} Comprobar
          </Button>
        </div>
      </form>

      {lookup.state === "notfound" ? (
        <div role="status" className="flex gap-3 rounded-2xl border border-red-500/40 bg-red-500/10 p-4">
          <XCircle className="mt-0.5 size-5 shrink-0 text-red-400" />
          <div>
            <p className="font-semibold">No existe ningún informe con el código {lookup.codigo}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Revisa que esté bien escrito. Si coincide con el del PDF y aun así no aparece, el documento no lo hemos emitido nosotros:
              llámanos antes de fiarte de él.
            </p>
          </div>
        </div>
      ) : null}

      {lookup.state === "error" ? (
        <p role="alert" className="flex items-center gap-2 text-sm text-red-400"><AlertTriangle className="size-4" /> {lookup.message}</p>
      ) : null}

      {lookup.state === "found" ? (
        <div role="status" className="overflow-hidden rounded-2xl border border-emerald-500/40 bg-card">
          <div className="flex items-center gap-3 border-b border-emerald-500/30 bg-emerald-500/10 px-4 py-3.5 sm:px-5">
            <ShieldCheck className="size-6 shrink-0 text-emerald-400" />
            <div>
              <p className="font-semibold">Informe auténtico</p>
              <p className="text-sm text-muted-foreground">Lo emitimos nosotros y sigue siendo válido.</p>
            </div>
          </div>
          <dl className="grid gap-x-6 gap-y-4 p-4 text-sm sm:grid-cols-2 sm:p-5">
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Código</dt>
              <dd className="mt-0.5 font-mono font-semibold">{lookup.informe.codigo}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Emitido</dt>
              <dd className="mt-0.5 font-semibold">
                {new Date(lookup.informe.emitidoAt).toLocaleString("es-ES", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Vehículo</dt>
              <dd className="mt-0.5 font-semibold">{lookup.informe.vehiculo}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Matrícula</dt>
              <dd className="mt-0.5 font-mono font-semibold">{lookup.informe.matricula || "Sin matrícula"}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Resultado</dt>
              <dd className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                <span><b className="text-emerald-400">{lookup.informe.resultado.ok}</b> correctos</span>
                <span><b className="text-amber-400">{lookup.informe.resultado.atencion}</b> atención</span>
                <span><b className="text-red-400">{lookup.informe.resultado.mal}</b> mal</span>
                <span><b>{lookup.informe.resultado.na}</b> no aplican</span>
              </dd>
            </div>
          </dl>

          {/* Comprobar el archivo: que el PDF que tienes es exactamente el que emitimos */}
          <div className="border-t border-border p-4 sm:p-5">
            <p className="font-semibold">¿Quieres comprobar también el archivo?</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Sube el PDF y lo comparamos con el original. Se comprueba en tu dispositivo: el archivo no se envía a ningún sitio.
            </p>
            <input ref={fileInput} type="file" accept="application/pdf,.pdf" className="sr-only" onChange={(e) => checkFile(e.target.files?.[0])} />
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); checkFile(e.dataTransfer.files?.[0]) }}
              className={`mt-3 flex w-full flex-col items-center gap-2 rounded-xl border border-dashed px-4 py-6 text-sm transition-colors ${
                dragging ? "border-primary bg-primary/10" : "border-border hover:border-primary/60 hover:bg-accent/40"
              }`}
            >
              {file.state === "hashing" ? <Loader2 className="size-6 animate-spin text-primary" /> : <Upload className="size-6 text-primary" />}
              <span className="font-semibold">{file.state === "hashing" ? "Comprobando…" : "Elegir o arrastrar el PDF"}</span>
            </button>

            {file.state === "match" ? (
              <p className="mt-3 flex items-start gap-2 text-sm text-emerald-400">
                <FileCheck2 className="mt-px size-4 shrink-0" />
                <span><b>{file.name}</b> es idéntico al original. No se ha modificado.</span>
              </p>
            ) : null}
            {file.state === "mismatch" ? (
              <p className="mt-3 flex items-start gap-2 text-sm text-amber-400">
                <FileWarning className="mt-px size-4 shrink-0" />
                <span>
                  <b>{file.name}</b> no coincide con la versión vigente del informe. Puede ser una versión anterior (si el informe se
                  actualizó) o un archivo modificado. Pídenos la versión actual.
                </span>
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {lookup.state === "idle" ? (
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
          Sirve para compradores, vendedores, talleres o financieras que reciben un informe y quieren saber si es auténtico.
        </p>
      ) : null}
    </div>
  )
}
