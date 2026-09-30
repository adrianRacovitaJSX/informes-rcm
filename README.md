# Revisión Coche Madrid · Informes de revisión

Webapp móvil para que el mecánico de Revisión Coche Madrid revise coches usados, marque cada punto (OK / Atención / Mal / N/A), añada notas, fotos y vídeos, y genere un informe PDF.

**Flujo:** Crear informe → Datos del coche → Revisión (Motor · Conducción · Interior · Exterior) → Resumen e incidencias → Generar PDF.

Un informe ya generado se puede seguir editando: desde su ficha se entra a cualquiera de los tres pasos y, al terminar, se regenera el PDF. El documento nuevo sustituye al anterior. Como cambia la huella del archivo, las copias repartidas antes dejan de coincidir y conviene reenviarlas.

## Stack

- Next.js 16 (App Router) + Tailwind v4, estética RCM (carbono + naranja del logo `#F17205`).
- Auth.js v5 con login por email/contraseña y sesión persistente 60 días.
- Prisma + Postgres (Neon, base de datos propia e independiente).
- Cloudflare R2 para fotos, vídeos y PDFs (10 GB gratis, sin coste de descarga). En local sin credenciales se guarda en `public/uploads`.
- PDF generado en servidor con `@react-pdf/renderer` (fotos incrustadas, vídeos como QR + enlace).
- Vídeo grabado dentro de la app (cámara del navegador + `MediaRecorder`) a 1080p y 8 Mbps. Se sube a R2 por partes de 5 MB **mientras se graba**, así que al parar solo queda el último trozo. Con el `<input capture>` del iPhone el vídeo salía en calidad media y iOS lo recomprimía antes de entregarlo, que era lo que más tardaba. Si el navegador no deja grabar, se usa la cámara del sistema.
- Subida directa a R2. Los archivos de más de 6 MB (vídeos de galería) se trocean en partes de 8 MB y se suben tres a la vez. Cada parte se reintenta hasta cuatro veces y se corta si la conexión se queda 30 s sin avanzar.
- Subida a prueba de fallos:
  - Ninguna espera es infinita. Todas las peticiones tienen límite de tiempo y reintentos, y si la grabadora del iPhone no avisa al parar se sigue con lo grabado.
  - Si la grabadora arranca sin grabar nada, se reinicia sola a los 5 s.
  - Cada vídeo se guarda en el móvil (IndexedDB) en cuanto se termina de grabar, y no se borra de ahí hasta que queda registrado en el informe.
  - Si falla la subida, la miniatura se queda en rojo con «Reintentar». Se reintenta también sola al volver la cobertura y cada 30 s, y al volver a abrir el punto si se cerró la app.
  - Registrar un archivo y cerrar una subida por partes son idempotentes, así que un reintento no duplica nada.
- Instalable como PWA: manifiesto, iconos, service worker, pantalla sin conexión y aviso de instalación.

## Puesta en marcha

```bash
npm install
npx prisma db push          # crea las tablas
npx tsx scripts/seed.ts "Nombre" email@revisioncochemadrid.es contraseña ADMIN   # crea/actualiza usuarios
npm run dev
```

## Variables de entorno (`.env`)

