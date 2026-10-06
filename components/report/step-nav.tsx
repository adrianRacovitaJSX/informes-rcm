"use client"

import Link from "next/link"
import { Car, ClipboardCheck, FileText, Check, MessageSquareText } from "lucide-react"
import { cn } from "@/lib/utils"

export const STEPS = [
  { key: "vehiculo", label: "Vehículo", icon: Car },
  { key: "revision", label: "Revisión", icon: ClipboardCheck },
  { key: "conclusiones", label: "Conclusiones", icon: MessageSquareText },
  { key: "resumen", label: "Informe", icon: FileText },
] as const

export type StepKey = (typeof STEPS)[number]["key"]

export function StepNav({ reportId, current }: { reportId: string; current: StepKey }) {
  const idx = STEPS.findIndex((s) => s.key === current)
  return (
    <nav className="mb-5 grid grid-cols-4 gap-1.5" aria-label="Pasos">
      {STEPS.map((s, i) => {
        const active = i === idx
        const done = i < idx
        return (
          <Link
            key={s.key}
            href={`/informes/${reportId}/${s.key}`}
            className={cn(
              "flex flex-col items-center gap-1 rounded-xl border px-1 py-2 text-[11px] sm:px-2 font-semibold transition-colors",
              active ? "border-primary/40 bg-primary/10 text-primary" : done ? "border-border bg-card text-foreground/80" : "border-border text-muted-foreground"
            )}
          >
            <span className={cn("flex size-6 items-center justify-center rounded-full text-[10px]", active ? "bg-primary text-primary-foreground" : done ? "bg-primary/20 text-primary" : "bg-muted")}>
              {done ? <Check className="size-3.5" /> : i + 1}
            </span>
            <span className="flex items-center gap-1"><s.icon className="hidden size-3.5 sm:block" />{s.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}

export function StepFooter({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border/70 bg-background/85 backdrop-blur-md safe-bottom">
      <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 pt-3">{children}</div>
    </div>
  )
}
