"use client"

import exifr from "exifr"

export type MetadatosArchivo = {
  hash: string
  capturadoAt: string | null
  origenFecha: "exif" | "archivo" | "desconocido"
  camara: string
  anchoPx: number | null
  altoPx: number | null
  duracionSeg: number | null
}

/** SHA-256 de un archivo. */
export async function calcularHashArchivo(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const digest = await crypto.subtle.digest("SHA-256", buffer)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

/** Duración y tamaño del vídeo, leídos del propio archivo. */
function datosDelVideo(file: File): Promise<{ duracionSeg: number | null; anchoPx: number | null; altoPx: number | null }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const video = document.createElement("video")
    video.preload = "metadata"
    const terminar = (datos: { duracionSeg: number | null; anchoPx: number | null; altoPx: number | null }) => {
      URL.revokeObjectURL(url)
      resolve(datos)
    }
    video.onloadedmetadata = () =>
      terminar({
        duracionSeg: Number.isFinite(video.duration) ? Math.round(video.duration) : null,
        anchoPx: video.videoWidth || null,
        altoPx: video.videoHeight || null,
      })
    video.onerror = () => terminar({ duracionSeg: null, anchoPx: null, altoPx: null })
    video.src = url
  })
}

/**
 * Reúne lo que permite demostrar que un archivo es de esa revisión: su huella,
 * cuándo se hizo la foto según la cámara y con qué dispositivo. Se lee del
 * archivo original, antes de comprimirlo, porque al comprimir se pierde el EXIF.
 */
export async function leerMetadatos(file: File, esVideo: boolean): Promise<MetadatosArchivo> {
  const hash = await calcularHashArchivo(file)

  let capturadoAt: string | null = null
  let origenFecha: MetadatosArchivo["origenFecha"] = "desconocido"
  let camara = ""
  let anchoPx: number | null = null
  let altoPx: number | null = null
  let duracionSeg: number | null = null

  if (esVideo) {
    const datos = await datosDelVideo(file)
    duracionSeg = datos.duracionSeg
    anchoPx = datos.anchoPx
    altoPx = datos.altoPx
  } else {
    try {
      const exif = await exifr.parse(file, {
        pick: ["DateTimeOriginal", "CreateDate", "Make", "Model", "ExifImageWidth", "ExifImageHeight"],
      })
      const fecha: Date | undefined = exif?.DateTimeOriginal ?? exif?.CreateDate
      if (fecha instanceof Date && !Number.isNaN(fecha.getTime())) {
        capturadoAt = fecha.toISOString()
        origenFecha = "exif"
      }
      camara = [exif?.Make, exif?.Model].filter(Boolean).join(" ").trim()
      anchoPx = exif?.ExifImageWidth ?? null
      altoPx = exif?.ExifImageHeight ?? null
    } catch {
      // Sin EXIF: habitual en capturas de pantalla o si el móvil lo borra
    }
  }

  // Si la cámara no dejó fecha, vale la del propio archivo
  if (!capturadoAt && file.lastModified) {
    capturadoAt = new Date(file.lastModified).toISOString()
    origenFecha = "archivo"
  }

  return { hash, capturadoAt, origenFecha, camara, anchoPx, altoPx, duracionSeg }
}
