"use client"

import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { Camera, Image as ImageIcon, Video, X, Loader2, Play, RotateCcw, AlertTriangle } from "lucide-react"
import { toast } from "sonner"
import { compressImage, conTiempo, pedirJson, uploadFile, videoThumbnail } from "@/lib/client-upload"
import { calcularHashArchivo, leerMetadatos } from "@/lib/media-metadata"
import type { MediaDTO } from "@/lib/report-types"
import { puedeGrabar } from "@/lib/grabacion-en-vivo"
import {
  actualizarPendiente,
  borrarPendiente,
  guardarPendiente,
  listarPendientes,
  type SubidaPendiente,
} from "@/lib/subidas-pendientes"
import { cn } from "@/lib/utils"
import { VideoRecorder, type VideoGrabado } from "./video-recorder"

// ── Subidas en curso ─────────────────────────────────────────────────────────
// Viven fuera del componente: si el mecánico pasa al siguiente punto mientras
// un vídeo sube, la subida sigue y al volver se ve en qué punto está. Una
// subida nunca desaparece sin más: o termina registrada, o se queda con el
// aviso de error y el botón de reintentar.

type Trabajo = {
  id: string
  destino: string
  kind: "PHOTO" | "VIDEO"
  progress: number
  preview?: string
  error?: string
  /** Solo los vídeos guardados en el móvil se pueden reintentar. */
  pendiente?: SubidaPendiente
}

const trabajos = new Map<string, Trabajo>()
let instantanea: Trabajo[] = []
const oyentes = new Set<() => void>()
const SIN_TRABAJOS: Trabajo[] = []

function publicar() {
  instantanea = [...trabajos.values()]
  oyentes.forEach((f) => f())
}
function suscribir(f: () => void) {
  oyentes.add(f)
  return () => { oyentes.delete(f) }
}
function ponerTrabajo(t: Trabajo) {
  trabajos.set(t.id, t)
  publicar()
}
function cambiarTrabajo(id: string, cambios: Partial<Trabajo>) {
  const t = trabajos.get(id)
  if (!t) return
  trabajos.set(id, { ...t, ...cambios })
  publicar()
}
function quitarTrabajo(id: string) {
  const t = trabajos.get(id)
  if (t?.preview) URL.revokeObjectURL(t.preview)
  trabajos.delete(id)
  publicar()
}

// Dónde apuntar cada archivo registrado: la última lista y el onChange del
// punto, aunque en ese momento se esté viendo otro.
const destinos = new Map<string, { lista: MediaDTO[]; onChange: (next: MediaDTO[]) => void }>()

function anadirAlDestino(destino: string, creado: MediaDTO) {
  const d = destinos.get(destino)
  if (!d) return
  d.lista = [...d.lista.filter((m) => m.id !== creado.id), creado]
  d.onChange(d.lista)
}

async function registrar(reportId: string, itemId: string | null, datos: Record<string, unknown>): Promise<MediaDTO> {
  // El servidor lo trata como idempotente por URL: si una respuesta se pierde
  // y se reintenta, no se duplica el archivo
  const { media } = await pedirJson<{ media: MediaDTO }>(
    `/api/informes/${reportId}/media`,
    { method: "POST", json: { itemId, ...datos } },
    { tiempoMs: 45_000 }
  )
  return media
}

/**
 * Sube (si hace falta) y registra un vídeo guardado en el móvil. `urlEnCurso`
 * es la subida que ya está en marcha, para no empezarla de nuevo.
 */
