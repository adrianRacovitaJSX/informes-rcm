"use client"

import { useEffect } from "react"
import { toast } from "sonner"

/** Registra el service worker y avisa cuando hay una versión nueva de la app. */
export function ServiceWorkerProvider() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return
    if (!("serviceWorker" in navigator)) return

    let cancelado = false

    const registrar = async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" })
        if (cancelado) return

        reg.addEventListener("updatefound", () => {
          const nuevo = reg.installing
          if (!nuevo) return
          nuevo.addEventListener("statechange", () => {
            // Solo avisamos si ya había una versión sirviendo la app
            if (nuevo.state === "installed" && navigator.serviceWorker.controller) {
              toast("Hay una versión nueva", {
                duration: Infinity,
                action: {
                  label: "Actualizar",
                  onClick: () => {
                    nuevo.postMessage("SKIP_WAITING")
                    window.location.reload()
                  },
                },
              })
            }
          })
        })
      } catch (e) {
        console.warn("No se pudo registrar el service worker", e)
      }
    }

    registrar()
    return () => { cancelado = true }
  }, [])

  return null
}
