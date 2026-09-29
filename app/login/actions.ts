"use server"

import { AuthError } from "next-auth"
import { signIn } from "@/lib/auth"

export type LoginState = { error: string | null }

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim()
  const password = String(formData.get("password") ?? "")
  const from = String(formData.get("from") ?? "/")
  const redirectTo = from.startsWith("/") && !from.startsWith("//") ? from : "/"
  if (!email || !password) return { error: "Introduce email y contraseña" }
  try {
    await signIn("credentials", { email, password, redirectTo })
  } catch (e) {
    if (e instanceof AuthError) return { error: "Email o contraseña incorrectos" }
    throw e // NEXT_REDIRECT: redirección correcta tras el login
  }
  return { error: null }
}
