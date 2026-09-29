import { Resend } from "resend"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { brand } from "@/lib/brand"
import { STATUS_META, TOTAL_ITEMS, findItem } from "@/lib/checklist"
import { carTitle, computeStats, type ReportDTO } from "@/lib/report-types"
import { C, button, esc, layout, paragraph } from "@/lib/email-layout"

// Email automático con el informe en PDF adjunto. Sale de no-reply@ (dominio verificado
// en Resend); las respuestas del cliente llegan a contacto@.

const FROM = process.env.EMAIL_FROM ?? `${brand.name} <no-reply@revisioncochemadrid.es>`
const REPLY_TO = process.env.EMAIL_REPLY_TO ?? brand.email
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"

export function pdfFileName(r: ReportDTO) {
  return `RCM-informe-${(r.matricula || r.codigo || r.id).replace(/[^a-zA-Z0-9-]/g, "").toUpperCase()}.pdf`
}

/** Asunto, HTML y texto plano del email. `appBase` es la dirección pública de la app (verificación y logo). */
export function buildInformeEmail(r: ReportDTO, nombre: string, appBase: string) {
  const coche = carTitle(r)
  const matricula = r.matricula ? r.matricula.toUpperCase() : ""
  const fecha = new Date(r.pdfGeneradoAt ?? r.updatedAt).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" })
  const stats = computeStats(r.items, TOTAL_ITEMS)
  const verifyUrl = `${appBase}/verificar${r.codigo ? `?codigo=${encodeURIComponent(r.codigo)}` : ""}`
  const saludo = nombre.trim().split(/\s+/)[0]

  const incidencias = Object.entries(r.items)
    .filter(([, v]) => v.status === "mal" || v.status === "atencion")
    .map(([id, v]) => ({ item: findItem(id), status: v.status as "mal" | "atencion", note: v.note ?? "" }))
    .filter((x) => x.item)
    .sort((a, b) => (a.status === b.status ? 0 : a.status === "mal" ? -1 : 1))
  const destacadas = incidencias.slice(0, 6)

  const subject = `Tu informe de revisión: ${coche}${matricula ? ` (${matricula})` : ""}`

  // Veredicto en una línea, arriba del todo: lo primero que quiere saber el cliente
  const veredicto =
    stats.mal > 0
      ? { color: STATUS_META.mal.hex, bg: "#fef2f2", border: "#fecaca", text: `${stats.mal} ${stats.mal === 1 ? "punto está mal" : "puntos están mal"} y ${stats.atencion} ${stats.atencion === 1 ? "requiere" : "requieren"} atención.` }
      : stats.atencion > 0
        ? { color: STATUS_META.atencion.hex, bg: "#fffbeb", border: "#fde68a", text: `Ningún punto está mal. ${stats.atencion} ${stats.atencion === 1 ? "requiere" : "requieren"} atención.` }
        : { color: STATUS_META.ok.hex, bg: "#f0fdf4", border: "#bbf7d0", text: "No hemos encontrado incidencias." }

  const tile = (n: number, label: string, color: string) => `
    <td width="25%" style="padding:0 4px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.soft};border-radius:12px;">
        <tr><td align="center" style="padding:14px 6px;font-family:${FONT};">
          <div style="font-size:26px;font-weight:800;color:${color};line-height:1;">${n}</div>
          <div style="font-size:11px;color:${C.mute};margin-top:6px;text-transform:uppercase;letter-spacing:.5px;">${label}</div>
        </td></tr>
      </table>
    </td>`

  const filas = destacadas
    .map(
      ({ item, status, note }, i) => `
      <tr><td style="padding:12px 0;${i ? `border-top:1px solid ${C.line};` : ""}font-family:${FONT};">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td valign="top" style="padding-right:12px;"><span style="display:inline-block;width:74px;text-align:center;padding:5px 0;border-radius:999px;font-size:11px;font-weight:700;color:#fff;background:${STATUS_META[status].hex};">${STATUS_META[status].short.toUpperCase()}</span></td>
          <td valign="top">
            <div style="font-size:15px;font-weight:600;color:${C.text};line-height:1.35;">${esc(item!.label)}</div>
            ${note ? `<div style="font-size:13px;color:${C.mute};line-height:1.45;margin-top:3px;">${esc(note)}</div>` : ""}
          </td>
        </tr></table>
      </td></tr>`
    )
    .join("")

  const content = [
    paragraph(`Hola${saludo ? ` ${esc(saludo)}` : ""},`),
    paragraph(
      `Te enviamos el informe de la revisión del <b style="color:${C.text};">${esc(coche)}</b>${matricula ? ` (${esc(matricula)})` : ""}, realizada el ${fecha}. Lo tienes completo en el PDF adjunto, con las fotos y los vídeos de cada punto.`
    ),
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${veredicto.bg};border:1px solid ${veredicto.border};border-radius:14px;"><tr><td style="padding:14px 18px;font-family:${FONT};font-size:15px;font-weight:700;color:${veredicto.color};">${veredicto.text}</td></tr></table>`,
    `<div style="height:14px;line-height:14px;">&nbsp;</div>`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 -4px;"><tr>${tile(stats.ok, "Correctos", STATUS_META.ok.hex)}${tile(stats.atencion, "Atención", STATUS_META.atencion.hex)}${tile(stats.mal, "Mal", STATUS_META.mal.hex)}${tile(stats.na, "No aplica", STATUS_META.na.hex)}</tr></table>`,
    destacadas.length
      ? `<div style="height:26px;line-height:26px;">&nbsp;</div>
         <p style="margin:0 0 4px;font-family:${FONT};font-size:12px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:${C.mute};">Incidencias destacadas</p>
         <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${filas}</table>
         ${incidencias.length > destacadas.length ? `<p style="margin:6px 0 0;font-family:${FONT};font-size:13px;color:${C.mute};">Y ${incidencias.length - destacadas.length} más en el informe.</p>` : ""}`
      : "",
    `<div style="height:26px;line-height:26px;">&nbsp;</div>`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.ink};border-radius:14px;"><tr><td style="padding:20px 22px;font-family:${FONT};">
      <div style="font-size:12px;letter-spacing:1.2px;text-transform:uppercase;color:#a8a29e;">Código del documento</div>
      <div style="font-size:22px;font-weight:800;letter-spacing:1.5px;color:#ffffff;margin:6px 0 10px;">${esc(r.codigo ?? "")}</div>
      <div style="font-size:14px;line-height:1.55;color:#d6d3d1;margin-bottom:16px;">Cualquiera a quien enseñes el informe (el vendedor, un taller, tu financiera) puede comprobar que es auténtico y que no se ha modificado.</div>
      ${button(verifyUrl, "Verificar informe")}
    </td></tr></table>`,
    `<div style="height:24px;line-height:24px;">&nbsp;</div>`,
    paragraph(
      `¿Dudas sobre algún punto? Responde a este correo o llámanos al <a href="tel:${brand.phone.replace(/\s+/g, "")}" style="color:${C.brandDark};font-weight:700;text-decoration:none;">${brand.phone}</a> y te lo explicamos.`
    ),
    paragraph(`Un saludo,<br><b style="color:${C.text};">El equipo de ${esc(brand.name)}</b>`),
  ].join("")

  const html = layout({
    preheader: `${veredicto.text} El informe completo va adjunto en PDF.`,
    eyebrow: "Informe de revisión",
    title: `Tu informe del ${coche} está listo`,
    content,
    logoUrl: `${brand.web}/logo-rcm.png`,
    footer: { name: brand.name, phone: brand.phone, email: brand.email, web: brand.web },
  })

  const text = [
    `Hola${saludo ? ` ${saludo}` : ""},`,
    "",
    `Te enviamos el informe de la revisión del ${coche}${matricula ? ` (${matricula})` : ""}, realizada el ${fecha}. Lo tienes completo en el PDF adjunto.`,
    "",
    veredicto.text,
    `Resultado: ${stats.ok} correctos, ${stats.atencion} de atención, ${stats.mal} mal, ${stats.na} no aplican.`,
    ...(destacadas.length ? ["", "Incidencias destacadas:", ...destacadas.map((d) => `- ${STATUS_META[d.status].short}: ${d.item!.label}${d.note ? ` (${d.note})` : ""}`)] : []),
    "",
    `Código del documento: ${r.codigo ?? ""}`,
    `Comprueba que es auténtico en ${verifyUrl}`,
    "",
    `¿Dudas? Responde a este correo o llámanos al ${brand.phone}.`,
    "",
    `El equipo de ${brand.name}`,
  ].join("\n")

  return { subject, html, text }
}

async function loadPdf(url: string): Promise<Buffer> {
  if (url.startsWith("/uploads/")) return readFile(path.join(process.cwd(), "public", url))
  const res = await fetch(url, { signal: AbortSignal.timeout(30000), cache: "no-store" })
  if (!res.ok) throw new Error(`No se pudo descargar el PDF (HTTP ${res.status})`)
  return Buffer.from(await res.arrayBuffer())
}

export async function sendInformeEmail(r: ReportDTO, to: { nombre: string; email: string }, appBase: string) {
  const key = process.env.RESEND_API_KEY
  if (!key) throw new Error("Falta RESEND_API_KEY en la configuración")
  if (!r.pdfUrl) throw new Error("El informe todavía no tiene PDF")

  const pdf = await loadPdf(r.pdfUrl)
  const { subject, html, text } = buildInformeEmail(r, to.nombre, appBase)
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
