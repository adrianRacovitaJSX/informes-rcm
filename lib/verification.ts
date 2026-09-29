import { prisma } from "@/lib/db"
import { normalizarCodigo } from "@/lib/document-code"
import { TOTAL_ITEMS } from "@/lib/checklist"
import { carTitle, computeStats, type ItemsMap } from "@/lib/report-types"

// Verificación pública de informes. Solo expone lo necesario para comprobar un
// documento: el coche, la matrícula enmascarada, cuándo se emitió, el resultado y la
// huella del PDF. Nunca datos del cliente ni del mecánico.

export type VerificationResult = {
  codigo: string
  vehiculo: string
  matricula: string
  emitidoAt: string
  resultado: { ok: number; atencion: number; mal: number; na: number }
  pdfHash: string
}

/** 4821KLM -> 48**KLM: basta para cotejar con el PDF sin publicar la matrícula entera. */
export function enmascararMatricula(m: string) {
  const v = m.toUpperCase().replace(/[\s-]/g, "")
  if (v.length < 5) return v ? "***" : ""
  return `${v.slice(0, 2)}${"*".repeat(v.length - 5)}${v.slice(-3)}`
}

export async function verifyReport(codigoRaw: string): Promise<VerificationResult | null> {
  const codigo = normalizarCodigo(codigoRaw)
  if (!/^[A-Z]{3}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(codigo)) return null
  const r = await prisma.report.findUnique({
    where: { codigo },
    select: { codigo: true, status: true, marca: true, modelo: true, version: true, matricula: true, items: true, pdfHash: true, pdfGeneradoAt: true },
  })
  // Solo cuentan los informes emitidos: con PDF generado y su huella guardada
  if (!r || r.status !== "COMPLETADO" || !r.pdfHash || !r.pdfGeneradoAt) return null
  return {
    codigo: r.codigo!,
    vehiculo: carTitle(r),
    matricula: enmascararMatricula(r.matricula),
    emitidoAt: r.pdfGeneradoAt.toISOString(),
    resultado: (({ ok, atencion, mal, na }) => ({ ok, atencion, mal, na }))(computeStats((r.items ?? {}) as ItemsMap, TOTAL_ITEMS)),
    pdfHash: r.pdfHash,
  }
}

// Límite de consultas por IP para que no se puedan probar códigos a ciegas.
// Es por instancia del servidor: suficiente como freno, no como garantía.
const WINDOW_MS = 60_000
const MAX_PER_WINDOW = 20
const hits = new Map<string, { count: number; reset: number }>()

export function rateLimited(ip: string) {
  const now = Date.now()
  const h = hits.get(ip)
  if (!h || h.reset < now) {
    hits.set(ip, { count: 1, reset: now + WINDOW_MS })
    if (hits.size > 5000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k)
    return false
  }
  h.count++
  return h.count > MAX_PER_WINDOW
}
