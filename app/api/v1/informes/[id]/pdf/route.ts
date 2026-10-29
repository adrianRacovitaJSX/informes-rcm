import { NextResponse, type NextRequest } from "next/server"
import { getReport } from "@/lib/report-service"
import { renderReportPdf } from "@/lib/pdf/render"
import { isCrmRequest } from "@/lib/crm-api"

type Ctx = { params: Promise<{ id: string }> }

// GET /api/v1/informes/:id/pdf — PDF del informe para el CRM (X-API-Key).
// Si ya hay un PDF emitido se sirve ese (el que tiene la huella del documento);
// si no, se genera al vuelo como vista previa.
export async function GET(req: NextRequest, { params }: Ctx) {
  if (!isCrmRequest(req)) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  const { id } = await params
  const informe = await getReport(id)
  if (!informe) return NextResponse.json({ error: "No encontrado" }, { status: 404 })

  let pdf: ArrayBuffer | null = null
  if (informe.pdfUrl) {
    const res = await fetch(informe.pdfUrl, { cache: "no-store" }).catch(() => null)
    if (res?.ok) pdf = await res.arrayBuffer()
  }
  if (!pdf) {
    const rendered = await renderReportPdf(informe, process.env.APP_URL || req.nextUrl.origin)
    pdf = new Uint8Array(rendered).buffer as ArrayBuffer
  }

  const filename = `RCM-informe-${informe.codigo || informe.matricula || informe.id}.pdf`
  return new NextResponse(pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  })
}
