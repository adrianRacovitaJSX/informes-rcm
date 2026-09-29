"use client"

// Subida de archivos desde el navegador: comprime fotos, saca miniatura de vídeos y
// sube directamente a R2 (URL firmada) o, si no está disponible, a través del servidor.

const MAX_IMAGE_SIDE = 1800
const JPEG_QUALITY = 0.82

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

/** Captura un fotograma del vídeo como miniatura JPEG. */
export async function videoThumbnail(file: File): Promise<File | null> {
  try {
    const url = URL.createObjectURL(file)
    const video = document.createElement("video")
    video.muted = true
    video.playsInline = true
    video.preload = "auto"
    video.src = url
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve()
      video.onerror = () => reject(new Error("No se pudo leer el vídeo"))
    })
    video.currentTime = Math.min(0.5, (video.duration || 1) / 2)
    await new Promise<void>((resolve) => { video.onseeked = () => resolve() })
    const scale = Math.min(1, 800 / Math.max(video.videoWidth, video.videoHeight))
    const canvas = document.createElement("canvas")
    canvas.width = Math.round(video.videoWidth * scale)
    canvas.height = Math.round(video.videoHeight * scale)
    canvas.getContext("2d")!.drawImage(video, 0, 0, canvas.width, canvas.height)
    const blob = await canvasToBlob(canvas, 0.75)
    URL.revokeObjectURL(url)
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + "-thumb.jpg", { type: "image/jpeg" })
  } catch (e) {
    console.warn("Sin miniatura de vídeo", e)
    return null
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

const TAMANO_PARTE = 8 * 1024 * 1024 // 8 MB
const PARTES_A_LA_VEZ = 3
const MINIMO_POR_PARTES = 6 * 1024 * 1024 // por debajo no compensa

async function pedir(cuerpo: Record<string, unknown>) {
  const res = await fetch("/api/upload/partes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cuerpo),
  })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Error en la subida por partes")
  return res.json()
}

function subirParte(
  url: string,
  trozo: Blob,
  onAvance: (bytes: number) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open("PUT", url)
    let ultimo = 0
    xhr.upload.onprogress = (e) => {
      onAvance(e.loaded - ultimo)
      ultimo = e.loaded
    }
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) return reject(new Error(`R2 respondió ${xhr.status}`))
      const etag = xhr.getResponseHeader("ETag")
      // Sin ETag no se puede cerrar la subida: suele faltar ExposeHeaders en el CORS
      if (!etag) return reject(new Error("R2 no devolvió el ETag de la parte"))
      resolve(etag)
    }
    xhr.onerror = () => reject(new Error("Error de red subiendo una parte"))
    xhr.send(trozo)
  })
}

function subirParteporServidor(
  key: string,
  uploadId: string,
  numero: number,
  trozo: Blob,
  onAvance: (bytes: number) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open("PUT", `/api/upload/parte?key=${encodeURIComponent(key)}&uploadId=${encodeURIComponent(uploadId)}&numero=${numero}`)
    let ultimo = 0
    xhr.upload.onprogress = (e) => { onAvance(e.loaded - ultimo); ultimo = e.loaded }
    xhr.onload = () => {
      try {
        const json = JSON.parse(xhr.responseText)
        if (xhr.status >= 200 && xhr.status < 300 && json.etag) resolve(json.etag)
        else reject(new Error(json.error ?? `Error ${xhr.status}`))
      } catch {
        reject(new Error(`Error ${xhr.status}`))
      }
    }
    xhr.onerror = () => reject(new Error("Error de red subiendo una parte"))
    xhr.send(trozo)
  })
}

async function subirPorPartes(file: File, folder: string, onProgress?: (p: number) => void): Promise<string> {
  const total = Math.ceil(file.size / TAMANO_PARTE)
  const { key, uploadId, urls } = await pedir({
    accion: "iniciar",
    filename: file.name,
    contentType: file.type || "application/octet-stream",
    folder,
    partes: total,
  })

  let subido = 0
  let directoBloqueado = false
  const etags: { numero: number; etag: string }[] = []
  const avanzar = (bytes: number) => {
    subido += bytes
    onProgress?.(Math.min(0.99, subido / file.size))
  }

  try {
    let siguiente = 0
    const trabajadores = Array.from({ length: Math.min(PARTES_A_LA_VEZ, total) }, async () => {
      while (true) {
        const indice = siguiente++
        if (indice >= total) return
        const trozo = file.slice(indice * TAMANO_PARTE, Math.min((indice + 1) * TAMANO_PARTE, file.size))
        let etag: string
        try {
          if (directoBloqueado) throw new Error("subida directa descartada")
          etag = await subirParte(urls[indice], trozo, avanzar)
        } catch (e) {
          // Normalmente es que al bucket le falta el CORS. Se sigue por el
          // servidor, que al ir por partes tampoco se atraganta.
          if (!directoBloqueado) {
            directoBloqueado = true
            console.warn("R2 no acepta la subida directa, se continúa por el servidor", e)
          }
          etag = await subirParteporServidor(key, uploadId, indice + 1, trozo, avanzar)
        }
        etags.push({ numero: indice + 1, etag: etag.replace(/"/g, "") })
      }
    })
    await Promise.all(trabajadores)

    const { url } = await pedir({ accion: "completar", key, uploadId, etags })
    onProgress?.(1)
    return url as string
  } catch (e) {
    await pedir({ accion: "abortar", key, uploadId }).catch(() => {})
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
