// ── La decisión del guard de salida del panel ────────────────────────────────────────────────────
//
// POR QUÉ ESTE MÓDULO EXISTE (y no vive adentro del componente): el runner corre con
// `environment: 'node'` y el repo no tiene jsdom ni testing-library instalados, así que el guard
// renderizado no se puede cubrir con un test automatizado. Lo único que SÍ se puede cubrir es el
// "qué se decide" — y por eso se extrae acá. Es el patrón que el repo ya aplica en
// `agenda-hours-payload.ts` y en los helpers puros del ConfirmDialog del CRM: la fuente de verdad
// de la decisión vive en un helper puro y el componente sólo la renderiza.
//
// Agnóstico del framework a propósito: sin React y sin `window`. Así lo puede llamar tanto el
// provider como cualquier test.
//
// ⚠ EL ÚNICO IMPORT ES DE TIPO Y SE BORRA AL COMPILAR, y está acá por una razón concreta: el plan de
// salida se compone sobre `PanelBranchPlan`, que es la política de la rama. Duplicar sus seis
// valores acá crearía un segundo dialecto —el agujero que `panelNavMode` documenta como "la clase de
// hueco silencioso que esta fase viene a cerrar"—; con el tipo importado, un plan nuevo aparece solo
// en la plantilla de abajo y en el `switch` exhaustivo del provider.

import type { PanelBranchPlan } from '@/lib/panel-history'

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
 *
 * ── Y LA TERCERA MITAD: LA RAMA DE MÁS (criterio 4, plan 03-04) ─────────────────────────────────
 *
 * **Por qué el modo de sección ya no alcanza.** Con Más en el medio, la política de navegación tiene
 * **seis** planes y no dos ({@link PanelBranchPlan}): además de empujar y reemplazar puede **subir
 * un nivel** (D-03), **colapsar y reemplazar** (criterio 2), **consumir el sentinel de salida y
 * recién entonces navegar** (plan 03-06) o **no hacer nada** (MOB-05). Decidir
 * acá con el modo de rutas a secas significa que "Salir sin guardar" aterriza con la política de
 * **un** nivel: es exactamente el defecto que el criterio 4 prohíbe, y el que el quick `261006-iey`
 * ya tuvo que arreglar una vez.
 *
 * **El caso vivo, que es lo que lo vuelve urgente y no teórico.** Las dos únicas pantallas con guarda
 * de cambios sin guardar son `/agenda` —destino de la barra— y **`/web`, que es una sección de la
 * rama de Más**. O sea que *editar la web → tocar Más → "Salir sin guardar"* tiene que aterrizar en
 * **Más**, y no en Más-encima-de-`/web`.
 *
 * **El cuerpo sigue teniendo UNA sola regla,** y el contrato se amplía **sin romper sus tres formas
 * medidas**: sin sentinel devuelve el plan tal cual; con sentinel, el mismo plan con el prefijo de
 * consumo. Las dos formas viejas (`consume-then-push`, `consume-then-replace`) son **casos
 * particulares** de la nueva, así que los tres casos de test que llevan adentro las mediciones de
 * arriba **no se tocaron** — y eso es a propósito: reescribirlos las perdería.
 *
 * ⚠ **Por qué el tipo de retorno es una PLANTILLA y no diez literales a mano:** así agregar un plan
 * nuevo a la rama **no se puede olvidar**. El nuevo entra solo en las dos mitades del tipo, el
 * `switch` exhaustivo del provider deja de compilar hasta que alguien decida qué hace, y el caso de
 * exhaustividad de la suite lo barre sin editarse.
 *
 * ⚠ **El nombre del parámetro sigue siendo `sectionMode` aunque ahora reciba el plan de la rama.**
 * Es deuda deliberada y acotada: renombrarlo obligaría a reescribir los tres casos medidos, que es
 * justo lo que este diseño existe para evitar. El tipo dice la verdad; el nombre quedó corto.
 *
 * ⚠ **Y LO QUE ESTA FUNCIÓN NO PUEDE DECIDIR, medido en el escenario E-8 de
 * `.planning/debug/pila-de-dos-niveles-medida.md`:** *cuál* de los seis planes corresponde. El plan
 * de la rama necesita la marca de la entrada de la sección, y con el sentinel de cambios sin guardar
 * arriba esa marca **no es legible** (`dirtyHistoryState` devuelve `{ frjDirty }` y nada más, así que
 * la entrada nueva no la lleva; la marca sigue viva en la entrada de abajo). Medido: `null` con el
 * sentinel arriba, `/mas` después de consumirlo. Por eso quien llama **re-deriva** el plan en el
 * `popstate` del consumo — la misma forma que `branchSecondStep` (`lib/panel-branch.ts`) ya tiene por
 * el mismo motivo. Esta función sólo dice **si hay que consumir primero**.
 */
export type LeaveNavMode = 'push' | 'replace'

/**
 * El plan de salida: un plan de la rama, o ese mismo plan precedido por el consumo del sentinel.
 *
 * `consume-then-push` y `consume-then-replace` —las dos formas que ya existían— caen adentro de la
 * plantilla sin enumerarse, que es lo que deja los casos medidos intactos.
 */
export type LeaveNavPlan = PanelBranchPlan | `consume-then-${PanelBranchPlan}`

export function leaveNavigationPlan(input: {
  holdsSentinel: boolean
  /** El plan de la rama. El nombre quedó del modo de sección: ver el ⚠ del docblock. */
  sectionMode: PanelBranchPlan
}): LeaveNavPlan {
  if (!input.holdsSentinel) return input.sectionMode
  return `consume-then-${input.sectionMode}`
}
