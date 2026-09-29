import { Resend } from "resend"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { brand } from "@/lib/brand"
import { STATUS_META, TOTAL_ITEMS, findItem } from "@/lib/checklist"
import { carTitle, computeStats, type ReportDTO } from "@/lib/report-types"

// Email automático con el informe en PDF adjunto. Se envía con Resend desde una
// dirección del dominio verificado; las respuestas del cliente llegan a contacto@.

const FROM = process.env.EMAIL_FROM ?? `${brand.name} <informes@revisioncochemadrid.es>`
const REPLY_TO = process.env.EMAIL_REPLY_TO ?? brand.email

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!)

export function pdfFileName(r: ReportDTO) {
  return `RCM-informe-${(r.matricula || r.codigo || r.id).replace(/[^a-zA-Z0-9-]/g, "").toUpperCase()}.pdf`
}

/** Asunto, HTML y texto plano del email. Exportado aparte para poder previsualizarlo. */
export function buildInformeEmail(r: ReportDTO, nombre: string, origin: string) {
  const coche = carTitle(r)
  const matricula = r.matricula ? r.matricula.toUpperCase() : ""
  const fecha = new Date(r.pdfGeneradoAt ?? r.updatedAt).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" })
  const stats = computeStats(r.items, TOTAL_ITEMS)
  const verifyUrl = `${origin}/verificar${r.codigo ? `?codigo=${encodeURIComponent(r.codigo)}` : ""}`
  const saludo = nombre.trim().split(/\s+/)[0]

  const incidencias = Object.entries(r.items)
    .filter(([, v]) => v.status === "mal" || v.status === "atencion")
    .map(([id, v]) => ({ item: findItem(id), status: v.status as "mal" | "atencion" }))
    .filter((x) => x.item)
    .sort((a, b) => (a.status === b.status ? 0 : a.status === "mal" ? -1 : 1))
  const destacadas = incidencias.slice(0, 6)

  const subject = `Tu informe de revisión: ${coche}${matricula ? ` (${matricula})` : ""}`

  const tile = (n: number, label: string, color: string) => `
    <td width="25%" style="padding:0 4px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;border-radius:8px;border-left:3px solid ${color};">
        <tr><td style="padding:10px 12px;font-family:Helvetica,Arial,sans-serif;">
          <div style="font-size:22px;font-weight:700;color:${color};line-height:1;">${n}</div>
          <div style="font-size:11px;color:#71717a;margin-top:4px;text-transform:uppercase;letter-spacing:.4px;">${label}</div>
        </td></tr>
      </table>
    </td>`

  const filas = destacadas
    .map(
      ({ item, status }) => `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #e4e4e7;font-family:Helvetica,Arial,sans-serif;">
          <span style="display:inline-block;min-width:64px;text-align:center;padding:3px 8px;border-radius:10px;font-size:11px;font-weight:700;color:#fff;background:${STATUS_META[status].hex};">${STATUS_META[status].short.toUpperCase()}</span>
          <span style="font-size:14px;color:#18181b;margin-left:8px;">${esc(item!.label)}</span>
        </td>
      </tr>`
    )
    .join("")

  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;">
        <tr><td style="background:#0b0a0a;padding:24px 28px;border-bottom:3px solid #F17205;">
          <img src="${origin}/logo.png" width="140" alt="${esc(brand.name)}" style="display:block;border:0;width:140px;height:auto;">
        </td></tr>
        <tr><td style="padding:28px 28px 8px;font-family:Helvetica,Arial,sans-serif;color:#18181b;">
          <p style="margin:0 0 14px;font-size:16px;">Hola${saludo ? ` ${esc(saludo)}` : ""},</p>
          <p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#3f3f46;">
            Te enviamos el informe de la revisión del <b style="color:#18181b;">${esc(coche)}</b>${matricula ? ` (${esc(matricula)})` : ""}, realizada el ${fecha}. Lo tienes completo en el PDF adjunto, con las fotos y los vídeos de cada punto.
          </p>
        </td></tr>
        <tr><td style="padding:8px 24px 4px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
            ${tile(stats.ok, "Correctos", STATUS_META.ok.hex)}${tile(stats.atencion, "Atención", STATUS_META.atencion.hex)}${tile(stats.mal, "Mal", STATUS_META.mal.hex)}${tile(stats.na, "No aplica", STATUS_META.na.hex)}
          </tr></table>
        </td></tr>
        ${
          destacadas.length
            ? `<tr><td style="padding:20px 28px 0;font-family:Helvetica,Arial,sans-serif;">
          <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#18181b;text-transform:uppercase;letter-spacing:.5px;">Incidencias destacadas</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${filas}</table>
          ${incidencias.length > destacadas.length ? `<p style="margin:8px 0 0;font-size:13px;color:#71717a;">Y ${incidencias.length - destacadas.length} más en el informe.</p>` : ""}
        </td></tr>`
            : `<tr><td style="padding:20px 28px 0;font-family:Helvetica,Arial,sans-serif;font-size:15px;color:#3f3f46;">No hemos encontrado incidencias.</td></tr>`
        }
        <tr><td style="padding:24px 28px 8px;font-family:Helvetica,Arial,sans-serif;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;">
            <tr><td style="padding:16px 18px;">
              <p style="margin:0;font-size:13px;color:#9a3412;">Código del documento</p>
              <p style="margin:4px 0 10px;font-size:18px;font-weight:700;letter-spacing:1px;color:#18181b;">${esc(r.codigo ?? "")}</p>
              <p style="margin:0 0 14px;font-size:13px;line-height:1.5;color:#3f3f46;">Cualquiera a quien enseñes el informe (el vendedor, un taller, tu financiera) puede comprobar que es auténtico y que no se ha modificado.</p>
              <a href="${verifyUrl}" style="display:inline-block;background:#F17205;color:#0b0a0a;font-weight:700;font-size:14px;text-decoration:none;padding:11px 20px;border-radius:999px;">Verificar informe</a>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:20px 28px 28px;font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.55;color:#3f3f46;">
          Si tienes cualquier duda sobre el informe, responde a este correo o llámanos al <a href="tel:${brand.phone.replace(/\s+/g, "")}" style="color:#C2410C;font-weight:700;text-decoration:none;">${brand.phone}</a>.<br><br>
          Un saludo,<br><b style="color:#18181b;">${esc(brand.name)}</b>
        </td></tr>
      </table>
      <p style="margin:16px 0 0;font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#a1a1aa;">
        <a href="${brand.web}" style="color:#a1a1aa;">${brand.web.replace(/^https?:\/\//, "")}</a> · ${brand.phone}
      </p>
    </td></tr>
  </table>
</body></html>`

  const text = [
    `Hola${saludo ? ` ${saludo}` : ""},`,
    "",
    `Te enviamos el informe de la revisión del ${coche}${matricula ? ` (${matricula})` : ""}, realizada el ${fecha}. Lo tienes completo en el PDF adjunto.`,
    "",
    `Resultado: ${stats.ok} correctos, ${stats.atencion} de atención, ${stats.mal} mal, ${stats.na} no aplican.`,
    ...(destacadas.length ? ["", "Incidencias destacadas:", ...destacadas.map((d) => `- ${STATUS_META[d.status].short}: ${d.item!.label}`)] : []),
    "",
    `Código del documento: ${r.codigo ?? ""}`,
    `Comprueba que es auténtico en ${verifyUrl}`,
    "",
    `Si tienes cualquier duda, responde a este correo o llámanos al ${brand.phone}.`,
    "",
    `Un saludo,`,
    brand.name,
  ].join("\n")

  return { subject, html, text }
}

async function loadPdf(url: string): Promise<Buffer> {
  if (url.startsWith("/uploads/")) return readFile(path.join(process.cwd(), "public", url))
  const res = await fetch(url, { signal: AbortSignal.timeout(30000), cache: "no-store" })
  if (!res.ok) throw new Error(`No se pudo descargar el PDF (HTTP ${res.status})`)
  return Buffer.from(await res.arrayBuffer())
}

export async function sendInformeEmail(r: ReportDTO, to: { nombre: string; email: string }, origin: string) {
  const key = process.env.RESEND_API_KEY
  if (!key) throw new Error("Falta RESEND_API_KEY en la configuración")
  if (!r.pdfUrl) throw new Error("El informe todavía no tiene PDF")

  const pdf = await loadPdf(r.pdfUrl)
  const { subject, html, text } = buildInformeEmail(r, to.nombre, origin)
  const { data, error } = await new Resend(key).emails.send({
    from: FROM,
    to: [to.email],
    replyTo: REPLY_TO,
    subject,
    html,
    text,
    attachments: [{ filename: pdfFileName(r), content: pdf }],
  })
  if (error) throw new Error(error.message)
  return data?.id ?? null
}
