import { NextResponse, type NextRequest } from "next/server"
import { auth } from "@/lib/auth"
import { getReport } from "@/lib/report-service"
import { renderReportPdf } from "@/lib/pdf/render"

type Ctx = { params: Promise<{ id: string }> }

// Vista previa del PDF generada al vuelo (no se guarda)
export async function GET(req: NextRequest, { params }: Ctx) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  const { id } = await params
  const informe = await getReport(id)
  if (!informe) return NextResponse.json({ error: "No encontrado" }, { status: 404 })
  const pdf = await renderReportPdf(informe, req.nextUrl.origin)
  const download = req.nextUrl.searchParams.get("download") === "1"
  const filename = `RCM-informe-${informe.matricula || informe.id}.pdf`
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  })
}
