import { prisma } from "@/lib/db"
import type { ReportDTO, ItemsMap } from "@/lib/report-types"
import type { Prisma } from "@prisma/client"

const include = {
  autor: { select: { name: true, email: true } },
  media: { orderBy: { createdAt: "asc" as const } },
}

type ReportWithRel = Prisma.ReportGetPayload<{ include: typeof include }>

export function serializeReport(r: ReportWithRel): ReportDTO {
  return {
    ...r,
    items: (r.items ?? {}) as ItemsMap,
    pdfGeneradoAt: r.pdfGeneradoAt?.toISOString() ?? null,
    emailEnviadoAt: r.emailEnviadoAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    media: r.media.map((m) => ({
      ...m,
      capturadoAt: m.capturadoAt?.toISOString() ?? null,
      createdAt: m.createdAt.toISOString(),
    })),
  }
}

export async function getReport(id: string): Promise<ReportDTO | null> {
  const r = await prisma.report.findUnique({ where: { id }, include })
  return r ? serializeReport(r) : null
}

export async function listReports(): Promise<ReportDTO[]> {
  const rows = await prisma.report.findMany({ orderBy: { updatedAt: "desc" }, include })
  return rows.map(serializeReport)
}
