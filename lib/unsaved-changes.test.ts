import { describe, it, expect } from 'vitest'
import { decideNavigation, leaveNavigationPlan } from '@/lib/unsaved-changes'
import type { PanelBranchPlan } from '@/lib/panel-history'

// La decisión del guard de salida vive en una función pura porque el runner corre con
// `environment: 'node'` y sin jsdom: el componente no se puede renderizar en un test, pero el
// "qué se decide" sí se puede cubrir entero acá. Mismo criterio que agenda-hours-payload.ts.

describe('decideNavigation', () => {
  it('sin cambios pendientes deja navegar (el guard jamás molesta)', () => {
    expect(decideNavigation({ dirty: false, href: '/appointments', currentPath: '/agenda' })).toBe('allow')
  })

  it('con cambios pendientes y destino distinto pide confirmación', () => {
    expect(decideNavigation({ dirty: true, href: '/appointments', currentPath: '/agenda' })).toBe('confirm')
  })

  it('con cambios pendientes pero yendo a la ruta actual deja navegar', () => {
    // La sección activa del sidebar sigue siendo clickeable: ir a donde ya estás no pierde nada.
    expect(decideNavigation({ dirty: true, href: '/agenda', currentPath: '/agenda' })).toBe('allow')
  })

  it('un href con query a la ruta actual sigue contando como la misma ruta', () => {
    expect(decideNavigation({ dirty: true, href: '/agenda?tab=horarios', currentPath: '/agenda' })).toBe('allow')
  })

  it('un href con hash a la ruta actual sigue contando como la misma ruta', () => {
    expect(decideNavigation({ dirty: true, href: '/agenda#horarios', currentPath: '/agenda' })).toBe('allow')
  })

  it('sin cambios pendientes y misma ruta también deja navegar', () => {
    expect(decideNavigation({ dirty: false, href: '/agenda', currentPath: '/agenda' })).toBe('allow')
  })

  it('la query no confunde rutas distintas: sigue pidiendo confirmación', () => {
    expect(decideNavigation({ dirty: true, href: '/servicios?nuevo=1', currentPath: '/agenda' })).toBe('confirm')
  })

  it('un href vacío no es asunto de esta función: decide con las mismas reglas', () => {
    expect(decideNavigation({ dirty: true, href: '', currentPath: '/agenda' })).toBe('confirm')
    expect(decideNavigation({ dirty: false, href: '', currentPath: '/agenda' })).toBe('allow')
  })
})

// ── El PLAN de la continuación (quick 261006-iey, NAV-07 + NAV-11) ──────────────────────────────
// El fallo que esto cierra lo encontró el dueño en la UAT del celular: salir de Agenda hacia Finanzas
// por el menú dejaba la entrada de Agenda abajo del destino, y el atrás caía ahí en vez del
// dashboard. La causa era que con sentinel se devolvía `replace` A SECAS: reemplazaba SOBRE el
// sentinel, no sobre la entrada de la sección. La aritmética de la pila está medida en
// test/dirty-history.test.ts (simulada) y con Chrome + Page.getNavigationHistory (real).

describe('leaveNavigationPlan', () => {
  it('sin sentinel la regla de secciones manda TAL CUAL (NAV-07 no se re-decide acá)', () => {
    expect(leaveNavigationPlan({ holdsSentinel: false, sectionMode: 'replace' })).toBe('replace')
    expect(leaveNavigationPlan({ holdsSentinel: false, sectionMode: 'push' })).toBe('push')
  })

  it('con sentinel hay que CONSUMIRLO antes, y después aplicar el mismo modo de sección', () => {
    // La clave es "y después": el modo de sección no cambia por haber sentinel. Lo que cambia es
    // SOBRE QUÉ ENTRADA se aplica — sobre la de la sección, no sobre la parásita de arriba.
    expect(leaveNavigationPlan({ holdsSentinel: true, sectionMode: 'replace' })).toBe('consume-then-replace')
    expect(leaveNavigationPlan({ holdsSentinel: true, sectionMode: 'push' })).toBe('consume-then-push')
  })

  it('nunca devuelve `replace` pelado cuando hay sentinel (el fallo exacto de la UAT)', () => {
    // El caso del dueño: Agenda → Finanzas es sección→sección ⇒ `replace`. Si esto volviera a dar
    // 'replace', el reemplazo caería sobre el sentinel y el atrás volvería a Agenda.
    expect(leaveNavigationPlan({ holdsSentinel: true, sectionMode: 'replace' })).not.toBe('replace')
  })
})

