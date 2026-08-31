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
 *  2. El destino apunta a la ruta actual ⇒ `allow`. La sección activa del sidebar sigue siendo
 *     clickeable y navegar a donde ya estás no pierde nada.
 *  3. El resto ⇒ `confirm`.
 *
 * Para (2) se compara sólo la PARTE DE RUTA del href: lo que hay antes del primer `?` o `#`. Un
 * destino con query o hash a la misma pantalla sigue siendo la misma pantalla.
 *
 * Un href externo o vacío no es asunto de esta función: recibe lo que le pasan y aplica las mismas
 * reglas. Quien la llama ya filtró los casos que no corresponden (los `<a target="_blank">` del
 * sidebar ni siquiera pasan por acá).
 */
export function decideNavigation(input: { dirty: boolean; href: string; currentPath: string }): NavDecision {
  if (!input.dirty) return 'allow'
  const path = input.href.split(/[?#]/)[0]
  if (path === input.currentPath) return 'allow'
  return 'confirm'
}
