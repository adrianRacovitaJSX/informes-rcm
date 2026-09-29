"use client"

import { Suspense, useActionState } from "react"
import Image from "next/image"
import { useSearchParams } from "next/navigation"
import { useFormStatus } from "react-dom"
import { Loader2, Lock, Mail } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { loginAction, type LoginState } from "./actions"

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending ? <Loader2 className="animate-spin" /> : null}
      Entrar
    </Button>
  )
}

function LoginForm() {
  const params = useSearchParams()
  const from = params.get("from") ?? "/"
  const [state, formAction] = useActionState<LoginState, FormData>(loginAction, { error: null })

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="from" value={from} />
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <div className="relative">
          <Mail className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input id="email" name="email" type="email" autoComplete="email" inputMode="email" autoCapitalize="none" required className="pl-10" placeholder="mecanico@revisioncochemadrid.es" />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">Contraseña</Label>
        <div className="relative">
          <Lock className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input id="password" name="password" type="password" autoComplete="current-password" required className="pl-10" placeholder="••••••••" />
        </div>
      </div>
      {state.error ? <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-red-400">{state.error}</p> : null}
      <SubmitButton />
      <p className="text-center text-xs text-muted-foreground">La sesión se mantiene iniciada en este dispositivo.</p>
    </form>
  )
}

export default function LoginPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10 pt-[max(2.5rem,env(safe-area-inset-top))] pb-[max(2.5rem,env(safe-area-inset-bottom))]">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="relative h-24 w-52">
            <Image src="/logo.png" alt="Revisión Coche Madrid" fill priority className="object-contain" sizes="208px" />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-bold tracking-tight">Informes de revisión</h1>
            <p className="text-sm text-muted-foreground">Acceso para el equipo de taller</p>
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-card/80 p-5 shadow-xl backdrop-blur">
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </div>
  )
}
