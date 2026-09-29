import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { getReport } from "@/lib/report-service"
import { sendInformeEmail } from "@/lib/email"
import { brand } from "@/lib/brand"

type Ctx = { params: Promise<{ id: string }> }

const schema = z.object({
  nombre: z.string().trim().min(1, "Escribe el nombre del cliente").max(120),
  email: z.string().trim().toLowerCase().email("El email no es válido").max(200),
})

// Envía al cliente el informe con el PDF adjunto y guarda a quién y cuándo se envió
export async function POST(req: NextRequest, { params }: Ctx) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  const { id } = await params

  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos no válidos" }, { status: 400 })
  const { nombre, email } = parsed.data

  const informe = await getReport(id)
  if (!informe) return NextResponse.json({ error: "No encontrado" }, { status: 404 })
  if (!informe.pdfUrl) return NextResponse.json({ error: "Genera el PDF antes de enviarlo" }, { status: 409 })

  // El nombre y el email se guardan aunque el envío falle, para no tener que volver a escribirlos
  await prisma.report.update({ where: { id }, data: { clienteNombre: nombre, clienteEmail: email } })

  try {
    // Enlaces e imágenes del email con la dirección pública: el cliente no puede abrir localhost
    await sendInformeEmail(informe, { nombre, email }, brand.app)
  } catch (e) {
    const error = e instanceof Error ? e.message : "Error desconocido"
    console.error("Error enviando el informe por email:", error)
    return NextResponse.json({ error: `No se pudo enviar: ${error}`, informe: await getReport(id) }, { status: 502 })
  }

  await prisma.report.update({ where: { id }, data: { emailEnviadoAt: new Date() } })
  return NextResponse.json({ informe: await getReport(id) })
}
