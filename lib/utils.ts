import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(d: string | Date | null | undefined) {
  if (!d) return "—"
  return new Date(d).toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" })
}

export function formatDateTime(d: string | Date | null | undefined) {
  if (!d) return "—"
  return new Date(d).toLocaleString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
}

export function formatKm(km: number | null | undefined) {
  if (km == null) return "—"
  return `${km.toLocaleString("es-ES")} km`
}

export function formatEur(n: number | null | undefined) {
  if (n == null) return "—"
  return `${n.toLocaleString("es-ES")} €`
}
