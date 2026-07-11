// ── Lightbox del landing — contrato + helpers PUROS ─────────────────────────────────
//
// Módulo PURO: sin React, sin `window`, sin imports del framework. Lo importan tanto las
// secciones RSC (gallery / rsv-strip / about, que emiten los botones-trigger) como el
// controlador cliente (components/landing/photo-lightbox.tsx, que los captura por delegación).
//
// POR QUÉ las constantes viven acá y no inline en cada sección: son el CONTRATO entre 3 RSC y
// 1 client component. Si los strings se escriben a mano en 4 archivos, alcanza con que uno se
// desincronice (un typo, un rename a medias) para que esa sección deje de abrir el visor EN
// SILENCIO: no hay error de tipos ni excepción, la foto simplemente no amplía. Una sola fuente
// de verdad lo hace imposible.
//
// POR QUÉ helpers puros y no lógica inline en el componente: vitest.config.mts corre
// `environment: 'node'` (no hay jsdom ni Testing Library) y la regla del repo es CERO paquetes
// npm nuevos. Misma resolución que components/crm/confirm-dialog.tsx: la lógica riesgosa se
// extrae a funciones puras y se testea en node; el render se valida con tsc + lint + build + UAT.

/**
 * Hash que se empuja al historial al abrir el visor.
 *
 * POR QUÉ CON HASH y no `pushState(state, '')` a secas: pushear la MISMA URL hace que el router
 * COLAPSE la entrada — no se crea ninguna entrada nueva en el historial. Resultado: el botón
 * "atrás" del celular no encuentra nada que deshacer y SACA AL USUARIO DEL SITIO en vez de
 * cerrar el visor. Esto NO es paranoia: es un bug real, ya sufrido en producción en el CMS
 * hermano (webs-cms-forjostudio/components/sections/Lightbox.tsx). El hash cambia la URL lo
 * suficiente como para que la entrada exista de verdad.
 */
export const LIGHTBOX_HASH = '#foto'

/** Atributo que marca una foto ampliable y nombra su grupo/carrusel (`gallery` | `rsv` | `about`). */
export const LIGHTBOX_GROUP_ATTR = 'data-frj-lightbox'

/** Atributo con la URL de la foto en tamaño visor. */
export const LIGHTBOX_SRC_ATTR = 'data-frj-src'

/** Grupos de fotos ampliables (D-06). El hero NO entra: es fondo/LCP, no se toca. */
export type LightboxGroup = 'gallery' | 'rsv' | 'about'

/**
 * Índice circular seguro (las flechas y las teclas ←/→ dan la vuelta).
 *
 * El caso `len === 0` está guardado a propósito: el módulo aritmético con 0 devuelve NaN, y un
 * NaN termina en `track.scrollLeft = NaN` → el track no scrollea y el visor queda en blanco sin
 * ningún error visible.
 */
export function wrapIndex(i: number, len: number): number {
  if (len <= 0) return 0
  return ((i % len) + len) % len
}

/**
 * scrollLeft que deja un slide CENTRADO dentro del track: `offsetLeft + w/2 - trackW/2`.
 *
 * Clamp a 0 obligatorio: gracias al `padding-inline` del track (D-02), el PRIMER slide ya queda
 * centrado en scrollLeft 0 y la cuenta da negativo. Un scrollLeft negativo no existe.
 */
export function centeredScrollLeft({
  slideOffsetLeft,
  slideWidth,
  trackWidth,
}: {
  slideOffsetLeft: number
  slideWidth: number
  trackWidth: number
}): number {
  const target = slideOffsetLeft + slideWidth / 2 - trackWidth / 2
  return target > 0 ? target : 0
}

/**
 * ¿La entrada de arriba del historial es la NUESTRA (la que empujamos al abrir el visor)?
 *
 * POR QUÉ es un helper puro y testeado y no un `if` inline: es la guarda del segundo bug real de
 * producción (D-05). El backdrop cierra con onClick; si el click de la X burbujea hasta él, el
 * cierre corre DOS veces → dos `history.back()` seguidos → el segundo consume una entrada que no
 * es nuestra y EL USUARIO SALE DE LA PÁGINA. `closingRef` (en el componente) hace el cierre
 * idempotente; esta función es el segundo cinturón: NUNCA llamar `history.back()` si arriba del
 * stack no está nuestra marca.
 *
 * Narrowing manual, sin `any` (tsconfig strict): el `history.state` es `unknown` de verdad —
 * puede traer el state del router de Next, el de otra librería, o null.
 */
export function shouldConsumeHistoryEntry(state: unknown): boolean {
  return (
    typeof state === 'object' &&
    state !== null &&
    'frjLightbox' in state &&
    (state as { frjLightbox?: unknown }).frjLightbox === true
  )
}
