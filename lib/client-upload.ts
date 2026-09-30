"use client"

// Subida de archivos desde el navegador: comprime fotos, saca miniatura de vídeos y
// sube directamente a R2 (URL firmada) o, si no está disponible, a través del servidor.
//
// Regla de este archivo: ninguna espera puede quedarse colgada. Toda petición
// tiene límite de tiempo y reintentos, y toda subida se corta si la conexión
// deja de avanzar. En 4G la red a veces se queda muda sin dar error, y si algo
// espera sin límite la rueda gira para siempre.

const MAX_IMAGE_SIDE = 1800
const JPEG_QUALITY = 0.82

export const esperar = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/** Rechaza si la promesa no termina a tiempo. */
export function conTiempo<T>(promesa: Promise<T>, ms: number, mensaje: string): Promise<T> {
  let t: ReturnType<typeof setTimeout>
  return Promise.race([
    promesa,
    new Promise<T>((_, reject) => { t = setTimeout(() => reject(new Error(mensaje)), ms) }),
  ]).finally(() => clearTimeout(t))
}

/**
 * Petición JSON a la propia API con límite de tiempo y reintentos. Solo se
 * reintentan los fallos de red y los 5xx: un 4xx es una respuesta definitiva.
 */
export async function pedirJson<T = Record<string, unknown>>(
  url: string,
  init: RequestInit & { json?: unknown } = {},
  { intentos = 4, tiempoMs = 20_000 }: { intentos?: number; tiempoMs?: number } = {}
): Promise<T> {
  const { json, ...resto } = init
  let ultimoError: unknown
  for (let intento = 0; intento < intentos; intento++) {
    if (intento > 0) await esperar(1000 * 2 ** (intento - 1))
    try {
      const res = await fetch(url, {
        ...resto,
        headers: json !== undefined ? { "Content-Type": "application/json", ...resto.headers } : resto.headers,
        body: json !== undefined ? JSON.stringify(json) : resto.body,
        signal: AbortSignal.timeout(tiempoMs),
      })
      const datos = await res.json().catch(() => ({}))
      if (res.ok) return datos as T
      const error = new Error(datos.error ?? `Error ${res.status}`)
      if (res.status < 500) throw Object.assign(error, { definitivo: true })
      ultimoError = error
    } catch (e) {
      if ((e as { definitivo?: boolean }).definitivo) throw e
      ultimoError = e
    }
  }
  throw ultimoError instanceof Error ? ultimoError : new Error("Sin conexión con el servidor")
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  try {
    return await createImageBitmap(file)
  } catch {
    return new Promise((resolve, reject) => {
      const img = new window.Image()
      img.onload = () => resolve(img)
      img.onerror = reject
      img.src = URL.createObjectURL(file)
    })
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, quality = JPEG_QUALITY): Promise<Blob> {
  return conTiempo(
    new Promise((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("No se pudo procesar la imagen"))), "image/jpeg", quality)
    ),
    10_000,
    "No se pudo procesar la imagen"
  )
}

/** Redimensiona y convierte a JPEG (también HEIC en Safari). Si falla, devuelve el original. */
export async function compressImage(file: File): Promise<File> {
  try {
    const src = await conTiempo(loadBitmap(file), 15_000, "La imagen no se pudo leer")
    const w = "width" in src ? src.width : 0
    const h = "height" in src ? src.height : 0
    const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(w, h))
    const canvas = document.createElement("canvas")
    canvas.width = Math.round(w * scale)
    canvas.height = Math.round(h * scale)
    const ctx = canvas.getContext("2d")!
    ctx.drawImage(src as CanvasImageSource, 0, 0, canvas.width, canvas.height)
    const blob = await canvasToBlob(canvas)
    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg"
    return new File([blob], name, { type: "image/jpeg" })
  } catch (e) {
    console.warn("No se pudo comprimir la imagen, se sube original", e)
    return file
  }
}

/** Pasa un fotograma de un <video> ya cargado a JPEG. */
export async function fotogramaAJpeg(video: HTMLVideoElement, nombre: string): Promise<File> {
  const scale = Math.min(1, 800 / Math.max(video.videoWidth, video.videoHeight))
  const canvas = document.createElement("canvas")
  canvas.width = Math.round(video.videoWidth * scale)
  canvas.height = Math.round(video.videoHeight * scale)
  canvas.getContext("2d")!.drawImage(video, 0, 0, canvas.width, canvas.height)
  const blob = await canvasToBlob(canvas, 0.75)
  return new File([blob], nombre, { type: "image/jpeg" })
}

