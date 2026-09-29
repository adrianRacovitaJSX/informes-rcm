// Crea o actualiza un usuario. Uso:
//   npx tsx scripts/seed.ts "Nombre" email@revisioncochemadrid.es contraseña [ADMIN|MECANICO]
import "dotenv/config"
import { PrismaClient } from "@prisma/client"
import { hashPassword } from "../lib/crypto"

const prisma = new PrismaClient()

async function main() {
  const [name, emailRaw, password, roleRaw] = process.argv.slice(2)
  if (!name || !emailRaw || !password) {
    console.error('Uso: npx tsx scripts/seed.ts "Nombre" email contraseña [ADMIN|MECANICO]')
    process.exit(1)
  }
  const email = emailRaw.trim().toLowerCase()
  const role = roleRaw === "ADMIN" ? "ADMIN" : "MECANICO"
  const hashed = await hashPassword(password)
  const user = await prisma.user.upsert({
    where: { email },
    update: { name, password: hashed, role },
    create: { name, email, password: hashed, role },
  })
  console.log(`✔ Usuario listo: ${user.name} <${user.email}> (${user.role})`)
}

main().finally(() => prisma.$disconnect())
