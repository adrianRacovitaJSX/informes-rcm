import type { ItemStatus } from "./checklist"

export type ItemResult = {
  status?: ItemStatus
  note?: string
  extras?: Record<string, string>
}

export type ItemsMap = Record<string, ItemResult>

export type MediaDTO = {
  id: string
  itemId: string | null
  kind: "PHOTO" | "VIDEO"
  url: string
  thumbUrl: string | null
  name: string
  size: number
  hash: string | null
  hashVerificado: boolean
  capturadoAt: string | null
  origenFecha: string
  duracionSeg: number | null
  anchoPx: number | null
  altoPx: number | null
  camara: string
  createdAt: string
}

export type ReportDTO = {
  id: string
  status: "BORRADOR" | "COMPLETADO"
  codigo: string | null
  pdfHash: string | null
  marca: string
  modelo: string
  version: string
  matricula: string
  bastidor: string
  anio: number | null
  km: number | null
  combustible: string
  cambio: string
  color: string
  precio: number | null
  observaciones: string
  items: ItemsMap
  veredicto: string
  resumen: string
  costeReparacion: number | null
  pdfUrl: string | null
  pdfGeneradoAt: string | null
  clienteNombre: string | null
  clienteEmail: string | null
  emailEnviadoAt: string | null
  createdBy: string
  autor?: { name: string; email: string }
  media: MediaDTO[]
  createdAt: string
  updatedAt: string
}

export const VEHICLE_FIELDS = [
  "marca", "modelo", "version", "matricula", "bastidor", "anio", "km", "combustible",
  "cambio", "color", "precio", "observaciones",
] as const

export function carTitle(r: Pick<ReportDTO, "marca" | "modelo" | "version">) {
  return [r.marca, r.modelo, r.version].filter(Boolean).join(" ") || "Vehículo sin datos"
}

export function computeStats(items: ItemsMap, total: number) {
  let ok = 0, atencion = 0, mal = 0, na = 0
  for (const v of Object.values(items)) {
    if (v.status === "ok") ok++
    else if (v.status === "atencion") atencion++
    else if (v.status === "mal") mal++
    else if (v.status === "na") na++
  }
  const revisados = ok + atencion + mal + na
  return { ok, atencion, mal, na, revisados, pendientes: total - revisados, total }
}
