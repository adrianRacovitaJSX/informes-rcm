import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { listReports, getReport } from "@/lib/report-service"
import { generarCodigoDocumento } from "@/lib/document-code"

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  const informes = await listReports()
  return NextResponse.json({ informes })
}

export async function POST() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  const created = await prisma.report.create({
    data: { createdBy: session.user.id, codigo: generarCodigoDocumento() },
  })
  const informe = await getReport(created.id)
  return NextResponse.json({ informe }, { status: 201 })
}
