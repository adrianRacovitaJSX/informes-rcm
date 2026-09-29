import { renderToBuffer } from "@react-pdf/renderer"
import { readFile } from "node:fs/promises"
import path from "node:path"
import QRCode from "qrcode"
import type { ReportDTO } from "@/lib/report-types"
import { ReportDocument, type ImgSrc, type PdfAssets } from "./report-document"

const INTENTOS = 3

/** Descarga una imagen para incrustarla en el PDF. Reintenta: un fallo de red dejaría la foto fuera del informe. */
async function loadImage(url: string): Promise<ImgSrc | null> {
  for (let intento = 1; intento <= INTENTOS; intento++) {
    try {
      let data: Buffer
      if (url.startsWith("/uploads/")) {
        data = await readFile(path.join(process.cwd(), "public", url))
      } else {
        const res = await fetch(url, { signal: AbortSignal.timeout(20000), cache: "no-store" })
        if (!res.ok) {
          if (res.status >= 400 && res.status < 500) return null // no existe: no insistir
          throw new Error(`HTTP ${res.status}`)
        }
        data = Buffer.from(await res.arrayBuffer())
      }
      const isPng = data[0] === 0x89 && data[1] === 0x50
      const isJpg = data[0] === 0xff && data[1] === 0xd8
      if (!isPng && !isJpg) return null
      return { data, format: isPng ? "png" : "jpg" }
    } catch (e) {
      if (intento === INTENTOS) {
        console.warn(`PDF: no se pudo cargar la imagen tras ${INTENTOS} intentos`, url, e)
        return null
      }
      await new Promise((r) => setTimeout(r, 400 * intento))
    }
  }
  return null
}

function absolute(url: string, origin: string) {
  return url.startsWith("/") ? `${origin}${url}` : url
}

export async function renderReportPdf(report: ReportDTO, origin: string): Promise<Buffer> {
  const logoBuf: ImgSrc = { data: await readFile(path.join(process.cwd(), "public", "logo-pdf.png")), format: "png" }

  const images: Record<string, ImgSrc> = {}
  const qrs: Record<string, string> = {}
  await Promise.all(
    report.media.map(async (m) => {
      if (m.kind === "PHOTO") {
        const img = await loadImage(m.url)
        if (img) images[m.id] = img
      } else {
        if (m.thumbUrl) {
          const img = await loadImage(m.thumbUrl)
          if (img) images[m.id] = img
        }
        qrs[m.id] = await QRCode.toDataURL(absolute(m.url, origin), { margin: 1, width: 160, color: { dark: "#111111" } })
      }
    })
  )

  const assets: PdfAssets = { logo: logoBuf, images, qrs, origin }
  return renderToBuffer(<ReportDocument report={report} assets={assets} />)
}
