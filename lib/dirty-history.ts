// ── El botón "atrás" frena cuando hay cambios sin guardar (quick 261006-flm, NAV-10) ────────────
//
// POR QUÉ EXISTE
// El guard de salida del panel sólo intercepta los clicks en `<Link>` (`onNavigate`). El botón ATRÁS
// del celular navegaba y se llevaba los cambios SIN AVISAR: el dueño editaba los horarios, apretaba
// atrás y los perdía. Lo confirmó en celular real.
//
// LO QUE NO SE PUEDE HACER, Y ESTÁ MEDIDO (`.planning/debug/interceptar-atras-aviso-sin-guardar.md`)
// El atrás del usuario NO SE PUEDE CANCELAR. `popstate` llega con `cancelable: false` y su
// `preventDefault()` es un no-op; la Navigation API tampoco sirve, porque el traverse de nivel
// navegador —el botón atrás de verdad— llega `cancelable: false, userInitiated: true` (es el
// anti-history-trapping del spec). Next 16.2.7 no expone ninguna API de bloqueo para `popstate`
// (cero hits de useBlocker/blockNavigation/etc. en `next/dist/client/`), y el `beforeunload` que ya
// tienen Agenda y /web no cubre esto porque el atrás es navegación CLIENT-SIDE.
//
// ⇒ El atrás no se cancela: SE ABSORBE. Se empuja una entrada propia (el "sentinel") cuando aparecen
// cambios sin guardar, y el atrás del usuario consume ESA entrada en vez de la de la página. El
// `popstate` que llega es el aviso de que el gesto ocurrió, y ahí se pregunta. Es exactamente el
// mecanismo que `lib/overlay-history.ts` ya corre en producción sobre 39 overlays del panel,
// verificado en celular real, y que Next CONTEMPLA: el camino del back/forward setea
// `preserveCustomHistoryState: true` (`next/dist/client/components/segment-cache/navigation.js`),
// o sea que CONSERVA a propósito la marca custom de la entrada.
//
// POR QUÉ LAS DECISIONES VIVEN ACÁ Y NO ADENTRO DEL EFECTO
// `vitest.config.mts` corre `environment: 'node'`: no hay jsdom ni Testing Library y el milestone
// prohíbe paquetes nuevos. Lo único cubrible por un test es el "qué se decide" — y por eso se
// extrae. Mismo molde que `lib/overlay-history.ts`, `lib/panel-history.ts` y `lib/unsaved-changes.ts`.
// El efecto de React no decide nada: pregunta acá y ejecuta.
//
// LAS CICATRICES QUE ESTE MÓDULO HEREDA (son bugs ya sufridos, no paranoia)
//   1) EL HASH ES LO QUE HACE QUE EXISTA LA ENTRADA. Empujar la MISMA URL hace que el router COLAPSE
//      la entrada: no se crea ninguna, el atrás no tiene nada que deshacer y SACA AL USUARIO DE LA
//      PÁGINA. Ver {@link nextDirtyHash}.
//   2) NUNCA `history.back()` SIN RE-VERIFICAR LA MARCA. Consumir una entrada ajena expulsa al
//      usuario del sitio. Y acá no es hipotético: el `replace` del sidebar
//      (`components/dashboard/sidebar.tsx`) pasa por `completeSoftNavigation`, que setea
//      `preserveCustomHistoryState: false` ⇒ BORRA nuestras claves, y Agenda además tiene un
//      `history.replaceState(null, …)` crudo para limpiar el `?google=`. La guarda se escribe en
//      CADA punto de `back()`, no una sola vez. Ver {@link isDirtyHistoryEntry}.
//   3) UN SOLO DUEÑO POR ENTRADA. Dos empujes = el usuario necesita dos backs; dos consumos = un
//      `back()` de más. Lo garantiza `holdingRef`.
//
// ⚠ LA MARCA ES NUEVA Y TIENE QUE SERLO. Las dos que ya existen tienen dueño: `frjOverlay`
// (`lib/overlay-history.ts`) y `frjView` (`lib/panel-history.ts`). Reusar cualquiera de las dos es el
// peor error posible acá: el otro módulo reconocería ESTA entrada como propia y haría su `back()`
// sobre ella ⇒ doble consumo ⇒ el dueño fuera del sitio. Por eso la marca es `frjDirty` y por eso
// `lib/panel-history.ts` aprendió a RECONOCERLA para no escribirle encima (su regla 0).
//
// ANIDADO LIFO CON LOS OVERLAYS, que es la convención que el panel ya tiene: si hay cambios sin
// guardar Y un modal abierto, el atrás cierra SÓLO EL MODAL. Funciona sin coordinación entre los dos
// módulos: el modal empuja su entrada ENCIMA de la nuestra, así que cuando el browser la consume
// seguimos parados sobre la NUESTRA — y ésa es justo la condición que nos hace ignorar el evento
// ({@link dirtyPopstateAction}, regla `topIsOurs`).
//
// EL CASO INVERSO, DECLARADO Y ACEPTADO: si los cambios aparecen MIENTRAS un modal ya está abierto,
// el sentinel queda ARRIBA de la entrada del modal. Ahí el atrás pide confirmación en vez de cerrar
// el modal, y cuando el modal se cierre por su botón no va a reconocer su entrada (arriba está la
// nuestra) y la va a dejar enterrada: una entrada de más, un atrás que no hace nada visible. Se
// prefiere eso antes que diferir el empuje: sin sentinel no hay aviso, y perder el trabajo es peor
// que una entrada de más. Es el mismo trade-off que `lib/overlay-history.ts` ya documenta para el
// desmontaje por navegación.
//
// QUÉ NO HACE
//   - NO toca `lib/overlay-history.ts` (está verificado en celular y el quick lo prohíbe): convive
//     con él mirándole la marca, nada más.
//   - NO reemplaza al `beforeunload` de las pantallas: ése cubre recargar y cerrar la pestaña, que
//     no son navegación client-side.
//   - NO toca markup, clases ni estilos. Cero cambio visual.
//
// SIN DIRECTIVA `'use client'` A PROPÓSITO, igual que `lib/overlay-history.ts`: el consumidor
// (`components/dashboard/unsaved-changes-guard.tsx`) ya la declara, y marcar este módulo como
// frontera arrastraría sus funciones puras adentro sin ninguna necesidad.

