// ── El botón "atrás" del celular cierra el overlay, no la página (quick 260928-seo) ──────────────
//
// POR QUÉ EXISTE
// Los 35 `<Dialog>` y 4 `<Drawer>` del panel no participaban del modelo de historia del navegador:
// no empujaban ninguna entrada, así que el "atrás" del celular popeaba la última entrada de RUTA y
// el dueño perdía la pantalla entera por un gesto que en cualquier app nativa cierra el overlay.
// Como los 39 pasan por un único wrapper cada uno (`components/ui/dialog.tsx` y
// `components/ui/drawer.tsx`, los dos pass-through al primitivo), el arreglo se engancha ahí y NO
// hay que tocar ninguna de las 18 pantallas.
//
// POR QUÉ LA LÓGICA VIVE ACÁ Y NO ADENTRO DEL EFECTO
// `vitest.config.mts` corre `environment: 'node'`: no hay jsdom ni Testing Library, y el milestone
// prohíbe paquetes nuevos. La única forma de testear esto es separar las decisiones puras (qué hash
// empujar, si la entrada de arriba del stack es nuestra, qué detalle de cierre se sintetiza) de la
// mecánica de React. Mismo molde que `lib/landing/lightbox.ts` + `lib/landing/lightbox.test.ts`,
// que resolvió este mismo problema para el visor de fotos del landing.
//
// LAS TRES CICATRICES QUE ESTE MÓDULO HEREDA DEL LIGHTBOX (son bugs ya sufridos, no paranoia)
//   1) EL HASH ES LO QUE HACE QUE FUNCIONE. Empujar la MISMA URL hace que el router COLAPSE la
//      entrada: no se crea ninguna entrada nueva, así que el "atrás" no tiene nada que deshacer y
//      SACA AL USUARIO DE LA PÁGINA. Ver {@link nextOverlayHash}.
//   2) NUNCA `history.back()` sin verificar que arriba del stack está NUESTRA marca. Consumir una
//      entrada ajena es exactamente el camino que expulsa al usuario. Ver
//      {@link isOverlayHistoryEntry}.
//   3) El cierre tiene que ser IDEMPOTENTE: dos disparos del mismo cierre = dos `back()` = adiós
//      página. Acá lo garantiza `holdingRef` (un único dueño de la entrada por instancia).
//
// LA TRAMPA PROPIA DE ESTE ARREGLO (la razón por la que el plan existe)
// `guardDraftOnDismiss` (`lib/panel-draft.ts`, la guarda G-23-25 de la Phase 23) sólo veta el cierre
// cuando el motivo es `'outside-press'` o `'escape-key'`. Un cierre disparado por `popstate` no trae
// ninguno de esos motivos: caería derecho en `close()` y DESCARTARÍA UN BORRADOR SUCIO SIN AVISAR,
// reintroduciendo por la puerta de atrás del celular el bug que esa fase arregló. Por eso el cierre
// por back viaja por el MISMO `onOpenChange(open, details)` que los demás motivos, con un motivo
// propio ({@link HISTORY_BACK_REASON}) que `lib/panel-draft.ts` suma a su lista de accidentales.
//
// Y SI EL CIERRE SE VETA, LA ENTRADA VUELVE. El browser ya consumió la entrada cuando disparó el
// `popstate`; si el overlay NO se cierra, hay que volver a empujarla o el modal queda abierto sin su
// entrada y el siguiente back se lleva la página. El disparador de ese re-push es el `tick` del hook.
//
// QUÉ NO HACE
//   - NO arregla el otro bug de navegación mobile (que el back salte a otra sección): eso necesita
//     convertir las subsecciones in-page del panel en rutas reales y es un milestone propio.
//   - NO toca markup, clases ni estilos. Cero cambio visual.
//
// SIN DIRECTIVA `'use client'` A PROPÓSITO: los dos wrappers que lo consumen ya la declaran, y
// `lib/panel-draft.ts` —que es la fuente de las reglas puras del borrador— importa de acá el motivo
// de cierre. Marcar este módulo como frontera de cliente arrastraría a `panel-draft` adentro de esa
// frontera sin ninguna necesidad.

