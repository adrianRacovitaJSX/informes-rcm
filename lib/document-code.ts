import { randomInt } from "node:crypto"

// Alfabeto sin caracteres que se confunden al leer o dictar: sin I, L, O, U, 0, 1
const ALFABETO = "23456789ABCDEFGHJKMNPQRSTVWXYZ"

/**
 * Código público del documento, del estilo RCM-7F3K-2M9Q.
 * Sirve para identificar el informe, citarlo por teléfono y verificar
 * que el PDF que enseña un cliente es realmente el que emitió Revisión Coche Madrid.
 */
export function generarCodigoDocumento(): string {
  const bloque = () => Array.from({ length: 4 }, () => ALFABETO[randomInt(ALFABETO.length)]).join("")
  return `RCM-${bloque()}-${bloque()}`
}

/** Acepta el código como lo escriba la gente: minúsculas, espacios o sin guiones ("rcm f5j4 mxk2"). */
export function normalizarCodigo(codigo: string): string {
  const limpio = codigo.toUpperCase().replace(/[^A-Z0-9]/g, "")
  const m = limpio.match(/^([A-Z]{3})([A-Z0-9]{4})([A-Z0-9]{4})$/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : codigo.trim().toUpperCase()
}
