import { NextResponse, type NextRequest } from "next/server"
import { auth } from "@/lib/auth"
import { r2Enabled, subirParteDesdeServidor } from "@/lib/storage"

export const maxDuration = 300

const MAX_PARTE = 12 * 1024 * 1024

/**
 * Recibe una parte de un archivo grande y la reenvía a R2. Es el camino de
 * repuesto cuando el navegador no puede subir directo, por ejemplo si al
 * bucket le falta la configuración de CORS. Cada petición es pequeña, así que
 * no se atraganta como una subida de golpe.
 */
export async function PUT(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  if (!r2Enabled) return NextResponse.json({ error: "Almacenamiento no configurado" }, { status: 409 })

  const { searchParams } = req.nextUrl
  const key = searchParams.get("key")
  const uploadId = searchParams.get("uploadId")
  const numero = Number(searchParams.get("numero"))

  if (!key || !uploadId || !Number.isInteger(numero) || numero < 1) {
    return NextResponse.json({ error: "Faltan datos de la parte" }, { status: 400 })
  }

  const cuerpo = Buffer.from(await req.arrayBuffer())
  if (cuerpo.length === 0) return NextResponse.json({ error: "Parte vacía" }, { status: 400 })
  if (cuerpo.length > MAX_PARTE) return NextResponse.json({ error: "Parte demasiado grande" }, { status: 413 })

  try {
    const etag = await subirParteDesdeServidor(key, uploadId, numero, cuerpo)
    return NextResponse.json({ etag })
  } catch (e) {
    console.error("Error subiendo una parte a R2:", e)
    return NextResponse.json({ error: "No se pudo guardar la parte" }, { status: 500 })
  }
}
