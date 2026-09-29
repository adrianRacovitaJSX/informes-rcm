// Plantilla común de los emails de Revisión Coche Madrid. HTML a base de tablas y
// estilos en línea: es lo único que se ve igual en Gmail, Outlook y Apple Mail.
// (Copia de rcm-web/lib/email-layout.ts: si se cambia el diseño, cambiarlo en las dos.)

export const C = {
  ink: "#0b0a0a",
  text: "#18181b",
  body: "#3f3f46",
  mute: "#71717a",
  line: "#e4e4e7",
  soft: "#f4f4f5",
  page: "#eeeeef",
  brand: "#F17205",
  brandDark: "#C2410C",
  brandSoft: "#fff7ed",
}

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"

export const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!)

/** Botón píldora. `ghost` = contorno, para la acción secundaria. */
export function button(href: string, label: string, ghost = false) {
  const style = ghost
    ? `background:#ffffff;color:${C.text};border:1.5px solid ${C.line};`
    : `background:${C.brand};color:${C.ink};border:1.5px solid ${C.brand};`
  return `<a href="${href}" style="${style}display:inline-block;font-family:${FONT};font-size:15px;font-weight:700;line-height:1;text-decoration:none;padding:14px 22px;border-radius:999px;margin:0 8px 8px 0;">${label}</a>`
}

/** Tabla de datos etiqueta / valor (reservas, resumen del informe...). */
export function dataTable(rows: [string, string][]) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;background:${C.soft};border-radius:14px;">
    ${rows
      .map(
        ([k, v], i) => `<tr><td style="padding:${i === 0 ? "16px" : "10px"} 18px ${i === rows.length - 1 ? "16px" : "10px"};font-family:${FONT};border-top:${i === 0 ? "0" : `1px solid ${C.line}`};">
          <div style="font-size:12px;letter-spacing:.4px;text-transform:uppercase;color:${C.mute};">${esc(k)}</div>
          <div style="font-size:15px;font-weight:600;color:${C.text};margin-top:3px;word-break:break-word;">${v}</div>
        </td></tr>`
      )
      .join("")}
  </table>`
}

export function paragraph(html: string) {
  return `<p style="margin:0 0 16px;font-family:${FONT};font-size:15px;line-height:1.6;color:${C.body};">${html}</p>`
}

/**
 * Estructura del email: cabecera oscura con logo, tarjeta blanca y pie.
 * `preheader` es el texto que se ve en la bandeja de entrada junto al asunto.
 */
export function layout(opts: {
  preheader: string
  eyebrow?: string
  title: string
  content: string
  logoUrl: string
  footer: { name: string; phone: string; email: string; web: string }
}) {
  const { preheader, eyebrow, title, content, logoUrl, footer } = opts
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:${C.page};-webkit-text-size-adjust:100%;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${esc(preheader)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.page};">
    <tr><td align="center" style="padding:32px 14px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;">
        <tr><td style="background:${C.ink};border-radius:18px 18px 0 0;padding:28px 32px 24px;">
          <img src="${logoUrl}" width="128" alt="${esc(footer.name)}" style="display:block;border:0;width:128px;height:auto;">
        </td></tr>
        <tr><td style="background:${C.brand};height:4px;line-height:4px;font-size:0;">&nbsp;</td></tr>
        <tr><td style="background:#ffffff;border-radius:0 0 18px 18px;padding:34px 32px 30px;">
          ${eyebrow ? `<p style="margin:0 0 10px;font-family:${FONT};font-size:12px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:${C.brandDark};">${esc(eyebrow)}</p>` : ""}
          <h1 style="margin:0 0 20px;font-family:${FONT};font-size:26px;line-height:1.2;font-weight:800;letter-spacing:-.4px;color:${C.text};">${esc(title)}</h1>
          ${content}
        </td></tr>
        <tr><td align="center" style="padding:24px 16px 0;font-family:${FONT};font-size:12px;line-height:1.7;color:${C.mute};">
          <b style="color:${C.body};">${esc(footer.name)}</b><br>
          <a href="tel:${footer.phone.replace(/\s+/g, "")}" style="color:${C.mute};text-decoration:none;">${esc(footer.phone)}</a> &nbsp;·&nbsp;
          <a href="mailto:${footer.email}" style="color:${C.mute};text-decoration:none;">${esc(footer.email)}</a> &nbsp;·&nbsp;
          <a href="${footer.web}" style="color:${C.mute};">${esc(footer.web.replace(/^https?:\/\//, ""))}</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}
