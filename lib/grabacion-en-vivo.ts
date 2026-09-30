"use client"

import { sha256 } from "@noble/hashes/sha2"
import { bytesToHex } from "@noble/hashes/utils"
import { pedirPartes, subirParteConReintentos, uploadFile } from "@/lib/client-upload"

// Grabación de vídeo dentro de la app. Con el <input capture> del iPhone el
// vídeo sale en calidad media y además iOS lo recomprime antes de entregarlo,
// que es lo que más tarda. Grabando aquí se elige la calidad y el vídeo se va
// subiendo a R2 por partes mientras se graba: al parar solo queda el último trozo.

// R2 pide partes de al menos 5 MB e iguales entre sí (salvo la última)
const PARTE_EN_VIVO = 5 * 1024 * 1024
export const DURACION_MAXIMA_SEG = 180

const TIPOS = [
  "video/mp4;codecs=avc1,mp4a.40.2",
  "video/mp4;codecs=avc1",
  "video/mp4",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
]

export function puedeGrabar() {
  return (
    typeof window !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof window.MediaRecorder !== "undefined"
  )
}

/** Abre la cámara trasera pidiendo 1080p; si el móvil no puede, lo que dé. */
export async function abrirCamara(): Promise<MediaStream> {
  const video: MediaTrackConstraints = {
    facingMode: { ideal: "environment" },
    width: { ideal: 1920 },
    height: { ideal: 1080 },
    frameRate: { ideal: 30 },
  }
  try {
    return await navigator.mediaDevices.getUserMedia({ video, audio: true })
  } catch (e) {
    // Sin permiso de micrófono se graba igual, sin sonido
    if (e instanceof DOMException && e.name === "NotAllowedError") {
      return navigator.mediaDevices.getUserMedia({ video, audio: false }).catch(() => { throw e })
    }
    return navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: true })
  }
}

export type ResultadoGrabacion = {
  url: string
  archivo: File
  hash: string
  duracionSeg: number
  capturadoAt: string
}

type Subida = { key: string; uploadId: string; directoBloqueado: boolean; primeraUrl: string }

export class GrabacionEnVivo {
  onProgreso?: (p: number) => void

  private recorder: MediaRecorder
  private readonly tipo: string
  private readonly folder: string
  private readonly nombre: string
  private inicio = new Date()

  private trozos: Blob[] = [] // todo lo grabado, por si hay que subirlo de una pieza
  private pendiente: Blob[] = []
  private pendienteBytes = 0
  private grabado = 0
  private subido = 0
  private readonly hash = sha256.create()
  private cola: Promise<void> = Promise.resolve()

  private subida: Promise<Subida>
  private partes: Promise<{ numero: number; etag: string }>[] = []
  private fallo: unknown = null

  constructor(stream: MediaStream, folder: string) {
    this.folder = folder
    const alto = Math.max(...stream.getVideoTracks().map((t) => Math.min(t.getSettings().width ?? 0, t.getSettings().height ?? 0)), 0)
    const opciones: MediaRecorderOptions = {
      videoBitsPerSecond: alto >= 1080 ? 8_000_000 : 5_000_000,
      audioBitsPerSecond: 128_000,
    }
    const tipo = TIPOS.find((t) => MediaRecorder.isTypeSupported(t))
    if (tipo) opciones.mimeType = tipo
    try {
      this.recorder = new MediaRecorder(stream, opciones)
    } catch {
      this.recorder = new MediaRecorder(stream)
    }
    this.tipo = (this.recorder.mimeType || tipo || "video/mp4").split(";")[0]
    const ext = this.tipo.includes("webm") ? "webm" : "mp4"
    this.nombre = `video-${this.inicio.toISOString().slice(0, 19).replace(/[:T]/g, "-")}.${ext}`

    this.recorder.ondataavailable = (e) => {
      if (!e.data || e.data.size === 0) return
      this.trozos.push(e.data)
      this.grabado += e.data.size
      // En orden: la huella se calcula sobre los bytes tal y como van llegando
      this.cola = this.cola.then(() => this.procesar(e.data))
    }

    // La subida se abre ya, mientras se graba el primer trozo
    this.subida = pedirPartes({
      accion: "iniciar",
      filename: this.nombre,
      contentType: this.tipo,
      folder,
      partes: 1,
    }).then((r) => ({ key: r.key, uploadId: r.uploadId, directoBloqueado: false, primeraUrl: r.urls[0] }))
    this.subida.catch((e) => { this.fallo ??= e })
  }

