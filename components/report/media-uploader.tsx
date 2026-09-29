"use client"

import { useEffect, useRef, useState } from "react"
import { Camera, Image as ImageIcon, Video, X, Loader2, Play } from "lucide-react"
import { toast } from "sonner"
import { compressImage, uploadFile, videoThumbnail } from "@/lib/client-upload"
import { calcularHashArchivo, leerMetadatos } from "@/lib/media-metadata"
import type { MediaDTO } from "@/lib/report-types"
import { cn } from "@/lib/utils"

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
  // Referencia estable a la lista actual para subidas concurrentes
  const mediaRef = useRef(media)
  useEffect(() => { mediaRef.current = media }, [media])

  const folder = `informes/${reportId}/${itemId ?? "general"}`

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    for (const original of Array.from(files)) {
      const isVideo = original.type.startsWith("video/")
      const kind = isVideo ? "VIDEO" : "PHOTO"
      const tmpId = crypto.randomUUID()
      const previewUrl = URL.createObjectURL(original)
      setUploading((u) => [...u, { id: tmpId, name: original.name, progress: 0, kind, preview: isVideo ? undefined : previewUrl }])
      try {
        // Los datos de procedencia se leen del archivo original: al comprimir
        // una foto se pierde el EXIF, y con él la fecha de la cámara.
        const file = isVideo ? original : await compressImage(original)
        // La huella corresponde al archivo que se guarda; el resto de datos
        // (fecha de la cámara, dispositivo) salen del original sin comprimir.
        const [metadatos, huella] = await Promise.all([
          leerMetadatos(original, isVideo),
          calcularHashArchivo(file),
        ])

        // El vídeo empieza a subir de inmediato. La miniatura se saca y se sube
        // a la vez, que en el móvil tarda lo suyo y antes bloqueaba el envío.
        const subida = uploadFile(file, folder, (p) =>
          setUploading((u) => u.map((x) => (x.id === tmpId ? { ...x, progress: p } : x)))
        )
        const miniatura = isVideo
          ? videoThumbnail(original).then((t) => (t ? uploadFile(t, folder) : null)).catch(() => null)
          : Promise.resolve(null)

        const [url, thumbUrl] = await Promise.all([subida, miniatura])
        const res = await fetch(`/api/informes/${reportId}/media`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            itemId,
            kind,
            url,
            thumbUrl,
            name: original.name,
            size: file.size,
            hash: huella,
            capturadoAt: metadatos.capturadoAt,
            origenFecha: metadatos.origenFecha,
            camara: metadatos.camara,
            anchoPx: metadatos.anchoPx,
            altoPx: metadatos.altoPx,
            duracionSeg: metadatos.duracionSeg,
          }),
        })
        if (!res.ok) throw new Error("No se pudo registrar el archivo")
        const { media: created } = await res.json()
        onChange([...mediaRef.current, created])
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error al subir")
      } finally {
        setUploading((u) => u.filter((x) => x.id !== tmpId))
        URL.revokeObjectURL(previewUrl)
      }
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
        <MediaBtn icon={Video} label="Vídeo" accept="video/*" capture="environment" onFiles={handleFiles} />
        <MediaBtn icon={ImageIcon} label="Galería" accept="image/*,video/*" multiple onFiles={handleFiles} />
      </div>

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
  icon: Icon, label, accept, capture, multiple, onFiles,
}: {
  icon: React.ElementType
  label: string
  accept: string
  capture?: "environment" | "user"
  multiple?: boolean
  onFiles: (files: FileList | null) => void
}) {
  return (
    <label className="relative inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-background/50 px-3 text-xs font-semibold text-foreground/80 transition-colors hover:border-primary/40 hover:text-primary active:scale-[0.98] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring/60">
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
