import type { Metadata, Viewport } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import "./globals.css"
import { NextAuthSessionProvider } from "@/components/providers/session-provider"
import { ServiceWorkerProvider } from "@/components/providers/pwa"
import { auth } from "@/lib/auth"
import { Toaster } from "sonner"

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] })
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] })

export const metadata: Metadata = {
  title: { default: "Revisión Coche Madrid · Informes", template: "%s · RCM Informes" },
  description: "Revisión de vehículos usados e informes en PDF para Revisión Coche Madrid.",
  robots: "noindex, nofollow",
  applicationName: "RCM Informes",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "RCM Informes", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: "/icon.png", type: "image/png" },
      { url: "/pwa-192.png", sizes: "192x192", type: "image/png" },
      { url: "/pwa-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
}

export const viewport: Viewport = {
  themeColor: "#0b0b0c",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // La sesión viaja desde el servidor: el nombre del usuario aparece al instante
  const session = await auth()
  return (
    <html lang="es" className="dark" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} min-h-dvh font-sans`}>
        <NextAuthSessionProvider session={session ?? undefined}>{children}</NextAuthSessionProvider>
        <ServiceWorkerProvider />
        <Toaster
          position="top-center"
          richColors
          theme="dark"
          closeButton
          mobileOffset={{ top: "calc(env(safe-area-inset-top) + 12px)" }}
        />
      </body>
    </html>
  )
}