import { useEffect, useRef, useState } from 'react'

// ── El contrato con el historial ─────────────────────────────────────────────────────────────────

/**
 * Hash base del sentinel.
 *
 * POR QUÉ CON HASH (cicatriz 1): empujar la misma URL colapsa la entrada y el atrás se lleva la
 * página en vez de frenar.
 *
 * ⚠ POR QUÉ ESTE TEXTO Y NO OTRO. No puede ser `#modal` ni `#modal-N`: son de
 * `lib/overlay-history.ts` y su cálculo de profundidad los interpreta. Y no puede coincidir con el
 * `id` de ningún elemento de la página o el browser scrollearía hasta él (barrido hecho: en todo el
 * panel no hay ningún `id="sin-guardar"`).
 */
export const DIRTY_HASH_BASE = '#sin-guardar'

/** El state que se empuja: sólo nuestra marca con el id de la instancia dueña de la entrada. */
export type DirtyHistoryState = { frjDirty: number }

/**
 * State de la entrada del sentinel.
 *
 * ⚠ OBJETO LITERAL FRESCO, SIEMPRE, y nunca propagando `window.history.state`: propagarlo arrastra
 * `__NA`, y el parche de `pushState` de Next toma entonces su rama temprana y NO despacha la
 * sincronización del router — la URL cambia y el router no se entera, sin un error en consola. Next
 * igual COPIA sus internos adentro de este objeto al escribir, que es lo que mantiene la entrada
 * sana (y es por eso que tampoco hay que guardarse una referencia al método original del historial).
 */
