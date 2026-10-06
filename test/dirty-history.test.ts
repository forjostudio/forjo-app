import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  DIRTY_HASH_BASE,
  dirtyHistoryAction,
  dirtyHistoryState,
  dirtyLeavePlan,
  dirtyPopstateAction,
  dirtyUnmountAction,
  isDirtyHistoryEntry,
  isDirtyOwnedEntry,
  nextDirtyHash,
  nextDirtyId,
} from '@/lib/dirty-history'
import { isDirtyGuardOwnedEntry, isForeignOwnedEntry, panelHistoryAction, panelNavMode } from '@/lib/panel-history'
import { decideNavigation, leaveNavigationPlan } from '@/lib/unsaved-changes'

// ── Quick 261006-flm (NAV-10 / NAV-11) — el atrás frena cuando hay cambios sin guardar ──────────
// Suite PURA: `environment: 'node'`, sin jsdom ni Testing Library (el milestone prohíbe paquetes
// nuevos), así que lo que se cubre es el "qué se decide" + la ARITMÉTICA del stack. Molde:
// test/overlay-history.test.ts y lib/panel-history.test.ts.
//
// LA PARTE QUE VALE: el bloque de ESCENARIOS de más abajo no testea funciones de a una, simula el
// historial del navegador y corre la secuencia completa (ensuciarse → atrás → decidir → salir o
// quedarse) transcribiendo el MISMO orden de operaciones que el hook. Es donde viven los bugs de
// historial: las dos cicatrices del repo —empujar la misma URL, y hacer `back()` sobre una entrada
// ajena— son errores de aritmética, no de política.
//
// ⚠ LO QUE ESTA SUITE NO PUEDE VER, y por eso NO reemplaza la medición en el navegador: el `back()`
// real es ASÍNCRONO. Acá el simulador lo resuelve en el acto. La forma del código está elegida para
// que eso no importe —los dos pasos de la continuación se encadenan por el `popstate` de cada uno y
// nunca en el mismo tick, que es justo la variante que el diagnóstico midió ROTA—, pero la prueba de
// que la asincronía real no lo rompe es la medición con Chrome, no este archivo.

// ── El simulador del historial ───────────────────────────────────────────────────────────────────

type Entrada = { url: string; state: unknown }

/**
 * Un historial de navegador con lo justo: pila, posición, y un `popstate` que dispara al moverse.
 *
 * `pushState` TRUNCA el forward (como el browser), y `back()` avisa al listener DESPUÉS de haber
 * movido la posición — que es el orden real y la razón por la que el handler lee `history.state` para
 * saber sobre qué entrada quedó parado.
 */
class HistorialFalso {
  entradas: Entrada[]
  i: number
  listener: (() => void) | null = null
  listenerProvider: (() => void) | null = null

  constructor(inicial: Entrada[]) {
    this.entradas = [...inicial]
    this.i = inicial.length - 1
  }

  get state(): unknown {
    return this.entradas[this.i].state
  }
  get url(): string {
    return this.entradas[this.i].url
  }
  get hash(): string {
    const idx = this.url.indexOf('#')
    return idx === -1 ? '' : this.url.slice(idx)
  }

  pushState(state: unknown, url: string): void {
    this.entradas = this.entradas.slice(0, this.i + 1)
    this.entradas.push({ url, state })
    this.i = this.entradas.length - 1
  }

  replaceState(state: unknown, url: string): void {
    this.entradas[this.i] = { url, state }
  }

  back(): void {
    if (this.i === 0) throw new Error('el browser se fue del sitio: back() sobre la primera entrada')
    this.i -= 1
    this.listener?.()
    // El segundo listener es el del PROVIDER (el que encadena la navegación de "Salir sin guardar"
    // al `popstate` del consumo del sentinel). Va después porque se registra después: el del hook
    // nace cuando la pantalla se ensucia. En los escenarios que no lo usan queda en `null`.
    this.listenerProvider?.()
  }
}

/**
 * La transcripción del hook `useDirtyHistory` sobre el historial falso.
 *
 * Es una transcripción y no una re-implementación: cada paso llama a la MISMA función pura que llama
 * el hook, en el mismo orden, con las mismas guardas. Si el hook cambiara su orden sin cambiar las
 * funciones, esto quedaría desactualizado — por eso el bloque de auditoría del final afirma sobre el
 * fuente del hook.
 */
