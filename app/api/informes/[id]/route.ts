import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { getReport } from "@/lib/report-service"
import { deleteFile } from "@/lib/storage"

type Ctx = { params: Promise<{ id: string }> }

const intOrNull = z.union([z.number().int(), z.null()]).optional()
const str = z.string().max(2000).optional()

const patchSchema = z.object({
  marca: str, modelo: str, version: str, matricula: str, bastidor: str,
  anio: intOrNull, km: intOrNull, precio: intOrNull, costeReparacion: intOrNull,
  combustible: str, cambio: str, color: str,
  observaciones: z.string().max(5000).optional(),
  resumen: z.string().max(5000).optional(),
  veredicto: z.enum(["", "APTO", "CON_RESERVAS", "NO_APTO"]).optional(),
  items: z
    .record(
      z.string(),
      z.object({
        status: z.enum(["ok", "atencion", "mal", "na"]).optional(),
        note: z.string().max(2000).optional(),
        extras: z.record(z.string(), z.string().max(500)).optional(),
      })
    )
    .optional(),
})

export async function GET(_req: NextRequest, { params }: Ctx) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  const { id } = await params
  const informe = await getReport(id)
  if (!informe) return NextResponse.json({ error: "No encontrado" }, { status: 404 })
  return NextResponse.json({ informe })
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  const { id } = await params
  const body = patchSchema.safeParse(await req.json().catch(() => null))
  if (!body.success) {
    return NextResponse.json({ error: "Datos no válidos", detalles: body.error.flatten() }, { status: 400 })
  }
  const existing = await prisma.report.findUnique({ where: { id }, select: { items: true } })
  if (!existing) return NextResponse.json({ error: "No encontrado" }, { status: 404 })

  const { items, ...rest } = body.data
  // Los ítems se fusionan (el móvil envía solo los que cambian)
  const mergedItems = items ? { ...(existing.items as object), ...items } : undefined

  await prisma.report.update({
    where: { id },
    data: { ...rest, ...(mergedItems ? { items: mergedItems } : {}) },
  })
  const informe = await getReport(id)
  return NextResponse.json({ informe })
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  const { id } = await params
  const report = await prisma.report.findUnique({ where: { id }, include: { media: true } })
  if (!report) return NextResponse.json({ error: "No encontrado" }, { status: 404 })
  await Promise.all([
    ...report.media.flatMap((m) => [deleteFile(m.url), ...(m.thumbUrl ? [deleteFile(m.thumbUrl)] : [])]),
    ...(report.pdfUrl ? [deleteFile(report.pdfUrl)] : []),
  ])
  await prisma.report.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
