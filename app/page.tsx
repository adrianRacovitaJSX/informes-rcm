import { auth } from "@/lib/auth"
import { listReports } from "@/lib/report-service"
import { AppShell } from "@/components/layout/app-shell"
import { ReportList } from "@/components/report/report-list"
import { NewReportButton } from "@/components/report/new-report-button"
import { InstallPrompt } from "@/components/layout/install-prompt"

export const dynamic = "force-dynamic"

export default async function HomePage() {
  const session = await auth()
  const informes = await listReports()
  return (
    <AppShell right={<NewReportButton compact />} user={session?.user}>
      <InstallPrompt />
      <div className="mb-5 flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">Revisión Coche Madrid</p>
          <h1 className="text-2xl font-bold tracking-tight">Informes de revisión</h1>
          <p className="text-sm text-muted-foreground">Hola, {session?.user?.name?.split(" ")[0] ?? "equipo"}. {informes.length === 1 ? "1 informe" : `${informes.length} informes`}.</p>
        </div>
      </div>
      <ReportList informes={informes} />
    </AppShell>
  )
}
