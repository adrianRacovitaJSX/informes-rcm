import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { getToken } from "next-auth/jwt"

const COOKIE = "informes.session-token"

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET,
    cookieName: COOKIE,
    salt: COOKIE,
  })
  const isAuth = !!token
  const isLogin = pathname.startsWith("/login")

  if (isLogin) {
    return isAuth ? NextResponse.redirect(new URL("/", request.url)) : NextResponse.next()
  }
  if (!isAuth) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    }
    const from = encodeURIComponent(pathname + search)
    return NextResponse.redirect(new URL(`/login?from=${from}`, request.url))
  }
  return NextResponse.next()
}

export const config = {
  matcher: [
    // Públicas, sin sesión:
    // - las imágenes de public/ (el optimizador de imágenes las pide sin la cookie)
    // - la verificación de informes (/verificar y /api/verificar)
    "/((?!api/auth|api/verificar|verificar|_next/static|_next/image|offline.html|sw.js|manifest.webmanifest|uploads|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)",
  ],
}
