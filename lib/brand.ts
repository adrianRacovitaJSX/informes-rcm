// Datos de la marca que aparecen en el email al cliente, el PDF y la página de verificación.
export const brand = {
  name: "Revisión Coche Madrid",
  phone: "+34 643 34 54 59",
  email: "contacto@revisioncochemadrid.es",
  web: process.env.NEXT_PUBLIC_WEB_URL ?? "https://revisioncochemadrid.es",
  /** Dirección pública de la app, donde está la verificación. Es la que se imprime en el PDF
   *  y se enlaza en el email, así que no depende del servidor que lo genere:
   *  APP_URL si se define; en Vercel, su dirección de producción (la .vercel.app y, cuando
   *  se conecte el dominio, informes.revisioncochemadrid.es); si no, el dominio definitivo. */
  app: (
    process.env.APP_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "https://informes.revisioncochemadrid.es")
  ).replace(/\/$/, ""),
}
