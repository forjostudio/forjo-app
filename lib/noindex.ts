import type { Metadata } from 'next'

/**
 * El `robots` de una ruta que NO debe aparecer en buscadores.
 *
 * Vive acá y no copiado en cada layout porque es una regla que hay que aplicar de forma **consistente
 * en cuatro superficies**, y porque una constante importada es greppable: `grep -rl NOINDEX app/`
 * responde "qué está cerrado" en un comando, cosa que cuatro objetos literales sueltos no hacen.
 *
 * ── Por qué el meta ADEMÁS de `app/robots.ts` ──────────────────────────────────────────────────
 * No son dos formas de lo mismo:
 *   - `robots.txt` pide **no rastrear**. No saca de Google lo que ya está indexado, y una URL
 *     linkeada desde afuera puede seguir apareciendo igual.
 *   - `noindex` pide **no indexar**, y es el que de verdad la saca.
 *
 * Y el orden importa: si una URL se bloquea en `robots.txt`, Google **ya no puede leer** un `noindex`
 * puesto después — deja de rastrearla, así que nunca ve la instrucción. Por eso conviven: el meta
 * hace el trabajo y el `robots.txt` evita el rastreo de lo que ya está cerrado.
 *
 * `follow: false` va junto a propósito: estas pantallas enlazan al panel, y no hay razón para que un
 * crawler siga esos links.
 *
 * Precedente en el repo: `app/suspendido/page.tsx` y `app/abono/cancelar/[token]/page.tsx` ya usaban
 * este shape inline antes de que existiera esta constante.
 */
export const NOINDEX: Metadata['robots'] = { index: false, follow: false }
