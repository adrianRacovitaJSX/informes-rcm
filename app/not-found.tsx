import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-6xl font-black text-primary">404</p>
      <p className="text-muted-foreground">No encontramos ese informe.</p>
      <Button asChild><Link href="/">Volver al inicio</Link></Button>
    </div>
  )
}