/**
 * Captura un fotograma del vídeo como miniatura JPEG. En el iPhone un <video>
 * fuera de la página a veces no llega a cargar nunca, así que se espera como
 * mucho unos segundos: sin miniatura el vídeo se sube igual.
 */
export async function videoThumbnail(file: File): Promise<File | null> {
  const url = URL.createObjectURL(file)
  const video = document.createElement("video")
  try {
    video.muted = true
    video.playsInline = true
    video.preload = "metadata"
    const listo = new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => {
        // Saltar a un instante obliga al navegador a descodificar ese fotograma
        video.currentTime = Math.min(0.5, (video.duration || 1) / 2)
      }
      video.onseeked = () => resolve()
      video.onerror = () => reject(new Error("No se pudo leer el vídeo"))
    })
    video.src = url
    video.load()
    await conTiempo(listo, 8000, "Tiempo agotado")
    if (!video.videoWidth) return null
    return await fotogramaAJpeg(video, file.name.replace(/\.[^.]+$/, "") + "-thumb.jpg")
  } catch (e) {
    console.warn("Sin miniatura de vídeo", e)
    return null
  } finally {
    video.removeAttribute("src")
    URL.revokeObjectURL(url)
  }
}

// ── Envío con vigilancia ─────────────────────────────────────────────────────

const INTENTOS_POR_PARTE = 4
// Si en este tiempo la subida no avanza nada, se corta y se reintenta en lugar
// de dejar la rueda girando.
const SIN_AVANCE_MS = 30_000

/**
 * Envía un cuerpo con XHR (para tener progreso) y lo corta si deja de avanzar.
 * Si falla, devuelve al contador los bytes que había sumado.
 */
function enviarVigilado<T>(
  metodo: "PUT" | "POST",
  url: string,
  cuerpo: Blob | FormData,
  tamano: number,
  onAvance: (bytes: number) => void,
  leer: (xhr: XMLHttpRequest) => T | null,
  contentType?: string
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open(metodo, url)
    if (contentType) xhr.setRequestHeader("Content-Type", contentType)
    let ultimo = 0
    let vigilante = setTimeout(() => xhr.abort(), SIN_AVANCE_MS)
    const rearmar = () => {
      clearTimeout(vigilante)
      vigilante = setTimeout(() => xhr.abort(), SIN_AVANCE_MS)
    }
    const fallar = (error: Error) => {
      clearTimeout(vigilante)
      onAvance(-ultimo)
      reject(error)
    }
    xhr.upload.onprogress = (e) => {
      rearmar()
      onAvance(e.loaded - ultimo)
      ultimo = e.loaded
    }
    // Enviado todo el cuerpo, la respuesta también tiene que llegar a tiempo
    xhr.upload.onload = rearmar
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        let mensaje = `La subida respondió ${xhr.status}`
        try { mensaje = JSON.parse(xhr.responseText).error ?? mensaje } catch {}
        return fallar(new Error(mensaje))
      }
      const resultado = leer(xhr)
      if (resultado === null) return fallar(new Error("Respuesta incompleta de la subida"))
      clearTimeout(vigilante)
      onAvance(tamano - ultimo)
      resolve(resultado)
    }
    xhr.onerror = () => fallar(new Error("Error de red en la subida"))
    xhr.onabort = () => fallar(new Error("La conexión se quedó parada"))
    xhr.send(cuerpo)
  })
}

// ── Subida por partes ────────────────────────────────────────────────────────
// A partir de cierto tamaño (vídeos) el archivo se trocea y se suben varias
// partes a la vez. En 4G, con una sola conexión se desaprovecha la subida;
// con tres en paralelo el vídeo llega bastante antes.
//
// R2 exige que todas las partes menos la última midan lo mismo y al menos 5 MB.

export const TAMANO_PARTE = 8 * 1024 * 1024 // 8 MB
const PARTES_A_LA_VEZ = 3
const MINIMO_POR_PARTES = 6 * 1024 * 1024 // por debajo no compensa

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function pedirPartes(cuerpo: Record<string, unknown>): Promise<any> {
  return pedirJson("/api/upload/partes", { method: "POST", json: cuerpo })
}

/**
 * Sube una parte con reintentos. Primero directo a R2; si R2 no deja (CORS),
 * a través del servidor, y a partir de ahí todas las demás también.
 */