export function dirtyHistoryState(id: number): DirtyHistoryState {
  return { frjDirty: id }
}

/**
 * ¿La entrada de arriba del historial es la que empujó ESTA instancia?
 *
 * Es la guarda de la cicatriz 2 y el discriminador de tres situaciones:
 *   · antes de cualquier `back()`: si la marca no es nuestra, no se toca el historial;
 *   · en el `popstate`: si después del pop seguimos parados sobre nuestra entrada, el pop se comió
 *     una entrada AJENA de arriba (el modal del anidado LIFO) y no es asunto nuestro;
 *   · al decidir la continuación de "Salir sin guardar": hace falta saber si queda un sentinel que
 *     consumir o si ya lo pisó una escritura ajena.
 *
 * Narrowing manual, sin `any` (tsconfig `strict`): `history.state` es `unknown` de verdad — puede
 * traer el state del router de Next, el de un overlay, el de otra librería, o `null`.
 */
export function isDirtyHistoryEntry(state: unknown, id: number): boolean {
  return (
    typeof state === 'object' &&
    state !== null &&
    'frjDirty' in state &&
    (state as { frjDirty?: unknown }).frjDirty === id
  )
}

/**
 * ¿La entrada de arriba es un sentinel de cambios sin guardar, de CUALQUIER instancia?
 *
 * La versión genérica, para los dos consumidores que no son la instancia dueña:
 *   · `lib/panel-history.ts`, que necesita NO escribir encima (su regla 0);
 *   · el provider del guard, que al continuar una navegación bloqueada necesita saber si está
 *     pisando un sentinel (NAV-11).
 * Mismo criterio y misma forma que `isOverlayOwnedEntry` de `lib/panel-history.ts`.
 */
export function isDirtyOwnedEntry(state: unknown): boolean {
  return (
    typeof state === 'object' &&
    state !== null &&
    'frjDirty' in state &&
    typeof (state as { frjDirty?: unknown }).frjDirty === 'number'
  )
}

/**
 * El hash a empujar, calculado a partir del que ya está en la URL.
 *
 * POR QUÉ DEPENDE DEL ACTUAL Y NO ES UNA CONSTANTE: dos entradas consecutivas con la MISMA URL son
 * la cicatriz 1. Pasa de verdad si el dueño llega con la URL ya pegada con nuestro hash, o si el
 * sentinel se re-empuja estando todavía parados sobre uno. Un hash ajeno (`#seccion`, `#modal`) se
 * respeta: se empuja el base y al volver atrás el browser restaura el de la página.
 */
export function nextDirtyHash(currentHash: string): string {
  if (currentHash === DIRTY_HASH_BASE) return `${DIRTY_HASH_BASE}-2`
  const prefix = `${DIRTY_HASH_BASE}-`
  if (currentHash.startsWith(prefix)) {
    const depth = Number(currentHash.slice(prefix.length))
    // `Number('')` da 0 y `Number('abc')` da NaN: los dos caen al base, nunca a `#sin-guardar-NaN`.
    if (Number.isInteger(depth) && depth >= 2) return `${prefix}${depth + 1}`
  }
  return DIRTY_HASH_BASE
}

// ── Las DECISIONES, separadas del efecto ─────────────────────────────────────────────────────────

/** Qué hay que hacerle al historial en un render dado. */
export type DirtyHistoryAction = 'push' | 'consume' | 'none'

/**
 * La decisión de cada render: armar el sentinel al ensuciarse, consumirlo al limpiarse.
 *
 * `holding` (¿somos dueños de una entrada viva?) es el candado de las dos fallas simétricas: sin él
 * un re-render con cambios pendientes empujaría una SEGUNDA entrada (y el atrás habría que apretarlo
 * dos veces), y un limpiado disparado dos veces haría dos `back()` (y el segundo se comería una
 * entrada ajena ⇒ el dueño fuera del sitio).
 *
 * `participates` es "hay alguien a quien pedirle el aviso". Sin eso NO se arma nada, por la misma
 * razón que `lib/overlay-history.ts` no participa sin `dismiss`: un sentinel que absorbe el atrás y
 * después no muestra ningún diálogo convierte el gesto en un botón MUERTO, que es peor que el bug.
 *
 * `leaving` es "el dueño ya decidió salir y la salida está en curso". Mientras eso pasa, este módulo
 * NO escribe: la continuación está contando entradas y un empuje en el medio la descuadraría.
 */
