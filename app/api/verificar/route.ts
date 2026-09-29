import { NextResponse, type NextRequest } from "next/server"
import { rateLimited, verifyReport } from "@/lib/verification"

// Pública (sin sesión): la usa la página /verificar
export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "desconocida"
  if (rateLimited(ip)) {
    return NextResponse.json({ error: "Demasiadas consultas. Espera un minuto y vuelve a probar." }, { status: 429 })
  }
  const codigo = req.nextUrl.searchParams.get("codigo") ?? ""
  const informe = await verifyReport(codigo)
  if (!informe) return NextResponse.json({ encontrado: false }, { status: 404, headers: { "Cache-Control": "no-store" } })
  return NextResponse.json({ encontrado: true, informe }, { headers: { "Cache-Control": "no-store" } })
}