export async function subirParteConReintentos(
  subida: { key: string; uploadId: string; directoBloqueado: boolean },
  numero: number,
  url: string,
  trozo: Blob,
  onAvance: (bytes: number) => void
): Promise<string> {
  let ultimoError: unknown
  for (let intento = 0; intento < INTENTOS_POR_PARTE; intento++) {
    if (intento > 0) await esperar(1000 * 2 ** (intento - 1))
    if (!subida.directoBloqueado) {
      try {
        // Sin ETag no se puede cerrar la subida: suele faltar ExposeHeaders en el CORS
        const etag = await enviarVigilado("PUT", url, trozo, trozo.size, onAvance, (xhr) => xhr.getResponseHeader("ETag"))
        return etag.replace(/"/g, "")
      } catch (e) {
        ultimoError = e
        // Un error de red puede ser CORS: se prueba ya por el servidor
        if (!(e instanceof Error && e.message.startsWith("Error de red"))) continue
      }
    }
    try {
      const porServidor = `/api/upload/parte?key=${encodeURIComponent(subida.key)}&uploadId=${encodeURIComponent(subida.uploadId)}&numero=${numero}`
      const etag = await enviarVigilado("PUT", porServidor, trozo, trozo.size, onAvance, (xhr) => {
        try { return (JSON.parse(xhr.responseText).etag as string) ?? null } catch { return null }
      })
      if (!subida.directoBloqueado) {
        subida.directoBloqueado = true
        console.warn("R2 no acepta la subida directa, se continúa por el servidor", ultimoError)
      }
      return etag.replace(/"/g, "")
    } catch (e) {
      ultimoError = e
    }
  }
  throw ultimoError instanceof Error ? ultimoError : new Error("No se pudo subir una parte")
}

async function subirPorPartes(file: File, folder: string, onProgress?: (p: number) => void): Promise<string> {
  const total = Math.ceil(file.size / TAMANO_PARTE)
  const { key, uploadId, urls } = await pedirPartes({
    accion: "iniciar",
    filename: file.name,
    contentType: file.type || "application/octet-stream",
    folder,
    partes: total,
  })
  const subida = { key, uploadId, directoBloqueado: false }

  let subido = 0
  const etags: { numero: number; etag: string }[] = []
  const avanzar = (bytes: number) => {
    subido += bytes
    onProgress?.(Math.min(0.99, Math.max(0, subido / file.size)))
  }

  try {
    let siguiente = 0
    const trabajadores = Array.from({ length: Math.min(PARTES_A_LA_VEZ, total) }, async () => {
      while (true) {
        const indice = siguiente++
        if (indice >= total) return
        const trozo = file.slice(indice * TAMANO_PARTE, Math.min((indice + 1) * TAMANO_PARTE, file.size))
        const etag = await subirParteConReintentos(subida, indice + 1, urls[indice], trozo, avanzar)
        etags.push({ numero: indice + 1, etag })
      }
    })
    await Promise.all(trabajadores)

    const { url } = await pedirPartes({ accion: "completar", key, uploadId, etags })
    onProgress?.(1)
    return url as string
  } catch (e) {
    pedirPartes({ accion: "abortar", key, uploadId }).catch(() => {})
    throw e
  }
}

/** Sube un archivo y devuelve su URL pública. */
export async function uploadFile(file: File, folder: string, onProgress?: (p: number) => void): Promise<string> {
  // Los archivos grandes van por partes y en paralelo
  if (file.size >= MINIMO_POR_PARTES) {
    try {
      return await subirPorPartes(file, folder, onProgress)
    } catch (e) {
      console.warn("Subida por partes fallida, se intenta de una pieza", e)
    }
  }

  let subido = 0
  const avanzar = (bytes: number) => {
    subido += bytes
    onProgress?.(Math.min(0.99, Math.max(0, subido / Math.max(file.size, 1))))
  }
  const tipo = file.type || "application/octet-stream"
  const presign = await pedirJson<{ direct: boolean; uploadUrl?: string; url?: string }>("/api/upload", {
    method: "POST",
    json: { filename: file.name, contentType: tipo, folder },
  })

  if (presign.direct && presign.uploadUrl) {
    for (let intento = 0; intento < 3; intento++) {
      if (intento > 0) await esperar(1000 * 2 ** (intento - 1))
      try {
        await enviarVigilado("PUT", presign.uploadUrl, file, file.size, avanzar, () => true, tipo)
        onProgress?.(1)
        return presign.url as string
      } catch (e) {
        console.warn("Subida directa fallida", e)
        if (e instanceof Error && e.message.startsWith("Error de red")) break
      }
    }
  }
  const form = new FormData()
  form.append("file", file)
  form.append("folder", folder)
  const res = await enviarVigilado("POST", "/api/upload", form, file.size, avanzar, (xhr) => {
    try { return (JSON.parse(xhr.responseText).url as string) ?? null } catch { return null }
  })
  onProgress?.(1)
  return res
}
