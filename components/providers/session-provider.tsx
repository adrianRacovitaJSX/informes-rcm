"use client"

import { SessionProvider } from "next-auth/react"
import type { Session } from "next-auth"

export function NextAuthSessionProvider({
  children,
  session,
}: {
  children: React.ReactNode
  /** Sesión del servidor. Si llega `undefined`, el proveedor la pide al cliente. */
  session: Session | undefined
}) {
  return <SessionProvider session={session}>{children}</SessionProvider>
}
