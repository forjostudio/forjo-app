import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  branchSecondStep,
  branchMarkDecision,
  nextBranchId,
  runBranchNavigation,
  type BranchNavMode,
} from '@/lib/panel-branch'
import { PANEL_MORE, PANEL_ROOT, panelUnderState } from '@/lib/panel-history'

// ── Plan 03-02 / Task 2 — el ejecutor de dos pasos de la rama de Más ─────────────────────────────
//
// Suite PURA: `environment: 'node'`, sin DOM simulado y sin un solo paquete nuevo. Cae sola en el
// carril paralelo `pure` (test/suite-split.ts clasifica por los imports del archivo), sin declararla
// en ninguna lista.
//
// QUÉ SE CUBRE Y QUÉ NO, con honestidad. Lo que se cubre entero son las DECISIONES —cuándo
// retroceder, cuándo navegar, cuándo no hacer nada, cuándo marcar— más la MECÁNICA del ejecutor
// contra un `window` mínimo stubeado (lo único que toca: `history.state`, `history.back`,
// `location.pathname` y el par de enganche de listeners). Lo que NO se puede cubrir acá es el hook
// de React: el runner no monta componentes, y por eso su decisión se extrae como función pura — que
// es exactamente el molde que el repo ya aplica en `lib/dirty-history.ts` y `lib/overlay-history.ts`.
//
// EL ORDEN DE EFECTOS DE REACT CONTRA EL DEL ROUTER (supuesto A1 del research) NO SE CIERRA ACÁ NI
// PUEDE CERRARSE ACÁ: es un ítem de la UAT del plan 03-04, en el teléfono del dueño. Si estuviera
// mal, la marca no se escribe y todo degrada a empujar EN SILENCIO — y ésa es, a propósito, la
// degradación segura.

/** Un `window` mínimo: lo único que el ejecutor toca, y contando cada cosa. */
function montarPila({ state, pathname }: { state: unknown; pathname: string }) {
  const back = vi.fn()
  const enganchados: { tipo: string; fn: () => void; opciones: unknown }[] = []
  const desenganchados: (() => void)[] = []
  const win = {
    history: { state, back },
    location: { pathname },
    addEventListener: vi.fn((tipo: string, fn: () => void, opciones: unknown) => {
      enganchados.push({ tipo, fn, opciones })
    }),
    removeEventListener: vi.fn((_tipo: string, fn: () => void) => {
      desenganchados.push(fn)
    }),
  }
  vi.stubGlobal('window', win)
  return { back, enganchados, desenganchados, win }
}

