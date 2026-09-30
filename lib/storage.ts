import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { writeFile, mkdir, unlink } from "node:fs/promises"
import path from "node:path"

// Almacenamiento de archivos: Cloudflare R2 (S3 compatible). Sin credenciales
// (desarrollo local) los archivos se guardan en public/uploads.

const {
  R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_URL,
} = process.env

export const r2Enabled = !!(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET && R2_PUBLIC_URL)

let client: S3Client | null = null
function s3() {
  if (!client) {
    client = new S3Client({
      region: "auto",
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: R2_ACCESS_KEY_ID!, secretAccessKey: R2_SECRET_ACCESS_KEY! },
    })
  }
  return client
}

export function publicUrl(key: string) {
  return `${R2_PUBLIC_URL!.replace(/\/$/, "")}/${key}`
}

export function safeName(name: string) {
  return name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-80)
}

export function buildKey(folder: string, filename: string) {
  return `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName(filename)}`
}

/** URL firmada para que el navegador suba directamente a R2 (PUT). */
export async function presignUpload(key: string, contentType: string) {
  const cmd = new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, ContentType: contentType })
  const url = await getSignedUrl(s3(), cmd, { expiresIn: 60 * 15 })
  return { url, publicUrl: publicUrl(key) }
}

/** Guarda un buffer (subida vía servidor, PDFs, miniaturas). Devuelve URL pública. */
export async function saveFile(key: string, body: Buffer | Uint8Array, contentType: string): Promise<string> {
  if (r2Enabled) {
    await s3().send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: body, ContentType: contentType }))
    return publicUrl(key)
  }
  const dest = path.join(process.cwd(), "public", "uploads", key)
  await mkdir(path.dirname(dest), { recursive: true })
  await writeFile(dest, body)
  return `/uploads/${key}`
}

export async function deleteFile(url: string) {
  try {
    if (r2Enabled && url.startsWith(R2_PUBLIC_URL!)) {
      const key = url.slice(R2_PUBLIC_URL!.replace(/\/$/, "").length + 1)
      await s3().send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }))
    } else if (url.startsWith("/uploads/")) {
      await unlink(path.join(process.cwd(), "public", url))
    }
  } catch (e) {
    console.warn("No se pudo borrar el archivo", url, e)
  }
}

/** Lee un archivo propio. Los de R2 se piden por la API y no por la URL
 *  pública: el subdominio r2.dev va limitado y no está pensado para esto. */
export async function leerArchivo(url: string): Promise<Buffer | null> {
  if (r2Enabled && url.startsWith(R2_PUBLIC_URL!)) {
    const key = url.slice(R2_PUBLIC_URL!.replace(/\/$/, "").length + 1)
    const res = await s3().send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }))
    return res.Body ? Buffer.from(await res.Body.transformToByteArray()) : null
  }
  if (url.startsWith("/uploads/")) {
    const { readFile } = await import("node:fs/promises")
    return readFile(path.join(process.cwd(), "public", url))
  }
  return null
}

/** Convierte una URL de archivo en algo que react-pdf pueda leer (buffer local o URL absoluta). */
export async function resolveForPdf(url: string): Promise<string | { data: Buffer; format: "png" | "jpg" } | null> {
  if (url.startsWith("/uploads/")) {
    const { readFile } = await import("node:fs/promises")
    const data = await readFile(path.join(process.cwd(), "public", url))
    const format = url.toLowerCase().endsWith(".png") ? "png" : "jpg"
    return { data, format }
  }
  return url
}

// ── Subida por partes ────────────────────────────────────────────────────────
// Los vídeos del taller son pesados y la subida desde el móvil va por 4G. Si se
// trocean y se suben varias partes a la vez, el móvil aprovecha mucho mejor el
// ancho de banda que con una única conexión.

export async function iniciarSubidaPorPartes(key: string, contentType: string) {
  const res = await s3().send(new CreateMultipartUploadCommand({ Bucket: R2_BUCKET, Key: key, ContentType: contentType }))
  if (!res.UploadId) throw new Error("R2 no devolvió identificador de subida")
  return res.UploadId
}

export async function firmarParte(key: string, uploadId: string, numeroParte: number) {
  const cmd = new UploadPartCommand({ Bucket: R2_BUCKET, Key: key, UploadId: uploadId, PartNumber: numeroParte })
  return getSignedUrl(s3(), cmd, { expiresIn: 60 * 60 })
}

export async function completarSubidaPorPartes(
  key: string,
  uploadId: string,
  partes: { PartNumber: number; ETag: string }[]
) {
  await s3().send(
    new CompleteMultipartUploadCommand({
      Bucket: R2_BUCKET,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: { Parts: partes.sort((a, b) => a.PartNumber - b.PartNumber) },
    })
  )
  return publicUrl(key)
}

export async function abortarSubidaPorPartes(key: string, uploadId: string) {
  try {
    await s3().send(new AbortMultipartUploadCommand({ Bucket: R2_BUCKET, Key: key, UploadId: uploadId }))
  } catch (e) {
    console.warn("No se pudo abortar la subida por partes", e)
  }
}

/** Sube una parte desde el servidor y devuelve su ETag. Se usa cuando el
 *  navegador no puede hablar directamente con R2 (bucket sin CORS). */
export async function subirParteDesdeServidor(
  key: string,
  uploadId: string,
  numeroParte: number,
  cuerpo: Buffer
): Promise<string> {
  const res = await s3().send(
    new UploadPartCommand({ Bucket: R2_BUCKET, Key: key, UploadId: uploadId, PartNumber: numeroParte, Body: cuerpo })
  )
  if (!res.ETag) throw new Error("R2 no devolvió el ETag de la parte")
  return res.ETag.replace(/"/g, "")
}
