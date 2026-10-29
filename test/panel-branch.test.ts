import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  branchSecondStep,
  branchMarkDecision,
  nextBranchId,
  runBranchNavigation,
  type BranchNavMode,
} from '@/lib/panel-branch'
import { PANEL_MORE, PANEL_ROOT, panelUnderState } from '@/lib/panel-history'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
// ⚠ LOS DOS NAMESPACES SE IMPORTAN A PROPÓSITO, además de los nombrados de arriba, y es por el ciclo
// RED-GREEN: todo lo que el plan 03-03 agrega se afirma como `PB.algo` / `PH.algo` y no como import
// nombrado, porque un import nombrado que todavía no existe revienta al CARGAR el módulo — ese rojo
// es del loader y no de la decisión, así que no distingue "falta la regla" de "el archivo no
// compila". Con el namespace, el único rojo posible es el de la aserción.
import * as PB from '@/lib/panel-branch'
import * as PH from '@/lib/panel-history'
// Los hashes de los otros dos dueños, IMPORTADOS y no copiados como literales: el criterio (a) de
// elección del hash del sentinel se afirma contra la fuente de verdad de cada módulo, así que el día
// que uno de ellos cambie su texto, este candado lo ve.
import { OVERLAY_HASH_BASE } from '@/lib/overlay-history'
import { DIRTY_HASH_BASE } from '@/lib/dirty-history'

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
  // `replaceState` hace falta desde el plan 03-05: el consumidor del canal de propagación escribe la
  // marca con el escritor único de `lib/panel-history.ts`, y ése reemplaza el state de la entrada.
  const replaceState = vi.fn()
  const enganchados: { tipo: string; fn: () => void; opciones: unknown }[] = []
  const desenganchados: (() => void)[] = []
  const win = {
    history: { state, back, replaceState },
    location: { pathname },
    addEventListener: vi.fn((tipo: string, fn: () => void, opciones: unknown) => {
      enganchados.push({ tipo, fn, opciones })
    }),
    removeEventListener: vi.fn((_tipo: string, fn: () => void) => {
      desenganchados.push(fn)
    }),
  }
  vi.stubGlobal('window', win)
  return { back, replaceState, enganchados, desenganchados, win }
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
  // ⚠ LOS DOS DATOS A NIVEL DE MÓDULO SE DRENAN ANTES DE SOLTAR EL `window`, y en este orden: son
  // estado del módulo, así que sobreviven al test, y un pedido o un aterrizaje colgado del test
  // anterior envenenaría el siguiente — que es, literalmente, el bug que el plan 03-05 cierra.
  PB.takeBackLanding()
  PB.applyBranchMarkRequest('__drenaje__')
  // El TERCER dato que sobrevive al test (plan 03-12): el canal de diagnóstico vive en `globalThis`,
  // así que un canal abierto por un caso dejaría grabando al siguiente. Se cierra igual que los dos
  // de arriba, antes de soltar el `window`.
  delete (globalThis as { __forjoPanelDiag?: unknown }).__forjoPanelDiag
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
    // SIN el hecho del retroceso, las cuatro ramas de siempre dan EXACTAMENTE lo de antes.
    const EMPUJE = { vieneDeUnRetroceso: false }
    // (i) primera vez, sin ruta anterior ⇒ no marcar: no sabemos qué quedó debajo.
    expect(branchMarkDecision({ previous: null, current: PANEL_MORE, ...EMPUJE })).toBeNull()
    // (ii) la ruta anterior es la misma que la actual ⇒ no marcar (no hubo navegación).
    expect(branchMarkDecision({ previous: '/finances', current: '/finances', ...EMPUJE })).toBeNull()
    // (iii) la política dice REEMPLAZAR ⇒ no marcar: no hay nada nuevo debajo.
    expect(branchMarkDecision({ previous: '/finances', current: '/clients', ...EMPUJE })).toBeNull()
    // (iv) la política dice EMPUJAR ⇒ marcar con la ruta ANTERIOR, que es la que quedó debajo.
    expect(branchMarkDecision({ previous: PANEL_MORE, current: '/finances', ...EMPUJE })).toBe(PANEL_MORE)
    expect(branchMarkDecision({ previous: PANEL_ROOT, current: '/clients', ...EMPUJE })).toBe(PANEL_ROOT)
    expect(branchMarkDecision({ previous: '/appointments', current: PANEL_MORE, ...EMPUJE })).toBe('/appointments')
  })

  it('el tipo del callback de navegación es la unión de los DOS modos, no una cadena cualquiera', () => {
    // Guarda de forma: si el modo se escribiera como cadena genérica, el call site podría pedir un
    // modo que el router no tiene y nada se pondría rojo.
    const modos: BranchNavMode[] = ['push', 'replace']
    expect(modos).toHaveLength(2)
    expect(new Set(modos).size).toBe(2)
  })
})

// ── Plan 03-03 — el ciclo del SENTINEL DE SALIDA (MOB-05 / D-01 / D-05) ──────────────────────────
//
// Lo que se cubre entero son las DECISIONES —cuándo armar, qué significa un retroceso, y el quinto
// miembro del plan de navegación— más las auditorías de fuente que ningún otro gate puede ver: la
// regla de la constante única de §13 y el candado anti-deriva del literal de la clave.
//
// Lo que NO se puede cubrir acá sigue siendo el hook de React (el runner no monta componentes), y por
// eso su decisión se extrae como función pura. El aviso visible y legible en un teléfono real es ítem
// de la UAT del plan 03-04.

/** El mismo molde de lectura de fuente que `test/panel-nav-chrome.test.ts`, sin reinventarlo. */
const leer = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')

