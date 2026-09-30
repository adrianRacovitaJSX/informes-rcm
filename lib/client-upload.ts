"use client"

// Subida de archivos desde el navegador: comprime fotos, saca miniatura de vídeos y
// sube directamente a R2 (URL firmada) o, si no está disponible, a través del servidor.

const MAX_IMAGE_SIDE = 1800
const JPEG_QUALITY = 0.82

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))

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
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("No se pudo procesar la imagen"))), "image/jpeg", quality)
  )
}

/** Redimensiona y convierte a JPEG (también HEIC en Safari). Si falla, devuelve el original. */
export async function compressImage(file: File): Promise<File> {
  try {
    const src = await loadBitmap(file)
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
    await Promise.race([listo, esperar(8000).then(() => { throw new Error("Tiempo agotado") })])
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

function putWithProgress(url: string, file: File, onProgress?: (p: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open("PUT", url)
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream")
    xhr.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total) }
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`R2 respondió ${xhr.status}`)))
    xhr.onerror = () => reject(new Error("Error de red subiendo a R2 (¿CORS del bucket?)"))
    xhr.send(file)
  })
}

function postWithProgress(url: string, form: FormData, onProgress?: (p: number) => void): Promise<{ url: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open("POST", url)
    xhr.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total) }
    xhr.onload = () => {
      try {
        const json = JSON.parse(xhr.responseText)
        if (xhr.status >= 200 && xhr.status < 300) resolve(json)
        else reject(new Error(json.error ?? `Error ${xhr.status}`))
      } catch {
        reject(new Error(`Error ${xhr.status}`))
      }
    }
    xhr.onerror = () => reject(new Error("Error de red"))
    xhr.send(form)
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
const INTENTOS_POR_PARTE = 4
// En 4G la conexión a veces se queda muda sin dar error: si en este tiempo no
// avanza nada, se corta y se reintenta en lugar de dejar la rueda girando.
const SIN_AVANCE_MS = 30_000

export async function pedirPartes(cuerpo: Record<string, unknown>) {
  const res = await fetch("/api/upload/partes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cuerpo),
  })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Error en la subida por partes")
  return res.json()
}

/** PUT con progreso que se corta si la conexión deja de avanzar. Si falla,
 *  devuelve al contador los bytes que había sumado. */
function putParte(
  url: string,
  trozo: Blob,
  onAvance: (bytes: number) => void,
  leerEtag: (xhr: XMLHttpRequest) => string | null
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open("PUT", url)
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
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) return fallar(new Error(`La subida respondió ${xhr.status}`))
      const etag = leerEtag(xhr)
      if (!etag) return fallar(new Error("No llegó el ETag de la parte"))
      clearTimeout(vigilante)
      onAvance(trozo.size - ultimo)
      resolve(etag.replace(/"/g, ""))
    }
    xhr.onerror = () => fallar(new Error("Error de red subiendo una parte"))
    xhr.onabort = () => fallar(new Error("La conexión se quedó parada"))
    xhr.send(trozo)
  })
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
        return await putParte(url, trozo, onAvance, (xhr) => xhr.getResponseHeader("ETag"))
      } catch (e) {
        ultimoError = e
        // Un error de red en el primer intento puede ser CORS: se prueba ya por el servidor
        if (!(e instanceof Error && e.message.startsWith("Error de red"))) continue
      }
    }
    try {
      const porServidor = `/api/upload/parte?key=${encodeURIComponent(subida.key)}&uploadId=${encodeURIComponent(subida.uploadId)}&numero=${numero}`
      const etag = await putParte(porServidor, trozo, onAvance, (xhr) => {
        try { return JSON.parse(xhr.responseText).etag ?? null } catch { return null }
      })
      if (!subida.directoBloqueado) {
        subida.directoBloqueado = true
        console.warn("R2 no acepta la subida directa, se continúa por el servidor", ultimoError)
      }
      return etag
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
    await pedirPartes({ accion: "abortar", key, uploadId }).catch(() => {})
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

  const presign = await fetch("/api/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename: file.name, contentType: file.type || "application/octet-stream", folder }),
  }).then((r) => r.json())

  if (presign.direct) {
    try {
      await putWithProgress(presign.uploadUrl, file, onProgress)
      return presign.url as string
    } catch (e) {
      console.warn("Subida directa fallida, reintentando por servidor", e)
    }
  }
  const form = new FormData()
  form.append("file", file)
  form.append("folder", folder)
  const res = await postWithProgress("/api/upload", form, onProgress)
  return res.url
}
