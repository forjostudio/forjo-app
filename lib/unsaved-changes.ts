// ── La decisión del guard de salida del panel ────────────────────────────────────────────────────
//
// POR QUÉ ESTE MÓDULO EXISTE (y no vive adentro del componente): el runner corre con
// `environment: 'node'` y el repo no tiene jsdom ni testing-library instalados, así que el guard
// renderizado no se puede cubrir con un test automatizado. Lo único que SÍ se puede cubrir es el
// "qué se decide" — y por eso se extrae acá. Es el patrón que el repo ya aplica en
// `agenda-hours-payload.ts` y en los helpers puros del ConfirmDialog del CRM: la fuente de verdad
// de la decisión vive en un helper puro y el componente sólo la renderiza.
//
// Agnóstico del framework a propósito: sin React, sin `window`, sin imports. Así lo puede llamar
// tanto el provider como cualquier test.

export type NavDecision = 'allow' | 'confirm'

/**
 * Decide si una navegación puede seguir de largo o si hay que preguntar antes.
 *
 * Reglas, en orden:
 *  1. Sin cambios pendientes ⇒ `allow`. El guard nunca molesta si no hay nada que perder.
 *  2. SIN DESTINO (`href: null`) ⇒ `confirm`. Es el botón ATRÁS (NAV-10): el `popstate` no trae a
 *     dónde se va, así que la excepción de (3) no se puede evaluar — y no se puede ASUMIR que el
 *     destino sea la ruta actual, porque un atrás que no cambia de pantalla no existe. Va antes de
 *     (3) para que ningún `split` corra sobre un nulo.
 *  3. El destino apunta a la ruta actual ⇒ `allow`. La sección activa del sidebar sigue siendo
 *     clickeable y navegar a donde ya estás no pierde nada.
 *  4. El resto ⇒ `confirm`.
 *
 * Para (3) se compara sólo la PARTE DE RUTA del href: lo que hay antes del primer `?` o `#`. Un
 * destino con query o hash a la misma pantalla sigue siendo la misma pantalla.
 *
 * Un href externo o vacío no es asunto de esta función: recibe lo que le pasan y aplica las mismas
 * reglas. Quien la llama ya filtró los casos que no corresponden (los `<a target="_blank">` del
 * sidebar ni siquiera pasan por acá).
 */
export function decideNavigation(input: { dirty: boolean; href: string | null; currentPath: string }): NavDecision {
  if (!input.dirty) return 'allow'
  if (input.href === null) return 'confirm'
  const path = input.href.split(/[?#]/)[0]
  if (path === input.currentPath) return 'allow'
  return 'confirm'
}

/**
 * Cómo entra en el historial la navegación que el dueño confirmó después del aviso (NAV-11).
 *
 * **El bug que cierra, y que existe sin relación con el atrás:** la continuación hacía `router.push`
 * SIEMPRE, ignorando la regla de secciones del panel (`panelNavMode`, `lib/panel-history.ts`). O sea
 * que salir de Agenda por el menú con cambios sin guardar dejaba Agenda DEBAJO del destino y el atrás
 * caía ahí en vez de en el dashboard — rompiendo NAV-07 sólo para quien pasó por el diálogo. La regla
 * no se re-decide acá: se CONSUME la del sidebar.
 *
 * **Y la segunda mitad, que es la del sentinel, y que es lo que el quick 261006-iey corrige.** Si hay
 * un sentinel de cambios sin guardar arriba del stack (`lib/dirty-history.ts`), el modo de sección NO
 * se puede aplicar tal cual: cae sobre la entrada EQUIVOCADA. Las tres formas están MEDIDAS con
 * `Page.getNavigationHistory` (entradas + índice actual), sobre `[…, /dashboard, /agenda,
 * /agenda#sin-guardar]` saliendo hacia `/finances` (sección→sección ⇒ `replace`):
 *
 *   · **`push`** (lo que había antes de NAV-11) deja el sentinel VIVO abajo del destino ⇒ el primer
 *     atrás aterriza en una entrada MUERTA (la misma URL con nuestro hash).
 *   · **`replace` encima del sentinel** (NAV-11, primera versión) deja `[…, /dashboard, /agenda,
 *     /finances]`: el destino queda bien, pero la entrada de `/agenda` **sigue abajo** y el atrás cae
 *     AHÍ en vez del dashboard. MEDIDO, y es exactamente lo que el dueño rechazó en la UAT del celular
 *     (*"puse atrás y me mandó a Agenda, no a Dashboard"*). Era un límite declarado como aceptado; no
 *     lo era, porque NAV-07 existe para que ese atrás caiga en el dashboard.
 *   · **consumir el sentinel y RECIÉN ENTONCES aplicar el modo de sección** deja
 *     `[…, /dashboard, /finances]` con el atrás cayendo en el dashboard. Es lo que se devuelve.
 *
 * ⚠ **Por qué es un PLAN de dos pasos y no un modo:** consumir es `history.back()`, que es
 * ASÍNCRONO. Encadenar el `back()` con la navegación en el mismo tick está medido como ROTO (la
 * navegación se pierde y el dueño se queda donde estaba). El segundo paso tiene que salir del
 * `popstate` del primero — el mismo encadenamiento de dos pasos que `dirtyLeavePlan` ya usa para la
 * salida por el atrás. Esta función sólo dice QUÉ hay que hacer; el cómo (y el orden) vive en
 * `components/dashboard/unsaved-changes-guard.tsx`.
 *
 * El `consume-then-push` no es simetría de adorno: con el modo `push` (sección→dashboard) reemplazar
 * sobre el sentinel daba el mismo resultado observable, pero dejaba el sentinel como entrada de
 * FORWARD. Consumiendo primero, el `push` la trunca y no queda nada muerto adelante.
 */
export type LeaveNavMode = 'push' | 'replace'

export type LeaveNavPlan = LeaveNavMode | 'consume-then-push' | 'consume-then-replace'

export function leaveNavigationPlan(input: {
  holdsSentinel: boolean
  sectionMode: LeaveNavMode
}): LeaveNavPlan {
  if (!input.holdsSentinel) return input.sectionMode
  return input.sectionMode === 'replace' ? 'consume-then-replace' : 'consume-then-push'
}