/** Borra comentarios de bloque y de línea, en ese orden. Preserva el `//` de las URLs. */
function sinComentarios(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

const cuenta = (src: string, patron: RegExp) => (src.match(patron) ?? []).length

const MOD_DUENO = 'lib/panel-branch.ts'
const MOD_REGLA0 = 'lib/panel-history.ts'

describe('el aviso que NO vence — cero tiempo en el ciclo (la regla de MOB-05 en su forma del 2026-10-28)', () => {
  // ⚠ LA REGLA CAMBIÓ DE FORMA, NO DE ESPÍRITU. Su espíritu es que lo que el dueño VE y lo que el
  // código ACEPTA no se puedan separar. Hasta el 2026-10-28 eso era UNA constante de ventana y UN
  // temporizador que hacía las dos cosas; desde la decisión del dueño (camino 1, 03-DECISION-UAT-3.md)
  // el aviso se queda hasta el próximo toque, así que no hay ventana que sincronizar: la constante y el
  // temporizador se BORRARON, y el invariante es UN lugar que levanta el aviso, UN lugar que lo baja y
  // CERO temporizadores. Estos casos REEMPLAZAN uno por uno a los de la ventana.

  it('la constante de la ventana NO existe: ni exportada, ni mencionada en el módulo', () => {
    // Reemplaza a *la constante existe y vale 2000*. Dejarla sin consumidor sería un número muerto que
    // alguien vuelve a cablear a un temporizador.
    expect('PANEL_EXIT_HINT_MS' in PB).toBe(false)
    const mod = sinComentarios(leer(MOD_DUENO))
    expect(mod.length).toBeGreaterThan(500)
    expect(cuenta(mod, /PANEL_EXIT_HINT_MS/g)).toBe(0)
  })

  it('CERO tiempo en el ciclo: ni temporizadores, ni intervalos, ni cuadros de animación, ni su limpieza', () => {
    // Reemplaza a *2 usos de la constante, 1 temporizador*. Un temporizador en el ciclo re-arma SIN
    // activación, y un empuje sin activación es salteable (la intervención de historial medida en el
    // plan 03-12): es exactamente G3-2.
    const mod = sinComentarios(leer(MOD_DUENO))
    expect(mod.length).toBeGreaterThan(500)
    expect(cuenta(mod, /setTimeout|setInterval|requestAnimationFrame|clearTimeout/g)).toBe(0)
  })

  it('UN lugar levanta el aviso y UN lugar lo baja — el retroceso absorbido y el toque', () => {
    // Un segundo escritor de lo visible (o de lo lógico) re-crea el bug de los dos números por otro
    // camino, y es invisible en los dos sentidos.
    const mod = sinComentarios(leer(MOD_DUENO))
    expect(cuenta(mod, /setHintVisible\(true\)/g)).toBe(1)
    expect(cuenta(mod, /setHintVisible\(false\)/g)).toBe(1)
    expect(cuenta(mod, /avisoAbiertoRef\.current = true/g)).toBe(1)
    expect(cuenta(mod, /avisoAbiertoRef\.current = false/g)).toBe(1)
    const retroceso = mod.match(/const alRetroceder = \(\) => \{[\s\S]*?\n {4}\}\n/)?.[0] ?? ''
    const toque = mod.match(/const alTocar = \(evento: Event\) => \{[\s\S]*?\n {4}\}\n/)?.[0] ?? ''
    expect(retroceso.length).toBeGreaterThan(300)
    expect(toque.length).toBeGreaterThan(300)
    expect(retroceso).toContain('setHintVisible(true)')
    expect(retroceso).toContain('avisoAbiertoRef.current = true')
    expect(toque).toContain('setHintVisible(false)')
    expect(toque).toContain('avisoAbiertoRef.current = false')
  })

  it('CERO gate de viewport en el mecanismo (D-05): el ciclo corre igual en celular y en escritorio', () => {
    // El dueño eligió que salir cueste dos gestos en los dos. Y la alternativa —ocultar sólo el aviso
    // dejando la absorción viva— sería un botón MUERTO, que el propio módulo del sentinel de cambios
    // sin guardar declara peor que el bug.
    const mod = sinComentarios(leer(MOD_DUENO))
    expect(mod.length).toBeGreaterThan(500)
    expect(cuenta(mod, /matchMedia|useMediaQuery|innerWidth/g)).toBe(0)
  })
})

describe('la marca del sentinel — una clave NUEVA, y las cuatro formas disjuntas', () => {
  it('el constructor devuelve un objeto LITERAL FRESCO con la clave nueva y el id de instancia', () => {
    // La trampa que falla en silencio: propagar `history.state` arrastra `__NA`, el parche de Next
    // toma su rama temprana y NO despacha la sincronización del router. La URL cambia, el router no
    // se entera, y no hay ni un error en consola.
    const marca = PB.panelExitState(7)
    expect(Object.keys(marca)).toEqual(['frjExit'])
    expect(marca).toEqual({ frjExit: 7 })
    expect(PB.panelExitState(7)).not.toBe(PB.panelExitState(7))
    expect(marca).not.toHaveProperty('__NA')
  })

  it('el reconocedor por id distingue el sentinel de ESTA instancia del de otra', () => {
    // Es lo que hace que la marca sea de ESTA instancia y no "de alguien": sin el id, dos montajes
    // (StrictMode, o una transición con dos pantallas vivas por un frame) se pisarían el sentinel.
    expect(PB.isPanelExitEntry({ frjExit: 1 }, 1)).toBe(true)
    expect(PB.isPanelExitEntry({ frjExit: 2 }, 1)).toBe(false)
    for (const ajeno of [null, undefined, {}, 42, 'x', { frjExit: '1' }]) {
      expect(PB.isPanelExitEntry(ajeno, 1)).toBe(false)
    }
  })

  it('el reconocedor devuelve false para las TRES marcas que ya existen', () => {
    // Reusar cualquiera de las tres sería el peor error posible: el otro módulo reconocería ESTA
    // entrada como propia, haría su retroceso sobre ella y el dueño terminaría fuera del sitio.
    expect(PB.isPanelExitEntry({ frjOverlay: 1 }, 1)).toBe(false)
    expect(PB.isPanelExitEntry({ frjDirty: 1 }, 1)).toBe(false)
    expect(PB.isPanelExitEntry({ frjView: 'c' }, 1)).toBe(false)
    expect(PB.isPanelExitEntry(panelUnderState(PANEL_MORE), 1)).toBe(false)
  })

  it('el hash NO lo interpreta ninguno de los otros dos módulos (criterio (a), contra sus constantes)', () => {
    // No puede empezar con el de los overlays ni con el del sentinel de cambios sin guardar: los dos
    // tienen cálculo de profundidad sobre su propio prefijo y lo interpretarían como suyo.
    expect(PB.PANEL_EXIT_HASH).toBe('#salir')
    expect(PB.PANEL_EXIT_HASH.startsWith(OVERLAY_HASH_BASE)).toBe(false)
    expect(PB.PANEL_EXIT_HASH.startsWith(DIRTY_HASH_BASE)).toBe(false)
    expect(PB.exitHashCollidesWithOtherOwners()).toBe(false)
    // Y la función mide de verdad: con los hashes ajenos devuelve `true`.
    expect(PB.exitHashCollidesWithOtherOwners(OVERLAY_HASH_BASE)).toBe(true)
    expect(PB.exitHashCollidesWithOtherOwners(DIRTY_HASH_BASE + '-2')).toBe(true)
  })

  it('el hash siguiente nunca repite el actual (cicatriz 1: empujar la misma URL colapsa la entrada)', () => {
    // Pasa de verdad si el dueño llega con la URL ya pegada con nuestro hash. Un hash ajeno
    // (`#seccion`, `#modal`) se respeta: se empuja el base y al volver atrás el browser restaura el
    // de la página.
    expect(PB.nextPanelExitHash('')).toBe(PB.PANEL_EXIT_HASH)
    expect(PB.nextPanelExitHash('#seccion')).toBe(PB.PANEL_EXIT_HASH)
    expect(PB.nextPanelExitHash(PB.PANEL_EXIT_HASH)).toBe(PB.PANEL_EXIT_HASH + '-2')
    expect(PB.nextPanelExitHash(PB.PANEL_EXIT_HASH + '-2')).toBe(PB.PANEL_EXIT_HASH + '-3')
    // `Number('')` da 0 y `Number('abc')` da NaN: los dos caen al base, nunca a `#salir-NaN`.
    expect(PB.nextPanelExitHash(PB.PANEL_EXIT_HASH + '-')).toBe(PB.PANEL_EXIT_HASH)
    expect(PB.nextPanelExitHash(PB.PANEL_EXIT_HASH + '-abc')).toBe(PB.PANEL_EXIT_HASH)
  })
})

describe('cuándo se arma el sentinel — las reglas EN ORDEN', () => {
  /** Las condiciones en las que SÍ se arma; cada caso apaga una sola. */
  const ARMABLE = {
    participates: true,
    atRoot: true,
    hintOpen: false,
    topIsOurs: false,
    // El SÉPTIMO hecho, de la regla que el plan 03-07 agrega: si la URL ya lleva nuestro hash, la
    // entrada ya es nuestra y no hay que armar. En falso acá porque éste es el objeto de "sí se
    // arma"; su propia suite está más abajo.
    urlYaLlevaNuestroHash: false,
    foreignOwnsTop: false,
    // El SEXTO hecho, de la decisión (a) del plan 03-06: con algo nuestro debajo no se arma. En
    // falso acá porque éste es el objeto de "sí se arma"; su propia suite está más abajo.
    algoNuestroDebajo: false,
  }

  it('el caso base: parados en la raíz, sin aviso abierto y con la entrada libre ⇒ ARMAR', () => {
    expect(PB.panelExitArmAction(ARMABLE)).toBe('arm')
  })

  it('REGLA 1 — nadie va a dibujar el aviso ⇒ NO armar (el botón muerto)', () => {
    // Es la lección literal del módulo del sentinel de cambios sin guardar: un sentinel que absorbe
    // el atrás y después no muestra nada convierte el gesto en un botón MUERTO, que es peor que el
    // bug. Va primera porque ninguna otra condición puede autorizar a absorber sin avisar.
    expect(PB.panelExitArmAction({ ...ARMABLE, participates: false })).toBe('none')
  })

  it('REGLA 2 — no estamos en la raíz del panel ⇒ NO armar', () => {
    // MOB-05 es de Inicio y sólo de Inicio: en una sección el atrás tiene a dónde volver.
    expect(PB.panelExitArmAction({ ...ARMABLE, atRoot: false })).toBe('none')
  })

  it('REGLA 3 — la ventana del aviso está abierta ⇒ NO armar: es lo que hace que el SEGUNDO atrás salga', () => {
    // La mitad lógica de la constante única. Si acá se re-armara, el segundo atrás se comería el
    // sentinel nuevo y el dueño nunca saldría: dos avisos encadenados, justo lo que §13 prohíbe.
    expect(PB.panelExitArmAction({ ...ARMABLE, hintOpen: true })).toBe('none')
  })

  it('REGLA 4 — la entrada de arriba YA es nuestro sentinel ⇒ NO armar (E-6)', () => {
    // Acabamos de volver de una sección y estamos PARADOS SOBRE él. Un segundo empuje costaría dos
    // atrás. Medido en E-6: el sentinel sobrevive debajo de la sección con su marca viva, el
    // retroceso vuelve a pararse sobre él, y estar parado sobre él CUENTA como armado.
    expect(PB.panelExitArmAction({ ...ARMABLE, topIsOurs: true })).toBe('none')
  })

  it('REGLA 5 — la entrada de arriba es de OTRO dueño ⇒ NO armar (regla 0)', () => {
    // Un overlay abierto gana siempre: el atrás cierra el overlay primero, que es la política
    // vigente e intacta. Escribirle encima le borraría su marca y dejaría un atrás muerto.
    expect(PB.panelExitArmAction({ ...ARMABLE, foreignOwnsTop: true })).toBe('none')
  })

  it('el ORDEN importa: la falta de aviso le gana a todas las demás a la vez', () => {
    expect(
      PB.panelExitArmAction({
        participates: false,
        atRoot: true,
        hintOpen: false,
        topIsOurs: false,
        urlYaLlevaNuestroHash: true,
        foreignOwnsTop: false,
        algoNuestroDebajo: true,
      })
    ).toBe('none')
  })
})

describe('qué significa un retroceso — las reglas EN ORDEN', () => {
  /** El retroceso que SÍ tiene que avisar; cada caso cambia una sola condición. */
  const AVISA = {
    topIsOurs: false,
    participates: true,
    atRoot: true,
    holding: true,
    keyboardGuards: false,
  }

  it('el caso base: el browser se comió NUESTRO sentinel estando en la raíz ⇒ AVISAR', () => {
    expect(PB.panelExitPopAction(AVISA)).toBe('hint')
  })

  it('REGLA 1 — después del pop seguimos parados sobre nuestro sentinel ⇒ IGNORAR (LIFO)', () => {
    // El browser consumió una entrada AJENA de ARRIBA: el overlay del anidado LIFO, o la sección que
    // teníamos encima (E-6). El atrás hizo algo visible y no es asunto nuestro. Va primera porque
    // mientras eso sea cierto ninguna otra regla puede reinterpretar el evento.
    expect(PB.panelExitPopAction({ ...AVISA, topIsOurs: true })).toBe('ignore')
  })

  it('REGLA 2 — nadie va a dibujar el aviso ⇒ IGNORAR', () => {
    expect(PB.panelExitPopAction({ ...AVISA, participates: false })).toBe('ignore')
  })

  it('REGLA 3 — el retroceso nos dejó FUERA de la raíz ⇒ IGNORAR: no es nuestro asunto', () => {
    expect(PB.panelExitPopAction({ ...AVISA, atRoot: false })).toBe('ignore')
  })

  it('REGLA 4 — no éramos dueños de un sentinel vivo ⇒ IGNORAR', () => {
    // Nos pisó una escritura ajena, o nunca armamos. Un aviso ahí sería sobre un gesto que no es
    // nuestro, y el dueño vería el cartel sin que nada lo haya absorbido.
    expect(PB.panelExitPopAction({ ...AVISA, holding: false })).toBe('ignore')
  })

  it('REGLA 5 — el retroceso era del TECLADO ⇒ RE-ARMAR sin gastar el aviso (C-7)', () => {
    // Inicio no tiene campos de texto (barrido medido: cero), así que es improbable, no imposible: el
    // teclado puede venir de otra pantalla y la ventana de gracia es de 300ms. Si el aviso se gastara
    // acá, el segundo atrás SACARÍA DEL SITIO a un dueño que sólo quiso cerrar el teclado.
    expect(PB.panelExitPopAction({ ...AVISA, keyboardGuards: true })).toBe('rearm')
  })

  it('el ORDEN importa: estar parados sobre el sentinel le gana incluso al teclado', () => {
    expect(PB.panelExitPopAction({ ...AVISA, topIsOurs: true, keyboardGuards: true })).toBe('ignore')
  })

  it('un overlay arriba: no se arma, y un retroceso se ignora (lo que §13 pide como CASO)', () => {
    // Las dos mitades de "el overlay gana siempre", escritas juntas. El atrás cierra el overlay
    // primero y nosotros no participamos: la regla de orden lo cumple por construcción, pero queda
    // como caso de test y no como nota al pie.
    expect(
      PB.panelExitArmAction({
        participates: true,
        atRoot: true,
        hintOpen: false,
        topIsOurs: false,
        urlYaLlevaNuestroHash: false,
        foreignOwnsTop: true,
        algoNuestroDebajo: false,
      })
    ).toBe('none')
    // Y cuando el browser consume la entrada del overlay, nosotros seguimos parados sobre el nuestro.
    expect(PB.panelExitPopAction({ ...AVISA, topIsOurs: true })).toBe('ignore')
  })
})

describe('panelBranchPlan con el sentinel arriba — el quinto miembro del tipo, PRODUCIDO', () => {
  // ⚠ POR QUÉ ESTA DECISIÓN NO ES UNA FUNCIÓN PURA APARTE. El quinto miembro del tipo del plan existe
  // desde el plan 03-02, y tiene que SALIR DE LA MISMA FUNCIÓN: si *nada* viviera afuera del tipo, el
  // chequeo de exhaustividad del plan 03-04 NO LO VERÍA — que es exactamente la clase de hueco
  // silencioso que esta fase viene a cerrar.

  /** Los 5 destinos de la barra, Más incluido. */
  const DESTINOS = [PANEL_ROOT, '/appointments', '/agenda', '/clients', PANEL_MORE]
  /** Las 9 secciones que en mobile sólo se alcanzan por Más. */
  const RAMA = ['/abonos', '/negocio', '/web', '/servicios', '/equipo', '/consultorios', '/finances', '/settings', '/ayuda']

  it('destino IGUAL a la ruta actual con el sentinel arriba ⇒ NADA (ni navegar, ni apilar, ni reemplazar)', () => {
    // Reemplazar caería SOBRE el sentinel y dejaría dos entradas idénticas con el sentinel re-armado
    // encima: un atrás muerto ENTERRADO. Y es la PRIMERA regla: tiene que ganarle también a la regla
    // 0 (sin el hecho de la rama), porque en Inicio con el sentinel armado el hecho de la rama es
    // falso y la decisión caería en reemplazar.
    for (const masDebajo of [false, true]) {
      expect(PH.panelBranchPlan({ from: PANEL_ROOT, to: PANEL_ROOT, raizDebajo: false, masDebajo, holdsExitSentinel: true })).toBe('none')
    }
  })

  it('destino DISTINTO con el sentinel arriba ⇒ CONSUMIRLO Y NAVEGAR (lo que el plan 03-06 cambió)', () => {
    // ⚠ ESTE CASO CAMBIÓ A PROPÓSITO, y queda escrito el por qué. El plan 03-03 afirmaba acá que la
    // navegación empujaba y el sentinel quedaba DEBAJO, "la forma medida en E-6 que NO deja un atrás
    // muerto". **La UAT midió que sí lo deja**: enterrado, el atrás aterriza en una entrada de la
    // raíz CON HASH (`/dashboard#salir`) que en pantalla se ve igual que Inicio, y el atrás siguiente
    // no hace nada visible — *recarga y vuelve a `dashboard#salir-3`*, *a la primera que toco atrás
    // no hace nada* (G-1 / G-2). E-6 medía el sentinel AISLADO y no cubría este recorrido; E-9 lo
    // mide con las dos formas al lado.
    for (const to of DESTINOS) {
      if (to === PANEL_ROOT) continue
      expect(
        PH.panelBranchPlan({ from: PANEL_ROOT, to, raizDebajo: false, masDebajo: false, holdsExitSentinel: true })
      ).toBe('consume-exit-then-navigate')
    }
  })

  it('la regla nueva no cambia NINGUNA de las ramas que ya estaban (barrido de 10 × 5 × 2)', () => {
    // El barrido de no-regresión: sin el sentinel arriba el plan es EXACTAMENTE el del plan 03-02
    // para cada par. Con el sentinel arriba cambian SÓLO dos cosas, y las dos están decididas: el
    // par degenerado (⇒ nada, plan 03-03) y la salida DESDE LA RAÍZ (⇒ consumir y navegar, 03-06).
    // Fuera de la raíz, todo queda idéntico.
    for (const from of [...RAMA, PANEL_ROOT]) {
      for (const to of DESTINOS) {
        for (const masDebajo of [false, true]) {
          const antes = PH.panelBranchPlan({ from, to, raizDebajo: false, masDebajo, holdsExitSentinel: false })
          expect(antes).not.toBe('none')
          expect(antes).not.toBe('consume-exit-then-navigate')
          const esperado =
            from === to ? 'none' : from === PANEL_ROOT ? 'consume-exit-then-navigate' : antes
          expect(PH.panelBranchPlan({ from, to, raizDebajo: false, masDebajo, holdsExitSentinel: true })).toBe(esperado)
        }
      }
    }
  })
})

// ── Plan 03-05 — LA DIRECCIÓN y LA PROPAGACIÓN (cierre de G-1 / G-2 / G-3) ───────────────────────
//
// La marca de la rama **dice la verdad o no dice nada**. Hoy se derivaba del PAR DE RUTAS, y el par
// de rutas no sabe qué pasó de verdad: con un retroceso, con el reemplazo del colapso y con el de la
// política, el par dice `push` igual. La UAT en el teléfono midió las tres consecuencias: una marca
// RANCIA leída cuando no correspondía, un colapso que aborta en silencio, y un atrás que aterriza en
// una sección de UNA PRUEBA ANTERIOR.

describe('la REGLA DE DIRECCIÓN — ningún retroceso escribe la marca, y va PRIMERA', () => {
  it('con el hecho del retroceso NO marca, aunque la política diga empujar (la rama donde CAMBIA)', () => {
    // Un retroceso **no crea** una entrada: **revela** una que ya existe y que ya trae su propia
    // marca. Escribir ahí hace las dos cosas malas a la vez: MIENTE (la ruta de la que venimos
    // estaba ARRIBA, no debajo) y DESTRUYE la verdad que esa entrada ya tenía.
    expect(
      branchMarkDecision({ previous: '/finances', current: PANEL_MORE, vieneDeUnRetroceso: true }),
    ).toBeNull()
    // Y el contrapuesto, adyacente: el MISMO par sin el hecho sí marca.
    expect(
      branchMarkDecision({ previous: '/finances', current: PANEL_MORE, vieneDeUnRetroceso: false }),
    ).toBe('/finances')
  })

  it('gana a cada una de las cuatro ramas de hoy, una por una', () => {
    const CASOS: { previous: string | null; current: string }[] = [
      { previous: null, current: PANEL_MORE },
      { previous: '/finances', current: '/finances' },
      { previous: '/finances', current: '/clients' },
      { previous: PANEL_MORE, current: '/finances' },
    ]
    for (const caso of CASOS) {
      expect(branchMarkDecision({ ...caso, vieneDeUnRetroceso: true })).toBeNull()
    }
  })

  it('LOS TRES RETROCESOS DEL SISTEMA caen acá: el atrás del dueño, el subir de D-03 y el colapso', () => {
    // Es por qué el síntoma apareció en TRES gaps distintos de la UAT. Los tres pares son los que
    // produce cada uno de los tres retrocesos, y los tres habrían marcado con la política de hoy.
    // El atrás del dueño desde Más cae en Inicio; el *subir un nivel* de D-03 y el primer paso del
    // colapso aterrizan en Más desde una sección de la rama. Los tres pares la política de rutas los
    // declara EMPUJE, así que los tres habrían escrito una marca que MIENTE.
    const ATRAS_DEL_DUENO = { previous: PANEL_MORE, current: PANEL_ROOT }
    const SUBIR_D03 = { previous: '/finances', current: PANEL_MORE }
    const COLAPSO_PRIMER_PASO = { previous: '/web', current: PANEL_MORE }
    for (const caso of [ATRAS_DEL_DUENO, SUBIR_D03, COLAPSO_PRIMER_PASO]) {
      expect(branchMarkDecision({ ...caso, vieneDeUnRetroceso: false })).not.toBeNull()
      expect(branchMarkDecision({ ...caso, vieneDeUnRetroceso: true })).toBeNull()
    }
  })

  it('BARRIDO de no-regresión: sin el hecho, cada par da lo de antes; con el hecho, null', () => {
    const RUTAS = [PANEL_ROOT, PANEL_MORE, '/appointments', '/agenda', '/clients', '/finances', '/web']
    for (const previous of RUTAS) {
      for (const current of RUTAS) {
        const sinElHecho = branchMarkDecision({ previous, current, vieneDeUnRetroceso: false })
        const esperado =
          previous === current || PH.panelNavMode({ from: previous, to: current }) !== 'push'
            ? null
            : previous
        expect(sinElHecho).toBe(esperado)
        expect(branchMarkDecision({ previous, current, vieneDeUnRetroceso: true })).toBeNull()
      }
    }
  })

  it('el hecho va SIN VALOR POR OMISIÓN: un call site que lo olvide NO COMPILA', () => {
    // Igual que `masDebajo` y `holdsExitSentinel`: es un HECHO de la pila, no una configuración. Se
    // afirma LEYENDO el fuente porque la propiedad es del TIPO y no de un valor de retorno — un
    // default o un `?` no los ve ninguna aserción de runtime.
    const firma = sinComentarios(leer(MOD_DUENO)).match(
      /export function branchMarkDecision\(\{[\s\S]*?\): string \| null \{/,
    )
    expect(firma).not.toBeNull()
    expect(firma?.[0]).toContain('vieneDeUnRetroceso: boolean')
    expect(firma?.[0]).not.toContain('vieneDeUnRetroceso?')
    expect(firma?.[0]).not.toMatch(/vieneDeUnRetroceso\s*=/)
  })
})

describe('el RASTREO del retroceso — la RUTA del aterrizaje, no un booleano', () => {
  it('guarda la ruta en la que el retroceso aterrizó, y la devuelve', () => {
    PB.recordBackLanding(PANEL_MORE)
    expect(PB.takeBackLanding()).toBe(PANEL_MORE)
  })

  it('se DESCARTA al leerlo: la segunda lectura de la misma corrida ya no lo encuentra', () => {
    // El dato se lee y se descarta en TODA corrida del efecto de marcado, haya suprimido o no. Un
    // dato que sobrevive a una corrida suprimiría un empuje que nadie pidió suprimir.
    PB.recordBackLanding('/appointments')
    expect(PB.takeBackLanding()).toBe('/appointments')
    expect(PB.takeBackLanding()).toBeNull()
  })

  it('la supresión aplica SÓLO con ruta coincidente', () => {
    PB.recordBackLanding(PANEL_MORE)
    const aterrizaje = PB.takeBackLanding()
    // Coincide ⇒ el commit viene del retroceso ⇒ no marcar.
    expect(
      branchMarkDecision({ previous: '/finances', current: PANEL_MORE, vieneDeUnRetroceso: aterrizaje === PANEL_MORE }),
    ).toBeNull()
    // No coincide ⇒ el commit NO viene de ese retroceso ⇒ la política decide como siempre.
    expect(
      branchMarkDecision({ previous: PANEL_ROOT, current: '/clients', vieneDeUnRetroceso: aterrizaje === '/clients' }),
    ).toBe(PANEL_ROOT)
  })

  it('EL CASO QUE PROHÍBE EL BOOLEANO — un retroceso que NO cambia de ruta, y después un empuje que SÍ marca', () => {
    // El retroceso que el sentinel de salida absorbe en Inicio **no cambia** la ruta, así que el
    // efecto de marcado NO vuelve a correr —sus dependencias no cambiaron— y una BANDERA quedaría
    // encendida. El próximo empuje de verdad quedaría suprimido EN SILENCIO: la política degradaría
    // a un nivel sin que nada se pusiera rojo.
    PB.recordBackLanding(PANEL_ROOT)
    // El efecto no corre. Llega el empuje de verdad: Inicio → Turnos.
    const aterrizaje = PB.takeBackLanding()
    expect(aterrizaje).toBe(PANEL_ROOT)
    expect(
      branchMarkDecision({
        previous: PANEL_ROOT,
        current: '/appointments',
        vieneDeUnRetroceso: aterrizaje === '/appointments',
      }),
    ).toBe(PANEL_ROOT)
    // Y el dato ya se descartó: el empuje siguiente tampoco queda suprimido.
    expect(PB.takeBackLanding()).toBeNull()
  })
})

describe('la PROPAGACIÓN del colapso — un canal, un consumidor, y la ruta REAL de abajo', () => {
  /** El colapso completo: gesto, retroceso y el evento en el que el segundo paso decide. */
  function colapsarHasta({ debajoDeMas, to }: { debajoDeMas: unknown; to: string }) {
    const navegar = vi.fn()
    const ctx = montarPila({ state: panelUnderState(PANEL_MORE), pathname: '/finances' })
    runBranchNavigation({ plan: 'collapse-then-replace', to, navigate: navegar })
    dispararRetroceso(ctx, { pathname: PANEL_MORE, state: debajoDeMas })
    return { ctx, navegar }
  }

  it('el colapso que navega deja pedida la ruta LEÍDA en la entrada de Más, y no la ruta de Más', () => {
    // ⚠ EL CORAZÓN DEL ARREGLO. El reemplazo PISA la entrada de Más: lo que queda debajo es lo que
    // había debajo de Más. El par de rutas (`/mas` → destino) diría EMPUJE y derivaría `/mas`, que
    // es justo la entrada que acaba de desaparecer.
    const { ctx, navegar } = colapsarHasta({ debajoDeMas: panelUnderState('/appointments'), to: '/clients' })
    expect(navegar).toHaveBeenCalledWith('/clients', 'replace')
    // Ahora el router reemplazó y estamos parados en el destino, con una entrada FRESCA.
    ctx.win.history.state = { __NA: true }
    expect(PB.applyBranchMarkRequest('/clients')).toBe(true)
    expect(ctx.replaceState).toHaveBeenCalledTimes(1)
    expect(ctx.replaceState).toHaveBeenCalledWith({ frjUnder: '/appointments' }, '')
    expect(ctx.replaceState).not.toHaveBeenCalledWith({ frjUnder: PANEL_MORE }, '')
  })

  it('el pedido se consume SÓLO en el destino que lo pidió', () => {
    const { ctx } = colapsarHasta({ debajoDeMas: panelUnderState('/appointments'), to: '/clients' })
    ctx.win.history.state = { __NA: true }
    // Llegó OTRA ruta: un pedido que sobrevive a una navegación que no ocurrió escribiría una marca
    // rancia en una entrada AJENA — el mismo bug, del otro lado.
    expect(PB.applyBranchMarkRequest('/agenda')).toBe(false)
    expect(ctx.replaceState).not.toHaveBeenCalled()
  })

  it('y se DESCARTA igual: después de la ruta equivocada, el destino verdadero tampoco lo encuentra', () => {
    const { ctx } = colapsarHasta({ debajoDeMas: panelUnderState('/appointments'), to: '/clients' })
    ctx.win.history.state = { __NA: true }
    expect(PB.applyBranchMarkRequest('/agenda')).toBe(false)
    expect(PB.applyBranchMarkRequest('/clients')).toBe(false)
    expect(ctx.replaceState).not.toHaveBeenCalled()
  })

  it('consumido una vez, no se vuelve a consumir', () => {
    const { ctx } = colapsarHasta({ debajoDeMas: panelUnderState('/appointments'), to: '/clients' })
    ctx.win.history.state = { __NA: true }
    expect(PB.applyBranchMarkRequest('/clients')).toBe(true)
    expect(PB.applyBranchMarkRequest('/clients')).toBe(false)
    expect(ctx.replaceState).toHaveBeenCalledTimes(1)
  })

  it('con la marca PERDIDA en la entrada de Más no escribe NADA, y nunca la ruta de Más', () => {
    // La degradación segura: sin la ruta real no se deriva ninguna. Quedarse sin marca deja una pila
    // un escalón más larga; escribir `/mas` dejaría al dueño fuera del sitio en el gesto siguiente.
    const { ctx, navegar } = colapsarHasta({ debajoDeMas: { __NA: true }, to: '/clients' })
    expect(navegar).toHaveBeenCalledWith('/clients', 'replace')
    ctx.win.history.state = { __NA: true }
    expect(PB.applyBranchMarkRequest('/clients')).toBe(true)
    expect(ctx.replaceState).not.toHaveBeenCalled()
  })

  it('la caída del SEGUNDO CONSUMO que termina navegando también deja el pedido', () => {
    // El degenerado al que se le perdió la marca en el medio: no hay segundo retroceso, se navega, y
    // la ruta real de abajo es la que el segundo paso leyó (que acá coincide con el destino).
    const navegar = vi.fn()
    const ctx = montarPila({ state: panelUnderState(PANEL_MORE), pathname: '/finances' })
    runBranchNavigation({ plan: 'collapse-then-replace', to: '/appointments', navigate: navegar })
    // La entrada de Más dice que debajo está justo el destino ⇒ segundo consumo… que se niega porque
    // la entrada resultó de otro dueño.
    dispararRetroceso(ctx, { pathname: PANEL_MORE, state: { frjUnder: '/appointments', frjExit: 1 } })
    expect(navegar).toHaveBeenCalledWith('/appointments', 'replace')
    ctx.win.history.state = { __NA: true }
    expect(PB.applyBranchMarkRequest('/appointments')).toBe(true)
    expect(ctx.replaceState).toHaveBeenCalledWith({ frjUnder: '/appointments' }, '')
  })

  it('escribe con el ESCRITOR ÚNICO, así que hereda sus dos guardas (entrada ajena ⇒ no escribe)', () => {
    // El canal no tiene guardas propias: las tiene el escritor. Dos juegos de guardas es cómo se
    // pierde uno de los dos sin que ningún gate lo vea.
    const { ctx } = colapsarHasta({ debajoDeMas: panelUnderState('/appointments'), to: '/clients' })
    ctx.win.history.state = { frjOverlay: 1 }
    expect(PB.applyBranchMarkRequest('/clients')).toBe(true)
    expect(ctx.replaceState).not.toHaveBeenCalled()
  })

  it('EL CASO DE LA UAT (G-3 / D7) — la pila de D7 marca la SECCIÓN DE LA BARRA, no Más', () => {
    // El recorrido que el dueño midió en el teléfono: `Inicio → Turnos → Más → Finanzas → tocar
    // Clientes en la barra`. Medido: *"recarga y queda en clientes, le tuve que hacer dos atrás y
    // volvió a dashboard#salir-3"*. La marca RANCIA es la causa: el par de rutas derivaba `/mas`, y
    // lo que queda debajo del destino es **Turnos**. Medido en el escenario E-11 de la sonda.
    const { ctx, navegar } = colapsarHasta({ debajoDeMas: panelUnderState('/appointments'), to: '/clients' })
    expect(navegar).toHaveBeenCalledWith('/clients', 'replace')
    ctx.win.history.state = { __NA: true }
    // La derivación del par de rutas —lo que el código hacía— habría escrito `/mas`.
    expect(branchMarkDecision({ previous: PANEL_MORE, current: '/clients', vieneDeUnRetroceso: false })).toBe(PANEL_MORE)
    // El canal escribe la ruta REAL, y con el pedido a la vista la decisión NO se consulta.
    expect(PB.applyBranchMarkRequest('/clients')).toBe(true)
    expect(ctx.replaceState).toHaveBeenCalledWith({ frjUnder: '/appointments' }, '')
  })
})

describe('el canal es UNO y el consumidor es UNO', () => {
  it('el provider del guard de cambios sin guardar NO se toca: hereda el arreglo por el ejecutor', () => {
    // Ejecuta el MISMO colapso para el caso vivo de `/web` llamando a `runBranchNavigation`, así que
    // su propagación sale gratis por el mismo canal. Si apareciera cableada ahí, habría DOS
    // consumidores y un segundo dialecto de la misma regla.
    const guard = sinComentarios(leer('components/dashboard/unsaved-changes-guard.tsx'))
    expect(guard.length).toBeGreaterThan(500)
    expect(guard).toContain('runBranchNavigation')
    expect(cuenta(guard, /applyBranchMarkRequest|recordBackLanding|takeBackLanding/g)).toBe(0)
  })

  it('la barra tampoco lo cablea: el consumidor vive en el hook', () => {
    const barra = sinComentarios(leer('components/dashboard/panel-bottom-nav.tsx'))
    expect(barra.length).toBeGreaterThan(500)
    expect(cuenta(barra, /applyBranchMarkRequest|recordBackLanding|takeBackLanding/g)).toBe(0)
  })
})

// ── Plan 03-09 — UN dialecto para el hecho de G2-1, y CERO consultas del ancho de pantalla ───────
//
// ⚠ POR QUÉ ESTAS AUDITORÍAS SON DE FUENTE Y NO DE VALOR DE RETORNO. Lo que afirman es una propiedad
// de la ESTRUCTURA de los dos consumidores —que computan el mismo hecho con la MISMA forma, una vez
// cada uno, y que ninguno le pregunta el tamaño a la pantalla—, y eso ningún valor de retorno lo
// muestra. El compilador ya garantiza que el hecho se pase (va sin valor por omisión); lo que no
// puede exigir es que los dos lo computen IGUAL y que el residuo esté declarado.

describe('G2-1 — UN dialecto del hecho nuevo en los DOS consumidores', () => {
  const GUARD = 'components/dashboard/unsaved-changes-guard.tsx'
  const MOD_POLITICA = 'lib/panel-history.ts'
  const BARRA = 'components/dashboard/panel-bottom-nav.tsx'

  it('los dos consumidores computan el hecho con la MISMA forma, y UNA vez cada uno', () => {
    // La forma es *la marca DICE la raíz* —`panelUnderRoute(estado) === <la raíz>`— y no *¿hay
    // marca?*: es la misma con la que se computa el hecho de la rama, por el mismo motivo. Dos formas
    // distintas para el mismo hecho serían dos dialectos de la misma regla, que es exactamente lo que
    // NAV-05 viene a evitar. Y UNA vez cada uno: dos lecturas del estado en el mismo gesto son dos
    // verdades que pueden diferir.
    const barra = sinComentarios(leer(MOD_DUENO))
    const guard = sinComentarios(leer(GUARD))
    expect(barra.length).toBeGreaterThan(500)
    expect(guard.length).toBeGreaterThan(500)
    expect(cuenta(barra, /raizDebajo: panelUnderRoute\(estado\) === root/g)).toBe(1)
    expect(cuenta(guard, /raizDebajo: panelUnderRoute\(estado\) === PANEL_ROOT/g)).toBe(1)
    // Y ninguno de los dos computa el hecho de otra forma: cero `raizDebajo` por otro camino.
    expect(cuenta(barra, /raizDebajo/g)).toBe(1)
    expect(cuenta(guard, /raizDebajo/g)).toBe(1)
  })

  it('el guard usa la CONSTANTE de la raíz, importada, y no el literal de la ruta', () => {
    // El literal de la raíz vive en UN solo lugar a propósito (`PANEL_ROOT`). Con el literal copiado
    // acá, el día que la raíz cambie el guard se queda mirando otra pila **en silencio** — ni `tsc`
    // ni la suite lo verían.
    const guard = sinComentarios(leer(GUARD))
    expect(guard).toMatch(/^ {2}PANEL_ROOT,$/m)
    expect(cuenta(guard, /panelUnderRoute\(estado\) === '\/dashboard'/g)).toBe(0)
  })

  it('CERO consultas del ancho de la pantalla en los dos consumidores y los dos módulos de política', () => {
    // El residuo de escritorio se ACEPTA y se declara (2026-10-27); no se gatea. Un chequeo de
    // viewport en el medio de esta política es exactamente lo que NAV-05 y el criterio 6 prohíben, y
    // lo que la fase sostuvo *por construcción* hasta el plan 03-09.
    for (const archivo of [MOD_DUENO, MOD_POLITICA, GUARD, BARRA]) {
      const src = sinComentarios(leer(archivo))
      expect(src.length).toBeGreaterThan(500)
      expect(cuenta(src, /matchMedia|innerWidth|clientWidth|outerWidth/g)).toBe(0)
    }
  })

  it('el residuo de escritorio está DECLARADO con su fecha en los tres lugares donde se lee', () => {
    // El docblock de la regla, el guard DONDE SE PRODUCE y el documento de debug. Acá se afirman los
    // dos de código; el tercero lo vigila el gate de bash del plan.
    expect(cuenta(leer(MOD_POLITICA), /2026-10-27/g)).toBeGreaterThanOrEqual(1)
    expect(cuenta(leer(GUARD), /2026-10-27/g)).toBeGreaterThanOrEqual(1)
  })

  it('el `switch` del guard sigue en SEIS casos con su chequeo de exhaustividad, y `up` delega', () => {
    // No hay miembro nuevo: `up` ya ES el retroceso guardado de un paso. Un séptimo miembro para el
    // mismo mecanismo obligaría a tocar este `switch` y sería el segundo dialecto.
    const guard = sinComentarios(leer(GUARD))
    const ejecutor = guard.slice(guard.indexOf('const ejecutarPlanDeRama'))
    expect(ejecutor.length).toBeGreaterThan(400)
    expect(cuenta(ejecutor, /case '/g)).toBe(6)
    expect(cuenta(ejecutor, /_exhaustivo/g)).toBeGreaterThanOrEqual(1)
    // `up` sigue agrupado con los que delegan al ejecutor COMPARTIDO, no reimplementado acá.
    expect(ejecutor).toContain("case 'up':")
    expect(ejecutor).toContain('runBranchNavigation')
  })

  it('G2-1 — el hecho que la barra pasa sale de la MARCA DE LA RAMA, no de un dato nuevo en la pila', () => {
    // Una cuarta clave en la pila sería un cuarto dueño sin necesidad, y la regla 0 reconoce TRES a
    // propósito. La marca de la rama YA guarda la ruta que quedó debajo —justamente para esto, que es
    // el motivo por el que E-5 pidió que guardara la RUTA y no un booleano—, así que el hecho nuevo se
    // deriva de ella y no de un canal nuevo.
    const barra = sinComentarios(leer(MOD_DUENO))
    const guard = sinComentarios(leer(GUARD))
    for (const src of [barra, guard]) {
      // El hecho se lee SIEMPRE por `panelUnderRoute`, que es el lector de la marca de la rama.
      expect(src).toMatch(/raizDebajo: panelUnderRoute\(/)
      // Y no hay ninguna clave nueva de estado inventada para esto.
      expect(cuenta(src, /frjRoot|frjRaiz|frjAtRoot/g)).toBe(0)
    }
    // El predicado de la regla 0 sigue reconociendo TRES dueños, ni uno más.
    // ⚠ La región se RECORTA hasta la llave de cierre a principio de línea. Sin ese tope, el `slice`
    // llega hasta el final del archivo y el contador mide otras funciones: el gate quedaría leyendo
    // 2 donde el predicado tiene 0 — la variante "verde/rojo midiendo otra cosa" de esta fase.
    const politica = sinComentarios(leer(MOD_POLITICA))
    const desde = politica.indexOf('export function isForeignOwnedEntry')
    expect(desde).toBeGreaterThan(0)
    const regla0 = politica.slice(desde, politica.indexOf('\n}', desde) + 2)
    expect(regla0.length).toBeGreaterThan(80)
    expect(regla0.length).toBeLessThan(400)
    expect(cuenta(regla0, /isOverlayOwnedEntry|isDirtyGuardOwnedEntry|isExitSentinelOwnedEntry/g)).toBe(3)
    expect(cuenta(regla0, /panelUnderRoute/g)).toBe(0)
  })
})

describe('el candado anti-deriva del literal de la clave', () => {
  it('la clave del sentinel no derivó entre el módulo DUEÑO y el predicado de la regla 0', () => {
    // El literal está DUPLICADO a propósito (ver el docblock de `isExitSentinelOwnedEntry`): este
    // módulo exporta un hook de React y `lib/panel-history.ts` evita importar React para no
    // arrastrarlo al grafo de sus funciones puras ni al de su suite. El candado contra la deriva no
    // es la disciplina: es ESTE caso. Si el dueño renombrara su marca, la regla 0 dejaría de
    // reconocer el sentinel y volvería a escribirle encima, EN SILENCIO.
    const dueno = sinComentarios(leer(MOD_DUENO))
    const regla0 = sinComentarios(leer(MOD_REGLA0))
    expect(dueno.length).toBeGreaterThan(500)
    expect(regla0.length).toBeGreaterThan(500)
    expect(dueno).toContain('frjExit')
    expect(regla0).toContain('frjExit')
  })

  it('el dueño escribe la marca SIEMPRE como objeto literal fresco, y nunca propaga el state actual', () => {
    const dueno = sinComentarios(leer(MOD_DUENO))
    expect(dueno).toContain('window.history.pushState')
    expect(/\.\.\.\s*(window\.)?history\.state/.test(dueno)).toBe(false)
  })
})

// ── Plan 03-06 / Task 2 — LA DECISIÓN (a) DEL DUEÑO (cierre del ítem H / G-4) ────────────────────
//
// Parado en Inicio **con historia debajo**, MOB-04 (`Más → Inicio → atrás` vuelve a Más) y MOB-05 (en
// Inicio el atrás avisa antes de salir) **no pueden ser verdad a la vez**. Es la imprecisión declarada
// #12 de `.planning/WINDOWS.md`, tocada desde el otro lado, y la UAT la destapó como el ítem **H**.
//
// El dueño eligió la opción **(a)**: el sentinel se arma **sólo si no hay nada nuestro debajo**. Se
// respeta MOB-04, y el aviso aparece **únicamente** cuando el atrás de verdad saca del panel.
// Descartada (b) —que el sentinel mandara siempre en Inicio—: más simple, pero cambiaba lo que MOB-04
// prometía y dejaba el aviso apareciendo cuando el dueño no iba a salir.
//
// Medido en el escenario **E-10** de `.planning/debug/pila-de-dos-niveles-medida.md`.

describe('la DECISIÓN (a) — el sentinel se arma SÓLO si no hay nada nuestro debajo', () => {
  /** El objeto en el que SÍ se arma, con el hecho nuevo apagado. */
  const LIBRE = {
    participates: true,
    atRoot: true,
    hintOpen: false,
    topIsOurs: false,
    urlYaLlevaNuestroHash: false,
    foreignOwnsTop: false,
    algoNuestroDebajo: false,
  }

  it('en la raíz CON una entrada nuestra debajo ⇒ NO ARMAR (MOB-04 se respeta)', () => {
    // La marca de la rama de la entrada de arriba dice una ruta ⇒ hay algo nuestro debajo ⇒ el atrás
    // tiene a dónde volver y el aviso no tiene nada que avisar.
    expect(PB.panelExitArmAction({ ...LIBRE, algoNuestroDebajo: true })).toBe('none')
  })

  it('en la raíz SIN nada nuestro debajo ⇒ ARMAR (MOB-05 se respeta)', () => {
    // La marca es nula ⇒ el primer atrás saca del panel de verdad ⇒ hay que avisar.
    expect(PB.panelExitArmAction({ ...LIBRE, algoNuestroDebajo: false })).toBe('arm')
  })

  it('EL CASO DEL ÍTEM H (G-4) — la pila `raíz → sección → raíz`: no se arma, y el atrás vuelve a Más', () => {
    // La pila que el dueño midió en el teléfono: `Más → Inicio → atrás` esperaba volver a **Más** y
    // le saltó el aviso de salida. Con (a) el sentinel no se arma, así que el atrás vuelve a Más.
    // Medido en E-10, mitad 2: la marca de la entrada de arriba dice la ruta de la sección y el
    // retroceso guardado aterriza ahí.
    const marcaDeLaEntradaDeArriba = panelUnderState(PANEL_MORE)
    const hayAlgoNuestroDebajo = PH.panelUnderRoute(marcaDeLaEntradaDeArriba) !== null
    expect(hayAlgoNuestroDebajo).toBe(true)
    expect(PB.panelExitArmAction({ ...LIBRE, algoNuestroDebajo: hayAlgoNuestroDebajo })).toBe('none')
  })

  it('LA REGLA VA ÚLTIMA: las cinco de seguridad siguen ganando una por una, con el hecho encendido', () => {
    // Las cinco anteriores son de SEGURIDAD (nadie a quien avisar, lugar equivocado, ventana
    // abierta, ya armado, la entrada de arriba es de otro dueño) y la de (a) es de POLÍTICA.
    // Seguridad primero: con el hecho de (a) encendido, cada una de las cinco devuelve igual.
    const CINCO = [
      { ...LIBRE, participates: false },
      { ...LIBRE, atRoot: false },
      { ...LIBRE, hintOpen: true },
      { ...LIBRE, topIsOurs: true },
      { ...LIBRE, foreignOwnsTop: true },
    ]
    for (const caso of CINCO) {
      expect(PB.panelExitArmAction(caso)).toBe('none')
      expect(PB.panelExitArmAction({ ...caso, algoNuestroDebajo: true })).toBe('none')
    }
  })

  it('EL ORDEN entre *ya estoy armado* y (a): con el sentinel arriba Y la marca presente, gana la CUARTA', () => {
    // ⚠ ES EL CASO QUE FIJA EL ORDEN, y el que hay que mirar primero si esta suite se pone roja.
    // Parados sobre NUESTRO propio sentinel, el state de la entrada de arriba lleva SÓLO su propia
    // clave (`{ frjExit }`), así que la marca de la rama ahí NO SIGNIFICA NADA. Si la regla de (a)
    // se evaluara antes, leería ese dato parada sobre el sentinel — y las dos reglas quedarían al
    // revés. La cuarta tiene que devolver antes.
    expect(PH.panelUnderRoute(PB.panelExitState(7))).toBeNull()
    expect(PB.panelExitArmAction({ ...LIBRE, topIsOurs: true, algoNuestroDebajo: true })).toBe('none')
  })

  it('el hecho va SIN VALOR POR OMISIÓN: un call site que lo olvide NO COMPILA', () => {
    // Igual que `vieneDeUnRetroceso`, `masDebajo` y `holdsExitSentinel`: es un HECHO de la pila, no
    // una configuración. Se afirma LEYENDO el fuente porque la propiedad es del TIPO y no de un
    // valor de retorno — un default o un `?` no los ve ninguna aserción de runtime.
    const firma = sinComentarios(leer(MOD_DUENO)).match(
      /export function panelExitArmAction\(\{[\s\S]*?\): PanelExitArmAction \{/,
    )
    expect(firma).not.toBeNull()
    expect(firma?.[0]).toContain('algoNuestroDebajo: boolean')
    expect(firma?.[0]).not.toContain('algoNuestroDebajo?')
    expect(firma?.[0]).not.toMatch(/algoNuestroDebajo\s*=/)
  })

  it('el hecho se LEE DEL ESTADO REAL de la entrada de arriba, nunca de un valor de render', () => {
    // Entre un render y el gesto pudo haber una escritura ajena que se llevó la marca. Es el mismo
    // criterio con el que la ruta actual ya se re-lee de `location` y no del render, y se afirma
    // leyendo el fuente del armado: ahí adentro tiene que estar la lectura de la marca.
    const armado = sinComentarios(leer(MOD_DUENO)).match(
      /const armarSentinel = useCallback[\s\S]*?\n {2}\}, \[/,
    )
    expect(armado).not.toBeNull()
    expect(armado?.[0]).toContain('panelUnderRoute')
    expect(armado?.[0]).toContain('algoNuestroDebajo')
  })

  it('EL LÍMITE ACEPTADO de (a) queda ESCRITO en el módulo, y nombra la decisión y el escenario', () => {
    // Si lo que quedó debajo es una entrada AJENA (otro sitio) no hay forma confiable de saberlo —el
    // largo del historial cuenta también las entradas de ADELANTE— y el aviso va a aparecer igual.
    // Queda ACEPTADO (misma razón que el caso de entrada directa desde v0.30, E-7), y lo que NO está
    // permitido es dejarlo sin escribir: el párrafo de la imprecisión vieja se REEMPLAZA, no se
    // borra. Si no, el caso vuelve en la próxima UAT disfrazado de bug nuevo.
    const mod = leer(MOD_DUENO)
    expect(mod).toMatch(/decisi[oó]n \(a\)/i)
    expect(mod).toContain('E-10')
    expect(mod).toMatch(/entrada \*\*ajena\*\*|entrada ajena/i)
  })
})

// ── Plan 03-06 / Task 3 — EL SENTINEL NO SE QUEDA ENTERRADO (cierre de G-1 / G-2) ────────────────
//
// La decisión (a) decide **cuándo** se arma. Esto decide **qué pasa con la entrada ya armada** cuando
// el dueño toca un destino. Sin lo segundo, (a) **no alcanza**: armado en Inicio —legítimamente,
// porque no había nada debajo— el toque siguiente lo deja **debajo** de la entrada nueva, el atrás
// aterriza en una entrada de la raíz **con hash** que se ve igual que Inicio, y el atrás siguiente no
// hace **nada visible**. Medido en **E-9** (las dos formas) y **E-12** (el degenerado).

const MOD_PROVIDER = 'components/dashboard/unsaved-changes-guard.tsx'

describe('consumeOwnedExitSentinel — el consumo guardado de NUESTRA entrada del sentinel', () => {
  it('SE NIEGA si la entrada de arriba no lleva la marca del sentinel', () => {
    // Sin la marca no se retrocede: un `back()` sobre una entrada que no empujamos nosotros
    // EXPULSA AL DUEÑO DEL SITIO (cicatriz 2, ya sufrida tres veces en este repo).
    const ctx = montarPila({ state: { __NA: true }, pathname: PANEL_ROOT })
    expect(PB.consumeOwnedExitSentinel({ id: 7 })).toBe(false)
    expect(ctx.back).not.toHaveBeenCalled()
  })

  it('SE NIEGA con la marca de OTRA instancia: pregunta por ESTA, no sólo por el dueño', () => {
    // ⚠ ES LA DIFERENCIA CON SUS DOS HERMANAS, y no es cosmética: dos dueños por la misma entrada
    // DESCUADRAN el conteo de retrocesos y dejan un atrás muerto o uno de más.
    const ctx = montarPila({ state: PB.panelExitState(9), pathname: PANEL_ROOT })
    expect(PB.consumeOwnedExitSentinel({ id: 7 })).toBe(false)
    expect(ctx.back).not.toHaveBeenCalled()
  })

  it('consume con la marca PROPIA: retrocede una vez y devuelve que consumió', () => {
    const ctx = montarPila({ state: PB.panelExitState(7), pathname: PANEL_ROOT })
    expect(PB.consumeOwnedExitSentinel({ id: 7 })).toBe(true)
    expect(ctx.back).toHaveBeenCalledTimes(1)
  })

  it('tampoco consume la marca de la RAMA: son entradas y dueños distintos', () => {
    const ctx = montarPila({ state: panelUnderState(PANEL_MORE), pathname: PANEL_ROOT })
    expect(PB.consumeOwnedExitSentinel({ id: 7 })).toBe(false)
    expect(ctx.back).not.toHaveBeenCalled()
  })
})

describe('runBranchNavigation — CONSUMIR EL SENTINEL y recién entonces navegar (dos pasos)', () => {
  it('con identificador de dueño engancha UN listener de DISPARO ÚNICO antes de retroceder, y retrocede una vez', () => {
    const navegar = vi.fn()
    const ctx = montarPila({ state: PB.panelExitState(7), pathname: PANEL_ROOT })
    expect(
      PB.runBranchNavigation({
        plan: 'consume-exit-then-navigate',
        to: '/appointments',
        navigate: navegar,
        exitId: 7,
      })
    ).toBe(true)
    expect(ctx.enganchados).toHaveLength(1)
    expect(ctx.enganchados[0].tipo).toBe('popstate')
    // Sin disparo único el listener sobrevive al paso y el PRÓXIMO atrás del dueño dispara una
    // navegación que nadie pidió.
    expect(ctx.enganchados[0].opciones).toEqual({ once: true })
    expect(ctx.back).toHaveBeenCalledTimes(1)
    expect(ctx.desenganchados).toHaveLength(0)
  })

  it('NUNCA navega en el mismo tick del retroceso: la navegación sale del EVENTO', () => {
    // Pedida en el mismo tick, el retroceso todavía no ocurrió; y ejecutada adentro del evento, el
    // router de Next está procesando su traverse y la escritura NO ocurre. Medido como roto.
    const navegar = vi.fn()
    montarPila({ state: PB.panelExitState(7), pathname: PANEL_ROOT })
    PB.runBranchNavigation({
      plan: 'consume-exit-then-navigate',
      to: '/appointments',
      navigate: navegar,
      exitId: 7,
    })
    expect(navegar).not.toHaveBeenCalled()
  })

  it('desde el evento deja la navegación PEDIDA con el modo que da la política para raíz → destino (un EMPUJE)', () => {
    const navegar = vi.fn()
    const ctx = montarPila({ state: PB.panelExitState(7), pathname: PANEL_ROOT })
    PB.runBranchNavigation({
      plan: 'consume-exit-then-navigate',
      to: '/appointments',
      navigate: navegar,
      exitId: 7,
    })
    dispararRetroceso(ctx, { pathname: PANEL_ROOT, state: null })
    expect(navegar).toHaveBeenCalledTimes(1)
    // El modo sale de la POLÍTICA de rutas para el tramo raíz → destino, no de un literal.
    expect(navegar).toHaveBeenCalledWith(
      '/appointments',
      PH.panelNavMode({ from: PANEL_ROOT, to: '/appointments' })
    )
    expect(navegar).toHaveBeenCalledWith('/appointments', 'push')
    // Un solo retroceso: este plan consume UNA entrada, no dos.
    expect(ctx.back).toHaveBeenCalledTimes(1)
  })

  it('SIN identificador de dueño SE NIEGA: no retrocede, no engancha, y devuelve que no se hizo cargo', () => {
    // ⚠ ES LO QUE HACE QUE EL OTRO CONSUMIDOR DEGRADE. El provider del guard de cambios sin guardar
    // ejecuta el MISMO plan y NO es dueño del sentinel: si el ejecutor retrocediera igual, estaría
    // retrocediendo sobre una entrada ajena y dejaría al dueño FUERA DEL SITIO con cambios sin
    // guardar en pantalla — el peor resultado de todo ese archivo (cicatriz 2 / T-03-30).
    const navegar = vi.fn()
    const ctx = montarPila({ state: PB.panelExitState(7), pathname: PANEL_ROOT })
    expect(
      PB.runBranchNavigation({ plan: 'consume-exit-then-navigate', to: '/appointments', navigate: navegar })
    ).toBe(false)
    expect(ctx.back).not.toHaveBeenCalled()
    expect(ctx.enganchados).toHaveLength(0)
    expect(navegar).not.toHaveBeenCalled()
  })

  it('si el consumo SE NIEGA, el listener queda DESENGANCHADO a mano', () => {
    // La guarda se re-verifica en el momento del gesto, así que el listener se engancha ANTES de
    // intentar el consumo. Si el consumo se niega no va a llegar ningún evento: dejarlo vivo lo deja
    // armado para el PRÓXIMO atrás del dueño.
    const navegar = vi.fn()
    const ctx = montarPila({ state: { __NA: true }, pathname: PANEL_ROOT })
    expect(
      PB.runBranchNavigation({
        plan: 'consume-exit-then-navigate',
        to: '/appointments',
        navigate: navegar,
        exitId: 7,
      })
    ).toBe(false)
    expect(ctx.back).not.toHaveBeenCalled()
    expect(ctx.desenganchados).toHaveLength(ctx.enganchados.length)
    expect(ctx.desenganchados[0]).toBe(ctx.enganchados[0].fn)
  })

  it('EL CASO DE G-1 (el sentinel ENTERRADO) — con el sentinel arriba en la raíz, tocar un destino lo CONSUME primero', () => {
    // Lo que el dueño midió: *recarga y vuelve a `dashboard#salir-3`*, y *a la primera que toco
    // atrás no hace nada*. El plan de la rama produce el miembro nuevo y el ejecutor retrocede ANTES
    // de navegar, así que la entrada del sentinel NO queda en el camino del atrás. Medido en E-9.
    const navegar = vi.fn()
    const ctx = montarPila({ state: PB.panelExitState(7), pathname: PANEL_ROOT })
    const plan = PH.panelBranchPlan({
      from: PANEL_ROOT,
      to: '/appointments',
      raizDebajo: false,
      masDebajo: false,
      holdsExitSentinel: true,
    })
    expect(plan).toBe('consume-exit-then-navigate')
    expect(PB.runBranchNavigation({ plan, to: '/appointments', navigate: navegar, exitId: 7 })).toBe(true)
    // El retroceso va PRIMERO y la navegación DESPUÉS: ése es el orden que evita el entierro.
    expect(ctx.back).toHaveBeenCalledTimes(1)
    expect(navegar).not.toHaveBeenCalled()
    dispararRetroceso(ctx, { pathname: PANEL_ROOT, state: null })
    expect(navegar).toHaveBeenCalledWith('/appointments', 'push')
  })

  it('las ramas de HOY del ejecutor dan exactamente lo mismo, miembro por miembro', () => {
    // No regresión: el miembro nuevo no cambió ninguna de las cuatro ramas que ya estaban.
    const ctxNada = montarPila({ state: panelUnderState(PANEL_MORE), pathname: PANEL_ROOT })
    expect(PB.runBranchNavigation({ plan: 'none', to: PANEL_ROOT, navigate: vi.fn() })).toBe(true)
    expect(ctxNada.back).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
    for (const plan of ['push', 'replace'] as const) {
      const ctx = montarPila({ state: panelUnderState(PANEL_MORE), pathname: '/finances' })
      expect(PB.runBranchNavigation({ plan, to: '/clients', navigate: vi.fn() })).toBe(false)
      expect(ctx.back).not.toHaveBeenCalled()
      vi.unstubAllGlobals()
    }
    const ctxUp = montarPila({ state: panelUnderState(PANEL_ROOT), pathname: '/finances' })
    expect(PB.runBranchNavigation({ plan: 'up', to: PANEL_MORE, navigate: vi.fn() })).toBe(true)
    expect(ctxUp.back).toHaveBeenCalledTimes(1)
  })
})

describe('el DOMINIO se suelta ANTES del retroceso deliberado, y el otro consumidor DEGRADA', () => {
  it('el hecho de *sentinel vivo* se apaga antes de delegar al ejecutor (si no, el aviso salta al tocar la barra)', () => {
    // ⚠ T-03-29. Sin esto, el retroceso deliberado llega a la decisión del retroceso con el hecho
    // encendido, se lee como el atrás del dueño, y APARECE EL AVISO DE SALIDA al tocar un destino de
    // la barra: un bug nuevo fabricado por el arreglo. Se afirma leyendo el fuente porque el punto
    // de delegación vive en el hook, y el runner no monta componentes.
    const handle = sinComentarios(leer(MOD_DUENO)).match(
      /function handleNavigate\(href: string\): boolean \{[\s\S]*?\n {2}\}/,
    )
    expect(handle).not.toBeNull()
    const cuerpo = handle?.[0] ?? ''
    expect(cuerpo).toContain('consume-exit-then-navigate')
    expect(cuerpo).toContain('sentinelVivoRef.current = false')
    // Y el apagado va ANTES de la llamada al ejecutor, no después.
    expect(cuerpo.indexOf('sentinelVivoRef.current = false')).toBeLessThan(
      cuerpo.indexOf('runBranchNavigation')
    )
  })

  it('la decisión del retroceso devuelve IGNORAR sin el hecho: tocar la barra no puede mostrar el aviso', () => {
    // Cae del lado seguro: sin el hecho, el peor caso es que el aviso NO aparezca sobre una entrada
    // que ya no es nuestra — nunca un retroceso sobre entrada ajena. Y el efecto de armado RE-DERIVA
    // el hecho del estado de la entrada de arriba en el commit siguiente (la lección de E-6).
    expect(
      PB.panelExitPopAction({
        topIsOurs: false,
        participates: true,
        atRoot: true,
        holding: false,
        keyboardGuards: false,
      })
    ).toBe('ignore')
  })

  it('el provider del guard DECLARA el miembro nuevo en su ejecutor exhaustivo, y su respuesta es DEGRADAR', () => {
    // No es dueño del sentinel, así que no puede consumirlo: el ejecutor se niega sin identificador
    // de dueño y la salida navega con la regla de rutas. Tiene que estar DECLARADO igual, porque el
    // chequeo de exhaustividad es el candado contra el camino por defecto que nadie eligió.
    const provider = leer(MOD_PROVIDER)
    expect(provider).toContain("case 'consume-exit-then-navigate':")
    expect(provider).toContain('_exhaustivo: never')
  })

  it('y el provider sigue con CERO mutaciones crudas de historial', () => {
    // El invariante más viejo de ese archivo: NUNCA retrocede por su cuenta — apaga su bandera y
    // deja que cada dueño consuma SU entrada con SU guarda. Un retroceso sin guarda ahí es pérdida
    // de trabajo SILENCIOSA en una pantalla con cambios sin guardar.
    const provider = sinComentarios(leer(MOD_PROVIDER))
    expect(provider.length).toBeGreaterThan(500)
    expect(cuenta(provider, /history\.back|pushState|replaceState/g)).toBe(0)
  })
})

// ── Plan 03-07 — EL ARMADO SIN RETORNOS SILENCIOSOS (cierre de G-5 / G-6) ────────────────────────
//
// Los dos gaps son **el mismo defecto visto de dos lados**: el armado **se intenta y se niega sin
// dejar rastro**. G-5 es *"para que funcione tengo que entrar a alguna sección y volver a inicio,
// sino sale de una sin aviso"*; G-6 es *"si toco atrás una vez, pasan 30 segundos, y toco el segundo
// atrás, sale de una"*. Esta tanda cubre las tres piezas que el plan 03-07 agrega:
//   · la decisión de dominio, que deja de ser el retorno temprano más silencioso del módulo;
//   · la SÉPTIMA regla de armado, decidida midiendo en E-13 (el origen del `dashboard#salir-3`);
//   · los CUATRO momentos de reintento, con el del retroceso IGNORADO y SIN el del aviso.

describe('branchOwnerDecision — la decisión de dominio, PURA y con casos', () => {
  it('existe y está exportada: deja de ser un retorno temprano sin cobertura', () => {
    // Era el camino de falla MÁS SILENCIOSO del módulo: no lo ve `tsc`, ni la suite, ni el build, y
    // su efecto es que toda instancia nueva SE ABSTIENE DE ARMAR — o sea G-5, literal.
    expect(typeof PB.branchOwnerDecision).toBe('function')
  })

  it('SIN dueña figurando ⇒ puede operar: nadie reclamó la pila', () => {
    expect(PB.branchOwnerDecision({ duenaFigurando: null, preguntaId: 7, instanciasVivas: 0 })).toBe('operar')
    expect(PB.branchOwnerDecision({ duenaFigurando: null, preguntaId: 7, instanciasVivas: 3 })).toBe('operar')
  })

  it('con la dueña siendo ÉSTA ⇒ puede operar', () => {
    expect(PB.branchOwnerDecision({ duenaFigurando: 7, preguntaId: 7, instanciasVivas: 1 })).toBe('operar')
  })

  it('con OTRA instancia VIVA ⇒ se abstiene: es el comportamiento de hoy y es el seguro', () => {
    // Dos dueños por la MISMA entrada descuadran el conteo de retrocesos y dejan un atrás muerto o
    // uno de más. Con una viva que no es ésta, la nueva no toca la pila.
    expect(PB.branchOwnerDecision({ duenaFigurando: 3, preguntaId: 7, instanciasVivas: 1 })).toBe('abstenerse')
    expect(PB.branchOwnerDecision({ duenaFigurando: 3, preguntaId: 7, instanciasVivas: 5 })).toBe('abstenerse')
  })

  it('EL QUE SANA — con otra figurando pero CERO instancias vivas ⇒ puede operar', () => {
    // Si la limpieza no corrió (un árbol descartado, un doble montaje de desarrollo), la variable
    // queda apuntando a una INSTANCIA MUERTA. Con cero vivas, nadie vivo podía tenerlo: la que
    // pregunta TOMA el dominio. Sin esto, el módulo entero deja de armar sin decir nada.
    expect(PB.branchOwnerDecision({ duenaFigurando: 3, preguntaId: 7, instanciasVivas: 0 })).toBe('operar')
  })

  it('el ORDEN: ser la dueña le gana al conteo, y el conteo sólo decide cuando la dueña es otra', () => {
    expect(PB.branchOwnerDecision({ duenaFigurando: 7, preguntaId: 7, instanciasVivas: 9 })).toBe('operar')
    expect(PB.branchOwnerDecision({ duenaFigurando: 8, preguntaId: 7, instanciasVivas: 9 })).toBe('abstenerse')
  })

  it('el hook la CONSUME en vez de repetir el `if` a mano, y en sus tres guardas', () => {
    // El punto de extraerla no es la elegancia: es que las tres guardas del hook dejen de ser tres
    // copias de la misma condición, donde una puede divergir de las otras sin que nada se ponga rojo.
    const mod = sinComentarios(leer(MOD_DUENO))
    expect(mod.length).toBeGreaterThan(500)
    expect(cuenta(mod, /branchOwnerDecision\(/g)).toBeGreaterThanOrEqual(3)
    // Y el conteo de vivas sube y baja en el MISMO efecto: uno sin el otro deja el candado mintiendo.
    expect(cuenta(mod, /instanciasVivas \+= 1/g)).toBe(1)
    expect(cuenta(mod, /instanciasVivas = Math\.max\(0, instanciasVivas - 1\)/g)).toBe(1)
  })
})

describe('EL PAR QUE NO HAY QUE CONFUNDIR — la negativa CORRECTA contra la negativa SILENCIOSA', () => {
  // ⚠ ES EL CANDADO CONTRA EL PEOR REFACTOR POSIBLE DE ESTE PLAN. Las dos son negativas del armado y
  // se parecen; una es la decisión del dueño FUNCIONANDO y la otra es el bug. "Arreglar" la primera
  // reintroduce exactamente la colisión que la decisión (a) resolvió, y el síntoma es el aviso
  // apareciendo cuando el dueño NO iba a salir (el ítem H de la UAT, otra vez).
  const LIBRE = {
    participates: true,
    atRoot: true,
    hintOpen: false,
    topIsOurs: false,
    urlYaLlevaNuestroHash: false,
    foreignOwnsTop: false,
    algoNuestroDebajo: false,
  }

  it('la negativa CORRECTA: con la marca de la rama en la entrada de la raíz NO se arma, y está BIEN', () => {
    // Hay una sección NUESTRA debajo: el atrás va a ir ahí, que es MOB-04. Es la decisión (a) del
    // dueño funcionando, no un defecto. NO SE TOCA.
    expect(PB.panelExitArmAction({ ...LIBRE, algoNuestroDebajo: true })).toBe('none')
  })

  it('la negativa SILENCIOSA: el dominio apuntando a una INSTANCIA MUERTA — antes no armaba, ahora sí', () => {
    // Misma negativa en pantalla (el atrás sale sin avisar) y causa OPUESTA: acá nadie decidió nada,
    // el módulo se abstuvo porque una variable quedó colgada. Es G-5, y es lo que este plan elimina.
    expect(PB.branchOwnerDecision({ duenaFigurando: 99, preguntaId: 7, instanciasVivas: 0 })).toBe('operar')
    // Y con el dominio sano, la decisión de armado sí llega a correr y arma.
    expect(PB.panelExitArmAction(LIBRE)).toBe('arm')
  })
})

describe('la SÉPTIMA regla — si la URL ya lleva nuestro hash, NO armar (medido en E-13)', () => {
  const LIBRE = {
    participates: true,
    atRoot: true,
    hintOpen: false,
    topIsOurs: false,
    urlYaLlevaNuestroHash: false,
    foreignOwnsTop: false,
    algoNuestroDebajo: false,
  }

  it('con la URL llevando nuestro hash ⇒ NO armar: la entrada YA es nuestra', () => {
    // Aunque su estado lo haya pisado una escritura ajena. Empujar otra escalaría el hash y costaría
    // DOS atrás: es el origen medido de `dashboard#salir-3` que el dueño reportó (E-13, mitad B).
    expect(PB.panelExitArmAction({ ...LIBRE, urlYaLlevaNuestroHash: true })).toBe('none')
  })

  it('GANA sobre la regla de política: con la URL nuestra, no arma con el hecho en cualquier valor', () => {
    expect(PB.panelExitArmAction({ ...LIBRE, urlYaLlevaNuestroHash: true, algoNuestroDebajo: false })).toBe('none')
    expect(PB.panelExitArmAction({ ...LIBRE, urlYaLlevaNuestroHash: true, algoNuestroDebajo: true })).toBe('none')
  })

  it('PIERDE contra *ya estoy armado*: parados sobre el nuestro, devuelve la CUARTA', () => {
    // ⚠ ADYACENTE AL DE ARRIBA A PROPÓSITO: los dos juntos fijan el ORDEN. Las dos reglas hablan de
    // la entrada de arriba y las dos devuelven `none`, así que el orden no se puede afirmar con el
    // valor de retorno — se afirma leyendo el fuente (el caso de abajo), y acá queda el de
    // comportamiento.
    expect(PB.panelExitArmAction({ ...LIBRE, topIsOurs: true, urlYaLlevaNuestroHash: true })).toBe('none')
  })

  it('el ORDEN en el fuente: la séptima va DESPUÉS de *ya estoy armado* y ANTES de la de política', () => {
    // ⚠ EL RECORTE CIERRA EN LA LLAVE SOLA AL FINAL DE LÍNEA (`/m` con `\}$`) y NO en `\n\}` a secas:
    // con eso se trunca en el `}: {` que separa el objeto desestructurado de su tipo, y el caso
    // quedaría midiendo CERO sobre una región vacía. Es la trampa que esta fase ya pisó cuatro veces.
    const cuerpo = sinComentarios(leer(MOD_DUENO)).match(
      /export function panelExitArmAction\([\s\S]*?\n\}$/m,
    )
    expect(cuerpo).not.toBeNull()
    const src = cuerpo?.[0] ?? ''
    const iArmado = src.indexOf("if (topIsOurs) return 'none'")
    const iHash = src.indexOf("if (urlYaLlevaNuestroHash) return 'none'")
    const iPolitica = src.indexOf("if (algoNuestroDebajo) return 'none'")
    expect(iArmado).toBeGreaterThan(-1)
    expect(iHash).toBeGreaterThan(-1)
    expect(iPolitica).toBeGreaterThan(-1)
    expect(iArmado).toBeLessThan(iHash)
    expect(iHash).toBeLessThan(iPolitica)
  })

  it('el hecho va SIN VALOR POR OMISIÓN: un call site que lo olvide NO COMPILA', () => {
    const firma = sinComentarios(leer(MOD_DUENO)).match(
      /export function panelExitArmAction\(\{[\s\S]*?\): PanelExitArmAction \{/,
    )
    expect(firma).not.toBeNull()
    expect(firma?.[0]).toContain('urlYaLlevaNuestroHash: boolean')
    expect(firma?.[0]).not.toContain('urlYaLlevaNuestroHash?')
    expect(firma?.[0]).not.toMatch(/urlYaLlevaNuestroHash\s*=/)
  })

  it('SIETE reglas que no arman, y UNA sola salida que arma', () => {
    // El número es el candado: con SEIS la séptima no se implementó y el hash sigue escalando y
    // acumulando entradas de salida; con OCHO se agregó una regla que nadie decidió.
    const cuerpo = sinComentarios(leer(MOD_DUENO)).match(
      /export function panelExitArmAction\([\s\S]*?\n\}$/m,
    )
    expect(cuerpo).not.toBeNull()
    // Y el candado del candado: la región recortada tiene que ser LARGA. Una región vacía o truncada
    // en la firma contaría cero, y `toBe(7)` fallaría — pero con otro número de regla también, así
    // que el largo distingue "la regla falta" de "el recorte no mide nada".
    expect((cuerpo?.[0] ?? '').length).toBeGreaterThan(400)
    expect(cuenta(cuerpo?.[0] ?? '', /return 'none'/g)).toBe(7)
    expect(cuenta(cuerpo?.[0] ?? '', /return 'arm'/g)).toBe(1)
  })

  it('las SEIS reglas anteriores siguen dando lo mismo, una por una', () => {
    expect(PB.panelExitArmAction(LIBRE)).toBe('arm')
    expect(PB.panelExitArmAction({ ...LIBRE, participates: false })).toBe('none')
    expect(PB.panelExitArmAction({ ...LIBRE, atRoot: false })).toBe('none')
    expect(PB.panelExitArmAction({ ...LIBRE, hintOpen: true })).toBe('none')
    expect(PB.panelExitArmAction({ ...LIBRE, topIsOurs: true })).toBe('none')
    expect(PB.panelExitArmAction({ ...LIBRE, foreignOwnsTop: true })).toBe('none')
    expect(PB.panelExitArmAction({ ...LIBRE, algoNuestroDebajo: true })).toBe('none')
  })

  it('el hecho se contesta con un predicado PURO sobre el hash, no con un `startsWith` a secas', () => {
    // `#salirXYZ` NO es nuestro: un `startsWith` lo tomaría como propio y el sentinel nunca se
    // armaría en una pantalla con un hash ajeno que empieza igual. Las formas que reconoce son
    // EXACTAMENTE las que `nextPanelExitHash` puede producir.
    expect(PB.urlAlreadyHoldsExitHash(PB.PANEL_EXIT_HASH)).toBe(true)
    expect(PB.urlAlreadyHoldsExitHash(PB.PANEL_EXIT_HASH + '-2')).toBe(true)
    expect(PB.urlAlreadyHoldsExitHash(PB.PANEL_EXIT_HASH + '-7')).toBe(true)
    expect(PB.urlAlreadyHoldsExitHash('')).toBe(false)
    expect(PB.urlAlreadyHoldsExitHash('#seccion')).toBe(false)
    expect(PB.urlAlreadyHoldsExitHash(PB.PANEL_EXIT_HASH + 'XYZ')).toBe(false)
    expect(PB.urlAlreadyHoldsExitHash(PB.PANEL_EXIT_HASH + '-')).toBe(false)
    expect(PB.urlAlreadyHoldsExitHash(PB.PANEL_EXIT_HASH + '-abc')).toBe(false)
    // Y el candado de ida y vuelta: todo lo que el derivador produce, el predicado lo reconoce.
    for (const actual of ['', '#seccion', PB.PANEL_EXIT_HASH, PB.PANEL_EXIT_HASH + '-2']) {
      expect(PB.urlAlreadyHoldsExitHash(PB.nextPanelExitHash(actual))).toBe(true)
    }
  })

  it('el armado lo alimenta leyendo el hash REAL de `location`, nunca un valor de render', () => {
    const armado = sinComentarios(leer(MOD_DUENO)).match(
      /const armarSentinel = useCallback[\s\S]*?\n {2}\}, \[/,
    )
    expect(armado).not.toBeNull()
    expect(armado?.[0]).toContain('urlYaLlevaNuestroHash')
    expect(armado?.[0]).toContain('urlAlreadyHoldsExitHash(window.location.hash)')
  })
})

// ── La opción (A) del veredicto del plan 03-12: la recarga del 1.3 (G3-3) ────────────────────────
//
// Una recarga PRESERVA el estado de la entrada (el `frjExit` de la instancia del documento anterior)
// y el módulo nace con OTRO `id` (pares medidos: 1→21, 21→1, 1→5, 1→157, 37→108). La séptima regla
// declinaba SIN acreditar *seguimos absorbiendo* y el `popstate` siguiente se ignoraba. (A) acredita en
// la rama `none` del armado — con la definición de OTRO DUEÑO corregida contra el código: la regla 0
// (`isForeignOwnedEntry`) reconoce la marca de salida de CUALQUIER instancia, y usada a secas
// rechazaría justo la entrada de la recarga.

describe('panelExitStillHolding — la acreditación de (A), pura, con las reglas en orden', () => {
  const NADA = { paradoSobreElNuestro: false, ajenaArriba: false, salidaArriba: false, urlNuestra: false }

  it('regla 1 — parados sobre NUESTRO sentinel ⇒ acredita (E-6, va primera)', () => {
    expect(PB.panelExitStillHolding({ ...NADA, paradoSobreElNuestro: true })).toBe(true)
  })

  it('regla 2 — la entrada de arriba es de OTRO dueño (ajena y sin marca de salida: un overlay o el guard) ⇒ NO acredita, aunque la URL sea nuestra', () => {
    // Contrapuesto adyacente del de abajo: la misma URL, un dueño distinto.
    expect(PB.panelExitStillHolding({ ...NADA, ajenaArriba: true, salidaArriba: false, urlNuestra: true })).toBe(false)
  })

  it('regla 3 — la URL lleva una de NUESTRAS formas exactas ⇒ acredita', () => {
    expect(PB.panelExitStillHolding({ ...NADA, urlNuestra: true })).toBe(true)
  })

  it('regla 4 — el resto ⇒ NO acredita', () => {
    expect(PB.panelExitStillHolding(NADA)).toBe(false)
  })

  it('⚠ la marca de salida de una instancia MUERTA, con la URL nuestra ⇒ ACREDITA (la entrada medida de la recarga)', () => {
    // EL CASO QUE CORRIGE LA PREMISA. Con `isForeignOwnedEntry` a secas como el hecho de otro dueño,
    // esta entrada —`frjExit` de otro `id`— quedaría RECHAZADA y el defecto medido seguiría abierto.
    const estado = { frjExit: 1 }
    expect(PH.isForeignOwnedEntry(estado)).toBe(true)
    expect(PH.isExitSentinelOwnedEntry(estado)).toBe(true)
    expect(
      PB.panelExitStillHolding({
        paradoSobreElNuestro: PB.isPanelExitEntry(estado, 21),
        ajenaArriba: PH.isForeignOwnedEntry(estado),
        salidaArriba: PH.isExitSentinelOwnedEntry(estado),
        urlNuestra: PB.urlAlreadyHoldsExitHash('#salir'),
      }),
    ).toBe(true)
  })

  it('la URL nuestra con el estado PISADO por el router (sin ninguna marca) ⇒ acredita (E-13 mitad B, del lado del popstate)', () => {
    const pisado = { __NA: true }
    expect(
      PB.panelExitStillHolding({
        paradoSobreElNuestro: PB.isPanelExitEntry(pisado, 21),
        ajenaArriba: PH.isForeignOwnedEntry(pisado),
        salidaArriba: PH.isExitSentinelOwnedEntry(pisado),
        urlNuestra: PB.urlAlreadyHoldsExitHash('#salir-2'),
      }),
    ).toBe(true)
  })

  it('un hash AJENO que empieza igual (`#salirXYZ`) ⇒ NO acredita', () => {
    expect(PB.panelExitStillHolding({ ...NADA, urlNuestra: PB.urlAlreadyHoldsExitHash('#salirXYZ') })).toBe(false)
  })

  it('la composición de punta a punta: la séptima declina, (A) acredita, y el retroceso AVISA', () => {
    const estado = { frjExit: 1 }
    const id = 21
    const hash = '#salir'
    expect(
      PB.panelExitArmAction({
        participates: true,
        atRoot: true,
        hintOpen: false,
        topIsOurs: PB.isPanelExitEntry(estado, id),
        urlYaLlevaNuestroHash: PB.urlAlreadyHoldsExitHash(hash),
        foreignOwnsTop: PH.isForeignOwnedEntry(estado),
        algoNuestroDebajo: PH.panelUnderRoute(estado) !== null,
      }),
    ).toBe('none')
    const holding = PB.panelExitStillHolding({
      paradoSobreElNuestro: PB.isPanelExitEntry(estado, id),
      ajenaArriba: PH.isForeignOwnedEntry(estado),
      salidaArriba: PH.isExitSentinelOwnedEntry(estado),
      urlNuestra: PB.urlAlreadyHoldsExitHash(hash),
    })
    expect(holding).toBe(true)
    expect(PB.panelExitPopAction({ topIsOurs: false, participates: true, atRoot: true, holding, keyboardGuards: false })).toBe('hint')
  })

  it('…y su contracara adyacente: con la acreditación VIEJA (sólo parados sobre el nuestro) el mismo retroceso se IGNORA', () => {
    const estado = { frjExit: 1 }
    const holdingViejo = PB.isPanelExitEntry(estado, 21)
    expect(holdingViejo).toBe(false)
    expect(PB.panelExitPopAction({ topIsOurs: false, participates: true, atRoot: true, holding: holdingViejo, keyboardGuards: false })).toBe('ignore')
  })

  it('el cableado: la rama `none` del armado ASIGNA la referencia con la función, y la marca de salida se lee UNA vez', () => {
    // Asignar —y no sólo encender— es re-derivar en los dos sentidos: con la forma vieja, una
    // referencia acreditada sobre una marca muerta sobrevivía a dejar Inicio y el `popstate` de la
    // vuelta avisaba parado sobre una entrada que no es la de salir.
    const mod = sinComentarios(leer(MOD_DUENO))
    expect(cuenta(mod, /sentinelVivoRef\.current = panelExitStillHolding\(/g)).toBe(1)
    expect(cuenta(mod, /if \(paradoSobreElNuestro\) sentinelVivoRef/g)).toBe(0)
    const armado = mod.match(/const armarSentinel = useCallback[\s\S]*?\n {2}\}, \[/)?.[0] ?? ''
    expect(armado.length).toBeGreaterThan(300)
    expect(cuenta(armado, /isExitSentinelOwnedEntry\(estado\)/g)).toBe(1)
    const desde = mod.indexOf('export function panelExitStillHolding({')
    expect(desde).toBeGreaterThan(0)
    const region = mod.slice(desde, mod.indexOf('\n}\n', desde) + 3)
    expect(region.length).toBeGreaterThan(80)
    expect(cuenta(region, /isForeignOwnedEntry|window|navigator|document|history/g)).toBe(0)
  })
})

describe('los CUATRO momentos de reintento — y el que NO re-arma', () => {
  /** El manejador del retroceso, recortado del fuente sin comentarios. */
  function manejadorDelRetroceso(): string {
    const m = sinComentarios(leer(MOD_DUENO)).match(/const alRetroceder = \(\) => \{[\s\S]*?\n {4}\}\n/)
    expect(m).not.toBeNull()
    return m?.[0] ?? ''
  }

  it('G-5 — el reintento NO depende de que cambie la ruta: hay CUATRO llamadas al armado, y las del retroceso NO empujan', () => {
    // El sospechoso que el dueño midió con palabras exactas: el armado vivía en un efecto con deps
    // `[armarSentinel, pathname]`, así que si no armó al entrar, parado en Inicio NO VOLVÍA A
    // INTENTARLO NUNCA. Desde la decisión del 2026-10-28 los cuatro momentos son: al montar y al cambiar
    // la ruta (el efecto), en todo retroceso resuelto como IGNORAR, en el del teclado, y en el TOQUE del
    // dueño —el que reemplaza al temporizador—. Las dos del retroceso pasan el hecho en FALSO: un atrás
    // no es una activación.
    const mod = sinComentarios(leer(MOD_DUENO))
    expect(mod.length).toBeGreaterThan(500)
    expect(cuenta(mod, /armarSentinel\(\{/g)).toBe(4)
    expect(cuenta(manejadorDelRetroceso(), /armarSentinel\(\{ puedeEmpujar: false \}\)/g)).toBe(2)
  })

  it('el retroceso resuelto como IGNORAR reintenta el armado SIN PODER EMPUJAR, y el manejador no empuja nunca', () => {
    // Un retroceso ignorado significa que el atrás hizo algo que NO ERA NUESTRO —cerrar un overlay,
    // consumir una sección que teníamos encima—. Re-derivar el armado sigue haciendo falta (E-6), pero
    // EMPUJAR ahí es empujar sin activación (salteable) y, en el consumo de la barra, enterrar el
    // sentinel bajo la navegación diferida: el hallazgo lateral del plan 03-12. Cerrado por estructura.
    const handler = manejadorDelRetroceso()
    const ramaIgnorar = handler.match(/accion === 'ignore'\) \{[\s\S]*?\n {6}\}/)
    expect(ramaIgnorar).not.toBeNull()
    expect(ramaIgnorar?.[0]).toContain('armarSentinel({ puedeEmpujar: false })')
    expect(cuenta(handler, /armarSentinel\(/g)).toBe(2)
    expect(cuenta(handler, /pushState/g)).toBe(0)
    expect(cuenta(handler, /panelExitActivationNow/g)).toBe(0)
  })

  it('G-6 — después de levantar el aviso no hay re-armado ni empuje hasta el final del manejador', () => {
    // ⚠ EL ROJO TENTADOR: re-armar en la rama del aviso es PEOR QUE EL BUG — dos avisos encadenados y el
    // dueño nunca sale del panel. Y sin temporizador, la rama del aviso TERMINA ahí: el re-armado es del
    // próximo toque del dueño.
    const handler = manejadorDelRetroceso()
    const iAviso = handler.indexOf('setHintVisible(true)')
    expect(iAviso).toBeGreaterThan(-1)
    const cola = handler.slice(iAviso)
    expect(cola).not.toMatch(/armarSentinel\(/)
    expect(cola).not.toMatch(/pushState/)
  })

  it('el TOQUE baja el aviso y re-arma con la activación que leyó, y sin marca de rama ARMA', () => {
    // Reemplaza a *al expirar la ventana se oculta el aviso y se re-arma*. El orden es carga: si se
    // armara antes de bajar, la tercera regla de `panelExitArmAction` (el aviso abierto) declinaría y el
    // toque bajaría el aviso SIN re-armar — el bug del 3.1 por otro camino.
    const mod = sinComentarios(leer(MOD_DUENO))
    const toque = mod.match(/const alTocar = \(evento: Event\) => \{[\s\S]*?\n {4}\}\n/)?.[0] ?? ''
    expect(toque.length).toBeGreaterThan(300)
    const iDecision = toque.indexOf('panelExitTouchAction(')
    const iCanal = toque.indexOf('recordExitDiag(')
    const iBaja = toque.indexOf('setHintVisible(false)')
    const iCierra = toque.indexOf('avisoAbiertoRef.current = false')
    const iArma = toque.indexOf('armarSentinel({ puedeEmpujar: activacion })')
    expect(iDecision).toBeGreaterThan(-1)
    expect(iCanal).toBeGreaterThan(iDecision)
    expect(iBaja).toBeGreaterThan(iCanal)
    expect(iCierra).toBeGreaterThan(iCanal)
    expect(iArma).toBeGreaterThan(iBaja)
    expect(iArma).toBeGreaterThan(iCierra)
    // UNA sola lectura de la activación en el toque, y el MISMO valor viaja al armado.
    expect(cuenta(toque, /panelExitActivationNow\(navigator\.userActivation\)/g)).toBe(1)
    expect(
      PB.panelExitArmAction({
        participates: true,
        atRoot: true,
        hintOpen: false,
        topIsOurs: false,
        urlYaLlevaNuestroHash: false,
        foreignOwnsTop: false,
        algoNuestroDebajo: false,
      })
    ).toBe('arm')
  })

  it('el ÚNICO empuje del módulo vive adentro de un `if (` que nombra el hecho, y ningún call site pasa un literal verdadero', () => {
    // Reemplaza a *un solo temporizador, la constante en 2* (eso lo cubre ahora *cero tiempo en el
    // ciclo*). Es el candado central del camino 1: un empuje sin activación es la causa medida de G3-2
    // y G3-3.
    const mod = sinComentarios(leer(MOD_DUENO))
    expect(cuenta(mod, /window\.history\.pushState/g)).toBe(1)
    expect(cuenta(mod, /puedeEmpujar: *true/g)).toBe(0)
    const lineas = mod.split('\n')
    const iEmpuje = lineas.findIndex((l) => /window\.history\.pushState/.test(l))
    let guarda = ''
    for (let k = iEmpuje; k >= 0; k--) {
      if (/if \(/.test(lineas[k])) {
        guarda = lineas[k]
        break
      }
    }
    expect(guarda).toContain('puedeEmpujar')
    // Y el efecto del armado lee la activación del navegador en el momento de decidir.
    expect(mod).toContain('armarSentinel({ puedeEmpujar: panelExitActivationNow(navigator.userActivation) })')
  })

  it('EL OBSERVABLE queda escrito en el módulo: si la URL no muestra el hash, no está armado', () => {
    // Es lo que convierte G-5 y G-6 de un misterio en un chequeo de un vistazo, y es el primer ítem
    // de cada ciclo del guion de la UAT del plan 03-08. El hash es la CONDICIÓN DE EXISTENCIA de la
    // entrada, así que la implicación vale en los dos sentidos.
    const mod = leer(MOD_DUENO)
    expect(mod).toMatch(/si la URL no muestra/i)
    expect(mod).toContain('03-08')
  })
})

// ── El DISPARO ÚNICO de la navegación diferida (bug de la ronda 2 de la UAT) ─────────────────────
//
// POR QUÉ ESTE BLOQUE EXISTE. El efecto que ejecuta la navegación pedida llevaba la decisión adentro,
// en dos `if`, y un comentario que afirmaba: "no hace falta limpiar `pedida`: con las mismas deps el
// efecto no vuelve a correr". Es FALSO en cuanto el call site pasa una `navigate` que no es estable,
// y la barra la pasaba como flecha INLINE ⇒ identidad nueva en cada render ⇒ el efecto re-navegaba en
// CADA commit. Medido en el teléfono: tocar Turnos una vez y quedar clavado ahí, con cualquier otro
// destino devolviendo a Turnos. Y medido en el log del dev server: una pared de `GET /appointments`,
// y un `GET /clients` seguido inmediatamente de `/appointments`.
//
// LO VIERON CERO GATES: ni `tsc`, ni el lint, ni esta suite, ni el build, ni la sonda CDP —que maneja
// una página estática y no la app—. Por eso la decisión se EXTRAJO: el hook no tiene cobertura y se
// decidió que no la tenga acá (un renderer de React + `jsdom` mediría el historial de forma
// aproximada justo donde esta fase mide contra el navegador real, y un verde ahí con el teléfono rojo
// es el patrón *verde midiendo cero* otra vez). Extraída, entra en la suite pura sin una dependencia.

describe('branchPendingNav — el disparo único de la navegación diferida', () => {
  const pedido = (href: string, mode: BranchNavMode = 'push') => ({ href, mode })

  it('existe y está exportada: la decisión dejó de ser dos `if` sin cobertura adentro del efecto', () => {
    expect(typeof PB.branchPendingNav).toBe('function')
  })

  it('SIN pedido ⇒ null: no hay nada que ejecutar', () => {
    expect(PB.branchPendingNav({ pedida: null, yaEjecutada: null })).toBeNull()
    expect(PB.branchPendingNav({ pedida: null, yaEjecutada: pedido('/appointments') })).toBeNull()
  })

  it('un pedido NUEVO ⇒ lo devuelve, y devuelve EL MISMO objeto', () => {
    // La identidad importa: es lo que el call site guarda en la referencia del *ya ejecutado*.
    const p = pedido('/appointments')
    expect(PB.branchPendingNav({ pedida: p, yaEjecutada: null })).toBe(p)
  })

  it('EL CANDADO DEL BUCLE — el pedido YA EJECUTADO ⇒ null, corra el efecto las veces que corra', () => {
    // Es el bug entero, en una línea: con `navigate` inestable el efecto se re-corre en cada commit,
    // y lo único que impide que re-navegue es esta regla.
    const p = pedido('/appointments')
    expect(PB.branchPendingNav({ pedida: p, yaEjecutada: p })).toBeNull()
  })

  it('el bucle medido: UNA ejecución sobre VEINTE corridas del efecto con el mismo pedido', () => {
    // Simula lo que pasaba de verdad: el efecto re-corriendo porque `navigate` cambió de identidad,
    // con el pedido todavía vivo en el estado. Antes de la regla, acá habría 20 navegaciones.
    const p = pedido('/appointments')
    let yaEjecutada: PB.PendingNav | null = null
    const navegaciones: string[] = []
    for (let i = 0; i < 20; i += 1) {
      const aEjecutar = PB.branchPendingNav({ pedida: p, yaEjecutada })
      if (aEjecutar === null) continue
      yaEjecutada = aEjecutar
      navegaciones.push(aEjecutar.href)
    }
    expect(navegaciones).toEqual(['/appointments'])
  })

  it('LA COMPARACIÓN ES POR IDENTIDAD Y NO POR VALOR — dos gestos al MISMO destino corren los dos', () => {
    // El mismo bug del otro lado, y tan silencioso como el primero: tocar Turnos, volver a Inicio y
    // tocar Turnos otra vez son DOS pedidos, con los mismos campos y distinta identidad. Comparando
    // `href` y `mode` el segundo quedaría suprimido y el gesto moriría sin que nada se ponga rojo.
    // Este caso es el candado contra "simplificar" la regla a una comparación de campos.
    const primero = pedido('/appointments')
    const segundo = pedido('/appointments')
    expect(primero).toEqual(segundo)
    expect(PB.branchPendingNav({ pedida: segundo, yaEjecutada: primero })).toBe(segundo)
  })

  it('un pedido nuevo DESPUÉS de uno ejecutado ⇒ corre: el gesto siguiente no queda suprimido', () => {
    const primero = pedido('/appointments')
    const segundo = pedido('/clients', 'replace')
    expect(PB.branchPendingNav({ pedida: segundo, yaEjecutada: primero })).toBe(segundo)
  })

  it('el efecto la CONSUME en vez de repetir los dos `if`, y NO limpia el estado', () => {
    const mod = sinComentarios(leer(MOD_DUENO))
    expect(cuenta(mod, /branchPendingNav\(/g)).toBeGreaterThanOrEqual(2)
    // `setPedida(null)` es lo que `react-hooks/set-state-in-effect` prohíbe: renders en cascada. El
    // dato del *ya ejecutado* vive en una referencia, y el único `setPedida` del módulo es el del
    // ejecutor, que DEJA el pedido.
    expect(cuenta(mod, /setPedida\(null\)/g)).toBe(0)
    expect(cuenta(mod, /setPedida\(/g)).toBe(1)
  })

  it('EL CALL SITE memoiza la navegación: la otra mitad, la del consumidor', () => {
    // El invariante lo sostiene la regla de arriba, no esto. Pero una `navigate` inline deja el
    // efecto re-corriendo en cada commit para nada, y es lo que destapó el bug.
    const barra = sinComentarios(leer('components/dashboard/panel-bottom-nav.tsx'))
    expect(cuenta(barra, /useCallback<BranchNavigate>\(/g)).toBe(1)
    expect(cuenta(barra, /navigate: navegar/g)).toBe(1)
  })
})

// ── Plan 03-11 — G3-1: la marca de la rama VIAJA por encima del `replace` ────────────────────────
//
// EL CASO DE PUNTA A PUNTA, Y POR QUÉ ES UNA SOLA CORRIDA. Lo que `G3-1` reportó roto no es una
// decisión: es una propiedad de la PILA que cruza un commit del router. El paso de la **pérdida** —el
// reemplazo ajeno con el que el router escribe su propio state encima— tiene que estar ADENTRO del
// mismo caso, o lo que se mide es la función aislada y no el camino.

describe('G3-1 — la marca VIAJA por encima del `replace` (el camino entero, una sola corrida)', () => {
  it('un gesto de `replace` deja el pedido con la ruta LEÍDA, el router pisa la entrada, y la marca VUELVE', () => {
    // El recorrido del dueño: `Inicio → Turnos → Clientes`. Parado en Turnos, la entrada de arriba
    // dice que debajo está la RAÍZ. El reemplazo de sección a sección deja que el router escriba su
    // propio state encima, y hoy NADIE la vuelve a escribir: parado en Clientes la entrada no tiene
    // marca ⇒ el hecho de la regla -1c es falso ⇒ el gesto siguiente EMPUJA.
    const ctx = montarPila({ state: panelUnderState(PANEL_ROOT), pathname: '/appointments' })
    // El gesto, con el valor leído del MISMO estado que la decisión ya leyó.
    expect(typeof PB.branchCarryMark).toBe('function')
    expect(
      PB.branchCarryMark({
        plan: 'replace',
        from: '/appointments',
        to: '/clients',
        rutaDebajo: PH.panelUnderRoute(ctx.win.history.state),
      })
    ).toBe(true)
    // El `<Link>` reemplaza: el router escribe SU state sobre la entrada y se lleva nuestra marca.
    ctx.win.history.state = { __NA: true }
    ctx.win.location.pathname = '/clients'
    // El efecto de marcado corre en el commit nuevo y consume el canal ANTES de la decisión.
    expect(PB.applyBranchMarkRequest('/clients')).toBe(true)
    expect(ctx.replaceState).toHaveBeenCalledTimes(1)
    expect(ctx.replaceState).toHaveBeenCalledWith({ frjUnder: PANEL_ROOT }, '')
    // Y la afirmación que cierra el gap: parado en Clientes el hecho de la regla -1c es VERDADERO, así
    // que tocar Inicio RETROCEDE en vez de empujar.
    expect(
      PH.panelBranchPlan({
        from: '/clients',
        to: PANEL_ROOT,
        raizDebajo: PH.panelUnderRoute(panelUnderState(PANEL_ROOT)) === PANEL_ROOT,
        masDebajo: false,
        holdsExitSentinel: false,
      })
    ).toBe('up')
  })

  it('la CADENA de DOS reemplazos: la marca sigue diciendo la raíz después de los dos, no de uno', () => {
    // El recorrido completo del dueño: `Inicio → Turnos → Clientes → Agenda`. Lo que ningún caso
    // medía antes es la CADENA: con un reemplazo solo, el bug no se ve.
    const ctx = montarPila({ state: panelUnderState(PANEL_ROOT), pathname: '/appointments' })
    // Primer reemplazo: Turnos → Clientes.
    expect(
      PB.branchCarryMark({
        plan: 'replace',
        from: '/appointments',
        to: '/clients',
        rutaDebajo: PH.panelUnderRoute(ctx.win.history.state),
      })
    ).toBe(true)
    ctx.win.history.state = { __NA: true }
    ctx.win.location.pathname = '/clients'
    expect(PB.applyBranchMarkRequest('/clients')).toBe(true)
    expect(ctx.replaceState).toHaveBeenNthCalledWith(1, { frjUnder: PANEL_ROOT }, '')
    // La entrada queda como la dejó el escritor único, y de ahí sale el valor del gesto siguiente.
    ctx.win.history.state = panelUnderState(PANEL_ROOT)
    // Segundo reemplazo: Clientes → Agenda.
    expect(
      PB.branchCarryMark({
        plan: 'replace',
        from: '/clients',
        to: '/agenda',
        rutaDebajo: PH.panelUnderRoute(ctx.win.history.state),
      })
    ).toBe(true)
    ctx.win.history.state = { __NA: true }
    ctx.win.location.pathname = '/agenda'
    expect(PB.applyBranchMarkRequest('/agenda')).toBe(true)
    expect(ctx.replaceState).toHaveBeenNthCalledWith(2, { frjUnder: PANEL_ROOT }, '')
    // Y nunca escribió la ruta de la que veníamos, que es lo que la derivación del par daría.
    expect(ctx.replaceState).not.toHaveBeenCalledWith({ frjUnder: '/clients' }, '')
  })

  it('el pedido se DESCARTA igual si la navegación no fue a donde decía', () => {
    const ctx = montarPila({ state: panelUnderState(PANEL_ROOT), pathname: '/appointments' })
    expect(
      PB.branchCarryMark({ plan: 'replace', from: '/appointments', to: '/clients', rutaDebajo: PANEL_ROOT })
    ).toBe(true)
    ctx.win.history.state = { __NA: true }
    expect(PB.applyBranchMarkRequest('/agenda')).toBe(false)
    // Y ya no está: un pedido que sobrevive a una navegación que no ocurrió escribiría una marca
    // rancia en una entrada AJENA, el mismo bug del otro lado.
    expect(PB.applyBranchMarkRequest('/clients')).toBe(false)
    expect(ctx.replaceState).not.toHaveBeenCalled()
  })

  it('la entrada de destino que YA lleva marca no se re-escribe: la idempotencia del escritor único', () => {
    const ctx = montarPila({ state: panelUnderState(PANEL_ROOT), pathname: '/appointments' })
    expect(
      PB.branchCarryMark({ plan: 'replace', from: '/appointments', to: '/clients', rutaDebajo: PANEL_ROOT })
    ).toBe(true)
    // La entrada de destino ya sabe qué tiene debajo: escribir encima destruiría esa verdad.
    ctx.win.history.state = panelUnderState('/finances')
    expect(PB.applyBranchMarkRequest('/clients')).toBe(true)
    expect(ctx.replaceState).not.toHaveBeenCalled()
  })

  it('la entrada de OTRO DUEÑO tampoco se escribe: la regla 0, en el mismo escritor único', () => {
    const ctx = montarPila({ state: panelUnderState(PANEL_ROOT), pathname: '/appointments' })
    expect(
      PB.branchCarryMark({ plan: 'replace', from: '/appointments', to: '/clients', rutaDebajo: PANEL_ROOT })
    ).toBe(true)
    ctx.win.history.state = { frjOverlay: 1 }
    expect(PB.applyBranchMarkRequest('/clients')).toBe(true)
    expect(ctx.replaceState).not.toHaveBeenCalled()
  })

  it('el productor está CABLEADO EN EL GESTO, sobre el mismo estado y antes de devolver para el `<Link>`', () => {
    // ⚠ EL CANDADO QUE MIDE EL CAMINO Y NO LA FUNCIÓN AISLADA. El hook no se puede montar acá (el
    // runner no monta componentes, y un historial de `jsdom` es una aproximación de justo lo que esta
    // fase mide contra el navegador real), así que el cableado se audita en la FUENTE, recortando la
    // región del gesto por su firma exacta. Con la llamada comentada, este caso se pone ROJO.
    const mod = sinComentarios(leer(MOD_DUENO))
    const desde = mod.indexOf('function handleNavigate(href: string): boolean {')
    expect(desde).toBeGreaterThan(0)
    const gesto = mod.slice(desde, mod.indexOf('\n  }', desde) + 4)
    expect(gesto.length).toBeGreaterThan(300)
    // UNA llamada al productor, y el valor sale del MISMO `estado` que se leyó para los tres hechos.
    expect(cuenta(gesto, /branchCarryMark\(/g)).toBe(1)
    expect(gesto).toContain('rutaDebajo: panelUnderRoute(estado)')
    expect(cuenta(gesto, /window\.history\.state/g)).toBe(1)
    // Y va ANTES de la salida para los dos modos del `<Link>`: después, no se ejecutaría nunca.
    expect(gesto.indexOf('branchCarryMark(')).toBeLessThan(gesto.indexOf("if (plan === 'push'"))
  })

  it('el canal tiene DOS productores y UN consumidor, y los dos productores están nombrados', () => {
    const mod = sinComentarios(leer(MOD_DUENO))
    expect(mod.length).toBeGreaterThan(5000)
    // 1 declaración + 2 del colapso + 1 del gesto.
    expect(cuenta(mod, /pedirMarcaPropagada\(/g)).toBe(4)
    // El consumidor sigue siendo UNO: 1 declaración + 1 llamada en el efecto de marcado.
    expect(cuenta(mod, /applyBranchMarkRequest\(/g)).toBe(2)
    // Y la disciplina compartida está ESCRITA, que es la mitad del argumento del segundo productor.
    const crudo = leer(MOD_DUENO)
    expect(cuenta(crudo, /DOS PRODUCTORES/g)).toBeGreaterThanOrEqual(1)
    expect(cuenta(crudo, /LLENA ESTE CANAL QUIEN/g)).toBeGreaterThanOrEqual(1)
    // Los dos componentes siguen con CERO menciones del canal, del rastreo y del productor nuevo.
    for (const comp of ['components/dashboard/panel-bottom-nav.tsx', 'components/dashboard/unsaved-changes-guard.tsx']) {
      const src = sinComentarios(leer(comp))
      expect(src.length).toBeGreaterThan(500)
      expect(cuenta(src, /branchCarryMark|applyBranchMarkRequest|recordBackLanding|takeBackLanding/g)).toBe(0)
    }
  })

  it('`panelNavMode` y `panelBranchPlan` quedan INTACTAS: el arreglo es aditivo y vive fuera de las dos', () => {
    // El criterio 6 del ROADMAP protege el atrás de ESCRITORIO ENTERO, y el orden de las reglas de la
    // decisión de rama está medido en siete escenarios de sonda. Las dos se recortan y se cuentan.
    const pol = sinComentarios(leer(MOD_REGLA0))
    const d1 = pol.indexOf('export function panelNavMode({')
    const d2 = pol.indexOf('export function panelBranchPlan({')
    expect(d1).toBeGreaterThan(0)
    expect(d2).toBeGreaterThan(d1)
    // ⚠ EL ANCLA DE CIERRE ES LA LLAVE SOLA EN SU LÍNEA (`\n}\n`): con `\n}` el recorte se trunca en
    // el `}: {` del cierre de la firma con parámetro-objeto y el contador mide CERO estando en verde.
    const nav = pol.slice(d1, pol.indexOf('\n}\n', d1) + 3)
    const plan = pol.slice(d2, pol.indexOf('\n}\n', d2) + 3)
    expect(nav.length).toBeGreaterThan(200)
    expect(plan.length).toBeGreaterThan(400)
    expect(cuenta(nav, /return '/g)).toBe(6)
    expect(cuenta(nav, /if \(/g)).toBe(5)
    expect(cuenta(plan, /if \(/g)).toBe(6)
    expect(cuenta(plan, /return 'up'/g)).toBe(2)
    expect(cuenta(plan, /return modo/g)).toBe(2)
    // Y el productor nuevo no vive en el módulo de política: la propagación necesita el `window`.
    expect(cuenta(pol, /branchCarryMark/g)).toBe(0)
  })

  it('G3-1 — el arreglo no agregó una clave nueva a la pila ni un miembro nuevo al plan de rama', () => {
    // Una cuarta clave sería un cuarto dueño sin necesidad (la regla 0 reconoce TRES a propósito), y
    // un séptimo miembro obligaría a tocar el `switch` del guard: el segundo dialecto otra vez.
    const mod = sinComentarios(leer(MOD_DUENO))
    expect(cuenta(mod, /frjCarry|frjPropag|frjUnderFrom|frjReplace/g)).toBe(0)
    const pol = sinComentarios(leer(MOD_REGLA0))
    const tipo = pol.slice(pol.indexOf('export type PanelBranchPlan'), pol.indexOf('export function panelBranchPlan'))
    expect(tipo.length).toBeGreaterThan(60)
    // Dos de `PanelNavMode` más cuatro propios: SEIS.
    expect(cuenta(tipo, /\| '/g)).toBe(4)
    expect(tipo).toContain('| PanelNavMode')
    // Y el predicado de la regla 0 sigue reconociendo TRES dueños.
    const desde = pol.indexOf('export function isForeignOwnedEntry')
    const regla0 = pol.slice(desde, pol.indexOf('\n}', desde) + 2)
    expect(cuenta(regla0, /isOverlayOwnedEntry|isDirtyGuardOwnedEntry|isExitSentinelOwnedEntry/g)).toBe(3)
  })
})

describe('branchCarryMark — las reglas EN ORDEN, y la del valor leído va ÚLTIMA', () => {
  it('`replace` de una ruta a otra con una ruta LEÍDA ⇒ el pedido queda hecho con ESA ruta', () => {
    const ctx = montarPila({ state: panelUnderState(PANEL_ROOT), pathname: '/appointments' })
    expect(
      PB.branchCarryMark({ plan: 'replace', from: '/appointments', to: '/clients', rutaDebajo: PANEL_ROOT })
    ).toBe(true)
    ctx.win.history.state = { __NA: true }
    expect(PB.applyBranchMarkRequest('/clients')).toBe(true)
    expect(ctx.replaceState).toHaveBeenCalledWith({ frjUnder: PANEL_ROOT }, '')
  })

  it('`replace` con la MISMA ruta ⇒ NO se pide nada: ahí el efecto de marcado no vuelve a correr', () => {
    // El reemplazo cae SOBRE LA MISMA ENTRADA y el pathname no cambia, así que el pedido sobreviviría
    // a una navegación que no es la que lo pidió: una marca rancia sobre una entrada ajena.
    const ctx = montarPila({ state: panelUnderState(PANEL_ROOT), pathname: '/clients' })
    expect(
      PB.branchCarryMark({ plan: 'replace', from: '/clients', to: '/clients', rutaDebajo: PANEL_ROOT })
    ).toBe(false)
    expect(PB.applyBranchMarkRequest('/clients')).toBe(false)
    expect(ctx.replaceState).not.toHaveBeenCalled()
  })

  it('`push` ⇒ NO se pide nada: la decisión de marcado ya sabe qué quedó debajo de una entrada nueva', () => {
    const ctx = montarPila({ state: panelUnderState(PANEL_ROOT), pathname: PANEL_ROOT })
    expect(
      PB.branchCarryMark({ plan: 'push', from: PANEL_ROOT, to: '/appointments', rutaDebajo: PANEL_ROOT })
    ).toBe(false)
    expect(PB.applyBranchMarkRequest('/appointments')).toBe(false)
    expect(ctx.replaceState).not.toHaveBeenCalled()
    // Y ahí la derivación del par de rutas es CORRECTA, que es por qué no hace falta pedir nada.
    expect(branchMarkDecision({ previous: PANEL_ROOT, current: '/appointments', vieneDeUnRetroceso: false })).toBe(PANEL_ROOT)
  })

  it('los OTROS CUATRO miembros del plan ⇒ no se pide nada: cada uno tiene su propio camino', () => {
    montarPila({ state: panelUnderState(PANEL_ROOT), pathname: '/finances' })
    for (const plan of ['up', 'collapse-then-replace', 'consume-exit-then-navigate', 'none'] as const) {
      expect(PB.branchCarryMark({ plan, from: '/finances', to: '/clients', rutaDebajo: PANEL_ROOT })).toBe(false)
      expect(PB.applyBranchMarkRequest('/clients')).toBe(false)
    }
  })

  it('SIN RUTA LEÍDA no se inventa ninguna: se abstiene, y la pila queda un escalón más larga', () => {
    // ⚠ LA REGLA QUE NO SE NEGOCIA. Con la marca ya perdida antes del reemplazo, lo que queda debajo
    // del destino es DESCONOCIDO: escribir la ruta de la que venimos mandaría el gesto de atrás a una
    // entrada que no empujamos nosotros, o sea al dueño FUERA DEL SITIO.
    const ctx = montarPila({ state: { __NA: true }, pathname: '/appointments' })
    expect(
      PB.branchCarryMark({
        plan: 'replace',
        from: '/appointments',
        to: '/clients',
        rutaDebajo: PH.panelUnderRoute(ctx.win.history.state),
      })
    ).toBe(false)
    expect(PB.applyBranchMarkRequest('/clients')).toBe(false)
    expect(ctx.replaceState).not.toHaveBeenCalled()
    // La degradación segura, medida: sin marca el hecho de la regla -1c es falso y el gesto EMPUJA.
    expect(
      PH.panelBranchPlan({
        from: '/clients',
        to: PANEL_ROOT,
        raizDebajo: false,
        masDebajo: false,
        holdsExitSentinel: false,
      })
    ).toBe('push')
  })

  it('las TRES reglas van en orden, y la del valor leído va ÚLTIMA (auditoría de fuente)', () => {
    // El orden es lo que hace que el caso *destino igual* y el caso *no es un reemplazo* se resuelvan
    // por SU propio motivo y no por casualidad de que la marca estuviera ausente.
    const mod = sinComentarios(leer(MOD_DUENO))
    const desde = mod.indexOf('export function branchCarryMark({')
    expect(desde).toBeGreaterThan(0)
    // El ancla de cierre es la llave SOLA en su línea, por el mismo motivo de siempre.
    const region = mod.slice(desde, mod.indexOf('\n}\n', desde) + 3)
    expect(region.length).toBeGreaterThan(150)
    expect(cuenta(region, /if \(/g)).toBe(3)
    expect(region.indexOf("plan !== 'replace'")).toBeLessThan(region.indexOf('from === to'))
    expect(region.indexOf('from === to')).toBeLessThan(region.indexOf('rutaDebajo === null'))
    // Escribe por la productora privada del canal y por nadie más, y no toca `window`: el valor ENTRA.
    expect(cuenta(region, /pedirMarcaPropagada\(/g)).toBe(1)
    expect(cuenta(region, /window\./g)).toBe(0)
    // Y el identificador del hecho de la regla -1c no aparece en su código: un solo dialecto.
    expect(cuenta(region, /raizDebajo/g)).toBe(0)
  })
})

// ── Plan 03-12 — EL CANAL DE DIAGNÓSTICO: inerte, total, acotado, y DESPUÉS de la decisión ───────
//
// POR QUÉ EXISTE. Los dos fallos de la re-corrida de la ronda 3 (`G3-2`, `G3-3`) comparten una firma
// —el hash está en la URL y el atrás no se absorbe—, y la sonda puede VER eso desde afuera pero no
// puede NOMBRAR cuál de las siete reglas declinó ni qué valía *seguimos absorbiendo*. El canal graba
// la decisión desde adentro, y sólo si algo externo (la sonda, antes del JS de la app) lo abrió.
//
// Lo que se afirma acá es lo que lo vuelve aceptable en producción: sin canal no hace nada (INERTE),
// ninguna excepción sale (TOTAL), no crece sin techo (ACOTADO), y no puede cambiar una decisión
// porque se llama DESPUÉS de computarla y nunca adentro de las dos decisiones puras.

type CanalAbierto = { __forjoPanelDiag?: unknown }

/** Un registro de armado mínimo y plano, como el que graba el hook. */
function registroDeArmado(ruta = PANEL_ROOT) {
  return {
    tipo: 'armado' as const,
    ruta,
    hash: '#salir',
    estado: { frjExit: 1 },
    id: 1,
    duenaFigurando: 1,
    instanciasVivas: 1,
    hechos: { participates: true, atRoot: true },
    accion: 'none',
    vivoAntes: false,
    vivoDespues: false,
  }
}

describe('recordExitDiag — el canal de diagnóstico del sentinel de salida (plan 03-12)', () => {
  it('INERTE: sin el canal abierto NO graba, no tira, y devuelve que no grabó', () => {
    // Es el estado de producción: nadie abre el canal, así que el instrumento no existe.
    expect((globalThis as CanalAbierto).__forjoPanelDiag).toBeUndefined()
    expect(PB.recordExitDiag(registroDeArmado())).toBe(false)
    expect((globalThis as CanalAbierto).__forjoPanelDiag).toBeUndefined()
  })

  it('INERTE también con un canal que NO es un arreglo: se abstiene, no lo pisa', () => {
    ;(globalThis as CanalAbierto).__forjoPanelDiag = { no: 'soy un arreglo' }
    expect(PB.recordExitDiag(registroDeArmado())).toBe(false)
    expect((globalThis as CanalAbierto).__forjoPanelDiag).toEqual({ no: 'soy un arreglo' })
  })

  it('con el canal abierto GRABA al final y devuelve que grabó: el orden de llegada es el dato', () => {
    const canal: unknown[] = [{ previo: true }]
    ;(globalThis as CanalAbierto).__forjoPanelDiag = canal
    expect(PB.recordExitDiag(registroDeArmado('/primero'))).toBe(true)
    expect(PB.recordExitDiag({ ...registroDeArmado('/segundo'), tipo: 'retroceso' })).toBe(true)
    expect(canal).toHaveLength(3)
    const ultimo = canal[2] as { tipo: string; ruta: string; estado: unknown; vivoAntes: boolean }
    expect(ultimo.tipo).toBe('retroceso')
    expect(ultimo.ruta).toBe('/segundo')
    // El estado de la entrada se graba YA PASADO A TEXTO: plano y serializable, sin referencias.
    expect(typeof ultimo.estado).toBe('string')
    expect(ultimo.estado).toContain('frjExit')
  })

  it('ACOTADO: con más registros que la cota nunca queda por encima, y descarta lo MÁS VIEJO', () => {
    expect(PB.PANEL_EXIT_DIAG_MAX).toBeGreaterThan(0)
    const canal: unknown[] = []
    ;(globalThis as CanalAbierto).__forjoPanelDiag = canal
    const total = PB.PANEL_EXIT_DIAG_MAX + 25
    for (let i = 0; i < total; i++) PB.recordExitDiag(registroDeArmado(`/r${i}`))
    expect(canal).toHaveLength(PB.PANEL_EXIT_DIAG_MAX)
    expect((canal[0] as { ruta: string }).ruta).toBe('/r25')
    expect((canal[canal.length - 1] as { ruta: string }).ruta).toBe(`/r${total - 1}`)
  })

  it('TOTAL frente a un canal HOSTIL: un `push` que tira no sale del instrumento', () => {
    // El segundo call site vive DENTRO del oyente del `popstate`: una excepción ahí deja el gesto a
    // medias y al dueño con un atrás roto. Un instrumento que puede romper el panel es peor que no
    // medir.
    const hostil: unknown[] = []
    hostil.push = () => {
      throw new Error('canal hostil')
    }
    ;(globalThis as CanalAbierto).__forjoPanelDiag = hostil
    expect(() => PB.recordExitDiag(registroDeArmado())).not.toThrow()
    expect(PB.recordExitDiag(registroDeArmado())).toBe(false)
  })

  it('TOTAL frente a un estado que no se puede pasar a texto (circular): graba igual, sin tirar', () => {
    const canal: unknown[] = []
    ;(globalThis as CanalAbierto).__forjoPanelDiag = canal
    const circular: Record<string, unknown> = { frjExit: 2 }
    circular.yo = circular
    expect(() => PB.recordExitDiag({ ...registroDeArmado(), estado: circular })).not.toThrow()
    expect(canal).toHaveLength(1)
    expect(typeof (canal[0] as { estado: unknown }).estado).toBe('string')
  })

  it('NO CAMBIA NINGUNA DECISIÓN: cero menciones adentro de las dos decisiones puras (auditoría de fuente)', () => {
    const mod = sinComentarios(leer(MOD_DUENO))
    for (const firma of ['export function panelExitArmAction({', 'export function panelExitPopAction({']) {
      const desde = mod.indexOf(firma)
      expect(desde).toBeGreaterThan(0)
      // El ancla de cierre es la llave SOLA en su línea: con una genérica el recorte se trunca en el
      // `}: {` de la firma con parámetro-objeto y el caso mide CERO.
      const region = mod.slice(desde, mod.indexOf('\n}\n', desde) + 3)
      expect(region.length).toBeGreaterThan(300)
      expect(cuenta(region, /recordExitDiag|__forjoPanelDiag/g)).toBe(0)
    }
  })

  it('se graba DESPUÉS de computar la acción, en los TRES call sites (armado, retroceso, toque) y en ninguno más', () => {
    const mod = sinComentarios(leer(MOD_DUENO))
    // 1 declaración + 3 call sites: el del toque se sumó en el plan 03-13 (es lo que deja a la sonda
    // distinguir un armado PENDIENTE de uno EMPUJADO, y nombrar la acción de cada toque).
    expect(cuenta(mod, /recordExitDiag\(/g)).toBe(4)
    const toque = mod.match(/const alTocar = \(evento: Event\) => \{[\s\S]*?\n {4}\}\n/)?.[0] ?? ''
    expect(toque.length).toBeGreaterThan(300)
    expect(toque.indexOf('recordExitDiag(')).toBeGreaterThan(toque.indexOf('panelExitTouchAction('))
    const armado = mod.match(/const armarSentinel = useCallback[\s\S]*?\n {2}\}, \[/)?.[0] ?? ''
    expect(armado.length).toBeGreaterThan(300)
    expect(armado.indexOf('recordExitDiag(')).toBeGreaterThan(armado.indexOf('panelExitArmAction('))
    // Y en el armado graba el *seguimos absorbiendo* de ANTES y de DESPUÉS de la rama.
    expect(armado).toContain('vivoAntes')
    expect(armado).toContain('vivoDespues')
    const retroceso = mod.match(/const alRetroceder = \(\) => \{[\s\S]*?\n {4}\}\n/)?.[0] ?? ''
    expect(retroceso.length).toBeGreaterThan(300)
    expect(retroceso.indexOf('recordExitDiag(')).toBeGreaterThan(retroceso.indexOf('panelExitPopAction('))
    // Cero tiempo en el ciclo: ni el temporizador ni la constante de la ventana (decisión del 2026-10-28).
    expect(cuenta(mod, /setTimeout/g)).toBe(0)
    expect(cuenta(mod, /PANEL_EXIT_HINT_MS/g)).toBe(0)
  })
})

// ── El camino 1 del dueño (2026-10-28): el sentinel se empuja SÓLO con activación del usuario ────
//
// POR QUÉ, medido y no supuesto: el plan 03-12 midió en la app real que la intervención de historial
// de Chrome SALTEA una entrada empujada sin activación del usuario (G3-2, G3-3), y el dueño decidió
// (03-DECISION-UAT-3.md) que el sentinel se empuje sólo con activación y que el aviso se quede hasta el
// próximo toque. Lo que sigue son las dos decisiones PURAS nuevas, con sus reglas en orden y sus
// contrapuestos adyacentes, y las auditorías del cableado que ninguna otra suite puede ver.

describe('panelExitActivationNow — el lector de la activación, puro', () => {
  it('con `isActive` en verdadero ⇒ verdadero', () => {
    expect(PB.panelExitActivationNow({ isActive: true })).toBe(true)
  })

  it('con `isActive` en falso ⇒ FALSO (contrapuesto adyacente: es el que deja el armado pendiente)', () => {
    expect(PB.panelExitActivationNow({ isActive: false })).toBe(false)
  })

  it('sin la API (`undefined`) ⇒ verdadero: el comportamiento de hoy, declarado', () => {
    // Con falso, un motor sin la API no armaría NUNCA —ni con un toque, porque el oyente del toque
    // pregunta lo mismo— y MOB-05 quedaría muerto ahí.
    expect(PB.panelExitActivationNow(undefined)).toBe(true)
  })

  it('con un objeto sin `isActive` booleano ⇒ verdadero, por el mismo motivo', () => {
    expect(PB.panelExitActivationNow({})).toBe(true)
    expect(PB.panelExitActivationNow({ isActive: 'si' })).toBe(true)
  })
})

describe('panelExitTouchAction — qué hace un toque, puro, con las reglas en orden', () => {
  const LIBRE = { participates: true, activacion: true, atRoot: true, gestoTomado: false, hintOpen: false }
  const ABIERTO = { ...LIBRE, hintOpen: true }

  it('regla 1 — nadie dibuja el aviso ⇒ nada', () => {
    expect(PB.panelExitTouchAction({ ...ABIERTO, participates: false })).toBe('none')
  })

  it('regla 2 — el evento NO trae activación (un click de script, Escape) ⇒ nada, aunque el aviso esté abierto', () => {
    expect(PB.panelExitTouchAction({ ...ABIERTO, activacion: false })).toBe('none')
  })

  it('regla 3 — fuera de la raíz con el aviso abierto ⇒ BAJARLO (un aviso rancio se baja)', () => {
    expect(PB.panelExitTouchAction({ ...ABIERTO, atRoot: false })).toBe('drop')
  })

  it('regla 4 — fuera de la raíz sin aviso ⇒ nada', () => {
    expect(PB.panelExitTouchAction({ ...LIBRE, atRoot: false })).toBe('none')
  })

  it('regla 5 — un gesto TOMADO (un link se lo llevó) con el aviso abierto ⇒ bajarlo y NO armar', () => {
    // ⚠ EL CASO QUE FIJA LA ELECCIÓN DEL EVENTO: empujar y navegar en el mismo gesto enterraría el
    // sentinel bajo la sección nueva, o lo pisaría el reemplazo del router (P-4). Arma el SIGUIENTE
    // toque que nadie se lleve.
    expect(PB.panelExitTouchAction({ ...ABIERTO, gestoTomado: true })).toBe('drop')
  })

  it('regla 6 — un gesto tomado SIN aviso ⇒ nada: TAMPOCO arma (contrapuesto adyacente del 5)', () => {
    expect(PB.panelExitTouchAction({ ...LIBRE, gestoTomado: true })).toBe('none')
  })

  it('regla 7 — en la raíz, con activación, sin gesto tomado y el aviso abierto ⇒ bajar y armar', () => {
    expect(PB.panelExitTouchAction(ABIERTO)).toBe('drop-and-arm')
  })

  it('regla 8 — lo mismo sin aviso ⇒ armar', () => {
    expect(PB.panelExitTouchAction(LIBRE)).toBe('arm')
  })
})

describe('el cableado del camino 1 — auditorías de fuente', () => {
  it('`armarSentinel` recibe el hecho SIN valor por omisión', () => {
    const mod = sinComentarios(leer(MOD_DUENO))
    expect(mod).toContain('const armarSentinel = useCallback(({ puedeEmpujar }: { puedeEmpujar: boolean }) => {')
    expect(mod).not.toMatch(/puedeEmpujar\s*=/)
  })

  it('los oyentes del toque (`click` y `keyup` sobre window) viven en el MISMO efecto que el del retroceso, y `keyup` ignora Enter y la barra', () => {
    const mod = sinComentarios(leer(MOD_DUENO))
    expect(cuenta(mod, /(add|remove)EventListener\('(click|keyup)'/g)).toBe(4)
    const desde = mod.indexOf('const alRetroceder = () => {')
    const efecto = mod.slice(desde, mod.indexOf('}, [drawsExitHint, id, root, armarSentinel])', desde))
    expect(efecto.length).toBeGreaterThan(500)
    for (const linea of [
      "window.addEventListener('click', alTocar)",
      "window.addEventListener('keyup', alTocar)",
      "window.removeEventListener('click', alTocar)",
      "window.removeEventListener('keyup', alTocar)",
    ]) {
      expect(efecto).toContain(linea)
    }
    const toque = mod.match(/const alTocar = \(evento: Event\) => \{[\s\S]*?\n {4}\}\n/)?.[0] ?? ''
    expect(toque).toContain("'Enter'")
    expect(toque).toContain("' '")
    expect(toque).toContain('defaultPrevented')
  })

  it('el aviso devuelto se DERIVA de la raíz: nunca se dibuja donde el próximo atrás no sale', () => {
    const mod = sinComentarios(leer(MOD_DUENO))
    expect(mod).toContain('hintVisible: hintVisible && pathname === root')
  })

  it('las dos decisiones nuevas son PURAS: no leen el navegador', () => {
    const mod = sinComentarios(leer(MOD_DUENO))
    for (const firma of ['export function panelExitTouchAction({', 'export function panelExitActivationNow(']) {
      const desde = mod.indexOf(firma)
      expect(desde).toBeGreaterThan(0)
      const region = mod.slice(desde, mod.indexOf('\n}\n', desde) + 3)
      expect(region.length).toBeGreaterThan(80)
      expect(cuenta(region, /window|navigator|document|history/g)).toBe(0)
    }
  })
})