import { useEffect, useRef, useState } from 'react'
// Sólo el TIPO del detalle de cierre de Base UI, igual que en `lib/panel-draft.ts`: es un
// `import type`, se borra al compilar, así que el motivo nuevo queda chequeado contra la unión real
// del paquete sin que este módulo arrastre runtime de UI.
import type { DialogRootChangeEventDetails } from '@base-ui/react/dialog'

// ── El contrato con el historial ─────────────────────────────────────────────────────────────────

/**
 * Hash base que se empuja al abrir un overlay.
 *
 * POR QUÉ CON HASH y no `pushState(state, '')` a secas (cicatriz 1): empujar la MISMA URL hace que
 * el router COLAPSE la entrada — no se crea ninguna entrada nueva, el "atrás" del celular no
 * encuentra nada que deshacer y saca al usuario de la página en vez de cerrar el overlay. Es un bug
 * real, ya sufrido en producción en el CMS hermano y documentado en `lib/landing/lightbox.ts`. El
 * hash cambia la URL lo justo para que la entrada exista de verdad.
 *
 * No hay ningún elemento con `id="modal"` en el panel, así que el hash no dispara scroll: `pushState`
 * no navega, y al volver atrás el browser restaura el scroll de la entrada anterior.
 */
export const OVERLAY_HASH_BASE = '#modal'

/**
 * Motivo de cierre que viaja en el detalle cuando el cierre lo disparó el "atrás".
 *
 * Kebab-case para quedar del lado de la convención de Base UI (`'outside-press'`, `'escape-key'`) y
 * no colisionar con ninguno de sus 35 motivos: la unión del paquete no tiene nada parecido.
 */
export const HISTORY_BACK_REASON = 'history-back'

/** El state que se empuja: sólo nuestra marca con el id de la instancia dueña de la entrada. */
export type OverlayHistoryState = { frjOverlay: number }

/**
 * State de la entrada de un overlay.
 *
 * ⚠ Next MUTA este objeto: su parche de `window.history.pushState`
 * (`next/dist/client/components/app-router.js`, `copyNextJsInternalHistoryState`) le COPIA ADENTRO
 * `__NA` y `__PRIVATE_NEXTJS_INTERNALS_TREE` del state actual, sin borrar nuestras claves. Esos dos
 * campos son obligatorios y no opcionales: el `onPopState` de Next recarga la página entera si la
 * entrada a la que se vuelve no lleva `__NA`. Por eso NO hay que empujar con el `pushState` original
 * ni con `history.replaceState` crudo — el parche de Next es el que mantiene la entrada sana.
 */
export function overlayHistoryState(id: number): OverlayHistoryState {
  return { frjOverlay: id }
}

/**
 * ¿La entrada de arriba del historial es la que empujó ESTA instancia?
 *
 * Es la guarda de la cicatriz 2 y el discriminador de TRES situaciones distintas:
 *   · antes de un `history.back()` de limpieza: si la marca no es nuestra, no se toca el historial;
 *   · en el `popstate`: si después del pop seguimos parados sobre una entrada NUESTRA, el pop no fue
 *     un back del usuario sino un `back()` de limpieza (o el doble montaje de StrictMode en dev) →
 *     no hay que cerrar nada;
 *   · con overlays anidados: cada instancia tiene su id, así que el back cierra SÓLO el de arriba.
 *
 * Narrowing manual, sin `any` (tsconfig `strict`): `history.state` es `unknown` de verdad — puede
 * traer el state del router de Next, el de otra librería, o `null`.
 */
export function isOverlayHistoryEntry(state: unknown, id: number): boolean {
  return (
    typeof state === 'object' &&
    state !== null &&
    'frjOverlay' in state &&
    (state as { frjOverlay?: unknown }).frjOverlay === id
  )
}

/**
 * El hash a empujar, calculado a partir del que ya está en la URL.
 *
 * POR QUÉ DEPENDE DEL ACTUAL Y NO ES UNA CONSTANTE: dos entradas consecutivas con la MISMA URL son
 * exactamente la cicatriz 1. Con overlays anidados el segundo empuje ocurre estando ya en `#modal`,
 * así que necesita un hash distinto (`#modal-2`, `#modal-3`, …). Con un solo overlay el hash previo
 * es el de la página (vacío o cualquier otro) y siempre alcanza con el base.
 *
 * Un hash ajeno (`#seccion`) se respeta: se empuja el base y al volver atrás el browser restaura el
 * de la página. Un `#modal-basura` que no sea nuestro cae al base en vez de tirar NaN.
 */
