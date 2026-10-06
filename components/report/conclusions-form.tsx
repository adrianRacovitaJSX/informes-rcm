"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, ArrowRight } from "lucide-react"
import { AppShell, type ShellUser } from "@/components/layout/app-shell"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { StepNav, StepFooter } from "./step-nav"
import { useAutosave, SaveIndicator } from "@/hooks/use-autosave"
import type { ReportDTO } from "@/lib/report-types"

export function ConclusionsForm({ initial, user }: { initial: ReportDTO; user?: ShellUser }) {
  const router = useRouter()
  const [resumen, setResumen] = useState(initial.resumen ?? "")
  const { save, flush, state } = useAutosave(initial.id)

  async function go(step: "revision" | "resumen") {
    await flush()
    router.push(`/informes/${initial.id}/${step}`)
  }

  return (
    <AppShell back="/" title="Conclusiones" right={<SaveIndicator state={state} />} user={user}>
      <StepNav reportId={initial.id} current="conclusiones" />
      <div className="space-y-4 pb-24">
        <Card>
          <CardHeader>
            <CardTitle>Conclusiones</CardTitle>
            <CardDescription>Tu valoración final del coche. Saldrá en el informe tal como la escribas.</CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              value={resumen}
              onChange={(e) => {
                setResumen(e.target.value)
                save({ resumen: e.target.value })
              }}
              maxLength={5000}
              placeholder="Estado general, lo que hay que reparar, si lo recomiendas…"
              className="min-h-64"
            />
          </CardContent>
        </Card>
      </div>

      <StepFooter>
        <Button variant="outline" size="lg" onClick={() => go("revision")} className="shrink-0" aria-label="Anterior"><ArrowLeft /></Button>
        <Button onClick={() => go("resumen")} size="lg" className="min-w-0 flex-1">
          Ver informe <ArrowRight />
        </Button>
      </StepFooter>
    </AppShell>
  )
}