function montarGuard(
  h: HistorialFalso,
  { ruta, confirmar }: { ruta: string; confirmar: (leave: () => void) => boolean },
) {
  const id = nextDirtyId()
  let holding = false
  let leaving = false
  let dirty = false
  let escuchando = false

  const empujarSentinel = () => {
    h.pushState(dirtyHistoryState(id), `${ruta}${nextDirtyHash(h.hash)}`)
    holding = true
  }

  const onPop = () => {
    const action = dirtyPopstateAction({
      topIsOurs: isDirtyHistoryEntry(h.state, id),
      dirty,
      leaving,
      holding,
    })
    if (action === 'ignore') return
    if (action === 'leave') {
      leaving = false
      h.back()
      return
    }
    holding = false
    const avisado = confirmar(() => {
      const plan = dirtyLeavePlan({ topIsOurs: isDirtyHistoryEntry(h.state, id) })
      if (plan === 'consume-then-back') {
        leaving = true
        holding = false
      }
      h.back()
    })
    if (!avisado) {
      h.back()
      return
    }
    empujarSentinel()
  }

  /** Un commit de React: primero las limpiezas, después las instalaciones (y el efecto de armar). */
  const setDirty = (siguiente: boolean) => {
    // Limpieza del efecto del listener (corre ANTES que el cuerpo del efecto de armar: es lo que
    // garantiza que el `back()` de limpieza no se lea como un atrás del dueño).
    if (escuchando && !siguiente) {
      h.listener = null
      escuchando = false
    }
    const action = dirtyHistoryAction({ participates: true, dirty: siguiente, leaving, holding })
    dirty = siguiente
    if (action === 'push') empujarSentinel()
    else if (action === 'consume') {
      holding = false
      if (isDirtyHistoryEntry(h.state, id)) h.back()
    }
    if (!escuchando && siguiente) {
      h.listener = onPop
      escuchando = true
    }
  }

  const desmontar = () => {
    h.listener = null
    escuchando = false
    if (dirtyUnmountAction({ holding }) === 'none') return
    holding = false
    if (isDirtyHistoryEntry(h.state, id)) h.back()
  }

  return { setDirty, desmontar, get holding() { return holding }, get id() { return id } }
}

/** El atrás del usuario: el browser consume la entrada de arriba y avisa. */
function atrasDelUsuario(h: HistorialFalso) {
  h.back()
}

const AGENDA = '/agenda'
const stackInicial = () => new HistorialFalso([
  { url: '/dashboard', state: { __NA: true } },
  { url: AGENDA, state: { __NA: true } },
])

// ── El contrato con el historial ─────────────────────────────────────────────────────────────────

describe('la marca y el hash del sentinel', () => {
  it('el hash NO colisiona con el de los overlays ni con un id de la página', () => {
    // Si fuera `#modal` o `#modal-N`, `nextOverlayHash` lo interpretaría como profundidad de overlay
    // y los dos módulos se pisarían el cálculo. Y si existiera un elemento con ese id, el browser
    // scrollearía hasta él al empujar la entrada.
    expect(DIRTY_HASH_BASE).toBe('#sin-guardar')
    expect(DIRTY_HASH_BASE.startsWith('#modal')).toBe(false)
  })

  it('la marca es PROPIA: no es la de overlay-history ni la de panel-history', () => {
    const state = dirtyHistoryState(7)
    expect(state).toEqual({ frjDirty: 7 })
    expect('frjOverlay' in state).toBe(false)
    expect('frjView' in state).toBe(false)
  })

  it('reconoce su propia entrada y sólo la suya', () => {
    expect(isDirtyHistoryEntry({ frjDirty: 3 }, 3)).toBe(true)
    expect(isDirtyHistoryEntry({ frjDirty: 4 }, 3)).toBe(false)
    expect(isDirtyHistoryEntry({ frjOverlay: 3 }, 3)).toBe(false)
    expect(isDirtyHistoryEntry({ frjView: 'c' }, 3)).toBe(false)
    expect(isDirtyHistoryEntry(null, 3)).toBe(false)
    expect(isDirtyHistoryEntry(undefined, 3)).toBe(false)
    expect(isDirtyHistoryEntry({ __NA: true }, 3)).toBe(false)
  })

  it('el predicado genérico reconoce cualquier sentinel y nada más', () => {
    expect(isDirtyOwnedEntry({ frjDirty: 1 })).toBe(true)
    expect(isDirtyOwnedEntry({ frjDirty: 'si' })).toBe(false)
    expect(isDirtyOwnedEntry({ frjOverlay: 1 })).toBe(false)
    expect(isDirtyOwnedEntry(null)).toBe(false)
  })

  it('los ids no se repiten entre instancias', () => {
    const a = nextDirtyId()
    const b = nextDirtyId()
    expect(a).not.toBe(b)
  })

  it('el hash nunca repite la URL de la entrada de abajo (cicatriz 1)', () => {
    expect(nextDirtyHash('')).toBe('#sin-guardar')
    expect(nextDirtyHash('#seccion')).toBe('#sin-guardar')
    expect(nextDirtyHash('#modal')).toBe('#sin-guardar')
    expect(nextDirtyHash('#sin-guardar')).toBe('#sin-guardar-2')
    expect(nextDirtyHash('#sin-guardar-2')).toBe('#sin-guardar-3')
    // Basura: cae al base, nunca a `#sin-guardar-NaN`.
    expect(nextDirtyHash('#sin-guardar-')).toBe('#sin-guardar')
    expect(nextDirtyHash('#sin-guardar-abc')).toBe('#sin-guardar')
  })
})

