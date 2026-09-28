import type { MetadataRoute } from 'next'

/**
 * `/robots.txt` de `gestion.forjo.studio`.
 *
 * ── Por qué existe ────────────────────────────────────────────────────────────────────────────
 * Hasta acá el dominio **no tenía robots.txt**: pedirlo devolvía la 404 de Next. Y sin nada que lo
 * impidiera, Google indexó `/login` y `/forgot-password` — alguien que busca "Forjo Studio" se podía
 * encontrar con la pantalla de login antes que con la web. No es grave, pero no aporta nada.
 *
 * ── La regla: ALLOWLIST INVERTIDA, y esto es lo importante ─────────────────────────────────────
 * Esta app **no es sólo el panel**. Sirve también `/[slug]`, la **página pública de reservas de cada
 * negocio cliente**, que está trabajada para SEO a propósito: `generateMetadata` con Open Graph
 * (`app/[slug]/layout.tsx:29`) y JSON-LD (`buildJsonLd`, `app/[slug]/page.tsx:9`).
 *
 * ⚠ Por eso un `Disallow: /` con excepciones **NO sirve acá**: des-indexaría la página de reservas de
 * todos los clientes de un saque. El corte va al revés — se bloquea lo privado por nombre y la raíz
 * queda abierta, así que `/[slug]` y sus subrutas siguen siendo rastreables.
 *
 * Consecuencia a tener presente: **una ruta privada nueva nace rastreable** hasta que se agregue acá.
 * Ese es el costo consciente de no cerrar todo, y lo cubre la segunda capa (ver abajo).
 *
 * ── Dos capas, porque robots.txt solo no alcanza ───────────────────────────────────────────────
 * `robots.txt` pide **no rastrear**; no saca de Google lo que ya está indexado, y una URL linkeada
 * desde afuera puede seguir apareciendo. Peor: si se bloquea el rastreo, Google **ya no puede leer**
 * un `noindex` puesto después. Por eso las rutas privadas llevan además
 * `robots: { index: false, follow: false }` en el metadata de su layout — el mismo patrón que ya usa
 * `app/suspendido/page.tsx:5`. El meta es el que de verdad las saca; esto es el cartel en la puerta.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        // La raíz queda permitida A PROPÓSITO: es donde viven las páginas públicas de reserva
        // (`/[slug]`), que sí queremos indexadas.
        allow: '/',
        disallow: [
          // Auth — las dos que aparecieron indexadas y sus hermanas.
          '/login',
          '/register',
          '/forgot-password',
          '/reset-password',
          '/auth/', // callback de OAuth

          // El panel del dueño.
          '/dashboard',
          '/agenda',
          '/appointments',
          '/abonos',
          '/clients',
          '/clinical-history',
          '/consultorios',
          '/equipo',
          '/finances',
          '/negocio',
          '/servicios',
          '/settings',
          '/web',
          '/ayuda',

          // Consola interna y alta.
          '/admin',
          '/onboarding',

          // Rutas de estado y de token: no son contenido y varias llevan un token en la URL.
          '/suspendido',
          '/abono/',
          '/cancelar/',

          // API.
          '/api/',
        ],
      },
    ],
  }
}