// ── La mitad de la RAMA DE MÁS (criterio 4, plan 03-04) ─────────────────────────────────────────
//
// POR QUÉ LOS TRES CASOS DE ARRIBA NO SE TOCAN, y es una decisión de diseño y no pereza: adentro
// llevan **las tres formas medidas** con las que se eligió el mecanismo de dos pasos (apilar deja el
// sentinel vivo abajo; reemplazar encima del sentinel deja la sección abajo —lo que el dueño rechazó
// en la UAT—; consumir y recién entonces aplicar deja el atrás cayendo en el dashboard). El contrato
// nuevo se diseñó para que **las dos formas viejas sean casos particulares de la nueva**, justamente
// para no tener que reescribirlas.
//
// EL CASO VIVO, y por eso esto no es teórico: las dos únicas pantallas con guarda de cambios sin
// guardar son `/agenda` (destino de la barra) y **`/web` (sección de la rama de Más)**. Sin esta
// mitad, "Salir sin guardar" desde `/web` aterriza con la política de **un** nivel — el defecto que
// el quick `261006-iey` ya tuvo que arreglar una vez.

/**
 * Los **seis** planes de la rama, como un mapa TOTAL sobre el tipo.
 *
 * ⚠ **Es el candado, y no es decorativo:** `Record<PanelBranchPlan, true>` **no compila** si mañana
 * aparece un plan nuevo y nadie lo agrega acá. Una lista de literales sueltos no haría nada: se
 * quedaría corta en silencio y el caso de exhaustividad de abajo seguiría dando verde sobre los de
 * hoy. **Y ya mordió:** el sexto —`consume-exit-then-navigate`, del plan 03-06— entró al tipo y este
 * archivo dejó de compilar hasta que se agregó acá, que es exactamente para lo que existe.
 */
const TODOS_LOS_PLANES: Record<PanelBranchPlan, true> = {
  push: true,
  replace: true,
  up: true,
  'collapse-then-replace': true,
  'consume-exit-then-navigate': true,
  none: true,
}

describe('leaveNavigationPlan · los planes de la rama de Más', () => {
  it('sin sentinel, SUBIR UN NIVEL manda tal cual (D-03 no se re-decide acá)', () => {
    expect(leaveNavigationPlan({ holdsSentinel: false, sectionMode: 'up' })).toBe('up')
  })

  it('con sentinel, SUBIR UN NIVEL se consume primero y después se sube', () => {
    // Es el caso vivo: `/web` con cambios sin guardar y el dueño toca Más. Sin esto, el plan sería
    // `consume-then-push` y el atrás volvería a `/web` — la política de UN nivel.
    expect(leaveNavigationPlan({ holdsSentinel: true, sectionMode: 'up' })).toBe('consume-then-up')
  })

  it('sin sentinel, COLAPSAR Y REEMPLAZAR manda tal cual (criterio 2)', () => {
    expect(leaveNavigationPlan({ holdsSentinel: false, sectionMode: 'collapse-then-replace' })).toBe(
      'collapse-then-replace',
    )
  })

  it('con sentinel, COLAPSAR Y REEMPLAZAR se consume primero: es la cadena de TRES pasos', () => {
    // Medido en el escenario E-8 de `.planning/debug/pila-de-dos-niveles-medida.md`: consumir el
    // sentinel de cambios sin guardar, consumir la entrada de la sección y recién entonces
    // reemplazar deja `[Inicio, destino]`, con el atrás cayendo en Inicio.
    expect(leaveNavigationPlan({ holdsSentinel: true, sectionMode: 'collapse-then-replace' })).toBe(
      'consume-then-collapse-then-replace',
    )
  })

  it('sin sentinel, NO HACER NADA manda tal cual (MOB-05: el destino es la ruta actual)', () => {
    expect(leaveNavigationPlan({ holdsSentinel: false, sectionMode: 'none' })).toBe('none')
  })

  it('con sentinel, NO HACER NADA sigue consumiendo el sentinel: no hacer nada NO es no limpiar', () => {
    // El sentinel de cambios sin guardar ya se absorbió el gesto; si no se consume queda una entrada
    // muerta arriba y el próximo atrás no hace nada visible.
    expect(leaveNavigationPlan({ holdsSentinel: true, sectionMode: 'none' })).toBe('consume-then-none')
  })

  it('EXHAUSTIVIDAD: para los SEIS planes, con sentinel es el prefijo de consumo y sin sentinel es el plan pelado', () => {
    // El candado contra agregar un plan nuevo a la rama y olvidarse de esta composición. El tipo
    // obliga a sumarlo a `TODOS_LOS_PLANES`, y este caso obliga a que la composición valga para él.
    const planes = Object.keys(TODOS_LOS_PLANES) as PanelBranchPlan[]
    expect(planes).toHaveLength(6)
    for (const plan of planes) {
      expect(leaveNavigationPlan({ holdsSentinel: false, sectionMode: plan })).toBe(plan)
      expect(leaveNavigationPlan({ holdsSentinel: true, sectionMode: plan })).toBe(`consume-then-${plan}`)
    }
  })

  it('las DOS formas viejas siguen siendo casos particulares de la nueva (por eso los 3 casos medidos no se tocaron)', () => {
    expect(leaveNavigationPlan({ holdsSentinel: true, sectionMode: 'push' })).toBe('consume-then-push')
    expect(leaveNavigationPlan({ holdsSentinel: true, sectionMode: 'replace' })).toBe('consume-then-replace')
  })
})