// ── Las decisiones ───────────────────────────────────────────────────────────────────────────────

describe('dirtyHistoryAction — armar y consumir', () => {
  const base = { participates: true, dirty: false, leaving: false, holding: false }

  it('sucio y sin entrada ⇒ empuja', () => {
    expect(dirtyHistoryAction({ ...base, dirty: true })).toBe('push')
  })

  it('sucio y YA con entrada ⇒ no empuja una segunda (el dueño necesitaría dos backs)', () => {
    expect(dirtyHistoryAction({ ...base, dirty: true, holding: true })).toBe('none')
  })

  it('limpio y con entrada ⇒ la consume (si no, hay que apretar atrás dos veces para salir)', () => {
    expect(dirtyHistoryAction({ ...base, holding: true })).toBe('consume')
  })

  it('limpio y sin entrada ⇒ nada (y nunca un `back()` de más)', () => {
    expect(dirtyHistoryAction(base)).toBe('none')
  })

  it('sin nadie a quien pedirle el aviso NO se arma nada', () => {
    // Un sentinel que absorbe el atrás y después no muestra ningún diálogo convierte el gesto en un
    // botón muerto: peor que el bug.
    expect(dirtyHistoryAction({ ...base, participates: false, dirty: true })).toBe('none')
    expect(dirtyHistoryAction({ ...base, participates: false, holding: true })).toBe('none')
  })

  it('con una salida en curso este módulo no escribe', () => {
    expect(dirtyHistoryAction({ ...base, dirty: true, leaving: true })).toBe('none')
    expect(dirtyHistoryAction({ ...base, holding: true, leaving: true })).toBe('none')
  })

  it('al desmontar consume sólo si era dueño', () => {
    expect(dirtyUnmountAction({ holding: true })).toBe('consume')
    expect(dirtyUnmountAction({ holding: false })).toBe('none')
  })
})

describe('dirtyPopstateAction — qué significa un atrás', () => {
  const base = { topIsOurs: false, dirty: true, leaving: false, holding: false }

  it('se comió NUESTRO sentinel con cambios pendientes ⇒ hay que avisar', () => {
    expect(dirtyPopstateAction({ ...base, holding: true })).toBe('confirm')
  })

  it('ANIDADO LIFO: quedamos parados sobre nuestra entrada ⇒ el atrás cerró el modal, se ignora', () => {
    // Es la convención del panel y sale GRATIS: el modal empuja su entrada ENCIMA de la nuestra, así
    // que cuando el browser la consume seguimos sobre la nuestra. Sin esta regla, el aviso aparecería
    // al cerrar cada modal.
    expect(dirtyPopstateAction({ ...base, topIsOurs: true, holding: true })).toBe('ignore')
  })

  it('sin cambios pendientes no hay nada que decir', () => {
    expect(dirtyPopstateAction({ ...base, dirty: false, holding: true })).toBe('ignore')
  })

  it('UNA ESCRITURA AJENA PISÓ EL STATE: seguimos creyendo que tenemos la entrada, pero no se avisa', () => {
    // `holding: true` con `topIsOurs: false` también es el caso del aviso... lo que distingue es que
    // acá el pop ocurrió sin que fuéramos dueños: es el escenario medido S4 del diagnóstico, y lo que
    // importa es que NO se dispara ningún `back()` — ver el escenario 5 de más abajo.
    expect(dirtyPopstateAction({ ...base, holding: false })).toBe('ignore')
  })

  it('con una salida en curso, el pop es el primer paso de la continuación', () => {
    expect(dirtyPopstateAction({ ...base, leaving: true })).toBe('leave')
    // Y gana a todas las demás reglas: si no, el segundo paso se leería como un atrás nuevo y
    // volvería a preguntar en bucle.
    expect(dirtyPopstateAction({ ...base, leaving: true, topIsOurs: true, holding: true })).toBe('leave')
  })
})

