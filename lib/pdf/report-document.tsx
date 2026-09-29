/* eslint-disable jsx-a11y/alt-text */
import { Document, Page, Text, View, Image, StyleSheet, Link } from "@react-pdf/renderer"
import { brand } from "@/lib/brand"
import { CHECKLIST, STATUS_META, TOTAL_ITEMS, findItem, type ChecklistItem, type ItemStatus } from "@/lib/checklist"
import { carTitle, computeStats, type MediaDTO, type ReportDTO } from "@/lib/report-types"

export type ImgSrc = { data: Buffer; format: "png" | "jpg" }
export type PdfAssets = { logo: ImgSrc; images: Record<string, ImgSrc>; qrs: Record<string, string>; origin: string }

const ORANGE = "#F17205"
const DARK = "#0b0b0c"
const INK = "#18181b"
const MUTED = "#71717a"
const LINE = "#e4e4e7"
const SOFT = "#f4f4f5"

const s = StyleSheet.create({
  page: { paddingTop: 28, paddingBottom: 56, paddingHorizontal: 32, fontFamily: "Helvetica", fontSize: 9.5, color: INK },
  header: { backgroundColor: DARK, marginHorizontal: -32, marginTop: -28, paddingHorizontal: 32, paddingVertical: 20, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  logo: { width: 100, height: 46, objectFit: "contain" },
  hTitle: { color: "#ffffff", fontSize: 15, fontFamily: "Helvetica-Bold", textAlign: "right" },
  hSub: { color: ORANGE, fontSize: 8.5, textAlign: "right", marginTop: 2, letterSpacing: 1.2 },
  brandBar: { height: 3, backgroundColor: ORANGE, marginHorizontal: -32, marginBottom: 18 },
  carTitle: { fontSize: 20, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  metaRow: { flexDirection: "row", gap: 8, alignItems: "center", marginBottom: 14, flexWrap: "wrap" },
  plate: { borderWidth: 1.2, borderColor: INK, borderRadius: 3, paddingHorizontal: 7, paddingVertical: 2.5, fontFamily: "Helvetica-Bold", fontSize: 11, letterSpacing: 1.5 },
  metaText: { color: MUTED, fontSize: 9 },
  verdict: { borderRadius: 8, padding: 12, marginBottom: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  verdictLabel: { color: "#ffffff", fontSize: 14, fontFamily: "Helvetica-Bold" },
  verdictDesc: { color: "#ffffffcc", fontSize: 9, marginTop: 2 },
  tiles: { flexDirection: "row", gap: 8, marginBottom: 16 },
  tile: { flex: 1, borderRadius: 8, backgroundColor: SOFT, padding: 10, borderLeftWidth: 3 },
  tileNum: { fontSize: 18, fontFamily: "Helvetica-Bold" },
  tileLabel: { fontSize: 8, color: MUTED, marginTop: 2, textTransform: "uppercase", letterSpacing: 0.6 },
  h2: { fontSize: 11.5, fontFamily: "Helvetica-Bold", marginBottom: 8, marginTop: 6, paddingBottom: 4, borderBottomWidth: 1.5, borderBottomColor: INK },
  grid: { flexDirection: "row", flexWrap: "wrap", marginBottom: 12 },
  cell: { width: "33.33%", paddingRight: 10, paddingVertical: 4 },
  cellLabel: { fontSize: 7.5, color: MUTED, textTransform: "uppercase", letterSpacing: 0.5 },
  cellValue: { fontSize: 10, marginTop: 1.5, fontFamily: "Helvetica-Bold" },
  para: { fontSize: 9.5, lineHeight: 1.45, color: "#3f3f46" },
  photos: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6, marginBottom: 6 },
  photoLg: { width: 170, height: 122, borderRadius: 6, objectFit: "cover", backgroundColor: SOFT },
  photoSm: { width: 96, height: 70, borderRadius: 5, objectFit: "cover", backgroundColor: SOFT },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: DARK, borderRadius: 6, paddingHorizontal: 12, paddingVertical: 8, marginTop: 10, marginBottom: 8 },
  sectionTitle: { color: "#ffffff", fontSize: 12, fontFamily: "Helvetica-Bold" },
  sectionCounts: { flexDirection: "row", gap: 6 },
  miniChip: { color: "#fff", fontSize: 7.5, fontFamily: "Helvetica-Bold", paddingHorizontal: 6, paddingVertical: 2.5, borderRadius: 8 },
  intro: { fontSize: 8.5, color: MUTED, marginBottom: 8, lineHeight: 1.4, fontStyle: "italic" },
  item: { flexDirection: "row", paddingVertical: 6, borderBottomWidth: 0.8, borderBottomColor: LINE },
  chip: { width: 56, alignSelf: "flex-start", borderRadius: 4, paddingVertical: 3, marginRight: 10, alignItems: "center" },
  chipText: { color: "#fff", fontSize: 7.5, fontFamily: "Helvetica-Bold" },
  itemBody: { flex: 1 },
  itemLabel: { fontSize: 10, fontFamily: "Helvetica-Bold" },
  itemNote: { fontSize: 9, color: "#3f3f46", marginTop: 2, lineHeight: 1.4 },
  extras: { flexDirection: "row", flexWrap: "wrap", gap: 5, marginTop: 4 },
  extra: { backgroundColor: SOFT, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2.5, fontSize: 8, color: "#3f3f46" },
  videos: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 },
  video: { width: 150, flexDirection: "row", gap: 6, alignItems: "center", backgroundColor: SOFT, borderRadius: 6, padding: 6 },
  qr: { width: 44, height: 44 },
  videoText: { flex: 1, fontSize: 7.5, color: "#3f3f46", lineHeight: 1.3 },
  link: { color: "#C2410C", textDecoration: "none", fontFamily: "Helvetica-Bold" },
  regFila: { flexDirection: "row", borderBottomWidth: 0.6, borderBottomColor: LINE, paddingVertical: 3.5 },
  regCab: { flexDirection: "row", borderBottomWidth: 1.2, borderBottomColor: INK, paddingBottom: 4, marginTop: 2 },
  regTexto: { fontSize: 7.5, color: "#3f3f46" },
  regCabTexto: { fontSize: 7, fontFamily: "Helvetica-Bold", color: MUTED, textTransform: "uppercase", letterSpacing: 0.4 },
  regIntro: { fontSize: 8.5, color: MUTED, lineHeight: 1.45, marginBottom: 8 },
  footer: { position: "absolute", left: 32, right: 32, bottom: 18, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", fontSize: 7.5, color: MUTED, borderTopWidth: 0.8, borderTopColor: LINE, paddingTop: 6 },
  footerVerify: { marginTop: 2, fontSize: 7 },
})

function plural(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`
}

function fechaCorta(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit",
    timeZone: "Europe/Madrid",
  }).format(d)
}

function statusColor(status?: ItemStatus) {
  return status ? STATUS_META[status].hex : "#a1a1aa"
}
function statusLabel(status?: ItemStatus) {
  return status ? STATUS_META[status].short.toUpperCase() : "SIN REVISAR"
}

function fmt(v: string | number | null | undefined, suffix = "") {
  if (v === null || v === undefined || v === "") return "—"
  if (typeof v === "number") return `${v.toLocaleString("es-ES")}${suffix}`
  return `${v}${suffix}`
}

function Footer({ fecha, codigo }: { fecha: string; codigo: string | null }) {
  const host = brand.app.replace(/^https?:\/\//, "")
  return (
    <View style={s.footer} fixed>
      <View>
        <Text>
          Revisión Coche Madrid · Informe de revisión de vehículo usado · {fecha}
          {codigo ? `  ·  Doc. ${codigo}` : ""}
        </Text>
        {codigo ? <Text style={s.footerVerify}>Comprueba que este documento es auténtico en {host}/verificar</Text> : null}
      </View>
      <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
    </View>
  )
}

function Photos({ media, assets, large }: { media: MediaDTO[]; assets: PdfAssets; large?: boolean }) {
  const photos = media.filter((m) => m.kind === "PHOTO" && assets.images[m.id])
  if (photos.length === 0) return null
  return (
    <View style={s.photos}>
      {photos.map((m) => (
        <Image key={m.id} src={assets.images[m.id]} style={large ? s.photoLg : s.photoSm} />
      ))}
    </View>
  )
}

function Videos({ media, assets }: { media: MediaDTO[]; assets: PdfAssets }) {
  const videos = media.filter((m) => m.kind === "VIDEO")
  if (videos.length === 0) return null
  return (
    <View style={s.videos}>
      {videos.map((m, i) => {
        const url = m.url.startsWith("/") ? `${assets.origin}${m.url}` : m.url
        return (
          <View key={m.id} style={s.video}>
            {assets.qrs[m.id] ? <Image src={assets.qrs[m.id]} style={s.qr} /> : null}
            <Text style={s.videoText}>
              Vídeo {i + 1}{"\n"}Escanea el QR o{" "}
              <Link src={url} style={s.link}>pulsa aquí</Link>
            </Text>
          </View>
        )
      })}
    </View>
  )
}

function Item({ item, report, assets }: { item: ChecklistItem; report: ReportDTO; assets: PdfAssets }) {
  const r = report.items[item.id] ?? {}
  const media = report.media.filter((m) => m.itemId === item.id)
  const extras = (item.extras ?? []).filter((e) => r.extras?.[e.key])
  return (
    <View style={s.item} wrap={false}>
      <View style={[s.chip, { backgroundColor: statusColor(r.status) }]}>
        <Text style={s.chipText}>{statusLabel(r.status)}</Text>
      </View>
      <View style={s.itemBody}>
        <Text style={s.itemLabel}>{item.label}</Text>
        {r.note ? <Text style={s.itemNote}>{r.note}</Text> : null}
        {extras.length > 0 ? (
          <View style={s.extras}>
            {extras.map((e) => (
              <Text key={e.key} style={s.extra}>
                {e.label}: {r.extras![e.key]}{e.unit ? ` ${e.unit}` : ""}
              </Text>
            ))}
          </View>
        ) : null}
        <Photos media={media} assets={assets} />
        <Videos media={media} assets={assets} />
      </View>
    </View>
  )
}

export function ReportDocument({ report, assets }: { report: ReportDTO; assets: PdfAssets }) {
  const title = carTitle(report)
  const stats = computeStats(report.items, TOTAL_ITEMS)
  const general = report.media.filter((m) => m.itemId === null)
  const incidencias = CHECKLIST.flatMap((sec) => sec.items)
    .map((item) => ({ item, r: report.items[item.id] ?? {} }))
    .filter(({ r }) => r.status === "mal" || r.status === "atencion")
    .sort((a, b) => (a.r.status === b.r.status ? 0 : a.r.status === "mal" ? -1 : 1))
  const fecha = new Date(report.pdfGeneradoAt ?? report.updatedAt).toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric" })

  return (
    <Document title={`Informe de revisión · ${title}`} author="Revisión Coche Madrid" subject="Informe de revisión de vehículo usado">
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <Image src={assets.logo} style={s.logo} />
          <View>
            <Text style={s.hTitle}>INFORME DE REVISIÓN</Text>
            <Text style={s.hSub}>VEHÍCULO USADO · {report.matricula || report.id.slice(-6).toUpperCase()}</Text>
          </View>
        </View>
        <View style={s.brandBar} />

        <Text style={s.carTitle}>{title}</Text>
        <View style={s.metaRow}>
          {report.matricula ? <Text style={s.plate}>{report.matricula.toUpperCase()}</Text> : null}
          <Text style={s.metaText}>{fecha}</Text>
          {report.autor ? <Text style={s.metaText}>· Revisado por {report.autor.name}</Text> : null}
        </View>

        <View style={s.tiles}>
          {(
            [
              ["ok", stats.ok, "Correctos"],
              ["atencion", stats.atencion, "Atención"],
              ["mal", stats.mal, "Mal"],
              ["na", stats.na, "No aplica"],
            ] as [ItemStatus | null, number, string][]
          ).map(([st, n, label]) => (
            <View key={label} style={[s.tile, { borderLeftColor: statusColor(st ?? undefined) }]}>
              <Text style={[s.tileNum, { color: statusColor(st ?? undefined) }]}>{n}</Text>
              <Text style={s.tileLabel}>{label}</Text>
            </View>
          ))}
        </View>

        <Text style={s.h2}>Datos del vehículo</Text>
        <View style={s.grid}>
          {(
            [
              ["Marca", report.marca], ["Modelo", report.modelo], ["Versión", report.version],
              ["Matrícula", report.matricula], ["Bastidor (VIN)", report.bastidor], ["Año", report.anio],
              ["Kilómetros", fmt(report.km, " km")], ["Combustible", report.combustible], ["Cambio", report.cambio],
              ["Color", report.color], ["Precio", fmt(report.precio, " €")],
            ] as [string, string | number | null][]
          ).map(([label, value]) => (
            <View key={label} style={s.cell}>
              <Text style={s.cellLabel}>{label}</Text>
              <Text style={s.cellValue}>{fmt(value)}</Text>
            </View>
          ))}
        </View>

        {incidencias.length > 0 ? (
          <View>
            <Text style={s.h2}>Incidencias destacadas</Text>
            {incidencias.map(({ item, r }) => (
              <View key={item.id} style={s.item} wrap={false}>
                <View style={[s.chip, { backgroundColor: statusColor(r.status) }]}>
                  <Text style={s.chipText}>{statusLabel(r.status)}</Text>
                </View>
                <View style={s.itemBody}>
                  <Text style={s.itemLabel}>{item.label}</Text>
                  {r.note ? <Text style={s.itemNote}>{r.note}</Text> : null}
                </View>
              </View>
            ))}
          </View>
        ) : null}
        {report.observaciones ? (
          <View wrap={report.observaciones.length > 700}>
            <Text style={s.h2}>Observaciones del vehículo</Text>
            <Text style={s.para}>{report.observaciones}</Text>
          </View>
        ) : null}

        {general.length > 0 ? (
          <View>
            <View wrap={false}>
              <Text style={s.h2}>Fotos generales</Text>
              <Photos media={general.slice(0, 3)} assets={assets} large />
            </View>
            <Photos media={general.slice(3)} assets={assets} large />
            <Videos media={general} assets={assets} />
          </View>
        ) : null}
        <Footer fecha={fecha} codigo={report.codigo} />
      </Page>

      <Page size="A4" style={s.page}>
        <Text style={[s.h2, { marginTop: 0 }]}>Puntos revisados</Text>
        {CHECKLIST.map((section) => {
          const counts = { ok: 0, atencion: 0, mal: 0 }
          for (const it of section.items) {
            const st = report.items[it.id]?.status
            if (st === "ok" || st === "atencion" || st === "mal") counts[st]++
          }
          return (
            <View key={section.id}>
              <View wrap={false}>
              <View style={s.sectionHead}>
                <Text style={s.sectionTitle}>{section.title}</Text>
                <View style={s.sectionCounts}>
                  {counts.ok > 0 ? <Text style={[s.miniChip, { backgroundColor: STATUS_META.ok.hex }]}>{counts.ok} OK</Text> : null}
                  {counts.atencion > 0 ? <Text style={[s.miniChip, { backgroundColor: STATUS_META.atencion.hex }]}>{counts.atencion} ATENCIÓN</Text> : null}
                  {counts.mal > 0 ? <Text style={[s.miniChip, { backgroundColor: STATUS_META.mal.hex }]}>{counts.mal} MAL</Text> : null}
                </View>
              </View>
              {section.intro ? <Text style={s.intro}>{section.intro}</Text> : null}
              <Item item={section.items[0]} report={report} assets={assets} />
              </View>
              {section.items.slice(1).map((item) => (
                <Item key={item.id} item={item} report={report} assets={assets} />
              ))}
            </View>
          )
        })}
        <Footer fecha={fecha} codigo={report.codigo} />
      </Page>

      {report.media.length > 0 ? (
        <Page size="A4" style={s.page}>
          <Text style={[s.h2, { marginTop: 0 }]}>Registro de fotos y vídeos</Text>
          <Text style={s.regIntro}>
            Cada archivo de este informe queda registrado con su huella digital, la fecha en que se tomó y
            la fecha en que se subió. Si alguien cambiase una foto, su huella dejaría de coincidir con la de
            esta tabla. Las horas son de la España peninsular.
          </Text>

          <View style={s.regCab}>
            <Text style={[s.regCabTexto, { width: "27%" }]}>Punto revisado</Text>
            <Text style={[s.regCabTexto, { width: "10%" }]}>Tipo</Text>
            <Text style={[s.regCabTexto, { width: "17%" }]}>Tomada</Text>
            <Text style={[s.regCabTexto, { width: "17%" }]}>Subida</Text>
            <Text style={[s.regCabTexto, { width: "29%" }]}>Huella SHA-256</Text>
          </View>

          {report.media.map((m) => {
            const punto = m.itemId ? findItem(m.itemId)?.label ?? m.itemId : "Fotos generales"
            return (
              <View key={m.id} style={s.regFila} wrap={false}>
                <Text style={[s.regTexto, { width: "27%", paddingRight: 4 }]}>{punto}</Text>
                <Text style={[s.regTexto, { width: "10%" }]}>{m.kind === "VIDEO" ? "Vídeo" : "Foto"}</Text>
                <Text style={[s.regTexto, { width: "17%" }]}>{fechaCorta(m.capturadoAt)}</Text>
                <Text style={[s.regTexto, { width: "17%" }]}>{fechaCorta(m.createdAt)}</Text>
                <View style={{ width: "29%" }}>
                  {m.hash ? (
                    <>
                      <Text style={[s.regTexto, { fontSize: 6.5 }]}>{m.hash.slice(0, 32)}</Text>
                      <Text style={[s.regTexto, { fontSize: 6.5 }]}>{m.hash.slice(32)}</Text>
                    </>
                  ) : (
                    <Text style={s.regTexto}>—</Text>
                  )}
                </View>
              </View>
            )
          })}

          <Text style={[s.regIntro, { marginTop: 12 }]}>
            Total: {plural(report.media.filter((m) => m.kind === "PHOTO").length, "foto", "fotos")} y{" "}
            {plural(report.media.filter((m) => m.kind === "VIDEO").length, "vídeo", "vídeos")}.
            {report.media.some((m) => m.camara)
              ? ` Dispositivo: ${[...new Set(report.media.map((m) => m.camara).filter(Boolean))].join(", ")}.`
              : ""}
          </Text>

          <Footer fecha={fecha} codigo={report.codigo} />
        </Page>
      ) : null}
    </Document>
  )
}
