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

// ── Mecánica del carrusel: el SCROLL manda, el índice lo sigue ──────────────────────────
//
// POR QUÉ este modelo (copiado de dongiovanni-web, probado en producción) y no un índice en
// estado que ORDENA el scroll:
//   1. El índice activo se DERIVA del scrollLeft real (indexFromScroll) → el resaltado/atenuado
//      de las vecinas sigue al dedo EN VIVO durante el swipe, en vez de saltar al final.
//   2. Las flechas leen el scroll real, suman ±1 y piden `scrollTo({behavior:'smooth'})`. Nunca
//      hay dos fuentes de verdad, así que el estado no se puede desincronizar de dónde quedó el
//      dedo (y el snap del navegador no tiene contra qué pelear).
// El modelo anterior (estado → scrollLeft = x) causaba un bug REAL en iPhone: Safari revierte el
// scroll programático en un track con `scroll-snap-type: mandatory` y las flechas quedaban muertas.

/**
 * Paso entre slides = distancia entre los bordes izquierdos de dos slides consecutivos
 * (ancho + gap). Es lo que mapea scroll ↔ índice.
 *
 * `fallbackWidth` cubre el caso de 0 o 1 slide (no hay dos offsets que restar). El guard contra
 * 0 es obligatorio: un step 0 haría `scrollLeft / 0` → Infinity/NaN → el visor queda en blanco
 * sin ningún error visible.
 */
export function slideStep({
  firstOffsetLeft,
  secondOffsetLeft,
  fallbackWidth,
}: {
  firstOffsetLeft: number
  secondOffsetLeft: number | null
  fallbackWidth: number
}): number {
  const step = secondOffsetLeft === null ? fallbackWidth : secondOffsetLeft - firstOffsetLeft
  return step > 0 ? step : 1
}

/**
 * scrollLeft que deja CENTRADO al slide `i`: simplemente `i * step`.
 *
 * Por qué la cuenta es tan simple: el track lleva `padding-inline: calc((100% - cardw) / 2)`, así
 * que el slide 0 YA nace centrado con scrollLeft 0. A partir de ahí cada slide se centra un `step`
 * más a la derecha. Sin ese padding habría que restar `(trackW - cardw)/2` a mano.
 */
export function scrollLeftForIndex(i: number, step: number): number {
  const target = i * step
  return target > 0 ? target : 0
}

/**
 * Índice CIRCULAR. OJO: NO es para el carrusel (ese clampea, ver clampIndex) — es para la TRAMPA
 * DE FOCO: el Tab dentro del visor tiene que CICLAR entre sus botones y no escaparse a la página
 * de atrás. Ahí envolver sí es el comportamiento correcto.
 *
 * El guard de `len === 0` es obligatorio: el módulo con 0 devuelve NaN y `list[NaN].focus()` tira.
 */
export function wrapIndex(i: number, len: number): number {
  if (len <= 0) return 0
  return ((i % len) + len) % len
}

/** Índice CLAMPEADO (no circular): en los extremos las flechas se deshabilitan, no dan la vuelta. */
export function clampIndex(i: number, count: number): number {
  if (count <= 0) return 0
  if (i < 0) return 0
  return i > count - 1 ? count - 1 : i
}

/** Índice activo derivado del scroll real del track (el redondeo elige el slide más centrado). */
export function indexFromScroll({
  scrollLeft,
  step,
  count,
}: {
  scrollLeft: number
  step: number
  count: number
}): number {
  if (count <= 0 || step <= 0) return 0
  return clampIndex(Math.round(scrollLeft / step), count)
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