describe('dirtyLeavePlan — cómo se completa el gesto sin destino', () => {
  it('con el sentinel arriba hacen falta DOS pasos', () => {
    expect(dirtyLeavePlan({ topIsOurs: true })).toBe('consume-then-back')
  })
  it('sin sentinel arriba, uno solo', () => {
    expect(dirtyLeavePlan({ topIsOurs: false })).toBe('back')
  })
})

// ── Los ESCENARIOS: la secuencia completa sobre el historial simulado ────────────────────────────

describe('ESCENARIOS — la aritmética del stack de punta a punta', () => {
  it('1 · sucio + atrás ⇒ avisa y NO sale de la página', () => {
    const h = stackInicial()
    let avisos = 0
    const g = montarGuard(h, { ruta: AGENDA, confirmar: () => { avisos += 1; return true } })

    g.setDirty(true)
    expect(h.url).toBe('/agenda#sin-guardar')

    atrasDelUsuario(h)
    expect(avisos).toBe(1)
    // Lo que importa: el dueño sigue en la agenda. Ni la ruta ni el índice bajaron a /dashboard.
    expect(h.url).toBe('/agenda#sin-guardar')
    expect(h.entradas[h.i - 1].url).toBe(AGENDA)
  })

  it('2 · decide QUEDARSE ⇒ la entrada vuelve y el atrás siguiente vuelve a avisar', () => {
    const h = stackInicial()
    let avisos = 0
    const g = montarGuard(h, { ruta: AGENDA, confirmar: () => { avisos += 1; return true } })
    g.setDirty(true)

    atrasDelUsuario(h)
    expect(isDirtyOwnedEntry(h.state)).toBe(true) // el sentinel se re-empujó
    atrasDelUsuario(h)
    expect(avisos).toBe(2)
    expect(h.url).toBe('/agenda#sin-guardar')
    // Y la pila no creció con cada vuelta: sigue habiendo UNA entrada nuestra.
    expect(h.entradas.filter(e => isDirtyOwnedEntry(e.state)).length).toBe(1)
  })

  it('3 · decide SALIR ⇒ aterriza en la entrada real anterior y SIN atrás muerto', () => {
    const h = stackInicial()
    let salir: (() => void) | null = null
    const g = montarGuard(h, { ruta: AGENDA, confirmar: (leave) => { salir = leave; return true } })
    g.setDirty(true)
    atrasDelUsuario(h)

    salir!()
    // El gesto que el dueño pidió: la entrada anterior de verdad.
    expect(h.url).toBe('/dashboard')
    // Y no quedó ninguna entrada nuestra viva: nada de "un atrás que no hace nada visible".
    expect(h.entradas.slice(0, h.i + 1).some(e => isDirtyOwnedEntry(e.state))).toBe(false)
    g.desmontar()
    expect(h.url).toBe('/dashboard')
  })

  it('4 · guardado ⇒ consume el sentinel, sin aviso espurio', () => {
    const h = stackInicial()
    let avisos = 0
    const g = montarGuard(h, { ruta: AGENDA, confirmar: () => { avisos += 1; return true } })

    g.setDirty(true)
    g.setDirty(false) // guardar = el baseline se re-captura y la comparación da limpio
    expect(avisos).toBe(0)
    expect(h.url).toBe(AGENDA)
    expect(h.i).toBe(1)
    // Y desde acá el atrás sale de la página como siempre, de una.
    atrasDelUsuario(h)
    expect(h.url).toBe('/dashboard')
    expect(avisos).toBe(0)
  })

  it('5 · una escritura AJENA pisa el state ⇒ NO se hace `back()` sobre la entrada ajena', () => {
    const h = stackInicial()
    const g = montarGuard(h, { ruta: AGENDA, confirmar: () => true })
    g.setDirty(true)
    expect(g.holding).toBe(true)

    // El `replace` del sidebar pasa por `completeSoftNavigation` (preserveCustomHistoryState: false):
    // la entrada sigue ahí, nuestra marca NO.
    h.replaceState({ __NA: true }, '/finances')
    expect(isDirtyOwnedEntry(h.state)).toBe(false)

    const antes = h.i
    g.setDirty(false) // el consumo se evalúa... y la guarda de la marca lo frena
    expect(h.i).toBe(antes)
    expect(h.url).toBe('/finances')
    // Mismo candado al desmontar.
    g.desmontar()
    expect(h.i).toBe(antes)
  })

  it('6 · ANIDADO LIFO: con un modal abierto, el atrás cierra el modal y no avisa', () => {
    const h = stackInicial()
    let avisos = 0
    const g = montarGuard(h, { ruta: AGENDA, confirmar: () => { avisos += 1; return true } })
    g.setDirty(true)

    // El overlay empuja SU entrada encima (lib/overlay-history.ts).
    h.pushState({ frjOverlay: 1 }, '/agenda#modal')
    atrasDelUsuario(h)

    expect(avisos).toBe(0)
    expect(isDirtyOwnedEntry(h.state)).toBe(true) // quedamos parados sobre el sentinel
    // Y el atrás siguiente —ya sin modal— sí avisa.
    atrasDelUsuario(h)
    expect(avisos).toBe(1)
  })

  it('7 · NADIE avisa (sin provider) ⇒ el gesto se completa en vez de quedar muerto', () => {
    const h = stackInicial()
    const g = montarGuard(h, { ruta: AGENDA, confirmar: () => false })
    g.setDirty(true)
    atrasDelUsuario(h)
    expect(h.url).toBe('/dashboard')
  })

  it('8 · NAV-07+NAV-11 · salir por el MENÚ consume el sentinel y DESPUÉS reemplaza: el atrás cae en el dashboard', () => {
    // EL FALLO QUE ESTE CASO CONGELA (punto 6 de la UAT del dueño, en celular real): la primera
    // versión de NAV-11 reemplazaba SOBRE el sentinel, así que la entrada de `/agenda` quedaba
    // intacta abajo y el atrás volvía a Agenda en vez del dashboard. MEDIDO antes y después con
    // Chrome + `Page.getNavigationHistory`.
    const h = stackInicial()
    const g = montarGuard(h, { ruta: AGENDA, confirmar: () => true })
    g.setDirty(true)
    expect(h.entradas.map((e) => e.url)).toEqual(['/dashboard', AGENDA, '/agenda#sin-guardar'])
    expect(isDirtyOwnedEntry(h.state)).toBe(true)

    const plan = leaveNavigationPlan({
      holdsSentinel: isDirtyOwnedEntry(h.state),
      sectionMode: panelNavMode({ from: AGENDA, to: '/finances' }),
    })
    expect(plan).toBe('consume-then-replace')

    // El provider guarda el destino e instala el listener del SEGUNDO paso; el primero lo ejecuta el
    // sentinel al quedarse sin bandera (es su propio `consume`, con su guarda de marca). En el
    // navegador el `popstate` del `back()` llega en un task posterior a la instalación del listener;
    // acá el simulador lo resuelve en el acto, así que se registra antes para transcribir ese orden.
    let segundoPaso = 0
    h.listenerProvider = () => {
      segundoPaso += 1
      h.replaceState({ __NA: true }, '/finances')
    }
    g.setDirty(false) // ← `dirty && !leaving`: el commit en el que el provider apaga la bandera
    expect(segundoPaso).toBe(1) // la navegación salió del `popstate` del consumo, no del mismo tick
    h.listenerProvider = null
    g.desmontar() // la pantalla se va; el sentinel ya no es nuestro y la guarda frena el back

    expect(h.url).toBe('/finances')
    expect(h.entradas.map((e) => e.url)).toEqual(['/dashboard', '/finances', '/agenda#sin-guardar'])
    expect(h.i).toBe(1)
    atrasDelUsuario(h)
    expect(h.url).toBe('/dashboard') // ← lo que NAV-07 promete y el dueño reclamó
  })

  it('8b · el modo `push` también consume primero, y así no deja una entrada muerta ADELANTE', () => {
    // Agenda → dashboard es `push` (regla 3 de panelNavMode). Reemplazar sobre el sentinel daba el
    // mismo resultado hacia atrás, pero dejaba el sentinel como entrada de FORWARD. Consumiendo
    // primero, el `push` la trunca.
    const h = stackInicial()
    const g = montarGuard(h, { ruta: AGENDA, confirmar: () => true })
    g.setDirty(true)

    const plan = leaveNavigationPlan({
      holdsSentinel: isDirtyOwnedEntry(h.state),
      sectionMode: panelNavMode({ from: AGENDA, to: '/dashboard' }),
    })
    expect(plan).toBe('consume-then-push')

    h.listenerProvider = () => h.pushState({ __NA: true }, '/dashboard')
    g.setDirty(false)
    h.listenerProvider = null
    g.desmontar()

    expect(h.entradas.map((e) => e.url)).toEqual(['/dashboard', AGENDA, '/dashboard'])
    expect(h.i).toBe(2)
    atrasDelUsuario(h)
    expect(h.url).toBe(AGENDA) // el atrás desde el dashboard devuelve la sección (regla 3)
  })

  it('9 · NAV-11 · sin sentinel, la regla de secciones manda (y NAV-07 sigue en pie)', () => {
    // El caso en el que el dueño no tiene el sentinel (le pisaron la marca). La continuación no puede
    // inventar: usa la MISMA regla que el `<Link replace>` del sidebar, y sin nada que consumir.
    expect(leaveNavigationPlan({ holdsSentinel: false, sectionMode: panelNavMode({ from: AGENDA, to: '/finances' }) })).toBe('replace')
    expect(leaveNavigationPlan({ holdsSentinel: false, sectionMode: panelNavMode({ from: '/dashboard', to: AGENDA }) })).toBe('push')
    expect(leaveNavigationPlan({ holdsSentinel: false, sectionMode: panelNavMode({ from: AGENDA, to: '/dashboard' }) })).toBe('push')
  })

  it('10 · la salida por el ATRÁS (sin destino) no cambió: sigue siendo el plan de dos pasos del módulo', () => {
    // Es el punto 3 de la UAT y el camino que NO hay que romper: el `popstate` no trae destino, así
    // que el provider no navega nada y el gesto lo completa `dirtyLeavePlan` (consumir + un atrás
    // más). Lo que queda debajo es historia HONESTA: el atrás siguiente devuelve lo que el dueño
    // visitó antes, no una entrada inventada.
    const h = new HistorialFalso([
      { url: '/appointments', state: { __NA: true } },
      { url: '/dashboard', state: { __NA: true } },
      { url: AGENDA, state: { __NA: true } },
    ])
    let salir: (() => void) | null = null
    const g = montarGuard(h, { ruta: AGENDA, confirmar: (leave) => { salir = leave; return true } })
    g.setDirty(true)
    atrasDelUsuario(h) // el atrás del dueño: absorbido por el sentinel
    expect(salir).not.toBeNull()
    salir!() // "Salir sin guardar"
    expect(h.url).toBe('/dashboard') // ← "me mandó al dashboard"
    atrasDelUsuario(h)
    expect(h.url).toBe('/appointments') // ← "y el atrás me mandó a turnos": la sección que visitó
  })
})

