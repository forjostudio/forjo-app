import { describe, it, expect } from 'vitest'
import { decideNavigation, leaveNavigationPlan } from '@/lib/unsaved-changes'

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