export function dirtyHistoryAction({
  participates,
  dirty,
  leaving,
  holding,
}: {
  participates: boolean
  dirty: boolean
  leaving: boolean
  holding: boolean
}): DirtyHistoryAction {
  if (!participates) return 'none'
  if (leaving) return 'none'
  if (dirty) return holding ? 'none' : 'push'
  return holding ? 'consume' : 'none'
}

/**
 * La decisión al desmontar. Es la misma que la de "ya no hay nada sucio" —salir de la pantalla es el
 * camino normal por el que esto termina— y se nombra aparte para que quede explícito que no es un
 * caso olvidado.
 *
 * ⚠ El `back()` que sale de acá SÓLO se ejecuta si la marca sigue siendo nuestra. Si el desmontaje
 * fue por una NAVEGACIÓN, arriba del stack está la entrada nueva del router (y su `replace` encima
 * ya borró nuestra marca): llamar `back()` DESHARÍA la navegación del dueño.
 */
export function dirtyUnmountAction({ holding }: { holding: boolean }): DirtyHistoryAction {
  return holding ? 'consume' : 'none'
}

/** Qué significa un `popstate` para nosotros. */
export type DirtyPopstateAction = 'confirm' | 'leave' | 'ignore'

/**
 * La decisión al recibir un `popstate`, con las reglas EN ORDEN.
 *
 *   0. `leaving` — la salida ya está en curso: este pop es el PRIMER paso de la continuación (el
 *      consumo del sentinel) y lo que falta es el segundo. Va primero a propósito: mientras se sale,
 *      ninguna otra regla puede reinterpretar el evento y volver a preguntar, que sería un bucle.
 *   1. `topIsOurs` — después del pop seguimos parados sobre NUESTRA entrada ⇒ el browser consumió una
 *      entrada ajena de ARRIBA: el modal del anidado LIFO. El atrás cerró el modal y nosotros no
 *      tenemos nada que decir. Es también lo que descarta el pop de nuestro propio `back()` de
 *      limpieza y el doble montaje de StrictMode en dev.
 *   2. `!dirty` — no hay nada que proteger.
 *   3. `holding` — el pop se comió NUESTRO sentinel teniendo cambios pendientes: ÉSE es el atrás del
 *      dueño. Hay que preguntar.
 *   4. El resto se ignora: no éramos dueños de la entrada que se consumió (nos la pisó una escritura
 *      ajena, o nunca armamos), y un `back()` o un diálogo ahí serían sobre un gesto que no es
 *      nuestro.
 */
export function dirtyPopstateAction({
  topIsOurs,
  dirty,
  leaving,
  holding,
}: {
  topIsOurs: boolean
  dirty: boolean
  leaving: boolean
  holding: boolean
}): DirtyPopstateAction {
  if (leaving) return 'leave'
  if (topIsOurs) return 'ignore'
  if (!dirty) return 'ignore'
  return holding ? 'confirm' : 'ignore'
}

/** Cómo se completa un "Salir sin guardar" que arrancó desde el atrás (sin destino conocido). */
export type DirtyLeavePlan = 'consume-then-back' | 'back'