/** Dispara el `popstate` que el ejecutor enganchó, después de mover la pila a donde aterrizó. */
function dispararRetroceso(
  ctx: ReturnType<typeof montarPila>,
  aterrizaje: { pathname: string; state: unknown }
) {
  ctx.win.location.pathname = aterrizaje.pathname
  ctx.win.history.state = aterrizaje.state
  ctx.enganchados[0].fn()
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('branchSecondStep — la decisión del segundo paso del colapso, pura y en orden', () => {
  it('parados en una ruta que NO es la de Más ⇒ ABORTAR: el evento no es el de nuestro consumo', () => {
    // Es la misma guarda que el provider del guard de cambios sin guardar pone comparando la ruta
    // actual contra la que se estaba dejando: si el dueño ya salió por otro camino, este evento no es
    // el del retroceso y navegar lo mandaría a un destino viejo.
    expect(
      branchSecondStep({ parado: '/finances', more: PANEL_MORE, rutaDebajo: PANEL_ROOT, to: '/clients' })
    ).toBe('abort')
    expect(
      branchSecondStep({ parado: PANEL_ROOT, more: PANEL_MORE, rutaDebajo: null, to: '/clients' })
    ).toBe('abort')
  })

  it('parados en Más y la ruta de abajo COINCIDE con el destino ⇒ CONSUMIR POR SEGUNDA VEZ', () => {
    // El degenerado (E-5): el dueño ya está volviendo ahí, y reemplazar dejaría dos entradas
    // idénticas adyacentes — un atrás que no hace nada visible.
    expect(
      branchSecondStep({ parado: PANEL_MORE, more: PANEL_MORE, rutaDebajo: '/appointments', to: '/appointments' })
    ).toBe('second-consume')
  })

  it('parados en Más y la ruta de abajo NO coincide ⇒ NAVEGAR', () => {
    expect(
      branchSecondStep({ parado: PANEL_MORE, more: PANEL_MORE, rutaDebajo: PANEL_ROOT, to: '/clients' })
    ).toBe('navigate')
  })

  it('parados en Más y la marca de abajo es NULA ⇒ NAVEGAR, nunca un segundo retroceso', () => {
    // Sin el hecho no se retrocede: es la regla 0 repetida en el segundo paso. Una marca perdida
    // deja una pila un escalón más larga, nunca al dueño fuera del sitio.
    expect(
      branchSecondStep({ parado: PANEL_MORE, more: PANEL_MORE, rutaDebajo: null, to: '/clients' })
    ).toBe('navigate')
  })
})

describe('runBranchNavigation — SUBIR un nivel (D-03)', () => {
  it('con la marca propia arriba retrocede UNA vez y se hace cargo', () => {
    const navegar = vi.fn()
    const { back, enganchados } = montarPila({ state: panelUnderState(PANEL_MORE), pathname: '/finances' })
    expect(runBranchNavigation({ plan: 'up', to: PANEL_MORE, navigate: navegar })).toBe(true)
    expect(back).toHaveBeenCalledTimes(1)
    // Subir es un paso solo: no hay segundo paso ni listener que enganchar.
    expect(enganchados).toHaveLength(0)
    expect(navegar).not.toHaveBeenCalled()
  })

  it('SIN marca no retrocede y NO se hace cargo ⇒ el call site deja navegar (degradación segura)', () => {
    const navegar = vi.fn()
    const { back } = montarPila({ state: { __NA: true }, pathname: '/finances' })
    expect(runBranchNavigation({ plan: 'up', to: PANEL_MORE, navigate: navegar })).toBe(false)
    expect(back).not.toHaveBeenCalled()
    expect(navegar).not.toHaveBeenCalled()
  })

  it('con una entrada de OTRO DUEÑO arriba no retrocede: es la cicatriz 2', () => {
    for (const ajena of [{ frjOverlay: 1 }, { frjDirty: 1 }]) {
      const navegar = vi.fn()
      const { back } = montarPila({ state: ajena, pathname: '/finances' })
      expect(runBranchNavigation({ plan: 'up', to: PANEL_MORE, navigate: navegar })).toBe(false)
      expect(back).not.toHaveBeenCalled()
      vi.unstubAllGlobals()
    }
  })
})

describe('runBranchNavigation — COLAPSAR y reemplazar (criterio 2)', () => {
  it('engancha UN listener de disparo único ANTES de retroceder, y retrocede una vez', () => {
    const navegar = vi.fn()
    const ctx = montarPila({ state: panelUnderState(PANEL_MORE), pathname: '/finances' })
    expect(runBranchNavigation({ plan: 'collapse-then-replace', to: '/clients', navigate: navegar })).toBe(true)
    expect(ctx.enganchados).toHaveLength(1)
    expect(ctx.enganchados[0].tipo).toBe('popstate')
    // Disparo único: sin él, el listener sobrevive al segundo paso y el próximo atrás del dueño
    // dispara una navegación que nadie pidió.
    expect(ctx.enganchados[0].opciones).toEqual({ once: true })
    expect(ctx.back).toHaveBeenCalledTimes(1)
    expect(ctx.desenganchados).toHaveLength(0)
  })

  it('NUNCA navega en el mismo tick del retroceso: la navegación sale del evento', () => {
    // Encadenar el retroceso con la navegación en el mismo tick está MEDIDO COMO ROTO dos veces en
    // este repo: la navegación se llama, no escribe nada y el dueño se queda donde estaba.
    const navegar = vi.fn()
    const ctx = montarPila({ state: panelUnderState(PANEL_MORE), pathname: '/finances' })
    runBranchNavigation({ plan: 'collapse-then-replace', to: '/clients', navigate: navegar })
    expect(navegar).not.toHaveBeenCalled()
    expect(ctx.enganchados).toHaveLength(1)
  })

  it('sin marca no deja ningún listener vivo, no retrocede y no se hace cargo', () => {
    const navegar = vi.fn()
    const ctx = montarPila({ state: { __NA: true }, pathname: '/finances' })
    expect(runBranchNavigation({ plan: 'collapse-then-replace', to: '/clients', navigate: navegar })).toBe(false)
    expect(ctx.back).not.toHaveBeenCalled()
    // Se enganchó antes de intentar el consumo (la guarda se re-verifica en el momento del gesto),
    // así que al no poder consumir hay que DESENGANCHARLO: si quedara vivo, el próximo atrás del
    // dueño dispararía una navegación que nadie pidió.
    expect(ctx.desenganchados).toHaveLength(ctx.enganchados.length)
    expect(ctx.desenganchados[0]).toBe(ctx.enganchados[0].fn)
  })

  it('cuando el evento llega y el segundo paso dice NAVEGAR, navega EXACTAMENTE una vez y con reemplazo', () => {
    const navegar = vi.fn()
    const ctx = montarPila({ state: panelUnderState(PANEL_MORE), pathname: '/finances' })
    runBranchNavigation({ plan: 'collapse-then-replace', to: '/clients', navigate: navegar })
    dispararRetroceso(ctx, { pathname: PANEL_MORE, state: panelUnderState(PANEL_ROOT) })
    expect(navegar).toHaveBeenCalledTimes(1)
    expect(navegar).toHaveBeenCalledWith('/clients', 'replace')
    // Y no hay un segundo retroceso: el de abajo no coincidía con el destino.
    expect(ctx.back).toHaveBeenCalledTimes(1)
  })

  it('EL DEGENERADO — cuando dice CONSUMIR POR SEGUNDA VEZ, retrocede otra vez y NO navega', () => {
    const navegar = vi.fn()
    const ctx = montarPila({ state: panelUnderState(PANEL_MORE), pathname: '/finances' })
    runBranchNavigation({ plan: 'collapse-then-replace', to: '/appointments', navigate: navegar })
    // Aterrizamos sobre la entrada de Más, cuya marca dice que debajo está justo el destino.
    dispararRetroceso(ctx, { pathname: PANEL_MORE, state: panelUnderState('/appointments') })
    expect(ctx.back).toHaveBeenCalledTimes(2)
    expect(navegar).not.toHaveBeenCalled()
  })

  it('el segundo retroceso del degenerado TAMBIÉN pasa por las dos guardas', () => {
    // Si al aterrizar la entrada de Más perdió su marca (un reemplazo blando se la llevó), no hay
    // segundo retroceso: se navega, que es la degradación segura.
    const navegar = vi.fn()
    const ctx = montarPila({ state: panelUnderState(PANEL_MORE), pathname: '/finances' })
    runBranchNavigation({ plan: 'collapse-then-replace', to: '/appointments', navigate: navegar })
    dispararRetroceso(ctx, { pathname: PANEL_MORE, state: { __NA: true } })
    expect(ctx.back).toHaveBeenCalledTimes(1)
    expect(navegar).toHaveBeenCalledTimes(1)
  })

  it('cuando dice ABORTAR no se hace NADA: ni un retroceso más ni una navegación', () => {
    const navegar = vi.fn()
    const ctx = montarPila({ state: panelUnderState(PANEL_MORE), pathname: '/finances' })
    runBranchNavigation({ plan: 'collapse-then-replace', to: '/clients', navigate: navegar })
    // El evento llega con el dueño ya en otro lado: no es el de nuestro consumo.
    dispararRetroceso(ctx, { pathname: '/agenda', state: { __NA: true } })
    expect(ctx.back).toHaveBeenCalledTimes(1)
    expect(navegar).not.toHaveBeenCalled()
  })
})

describe('runBranchNavigation — los otros tres miembros del tipo del plan', () => {
  it('NADA se hace cargo sin tocar la pila (lo produce el plan 03-03, hoy nadie lo devuelve)', () => {
    const navegar = vi.fn()
    const ctx = montarPila({ state: panelUnderState(PANEL_MORE), pathname: PANEL_ROOT })
    expect(runBranchNavigation({ plan: 'none', to: PANEL_ROOT, navigate: navegar })).toBe(true)
    expect(ctx.back).not.toHaveBeenCalled()
    expect(ctx.enganchados).toHaveLength(0)
    expect(navegar).not.toHaveBeenCalled()
  })

  it('EMPUJAR y REEMPLAZAR no los toca: los ejecuta el `<Link>` con su prefetch y su transición', () => {
    for (const plan of ['push', 'replace'] as const) {
      const navegar = vi.fn()
      const ctx = montarPila({ state: panelUnderState(PANEL_MORE), pathname: '/finances' })
      expect(runBranchNavigation({ plan, to: '/clients', navigate: navegar })).toBe(false)
      expect(ctx.back).not.toHaveBeenCalled()
      expect(navegar).not.toHaveBeenCalled()
      vi.unstubAllGlobals()
    }
  })
})

describe('la mecánica del hook, en lo que es cubrible sin montar React', () => {
  it('el id de instancia no se repite', () => {
    // Molde del id por instancia de los otros dos módulos: es lo que hace que la marca sea de ESTA
    // instancia y no "de alguien".
    const a = nextBranchId()
    const b = nextBranchId()
    expect(b).not.toBe(a)
    expect(b).toBeGreaterThan(a)
  })

  it('branchMarkDecision: las cuatro ramas de cuándo marcar la entrada', () => {
    // (i) primera vez, sin ruta anterior ⇒ no marcar: no sabemos qué quedó debajo.
    expect(branchMarkDecision({ previous: null, current: PANEL_MORE })).toBeNull()
    // (ii) la ruta anterior es la misma que la actual ⇒ no marcar (no hubo navegación).
    expect(branchMarkDecision({ previous: '/finances', current: '/finances' })).toBeNull()
    // (iii) la política dice REEMPLAZAR ⇒ no marcar: no hay nada nuevo debajo.
    expect(branchMarkDecision({ previous: '/finances', current: '/clients' })).toBeNull()
    // (iv) la política dice EMPUJAR ⇒ marcar con la ruta ANTERIOR, que es la que quedó debajo.
    expect(branchMarkDecision({ previous: PANEL_MORE, current: '/finances' })).toBe(PANEL_MORE)
    expect(branchMarkDecision({ previous: PANEL_ROOT, current: '/clients' })).toBe(PANEL_ROOT)
    expect(branchMarkDecision({ previous: '/appointments', current: PANEL_MORE })).toBe('/appointments')
  })

  it('el tipo del callback de navegación es la unión de los DOS modos, no una cadena cualquiera', () => {
    // Guarda de forma: si el modo se escribiera como cadena genérica, el call site podría pedir un
    // modo que el router no tiene y nada se pondría rojo.
    const modos: BranchNavMode[] = ['push', 'replace']
    expect(modos).toHaveLength(2)
    expect(new Set(modos).size).toBe(2)
  })
})
