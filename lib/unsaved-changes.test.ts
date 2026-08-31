import { describe, it, expect } from 'vitest'
import { decideNavigation } from '@/lib/unsaved-changes'

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
