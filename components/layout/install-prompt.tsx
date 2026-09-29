"use client"

import { useEffect, useState } from "react"
import { Download, Share, SquarePlus, X } from "lucide-react"
import { Button } from "@/components/ui/button"

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }

const OCULTO = "rcm-install-oculto"

function esStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

/** Invita a instalar la app en el móvil. En Android usa el diálogo del navegador;
 *  en iPhone explica el paso manual, que es el único que permite Safari. */
export function InstallPrompt() {
  const [evento, setEvento] = useState<InstallEvent | null>(null)
  const [ios, setIos] = useState(false)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    let oculto = false
    try { oculto = localStorage.getItem(OCULTO) === "1" } catch { /* modo privado */ }
    if (esStandalone() || oculto) return

    // En iPhone no existe el diálogo de instalación, así que se muestra la ayuda
    // manual. Se difiere un tick para no encadenar renders desde el efecto.
    const esIos = /iphone|ipad|ipod/i.test(navigator.userAgent)
    const esSafari = /safari/i.test(navigator.userAgent) && !/crios|fxios|edgios/i.test(navigator.userAgent)
    const aviso = esIos && esSafari ? setTimeout(() => { setIos(true); setVisible(true) }, 0) : undefined

    const onPrompt = (e: Event) => {
      e.preventDefault()
      setEvento(e as InstallEvent)
      setVisible(true)
    }
    const onInstalada = () => setVisible(false)

    window.addEventListener("beforeinstallprompt", onPrompt)
    window.addEventListener("appinstalled", onInstalada)
    return () => {
      if (aviso) clearTimeout(aviso)
      window.removeEventListener("beforeinstallprompt", onPrompt)
      window.removeEventListener("appinstalled", onInstalada)
    }
  }, [])

  if (!visible) return null

  const cerrar = () => {
    setVisible(false)
    try { localStorage.setItem(OCULTO, "1") } catch { /* modo privado */ }
  }

  const instalar = async () => {
    if (!evento) return
    await evento.prompt()
    await evento.userChoice
    setEvento(null)
    setVisible(false)
  }

  return (
    <div className="relative mb-4 flex items-start gap-3 rounded-2xl border border-primary/25 bg-primary/5 p-3.5">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
        <Download className="size-5" />
      </div>
      <div className="min-w-0 flex-1 pr-5">
        <p className="text-sm font-semibold">Instala la app en el móvil</p>
        {ios ? (
          <p className="mt-0.5 flex flex-wrap items-center gap-1 text-xs leading-relaxed text-muted-foreground">
            Pulsa <Share className="inline size-3.5" /> Compartir y luego
            <span className="inline-flex items-center gap-1 font-medium text-foreground/80">
              <SquarePlus className="size-3.5" /> Añadir a pantalla de inicio
            </span>
          </p>
        ) : (
          <>
            <p className="mt-0.5 text-xs text-muted-foreground">Se abre a pantalla completa y entras de un toque.</p>
            <Button size="sm" onClick={instalar} className="mt-2">Instalar</Button>
          </>
        )}
      </div>
      <button
        onClick={cerrar}
        className="absolute right-2 top-2 rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
        aria-label="Cerrar"
      >
        <X className="size-4" />
      </button>
    </div>
  )
}
