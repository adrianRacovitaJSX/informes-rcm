import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import {
  abortarSubidaPorPartes,
  buildKey,
  completarSubidaPorPartes,
  firmarParte,
  iniciarSubidaPorPartes,
  r2Enabled,
} from "@/lib/storage"

// Coordina la subida por partes de los archivos grandes, sobre todo vídeos.
const schema = z.discriminatedUnion("accion", [
  z.object({
    accion: z.literal("iniciar"),
    filename: z.string().min(1),
    contentType: z.string().min(1),
    folder: z.string().regex(/^[a-z0-9/_-]+$/),
    partes: z.number().int().min(1).max(10000),
  }),
  z.object({
    accion: z.literal("firmar"),
    key: z.string().min(1),
    uploadId: z.string().min(1),
    partes: z.array(z.number().int().min(1).max(10000)).min(1).max(100),
  }),
  z.object({
    accion: z.literal("completar"),
    key: z.string().min(1),
    uploadId: z.string().min(1),
    etags: z.array(z.object({ numero: z.number().int().min(1), etag: z.string().min(1) })).min(1),
  }),
  z.object({
    accion: z.literal("abortar"),
    key: z.string().min(1),
    uploadId: z.string().min(1),
  }),
])

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  if (!r2Enabled) return NextResponse.json({ error: "Almacenamiento no configurado" }, { status: 409 })

  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Datos no válidos" }, { status: 400 })
  const datos = parsed.data

  try {
    if (datos.accion === "iniciar") {
      const key = buildKey(datos.folder, datos.filename)
      const uploadId = await iniciarSubidaPorPartes(key, datos.contentType)
      const urls = await Promise.all(
        Array.from({ length: datos.partes }, (_, i) => firmarParte(key, uploadId, i + 1))
      )
      return NextResponse.json({ key, uploadId, urls })
    }

    if (datos.accion === "firmar") {
      const urls = await Promise.all(datos.partes.map((n) => firmarParte(datos.key, datos.uploadId, n)))
      return NextResponse.json({ urls })
    }

    if (datos.accion === "completar") {
      const url = await completarSubidaPorPartes(
        datos.key,
        datos.uploadId,
        datos.etags.map((p) => ({ PartNumber: p.numero, ETag: p.etag }))
      )
      return NextResponse.json({ url })
    }

    await abortarSubidaPorPartes(datos.key, datos.uploadId)
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error("Error en la subida por partes:", e)
    return NextResponse.json({ error: "Error en la subida por partes" }, { status: 500 })
  }
}
