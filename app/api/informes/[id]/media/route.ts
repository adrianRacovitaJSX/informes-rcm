import { NextResponse, type NextRequest } from "next/server"
import { createHash } from "node:crypto"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { deleteFile } from "@/lib/storage"

type Ctx = { params: Promise<{ id: string }> }

// Por encima de este tamaño no se descarga el archivo para comprobar la huella
const LIMITE_VERIFICACION = 12 * 1024 * 1024

const schema = z.object({
  itemId: z.string().nullable(),
  kind: z.enum(["PHOTO", "VIDEO"]),
  url: z.string().min(1),
  thumbUrl: z.string().nullable().optional(),
  name: z.string().default(""),
  size: z.number().int().nonnegative().default(0),
  hash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  capturadoAt: z.string().datetime().nullable().optional(),
  origenFecha: z.enum(["exif", "archivo", "desconocido"]).optional(),
  camara: z.string().max(120).optional(),
  anchoPx: z.number().int().positive().nullable().optional(),
  altoPx: z.number().int().positive().nullable().optional(),
  duracionSeg: z.number().int().nonnegative().nullable().optional(),
})

function ipDeLaPeticion(req: NextRequest) {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "desconocida"
  )
}

/**
 * Registra un archivo ya subido y guarda con él los datos que permiten
 * demostrar después que pertenece a esa revisión: su huella, cuándo se tomó,
 * con qué dispositivo, quién lo subió y desde dónde.
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  const { id } = await params
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Datos no válidos" }, { status: 400 })
  const datos = parsed.data

  const report = await prisma.report.findUnique({ where: { id }, select: { id: true } })
  if (!report) return NextResponse.json({ error: "No encontrado" }, { status: 404 })

  // Para los archivos pequeños el servidor comprueba él mismo la huella
  let hashVerificado = false
  if (datos.hash && datos.size > 0 && datos.size <= LIMITE_VERIFICACION) {
    try {
      const url = datos.url.startsWith("/") ? new URL(datos.url, req.nextUrl.origin).toString() : datos.url
      const res = await fetch(url, { signal: AbortSignal.timeout(20000), cache: "no-store" })
      if (res.ok) {
        const real = createHash("sha256").update(Buffer.from(await res.arrayBuffer())).digest("hex")
        hashVerificado = real === datos.hash
        if (!hashVerificado) console.warn("La huella del archivo no coincide con la enviada", datos.url)
      }
    } catch (e) {
      console.warn("No se pudo verificar la huella del archivo", e)
    }
  }

  const media = await prisma.media.create({
    data: {
      reportId: id,
      itemId: datos.itemId,
      kind: datos.kind,
      url: datos.url,
      thumbUrl: datos.thumbUrl ?? null,
      name: datos.name,
      size: datos.size,
      hash: datos.hash ?? null,
      hashVerificado,
      capturadoAt: datos.capturadoAt ? new Date(datos.capturadoAt) : null,
      origenFecha: datos.origenFecha ?? "desconocido",
      camara: datos.camara ?? "",
      anchoPx: datos.anchoPx ?? null,
      altoPx: datos.altoPx ?? null,
      duracionSeg: datos.duracionSeg ?? null,
      subidoPor: session.user.id as string,
      ip: ipDeLaPeticion(req),
      userAgent: (req.headers.get("user-agent") ?? "").slice(0, 400),
    },
  })

  return NextResponse.json(
    {
      media: {
        ...media,
        capturadoAt: media.capturadoAt?.toISOString() ?? null,
        createdAt: media.createdAt.toISOString(),
      },
    },
    { status: 201 }
  )
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  const { id } = await params
  const mediaId = req.nextUrl.searchParams.get("mediaId")
  if (!mediaId) return NextResponse.json({ error: "Falta mediaId" }, { status: 400 })

  const media = await prisma.media.findFirst({ where: { id: mediaId, reportId: id } })
  if (!media) return NextResponse.json({ error: "No encontrado" }, { status: 404 })

  await prisma.media.delete({ where: { id: mediaId } })
  await deleteFile(media.url)
  if (media.thumbUrl) await deleteFile(media.thumbUrl)
  return NextResponse.json({ ok: true })
}
