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
      expect(PH.panelBranchPlan({ from: PANEL_ROOT, to: PANEL_ROOT, masDebajo, holdsExitSentinel: true })).toBe('none')
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
        PH.panelBranchPlan({ from: PANEL_ROOT, to, masDebajo: false, holdsExitSentinel: true })
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
          const antes = PH.panelBranchPlan({ from, to, masDebajo, holdsExitSentinel: false })
          expect(antes).not.toBe('none')
          expect(antes).not.toBe('consume-exit-then-navigate')
          const esperado =
            from === to ? 'none' : from === PANEL_ROOT ? 'consume-exit-then-navigate' : antes
          expect(PH.panelBranchPlan({ from, to, masDebajo, holdsExitSentinel: true })).toBe(esperado)
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
