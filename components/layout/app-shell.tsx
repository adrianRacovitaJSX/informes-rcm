"use client"

import Image from "next/image"
import Link from "next/link"
import { signOut } from "next-auth/react"
import { LogOut, ArrowLeft } from "lucide-react"
import { cn } from "@/lib/utils"

export type ShellUser = { name?: string | null } | null

export function AppShell({
  children,
  title,
  back,
  right,
  className,
  user,
}: {
  children: React.ReactNode
  title?: string
  back?: string
  right?: React.ReactNode
  className?: string
  /** Viene del servidor, así las iniciales salen ya en el primer pintado. */
  user?: ShellUser
}) {
  const nombre = user?.name ?? ""
  const initials = (nombre || "·").split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()

  return (
    <div className="min-h-dvh flex flex-col">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-md safe-top safe-x">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-3 px-4">
          {back ? (
            <Link href={back} className="-ml-2 rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Volver">
              <ArrowLeft className="size-5" />
            </Link>
          ) : null}
          <Link href="/" className="relative h-8 w-24 shrink-0">
            <Image src="/logo-header.png" alt="Revisión Coche Madrid" fill priority className="object-contain object-left" sizes="96px" />
          </Link>
          {title ? <span className="truncate text-sm font-semibold text-foreground/90">{title}</span> : null}
          <div className="ml-auto flex items-center gap-1.5">
            {right}
            <div
              className="flex size-8 items-center justify-center rounded-full bg-primary/15 text-[11px] font-bold text-primary ring-1 ring-primary/30"
              title={nombre}
            >
              {initials}
            </div>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
              title="Cerrar sesión"
              aria-label="Cerrar sesión"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </header>
      <main className={cn("mx-auto w-full max-w-3xl flex-1 px-4 py-5 safe-bottom", className)}>{children}</main>
    </div>
  )
}