// ── La convivencia con los otros dos módulos que escriben historial ─────────────────────────────

describe('convivencia: panel-history aprendió a NO escribir encima del sentinel', () => {
  it('la regla 0 se abstiene ante el sentinel igual que ante un overlay', () => {
    // Hoy Agenda no llama a `applyPanelView`, pero la Phase 2 planea cablear su `activeLoc` con la
    // causa `filter` (⇒ replace). Ese replace caería justo sobre el sentinel: le borra el hash y la
    // marca, el guard deja de reconocer su entrada, no la consume al guardar y el atrás queda muerto.
    expect(isDirtyGuardOwnedEntry({ frjDirty: 1 })).toBe(true)
    expect(isForeignOwnedEntry({ frjDirty: 1 })).toBe(true)
    expect(isForeignOwnedEntry({ frjOverlay: 1 })).toBe(true)
    expect(isForeignOwnedEntry({ frjView: 'c' })).toBe(false)
    expect(
      panelHistoryAction({ cause: 'filter', from: 'loc1', to: 'loc2', holding: false, foreignOwnsTop: true }),
    ).toBe('none')
  })

  it('el sentinel no es una entrada de subsección: el menú no lo consume', () => {
    // `consumeOwnedPanelEntry` exige la marca `frjView`; el sentinel no la tiene y encima cae en la
    // guarda de entrada ajena. Las dos lecturas dan lo mismo: no lo toca.
    expect(isForeignOwnedEntry(dirtyHistoryState(1))).toBe(true)
  })
})

