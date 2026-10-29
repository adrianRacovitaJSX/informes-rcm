import { NextResponse, type NextRequest } from "next/server"
import { getReport } from "@/lib/report-service"
import { isCrmRequest, toCrmDetail } from "@/lib/crm-api"

type Ctx = { params: Promise<{ id: string }> }

// GET /api/v1/informes/:id — informe completo para el CRM (solo lectura, X-API-Key)
export async function GET(req: NextRequest, { params }: Ctx) {
  if (!isCrmRequest(req)) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  const { id } = await params
  const informe = await getReport(id)
  if (!informe) return NextResponse.json({ error: "No encontrado" }, { status: 404 })
  return NextResponse.json({ informe: toCrmDetail(informe) }, { headers: { "Cache-Control": "no-store" } })
}
