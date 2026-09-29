// Datos de la marca que aparecen en el email al cliente, el PDF y la página de verificación.
export const brand = {
  name: "Revisión Coche Madrid",
  phone: "+34 643 34 54 59",
  email: "contacto@revisioncochemadrid.es",
  web: process.env.NEXT_PUBLIC_WEB_URL ?? "https://revisioncochemadrid.es",
  /** Dirección pública de la app, donde está la verificación. Es la que se imprime en el
   *  PDF, así que no depende del servidor desde el que se genere (local, preview...). */
  app: "https://informes.revisioncochemadrid.es",
}
