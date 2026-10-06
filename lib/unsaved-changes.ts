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
 * **El bug que cierra, y que existe HOY sin relación con el atrás:** la continuación hacía
 * `router.push` SIEMPRE, ignorando la regla de secciones del panel (`panelNavMode`,
 * `lib/panel-history.ts`). O sea que salir de Agenda por el menú con cambios sin guardar dejaba
 * Agenda DEBAJO del destino y el atrás caía ahí en vez de en el dashboard — rompiendo NAV-07 sólo
 * para quien pasó por el diálogo. La regla no se re-decide acá: se CONSUME la del sidebar.
 *
 * **Y la segunda mitad, que es la del sentinel:** si hay un sentinel de cambios sin guardar arriba
 * del stack (`lib/dirty-history.ts`), la continuación tiene que `replace` ENCIMA DE ÉL cualquiera
 * sea la regla de secciones. Está MEDIDO:
 *   · `push` deja el sentinel vivo abajo del destino ⇒ el primer atrás aterriza en una entrada
 *     MUERTA (la misma URL con nuestro hash) y hace falta un segundo atrás para llegar a algún lado;
 *   · `replace` encima del sentinel deja el destino bien y UN SOLO atrás vuelve a la pantalla de
 *     origen — que es exactamente lo que `push` habría conseguido si el sentinel no existiera,
 *     porque el sentinel es una entrada parásita que vive justo arriba de la entrada real.
 * Encadenar un `back()` con la navegación —la otra forma de sacarse el sentinel de encima— está
 * medido como ROTO: `history.back()` es asíncrono y la navegación encadenada se pierde.
 *
 * **El límite aceptado, igual al que ya documenta `panelNavMode` para las entradas de overlay:**
 * cuando la regla de secciones pedía `replace` y hay sentinel, el reemplazo cae sobre el sentinel y
 * no sobre la entrada de la sección, así que quedan dos secciones encima del dashboard. Es mejor que
 * un atrás muerto, y pelearlo exigiría consumir dos entradas en cadena.
 */
export type LeaveNavMode = 'push' | 'replace'

export function leaveNavigationMode(input: {
  holdsSentinel: boolean
  sectionMode: LeaveNavMode
}): LeaveNavMode {
  if (input.holdsSentinel) return 'replace'
  return input.sectionMode
}
