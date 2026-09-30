"use client"

import { conTiempo } from "@/lib/client-upload"

// Vídeos que aún no han quedado registrados en el informe. Se guardan en el
// propio móvil (IndexedDB) en cuanto se termina de grabar y se borran al
// registrarlos. Si la subida falla, se cierra la app o el iPhone mata la
// pestaña, el vídeo sigue aquí y se vuelve a intentar al abrir ese punto.
//
// Todo lo de este archivo es de ayuda: si el navegador no deja guardar, la
// subida sigue igual, solo que sin esta red de seguridad.

export type SubidaPendiente = {
  id: string
  reportId: string
  itemId: string | null
  folder: string
  archivo: Blob
  nombre: string
  tipo: string
  miniatura: Blob | null
  /** Se rellena en cuanto el vídeo está en R2, para no volver a subirlo. */
  url: string | null
  thumbUrl: string | null
  datos: Record<string, unknown>
  creado: number
}

const BD = "epicars-subidas"
const ALMACEN = "pendientes"
const LIMITE_MS = 5000

function abrir(): Promise<IDBDatabase> {
  return conTiempo(
    new Promise((resolve, reject) => {
      const req = indexedDB.open(BD, 1)
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(ALMACEN)) req.result.createObjectStore(ALMACEN, { keyPath: "id" })
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
      req.onblocked = () => reject(new Error("Almacén local bloqueado"))
    }),
    LIMITE_MS,
    "El almacén local no responde"
  )
}

async function operar<T>(modo: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await abrir()
  try {
    return await conTiempo(
      new Promise<T | undefined>((resolve, reject) => {
        const tx = db.transaction(ALMACEN, modo)
        const req = fn(tx.objectStore(ALMACEN))
        tx.oncomplete = () => resolve(req ? req.result : undefined)
        tx.onerror = () => reject(tx.error)
        tx.onabort = () => reject(tx.error ?? new Error("Operación cancelada"))
      }),
      LIMITE_MS,
      "El almacén local no responde"
    )
  } finally {
    db.close()
  }
}

export async function guardarPendiente(p: SubidaPendiente): Promise<boolean> {
  try {
    await operar("readwrite", (s) => s.put(p))
    return true
  } catch (e) {
    console.warn("No se pudo guardar el vídeo en el móvil", e)
    return false
  }
}

export async function actualizarPendiente(id: string, cambios: Partial<SubidaPendiente>) {
  try {
    const actual = await operar<SubidaPendiente>("readonly", (s) => s.get(id))
    if (actual) await operar("readwrite", (s) => s.put({ ...actual, ...cambios }))
  } catch (e) {
    console.warn("No se pudo actualizar el vídeo guardado", e)
  }
}

export async function borrarPendiente(id: string) {
  try {
    await operar("readwrite", (s) => s.delete(id))
  } catch (e) {
    console.warn("No se pudo borrar el vídeo guardado", e)
  }
}

export async function listarPendientes(reportId: string, itemId: string | null): Promise<SubidaPendiente[]> {
  try {
    const todos = (await operar<SubidaPendiente[]>("readonly", (s) => s.getAll())) ?? []
    return todos
      .filter((p) => p.reportId === reportId && p.itemId === itemId)
      .sort((a, b) => a.creado - b.creado)
  } catch (e) {
    console.warn("No se pudieron leer los vídeos guardados", e)
    return []
  }
}
