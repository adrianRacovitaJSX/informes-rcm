"use client"

import { useEffect, useRef, useState } from "react"
import { Camera, Image as ImageIcon, Video, X, Loader2, Play } from "lucide-react"
import { toast } from "sonner"
import { compressImage, uploadFile, videoThumbnail } from "@/lib/client-upload"
import { calcularHashArchivo, leerMetadatos } from "@/lib/media-metadata"
import type { MediaDTO } from "@/lib/report-types"
import { puedeGrabar } from "@/lib/grabacion-en-vivo"
import { cn } from "@/lib/utils"
import { VideoRecorder, type VideoGrabado } from "./video-recorder"

type Uploading = { id: string; name: string; progress: number; kind: "PHOTO" | "VIDEO"; preview?: string }

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
  const [uploading, setUploading] = useState<Uploading[]>([])
  const [preview, setPreview] = useState<MediaDTO | null>(null)
  const [grabando, setGrabando] = useState(false)
  // Referencia estable a la lista actual para subidas concurrentes
  const mediaRef = useRef(media)
  useEffect(() => { mediaRef.current = media }, [media])

  const folder = `informes/${reportId}/${itemId ?? "general"}`

  function ponerProgreso(tmpId: string, progress: number) {
    setUploading((u) => u.map((x) => (x.id === tmpId ? { ...x, progress } : x)))
  }

  async function registrar(datos: Record<string, unknown>) {
    const res = await fetch(`/api/informes/${reportId}/media`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId, ...datos }),
    })
    if (!res.ok) throw new Error("No se pudo registrar el archivo")
    const { media: created } = await res.json()
    onChange([...mediaRef.current, created])
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    for (const original of Array.from(files)) {
      const isVideo = original.type.startsWith("video/")
      const kind = isVideo ? "VIDEO" : "PHOTO"
      const tmpId = crypto.randomUUID()
      const previewUrl = URL.createObjectURL(original)
      setUploading((u) => [...u, { id: tmpId, name: original.name, progress: 0, kind, preview: isVideo ? undefined : previewUrl }])
      try {
        const file = isVideo ? original : await compressImage(original)
        // La subida empieza ya. Huella, datos de procedencia y miniatura se
        // sacan a la vez; ninguno de ellos puede frenar el envío del vídeo.
        // Los datos de procedencia se leen del original: al comprimir una foto
        // se pierde el EXIF, y con él la fecha de la cámara.
        const [url, thumbUrl, metadatos, huella] = await Promise.all([
          uploadFile(file, folder, (p) => ponerProgreso(tmpId, p)),
          isVideo
            ? videoThumbnail(original).then((t) => (t ? uploadFile(t, folder) : null)).catch(() => null)
            : Promise.resolve(null),
          leerMetadatos(original, isVideo),
          calcularHashArchivo(file),
        ])
        await registrar({
          kind,
          url,
          thumbUrl,
          name: original.name,
          size: file.size,
          hash: huella,
          ...metadatos,
        })
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error al subir")
      } finally {
        setUploading((u) => u.filter((x) => x.id !== tmpId))
        URL.revokeObjectURL(previewUrl)
      }
    }
  }

  async function handleGrabado({ grabacion, trabajo, miniatura, anchoPx, altoPx }: VideoGrabado) {
    const tmpId = crypto.randomUUID()
    const previewUrl = miniatura ? URL.createObjectURL(miniatura) : undefined
    setUploading((u) => [...u, { id: tmpId, name: "Vídeo", progress: 0, kind: "VIDEO", preview: previewUrl }])
    grabacion.onProgreso = (p) => ponerProgreso(tmpId, p)
    try {
      const [resultado, thumbUrl] = await Promise.all([
        trabajo,
        miniatura ? uploadFile(miniatura, folder).catch(() => null) : Promise.resolve(null),
      ])
      await registrar({
        kind: "VIDEO",
        url: resultado.url,
        thumbUrl,
        name: resultado.archivo.name,
        size: resultado.archivo.size,
        hash: resultado.hash,
        capturadoAt: resultado.capturadoAt,
        origenFecha: "grabacion",
        camara: "",
        anchoPx,
        altoPx,
        duracionSeg: resultado.duracionSeg,
      })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo subir el vídeo")
    } finally {
      setUploading((u) => u.filter((x) => x.id !== tmpId))
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
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
            <div key={u.id} className="relative aspect-square overflow-hidden rounded-xl border border-border bg-muted">
              {u.preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={u.preview} alt="" className="h-full w-full object-cover opacity-50" />
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground"><Video className="size-6" /></div>
              )}
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-black/40">
                <Loader2 className="size-5 animate-spin text-white" />
                <div className="h-1 w-3/4 overflow-hidden rounded-full bg-white/30">
                  <div className="h-full bg-primary transition-all" style={{ width: `${Math.round(u.progress * 100)}%` }} />
                </div>
              </div>
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
