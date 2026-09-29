import { NextResponse, type NextRequest } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { getReport } from "@/lib/report-service"
import { renderReportPdf } from "@/lib/pdf/render"
import { deleteFile, saveFile } from "@/lib/storage"
import { generarCodigoDocumento } from "@/lib/document-code"
import { createHash } from "node:crypto"

type Ctx = { params: Promise<{ id: string }> }

// Genera el PDF definitivo, lo guarda y marca el informe como completado
export async function POST(req: NextRequest, { params }: Ctx) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  const { id } = await params
  let informe = await getReport(id)
  if (!informe) return NextResponse.json({ error: "No encontrado" }, { status: 404 })

  // Todo documento emitido lleva código público; los antiguos lo reciben aquí
  if (!informe.codigo) {
    await prisma.report.update({ where: { id }, data: { codigo: generarCodigoDocumento() } })
    informe = (await getReport(id))!
  }

  const origin = process.env.APP_URL ?? req.nextUrl.origin
  const pdf = await renderReportPdf(informe, origin)
  const key = `informes/${id}/RCM-informe-${(informe.matricula || id).replace(/[^a-zA-Z0-9-]/g, "")}-${Date.now()}.pdf`
  const pdfUrl = await saveFile(key, pdf, "application/pdf")
  if (informe.pdfUrl && informe.pdfUrl !== pdfUrl) await deleteFile(informe.pdfUrl)

  await prisma.report.update({
    where: { id },
    data: {
      pdfUrl,
      pdfHash: createHash("sha256").update(pdf).digest("hex"),
      pdfGeneradoAt: new Date(),
      status: "COMPLETADO",
    },
  })

  return NextResponse.json({ informe: await getReport(id) })
}
