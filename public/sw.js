/* Service worker de RCM Informes.
   Objetivos: que la app se pueda instalar, abra rápido y avise con una pantalla
   propia cuando el taller se queda sin cobertura. Nunca cachea la API ni los
   archivos subidos: los datos del informe siempre salen de la red. */

const VERSION = "v3"
const STATIC_CACHE = `rcm-static-${VERSION}`
const PAGES_CACHE = `rcm-pages-${VERSION}`
const OFFLINE_URL = "/offline.html"

const PRECACHE = [
  OFFLINE_URL,
  "/logo.png",
  "/logo-header.png",
  "/pwa-192.png",
  "/apple-touch-icon.png",
  "/manifest.webmanifest",
]

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== STATIC_CACHE && k !== PAGES_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting()
})

function esEstatico(url) {
  return url.pathname.startsWith("/_next/static/") || /\.(png|svg|ico|woff2?)$/.test(url.pathname)
}

self.addEventListener("fetch", (event) => {
  const { request } = event
  if (request.method !== "GET") return

  const url = new URL(request.url)
  // Solo se gestiona el propio dominio. Las fotos y los PDF viven en Cloudflare
  // y la API debe ir siempre a la red.
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/uploads/")) return

  // Navegación: red primero, y si no hay conexión se muestra la pantalla sin conexión
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(request)
          const cache = await caches.open(PAGES_CACHE)
          cache.put(request, res.clone())
          return res
        } catch {
          const cache = await caches.open(PAGES_CACHE)
          const guardada = await cache.match(request)
          if (guardada) return guardada
          const estatico = await caches.open(STATIC_CACHE)
          return (await estatico.match(OFFLINE_URL)) ?? Response.error()
        }
      })()
    )
    return
  }

  // Recursos estáticos: caché primero, con actualización en segundo plano
  if (esEstatico(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(STATIC_CACHE)
        const guardada = await cache.match(request)
        if (guardada) return guardada
        try {
          const res = await fetch(request)
          if (res.ok) cache.put(request, res.clone())
          return res
        } catch {
          return guardada ?? Response.error()
        }
      })()
    )
  }
})