export function nextOverlayHash(currentHash: string): string {
  if (currentHash === OVERLAY_HASH_BASE) return `${OVERLAY_HASH_BASE}-2`
  const prefix = `${OVERLAY_HASH_BASE}-`
  if (currentHash.startsWith(prefix)) {
    const depth = Number(currentHash.slice(prefix.length))
    // `Number('')` da 0 y `Number('abc')` da NaN: los dos caen al base, nunca a `#modal-NaN`.
    if (Number.isInteger(depth) && depth >= 2) return `${prefix}${depth + 1}`
  }
  return OVERLAY_HASH_BASE
}

// ── El detalle de cierre sintético ───────────────────────────────────────────────────────────────

/**
 * Detalle que acompaña al cierre disparado por el "atrás".
 *
 * TIENE TODOS LOS CAMPOS DEL DETALLE DE BASE UI a propósito, aunque la guarda del borrador sólo mire
 * `reason` y `cancel`. Así {@link OverlayDismissDetails} es una unión con las mismas claves en las dos
 * ramas y cualquier consumidor actual o futuro puede leer `details.event` o
 * `details.preventUnmountOnClose()` sin que TypeScript lo obligue a estrechar la unión primero. Si
 * este tipo fuera mínimo, el día que una pantalla lea otro campo el error aparecería lejos de acá.
 */
export type OverlayHistoryBackDetails = {
  reason: typeof HISTORY_BACK_REASON
  /** El `PopStateEvent` real, no uno inventado: el motivo nuevo mapea a `Event` en Base UI. */
  event: PopStateEvent
  cancel: () => void
  allowPropagation: () => void
  isCanceled: boolean
  isPropagationAllowed: boolean
  trigger: Element | undefined
  preventUnmountOnClose: () => void
}

/**
 * Lo que recibe el `onOpenChange` de los wrappers: el detalle real de Base UI o el nuestro.
 *
 * Al ser una UNIÓN (y no el tipo de Base UI con el `reason` ensanchado) la rama de Base UI llega
 * intacta a las pantallas: ninguna pierde tipado por este cambio.
 */
export type OverlayDismissDetails = DialogRootChangeEventDetails | OverlayHistoryBackDetails

/**
 * Arma el detalle del cierre por "atrás" con un `cancel()` que FUNCIONA.
 *
 * `cancel()` es lo que `guardDraftOnDismiss` llama para vetar el cierre cuando el borrador está
 * sucio. Acá deja el veto asentado en `isCanceled` —testeable sin DOM— aunque el re-push de la
 * entrada no dependa de leerlo: el hook decide re-empujar observando que el overlay SIGUIÓ abierto,
 * que es la única señal que también sirve para los overlays cuyo veto no pasa por `cancel()` (el
 * `requestClose` del alta de turno/abono abre su propio diálogo de descarte, y vaul ni siquiera tiene
 * detalle de cierre). Un solo mecanismo de re-push para los dos casos.
 */
export function createHistoryBackDetails(event: PopStateEvent): OverlayHistoryBackDetails {
  const details: OverlayHistoryBackDetails = {
    reason: HISTORY_BACK_REASON,
    event,
    cancel: () => {
      details.isCanceled = true
    },
    // `allowPropagation` no tiene sentido acá: no hay handler de Base UI que esté deteniendo la
    // propagación de un `popstate`. Se deja como no-op para completar la forma del detalle.
    allowPropagation: () => {},
    isCanceled: false,
    isPropagationAllowed: false,
    // No hubo elemento disparador: el evento lo originó el browser, no un click.
    trigger: undefined,
    preventUnmountOnClose: () => {},
  }
  return details
}

// ── Las DECISIONES, separadas del efecto ─────────────────────────────────────────────────────────
//
// El efecto de React de más abajo no decide nada: pregunta acá y ejecuta. Es lo que hace testeable
// sin DOM la mecánica completa (abrir → back → cierra · abrir → ✕ → sin entrada huérfana ·
// desmontaje), que es exactamente donde viven los bugs de historial.