describe('decideNavigation — la variante sin destino (el atrás)', () => {
  it('sin cambios pendientes nunca molesta, ni con destino ni sin él', () => {
    expect(decideNavigation({ dirty: false, href: null, currentPath: AGENDA })).toBe('allow')
    expect(decideNavigation({ dirty: false, href: '/finances', currentPath: AGENDA })).toBe('allow')
  })

  it('sucio y SIN destino ⇒ confirma (un atrás que no cambia de pantalla no existe)', () => {
    expect(decideNavigation({ dirty: true, href: null, currentPath: AGENDA })).toBe('confirm')
  })

  it('la excepción "a donde ya estás" sigue valiendo sólo cuando hay destino', () => {
    expect(decideNavigation({ dirty: true, href: '/agenda?x=1', currentPath: AGENDA })).toBe('allow')
    expect(decideNavigation({ dirty: true, href: '/finances', currentPath: AGENDA })).toBe('confirm')
  })
})

// ── Auditoría del fuente: lo que ninguna aserción de comportamiento puede ver ────────────────────
//
// LA REGLA DE HONESTIDAD del repo (test/panel-history-clients.test.ts): cada barrido descuenta los
// comentarios ANTES de afirmar, y afirma PRIMERO que encontró algo. Un recorte vacío tiene que
// FALLAR, no pasar.

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')

