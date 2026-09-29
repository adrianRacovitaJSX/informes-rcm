import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { buildKey, presignUpload, r2Enabled, saveFile } from "@/lib/storage"

const MAX_SIZE = 200 * 1024 * 1024 // 200 MB (vídeos)

const presignSchema = z.object({
  filename: z.string().min(1),
  contentType: z.string().min(1),
  folder: z.string().regex(/^[a-z0-9/_-]+$/).default("media"),
})

/**
 * POST JSON  → devuelve una URL firmada para subir directamente a R2.
 *              Si R2 no está configurado responde { direct: false } y el cliente
 *              sube el archivo por el servidor (multipart).
 * POST multipart → sube el archivo a través del servidor.
 */
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const contentType = req.headers.get("content-type") ?? ""

  if (contentType.includes("application/json")) {
    const parsed = presignSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: "Datos no válidos" }, { status: 400 })
    if (!r2Enabled) return NextResponse.json({ direct: false })
    const key = buildKey(parsed.data.folder, parsed.data.filename)
    const { url, publicUrl } = await presignUpload(key, parsed.data.contentType)
    return NextResponse.json({ direct: true, uploadUrl: url, url: publicUrl })
  }

  const form = await req.formData()
  const file = form.get("file")
  const folder = String(form.get("folder") ?? "media")
  if (!(file instanceof File)) return NextResponse.json({ error: "Falta el archivo" }, { status: 400 })
  if (file.size > MAX_SIZE) return NextResponse.json({ error: "Archivo demasiado grande (máx. 200 MB)" }, { status: 413 })
  if (!/^[a-z0-9/_-]+$/.test(folder)) return NextResponse.json({ error: "Carpeta no válida" }, { status: 400 })

  const key = buildKey(folder, file.name || "archivo")
  const url = await saveFile(key, Buffer.from(await file.arrayBuffer()), file.type || "application/octet-stream")
  return NextResponse.json({ url })
}