/**
 * El plan de la continuación cuando el dueño decide salir y el `popstate` NO TRAJO DESTINO.
 *
 * El gesto que el dueño pidió es "andá a la entrada anterior". Entre él y esa entrada hay DOS: el
 * sentinel que absorbió su atrás y se volvió a empujar al abrir el diálogo, y la de la página. Por
 * eso el plan normal son dos pasos, **encadenados por el `popstate` de cada uno y nunca en el mismo
 * tick**: `history.back()` es ASÍNCRONO y encadenarlo a mano está MEDIDO como roto (el segundo paso
 * se pierde y el dueño se queda donde estaba). Si la marca ya no es nuestra —una escritura ajena pisó
 * el sentinel— no hay nada que consumir y un solo paso es el gesto honesto.
 */
export function dirtyLeavePlan({ topIsOurs }: { topIsOurs: boolean }): DirtyLeavePlan {
  return topIsOurs ? 'consume-then-back' : 'back'
}

// ── La mecánica de React ─────────────────────────────────────────────────────────────────────────

// Id monotónico por instancia. Hoy sólo hay una pantalla sucia a la vez, pero el id es lo que hace
// que la marca sea de ESTA instancia y no "de alguien": sin él, dos montajes (StrictMode, o una
// transición de ruta con las dos pantallas vivas por un frame) se pisarían el sentinel.
let dirtySerial = 0

/** Id único de instancia. Exportado sólo para poder afirmar en el test que no se repite. */
export function nextDirtyId(): number {
  dirtySerial += 1
  return dirtySerial
}

/**
 * Engancha una pantalla con cambios sin guardar al historial: al ensuciarse empuja un sentinel, al
 * limpiarse lo consume, y cuando el dueño aprieta "atrás" absorbe el gesto y pide confirmación.
 *
 * @param dirty ¿Hay cambios sin guardar? Tiene que ser una COMPARACIÓN contra el estado guardado, no
 *   un latch por gesto (NAV-09): con un latch, cada gesto reflejo del dueño pediría confirmación.
 * @param confirm Pide el aviso y devuelve `true` si lo va a mostrar. Recibe la continuación de
 *   "Salir sin guardar", porque el `popstate` no trae destino y la única forma de completar el gesto
 *   es desde acá. `undefined` ⇒ no hay a quién preguntarle ⇒ no se arma nada.
 */
