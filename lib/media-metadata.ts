"use client"

import exifr from "exifr"
import { sha256 } from "@noble/hashes/sha2"
import { bytesToHex } from "@noble/hashes/utils"

export type MetadatosArchivo = {
  capturadoAt: string | null
  origenFecha: "exif" | "archivo" | "grabacion" | "desconocido"
  camara: string
  anchoPx: number | null
  altoPx: number | null
  duracionSeg: number | null
}

const TROZO_HASH = 4 * 1024 * 1024

/**
 * SHA-256 de un archivo, leído por trozos. Con crypto.subtle habría que cargar
 * el vídeo entero en memoria de golpe, y en el iPhone eso deja la pestaña
 * colgada o la cierra.
 */
export async function calcularHashArchivo(file: Blob): Promise<string> {
  const hash = sha256.create()
  for (let desde = 0; desde < file.size; desde += TROZO_HASH) {
    const trozo = await file.slice(desde, desde + TROZO_HASH).arrayBuffer()
    hash.update(new Uint8Array(trozo))
  }
  return bytesToHex(hash.digest())
}

/** Duración y tamaño del vídeo, leídos del propio archivo. */
function datosDelVideo(file: File): Promise<{ duracionSeg: number | null; anchoPx: number | null; altoPx: number | null }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const video = document.createElement("video")
    video.preload = "metadata"
    let hecho = false
    const terminar = (datos: { duracionSeg: number | null; anchoPx: number | null; altoPx: number | null }) => {
      if (hecho) return
      hecho = true
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
    // Hay vídeos que el navegador no sabe leer y no avisa: no se espera más
    setTimeout(() => terminar({ duracionSeg: null, anchoPx: null, altoPx: null }), 8000)
    video.src = url
  })
}

/**
 * Reúne lo que permite demostrar que un archivo es de esa revisión: cuándo se
 * hizo la foto según la cámara y con qué dispositivo. Se lee del archivo
 * original, antes de comprimirlo, porque al comprimir se pierde el EXIF. La
 * huella se calcula aparte, sobre el archivo que se sube.
 */
export async function leerMetadatos(file: File, esVideo: boolean): Promise<MetadatosArchivo> {
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

  return { capturadoAt, origenFecha, camara, anchoPx, altoPx, duracionSeg }
}
