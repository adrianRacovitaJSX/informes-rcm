import { timingSafeEqual } from "node:crypto"
import type { NextRequest } from "next/server"
import { CHECKLIST, STATUS_META, TOTAL_ITEMS, type ItemStatus } from "@/lib/checklist"
import { carTitle, type ReportDTO } from "@/lib/report-types"

// API de solo lectura para el CRM de Epicars.
// Se autentica con la cabecera X-API-Key, que debe coincidir con CRM_API_KEY.

export function isCrmRequest(req: NextRequest) {
  const expected = process.env.CRM_API_KEY
  const given = req.headers.get("x-api-key")
  if (!expected || !given) return false
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

function counts(report: ReportDTO) {
  const c = { ok: 0, atencion: 0, mal: 0, na: 0 }
  for (const r of Object.values(report.items)) if (r?.status) c[r.status as ItemStatus]++
  const revisados = c.ok + c.atencion + c.mal + c.na
  return { ...c, revisados, pendientes: Math.max(0, TOTAL_ITEMS - revisados), total: TOTAL_ITEMS }
}

/** Resumen para el listado del CRM */
export function toCrmSummary(report: ReportDTO) {
  const portada = report.media.find((m) => m.kind === "PHOTO" && !m.itemId) ?? report.media.find((m) => m.kind === "PHOTO")
  return {
    id: report.id,
    codigo: report.codigo,
    estado: report.status,
    titulo: carTitle(report),
    marca: report.marca,
    modelo: report.modelo,
    version: report.version,
    matricula: report.matricula,
    anio: report.anio,
    km: report.km,
    combustible: report.combustible,
    cambio: report.cambio,
    precio: report.precio,
    veredicto: report.veredicto || null,
    costeReparacion: report.costeReparacion,
    stats: counts(report),
    tienePdf: Boolean(report.pdfUrl),
    pdfGeneradoAt: report.pdfGeneradoAt,
    clienteNombre: report.clienteNombre,
    emailEnviadoAt: report.emailEnviadoAt,
    mecanico: report.autor?.name ?? null,
    portada: portada ? portada.thumbUrl || portada.url : null,
    fotos: report.media.filter((m) => m.kind === "PHOTO").length,
    videos: report.media.filter((m) => m.kind === "VIDEO").length,
    createdAt: report.createdAt,
    updatedAt: report.updatedAt,
  }
}

const mediaOf = (m: ReportDTO["media"][number]) => ({
  id: m.id,
  kind: m.kind,
  url: m.url,
  thumbUrl: m.thumbUrl,
  name: m.name,
  capturadoAt: m.capturadoAt,
  duracionSeg: m.duracionSeg,
})

/** Informe completo, con los puntos de la revisión ya resueltos (títulos, estados, notas y fotos) */
export function toCrmDetail(report: ReportDTO) {
  return {
    ...toCrmSummary(report),
    bastidor: report.bastidor,
    color: report.color,
    observaciones: report.observaciones,
    resumen: report.resumen,
    secciones: CHECKLIST.map((s) => ({
      id: s.id,
      titulo: s.title,
      items: s.items.map((item) => {
        const r = report.items[item.id] ?? {}
        return {
          id: item.id,
          label: item.label,
          status: r.status ?? null,
          statusLabel: r.status ? STATUS_META[r.status].label : "Sin revisar",
          nota: r.note ?? "",
          extras: (item.extras ?? [])
            .map((e) => ({ label: e.label, valor: r.extras?.[e.key] ? `${r.extras[e.key]}${e.unit ? ` ${e.unit}` : ""}` : "" }))
            .filter((e) => e.valor),
          media: report.media.filter((m) => m.itemId === item.id).map(mediaOf),
        }
      }),
    })),
    fotosGenerales: report.media.filter((m) => !m.itemId).map(mediaOf),
  }
}