/** Qué hay que hacerle al historial en un render dado. */
export type OverlayHistoryAction = 'push' | 'consume' | 'none'

/**
 * La decisión de cada render.
 *
 * `holding` (¿somos dueños de una entrada viva?) es el candado de las dos fallas simétricas: sin él
 * un re-render con el overlay abierto empujaría una SEGUNDA entrada (y el usuario necesitaría dos
 * backs), y un cierre disparado dos veces haría dos `back()` (y el segundo se comería una entrada
 * ajena → el usuario fuera de la página).
 */
export function overlayHistoryAction({
  participates,
  open,
  holding,
}: {
  participates: boolean
  open: boolean | undefined
  holding: boolean
}): OverlayHistoryAction {
  if (!participates) return 'none'
  if (open) return holding ? 'none' : 'push'
  return holding ? 'consume' : 'none'
}

/**
 * La decisión al desmontar. Es la misma que la del cierre por `open: false` —el desmontaje CON el
 * overlay abierto es el camino de cierre normal de los overlays que se montan condicionalmente— y se
 * nombra aparte para que quede explícito que no es un caso olvidado.
 */
export function overlayUnmountAction({ holding }: { holding: boolean }): OverlayHistoryAction {
  return holding ? 'consume' : 'none'
}

/**
 * La decisión al recibir un `popstate`.
 *
 * `topIsOurs` = después del pop seguimos parados sobre una entrada de ESTA instancia ⇒ el pop no fue
 * un back del usuario sino un `back()` de limpieza nuestro (o el doble montaje de StrictMode en dev,
 * que empuja dos veces y consume una). Cerrar ahí sería un cierre fantasma.
 */
export function popstateAction({ topIsOurs }: { topIsOurs: boolean }): 'dismiss' | 'ignore' {
  return topIsOurs ? 'ignore' : 'dismiss'
}

// ── La mecánica de React ─────────────────────────────────────────────────────────────────────────

// Id monotónico por instancia de overlay. Es lo que hace que los overlays ANIDADOS funcionen: cada
// uno reconoce SÓLO su propia entrada, así que el back cierra el de arriba y deja al de abajo
// abierto (LIFO), que es el comportamiento correcto. CLAUDE.md desaconseja anidarlos, pero el panel
// los tiene de hecho (el diálogo "¿Descartar el turno?" convive con el drawer del alta), así que el
// hook los APILA en vez de ignorar el segundo: ignorarlo dejaría al de adentro sin su back.
let overlaySerial = 0

/** Id único de instancia. Exportado sólo para poder afirmar en el test que no se repite. */
export function nextOverlayId(): number {
  overlaySerial += 1
  return overlaySerial
}

/**
 * Engancha un overlay al historial del navegador: al abrirse empuja una entrada, al cerrarse la
 * consume, y cuando el usuario aprieta "atrás" pide el cierre por el mismo camino que los demás
 * motivos.
 *
 * SÓLO PARTICIPA SI EL OVERLAY ES CONTROLADO Y TIENE A QUIÉN PEDIRLE EL CIERRE (`open` definido +
 * `dismiss` presente). Los 39 overlays del panel son controlados, pero los NO controlados (los que
 * se manejan con `Trigger` y `defaultOpen`) tienen que seguir funcionando igual que siempre: sin
 * `open` no hay forma de saber el estado real ni de forzar el cierre, y empujar una entrada que
 * después no podemos consumir dejaría basura en la pila — peor que el bug que arreglamos. Sin
 * `dismiss` sería todavía peor: el back no cerraría nada y el re-push lo volvería un gesto MUERTO,
 * dejando al usuario sin poder salir de la página.
 *
 * @param open Estado controlado del overlay. `undefined` ⇒ no controlado ⇒ no participa.
 * @param dismiss Pide el cierre por el `onOpenChange` del wrapper. `undefined` ⇒ no participa.
 */