async function subirVideo(p: SubidaPendiente, urlEnCurso?: Promise<string>) {
  // Nunca dos subidas a la vez del mismo vídeo (botón y reintento automático)
  if (enMarcha.has(p.id)) return
  enMarcha.add(p.id)
  const destino = `${p.reportId}:${p.itemId ?? ""}`
  cambiarTrabajo(p.id, { error: undefined, progress: p.url ? 1 : 0 })
  try {
    let url = p.url
    if (!url) {
      const archivo = new File([p.archivo], p.nombre, { type: p.tipo })
      url = await (urlEnCurso ?? uploadFile(archivo, p.folder, (x) => cambiarTrabajo(p.id, { progress: x })))
      p = { ...p, url }
      cambiarTrabajo(p.id, { pendiente: p, progress: 1 })
      await actualizarPendiente(p.id, { url })
    }
    let thumbUrl = p.thumbUrl
    if (!thumbUrl && p.miniatura) {
      // La miniatura es un extra: si no sube a tiempo, el vídeo se registra sin ella
      const mini = new File([p.miniatura], "video-thumb.jpg", { type: "image/jpeg" })
      thumbUrl = await conTiempo(uploadFile(mini, p.folder), 30_000, "Miniatura lenta").catch(() => null)
    }
    const creado = await registrar(p.reportId, p.itemId, { ...p.datos, url, thumbUrl })
    await borrarPendiente(p.id)
    quitarTrabajo(p.id)
    anadirAlDestino(destino, creado)
  } catch (e) {
    console.error("Subida de vídeo fallida", e)
    cambiarTrabajo(p.id, {
      pendiente: p,
      error: e instanceof Error ? e.message : "No se pudo subir el vídeo",
    })
  } finally {
    enMarcha.delete(p.id)
  }
}

const enMarcha = new Set<string>()

// Los vídeos que se quedaron sin subir se reintentan solos al volver la
// cobertura y cada cierto tiempo, sin esperar a que nadie pulse el botón
function reintentarFallidos() {
  for (const t of trabajos.values()) if (t.error && t.pendiente) subirVideo(t.pendiente)
}
if (typeof window !== "undefined") {
  window.addEventListener("online", reintentarFallidos)
  setInterval(reintentarFallidos, 30_000)
}

const reanudados = new Set<string>()