export function useDirtyHistory({
  dirty,
  confirm,
}: {
  dirty: boolean
  confirm: ((leave: () => void) => boolean) | undefined
}): void {
  // El id va en `useState` con inicializador LAZY —no en una ref inicializada en el render— porque
  // `react-hooks/refs` prohíbe tocar `ref.current` durante el render (y tiene razón: un render
  // descartado dejaría la ref escrita). `useState(fn)` corre `fn` una sola vez por instancia.
  const [id] = useState(nextDirtyId)

  // ¿Esta instancia es dueña de una entrada VIVA? Único candado contra el doble empuje y el doble
  // `back()`.
  const holdingRef = useRef(false)

  // ¿Hay una salida en curso? Es lo que hace que el segundo paso de la continuación no se
  // reinterprete como un atrás nuevo (y por lo tanto no vuelva a preguntar, en bucle). Un ref y no
  // estado: lo lee el handler del `popstate`, que necesita el valor FRESCO del tick anterior.
  const leavingRef = useRef(false)

  // `confirm` se arma inline en el consumidor: su identidad cambia en cada render y no queremos
  // re-suscribir el listener de `popstate` por eso.
  const confirmRef = useRef(confirm)

  const participates = confirm !== undefined

  useEffect(() => {
    confirmRef.current = confirm
  })

  // ── Armar al ensuciarse · consumir al limpiarse ───────────────────────────────────────────────
  // SIN función de limpieza a propósito: el desmontaje lo maneja el tercer efecto. Si la limpieza de
  // este efecto consumiera la entrada, cada cambio de deps la consumiría también.
  useEffect(() => {
    const action = dirtyHistoryAction({
      participates,
      dirty,
      leaving: leavingRef.current,
      holding: holdingRef.current,
    })
    if (action === 'push') {
      window.history.pushState(dirtyHistoryState(id), '', nextDirtyHash(window.location.hash))
      holdingRef.current = true
      return
    }
    // 'consume': ya no hay nada que proteger (se guardó, o se deshizo el cambio). Si el sentinel
    // quedara, el dueño tendría que apretar atrás DOS veces para salir de la pantalla.
    if (action === 'consume') {
      holdingRef.current = false
      if (isDirtyHistoryEntry(window.history.state, id)) window.history.back()
    }
  }, [participates, dirty, id])

  // ── El atrás del dueño ────────────────────────────────────────────────────────────────────────
  // El listener sólo existe mientras hay algo que proteger. Ojo con el orden de los efectos: React
  // corre TODAS las limpiezas del commit antes de las instalaciones, así que cuando el efecto de
  // arriba hace su `back()` de limpieza este listener YA se desenganchó — su `popstate` no cae sobre
  // nadie y no puede leerse como un atrás del dueño.
  useEffect(() => {
    if (!participates || !dirty) return

    const onPop = () => {
      const action = dirtyPopstateAction({
        topIsOurs: isDirtyHistoryEntry(window.history.state, id),
        dirty,
        leaving: leavingRef.current,
        holding: holdingRef.current,
      })
      if (action === 'ignore') return

      if (action === 'leave') {
        // Segundo (y último) paso de la continuación: el primero consumió el sentinel y nos dejó
        // parados en la página; esto completa el gesto que el dueño pidió. Se apaga la bandera ANTES
        // del `back()`: el `popstate` de este paso ya no tiene que significar nada.
        leavingRef.current = false
        window.history.back()
        return
      }

      // 'confirm': el browser YA consumió nuestro sentinel. Dejamos de ser dueños ANTES de pedir el
      // aviso, para que ningún otro camino intente un segundo `back()` sobre una entrada que ya no
      // es nuestra.
      holdingRef.current = false
      const avisado = confirmRef.current?.(() => {
        // La continuación de "Salir sin guardar". Vive acá y no en el provider porque el `popstate`
        // no trae destino: el único que sabe cómo completar el gesto es quien absorbió la entrada.
        const plan = dirtyLeavePlan({ topIsOurs: isDirtyHistoryEntry(window.history.state, id) })
        if (plan === 'consume-then-back') {
          leavingRef.current = true
          holdingRef.current = false
        }
        window.history.back()
      }) ?? false

      if (!avisado) {
        // Nadie va a mostrar el aviso (no hay provider, o decidió no bloquear). El gesto del dueño
        // no puede quedar muerto: se completa el atrás que absorbimos.
        window.history.back()
        return
      }

      // Re-armar EN EL ACTO. El diálogo del guard no participa del historial de overlays a propósito
      // (ver su docblock), así que mientras está abierto el sentinel es el ÚNICO absorbente: sin
      // volver a empujarlo, un segundo atrás —el dueño apretando de nuevo, con el diálogo todavía en
      // pantalla— se llevaría la página y los cambios, que es justo el bug que esto arregla.
      window.history.pushState(dirtyHistoryState(id), '', nextDirtyHash(window.location.hash))
      holdingRef.current = true
    }

    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [participates, dirty, id])

  // ── Desmontaje con cambios sin guardar todavía pendientes ─────────────────────────────────────
  // Pasa siempre que el dueño confirma salir: la pantalla se va con la bandera encendida. Sin esto
  // quedaría una entrada huérfana y el atrás siguiente no haría nada visible.
  //
  // Las deps son `[id]` y no `[]` porque el id se lee adentro; al ser constante por instancia la
  // limpieza corre SÓLO al desmontar, que es la única vez que tiene que correr.
  useEffect(() => {
    return () => {
      if (dirtyUnmountAction({ holding: holdingRef.current }) === 'none') return
      holdingRef.current = false
      // La guarda de la cicatriz 2, otra vez y no "ya la chequeé arriba": si el desmontaje fue por
      // una navegación, arriba está la entrada del router y este `back()` la desharía.
      if (isDirtyHistoryEntry(window.history.state, id)) window.history.back()
    }
  }, [id])
}