| Variable | Descripción |
| --- | --- |
| `DATABASE_URL` | Postgres (Neon). |
| `AUTH_SECRET` | Secreto de Auth.js (`openssl rand -hex 32`). |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL` | Cloudflare R2. Si faltan, los archivos van a `public/uploads` (solo desarrollo). |
| `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_REPLY_TO` | Envío del informe por email (ver más abajo). |
| `APP_URL` | URL pública de esta app (para los enlaces de los QR del PDF). Opcional en Vercel, se usa el origen de la petición. |

## Configurar Cloudflare R2

1. Cloudflare → **R2 Object Storage** → *Create bucket* → nombre `informes-rcm`.
2. En el bucket → **Settings → Public access**: activa *R2.dev subdomain* (o conecta un dominio propio). Copia la URL pública → `R2_PUBLIC_URL`.
3. **Settings → CORS policy** (permite subir directamente desde el móvil):
   ```json
   [
     {
       "AllowedOrigins": ["https://informes.revisioncochemadrid.es", "http://localhost:3100"],
       "AllowedMethods": ["PUT", "GET"],
       "AllowedHeaders": ["*"],
       "ExposeHeaders": ["ETag"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```
   `ExposeHeaders` con `ETag` es imprescindible: sin él no se pueden cerrar las subidas por partes de los vídeos. Si el CORS no está configurado, la app sube el archivo a través del servidor automáticamente (más lento, pero funciona).
4. R2 → **Manage R2 API Tokens** → *Create API token* con permiso *Object Read & Write* sobre el bucket. Copia *Access Key ID* y *Secret Access Key*. El *Account ID* aparece en la URL del panel de R2.

## Identidad del documento

Cada informe recibe al crearse un código público con el formato `RCM-7F3K-2M9Q`, sin letras ni números que se confundan al dictarlos por teléfono. El código aparece en el pie de todas las páginas del PDF.

Al generar el PDF se guarda además su huella SHA-256 (`pdfHash`). Con el código se localiza el documento y con la huella se comprueba que el archivo que enseña un cliente es byte a byte el que emitió Revisión Coche Madrid.

## Trazabilidad de fotos y vídeos

De cada archivo se guarda lo que permite demostrar después que pertenece a esa revisión:

| Dato | De dónde sale |
| --- | --- |
| Huella SHA-256 | Se calcula en el móvil sobre el archivo que se sube, leyéndolo por trozos (el vídeo nunca se carga entero en memoria) |
| Huella verificada | El servidor lee de R2 los archivos de hasta 40 MB y comprueba la huella él mismo |
| Fecha de la toma | EXIF de la cámara; en vídeos grabados en la app, el momento de empezar a grabar; si no, la fecha del archivo |
| Dispositivo | Marca y modelo según el EXIF |
| Fecha de subida | Reloj del servidor |
| Quién, desde dónde | Usuario, dirección IP y navegador |
| Duración y tamaño | Del propio archivo |

Los datos del EXIF se leen del archivo original, antes de comprimir la foto, porque al comprimir se pierden.

El PDF termina con una página de **registro de fotos y vídeos** donde cada archivo aparece con su punto revisado, cuándo se tomó, cuándo se subió y su huella completa. Si alguien cambiase una foto del informe, su huella dejaría de coincidir con la de esa tabla.

## Envío al cliente por email

En la ficha de un informe con PDF, el mecánico escribe el nombre y el email del cliente y pulsa **Enviar por email**. Sale un correo automático (`lib/email.ts`) con:

- El PDF adjunto (`RCM-informe-MATRICULA.pdf`).
- El resultado (correctos, atención, mal, no aplica) y las incidencias más importantes.
- El código del documento y un botón para verificarlo.

Se guarda a quién y cuándo se envió. Si el PDF se regenera después, la ficha avisa de que el cliente tiene una versión antigua.

Configuración en Resend:

1. Crear la cuenta y añadir el dominio `revisioncochemadrid.es` (Domains, Add domain).
2. Añadir en Dinahosting los registros DNS que indica Resend (SPF, DKIM y, recomendado, DMARC) y esperar a que salga "Verified".
3. Crear una API key con permiso de envío y ponerla en `RESEND_API_KEY`.

Variables: `RESEND_API_KEY`, `EMAIL_FROM` (por defecto `Revisión Coche Madrid <informes@revisioncochemadrid.es>`) y `EMAIL_REPLY_TO` (por defecto `contacto@revisioncochemadrid.es`, donde llegan las respuestas del cliente). Resend solo envía: para recibir en contacto@ hace falta un buzón (Dinahosting o Google Workspace).

## Verificación pública

`/verificar` (y `/api/verificar`) son públicas, sin iniciar sesión. Cualquiera con un informe escribe el código (`RCM-XXXX-XXXX`; vale en minúsculas o sin guiones) y ve si existe, de qué coche es (matrícula enmascarada), cuándo se emitió y el resultado. Nunca se muestran datos del cliente.

Opcionalmente puede subir el PDF: la huella SHA-256 se calcula en su navegador (el archivo no se sube) y se compara con `pdfHash`. Si no coincide, es una versión anterior o un archivo modificado.

- El pie de cada página del PDF indica `informes.revisioncochemadrid.es/verificar` (fijo en `lib/brand.ts`, no depende del servidor que lo genere).
- El email lleva un enlace directo con el código ya puesto (`/verificar?codigo=...`).
- La web enlaza aquí desde "Verifica tu informe".
- Límite de 20 consultas por minuto e IP para que no se puedan probar códigos a ciegas.

## Despliegue en Vercel

1. Importa el repo en Vercel y añade las variables de entorno anteriores.
2. Build command por defecto (`next build`). Añade `postinstall: prisma generate` si Vercel no lo ejecuta (ya está en `package.json`).
3. Dominio previsto: `informes.revisioncochemadrid.es`.

## PWA

La app se instala en el móvil como si fuera nativa.

- `public/manifest.webmanifest`: nombre, colores, orientación vertical, iconos normales y adaptativos, y acceso directo a "Nuevo informe".
- `public/sw.js`: service worker. Cachea los recursos estáticos y muestra `public/offline.html` cuando no hay cobertura. Nunca cachea la API ni los archivos de Cloudflare, así que los datos del informe siempre vienen de la red.
- `components/providers/pwa.tsx`: registra el service worker **solo en producción** y avisa con un aviso cuando hay una versión nueva.
- `components/layout/install-prompt.tsx`: en Android muestra el botón de instalar del navegador; en iPhone explica el paso manual de Compartir y Añadir a pantalla de inicio.

Para probar la instalación hay que ejecutar una compilación de producción y servirla por HTTPS:

```bash
npm run build && npm start
```

### Cambiar los iconos

Los iconos se generan a partir de `public/logo-rcm.png` (original 1254 x 1254 sobre fondo #0b0a0a). Los iconos cuadrados llevan solo el símbolo (coche + RCM), sin el lema, para que se lea en pequeño; `public/logo-pwa-informes.png` es la versión cuadrada con lema. Al cambiarlos hay que subir la constante `VERSION` de `public/sw.js` para que los dispositivos no se queden con los antiguos en caché. Archivos y tamaños:

| Archivo | Tamaño | Uso |
| --- | --- | --- |
| `public/pwa-192.png` | 192 x 192 | Icono estándar |
| `public/pwa-512.png` | 512 x 512 | Icono estándar y pantalla de carga |
| `public/pwa-maskable-192.png` | 192 x 192 | Icono adaptativo de Android, logo dentro del 60 % central |
| `public/pwa-maskable-512.png` | 512 x 512 | Icono adaptativo de Android |
| `public/apple-touch-icon.png` | 180 x 180 | Icono de iPhone, sin transparencia |
| `public/logo.png` | 912 x 417 | Logotipo completo con fondo transparente (login y pantalla sin conexión) |
| `public/logo-header.png` | 600 x 229 | Símbolo sin lema, transparente (cabecera de la app) |
| `public/logo-pdf.png` | 700 x 320 | Logotipo completo, transparente (cabecera oscura del PDF) |
| `app/icon.png` | 512 x 512 | Favicon del navegador |
