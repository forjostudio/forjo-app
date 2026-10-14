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

describe('la ventana del aviso — UNA constante, UN temporizador (§13, la regla de la constante única)', () => {
  it('la constante existe, está exportada y vale lo que §13 fija', () => {
    // La duración VISIBLE del aviso y la ventana LÓGICA en la que el segundo atrás sale son el mismo
    // número. Con dos, lo que el dueño ve y lo que el código acepta se desincronizan y los dos
    // síntomas son silenciosos: ni `tsc` ni la suite los ven.
    expect(PB.PANEL_EXIT_HINT_MS).toBe(2000)
  })

  it('el módulo la usa en UN SOLO temporizador, y no hay un segundo número', () => {
    // Se afirma LEYENDO EL FUENTE porque la propiedad es de la estructura del módulo y no de un valor
    // de retorno: dos temporizadores con el mismo número también serían dos lugares que pueden
    // divergir. Con los comentarios descontados, la constante aparece exactamente DOS veces: su
    // declaración y el único temporizador que la consume.
    const mod = sinComentarios(leer(MOD_DUENO))
    expect(mod.length).toBeGreaterThan(500)
    expect(cuenta(mod, /PANEL_EXIT_HINT_MS/g)).toBe(2)
    expect(cuenta(mod, /setTimeout/g)).toBe(1)
    expect(cuenta(mod, /setInterval|requestAnimationFrame/g)).toBe(0)
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
    foreignOwnsTop: false,
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
        foreignOwnsTop: false,
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
        foreignOwnsTop: true,
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
      expect(PH.panelBranchPlan({ from: PANEL_ROOT, to: PANEL_ROOT, masDebajo, holdsExitSentinel: true })).toBe('none')
    }
  })

  it('destino DISTINTO con el sentinel arriba ⇒ el plan NO cambia respecto del plan 03-02 (E-6)', () => {
    // La navegación empuja y el sentinel queda DEBAJO, que es la forma medida en E-6 y NO deja un
    // atrás muerto: estar parado sobre el sentinel cuenta como armado, así que el retroceso desde la
    // sección cae en Inicio con el sentinel vivo y el siguiente —el que lo consume— es el primer
    // intento de salida. Pasa algo visible en los dos.
    for (const to of DESTINOS) {
      if (to === PANEL_ROOT) continue
      expect(PH.panelBranchPlan({ from: PANEL_ROOT, to, masDebajo: false, holdsExitSentinel: true })).toBe(
        PH.panelBranchPlan({ from: PANEL_ROOT, to, masDebajo: false, holdsExitSentinel: false })
      )
    }
  })

  it('la regla nueva no cambia NINGUNA de las ramas que ya estaban (barrido de 10 × 5 × 2)', () => {
    // El barrido de no-regresión: sin el sentinel arriba el plan es EXACTAMENTE el del plan 03-02
    // para cada par, y con el sentinel arriba lo único que cambia es el par degenerado.
    for (const from of [...RAMA, PANEL_ROOT]) {
      for (const to of DESTINOS) {
        for (const masDebajo of [false, true]) {
          const antes = PH.panelBranchPlan({ from, to, masDebajo, holdsExitSentinel: false })
          expect(antes).not.toBe('none')
          expect(PH.panelBranchPlan({ from, to, masDebajo, holdsExitSentinel: true })).toBe(
            from === to ? 'none' : antes
          )
        }
      }
    }
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
