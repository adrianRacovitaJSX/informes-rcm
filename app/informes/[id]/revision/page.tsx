import { notFound } from "next/navigation"
import { getReport } from "@/lib/report-service"
import { auth } from "@/lib/auth"
import { ChecklistForm } from "@/components/report/checklist-form"

export const dynamic = "force-dynamic"

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  const report = await getReport(id)
  if (!report) notFound()
  return <ChecklistForm initial={report} user={session?.user} />
}