export function useOverlayHistory({
  open,
  dismiss,
}: {
  open: boolean | undefined
  dismiss: ((event: PopStateEvent) => void) | undefined
}): void {
  // El id va en `useState` con inicializador LAZY —no en una ref inicializada en el render— porque
  // `react-hooks/refs` prohíbe leer o escribir `ref.current` durante el render (y tiene razón: un
  // render descartado dejaría la ref escrita). `useState(fn)` corre `fn` una sola vez por instancia y
  // el valor nunca cambia, así que no provoca ni un re-render de más.
  const [id] = useState(nextOverlayId)

  // ¿Esta instancia es dueña de una entrada VIVA en el historial? Es el único candado contra el
  // doble empuje (un re-render no puede empujar dos veces) y contra el doble `back()`.
  const holdingRef = useRef(false)

  // `dismiss` se guarda en una ref porque los wrappers lo arman inline: su identidad cambia en cada
  // render y no queremos re-suscribir el listener de `popstate` por eso.
  const dismissRef = useRef(dismiss)

  // El disparador del RE-PUSH cuando el cierre se veta. Sin él el efecto no volvería a correr —
  // `open` no cambió— y el overlay quedaría abierto sin su entrada: el siguiente back se llevaría la
  // página, que es justo lo que este arreglo viene a evitar.
  const [tick, setTick] = useState(0)

  const participates = open !== undefined && dismiss !== undefined

  useEffect(() => {
    dismissRef.current = dismiss
  })

  // ── Empujar al abrir · consumir al cerrar ──────────────────────────────────────────────────────
  // SIN función de limpieza a propósito: el desmontaje lo maneja el tercer efecto. Si la limpieza de
  // este efecto consumiera la entrada, cada cambio de `tick` la consumiría también.
  useEffect(() => {
    const action = overlayHistoryAction({ participates, open, holding: holdingRef.current })
    if (action === 'push') {
      window.history.pushState(
        overlayHistoryState(id),
        '',
        nextOverlayHash(window.location.hash),
      )
      holdingRef.current = true
      return
    }
    // 'consume': el overlay se cerró por cualquier otro camino (✕, Guardar, Escape, click afuera).
    // Hay que consumir la entrada o el usuario tiene que apretar back DOS veces para salir.
    if (action === 'consume') {
      holdingRef.current = false
      if (isOverlayHistoryEntry(window.history.state, id)) window.history.back()
    }
  }, [participates, open, tick, id])

  // ── El back del usuario ───────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!participates || !open) return

    const onPop = (event: PopStateEvent) => {
      const topIsOurs = isOverlayHistoryEntry(window.history.state, id)
      // 'ignore': la entrada que quedó arriba sigue siendo nuestra ⇒ no hay nada que cerrar.
      if (popstateAction({ topIsOurs }) === 'ignore') return
      // El browser YA consumió la entrada: dejamos de ser dueños ANTES de pedir el cierre, para que
      // el efecto de arriba no intente un segundo `back()`.
      holdingRef.current = false
      dismissRef.current?.(event)
      // Si el cierre se vetó, `open` sigue en true y este tick hace que el efecto re-empuje.
      setTick((t) => t + 1)
    }

    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [participates, open, id])

  // ── Desmontaje con el overlay ABIERTO ─────────────────────────────────────────────────────────
  // Es el camino de cierre NORMAL de varios overlays del panel: se montan condicionalmente
  // (`{sel && <Dialog open …>}`), así que cerrarlos los DESMONTA en vez de poner `open` en false.
  // Sin esto dejarían una entrada huérfana y el back siguiente no haría nada visible.
  //
  // El guard de la marca es lo que distingue el otro caso: si el desmontaje fue por una NAVEGACIÓN
  // con el overlay abierto, arriba del stack está la entrada nueva del router, no la nuestra, y
  // llamar `back()` DESHARÍA la navegación del usuario. En ese caso la entrada queda enterrada: al
  // volver a esta página hará falta un back extra para salir. Es el precio consciente de no pelear
  // con el router — y el listener, que es lo que sí podría hacer daño, se va con el efecto de arriba.
  //
  // Las deps son `[id]` y no `[]` porque el id se lee adentro; al ser constante por instancia la
  // limpieza sigue corriendo SÓLO al desmontar, que es la única vez que tiene que correr.
  useEffect(() => {
    return () => {
      if (overlayUnmountAction({ holding: holdingRef.current }) === 'none') return
      holdingRef.current = false
      if (isOverlayHistoryEntry(window.history.state, id)) window.history.back()
    }
  }, [id])
}
