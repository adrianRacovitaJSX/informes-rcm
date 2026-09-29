import { notFound } from "next/navigation"
import { getReport } from "@/lib/report-service"
import { auth } from "@/lib/auth"
import { ReportDetail } from "@/components/report/report-detail"

export const dynamic = "force-dynamic"

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  const report = await getReport(id)
  if (!report) notFound()
  return <ReportDetail report={report} user={session?.user} />
}
