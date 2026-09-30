"use client"

import { sha256 } from "@noble/hashes/sha2"
import { bytesToHex } from "@noble/hashes/utils"
import { conTiempo, pedirPartes, subirParteConReintentos, uploadFile } from "@/lib/client-upload"
import { calcularHashArchivo } from "@/lib/media-metadata"

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

/** Vídeo ya cerrado y a salvo en memoria; la subida sigue por su lado. */
export type VideoCerrado = {
  archivo: File
  hash: string
  duracionSeg: number
  capturadoAt: string
  /** Se resuelve con la URL pública cuando termina de subir. */
  url: Promise<string>
}

type Subida = { key: string; uploadId: string; directoBloqueado: boolean; primeraUrl: string }

// Límites de las esperas al parar. El MediaRecorder del iPhone a veces no avisa
// de que ha parado o se queda sin entregar el último trozo: se espera lo justo
// y se sigue con lo que haya.
const ESPERA_PARADA_MS = 5000
const ESPERA_TROZOS_MS = 15_000

export class GrabacionEnVivo {
  onProgreso?: (p: number) => void

  private recorder: MediaRecorder
  private readonly tipo: string
  private readonly folder: string
  private readonly nombre: string
  private inicio = new Date()
  private ultimoTrozo = 0
  private pedirDatos: ReturnType<typeof setInterval> | null = null

  private trozos: Blob[] = [] // todo lo grabado: es lo que se guarda pase lo que pase
  private pendiente: Blob[] = []
  private pendienteBytes = 0
  private grabado = 0
  private subido = 0
  private readonly hash = sha256.create()
  private hashRoto = false
  private cola: Promise<void> = Promise.resolve()

  private subida: Promise<Subida>
  private partes: Promise<{ numero: number; etag: string }>[] = []
  private fallo: unknown = null

  /** Con `sencilla` no se fuerza formato ni calidad: es el plan B si la grabadora no responde. */
  constructor(stream: MediaStream, folder: string, { sencilla = false }: { sencilla?: boolean } = {}) {
    this.folder = folder
    const alto = Math.max(...stream.getVideoTracks().map((t) => Math.min(t.getSettings().width ?? 0, t.getSettings().height ?? 0)), 0)
    const opciones: MediaRecorderOptions = sencilla
      ? {}
      : { videoBitsPerSecond: alto >= 1080 ? 8_000_000 : 5_000_000, audioBitsPerSecond: 128_000 }
    const tipo = sencilla ? undefined : TIPOS.find((t) => MediaRecorder.isTypeSupported(t))
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
      this.ultimoTrozo = Date.now()
      this.trozos.push(e.data)
      this.grabado += e.data.size
      // En orden: la huella se calcula sobre los bytes tal y como van llegando
      this.cola = this.cola.then(() => this.procesar(e.data))
    }
    this.recorder.onerror = (e) => {
      console.warn("Error de la grabadora", e)
      this.fallo ??= new Error("La grabadora dio un error")
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
    this.ultimoTrozo = Date.now()
    this.recorder.start(1000)
    // Safari a veces ignora el intervalo de trozos y lo guarda todo hasta el
    // final. Si pasa un rato sin trozos se le piden a mano.
    this.pedirDatos = setInterval(() => {
      if (this.recorder.state === "recording" && Date.now() - this.ultimoTrozo > 2000) {
        try { this.recorder.requestData() } catch {}
      }
    }, 1000)
  }

  get segundos() {
    return (Date.now() - this.inicio.getTime()) / 1000
  }

  /** Bytes que ha entregado la grabadora hasta ahora. */
  get bytesGrabados() {
    return this.grabado
  }

  private async procesar(trozo: Blob) {
    // Primero se trocea para la subida, que no depende de leer el contenido
    this.pendiente.push(trozo)
    this.pendienteBytes += trozo.size
    while (this.pendienteBytes >= PARTE_EN_VIVO) {
      const junto = new Blob(this.pendiente)
      const resto = junto.slice(PARTE_EN_VIVO)
      this.pendiente = [resto]
      this.pendienteBytes = resto.size
      this.lanzarParte(junto.slice(0, PARTE_EN_VIVO))
    }
    if (this.hashRoto) return
    try {
      this.hash.update(new Uint8Array(await conTiempo(trozo.arrayBuffer(), 10_000, "No se pudo leer un trozo")))
    } catch (e) {
      // Se calculará al final sobre el archivo completo
      console.warn(e)
      this.hashRoto = true
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
    if (this.pedirDatos) clearInterval(this.pedirDatos)
    return new Promise<void>((resolve) => {
      if (this.recorder.state === "inactive") return resolve()
      this.recorder.addEventListener("stop", () => resolve(), { once: true })
      setTimeout(() => {
        console.warn("La grabadora no avisó de que había parado; se sigue con lo grabado")
        resolve()
      }, ESPERA_PARADA_MS)
      try {
        this.recorder.stop()
      } catch {
        resolve()
      }
    })
  }

  /**
   * Para la grabación y deja el vídeo cerrado en memoria. Termina siempre en
   * unos segundos; la subida de lo que falte queda en `url`.
   */
  async cerrar(): Promise<VideoCerrado> {
    const duracionSeg = Math.round(this.segundos)
    await this.parar()
    let vivoRoto = false
    try {
      await conTiempo(this.cola, ESPERA_TROZOS_MS, "Los trozos del vídeo no terminaron de procesarse")
    } catch (e) {
      console.warn(e)
      vivoRoto = true
    }
    if (this.grabado === 0) {
      this.abortar()
      throw new Error("La cámara no llegó a grabar nada. Vuelve a grabar el vídeo.")
    }
    const archivo = new File(this.trozos, this.nombre, { type: this.tipo, lastModified: this.inicio.getTime() })
    const hash = this.hashRoto || vivoRoto ? await calcularHashArchivo(archivo) : bytesToHex(this.hash.digest())
    return {
      archivo,
      hash,
      duracionSeg,
      capturadoAt: this.inicio.toISOString(),
      url: this.terminarSubida(archivo, vivoRoto),
    }
  }

  private async terminarSubida(archivo: File, vivoRoto: boolean): Promise<string> {
    try {
      if (vivoRoto) throw new Error("La subida en vivo quedó incompleta")
      if (this.pendienteBytes > 0 || this.partes.length === 0) this.lanzarParte(new Blob(this.pendiente))
      if (this.fallo) throw this.fallo
      const etags = await Promise.all(this.partes)
      const subida = await this.subida
      const { url } = await pedirPartes({ accion: "completar", key: subida.key, uploadId: subida.uploadId, etags })
      this.onProgreso?.(1)
      return url as string
    } catch (e) {
      // El vídeo sigue entero en memoria: se sube de nuevo, completo
      console.warn("La subida en vivo falló, se sube el vídeo completo", e)
      this.abortar()
      this.subido = 0
      return uploadFile(archivo, this.folder, (p) => this.onProgreso?.(p))
    }
  }

  /** Descarta la grabación sin guardar nada. */
  async descartar() {
    this.recorder.ondataavailable = null
    await this.parar()
    this.abortar()
  }

  private abortar() {
    this.subida
      .then((s) => pedirPartes({ accion: "abortar", key: s.key, uploadId: s.uploadId }))
      .catch(() => {})
  }
}