  empezar() {
    this.inicio = new Date()
    this.recorder.start(1000)
  }

  get segundos() {
    return (Date.now() - this.inicio.getTime()) / 1000
  }

  private async procesar(trozo: Blob) {
    this.hash.update(new Uint8Array(await trozo.arrayBuffer()))
    this.pendiente.push(trozo)
    this.pendienteBytes += trozo.size
    while (this.pendienteBytes >= PARTE_EN_VIVO) {
      const junto = new Blob(this.pendiente)
      const resto = junto.slice(PARTE_EN_VIVO)
      this.pendiente = [resto]
      this.pendienteBytes = resto.size
      this.lanzarParte(junto.slice(0, PARTE_EN_VIVO))
    }
  }

  private avanzar = (bytes: number) => {
    this.subido += bytes
    this.onProgreso?.(Math.min(0.99, Math.max(0, this.subido / Math.max(this.grabado, 1))))
  }

  private lanzarParte(parte: Blob) {
    const numero = this.partes.length + 1
    const tarea = (async () => {
      const subida = await this.subida
      const url =
        numero === 1
          ? subida.primeraUrl
          : (await pedirPartes({ accion: "firmar", key: subida.key, uploadId: subida.uploadId, partes: [numero] })).urls[0]
      const etag = await subirParteConReintentos(subida, numero, url, parte, this.avanzar)
      return { numero, etag }
    })()
    tarea.catch((e) => { this.fallo ??= e })
    this.partes.push(tarea)
  }

  private parar(): Promise<void> {
    return new Promise((resolve) => {
      if (this.recorder.state === "inactive") return resolve()
      this.recorder.onstop = () => resolve()
      this.recorder.stop()
    })
  }

  /** Para la grabación y termina de subir lo que falte. */
  async terminar(): Promise<ResultadoGrabacion> {
    const duracionSeg = Math.round(this.segundos)
    await this.parar()
    await this.cola
    if (this.grabado === 0) {
      await this.abortar()
      throw new Error("La grabación ha salido vacía")
    }
    const archivo = new File(this.trozos, this.nombre, { type: this.tipo, lastModified: this.inicio.getTime() })
    const hash = bytesToHex(this.hash.digest())
    if (this.pendienteBytes > 0) this.lanzarParte(new Blob(this.pendiente))

    let url: string
    try {
      if (this.fallo) throw this.fallo
      const etags = await Promise.all(this.partes)
      const subida = await this.subida
      url = (await pedirPartes({ accion: "completar", key: subida.key, uploadId: subida.uploadId, etags })).url
      this.onProgreso?.(1)
    } catch (e) {
      // Si algo falló por el camino el vídeo sigue entero en memoria: se sube de nuevo
      console.warn("La subida en vivo falló, se sube el vídeo completo", e)
      await this.abortar()
      url = await uploadFile(archivo, this.folder, (p) => this.onProgreso?.(p))
    }

    return { url, archivo, hash, duracionSeg, capturadoAt: this.inicio.toISOString() }
  }

  /** Descarta la grabación sin guardar nada. */
  async descartar() {
    this.recorder.ondataavailable = null
    await this.parar()
    await this.abortar()
  }

  private async abortar() {
    const subida = await this.subida.catch(() => null)
    if (subida) await pedirPartes({ accion: "abortar", key: subida.key, uploadId: subida.uploadId }).catch(() => {})
  }
}