export function MediaUploader({
  reportId,
  itemId,
  media,
  onChange,
  compact,
}: {
  reportId: string
  itemId: string | null
  media: MediaDTO[]
  onChange: (next: MediaDTO[]) => void
  compact?: boolean
}) {
  const [preview, setPreview] = useState<MediaDTO | null>(null)
  const [grabando, setGrabando] = useState(false)
  const destino = `${reportId}:${itemId ?? ""}`
  const todos = useSyncExternalStore(suscribir, () => instantanea, () => SIN_TRABAJOS)
  const uploading = todos.filter((t) => t.destino === destino)
  // Referencia estable a la lista actual para subidas concurrentes
  const mediaRef = useRef(media)
  useEffect(() => {
    mediaRef.current = media
    destinos.set(destino, { lista: media, onChange })
  }, [media, onChange, destino])

  const folder = `informes/${reportId}/${itemId ?? "general"}`

  // Vídeos que se quedaron sin registrar (app cerrada, sin cobertura…): se
  // vuelven a intentar solos al abrir el punto
  useEffect(() => {
    listarPendientes(reportId, itemId).then((lista) => {
      for (const p of lista) {
        if (trabajos.has(p.id) || reanudados.has(p.id)) continue
        reanudados.add(p.id)
        ponerTrabajo({
          id: p.id,
          destino,
          kind: "VIDEO",
          progress: 0,
          preview: p.miniatura ? URL.createObjectURL(p.miniatura) : undefined,
          pendiente: p,
        })
        subirVideo(p)
      }
    })
  }, [reportId, itemId, destino])

  async function subirFoto(original: File) {
    const id = crypto.randomUUID()
    ponerTrabajo({ id, destino, kind: "PHOTO", progress: 0, preview: URL.createObjectURL(original) })
    try {
      const file = await compressImage(original)
      // Los datos de procedencia se leen del original: al comprimir una foto
      // se pierde el EXIF, y con él la fecha de la cámara
      const [url, metadatos, huella] = await Promise.all([
        uploadFile(file, folder, (p) => cambiarTrabajo(id, { progress: p })),
        leerMetadatos(original, false),
        calcularHashArchivo(file),
      ])
      const creado = await registrar(reportId, itemId, {
        kind: "PHOTO", url, thumbUrl: null, name: original.name, size: file.size, hash: huella, ...metadatos,
      })
      quitarTrabajo(id)
      anadirAlDestino(destino, creado)
    } catch (e) {
      quitarTrabajo(id)
      toast.error(`${original.name}: ${e instanceof Error ? e.message : "no se pudo subir"}`)
    }
  }

  /** Vídeo de la galería o de la cámara del sistema. */
  async function subirVideoDeArchivo(original: File) {
    const id = crypto.randomUUID()
    ponerTrabajo({ id, destino, kind: "VIDEO", progress: 0 })
    // La subida empieza ya; huella, datos y miniatura se sacan mientras tanto
    const enCurso = uploadFile(original, folder, (p) => cambiarTrabajo(id, { progress: p }))
    enCurso.catch(() => {})
    const [metadatos, huella, miniatura] = await Promise.all([
      leerMetadatos(original, true),
      calcularHashArchivo(original).catch(() => undefined),
      videoThumbnail(original),
    ])
    if (miniatura) cambiarTrabajo(id, { preview: URL.createObjectURL(miniatura) })
    const p: SubidaPendiente = {
      id, reportId, itemId, folder,
      archivo: original, nombre: original.name, tipo: original.type || "video/mp4",
      miniatura, url: null, thumbUrl: null,
      datos: { kind: "VIDEO", name: original.name, size: original.size, hash: huella, ...metadatos },
      creado: Date.now(),
    }
    cambiarTrabajo(id, { pendiente: p })
    await guardarPendiente(p)
    await subirVideo(p, enCurso)
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    for (const original of Array.from(files)) {
      if (original.type.startsWith("video/")) await subirVideoDeArchivo(original).catch(() => {})
      else await subirFoto(original)
    }
  }

  async function handleGrabado({ grabacion, cierre, miniatura, anchoPx, altoPx }: VideoGrabado) {
    const id = crypto.randomUUID()
    ponerTrabajo({ id, destino, kind: "VIDEO", progress: 0, preview: miniatura ? URL.createObjectURL(miniatura) : undefined })
    grabacion.onProgreso = (p) => cambiarTrabajo(id, { progress: p })
    let cerrado
    try {
      cerrado = await cierre
    } catch (e) {
      quitarTrabajo(id)
      toast.error(e instanceof Error ? e.message : "No se pudo guardar la grabación")
      return
    }
    const p: SubidaPendiente = {
      id, reportId, itemId, folder,
      archivo: cerrado.archivo, nombre: cerrado.archivo.name, tipo: cerrado.archivo.type,
      miniatura, url: null, thumbUrl: null,
      datos: {
        kind: "VIDEO",
        name: cerrado.archivo.name,
        size: cerrado.archivo.size,
        hash: cerrado.hash,
        capturadoAt: cerrado.capturadoAt,
        origenFecha: "grabacion",
        camara: "",
        anchoPx,
        altoPx,
        duracionSeg: cerrado.duracionSeg,
      },
      creado: Date.now(),
    }
    cambiarTrabajo(id, { pendiente: p })
    // Guardado en el móvil antes de nada: pase lo que pase con la red, el vídeo no se pierde
    await guardarPendiente(p)
    await subirVideo(p, cerrado.url)
  }

  function reintentar(t: Trabajo) {
    if (t.pendiente) subirVideo(t.pendiente)
  }

  async function descartarTrabajo(t: Trabajo) {
    if (!confirm("¿Descartar este vídeo? No se ha llegado a guardar en el informe.")) return
    quitarTrabajo(t.id)
    await borrarPendiente(t.id)
  }

  async function remove(m: MediaDTO) {
    if (!confirm("¿Eliminar este archivo?")) return
    onChange(media.filter((x) => x.id !== m.id))
    const res = await fetch(`/api/informes/${reportId}/media?mediaId=${m.id}`, { method: "DELETE" })
    if (!res.ok) {
      toast.error("No se pudo eliminar")
      onChange(mediaRef.current)
    }
  }

  const tiles = [...media]

  return (
    <div className="space-y-2.5">
      {(tiles.length > 0 || uploading.length > 0) && (
        <div className={cn("grid gap-2", compact ? "grid-cols-4" : "grid-cols-3 sm:grid-cols-4")}>
          {tiles.map((m) => (
            <div key={m.id} className="group relative aspect-square overflow-hidden rounded-xl border border-border bg-muted">
              <button type="button" onClick={() => setPreview(m)} className="block h-full w-full">
                {m.kind === "PHOTO" || m.thumbUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.kind === "PHOTO" ? m.url : m.thumbUrl!} alt={m.name} className="h-full w-full object-cover" loading="lazy" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-muted-foreground"><Video className="size-6" /></div>
                )}
                {m.kind === "VIDEO" ? (
                  <span className="absolute inset-0 flex items-center justify-center bg-black/30"><Play className="size-6 fill-white text-white" /></span>
                ) : null}
              </button>
              <button
                type="button"
                onClick={() => remove(m)}
                className="absolute right-1 top-1 rounded-full bg-black/70 p-1 text-white/90 hover:bg-red-600"
                aria-label="Eliminar"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}
          {uploading.map((u) => (
            <div key={u.id} className={cn("relative aspect-square overflow-hidden rounded-xl border bg-muted", u.error ? "border-red-500/70" : "border-border")}>
              {u.preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={u.preview} alt="" className="h-full w-full object-cover opacity-50" />
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground"><Video className="size-6" /></div>
              )}
              {u.error ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-black/60 p-1.5 text-center">
                  <AlertTriangle className="size-4 text-red-400" />
                  <span className="line-clamp-2 text-[10px] leading-tight text-white/90">Sin subir. Está guardado en el móvil.</span>
                  <button
                    type="button"
                    onClick={() => reintentar(u)}
                    className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 text-[11px] font-semibold text-black"
                  >
                    <RotateCcw className="size-3" />
                    Reintentar
                  </button>
                  <button
                    type="button"
                    onClick={() => descartarTrabajo(u)}
                    className="absolute right-1 top-1 rounded-full bg-black/70 p-1 text-white/90 hover:bg-red-600"
                    aria-label="Descartar"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-black/40">
                  <Loader2 className="size-5 animate-spin text-white" />
                  <div className="h-1 w-3/4 overflow-hidden rounded-full bg-white/30">
                    <div className="h-full bg-primary transition-all" style={{ width: `${Math.round(u.progress * 100)}%` }} />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <MediaBtn icon={Camera} label="Foto" accept="image/*" capture="environment" onFiles={handleFiles} />
        <MediaBtn
          icon={Video}
          label="Vídeo"
          accept="video/*"
          capture="environment"
          onFiles={handleFiles}
          onPulsar={(e) => {
            // Si el navegador deja grabar, se graba dentro de la app (mejor
            // calidad y se sube mientras se graba); si no, la cámara del sistema
            if (puedeGrabar()) {
              e.preventDefault()
              setGrabando(true)
            }
          }}
        />
        <MediaBtn icon={ImageIcon} label="Galería" accept="image/*,video/*" multiple onFiles={handleFiles} />
      </div>

      {grabando ? (
        <VideoRecorder
          folder={folder}
          onGrabado={handleGrabado}
          onCerrar={() => setGrabando(false)}
          onUsarCamaraDelSistema={handleFiles}
        />
      ) : null}

      {preview ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))]" onClick={() => setPreview(null)}>
          <button className="absolute right-4 top-[max(1rem,calc(env(safe-area-inset-top)+0.5rem))] rounded-full bg-white/10 p-2 text-white" aria-label="Cerrar"><X className="size-5" /></button>
          {preview.kind === "VIDEO" ? (
            <video src={preview.url} controls autoPlay playsInline className="max-h-full max-w-full rounded-xl" onClick={(e) => e.stopPropagation()} />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview.url} alt={preview.name} className="max-h-full max-w-full rounded-xl object-contain" onClick={(e) => e.stopPropagation()} />
          )}
        </div>
      ) : null}
    </div>
  )
}

// Un <label> que envuelve el <input type="file"> abre la cámara/galería de forma nativa en iOS y Android
// (más fiable que disparar input.click() sobre un input con display:none).
function MediaBtn({
  icon: Icon, label, accept, capture, multiple, onFiles, onPulsar,
}: {
  icon: React.ElementType
  label: string
  accept: string
  capture?: "environment" | "user"
  multiple?: boolean
  onFiles: (files: FileList | null) => void
  onPulsar?: (e: React.MouseEvent<HTMLLabelElement>) => void
}) {
  return (
    <label onClick={onPulsar} className="relative inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-background/50 px-3 text-xs font-semibold text-foreground/80 transition-colors hover:border-primary/40 hover:text-primary active:scale-[0.98] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring/60">
      <Icon className="size-3.5" />
      {label}
      <input
        type="file"
        accept={accept}
        capture={capture}
        multiple={multiple}
        className="sr-only"
        onChange={(e) => { onFiles(e.target.files); e.target.value = "" }}
      />
    </label>
  )
}
