import type { Metadata } from "next"
import Image from "next/image"
import { ArrowLeft } from "lucide-react"
import { VerifyForm } from "@/components/verify/verify-form"
import { brand } from "@/lib/brand"
import { normalizarCodigo } from "@/lib/document-code"

export const metadata: Metadata = {
  title: "Verificar un informe",
  description: `Comprueba que un informe de ${brand.name} es auténtico y que el PDF no se ha modificado.`,
  robots: { index: true, follow: true },
}

// Página pública (sin iniciar sesión): cualquiera con un informe puede comprobarlo
export default async function VerificarPage({ searchParams }: { searchParams: Promise<{ codigo?: string }> }) {
  const { codigo } = await searchParams
  return (
    <div className="flex min-h-dvh flex-col pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]">
      <header className="border-b border-border/70">
        <div className="mx-auto flex h-16 max-w-2xl items-center justify-between gap-4 px-4">
          <a href={brand.web} className="relative h-8 w-24" aria-label={`Ir a la web de ${brand.name}`}>
            <Image src="/logo-header.png" alt="" fill priority sizes="96px" className="object-contain object-left" />
          </a>
          <a href={brand.web} className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" /> Volver a la web
          </a>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10 sm:py-14">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Verificar un informe</h1>
        <p className="mt-3 max-w-[56ch] text-muted-foreground">
          Escribe el código que aparece al pie de cada página del informe (por ejemplo, RCM-7F3K-2M9Q) para comprobar que lo
          emitimos nosotros.
        </p>
        <VerifyForm initialCode={codigo ? normalizarCodigo(codigo) : ""} />
      </main>

      <footer className="border-t border-border/70 py-6 text-center text-xs text-muted-foreground">
        {brand.name} · <a href={`tel:${brand.phone.replace(/\s+/g, "")}`} className="hover:text-foreground">{brand.phone}</a> ·{" "}
        <a href={`mailto:${brand.email}`} className="hover:text-foreground">{brand.email}</a>
      </footer>
    </div>
  )
}