function sinComentarios(src: string): string {
  return src
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

const MOD = 'lib/dirty-history.ts'
const HELPER = 'lib/panel-history.ts'
const GUARD = 'components/dashboard/unsaved-changes-guard.tsx'

describe('auditoría del fuente', () => {
  it('(a) la clave del marcador no derivó entre el módulo y la regla 0 del panel', () => {
    // El literal está DUPLICADO a propósito (ver el docblock de `isDirtyGuardOwnedEntry`). El candado
    // contra la deriva no es la disciplina: es este caso. Si el módulo renombrara su marca, la regla
    // 0 dejaría de reconocer el sentinel y volvería a escribirle encima, EN SILENCIO.
    const mod = sinComentarios(read(MOD))
    const helper = sinComentarios(read(HELPER))
    expect(mod.length).toBeGreaterThan(0)
    expect(helper.length).toBeGreaterThan(0)
    expect(mod).toContain('frjDirty')
    expect(helper).toContain('frjDirty')
  })

  it('(b) el state se escribe SIEMPRE como objeto literal fresco', () => {
    // LA TRAMPA QUE FALLA EN SILENCIO: propagar `history.state` arrastra `__NA`, el parche de Next
    // toma su rama temprana y NO despacha la sincronización del router. La URL cambia y el router no
    // se entera, sin un error en consola.
    const mod = sinComentarios(read(MOD))
    expect(mod).toContain('window.history.pushState')
    expect(/\.\.\.\s*(window\.)?history\.state/.test(mod)).toBe(false)
  })

  it('(c) cada `back()` de limpieza re-verifica la marca (cicatriz 2)', () => {
    // Los `back()` de ESTE módulo son tres: los dos de limpieza (consumo y desmontaje), que van
    // guardados por la marca, y el segundo paso de la continuación, que es deliberadamente un paso
    // más del gesto del dueño y no un consumo. El barrido exige que los guardados estén.
    const mod = sinComentarios(read(MOD))
    const guardados = mod.match(/if \(isDirtyHistoryEntry\(window\.history\.state, id\)\) window\.history\.back\(\)/g)
    expect(guardados?.length).toBe(2)
  })

  it('(d) el diálogo del guard NO pasa por el wrapper que engancha el historial de overlays', () => {
    // Es la decisión que hace que la aritmética cierre: con el sentinel Y la entrada del diálogo
    // habría dos absorbentes apilados compitiendo por el mismo lugar en el MISMO commit. Si alguien
    // "corrige" esto volviendo al wrapper, el bug vuelve sin que nada se ponga rojo — salvo este caso.
    const guard = sinComentarios(read(GUARD))
    expect(guard).toContain("from '@base-ui/react/dialog'")
    expect(guard).toContain('DialogPrimitive.Root')
    expect(/import \{[^}]*\bDialog\b[^}]*\} from '@\/components\/ui\/dialog'/.test(guard)).toBe(false)
  })

  it('(e) la continuación del guard NO empuja a ciegas (NAV-11)', () => {
    // El bug que NAV-11 cierra: `router.push` siempre, ignorando la regla de secciones. Si alguien
    // lo vuelve a poner sin pasar por la decisión, esto se cae.
    const guard = sinComentarios(read(GUARD))
    expect(guard).toContain('leaveNavigationPlan')
    expect(guard).toContain('panelNavMode')
    expect(guard).toContain('router.replace')
  })

  it('(h) el guard NO toca el historial por su cuenta: el consumo lo pide apagando la bandera', () => {
    // LA DECISIÓN QUE ESTE CASO PROTEGE (quick 261006-iey). Para que el reemplazo caiga sobre la
    // entrada de la SECCIÓN hay que consumir el sentinel antes — y la forma de pedirlo es apagarle la
    // bandera al sentinel (`dirty && !leaving`), no llamar `history.back()` acá. Un `back()` en este
    // archivo sería un segundo consumo SIN la guarda de la marca (cicatriz 2) y además competiría con
    // el del módulo: dos backs, y el dueño afuera del sitio.
    const guard = sinComentarios(read(GUARD))
    expect(guard).toContain('dirty: dirty && !leaving')
    expect(guard).toContain("addEventListener('popstate'")
    expect(guard).not.toContain('history.back()')
    expect(guard).not.toContain('history.pushState')
    expect(guard).not.toContain('history.replaceState')
  })

  it('(i) el segundo paso de la continuación sale del `popstate`, NUNCA del mismo tick', () => {
    // `history.back()` es ASÍNCRONO: encadenar el consumo con la navegación en el mismo tick está
    // medido como roto (la navegación se pierde). El `router.replace` del destino tiene que vivir
    // DENTRO del handler del `popstate`, y el destino viajar en un ref para que el handler lo lea
    // fresco. Si alguien "simplifica" esto llamando a router.replace en el click, esto se cae.
    const guard = sinComentarios(read(GUARD))
    const handler = guard.slice(guard.indexOf('const onPop = () =>'))
    expect(handler.length).toBeGreaterThan(0)
    expect(handler.slice(0, handler.indexOf('addEventListener'))).toContain('leaveTargetRef.current')
    expect(guard).toContain('setLeaving(true)')
  })

  it('(f) el módulo no declara la directiva de cliente', () => {
    // Molde `lib/overlay-history.ts`: el consumidor ya la declara, y marcar este módulo como frontera
    // arrastraría sus funciones puras adentro y las volvería más caras de importar desde un test. Se
    // mira el ENCABEZADO del fuente CRUDO: la directiva sólo cuenta si es la primera sentencia.
    const encabezado = read(MOD).split('\n').slice(0, 5).join('\n')
    expect(encabezado.length).toBeGreaterThan(0)
    expect(encabezado).not.toContain('use client')
  })

  it('(g) el `beforeunload` de las pantallas sigue en pie: esto no lo reemplaza', () => {
    // Cubre recargar y cerrar la pestaña, que NO son navegación client-side. El quick prohíbe
    // inventar uno nuevo justamente porque ya existe y no cubre el atrás.
    const agenda = sinComentarios(read('app/(dashboard)/agenda/agenda-client.tsx'))
    const web = sinComentarios(read('app/(dashboard)/web/web-client.tsx'))
    expect(agenda).toContain('beforeunload')
    expect(web).toContain('beforeunload')
    // Y el sentinel no se engancha pantalla por pantalla: viaja en el hook compartido.
    expect(agenda).not.toContain('useDirtyHistory')
    expect(web).not.toContain('useDirtyHistory')
    expect(sinComentarios(read(GUARD))).toContain('useDirtyHistory')
  })
})
