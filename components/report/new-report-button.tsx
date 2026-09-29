"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Plus } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"

export function NewReportButton({ compact, className }: { compact?: boolean; className?: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function create() {
    setLoading(true)
    try {
      const res = await fetch("/api/informes", { method: "POST" })
      if (!res.ok) throw new Error("No se pudo crear el informe")
      const { informe } = await res.json()
      router.push(`/informes/${informe.id}/vehiculo`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error")
      setLoading(false)
    }
  }

  return (
    <Button onClick={create} disabled={loading} size={compact ? "sm" : "lg"} className={className}>
      {loading ? <Loader2 className="animate-spin" /> : <Plus />}
      {compact ? "Nuevo" : "Crear informe"}
    </Button>
  )
}
