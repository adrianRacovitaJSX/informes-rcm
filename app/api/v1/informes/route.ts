import { NextResponse, type NextRequest } from "next/server"
import { listReports } from "@/lib/report-service"
import { isCrmRequest, toCrmSummary } from "@/lib/crm-api"

// GET /api/v1/informes — listado para el CRM de Epicars (solo lectura, X-API-Key)
export async function GET(req: NextRequest) {
  if (!isCrmRequest(req)) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  const informes = await listReports()
  return NextResponse.json({ informes: informes.map(toCrmSummary) }, { headers: { "Cache-Control": "no-store" } })
}
