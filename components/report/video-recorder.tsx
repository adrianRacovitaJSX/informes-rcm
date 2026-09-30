"use client"

import { useEffect, useRef, useState } from "react"
import { X, Loader2 } from "lucide-react"
import { fotogramaAJpeg } from "@/lib/client-upload"
import { abrirCamara, DURACION_MAXIMA_SEG, GrabacionEnVivo, type ResultadoGrabacion } from "@/lib/grabacion-en-vivo"

export type VideoGrabado = {
  grabacion: GrabacionEnVivo
  trabajo: Promise<ResultadoGrabacion>
  miniatura: File | null
  anchoPx: number | null
  altoPx: number | null
}

/**
 * Cámara a pantalla completa para grabar vídeo dentro de la app. Al parar se
 * cierra enseguida: lo que queda de subida sigue en la miniatura del punto.
 */
export function VideoRecorder({
  folder,
  onGrabado,
  onCerrar,
  onUsarCamaraDelSistema,
}: {
  folder: string
  onGrabado: (v: VideoGrabado) => void
  onCerrar: () => void
  onUsarCamaraDelSistema: (files: FileList | null) => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const grabacionRef = useRef<GrabacionEnVivo | null>(null)
  const miniaturaRef = useRef<File | null>(null)
  const [estado, setEstado] = useState<"abriendo" | "lista" | "grabando" | "error">("abriendo")
  const [error, setError] = useState("")
  const [segundos, setSegundos] = useState(0)
  const [calidad, setCalidad] = useState("")
  // Para saber en la limpieza si se estaba grabando o terminando una grabación
  const estadoRef = useRef(estado)
  useEffect(() => { estadoRef.current = estado }, [estado])
  const terminandoRef = useRef(false)

  useEffect(() => {
    let cancelado = false
    abrirCamara()
      .then((stream) => {
        if (cancelado) return stream.getTracks().forEach((t) => t.stop())
        streamRef.current = stream
        const ajustes = stream.getVideoTracks()[0]?.getSettings()
        if (ajustes?.width && ajustes?.height) setCalidad(`${Math.min(ajustes.width, ajustes.height)}p`)
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.play().catch(() => {})
        }
        setEstado("lista")
      })
      .catch((e) => {
        if (cancelado) return
        setError(
          e instanceof DOMException && e.name === "NotAllowedError"
            ? "Sin permiso para usar la cámara. Actívalo en los ajustes del navegador o usa la cámara del sistema."
            : "No se pudo abrir la cámara."
        )
        setEstado("error")
      })
    return () => {
      cancelado = true
      if (estadoRef.current === "grabando") grabacionRef.current?.descartar()
      // Si se está cerrando una grabación, la cámara la suelta parar()
      if (!terminandoRef.current) streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  useEffect(() => {
    if (estado !== "grabando") return
    const t = setInterval(() => {
      const s = grabacionRef.current?.segundos ?? 0
      setSegundos(s)
      if (s >= DURACION_MAXIMA_SEG) parar()
    }, 250)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado])

  function empezar() {
    const stream = streamRef.current
    if (!stream) return
    try {
      const grabacion = new GrabacionEnVivo(stream, folder)
      grabacion.empezar()
      grabacionRef.current = grabacion
      miniaturaRef.current = null
      setSegundos(0)
      setEstado("grabando")
      // La miniatura sale de la propia imagen de la cámara, sin releer el vídeo
      setTimeout(() => {
        const v = videoRef.current
        if (v?.videoWidth) fotogramaAJpeg(v, "video-thumb.jpg").then((f) => { miniaturaRef.current = f }).catch(() => {})
      }, 400)
    } catch (e) {
      console.error(e)
      setError("Este navegador no permite grabar vídeo. Usa la cámara del sistema.")
      setEstado("error")
    }
  }

  function parar() {
    const grabacion = grabacionRef.current
    if (!grabacion || estadoRef.current !== "grabando") return
    estadoRef.current = "lista"
    terminandoRef.current = true
    const v = videoRef.current
    const trabajo = grabacion.terminar()
    onGrabado({
      grabacion,
      trabajo,
      miniatura: miniaturaRef.current,
      anchoPx: v?.videoWidth || null,
      altoPx: v?.videoHeight || null,
    })
    grabacionRef.current = null
    // La cámara se suelta cuando MediaRecorder ha entregado el último trozo
    trabajo.catch(() => {}).finally(() => streamRef.current?.getTracks().forEach((t) => t.stop()))
    onCerrar()
  }

  const mm = String(Math.floor(segundos / 60)).padStart(2, "0")
  const ss = String(Math.floor(segundos % 60)).padStart(2, "0")

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black text-white">
      <video ref={videoRef} muted playsInline autoPlay className="absolute inset-0 h-full w-full object-cover" />

      <div className="relative flex items-center justify-between px-4 pt-[max(1rem,calc(env(safe-area-inset-top)+0.5rem))]">
        <button
          type="button"
          onClick={onCerrar}
          disabled={estado === "grabando"}
          className="rounded-full bg-black/50 p-2 disabled:opacity-0"
          aria-label="Cerrar"
        >
          <X className="size-5" />
        </button>
        {estado === "grabando" ? (
          <span className="flex items-center gap-2 rounded-full bg-black/60 px-3 py-1 font-mono text-sm tabular-nums">
            <span className="size-2.5 animate-pulse rounded-full bg-red-500" />
            {mm}:{ss}
          </span>
        ) : null}
        <span className="min-w-9 text-right text-xs font-semibold text-white/70">{calidad}</span>
      </div>

      {estado === "abriendo" ? (
        <div className="relative flex flex-1 items-center justify-center"><Loader2 className="size-7 animate-spin" /></div>
      ) : null}

      {estado === "error" ? (
        <div className="relative flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
          <p className="text-sm text-white/80">{error}</p>
          <label className="cursor-pointer rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black">
            Usar la cámara del sistema
            <input
              type="file"
              accept="video/*"
              capture="environment"
              className="sr-only"
              onChange={(e) => { onUsarCamaraDelSistema(e.target.files); e.target.value = ""; onCerrar() }}
            />
          </label>
        </div>
      ) : (
        <div className="flex-1" />
      )}

      {estado === "lista" || estado === "grabando" ? (
        <div className="relative flex justify-center pb-[max(2rem,calc(env(safe-area-inset-bottom)+1rem))]">
          <button
            type="button"
            onClick={estado === "grabando" ? parar : empezar}
            className="flex size-20 items-center justify-center rounded-full border-4 border-white active:scale-95"
            aria-label={estado === "grabando" ? "Parar" : "Grabar"}
          >
            {estado === "grabando" ? (
              <span className="size-8 rounded-md bg-red-500" />
            ) : (
              <span className="size-16 rounded-full bg-red-500" />
            )}
          </button>
        </div>
      ) : null}
    </div>
  )
}
