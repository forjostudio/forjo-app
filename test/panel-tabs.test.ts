import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { resolveViewParam, applyPanelView, panelHistoryAction } from '@/lib/panel-history'
// ⚠ El namespace se importa A PROPÓSITO (molde de `lib/panel-history.test.ts`): `panelTabCause` se
// pide como `PH.panelTabCause` y no como import nombrado, para que antes de existir el rojo sea el de
// la ASERCIÓN y no el del cargador.
import * as PH from '@/lib/panel-history'
// Mismo molde para los símbolos nuevos de `lib/panel-tabs.ts` (plan 04-07: `toqueDeTab`,
// `vueltaDeOAuthPendiente`): un símbolo ausente da rojo en SU caso y no tira el archivo en el cargador.
import * as PT from '@/lib/panel-tabs'
// B1 se corre REAL (quick 261118-kat): el retroceso de la barra y su segundo paso son los de producción.
import * as PB from '@/lib/panel-branch'
import { TAB_PARAM, TABS_NEGOCIO, TABS_CONFIG, TABS_FINANZAS, resolveTab, tabSlug, type PanelTabGroup } from '@/lib/panel-tabs'

// ── Phase 4 (los tabs en la URL) — la lista cerrada, la causa y la pila ──────────────────────────
// Suite PURA: sin Supabase, sin fixtures y sin gate de entorno → cae sola en el carril `pure`
// (test/suite-split.ts clasifica por los IMPORTS; acá no se importa nada de `./env` ni ningún
// cliente de datos).
//
// QUÉ FIJA, en cuatro bloques:
//   1) la LISTA CERRADA de D-05/D-07 (`lib/panel-tabs.ts`): los slugs exactos, el default como URL
//      limpia (`slug: null`) y que ningún valor raro de la URL —incluidas las claves del prototipo—
//      pueda llegar como `value` del `<Tabs>` (una función heredada deja la pantalla vacía);
//   2) la CAUSA que elige `panelTabCause` y la acción que eso produce en `panelHistoryAction`;
//   3) un SIMULADOR DE PILA que corre el `applyPanelView` REAL contra una historia falsa, con los
//      mismos dos ayudantes que usan las pantallas (`tocar` y `sanear`): es lo que prueba D-01, D-02,
//      D-04 y D-07 como PILAS, no como acciones sueltas;
//   4) los primeros candados ESTÁTICOS de Finanzas: el tab sale de la URL, el handler filtra el
//      `reason`, ningún router cambia el tab, y la página no le pasa la query al server.

// ── 1) La lista cerrada ──────────────────────────────────────────────────────────────────────────

const GRUPOS: [string, PanelTabGroup, string[]][] = [
  ['Negocio', TABS_NEGOCIO, ['datos', 'cobros', 'integraciones', 'notificaciones']],
  ['Configuración', TABS_CONFIG, ['apariencia', 'seguridad', 'suscripcion']],
  ['Finanzas', TABS_FINANZAS, ['turnos', 'ventas', 'egresos']],
]

/** Lo que tiene que caer al default en TODOS los grupos (incluidas las claves del prototipo). */
const RAROS: (string | null)[] = [null, '', 'Cobros', 'VENTAS', '__proto__', 'constructor', 'toString', 'hasOwnProperty']

describe('lib/panel-tabs — la lista cerrada de D-05, con el default como URL limpia (D-06)', () => {
  it('el parámetro se llama tab', () => {
    expect(TAB_PARAM).toBe('tab')
  })

  for (const [nombre, grupo, slugs] of GRUPOS) {
    it(`${nombre}: los slugs son EXACTAMENTE los de D-05, en su orden`, () => {
      expect([...grupo.slugs.keys()]).toEqual(slugs)
    })

    it(`${nombre}: cada slug resuelve a su valor interno, y el default con slug null aun escrito explícito`, () => {
      for (const [slug, interno] of grupo.slugs) {
        const r = resolveTab({ grupo, param: slug })
        expect(r.value).toBe(interno)
        expect(r.slug).toBe(interno === grupo.porDefecto ? null : slug)
      }
    })

    it(`${nombre}: lo ausente, vacío, en mayúsculas o con clave de prototipo cae al default con un value string`, () => {
      for (const raro of RAROS) {
        const r = resolveTab({ grupo, param: raro })
        expect(typeof r.value).toBe('string')
        expect(r).toEqual({ value: grupo.porDefecto, slug: null })
      }
    })

    it(`${nombre}: tabSlug hace el viaje de ida y vuelta de cada valor interno`, () => {
      for (const [slug, interno] of grupo.slugs) {
        expect(tabSlug({ grupo, value: interno })).toEqual({ ok: true, slug: interno === grupo.porDefecto ? null : slug })
        const ida = tabSlug({ grupo, value: interno })
        if (!ida.ok) throw new Error('tabSlug rechazó un valor interno del grupo')
        expect(resolveTab({ grupo, param: ida.slug }).value).toBe(interno)
      }
    })

    it(`${nombre}: tabSlug rechaza lo que no es un valor interno del grupo (string ajeno, número, null, objeto)`, () => {
      for (const ajeno of ['otro', 'ventas-x', 42, null, {}, undefined]) {
        expect(tabSlug({ grupo, value: ajeno })).toEqual({ ok: false })
      }
    })
  }

  it('un slug de OTRO grupo cae al default: ventas en Negocio, datos en Finanzas', () => {
    expect(resolveTab({ grupo: TABS_NEGOCIO, param: 'ventas' })).toEqual({ value: 'business', slug: null })
    expect(resolveTab({ grupo: TABS_FINANZAS, param: 'datos' })).toEqual({ value: 'appointments', slug: null })
    expect(resolveTab({ grupo: TABS_CONFIG, param: 'cobros' })).toEqual({ value: 'appearance', slug: null })
  })

  it('los valores internos de hoy NO se renombran (D-05: el mapa traduce, los TabsTrigger no cambian)', () => {
    expect([...TABS_NEGOCIO.slugs.values()]).toEqual(['business', 'cobros', 'integraciones', 'notificaciones'])
    expect([...TABS_CONFIG.slugs.values()]).toEqual(['appearance', 'seguridad', 'suscripcion'])
    expect([...TABS_FINANZAS.slugs.values()]).toEqual(['appointments', 'sales', 'expenses'])
    expect([TABS_NEGOCIO.porDefecto, TABS_CONFIG.porDefecto, TABS_FINANZAS.porDefecto]).toEqual(['business', 'appearance', 'appointments'])
  })
})

// ── 2) La causa ──────────────────────────────────────────────────────────────────────────────────

describe('panelTabCause — un grupo de UN nivel cuyo default es null: la causa sale de acá, no de la pantalla', () => {
  it('existe y es una función del módulo de historial', () => {
    expect(typeof (PH as Record<string, unknown>).panelTabCause).toBe('function')
  })

  it('desde el default ⇒ user-open (D-01: salir del default empuja)', () => {
    expect(PH.panelTabCause({ from: null, to: 'cobros' })).toBe('user-open')
  })

  it('hacia el default ⇒ user-close (D-02: volver al default consume si la entrada es nuestra)', () => {
    expect(PH.panelTabCause({ from: 'cobros', to: null })).toBe('user-close')
  })

  it('entre dos no-default ⇒ user-switch (D-01: reemplaza, la pila no crece)', () => {
    expect(PH.panelTabCause({ from: 'cobros', to: 'integraciones' })).toBe('user-switch')
  })

  it('compuesta con panelHistoryAction: push / replace / consume-o-replace / none', () => {
    const accion = (from: string | null, to: string | null, holding: boolean) =>
      panelHistoryAction({ cause: PH.panelTabCause({ from, to }), from, to, holding, foreignOwnsTop: false })
    for (const holding of [false, true]) {
      expect(accion(null, 'cobros', holding)).toBe('push')
      expect(accion('cobros', 'integraciones', holding)).toBe('replace')
      expect(accion(null, null, holding)).toBe('none')
    }
    expect(accion('cobros', null, true)).toBe('consume')
    expect(accion('cobros', null, false)).toBe('replace')
  })

  it('user-switch reemplaza con y sin holding (la séptima causa, decidida en el switch)', () => {
    for (const holding of [false, true]) {
      expect(panelHistoryAction({ cause: 'user-switch', from: 'a', to: 'b', holding, foreignOwnsTop: false })).toBe('replace')
    }
  })
})

// ── 3) El simulador de pila, con el ejecutor REAL ────────────────────────────────────────────────

type Entrada = { url: string; state: unknown }

// El despacho de `popstate` de la última historia montada (quick 261118-kat, IN-02): ver el docblock de abajo.
let drenarPopstateDelStub: (() => void) | null = null
// El despacho de `pageshow` de la última historia montada (quick 261118-kat, F1): la vuelta de la bfcache,
// con su `persisted`. Sólo la usan los candados del arreglo; ver el docblock de abajo.
let pageshowDelStub: ((persisted: boolean) => void) | null = null
// Cuántos oyentes de `pageshow` siguen vivos en la última historia montada (quick 261118-pjd, WR-03).
let oyentesPageshowDelStub: (() => number) | null = null

/**
 * Una historia falsa con la semántica del navegador: el empuje TRUNCA lo de adelante y agrega, el
 * reemplazo pisa la actual, el retroceso baja el índice (y se cuenta). `location` sale de la entrada
 * actual. Es lo mínimo que hace falta para correr el `applyPanelView` de verdad y mirar la PILA.
 *
 * El `popstate` (plan 04-07): el stub de `window` acepta oyentes de `popstate`, con la semántica de
 * `once` (el de disparo único se saca al dispararse). Sin `backAsincrono`, el retroceso baja el índice
 * y DESPUÉS despacha `popstate`. Con `backAsincrono: true`, el retroceso sólo cuenta y se encola, y
 * `procesar()` aplica la cola de a uno, con un `popstate` después de cada recorrido: es lo que hace el
 * navegador real, donde `history.back()` es ASÍNCRONO. El `back()` síncrono de antes no podía expresar
 * E3 (`.planning/debug/doble-toque-tab.md`): dos toques al default antes de que llegue el recorrido.
 * `popstate()` despacha un evento suelto (uno AJENO: el retroceso de un overlay encolado antes que el
 * nuestro) sin mover la pila; `pila.oyentes` cuenta los oyentes vivos.
 *
 * (quick 261118-kat) Dos diferencias con el DOM que hasta acá no cambiaban ningún resultado y que la
 * medición de R2-WR-01 sí ejercita: el despacho recorre una COPIA de los oyentes, así que uno que otro
 * oyente quitó durante el MISMO despacho igual corría (el DOM lo saltea: es el «removed flag»); y el
 * mismo oyente se podía enganchar dos veces (el DOM no lo duplica). Las dos se cierran agregando una línea
 * cada una. Además el despacho queda expuesto a nivel de módulo para que los `afterEach` lo llamen ANTES de
 * soltar el `window`: la guarda del consumo en vuelo es memoria del módulo, y un caso rojo que la dejara
 * encendida envenenaría a los siguientes (IN-02; molde de `test/panel-branch.test.ts`).
 *
 * (quick 261118-kat, el arreglo) El stub acepta además oyentes de `pageshow`, en su propia lista y con la
 * misma semántica de `once` y sin duplicados, y `pageshowDelStub(persisted)` los despacha: es la única forma
 * de expresar acá una página que vuelve de la bfcache sin que llegue el `popstate` de su recorrido. Van en
 * una lista aparte a propósito: `pila.oyentes` sigue contando sólo los de `popstate`, que es lo que miden
 * los casos de antes.
 *
 * (quick 261118-pjd) `pila.oyentes` sigue contando sólo los de `popstate`, que es lo que miden los casos
 * viejos. El contador nuevo, `oyentesPageshowDelStub()`, cuenta los de `pageshow` que siguen vivos: sin él
 * nada podía afirmar que la guarda no deja colgado su oyente de la bfcache, que es justo lo que WR-03 del
 * review encontró sin medir (borrar la línea que lo saca dejaba toda la suite en verde).
 */
function montarHistoria(inicio: Entrada[], opciones: { backAsincrono?: boolean } = {}) {
  const pila = { entradas: [...inicio], indice: inicio.length - 1, retrocesos: 0, oyentes: 0 }
  const oyentes: { fn: () => void; once: boolean }[] = []
  const cola: number[] = []
  const popstate = () => {
    for (const o of [...oyentes]) {
      if (!oyentes.includes(o)) continue
      if (o.once) oyentes.splice(oyentes.indexOf(o), 1)
      o.fn()
    }
    pila.oyentes = oyentes.length
  }
  drenarPopstateDelStub = popstate
  const oyentesPageshow: { fn: (e: { persisted: boolean }) => void; once: boolean }[] = []
  pageshowDelStub = (persisted: boolean) => {
    for (const o of [...oyentesPageshow]) {
      if (!oyentesPageshow.includes(o)) continue
      if (o.once) oyentesPageshow.splice(oyentesPageshow.indexOf(o), 1)
      o.fn({ persisted })
    }
  }
  oyentesPageshowDelStub = () => oyentesPageshow.length
  const recorrer = () => {
    if (pila.indice > 0) pila.indice--
    popstate()
  }
  const procesar = () => {
    while (cola.length > 0) {
      cola.shift()
      recorrer()
    }
  }
  const actual = () => pila.entradas[pila.indice]
  const partir = (url: string) => {
    const q = url.indexOf('?')
    return q === -1 ? { pathname: url, search: '' } : { pathname: url.slice(0, q), search: url.slice(q) }
  }
  const history = {
    get state() {
      return actual().state
    },
    pushState(state: unknown, _t: string, url?: string) {
      pila.entradas = pila.entradas.slice(0, pila.indice + 1)
      pila.entradas.push({ url: url ?? actual().url, state })
      pila.indice++
    },
    replaceState(state: unknown, _t: string, url?: string) {
      pila.entradas[pila.indice] = { url: url ?? actual().url, state }
    },
    back() {
      pila.retrocesos++
      if (opciones.backAsincrono) cola.push(1)
      else recorrer()
    },
  }
  const location = {
    get pathname() {
      return partir(actual().url).pathname
    },
    get search() {
      return partir(actual().url).search
    },
  }
  const addEventListener = (tipo: string, fn: () => void, op?: { once?: boolean }) => {
    if (tipo === 'pageshow') {
      if (!oyentesPageshow.some((o) => o.fn === fn)) oyentesPageshow.push({ fn, once: op?.once === true })
      return
    }
    if (tipo !== 'popstate') return
    if (oyentes.some((o) => o.fn === fn)) return
    oyentes.push({ fn, once: op?.once === true })
    pila.oyentes = oyentes.length
  }
  const removeEventListener = (tipo: string, fn: () => void) => {
    if (tipo === 'pageshow') {
      const j = oyentesPageshow.findIndex((o) => o.fn === fn)
      if (j !== -1) oyentesPageshow.splice(j, 1)
      return
    }
    if (tipo !== 'popstate') return
    const i = oyentes.findIndex((o) => o.fn === fn)
    if (i !== -1) oyentes.splice(i, 1)
    pila.oyentes = oyentes.length
  }
  vi.stubGlobal('window', { history, location, addEventListener, removeEventListener })
  return { pila, actual, procesar, popstate }
}

/**
 * EXACTAMENTE lo que hace el handler del tab en la pantalla: el toque con la URL de ahora (el MISMO
 * helper que llaman las dos pantallas; un candado lee este cuerpo), la causa y el ejecutor.
 */
function tocar(grupo: PanelTabGroup, value: unknown) {
  const toque = PT.toqueDeTab({ grupo, value, search: window.location.search })
  if (!toque.ok) return 'none'
  return applyPanelView({ cause: PH.panelTabCause({ from: toque.from, to: toque.to }), param: TAB_PARAM, from: toque.from, to: toque.to })
}

/** EXACTAMENTE lo que hace el efecto de reconciliación de la pantalla (sin la memoria: una vuelta). */
function sanear(grupo: PanelTabGroup) {
  const enLaUrl = new URLSearchParams(window.location.search).get(TAB_PARAM)
  const v = resolveViewParam({ param: enLaUrl, resolvedTo: resolveTab({ grupo, param: enLaUrl }).slug })
  if (!v.reconcile || v.cause === null) return 'none'
  return applyPanelView({ cause: v.cause, param: TAB_PARAM, from: enLaUrl, to: v.to })
}

/**
 * EXACTAMENTE lo que hace el efecto del retorno del OAuth de Negocio (G-04-8, plan 04-07): la URL de
 * ahora, el corte por el MISMO predicado que usa el render (un candado lee este cuerpo) y la misma
 * llamada al ejecutor —`programmatic`, el `tab` crudo de la URL como origen, Integraciones y el `drop`—.
 */
function volverDelOAuth() {
  const params = new URLSearchParams(window.location.search)
  if (!PT.vueltaDeOAuthPendiente({ query: params })) return 'none'
  return applyPanelView({ cause: 'programmatic', param: TAB_PARAM, from: params.get(TAB_PARAM), to: 'integraciones', drop: ['mp', 'google', 'motivo'] })
}

describe('el simulador de pila — el applyPanelView REAL contra una historia falsa', () => {
  afterEach(() => {
    drenarPopstateDelStub?.()
    drenarPopstateDelStub = null
    vi.unstubAllGlobals()
  })

  it('D-01: /negocio → Cobros → Integraciones → Cobros deja UNA entrada de más, y un atrás vuelve a /negocio', () => {
    const { pila, actual } = montarHistoria([{ url: '/mas', state: null }, { url: '/negocio', state: { frjUnder: '/mas' } }])
    expect(tocar(TABS_NEGOCIO, 'cobros')).toBe('push')
    expect(tocar(TABS_NEGOCIO, 'integraciones')).toBe('replace')
    expect(tocar(TABS_NEGOCIO, 'cobros')).toBe('replace')
    expect(pila.entradas).toHaveLength(3)
    expect(actual().url).toBe('/negocio?tab=cobros')
    window.history.back()
    expect(actual().url).toBe('/negocio')
    // La entrada de la sección conserva su marca de la rama: el empuje del tab no la toca.
    expect(actual().state).toEqual({ frjUnder: '/mas' })
  })

  it('D-02: Cobros → Datos CONSUME la entrada del tab (un retroceso, nunca Datos arriba de Datos)', () => {
    const { pila, actual } = montarHistoria([{ url: '/negocio', state: { frjUnder: '/mas' } }])
    tocar(TABS_NEGOCIO, 'cobros')
    expect(tocar(TABS_NEGOCIO, 'business')).toBe('consume')
    expect(pila.retrocesos).toBe(1)
    expect(actual().url).toBe('/negocio')
  })

  it('D-04: Finanzas → Ventas → Egresos → atrás deja /finances, que resuelve a Turnos', () => {
    const { pila, actual } = montarHistoria([{ url: '/finances', state: { frjUnder: '/dashboard' } }])
    expect(tocar(TABS_FINANZAS, 'sales')).toBe('push')
    expect(actual().url).toBe('/finances?tab=ventas')
    expect(tocar(TABS_FINANZAS, 'expenses')).toBe('replace')
    expect(actual().url).toBe('/finances?tab=egresos')
    expect(pila.entradas).toHaveLength(2)
    window.history.back()
    expect(actual().url).toBe('/finances')
    expect(resolveTab({ grupo: TABS_FINANZAS, param: new URLSearchParams(window.location.search).get(TAB_PARAM) }).value).toBe('appointments')
  })

  it('D-07: ?tab=ventas en /negocio, ?tab=, ?tab=datos y ?tab=__proto__ se sanean a /negocio SIN agregar entradas', () => {
    for (const url of ['/negocio?tab=ventas', '/negocio?tab=', '/negocio?tab=datos', '/negocio?tab=__proto__']) {
      const { pila, actual } = montarHistoria([{ url: '/afuera', state: null }, { url, state: { __NA: true } }])
      expect(sanear(TABS_NEGOCIO)).toBe('replace')
      expect(actual().url).toBe('/negocio')
      expect(pila.entradas).toHaveLength(2)
      expect(pila.retrocesos).toBe(0)
    }
  })

  it('el saneo preserva los params ajenos de la query', () => {
    const { actual } = montarHistoria([{ url: '/finances?x=1&tab=constructor', state: null }])
    expect(sanear(TABS_FINANZAS)).toBe('replace')
    expect(actual().url).toBe('/finances?x=1')
  })

  it('una URL que ya está bien no se toca (?tab=ventas en Finanzas, /finances limpia)', () => {
    for (const url of ['/finances?tab=ventas', '/finances']) {
      const { pila } = montarHistoria([{ url, state: null }])
      expect(sanear(TABS_FINANZAS)).toBe('none')
      expect(pila.entradas).toEqual([{ url, state: null }])
    }
  })

  it('regla 2: tocar el tab activo no escribe nada', () => {
    const { pila } = montarHistoria([{ url: '/finances?tab=ventas', state: { frjView: 'tab' } }])
    expect(tocar(TABS_FINANZAS, 'sales')).toBe('none')
    expect(pila.entradas).toEqual([{ url: '/finances?tab=ventas', state: { frjView: 'tab' } }])
    const limpia = montarHistoria([{ url: '/finances', state: null }])
    expect(tocar(TABS_FINANZAS, 'appointments')).toBe('none')
    expect(limpia.pila.entradas).toEqual([{ url: '/finances', state: null }])
  })

  it('un valor que no es del grupo no escribe nada (el handler descarta lo que tabSlug rechaza)', () => {
    const { pila } = montarHistoria([{ url: '/finances', state: null }])
    expect(tocar(TABS_FINANZAS, 'business')).toBe('none')
    expect(tocar(TABS_FINANZAS, 7)).toBe('none')
    expect(pila.entradas).toHaveLength(1)
  })
})

describe('el simulador de pila — una entrada AJENA no se vuelve nuestra por un reemplazo (Patrón 3, plan 04-01, task 2)', () => {
  // D-03: entrar directo a un tab por URL no fabrica una entrada del default por debajo, así que el
  // atrás —y cualquier consumo— tiene que salir de la sección SIN pasar por un retroceso sobre la
  // entrada pegada. Con el defecto, el reemplazo del cambio de tab marcaba esa entrada como nuestra y
  // el toque al default retrocedía a la página de afuera.
  afterEach(() => {
    drenarPopstateDelStub?.()
    drenarPopstateDelStub = null
    vi.unstubAllGlobals()
  })

  it('D-03: /negocio?tab=cobros PEGADA → Integraciones → Datos: cero retrocesos, la URL en /negocio', () => {
    const { pila, actual } = montarHistoria([{ url: '/afuera', state: null }, { url: '/negocio?tab=cobros', state: { __NA: true } }])
    expect(tocar(TABS_NEGOCIO, 'integraciones')).toBe('replace')
    expect(actual().state).toEqual({ frjView: null })
    expect(tocar(TABS_NEGOCIO, 'business')).toBe('replace')
    expect(pila.retrocesos).toBe(0)
    expect(pila.indice).toBe(1)
    expect(actual().url).toBe('/negocio')
  })

  it('D-09 en la pila: /negocio?mp=connected → integraciones con drop, sin agregar entradas; Datos después no retrocede', () => {
    const { pila, actual } = montarHistoria([{ url: '/afuera', state: null }, { url: '/negocio?mp=connected', state: { __NA: true } }])
    expect(applyPanelView({ cause: 'programmatic', param: TAB_PARAM, from: null, to: 'integraciones', drop: ['mp', 'google'] })).toBe('replace')
    expect(actual().url).toBe('/negocio?tab=integraciones')
    expect(actual().state).toEqual({ frjView: null })
    expect(pila.entradas).toHaveLength(2)
    expect(tocar(TABS_NEGOCIO, 'business')).toBe('replace')
    expect(pila.retrocesos).toBe(0)
    expect(actual().url).toBe('/negocio')
  })

  // G-04-8 (plan 04-07): las cinco URLs que trababan los tabs de Negocio (el render forzaba
  // Integraciones por PRESENCIA de `mp`/`google` y el único que los borra no escribía: por valor vacío,
  // o por la regla 2 con el tab ya en Integraciones) y los dos controles que ya andaban. Ningún callback
  // emite las cinco: llegan por una URL pegada o editada.
  for (const url of [
    '/negocio?mp=',
    '/negocio?google=',
    '/negocio?tab=integraciones&mp=connected',
    '/negocio?tab=integraciones&google=connected',
    '/negocio?tab=integraciones&mp=',
    '/negocio?mp=connected',
    '/negocio?tab=cobros&mp=connected',
    // quick 261124-obs: el motivo viaja con mp=error y sale en la misma escritura.
    '/negocio?mp=error&motivo=cuenta-en-uso',
  ]) {
    it(`G-04-8: ${url} → Integraciones limpia sin agregar entradas ni retroceder, y Datos responde`, () => {
      const { pila, actual } = montarHistoria([{ url: '/afuera', state: null }, { url, state: { __NA: true } }])
      volverDelOAuth()
      const q = new URLSearchParams(window.location.search)
      expect(`${url}: ${q.has('mp') || q.has('google') || q.has('motivo')}`).toBe(`${url}: false`)
      expect(`${url}: ${actual().url}`).toBe(`${url}: /negocio?tab=integraciones`)
      expect(`${url}: ${pila.entradas.length}`).toBe(`${url}: 2`)
      expect(`${url}: ${pila.retrocesos}`).toBe(`${url}: 0`)
      expect(`${url}: ${tocar(TABS_NEGOCIO, 'business')}`).toBe(`${url}: replace`)
      expect(`${url}: ${actual().url}`).toBe(`${url}: /negocio`)
    })
  }

  it('G-04-8 sin espejo: la limpieza con la vista ya en Integraciones reemplaza DENTRO del ejecutor', () => {
    const { pila, actual } = montarHistoria([{ url: '/afuera', state: null }, { url: '/negocio?tab=integraciones&mp=connected', state: { __NA: true } }])
    expect(applyPanelView({ cause: 'programmatic', param: TAB_PARAM, from: 'integraciones', to: 'integraciones', drop: ['mp', 'google'] })).toBe('replace')
    expect(actual().url).toBe('/negocio?tab=integraciones')
    expect(actual().state).toEqual({ frjView: null })
    expect(pila.entradas).toHaveLength(2)
    expect(pila.retrocesos).toBe(0)
  })

  it('G-04-8 sin espejo: con nada que borrar, la misma llamada sigue sin escribir (regla 2)', () => {
    const { pila } = montarHistoria([{ url: '/afuera', state: null }, { url: '/negocio?tab=integraciones', state: { __NA: true } }])
    expect(applyPanelView({ cause: 'programmatic', param: TAB_PARAM, from: 'integraciones', to: 'integraciones', drop: ['mp', 'google'] })).toBe('none')
    expect(pila.entradas).toEqual([{ url: '/afuera', state: null }, { url: '/negocio?tab=integraciones', state: { __NA: true } }])
  })

  it('D-08 sobre una entrada ajena: tras la URL pegada + Integraciones, consumeOwnedPanelEntry no retrocede', () => {
    const { pila } = montarHistoria([{ url: '/afuera', state: null }, { url: '/negocio?tab=cobros', state: { __NA: true } }])
    tocar(TABS_NEGOCIO, 'integraciones')
    expect(PH.consumeOwnedPanelEntry()).toBe(false)
    expect(pila.retrocesos).toBe(0)
    expect(pila.indice).toBe(1)
  })

  it('el contrapuesto: la entrada que SÍ empujamos sigue siendo nuestra tras un user-switch y se consume', () => {
    const { pila, actual } = montarHistoria([{ url: '/negocio', state: { frjUnder: '/mas' } }])
    tocar(TABS_NEGOCIO, 'cobros')
    tocar(TABS_NEGOCIO, 'integraciones')
    expect(actual().state).toEqual({ frjView: 'tab' })
    expect(PH.consumeOwnedPanelEntry()).toBe(true)
    expect(pila.retrocesos).toBe(1)
    expect(actual().url).toBe('/negocio')
  })
})

// ── 4) Los candados estáticos de Finanzas ────────────────────────────────────────────────────────
// Se afirman LEYENDO las fuentes (no hay DOM en este runner). Cada barrido descuenta los comentarios
// ANTES de afirmar —molde de `test/panel-history-clients.test.ts`— salvo el del criterio 5, que es
// CRUDO a propósito (comentarios incluidos), igual que el `grep` del ROADMAP.

// Los finales de línea se normalizan: con `core.autocrlf` la copia de trabajo de Windows trae CRLF, y
// los recortes de abajo buscan saltos de línea LF.
const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8').replace(/\r\n/g, '\n')

function sinComentarios(src: string): string {
  return src
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

/**
 * La región de una función declarada con `function nombre(`, hasta su `}` de cierre en la sangría de
 * dos espacios. ⚠ NO balancea desde la primera llave: en `alElegirTab` esa llave es la del tipo del
 * segundo parámetro (`{ reason: string }`) y la región quedaría en la firma — un gate que mide cero
 * (Pitfall 3). Corta hasta la primera línea `  }` después del marcador.
 */
function regionDeFuncion(fuente: string, marcador: string): string {
  const at = fuente.indexOf(marcador)
  if (at === -1) return ''
  const fin = fuente.indexOf('\n  }\n', at)
  return fin === -1 ? '' : fuente.slice(at, fin + 4)
}

const FINANZAS = 'app/(dashboard)/finances/finances-client.tsx'
const PAGINA = 'app/(dashboard)/finances/page.tsx'

describe('Finanzas — el tab sale de la URL, en un solo dialecto', () => {
  const crudo = read(FINANZAS)
  const fuente = sinComentarios(crudo)

  it('no sobrevive ninguna segunda fuente de verdad: ni el useState del tab ni su setter', () => {
    expect(fuente).not.toMatch(/useState\(\s*['"]appointments['"]\s*\)/)
    expect(fuente).not.toContain('setTxTab')
    expect(fuente).toContain('useSearchParams()')
    expect(fuente).toMatch(/const txTab = tabResuelto\.value/)
  })

  it('el <Tabs> usa el handler, y el handler filtra el reason ANTES de escribir', () => {
    expect(fuente).toContain('<Tabs value={txTab} onValueChange={alElegirTab}>')
    const handler = regionDeFuncion(fuente, 'function alElegirTab(')
    expect(handler).not.toBe('')
    expect(handler).toContain("reason !== 'none'")
    expect(handler).toContain('panelTabCause(')
    expect(handler).toContain('applyPanelView(')
    expect(handler.indexOf("reason !== 'none'")).toBeLessThan(handler.indexOf('applyPanelView('))
  })

  it('el efecto de reconciliación nunca declara user-open (un empuje sólo sale del toque)', () => {
    const handler = regionDeFuncion(fuente, 'function alElegirTab(')
    const sinHandler = fuente.replace(handler, '')
    expect(handler).not.toBe('')
    expect(sinHandler).not.toContain("'user-open'")
    expect(sinHandler).toContain('sanitizeAction(')
    expect(sinHandler).toContain('reconciledMemo(')
  })

  it('ningún router ni <Link> cambia el tab', () => {
    expect(fuente).not.toMatch(/router\.(push|replace)\(/)
    expect(fuente).not.toContain("from 'next/link'")
    expect(fuente).not.toContain('useRouter')
  })

  it('criterio 5, CRUDO (comentarios incluidos): cero escrituras del historial en Finanzas', () => {
    expect(crudo).not.toMatch(/pushState|replaceState|history\.back/)
  })

  it('las dos líneas del botón de alta siguen leyendo txTab', () => {
    expect(crudo).toContain("{txTab === 'sales' && <Button")
    expect(crudo).toContain("{txTab === 'expenses' && <Button")
  })

  // obs-G1 (re-UAT del 04-08, opción A del dueño, quick 261118-jdq): con un tab corto —Ventas con 0
  // ventas— el documento quedaba más corto que el scroll del momento y el navegador lo recortaba. Cada
  // panel lleva el alto de la pantalla como mínimo, con CSS; el mínimo va POR PANTALLA y no en el
  // componente compartido. Se afirma sobre `crudo`: el descuento de comentarios de esta suite tiene un
  // defecto declarado en `deferred-items.md`.
  it('obs-G1: los tres paneles tienen el alto de la pantalla como mínimo (CSS, sin medir alturas)', () => {
    for (const v of ['appointments', 'sales', 'expenses']) {
      const m = crudo.match(new RegExp(`<TabsContent value="${v}" className="([^"]*)">`))
      expect(m, `<TabsContent value="${v}"> con className`).not.toBeNull()
      expect(m![1].split(/\s+/)).toContain('min-h-dvh')
    }
    expect(read('components/ui/tabs.tsx')).not.toContain('min-h-')
  })

  it('la página: Suspense, el negocio por owner_id y SIN searchParams (el tab no decide qué se lee)', () => {
    const pagina = sinComentarios(read(PAGINA))
    // G-04-6 (plan 04-06): el boundary tiene un NODO mientras suspende —un div vacío con la clase del contenedor
    // raíz de FinancesClient—; con el fallback nulo el handler de scroll de Next deja pendiente el scroll de la
    // navegación blanda y el primer toque de un tab lo ejecuta (medido en `.planning/debug/finanzas-primer-toque-scroll.md`).
    expect(pagina).toContain('<Suspense fallback={<div className="space-y-6 max-w-5xl" aria-busy="true" />}>')
    expect(pagina).not.toContain('fallback={null}')
    // El negocio sale del dueño de la sesión: `negocioDelPanel` filtra por `owner_id` = `user.id`
    // (quick 261124-neg, lib/negocio-del-dueno.ts).
    expect(pagina).toContain("negocioDelPanel(supabase, user.id, 'id')")
    expect(pagina).not.toContain('searchParams')
  })
})

// ── 5) El cableado de los tres grupos (plan 04-02): criterio 5, T-1, T-2 y D-10 ──────────────────
// `read` y `sinComentarios` son los de arriba (copiados del molde de `test/panel-history-clients.test.ts`
// en el 04-01, con la normalización de CRLF). `recorte` se copia de ese mismo molde: es local a aquella
// suite (no se exporta, y exportarlo haría de un archivo de test un módulo del que dependen otros), así
// que se repite acá. Se suman `entre` y `cuerpoDe`. ⚠ Cada región se afirma NO VACÍA antes de afirmar
// sobre ella: una región que no se encontró daría verde a toda aserción negativa (Pitfall 3).

/** La región desde `marcador` hasta el cierre de su primer bloque, balanceando llaves (molde de clientes). */
function recorte(fuente: string, marcador: string): string {
  const at = fuente.indexOf(marcador)
  if (at === -1) return ''
  const abre = fuente.indexOf('{', at)
  if (abre === -1) return ''
  let profundidad = 0
  for (let i = abre; i < fuente.length; i++) {
    const ch = fuente[i]
    if (ch === '{') profundidad++
    else if (ch === '}') {
      profundidad--
      if (profundidad === 0) return fuente.slice(at, i + 1)
    }
  }
  return ''
}

/** El tramo entre dos marcadores (`desde` incluido, `hasta` incluido); vacío si falta alguno. */
function entre(fuente: string, desde: string, hasta: string): string {
  const at = fuente.indexOf(desde)
  if (at === -1) return ''
  const fin = fuente.indexOf(hasta, at + desde.length)
  return fin === -1 ? '' : fuente.slice(at, fin + hasta.length)
}

/**
 * El cuerpo de una función: balancea desde la llave que sigue a `finDeFirma` —buscada DESPUÉS de
 * `firma`—, no desde la primera llave después de `firma`, que en una firma con parámetro-objeto es la
 * del parámetro (Pitfall 3, la memoria de los gates que miden cero).
 */
function cuerpoDe(fuente: string, firma: string, finDeFirma: string): string {
  const at = fuente.indexOf(firma)
  if (at === -1) return ''
  const fin = fuente.indexOf(finDeFirma, at)
  if (fin === -1) return ''
  return recorte(fuente.slice(fin), finDeFirma)
}

const SETTINGS = 'app/(dashboard)/settings/settings-client.tsx'
const AGENDA = 'app/(dashboard)/agenda/agenda-client.tsx'
const PANTALLAS = [SETTINGS, FINANZAS, AGENDA]
// La línea de `SECTION_TAB` copiada de `85c99ae` (la base de la fase): T-1 la fija byte a byte.
const SECTION_TAB_85C99AE =
  "  const SECTION_TAB: Record<string, string> = { negocio: 'business', servicios: 'services', equipo: 'professionals', consultorios: 'locations' }"

/**
 * `sinComentarios`, pero sacando PRIMERO los comentarios de línea entera. ⚠ Medido el 2026-11-17 (plan
 * 04-02): `settings-client.tsx` tiene un comentario de línea que nombra `/api/google/*`; el `sinComentarios`
 * del molde saca los de bloque ANTES que los de línea, así que ese `/*` abría un bloque falso que se comía
 * ~25.000 caracteres de código —incluidas las dos `TabsList`— y toda aserción negativa sobre ese tramo
 * daba verde midiendo nada. Por eso cada caso de abajo afirma, además, que el fuente descontado conserva un
 * marcador del FINAL del tramo que se comía.
 */
function sinComentariosFirme(src: string): string {
  return sinComentarios(src.replace(/^[ \t]*\/\/[^\n]*$/gm, ''))
}

/** Los `value` de los `TabsTrigger` de una región, en orden. */
function valoresDeTriggers(region: string): string[] {
  return [...region.matchAll(/<TabsTrigger\s+value="([^"]+)"/g)].map((m) => m[1])
}

describe('el cableado de los tres grupos (criterio 5, T-1, T-2, D-10)', () => {
  const settingsCrudo = read(SETTINGS)
  const settings = sinComentariosFirme(settingsCrudo)
  const finanzas = sinComentariosFirme(read(FINANZAS))
  const agendaCrudo = read(AGENDA)
  const agenda = sinComentariosFirme(agendaCrudo)

  it('honestidad: el fuente descontado de settings conserva el tramo que el descuento del molde se comía', () => {
    expect(settings).toContain('{isNegocio && (')
    expect(settings).toContain('<TabsTrigger value="suscripcion">')
    expect(settings).toContain('function alElegirTab(')
  })

  it('(a) criterio 5: el fuente CRUDO de las tres pantallas no escribe el historial; el descontado tampoco navega la pila', () => {
    for (const ruta of PANTALLAS) {
      const crudo = read(ruta)
      expect(crudo.length).toBeGreaterThan(0)
      expect(`${ruta}: ${/pushState|replaceState|history\.back/.test(crudo)}`).toBe(`${ruta}: false`)
      const fuente = sinComentariosFirme(crudo)
      expect(`${ruta}: ${/history\.forward|history\.go\b/.test(fuente)}`).toBe(`${ruta}: false`)
    }
  })

  it('(b) ninguna segunda fuente de verdad: sin el estado del tab de Negocio, de Configuración ni de Finanzas', () => {
    for (const viejo of ['setConfigTab', 'setNegocioTab', 'configTab', 'negocioTab']) {
      expect(`${viejo}: ${settings.includes(viejo)}`).toBe(`${viejo}: false`)
    }
    expect(settings).not.toMatch(/useState\(\s*['"](appearance|business)['"]\s*\)/)
    expect(settings).toContain('useSearchParams()')
    expect(finanzas).not.toContain('setTxTab')
    expect(finanzas).not.toMatch(/useState\(\s*['"]appointments['"]\s*\)/)
  })

  it('(c) T-1 textual: la rama de las secciones, SECTION_TAB, el <Tabs> y las dos TabsList de siempre', () => {
    const cuenta = (s: string) => settingsCrudo.split(s).length - 1
    expect(cuenta('isSection ? SECTION_TAB[view] :')).toBe(1)
    expect(cuenta('isSection ? undefined :')).toBe(1)
    expect(settingsCrudo.split('\n').filter((l) => l === SECTION_TAB_85C99AE)).toHaveLength(1)
    expect(cuenta('<Tabs value={tabValue} onValueChange={onTabChange}>')).toBe(1)
    expect(cuenta('<TabsList')).toBe(2)
    expect(settingsCrudo).toContain('{isNegocio && (')
    expect(settingsCrudo).toContain('{!isSection && (')
  })

  it('(d) las tres páginas de sección siguen siendo dinámicas y montan SettingsClient con su view literal', () => {
    for (const seccion of ['servicios', 'equipo', 'consultorios']) {
      const pagina = sinComentarios(read(`app/(dashboard)/${seccion}/page.tsx`))
      expect(pagina.length).toBeGreaterThan(0)
      expect(pagina).toContain('await createClient()')
      expect(pagina).toContain('<SettingsClient')
      expect(pagina).toContain(`view="${seccion}"`)
    }
  })

  it('(e) negocio, settings y finances: Suspense de react alrededor del cliente con un fallback CON NODO, y ninguna lee searchParams', () => {
    // G-04-6 (plan 04-06): cada boundary tiene un nodo mientras suspende —un div vacío con la clase del
    // contenedor raíz de SU cliente— para que el handler de scroll de Next consuma el scroll de la navegación
    // blanda al montar; con el fallback nulo lo deja pendiente y el primer toque de un tab lo ejecuta.
    for (const [ruta, cliente, contenedor] of [
      ['app/(dashboard)/negocio/page.tsx', '<SettingsClient', 'space-y-6 max-w-3xl'],
      ['app/(dashboard)/settings/page.tsx', '<SettingsClient', 'space-y-6 max-w-3xl'],
      ['app/(dashboard)/finances/page.tsx', '<FinancesClient', 'space-y-6 max-w-5xl'],
    ] as const) {
      const pagina = sinComentarios(read(ruta))
      expect(pagina, ruta).toContain(`<Suspense fallback={<div className="${contenedor}" aria-busy="true" />}>`)
      expect(pagina, ruta).not.toContain('fallback={null}')
      expect(pagina.length).toBeGreaterThan(0)
      expect(/import\s*\{[^}]*\bSuspense\b[^}]*\}\s*from\s*'react'/.test(pagina)).toBe(true)
      const abre = pagina.indexOf('<Suspense')
      const monta = pagina.indexOf(cliente)
      const cierra = pagina.indexOf('</Suspense>')
      expect(abre).toBeGreaterThan(-1)
      expect(monta).toBeGreaterThan(abre)
      expect(cierra).toBeGreaterThan(monta)
      expect(pagina).not.toContain('searchParams')
    }
  })

  it('(f) el handler del toque en Negocio/Configuración y en Finanzas, y ningún router ni literal ?tab= en las pantallas', () => {
    for (const fuente of [settings, finanzas]) {
      const cuerpo = cuerpoDe(fuente, 'function alElegirTab(', '): void {')
      expect(cuerpo).not.toBe('')
      expect(cuerpo).toContain("'none'")
      // G-04-7 (plan 04-07): el toque decide con la URL DEL MOMENTO DEL TOQUE, por el helper que comparte
      // con el `tocar` del simulador, y nunca con el slug del último render.
      expect(cuerpo).toContain('toqueDeTab(')
      expect(cuerpo).toContain('window.location.search')
      expect(cuerpo).not.toContain('tabResuelto.slug')
      expect(cuerpo).toContain('panelTabCause(')
      expect(cuerpo).toContain('applyPanelView(')
    }
    for (const fuente of [settings, finanzas, agenda]) {
      expect(fuente).not.toMatch(/router\.(push|replace)\([^)]*tab/)
      expect(fuente).not.toContain('?tab=')
    }
  })

  it('(g) el retorno del OAuth en Negocio: un reemplazo del helper con drop, y la reconciliación cortada mientras dura', () => {
    const efecto = entre(settings, 'if (!isNegocio) return', '}, [isNegocio])')
    expect(efecto).not.toBe('')
    expect(efecto).toContain('window.location.search')
    expect(efecto).toContain('applyPanelView(')
    expect(efecto).toContain("'programmatic'")
    expect(efecto).toContain("to: 'integraciones'")
    expect(efecto).toContain("drop: ['mp', 'google', 'motivo']")
    // quick 261124-obs: el motivo se normaliza contra la lista cerrada y el texto es la constante.
    expect(efecto).toContain('resolveMpErrorReason(')
    expect(efecto).toContain('MP_CUENTA_EN_USO_TEXTO')
    for (const texto of ['MercadoPago conectado', 'No se pudo conectar con MercadoPago', 'Google Calendar conectado', 'No se pudo conectar con Google Calendar']) {
      expect(efecto).toContain(texto)
    }
    expect(settings).toContain('if (grupoDeTabs === null || vueltaDeOAuth) return')
    // G-04-8 (plan 04-07): «hay una vuelta del OAuth pendiente» se pregunta UNA vez, por presencia, en
    // `lib/panel-tabs.ts`: el render no lleva su propio criterio ni el efecto su guarda por verdad, y los
    // dos llaman al mismo predicado (el render, que también corta la reconciliación, y el efecto).
    expect(settings).not.toContain("get('mp') !== null")
    expect(efecto).not.toContain('if (!mp && !google) return')
    expect(settings.split('vueltaDeOAuthPendiente(').length - 1).toBe(2)
    expect(efecto.split('vueltaDeOAuthPendiente(').length - 1).toBe(1)
    // El comentario que prometía que el próximo toque limpiaba la query (no la limpiaba: los tabs se trababan).
    expect(settingsCrudo).not.toContain('la query queda hasta el próximo toque')
    // El espejo del efecto en ESTA suite pregunta lo mismo y hace la misma llamada.
    const espejo = cuerpoDe(read('test/panel-tabs.test.ts'), 'function volverDelOAuth(', ') {')
    expect(espejo).not.toBe('')
    expect(espejo).toContain('vueltaDeOAuthPendiente(')
    expect(espejo).toContain('window.location.search')
    expect(espejo).toContain("drop: ['mp', 'google', 'motivo']")
  })

  it('(h) Agenda limpia su ?google= por el helper (D-10): un reemplazo stale que borra sólo google', () => {
    const efecto = entre(agenda, ".get('google')", '}, [])')
    expect(efecto).not.toBe('')
    expect(efecto).toContain('applyPanelView(')
    expect(efecto).toContain("'stale'")
    expect(efecto).toContain("param: 'google'")
    expect(efecto).toContain('to: null')
    expect(efecto).toContain('Google Calendar conectado')
    expect(efecto).toContain('No se pudo conectar con Google Calendar')
  })

  it('(i) anti-deriva: los value de los TabsTrigger son exactamente los del mapa de su grupo', () => {
    const negocio = entre(settings, '{isNegocio && (', '</TabsList>')
    const config = entre(settings, '{!isSection && (', '</TabsList>')
    const fin = entre(finanzas, '<TabsList', '</TabsList>')
    for (const [region, grupo] of [[negocio, TABS_NEGOCIO], [config, TABS_CONFIG], [fin, TABS_FINANZAS]] as const) {
      expect(region).not.toBe('')
      expect(valoresDeTriggers(region)).toEqual([...grupo.slugs.values()])
    }
  })
})

// ── 6) G-04-7 (plan 04-07): un toque decide con la URL de ahora, y un consumo en vuelo no se repite ──
// El contrato son los `red_tests` de `.planning/debug/doble-toque-tab.md`. Dos defectos:
//   - el `from` salía del render del último commit: la escritura de un toque cambia la URL al instante,
//     pero el render recién se entera con el commit de la transición, y un segundo toque en esa ventana
//     decidía sobre un `from` viejo (E1: Ventas sobre Ventas; E2: el atrás desde Egresos caía en Ventas);
//   - el retroceso de un consumo es ASÍNCRONO: `holding` se lee de un state que no cambia hasta el
//     recorrido, y dos toques al default consumían dos veces (E3: el dueño terminaba en Inicio).
// ⚠ La guarda del consumo es memoria del MÓDULO y persiste entre casos de este archivo: todo caso que
// produzca un consumo termina con su `popstate` despachado (el retroceso síncrono lo despacha; con
// `backAsincrono`, el caso llama a `procesar()` antes de terminar).

describe('G-04-7 — un toque decide con la URL de ahora, y un consumo en vuelo no se repite', () => {
  afterEach(() => {
    drenarPopstateDelStub?.()
    drenarPopstateDelStub = null
    vi.unstubAllGlobals()
  })

  it('toqueDeTab existe y es una función del módulo de tabs', () => {
    expect(typeof (PT as Record<string, unknown>).toqueDeTab).toBe('function')
  })

  it('toqueDeTab: Ventas desde la URL limpia ⇒ from null, to ventas', () => {
    expect(PT.toqueDeTab({ grupo: TABS_FINANZAS, value: 'sales', search: '' })).toEqual({ ok: true, from: null, to: 'ventas' })
  })

  it('toqueDeTab: Ventas con ?tab=ventas en la URL ⇒ from ventas, to ventas (la regla 2 la ve)', () => {
    expect(PT.toqueDeTab({ grupo: TABS_FINANZAS, value: 'sales', search: '?tab=ventas' })).toEqual({ ok: true, from: 'ventas', to: 'ventas' })
  })

  it('toqueDeTab: un ?tab= de prototipo cae al default (D-07) ⇒ from null, to egresos', () => {
    expect(PT.toqueDeTab({ grupo: TABS_FINANZAS, value: 'expenses', search: '?x=1&tab=constructor' })).toEqual({ ok: true, from: null, to: 'egresos' })
  })

  it('toqueDeTab: un valor que no es del grupo ⇒ { ok: false }', () => {
    expect(PT.toqueDeTab({ grupo: TABS_FINANZAS, value: 'business', search: '' })).toEqual({ ok: false })
  })

  it('toqueDeTab: Datos desde Cobros en Negocio ⇒ from cobros, to null (el default es la URL limpia)', () => {
    expect(PT.toqueDeTab({ grupo: TABS_NEGOCIO, value: 'business', search: '?tab=cobros' })).toEqual({ ok: true, from: 'cobros', to: null })
  })

  it('E3: doble toque al default antes del recorrido ⇒ consume, none, UN solo retroceso y la URL en /finances', () => {
    const { pila, actual, procesar } = montarHistoria(
      [
        { url: '/dashboard', state: null },
        { url: '/finances', state: { frjUnder: '/dashboard' } },
        { url: '/finances?tab=ventas', state: { frjView: 'tab' } },
      ],
      { backAsincrono: true },
    )
    expect(tocar(TABS_FINANZAS, 'appointments')).toBe('consume')
    const segundo = tocar(TABS_FINANZAS, 'appointments')
    const retrocesos = pila.retrocesos
    procesar()
    expect(segundo).toBe('none')
    expect(retrocesos).toBe(1)
    expect(actual().url).toBe('/finances')
  })

  it('un empuje durante el consumo se descarta (none, la pila no cambia) y después del recorrido empuja', () => {
    const { pila, procesar } = montarHistoria(
      [
        { url: '/dashboard', state: null },
        { url: '/finances', state: { frjUnder: '/dashboard' } },
        { url: '/finances?tab=ventas', state: { frjView: 'tab' } },
      ],
      { backAsincrono: true },
    )
    expect(tocar(TABS_FINANZAS, 'appointments')).toBe('consume')
    const antes = JSON.stringify(pila.entradas)
    const enVuelo = tocar(TABS_FINANZAS, 'expenses')
    const despues = JSON.stringify(pila.entradas)
    procesar()
    expect(enVuelo).toBe('none')
    expect(despues).toBe(antes)
    expect(tocar(TABS_FINANZAS, 'expenses')).toBe('push')
  })

  it('un popstate AJENO antes del nuestro suelta la guarda (nunca queda colgada) y después ningún toque queda bloqueado', () => {
    const { pila, actual, procesar, popstate } = montarHistoria(
      [
        { url: '/dashboard', state: null },
        { url: '/finances', state: { frjUnder: '/dashboard' } },
        { url: '/finances?tab=ventas', state: { frjView: 'tab' } },
      ],
      { backAsincrono: true },
    )
    expect(tocar(TABS_FINANZAS, 'appointments')).toBe('consume')
    const oyentesTrasElConsumo = pila.oyentes
    popstate()
    const oyentesTrasElAjeno = pila.oyentes
    // Borde aceptado y escrito: con la guarda suelta antes de tiempo, la ventana se degrada al
    // comportamiento de antes (un reemplazo sobre la entrada que se está dejando), nunca a un bloqueo.
    const trasElAjeno = tocar(TABS_FINANZAS, 'expenses')
    procesar()
    expect(oyentesTrasElConsumo).toBe(1)
    expect(oyentesTrasElAjeno).toBe(0)
    expect(trasElAjeno).toBe('replace')
    expect(actual().url).toBe('/finances')
    expect(tocar(TABS_FINANZAS, 'sales')).toBe('push')
  })

  it('E1 (regresión): Turnos → Ventas ×2 sin commit entre toques ⇒ push, none y 3 entradas', () => {
    const { pila } = montarHistoria([
      { url: '/dashboard', state: null },
      { url: '/finances', state: { frjUnder: '/dashboard' } },
    ])
    expect(tocar(TABS_FINANZAS, 'sales')).toBe('push')
    expect(tocar(TABS_FINANZAS, 'sales')).toBe('none')
    expect(pila.entradas).toHaveLength(3)
  })

  it('E2 (regresión): Turnos → Ventas → Egresos ⇒ push, replace, y un atrás deja /finances (D-01)', () => {
    const { actual } = montarHistoria([
      { url: '/dashboard', state: null },
      { url: '/finances', state: { frjUnder: '/dashboard' } },
    ])
    expect(tocar(TABS_FINANZAS, 'sales')).toBe('push')
    expect(tocar(TABS_FINANZAS, 'expenses')).toBe('replace')
    window.history.back()
    expect(actual().url).toBe('/finances')
  })

  it('E4 (regresión): Ventas → Turnos, recorrido, Turnos otra vez ⇒ consume, none, un retroceso y /finances conserva frjUnder', () => {
    const { pila, actual, procesar } = montarHistoria(
      [
        { url: '/dashboard', state: null },
        { url: '/finances', state: { frjUnder: '/dashboard' } },
      ],
      { backAsincrono: true },
    )
    expect(tocar(TABS_FINANZAS, 'sales')).toBe('push')
    expect(tocar(TABS_FINANZAS, 'appointments')).toBe('consume')
    procesar()
    expect(tocar(TABS_FINANZAS, 'appointments')).toBe('none')
    expect(pila.retrocesos).toBe(1)
    expect(actual().state).toEqual({ frjUnder: '/dashboard' })
  })

  it('candado del espejo: el `tocar` de ESTA suite pide el toque a toqueDeTab con la URL de ahora', () => {
    const cuerpo = cuerpoDe(read('test/panel-tabs.test.ts'), 'function tocar(', 'value: unknown) {')
    expect(cuerpo).not.toBe('')
    expect(cuerpo).toContain('toqueDeTab(')
    expect(cuerpo).toContain('window.location.search')
    expect(cuerpo).not.toContain('resolveTab(')
  })

  it('candado de la guarda: en applyPanelView, la guarda antes de holding, y en consume el encendido y el oyente antes del retroceso', () => {
    const fuente = sinComentarios(read('lib/panel-history.ts'))
    const at = fuente.indexOf('export function applyPanelView({')
    const fin = at === -1 ? -1 : fuente.indexOf('\n}\n', at)
    const region = at === -1 || fin === -1 ? '' : fuente.slice(at, fin + 2)
    expect(region).not.toBe('')
    const guarda = region.indexOf('if (consumoEnVuelo) {')
    const holding = region.indexOf('const holding =')
    expect(guarda).toBeGreaterThan(-1)
    expect(holding).toBeGreaterThan(-1)
    expect(guarda).toBeLessThan(holding)
    const rama = region.indexOf("if (action === 'consume')")
    const enciende = region.indexOf('consumoEnVuelo = true')
    const oyente = region.indexOf("window.addEventListener('popstate', soltarConsumo, { once: true })")
    const retroceso = region.indexOf('window.history.back()')
    expect(rama).toBeGreaterThan(-1)
    expect(enciende).toBeGreaterThan(rama)
    expect(oyente).toBeGreaterThan(rama)
    expect(retroceso).toBeGreaterThan(enciende)
    expect(retroceso).toBeGreaterThan(oyente)
    expect(cuerpoDe(fuente, 'function soltarConsumo(', '): void {')).toContain('consumoEnVuelo = false')
    expect(fuente).not.toMatch(/export\s+(let|const|var)\s+consumoEnVuelo\b/)
    expect((PH as Record<string, unknown>).consumoEnVuelo).toBeUndefined()
  })
})

// ── 7) G-04-8 (plan 04-07): un solo criterio para la vuelta del OAuth, por PRESENCIA ───────────────
// El render fuerza Integraciones mientras `mp` o `google` estén en la query —con cualquier valor, vacío
// incluido—, y el que limpia tiene que preguntar EXACTAMENTE lo mismo: si preguntara por verdad, `?mp=`
// quedaría para siempre y los cuatro tabs de Negocio, trabados (`.planning/debug/oauth-traba-tabs-negocio.md`).

describe('G-04-8 — vueltaDeOAuthPendiente: mp o google PRESENTES en la query', () => {
  it('vueltaDeOAuthPendiente existe y es una función del módulo de tabs', () => {
    expect(typeof (PT as Record<string, unknown>).vueltaDeOAuthPendiente).toBe('function')
  })

  for (const [query, esperado] of [
    ['?mp=', true],
    ['?google=', true],
    ['?mp=connected', true],
    ['?tab=integraciones', false],
    ['', false],
    ['?MP=x', false],
    ['?xmp=1&tab=cobros', false],
  ] as const) {
    it(`vueltaDeOAuthPendiente: «${query}» ⇒ ${esperado}`, () => {
      expect(PT.vueltaDeOAuthPendiente({ query: new URLSearchParams(query) })).toBe(esperado)
    })
  }
})

// ── 8) R2-WR-01 (quick 261118-kat): la guarda de consumo en vuelo, medida en sus tres casos ANTES de arreglar ──
// El code review de la ronda 2 (WR-01) y su cruce con `consumeOwnedPanelEntry` (IN-03) nombran tres caminos por
// los que la guarda del 04-07 podría fallar. El dueño decidió el 2026-11-18 medir PRIMERO los tres y arreglar sólo
// los que reproduzcan. Acá van dos; el tercero (la página que vuelve de la bfcache sin `popstate`) no se puede
// expresar sin un navegador y se mide en Chrome por CDP (`K1-bfcache-cruce`, en la sonda del scroll).
//   · Caso 2: un `back()` que TIRA. La guarda se enciende antes del retroceso y nadie la apaga: el oyente queda
//     colgado y el toque siguiente da `none`.
//   · Caso 3a: un consumo de tab y, antes de su `popstate`, el retroceso del MENÚ (la sección activa, NAV-08) o de
//     la BARRA (Inicio, B1). `consumeOwnedPanelEntry` no lee la guarda: retrocede otra vez sobre el mismo state.
//   · Caso 3b: la inversa. Primero el retroceso del menú o de B1, después el tab por defecto, que consume de nuevo.
// Cada `esperado` es lo CORRECTO (un solo retroceso por gesto, el dueño dentro de la sección o en Inicio): un ROJO
// quiere decir que el caso REPRODUCE. Los `NR-*` fijan cómo termina B1 hoy (control, dos fichas apiladas cuyo
// segundo consumo sale del `popstate` del primero, y el retroceso triple de Más) y tienen que estar en verde con el
// código de hoy: si no, el simulador no representa B1 y el caso 3 se mide en la app (P-1b). `K2-b` es un candado de
// no-regresión del menú con un retroceso que tira (hoy verde). Los ejecutores son los REALES (`applyPanelView`,
// `consumeOwnedPanelEntry`, `runBranchNavigation`) contra la historia con retroceso ASÍNCRONO.

describe('R2-WR-01 — los tres casos de la guarda de consumo en vuelo, medidos antes de arreglar (quick 261118-kat)', () => {
  const ID = 7
  const navegaciones: string[] = []

  afterEach(() => {
    drenarPopstateDelStub?.()
    drenarPopstateDelStub = null
    navegaciones.length = 0
    PB.takeBackLanding()
    PB.applyBranchMarkRequest('__drenaje__')
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  // Las pilas se FABRICAN en cada llamada: la identidad del state de cada entrada es la de ESE caso.
  const pilaFin = (): Entrada[] => [
    { url: '/afuera', state: null },
    { url: '/dashboard', state: null },
    { url: '/finances', state: { frjUnder: '/dashboard' } },
    { url: '/finances?tab=ventas', state: { frjView: 'tab' } },
  ]
  const pilaFichas = (): Entrada[] => [
    { url: '/afuera', state: null },
    { url: '/dashboard', state: null },
    { url: '/clients', state: { frjUnder: '/dashboard' } },
    { url: '/clients?c=a', state: { frjView: 'c' } },
    { url: '/clients?c=b', state: { frjView: 'c' } },
  ]
  const pilaTriple = (): Entrada[] => [
    { url: '/afuera', state: null },
    { url: '/dashboard', state: null },
    { url: '/mas', state: { frjUnder: '/dashboard' } },
    { url: '/negocio', state: { frjUnder: '/mas' } },
    { url: '/negocio?tab=cobros', state: { frjView: 'tab' } },
  ]

  // Lo que la barra no modela acá, a propósito: el sentinel de salida (ninguna de estas pilas lo tiene arriba) y el
  // router de Next (una navegación pedida se ANOTA; no escribe la pila). Eso lo cubren las sondas de la app.
  const anotar = (to: string, modo: 'push' | 'replace') => {
    navegaciones.push(`${modo} ${to}`)
  }
  const hechos = () =>
    PB.branchStackFacts({ estado: window.history.state, id: ID, root: PH.PANEL_ROOT, more: PH.PANEL_MORE })

  /** EXACTAMENTE `decidirDesdeElAterrizaje` del hook (`lib/panel-branch.ts`), sin React. */
  function decidir(href: string): void {
    const desde = window.location.pathname
    const plan = PH.panelBranchPlan({ from: desde, to: href, root: PH.PANEL_ROOT, more: PH.PANEL_MORE, ...hechos() })
    if (plan === 'none') return
    if (plan === 'push' || plan === 'replace') {
      anotar(href, plan)
      return
    }
    const seHizoCargo = PB.runBranchNavigation({
      plan,
      to: href,
      root: PH.PANEL_ROOT,
      more: PH.PANEL_MORE,
      navigate: anotar,
      exitId: ID,
      reDecidir: () => decidir(href),
    })
    if (!seHizoCargo) navegaciones.push(`caida ${href}`)
  }

  /** EXACTAMENTE `handleNavigate` del hook: `false` (y la navegación anotada) con push/replace; si no, el ejecutor. */
  function tocarLaBarra(href: string): boolean {
    const plan = PH.panelBranchPlan({
      from: window.location.pathname,
      to: href,
      root: PH.PANEL_ROOT,
      more: PH.PANEL_MORE,
      ...hechos(),
    })
    if (plan === 'push' || plan === 'replace') {
      anotar(href, plan)
      return false
    }
    return PB.runBranchNavigation({
      plan,
      to: href,
      root: PH.PANEL_ROOT,
      more: PH.PANEL_MORE,
      navigate: anotar,
      exitId: ID,
      reDecidir: () => decidir(href),
    })
  }

  const queTira = () =>
    vi.spyOn(window.history, 'back').mockImplementationOnce(() => {
      throw new DOMException('demasiadas llamadas', 'SecurityError')
    })

  it('K2-a: un back() que tira no deja la guarda encendida', () => {
    const { pila, actual, procesar } = montarHistoria(pilaFin(), { backAsincrono: true })
    queTira()
    let tiro = false
    try {
      tocar(TABS_FINANZAS, 'appointments')
    } catch {
      tiro = true
    }
    const oyentes = pila.oyentes
    const siguiente = tocar(TABS_FINANZAS, 'appointments')
    procesar()
    const medido = { tiro, oyentes, siguiente, url: actual().url }
    expect(medido).toEqual({ tiro: true, oyentes: 0, siguiente: 'consume', url: '/finances' })
  })

  it('K2-b: consumeOwnedPanelEntry con un back() que tira no deja nada encendido (candado de no-regresión)', () => {
    const { actual, procesar } = montarHistoria(pilaFin(), { backAsincrono: true })
    queTira()
    let tiro = false
    try {
      PH.consumeOwnedPanelEntry()
    } catch {
      tiro = true
    }
    const siguiente = tocar(TABS_FINANZAS, 'appointments')
    procesar()
    const medido = { tiro, siguiente, url: actual().url }
    expect(medido).toEqual({ tiro: true, siguiente: 'consume', url: '/finances' })
  })

  it('K3a-nav08: tab por defecto y, antes del popstate, la sección activa del menú', () => {
    const { pila, actual, procesar } = montarHistoria(pilaFin(), { backAsincrono: true })
    const consumo = tocar(TABS_FINANZAS, 'appointments')
    const prevenido = PH.consumeOwnedPanelEntry()
    procesar()
    const medido = { consumo, prevenido, retrocesos: pila.retrocesos, url: actual().url }
    expect(medido).toEqual({ consumo: 'consume', prevenido: true, retrocesos: 1, url: '/finances' })
  })

  it('K3a-b1: tab por defecto y, antes del popstate, Inicio en la barra', () => {
    const { pila, actual, procesar } = montarHistoria(pilaFin(), { backAsincrono: true })
    const consumo = tocar(TABS_FINANZAS, 'appointments')
    const seHizoCargo = tocarLaBarra(PH.PANEL_ROOT)
    procesar()
    const medido = { consumo, seHizoCargo, retrocesos: pila.retrocesos, url: actual().url, navegaciones: [...navegaciones] }
    expect(medido).toEqual({ consumo: 'consume', seHizoCargo: true, retrocesos: 2, url: '/dashboard', navegaciones: [] })
  })

  it('K3b-nav08: la sección activa del menú y, antes del popstate, el tab por defecto', () => {
    const { pila, actual, procesar } = montarHistoria(pilaFin(), { backAsincrono: true })
    const prevenido = PH.consumeOwnedPanelEntry()
    const toque = tocar(TABS_FINANZAS, 'appointments')
    procesar()
    const medido = { prevenido, toque, retrocesos: pila.retrocesos, url: actual().url }
    expect(medido).toEqual({ prevenido: true, toque: 'none', retrocesos: 1, url: '/finances' })
  })

  it('K3b-b1: Inicio en la barra y, antes del popstate, el tab por defecto', () => {
    const { pila, actual, procesar } = montarHistoria(pilaFin(), { backAsincrono: true })
    const seHizoCargo = tocarLaBarra(PH.PANEL_ROOT)
    const toque = tocar(TABS_FINANZAS, 'appointments')
    procesar()
    const medido = { seHizoCargo, toque, retrocesos: pila.retrocesos, url: actual().url, navegaciones: [...navegaciones] }
    expect(medido).toEqual({ seHizoCargo: true, toque: 'none', retrocesos: 2, url: '/dashboard', navegaciones: [] })
  })

  it('NR-b1-control: Inicio en la barra con el tab arriba y sin otro toque', () => {
    const { pila, actual, procesar } = montarHistoria(pilaFin(), { backAsincrono: true })
    const seHizoCargo = tocarLaBarra(PH.PANEL_ROOT)
    procesar()
    const medido = { seHizoCargo, retrocesos: pila.retrocesos, url: actual().url, navegaciones: [...navegaciones] }
    expect(medido).toEqual({ seHizoCargo: true, retrocesos: 2, url: '/dashboard', navegaciones: [] })
  })

  it('NR-b1-reentrada: Inicio en la barra con dos fichas apiladas (el segundo consumo sale del popstate del primero)', () => {
    const { pila, actual, procesar } = montarHistoria(pilaFichas(), { backAsincrono: true })
    const seHizoCargo = tocarLaBarra(PH.PANEL_ROOT)
    procesar()
    const medido = { seHizoCargo, retrocesos: pila.retrocesos, url: actual().url, navegaciones: [...navegaciones] }
    expect(medido).toEqual({ seHizoCargo: true, retrocesos: 3, url: '/dashboard', navegaciones: [] })
  })

  it('NR-b1-triple: Inicio desde Cobros con Más debajo (el retroceso triple medido en la app)', () => {
    const { pila, actual, procesar } = montarHistoria(pilaTriple(), { backAsincrono: true })
    const seHizoCargo = tocarLaBarra(PH.PANEL_ROOT)
    procesar()
    const medido = { seHizoCargo, retrocesos: pila.retrocesos, url: actual().url, navegaciones: [...navegaciones] }
    expect(medido).toEqual({ seHizoCargo: true, retrocesos: 3, url: '/dashboard', navegaciones: [] })
  })
})

// ── 9) R2-WR-01 (quick 261118-kat): los candados del arreglo, escritos ANTES del arreglo ─────────────
// La medición de arriba dio: caso 2 y caso 3 (los dos sentidos) reproducen; el caso 1 no reprodujo en Chrome 157
// (ninguno de los dos documentos entró a la bfcache) y el dueño eligió igual la mitigación defensiva (A): soltar la
// guarda en `pageshow` con `persisted`. Estos tres candados fijan lo que el arreglo agrega y no se puede ver en los
// nueve casos de arriba, que quedan intactos:
//   · `C-retroceso-unico`: la duplicación A PROPÓSITO del bloque de encendido (la rama `consume` del ejecutor y
//     `consumeOwnedPanelEntry`) no puede derivar: las mismas líneas, un solo retroceso, y en el menú el chequeo del
//     consumo en vuelo ANTES de sus dos guardas. Rojo antes del arreglo.
//   · `C-pageshow-tab`: un consumo cuyo recorrido nunca llegó (se fue a otro documento) y la página que vuelve de la
//     bfcache: el `pageshow` persistido suelta la guarda y el tab siguiente escribe. Rojo antes del arreglo.
//   · `C-pageshow-menu`: lo mismo con el consumo del menú, que con el arreglo también enciende la guarda. Antes del
//     arreglo da verde de casualidad (el menú no tenía guarda): fija que la nueva no lo trabe.

describe('R2-WR-01 — los candados del arreglo (quick 261118-kat)', () => {
  const navegaciones: string[] = []

  afterEach(() => {
    drenarPopstateDelStub?.()
    drenarPopstateDelStub = null
    pageshowDelStub = null
    navegaciones.length = 0
    PB.takeBackLanding()
    PB.applyBranchMarkRequest('__drenaje__')
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  // La misma pila que `pilaFin` del bloque de arriba (que no se toca), fabricada en cada llamada.
  const pilaDelTab = (): Entrada[] => [
    { url: '/afuera', state: null },
    { url: '/dashboard', state: null },
    { url: '/finances', state: { frjUnder: '/dashboard' } },
    { url: '/finances?tab=ventas', state: { frjView: 'tab' } },
  ]

  /** Las líneas de código de una región, sin sangría y sin las vacías que dejan los comentarios quitados. */
  const lineas = (region: string) =>
    region
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l !== '')

  /** Desde `consumoEnVuelo = true` hasta el `}` que cierra el `catch` (incluidos los dos). */
  const bloqueDeEncendido = (region: string): string[] => {
    const ls = lineas(region)
    const desde = ls.indexOf('consumoEnVuelo = true')
    if (desde === -1) return []
    const captura = ls.findIndex((l, i) => i > desde && l.startsWith('} catch'))
    if (captura === -1) return []
    const cierre = ls.findIndex((l, i) => i > captura && l === '}')
    return cierre === -1 ? [] : ls.slice(desde, cierre + 1)
  }

  it('C-retroceso-unico: consumeOwnedPanelEntry chequea el consumo en vuelo antes de sus guardas y enciende la guarda con las MISMAS líneas que la rama consume', () => {
    const fuente = sinComentarios(read('lib/panel-history.ts'))
    const menu = cuerpoDe(fuente, 'export function consumeOwnedPanelEntry(', '): boolean {')
    const at = fuente.indexOf('export function applyPanelView({')
    const fin = at === -1 ? -1 : fuente.indexOf('\n}\n', at)
    const ejecutor = at === -1 || fin === -1 ? '' : fuente.slice(at, fin + 2)
    const rama = recorte(ejecutor, "if (action === 'consume') {")
    expect(menu).not.toBe('')
    expect(rama).not.toBe('')
    // El chequeo del consumo en vuelo va antes de las dos guardas (y de leer `actual`).
    const enVuelo = menu.indexOf('consumoEnVuelo')
    const ajena = menu.indexOf('isForeignOwnedEntry(actual)')
    const marca = menu.indexOf('panelViewEntryParam(actual) === null')
    expect(enVuelo).toBeGreaterThan(-1)
    expect(ajena).toBeGreaterThan(-1)
    expect(marca).toBeGreaterThan(ajena)
    expect(enVuelo).toBeLessThan(ajena)
    expect(menu.indexOf('estadoDelConsumo')).toBeGreaterThan(-1)
    // Un solo retroceso en el menú, después de las dos guardas.
    expect(menu.split('window.history.back()').length - 1).toBe(1)
    expect(menu.indexOf('window.history.back()')).toBeGreaterThan(marca)
    // El bloque de encendido: no vacío, con el oyente, el retroceso adentro del `try` y la liberación en el `catch`,
    // e IGUAL línea por línea en las dos ramas.
    const delMenu = bloqueDeEncendido(menu)
    const delEjecutor = bloqueDeEncendido(rama)
    expect(delEjecutor.length).toBeGreaterThan(0)
    expect(delEjecutor).toContain("window.addEventListener('popstate', soltarConsumo, { once: true })")
    expect(delEjecutor).toContain('window.history.back()')
    expect(delEjecutor.indexOf('try {')).toBeGreaterThan(-1)
    expect(delEjecutor.indexOf('window.history.back()')).toBeGreaterThan(delEjecutor.indexOf('try {'))
    expect(delEjecutor.indexOf('soltarConsumo()')).toBeGreaterThan(delEjecutor.findIndex((l) => l.startsWith('} catch')))
    expect(delMenu).toEqual(delEjecutor)
  })

  it('C-pageshow-tab: un consumo cuyo recorrido nunca llegó y la vuelta de la bfcache ⇒ el tab siguiente escribe y no quedan oyentes', () => {
    const { pila } = montarHistoria(pilaDelTab(), { backAsincrono: true })
    expect(tocar(TABS_FINANZAS, 'appointments')).toBe('consume')
    // No se procesa: el recorrido se fue a otro documento. La página vuelve de la bfcache.
    pageshowDelStub?.(true)
    const tras = tocar(TABS_FINANZAS, 'expenses')
    const medido = { tras, oyentes: pila.oyentes }
    expect(medido).toEqual({ tras: 'replace', oyentes: 0 })
  })

  it('C-pageshow-menu: el consumo del menú y la vuelta de la bfcache ⇒ un segundo consumo vuelve a retroceder', () => {
    const { pila } = montarHistoria(pilaDelTab(), { backAsincrono: true })
    expect(PH.consumeOwnedPanelEntry()).toBe(true)
    pageshowDelStub?.(true)
    const otra = PH.consumeOwnedPanelEntry()
    const medido = { otra, retrocesos: pila.retrocesos }
    expect(medido).toEqual({ otra: true, retrocesos: 2 })
  })
})

// ── 10) CR-01 del review de R2-WR-01 (quick 261118-pjd): medidos ANTES de arreglar ────────────────────
// El code review del quick 261118-kat dejó un crítico y tres avisos de la misma familia que la guarda de consumo en
// vuelo. El dueño decidió el 2026-11-18 arreglarlos ANTES del push conjunto (obs-G1 + R2-WR-01 + éste), midiendo
// primero; y, sobre el doble toque a `up` que se vio por lectura al planificar, «medirlo y arreglarlo si da rojo».
// Cinco grupos:
//   · CR-01: dos (o tres) toques a Inicio en la barra antes del recorrido. B1 engancha su segundo paso ANTES de
//     `consumeOwnedPanelEntry`, y ese consumo devuelve `true` sin retroceder con un consumo en vuelo: quedan varios
//     re-decisores que corren en el MISMO `popstate`, leen el mismo state y retroceden cada uno.
//     `CR-b1-silencio` fija el residuo que se acepta para el retroceso que el navegador ignora en silencio: a lo
//     sumo UN re-decisor pendiente (el atrás del sistema más un `up`), nunca el dueño fuera del sitio.
//   · WR-02: un `back()` que tira dentro de B1 deja su segundo paso enganchado y el siguiente atrás del sistema
//     navega solo (`K2-c-b1`; las otras dos ramas de dos pasos se miden en `test/panel-branch.test.ts`).
//   · WR-01: el `replaceState` que hace el `HistoryUpdater` de Next en cada commit
//     (`node_modules/next/dist/client/components/app-router.js:38-67`) cambia la identidad del state sin cambiar la
//     URL; los `W1-*` lo emulan dentro de la ventana del recorrido.
//   · WR-03/IN-01: un `pageshow` no persistido no puede soltar la guarda ni gastar su salida por la bfcache, y
//     ninguna salida de la guarda deja vivo un oyente de `popstate` ni de `pageshow` (`P0-*`).
//   · UP-doble: dos toques a Inicio desde una sección con la marca de la rama, antes del recorrido:
//     `consumeOwnedBranchEntry` no lee la guarda.
// Cada `esperado` es lo CORRECTO (un retroceso por gesto, el dueño en la sección o en Inicio): un ROJO quiere decir que
// el caso REPRODUCE. `NR-menu-y-barra`, `UP-control` y los `P0-*` son candados de no-regresión y tienen que estar en
// verde con el código de hoy: si no, el simulador no representa el camino y no hay veredicto (P-1). Los ejecutores
// son los REALES contra la historia con retroceso ASÍNCRONO.

describe('CR-01 del review de R2-WR-01 — medidos antes de arreglar (quick 261118-pjd)', () => {
  const ID = 7
  const navegaciones: string[] = []

  afterEach(() => {
    drenarPopstateDelStub?.()
    drenarPopstateDelStub = null
    pageshowDelStub = null
    oyentesPageshowDelStub = null
    navegaciones.length = 0
    PB.takeBackLanding()
    PB.applyBranchMarkRequest('__drenaje__')
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  // Las pilas se FABRICAN en cada llamada: la identidad del state de cada entrada es la de ESE caso. Las dos primeras
  // son copias exactas de las del describe K del quick 261118-kat (que no se toca).
  const pilaFin = (): Entrada[] => [
    { url: '/afuera', state: null },
    { url: '/dashboard', state: null },
    { url: '/finances', state: { frjUnder: '/dashboard' } },
    { url: '/finances?tab=ventas', state: { frjView: 'tab' } },
  ]
  const pilaFichas = (): Entrada[] => [
    { url: '/afuera', state: null },
    { url: '/dashboard', state: null },
    { url: '/clients', state: { frjUnder: '/dashboard' } },
    { url: '/clients?c=a', state: { frjView: 'c' } },
    { url: '/clients?c=b', state: { frjView: 'c' } },
  ]
  // Una sección con la marca de la rama arriba y sin subsección: Inicio desde acá es un `up` solo.
  const pilaSeccion = (): Entrada[] => [
    { url: '/afuera', state: null },
    { url: '/dashboard', state: null },
    { url: '/finances', state: { frjUnder: '/dashboard' } },
  ]

  const anotar = (to: string, modo: 'push' | 'replace') => {
    navegaciones.push(`${modo} ${to}`)
  }
  const hechos = () =>
    PB.branchStackFacts({ estado: window.history.state, id: ID, root: PH.PANEL_ROOT, more: PH.PANEL_MORE })

  /** EXACTAMENTE `decidirDesdeElAterrizaje` del hook (`lib/panel-branch.ts`), sin React. */
  function decidir(href: string): void {
    const desde = window.location.pathname
    const plan = PH.panelBranchPlan({ from: desde, to: href, root: PH.PANEL_ROOT, more: PH.PANEL_MORE, ...hechos() })
    if (plan === 'none') return
    if (plan === 'push' || plan === 'replace') {
      anotar(href, plan)
      return
    }
    const seHizoCargo = PB.runBranchNavigation({
      plan,
      to: href,
      root: PH.PANEL_ROOT,
      more: PH.PANEL_MORE,
      navigate: anotar,
      exitId: ID,
      reDecidir: () => decidir(href),
    })
    if (!seHizoCargo) navegaciones.push(`caida ${href}`)
  }

  /** EXACTAMENTE `handleNavigate` del hook: `false` (y la navegación anotada) con push/replace; si no, el ejecutor. */
  function tocarLaBarra(href: string): boolean {
    const plan = PH.panelBranchPlan({
      from: window.location.pathname,
      to: href,
      root: PH.PANEL_ROOT,
      more: PH.PANEL_MORE,
      ...hechos(),
    })
    if (plan === 'push' || plan === 'replace') {
      anotar(href, plan)
      return false
    }
    return PB.runBranchNavigation({
      plan,
      to: href,
      root: PH.PANEL_ROOT,
      more: PH.PANEL_MORE,
      navigate: anotar,
      exitId: ID,
      reDecidir: () => decidir(href),
    })
  }

  const queTira = () =>
    vi.spyOn(window.history, 'back').mockImplementationOnce(() => {
      throw new DOMException('demasiadas llamadas', 'SecurityError')
    })

  // Un retroceso que el navegador IGNORA EN SILENCIO: ni tira, ni recorre, ni se cuenta.
  const queSeIgnora = () => vi.spyOn(window.history, 'back').mockImplementationOnce(() => {})

  // El commit de una transición de Next dentro de la ventana del recorrido: el `HistoryUpdater`
  // (`app-router.js:38-67`) reemplaza la entrada con el state de ahora esparcido (conserva `frjView`) y la
  // `canonicalUrl` del árbol que confirma, que en el flujo medido es la misma: la URL NO cambia, la identidad sí.
  const nextReemplaza = () => window.history.replaceState({ ...(window.history.state as object), __NA: true }, '')

  it('CR-b1-doble: dos toques a Inicio en la barra antes del recorrido', () => {
    const { pila, actual, procesar } = montarHistoria(pilaFin(), { backAsincrono: true })
    const s1 = tocarLaBarra(PH.PANEL_ROOT)
    const s2 = tocarLaBarra(PH.PANEL_ROOT)
    procesar()
    const medido = { s1, s2, retrocesos: pila.retrocesos, url: actual().url, navegaciones: [...navegaciones] }
    expect(medido).toEqual({ s1: true, s2: true, retrocesos: 2, url: '/dashboard', navegaciones: [] })
  })

  it('CR-b1-doble-fichas: dos toques a Inicio en la barra con dos fichas apiladas', () => {
    const { pila, actual, procesar } = montarHistoria(pilaFichas(), { backAsincrono: true })
    const s1 = tocarLaBarra(PH.PANEL_ROOT)
    const s2 = tocarLaBarra(PH.PANEL_ROOT)
    procesar()
    const medido = { s1, s2, retrocesos: pila.retrocesos, url: actual().url, navegaciones: [...navegaciones] }
    expect(medido).toEqual({ s1: true, s2: true, retrocesos: 3, url: '/dashboard', navegaciones: [] })
  })

  it('CR-b1-silencio: el retroceso ignorado en silencio, tres toques a la barra y después un atrás del sistema', () => {
    const { pila, actual, procesar } = montarHistoria(pilaFin(), { backAsincrono: true })
    queSeIgnora()
    const s1 = tocarLaBarra(PH.PANEL_ROOT)
    const s2 = tocarLaBarra(PH.PANEL_ROOT)
    const s3 = tocarLaBarra(PH.PANEL_ROOT)
    window.history.back()
    procesar()
    const medido = { s1, s2, s3, retrocesos: pila.retrocesos, url: actual().url, navegaciones: [...navegaciones] }
    expect(medido).toEqual({ s1: true, s2: true, s3: true, retrocesos: 2, url: '/dashboard', navegaciones: [] })
  })

  it('NR-menu-y-barra: la sección activa del menú y, antes del recorrido, Inicio en la barra', () => {
    const { pila, actual, procesar } = montarHistoria(pilaFin(), { backAsincrono: true })
    const s1 = PH.consumeOwnedPanelEntry()
    const s2 = tocarLaBarra(PH.PANEL_ROOT)
    procesar()
    const medido = { s1, s2, retrocesos: pila.retrocesos, url: actual().url, navegaciones: [...navegaciones] }
    expect(medido).toEqual({ s1: true, s2: true, retrocesos: 2, url: '/dashboard', navegaciones: [] })
  })

  it('K2-c-b1: B1 con un back() que tira no deja su segundo paso enganchado', () => {
    const { pila, actual, procesar } = montarHistoria(pilaFin(), { backAsincrono: true })
    queTira()
    let tiro = false
    try {
      tocarLaBarra(PH.PANEL_ROOT)
    } catch {
      tiro = true
    }
    const oyentes = pila.oyentes
    window.history.back()
    procesar()
    const medido = { tiro, oyentes, retrocesos: pila.retrocesos, url: actual().url, navegaciones: [...navegaciones] }
    expect(medido).toEqual({ tiro: true, oyentes: 0, retrocesos: 1, url: '/finances', navegaciones: [] })
  })

  it('W1-menu: el tab por defecto, el replaceState de Next en la ventana y la sección activa del menú', () => {
    const { pila, actual, procesar } = montarHistoria(pilaFin(), { backAsincrono: true })
    const consumo = tocar(TABS_FINANZAS, 'appointments')
    nextReemplaza()
    const prevenido = PH.consumeOwnedPanelEntry()
    procesar()
    const medido = { consumo, prevenido, retrocesos: pila.retrocesos, url: actual().url }
    expect(medido).toEqual({ consumo: 'consume', prevenido: true, retrocesos: 1, url: '/finances' })
  })

  it('W1-b1: el tab por defecto, el replaceState de Next en la ventana e Inicio en la barra', () => {
    const { pila, actual, procesar } = montarHistoria(pilaFin(), { backAsincrono: true })
    const consumo = tocar(TABS_FINANZAS, 'appointments')
    nextReemplaza()
    const seHizoCargo = tocarLaBarra(PH.PANEL_ROOT)
    procesar()
    const medido = { consumo, seHizoCargo, retrocesos: pila.retrocesos, url: actual().url, navegaciones: [...navegaciones] }
    expect(medido).toEqual({ consumo: 'consume', seHizoCargo: true, retrocesos: 2, url: '/dashboard', navegaciones: [] })
  })

  it('C-pageshow-no-persistido: un pageshow no persistido no suelta la guarda ni gasta su salida', () => {
    const { pila } = montarHistoria(pilaFin(), { backAsincrono: true })
    const consumo = tocar(TABS_FINANZAS, 'appointments')
    pageshowDelStub?.(false)
    const primero = tocar(TABS_FINANZAS, 'expenses')
    const vivosPageshow = oyentesPageshowDelStub?.()
    pageshowDelStub?.(true)
    const despues = tocar(TABS_FINANZAS, 'expenses')
    const oyentes = pila.oyentes
    const oyentesPageshow = oyentesPageshowDelStub?.()
    const medido = { consumo, primero, vivosPageshow, despues, oyentes, oyentesPageshow }
    expect(medido).toEqual({ consumo: 'consume', primero: 'none', vivosPageshow: 1, despues: 'replace', oyentes: 0, oyentesPageshow: 0 })
  })

  it('P0-normal: el recorrido que llega no deja oyentes de popstate ni de pageshow', () => {
    const { pila, actual, procesar } = montarHistoria(pilaFin(), { backAsincrono: true })
    const consumo = tocar(TABS_FINANZAS, 'appointments')
    procesar()
    const medido = { consumo, url: actual().url, oyentes: pila.oyentes, oyentesPageshow: oyentesPageshowDelStub?.() }
    expect(medido).toEqual({ consumo: 'consume', url: '/finances', oyentes: 0, oyentesPageshow: 0 })
  })

  it('P0-catch-tab: el back() que tira en el tab no deja oyentes', () => {
    const { pila } = montarHistoria(pilaFin(), { backAsincrono: true })
    queTira()
    let tiro = false
    try {
      tocar(TABS_FINANZAS, 'appointments')
    } catch {
      tiro = true
    }
    const medido = { tiro, oyentes: pila.oyentes, oyentesPageshow: oyentesPageshowDelStub?.() }
    expect(medido).toEqual({ tiro: true, oyentes: 0, oyentesPageshow: 0 })
  })

  it('P0-catch-menu: el back() que tira en el menú no deja oyentes', () => {
    const { pila } = montarHistoria(pilaFin(), { backAsincrono: true })
    queTira()
    let tiro = false
    try {
      PH.consumeOwnedPanelEntry()
    } catch {
      tiro = true
    }
    const medido = { tiro, oyentes: pila.oyentes, oyentesPageshow: oyentesPageshowDelStub?.() }
    expect(medido).toEqual({ tiro: true, oyentes: 0, oyentesPageshow: 0 })
  })

  it('P0-pageshow: la vuelta de la bfcache tras el consumo del menú no deja oyentes', () => {
    const { pila } = montarHistoria(pilaFin(), { backAsincrono: true })
    const consumo = PH.consumeOwnedPanelEntry()
    pageshowDelStub?.(true)
    const medido = { consumo, oyentes: pila.oyentes, oyentesPageshow: oyentesPageshowDelStub?.() }
    expect(medido).toEqual({ consumo: true, oyentes: 0, oyentesPageshow: 0 })
  })

  it('UP-doble: dos toques a Inicio desde una sección con la marca de la rama, antes del recorrido', () => {
    const { pila, actual, procesar } = montarHistoria(pilaSeccion(), { backAsincrono: true })
    const s1 = tocarLaBarra(PH.PANEL_ROOT)
    const s2 = tocarLaBarra(PH.PANEL_ROOT)
    procesar()
    const medido = { s1, s2, retrocesos: pila.retrocesos, url: actual().url, navegaciones: [...navegaciones] }
    expect(medido).toEqual({ s1: true, s2: true, retrocesos: 1, url: '/dashboard', navegaciones: [] })
  })

  it('UP-control: un solo toque a Inicio desde la misma sección (el simulador arma el up)', () => {
    const { pila, actual, procesar } = montarHistoria(pilaSeccion(), { backAsincrono: true })
    const s1 = tocarLaBarra(PH.PANEL_ROOT)
    procesar()
    const medido = { s1, retrocesos: pila.retrocesos, url: actual().url, navegaciones: [...navegaciones] }
    expect(medido).toEqual({ s1: true, retrocesos: 1, url: '/dashboard', navegaciones: [] })
  })
})

// ── 11) UP-doble (quick 261118-pjd): el candado de la guarda compartida, escrito ANTES del arreglo ─────────
// `UP-doble` reprodujo en (m): dos toques a Inicio desde una sección con la marca de la rama, antes del recorrido,
// dieron 2 retrocesos y `/afuera`, porque `consumeOwnedBranchEntry` no leía la guarda del consumo en vuelo. El dueño
// decidió (2026-11-18) arreglarlo si daba rojo, con la MISMA guarda: el mismo chequeo que el menú y el mismo bloque de
// encendido que la rama `consume`. Son tres copias a propósito de las mismas líneas, y este candado es el que no las
// deja derivar (`C-retroceso-unico`, más arriba y sin tocar, vigila las dos primeras). Rojo antes del arreglo.
// `lineas` y `bloqueDeEncendido` son copias exactas de las del describe de los candados del quick 261118-kat, que no
// se toca.

describe('UP-doble — el candado del arreglo, antes del arreglo (quick 261118-pjd)', () => {
  /** Las líneas de código de una región, sin sangría y sin las vacías que dejan los comentarios quitados. */
  const lineas = (region: string) =>
    region
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l !== '')

  /** Desde `consumoEnVuelo = true` hasta el `}` que cierra el `catch` (incluidos los dos). */
  const bloqueDeEncendido = (region: string): string[] => {
    const ls = lineas(region)
    const desde = ls.indexOf('consumoEnVuelo = true')
    if (desde === -1) return []
    const captura = ls.findIndex((l, i) => i > desde && l.startsWith('} catch'))
    if (captura === -1) return []
    const cierre = ls.findIndex((l, i) => i > captura && l === '}')
    return cierre === -1 ? [] : ls.slice(desde, cierre + 1)
  }

  /** Desde la primera línea que nombra `consumoEnVuelo` hasta la anterior a la que empieza con `const actual`. */
  const chequeoEnVuelo = (region: string): string[] => {
    const ls = lineas(region)
    const desde = ls.findIndex((l) => l.includes('consumoEnVuelo'))
    if (desde === -1) return []
    const hasta = ls.findIndex((l, i) => i > desde && l.startsWith('const actual'))
    return hasta === -1 ? [] : ls.slice(desde, hasta)
  }

  it('C-retroceso-unico-rama: consumeOwnedBranchEntry chequea el consumo en vuelo como el menú y enciende la guarda con las MISMAS líneas que la rama consume', () => {
    const fuente = sinComentarios(read('lib/panel-history.ts'))
    const rama = cuerpoDe(fuente, 'export function consumeOwnedBranchEntry(', '): boolean {')
    const menu = cuerpoDe(fuente, 'export function consumeOwnedPanelEntry(', '): boolean {')
    const at = fuente.indexOf('export function applyPanelView({')
    const fin = at === -1 ? -1 : fuente.indexOf('\n}\n', at)
    const ejecutor = at === -1 || fin === -1 ? '' : fuente.slice(at, fin + 2)
    const consume = recorte(ejecutor, "if (action === 'consume') {")
    expect(rama).not.toBe('')
    expect(menu).not.toBe('')
    expect(consume).not.toBe('')
    // El chequeo del consumo en vuelo va antes de las dos guardas, y la guarda ajena antes de la marca de la rama.
    const enVuelo = rama.indexOf('consumoEnVuelo')
    const ajena = rama.indexOf('isForeignOwnedEntry(actual)')
    const marca = rama.indexOf('panelUnderRoute(actual) === null')
    expect(enVuelo).toBeGreaterThan(-1)
    expect(ajena).toBeGreaterThan(enVuelo)
    expect(marca).toBeGreaterThan(ajena)
    // Un solo retroceso, después de las dos guardas.
    expect(rama.split('window.history.back()').length - 1).toBe(1)
    expect(rama.indexOf('window.history.back()')).toBeGreaterThan(marca)
    // El chequeo: no vacío e IGUAL línea por línea al del menú.
    const delMenu = chequeoEnVuelo(menu)
    expect(delMenu.length).toBeGreaterThan(0)
    expect(chequeoEnVuelo(rama)).toEqual(delMenu)
    // El bloque de encendido: no vacío e IGUAL línea por línea al de la rama `consume` del ejecutor.
    const delEjecutor = bloqueDeEncendido(consume)
    expect(delEjecutor.length).toBeGreaterThan(0)
    expect(bloqueDeEncendido(rama)).toEqual(delEjecutor)
  })
})

// ── 12) La familia back() (quick 261119-32l): medidos ANTES de arreglar ──────────────────────────────────────────
// La revisión de verificación del quick 261118-pjd (`261118-pjd-REVIEW.md`) dejó abierta la misma familia que ese quick
// cerró en B1 y en `up`. El dueño decidió el 2026-11-19 cerrarla entera antes del push conjunto (D-01..D-05):
//   · X2 (CR-01 del review): dos toques a un destino de la barra desde Inicio con el aviso de salida armado, antes del
//     recorrido. `consumeOwnedExitSentinel` no lee la guarda del consumo en vuelo: cada toque engancha su segundo paso
//     y retrocede, el primer retroceso consume el sentinel y el segundo la entrada de Inicio. El revisor midió 2
//     retrocesos y `/afuera` (fuera del sitio, la cicatriz 2) con dos empujes; lo correcto es 1, Inicio y UNO.
//   · IN-03 (decidido: UNIFICAR, el último toque gana en las tres ramas de dos pasos y también sobre `up`): hoy B1 se
//     queda con el último toque y el colapso y la salida con todos (CO2 del revisor: `replace /agenda` dos veces).
//     `CO-mixto` mide el defecto que sólo cierra la unificación: un colapso a `/agenda` y después Inicio dejan pedidos a
//     la vez el retroceso a Inicio Y el `replace` a `/agenda`. `CO3-colapso-y-mas`: el colapso y después Más.
//   · S4 (WR-01 del review): con la guarda colgada —un retroceso que el navegador ignoró en silencio—, el guard de
//     cambios sin guardar pide `up` o el colapso después de «Descartar» y el ejecutor le devuelve «se hizo cargo» sin
//     retroceder ni navegar: el gesto queda muerto después de que el dueño aceptó perder su trabajo. Lo correcto es que
//     el guard degrade a la regla de rutas, como con una marca perdida. `descartarYSalir` es EXACTAMENTE el camino
//     inmediato de `confirmLeave` + `ejecutarPlanDeRama` (`components/dashboard/unsaved-changes-guard.tsx`), sin React.
//   · Los dos candados de fuente de D-01/D-02: `C-back-cerrado` (la lista cerrada de retrocesos del panel, atribuidos
//     por declaración de nivel superior, con control anti-cero) y `C-retroceso-unico-salida` (la cuarta copia del
//     chequeo y del bloque de encendido, igual a las otras tres). Rojos por construcción con el código de hoy.
// Cada `esperado` es lo CORRECTO: un ROJO quiere decir que el caso REPRODUCE. `X2-control` y `S4-control` son
// controles y tienen que dar verde con el código de hoy (si no, el simulador no arma el camino y no hay veredicto).
// Los ejecutores son los REALES contra la historia con retroceso ASÍNCRONO. `anotar`, `hechos`, `decidir`,
// `tocarLaBarra` y `queSeIgnora` son copias exactas de las del describe de 261118-pjd, que no se toca.

describe('La familia back() — medidos antes de arreglar (quick 261119-32l)', () => {
  const ID = 7
  const navegaciones: string[] = []

  afterEach(() => {
    drenarPopstateDelStub?.()
    drenarPopstateDelStub = null
    pageshowDelStub = null
    oyentesPageshowDelStub = null
    navegaciones.length = 0
    PB.takeBackLanding()
    PB.applyBranchMarkRequest('__drenaje__')
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  // Las pilas se FABRICAN en cada llamada. ⚠ El stub no tiene hash: en la app el sentinel vive en `/dashboard#salir`,
  // y acá se escribe con URL `/dashboard`. Es lo mismo para la guarda, que compara `pathname + search`.
  const pilaSalida = (): Entrada[] => [
    { url: '/afuera', state: null },
    { url: '/dashboard', state: null },
    { url: '/dashboard', state: PB.panelExitState(ID) },
  ]
  // Una sección de la rama de Más con Más debajo (y Más con Inicio debajo): la barra colapsa desde acá.
  const pilaMas = (): Entrada[] => [
    { url: '/afuera', state: null },
    { url: '/dashboard', state: null },
    { url: '/mas', state: { frjUnder: '/dashboard' } },
    { url: '/web', state: { frjUnder: '/mas' } },
  ]
  // Una sección con la marca de la rama arriba y sin subsección: Inicio desde acá es un `up` solo.
  const pilaSeccion = (): Entrada[] => [
    { url: '/afuera', state: null },
    { url: '/dashboard', state: null },
    { url: '/finances', state: { frjUnder: '/dashboard' } },
  ]

  const anotar = (to: string, modo: 'push' | 'replace') => {
    navegaciones.push(`${modo} ${to}`)
  }
  const hechos = () =>
    PB.branchStackFacts({ estado: window.history.state, id: ID, root: PH.PANEL_ROOT, more: PH.PANEL_MORE })

  /** EXACTAMENTE `decidirDesdeElAterrizaje` del hook (`lib/panel-branch.ts`), sin React. */
  function decidir(href: string): void {
    const desde = window.location.pathname
    const plan = PH.panelBranchPlan({ from: desde, to: href, root: PH.PANEL_ROOT, more: PH.PANEL_MORE, ...hechos() })
    if (plan === 'none') return
    if (plan === 'push' || plan === 'replace') {
      anotar(href, plan)
      return
    }
    const seHizoCargo = PB.runBranchNavigation({
      plan,
      to: href,
      root: PH.PANEL_ROOT,
      more: PH.PANEL_MORE,
      navigate: anotar,
      exitId: ID,
      reDecidir: () => decidir(href),
    })
    if (!seHizoCargo) navegaciones.push(`caida ${href}`)
  }

  /** EXACTAMENTE `handleNavigate` del hook: `false` (y la navegación anotada) con push/replace; si no, el ejecutor. */
  function tocarLaBarra(href: string): boolean {
    const plan = PH.panelBranchPlan({
      from: window.location.pathname,
      to: href,
      root: PH.PANEL_ROOT,
      more: PH.PANEL_MORE,
      ...hechos(),
    })
    if (plan === 'push' || plan === 'replace') {
      anotar(href, plan)
      return false
    }
    return PB.runBranchNavigation({
      plan,
      to: href,
      root: PH.PANEL_ROOT,
      more: PH.PANEL_MORE,
      navigate: anotar,
      exitId: ID,
      reDecidir: () => decidir(href),
    })
  }

  // Un retroceso que el navegador IGNORA EN SILENCIO: ni tira, ni recorre, ni se cuenta.
  const queSeIgnora = () => vi.spyOn(window.history, 'back').mockImplementationOnce(() => {})

  /**
   * EXACTAMENTE el camino inmediato de `confirmLeave` + `ejecutarPlanDeRama` del guard de cambios sin guardar, sin
   * React y sin sentinel sucio: el plan con los cinco hechos de `calcularPlanDeRama` (sin `root`/`more`, como allá),
   * desde la ruta de ahora; `push`/`replace` navegan; el resto va al ejecutor SIN `exitId` ni `reDecidir`, y si se niega,
   * la degradación de siempre: navegar con la regla de rutas.
   */
  function descartarYSalir(href: string): 'push' | 'replace' | 'se-hizo-cargo' | 'degrado' {
    const from = window.location.pathname
    const estado: unknown = window.history.state
    const plan = PH.panelBranchPlan({
      from,
      to: href,
      masDebajo: PH.panelUnderRoute(estado) === PH.PANEL_MORE,
      raizDebajo: PH.panelUnderRoute(estado) === PH.PANEL_ROOT,
      vistaArriba: PH.panelViewEntryParam(estado) !== null && !PH.isForeignOwnedEntry(estado),
      holdsExitSentinel: PH.isExitSentinelOwnedEntry(estado),
    })
    if (plan === 'push' || plan === 'replace') {
      anotar(href, plan)
      return plan
    }
    if (PB.runBranchNavigation({ plan, to: href, navigate: anotar })) return 'se-hizo-cargo'
    anotar(href, PH.panelNavMode({ from, to: href }))
    return 'degrado'
  }

  it('X2-exit-doble: dos toques a un destino de la barra desde Inicio con el aviso armado, antes del recorrido', () => {
    const { pila, actual, procesar } = montarHistoria(pilaSalida(), { backAsincrono: true })
    const s1 = tocarLaBarra('/finances')
    const s2 = tocarLaBarra('/finances')
    procesar()
    const medido = { s1, s2, retrocesos: pila.retrocesos, url: actual().url, navegaciones: [...navegaciones] }
    expect(medido).toEqual({ s1: true, s2: true, retrocesos: 1, url: '/dashboard', navegaciones: ['push /finances'] })
  })

  it('X2-control: un solo toque a un destino de la barra desde Inicio con el aviso armado (el simulador arma la salida)', () => {
    const { pila, actual, procesar } = montarHistoria(pilaSalida(), { backAsincrono: true })
    const s1 = tocarLaBarra('/finances')
    procesar()
    const medido = { s1, retrocesos: pila.retrocesos, url: actual().url, navegaciones: [...navegaciones] }
    expect(medido).toEqual({ s1: true, retrocesos: 1, url: '/dashboard', navegaciones: ['push /finances'] })
  })

  it('X2-destinos: dos toques a destinos DISTINTOS desde Inicio con el aviso armado: gana el último', () => {
    const { pila, actual, procesar } = montarHistoria(pilaSalida(), { backAsincrono: true })
    tocarLaBarra('/finances')
    tocarLaBarra('/clients')
    procesar()
    const medido = { retrocesos: pila.retrocesos, url: actual().url, navegaciones: [...navegaciones] }
    expect(medido).toEqual({ retrocesos: 1, url: '/dashboard', navegaciones: ['push /clients'] })
  })

  it('CO2-doble-colapso: dos toques a /agenda desde una sección de Más, antes del recorrido: un solo reemplazo', () => {
    const { pila, actual, procesar } = montarHistoria(pilaMas(), { backAsincrono: true })
    tocarLaBarra('/agenda')
    tocarLaBarra('/agenda')
    procesar()
    const medido = { retrocesos: pila.retrocesos, url: actual().url, navegaciones: [...navegaciones] }
    expect(medido).toEqual({ retrocesos: 1, url: '/mas', navegaciones: ['replace /agenda'] })
  })

  it('CO-mixto: el colapso a /agenda y después Inicio, antes del recorrido: gana Inicio y no queda un reemplazo colgado', () => {
    const { pila, actual, procesar } = montarHistoria(pilaMas(), { backAsincrono: true })
    tocarLaBarra('/agenda')
    tocarLaBarra(PH.PANEL_ROOT)
    procesar()
    const medido = { retrocesos: pila.retrocesos, url: actual().url, navegaciones: [...navegaciones] }
    expect(medido).toEqual({ retrocesos: 2, url: '/dashboard', navegaciones: [] })
  })

  it('CO3-colapso-y-mas: el colapso a /agenda y después Más, antes del recorrido: gana Más', () => {
    const { pila, actual, procesar } = montarHistoria(pilaMas(), { backAsincrono: true })
    tocarLaBarra('/agenda')
    tocarLaBarra(PH.PANEL_MORE)
    procesar()
    const medido = { retrocesos: pila.retrocesos, url: actual().url, navegaciones: [...navegaciones] }
    expect(medido).toEqual({ retrocesos: 1, url: '/mas', navegaciones: [] })
  })

  it('S4-guard-up: con la guarda colgada por un up ignorado, «Descartar» hacia Inicio degrada a la regla de rutas', () => {
    const { pila, actual, procesar } = montarHistoria(pilaSeccion(), { backAsincrono: true })
    queSeIgnora()
    tocarLaBarra(PH.PANEL_ROOT)
    const p = descartarYSalir(PH.PANEL_ROOT)
    procesar()
    const medido = { p, retrocesos: pila.retrocesos, url: actual().url, navegaciones: [...navegaciones] }
    expect(medido).toEqual({ p: 'degrado', retrocesos: 0, url: '/finances', navegaciones: ['push /dashboard'] })
  })

  it('S4-guard-colapso: con la guarda colgada por un colapso ignorado, «Descartar» hacia /agenda degrada a la regla de rutas', () => {
    const { pila, procesar } = montarHistoria(pilaMas(), { backAsincrono: true })
    queSeIgnora()
    tocarLaBarra('/agenda')
    const p = descartarYSalir('/agenda')
    procesar()
    // Las navegaciones se copian ANTES del drenaje del `afterEach`, que dispara el segundo paso que quedó enganchado.
    const medido = { p, retrocesos: pila.retrocesos, navegaciones: [...navegaciones] }
    expect(medido).toEqual({ p: 'degrado', retrocesos: 0, navegaciones: ['replace /agenda'] })
  })

  it('S4-control: sin guarda colgada, «Descartar» hacia Inicio desde una sección sube con un retroceso (el simulador arma el up)', () => {
    const { pila, actual, procesar } = montarHistoria(pilaSeccion(), { backAsincrono: true })
    const p = descartarYSalir(PH.PANEL_ROOT)
    procesar()
    const medido = { p, retrocesos: pila.retrocesos, url: actual().url, navegaciones: [...navegaciones] }
    expect(medido).toEqual({ p: 'se-hizo-cargo', retrocesos: 1, url: '/dashboard', navegaciones: [] })
  })

  // ── Los dos candados de fuente (D-01 / D-02) ──
  // `lineas`, `bloqueDeEncendido` y `chequeoEnVuelo` son copias exactas de las del describe de UP-doble, que no se toca.

  /** Las líneas de código de una región, sin sangría y sin las vacías que dejan los comentarios quitados. */
  const lineas = (region: string) =>
    region
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l !== '')

  /** Desde `consumoEnVuelo = true` hasta el `}` que cierra el `catch` (incluidos los dos). */
  const bloqueDeEncendido = (region: string): string[] => {
    const ls = lineas(region)
    const desde = ls.indexOf('consumoEnVuelo = true')
    if (desde === -1) return []
    const captura = ls.findIndex((l, i) => i > desde && l.startsWith('} catch'))
    if (captura === -1) return []
    const cierre = ls.findIndex((l, i) => i > captura && l === '}')
    return cierre === -1 ? [] : ls.slice(desde, cierre + 1)
  }

  /** Desde la primera línea que nombra `consumoEnVuelo` hasta la anterior a la que empieza con `const actual`. */
  const chequeoEnVuelo = (region: string): string[] => {
    const ls = lineas(region)
    const desde = ls.findIndex((l) => l.includes('consumoEnVuelo'))
    if (desde === -1) return []
    const hasta = ls.findIndex((l, i) => i > desde && l.startsWith('const actual'))
    return hasta === -1 ? [] : ls.slice(desde, hasta)
  }

  // Un RETROCESO, en cualquiera de sus formas: una llamada `.back(` o `.go(` (con espacios y `?.` opcionales, también
  // `back?.(`), una desestructuración de `back` o `go` desde `history`, o un acceso por corchetes `history['back']`.
  const RETROCESOS = [
    /\??\.\s*(?:back|go)\s*(?:\?\.)?\s*\(/,
    /\{[^}]*\b(?:back|go)\b[^}]*\}\s*=\s*(?:window\s*(?:\?\.|\.)\s*)?history\b/,
    /history\s*(?:\?\.)?\s*\[\s*['"`](?:back|go)['"`]\s*\]/,
  ]
  const esRetroceso = (linea: string) => RETROCESOS.some((r) => r.test(linea))
  // Una declaración de NIVEL SUPERIOR: en la columna 0, una función (exportada o no, async o no) o un `const`/`let`.
  const DECLARACION = /^(?:export\s+)?(?:(?:async\s+)?function\s*\*?\s*|const\s+|let\s+)([A-Za-z_$][\w$]*)/

  /** Cada línea con un retroceso, atribuida a la última declaración de nivel superior que la precede. */
  const retrocesosPorDeclaracion = (fuente: string): string[] => {
    const encontrados: string[] = []
    let duena = '(nivel superior)'
    for (const linea of fuente.split('\n')) {
      const m = DECLARACION.exec(linea)
      if (m) duena = m[1]
      if (esRetroceso(linea)) encontrados.push(duena)
    }
    return encontrados.sort()
  }

  it('C-back-cerrado: todo retroceso del panel está en la lista cerrada — cuatro en lib/panel-history.ts, cero en lib/panel-branch.ts', () => {
    const historia = retrocesosPorDeclaracion(sinComentarios(read('lib/panel-history.ts')))
    const rama = retrocesosPorDeclaracion(sinComentarios(read('lib/panel-branch.ts')))
    // Control anti-cero: el patrón SÍ ve ese archivo (sus comentarios nombran el retroceso). Si esto diera cero, la
    // lista vacía de abajo no mediría nada.
    const crudoDeLaRama = read('lib/panel-branch.ts').split('\n').filter(esRetroceso).length
    expect(crudoDeLaRama).toBeGreaterThan(0)
    const mensaje =
      'La lista cerrada de D-01 (quick 261119-32l): todo retroceso del panel pasa por la guarda del consumo en vuelo ' +
      '(applyPanelView, consumeOwnedPanelEntry, consumeOwnedBranchEntry, consumeOwnedExitEntry). Un retroceso nuevo ' +
      'tiene que pasar por esa guarda, o agregarse acá con su propio candado.'
    expect({ historia, rama }, mensaje).toEqual({
      historia: ['applyPanelView', 'consumeOwnedBranchEntry', 'consumeOwnedExitEntry', 'consumeOwnedPanelEntry'],
      rama: [],
    })
  })

  it('C-retroceso-unico-salida: consumeOwnedExitEntry chequea el consumo en vuelo y enciende la guarda con las MISMAS líneas que las otras tres, y la consulta repite la condición de llegada', () => {
    const fuente = sinComentarios(read('lib/panel-history.ts'))
    const salida = cuerpoDe(fuente, 'export function consumeOwnedExitEntry(', '): boolean {')
    const menu = cuerpoDe(fuente, 'export function consumeOwnedPanelEntry(', '): boolean {')
    const at = fuente.indexOf('export function applyPanelView({')
    const fin = at === -1 ? -1 : fuente.indexOf('\n}\n', at)
    const ejecutor = at === -1 || fin === -1 ? '' : fuente.slice(at, fin + 2)
    const consume = recorte(ejecutor, "if (action === 'consume') {")
    expect(salida).not.toBe('')
    expect(menu).not.toBe('')
    expect(consume).not.toBe('')
    // El chequeo del consumo en vuelo: no vacío e IGUAL línea por línea al del menú.
    const delMenu = chequeoEnVuelo(menu)
    expect(delMenu.length).toBeGreaterThan(0)
    expect(chequeoEnVuelo(salida)).toEqual(delMenu)
    // La pregunta por la marca, DESPUÉS del chequeo y de leer `actual`; un solo retroceso, después de la pregunta.
    const lectura = salida.indexOf('const actual')
    const marca = salida.indexOf('if (!esNuestra(actual)) return false')
    expect(lectura).toBeGreaterThan(salida.indexOf('consumoEnVuelo'))
    expect(marca).toBeGreaterThan(lectura)
    expect(salida.split('window.history.back()').length - 1).toBe(1)
    expect(salida.indexOf('window.history.back()')).toBeGreaterThan(marca)
    // El bloque de encendido: no vacío e IGUAL línea por línea al de la rama `consume` del ejecutor.
    const delEjecutor = bloqueDeEncendido(consume)
    expect(delEjecutor.length).toBeGreaterThan(0)
    expect(bloqueDeEncendido(salida)).toEqual(delEjecutor)
    // La consulta de sólo lectura repite la MISMA condición de llegada del menú, y no suelta ni enciende nada.
    const lineaDeLlegada = lineas(menu).find((l) => l.startsWith('if (') && l.endsWith(') return true'))
    expect(lineaDeLlegada).toBeDefined()
    const condicion = (lineaDeLlegada ?? '').slice('if ('.length, -') return true'.length)
    expect(condicion).not.toBe('')
    const consulta = cuerpoDe(fuente, 'export function consumoEnVueloDesdeArriba(', '): boolean {')
    expect(consulta).not.toBe('')
    expect(consulta).toContain(`consumoEnVuelo && (${condicion})`)
    expect(consulta).not.toContain('soltarConsumo')
    expect(consulta).not.toContain('consumoEnVuelo =')
    // Y el dueño del sentinel delega: el cuerpo de `consumeOwnedExitSentinel` es UNA línea.
    const delSentinel = cuerpoDe(sinComentarios(read('lib/panel-branch.ts')), 'export function consumeOwnedExitSentinel(', '): boolean {')
    expect(lineas(delSentinel).slice(1, -1)).toEqual(['return consumeOwnedExitEntry((estado) => isPanelExitEntry(estado, id))'])
  })
})

// ── 12) R3-WR-01 y R2-IN-04 (quick 261124-q68): medidos ANTES de arreglar ─────────────────────────────────
// Los dos pendientes de lógica de historial que v0.31 dejó en `deferred-items.md` (Phase 4):
//   · R3-WR-01 (`261119-32l-REVIEW.md` WR-01, y su simulador `sim4`): `applyPanelView` corta con la guarda
//     del consumo en vuelo SIN el chequeo de llegada (state Y URL) que ya tienen sus tres hermanas. Si un
//     retroceso queda colgado —el navegador lo ignora en silencio: ni tira ni recorre— y el dueño se va a
//     OTRA entrada por el sidebar, los tabs y la ficha de esa otra sección quedan muertos. `R1`..`R4` son los
//     cuatro recorridos del review (un retroceso de `up`, de la salida, del menú o del tab, ignorado; después
//     el sidebar a otra entrada; ahí abrir una ficha o tocar un tab): lo correcto es `push`. `R5-misma-entrada`
//     es el residuo (sin moverse, la entrada es la misma: sigue `none`) y `W1-tab` es la no-regresión que
//     mata a una llegada medida sólo por el state (un reemplazo de Next con la MISMA URL en la ventana no
//     suelta la guarda). `C-llegada-ejecutor` es el candado de fuente: el chequeo del ejecutor, igual línea
//     por línea al del menú salvo el valor de retorno.
//   · R2-IN-04 (`04-REVIEW-2.md`): la fila de Clientes le pasa a `applyPanelView` el `from` del RENDER, el
//     mismo defecto que G-04-7 tenía en los tabs (cerrado con `toqueDeTab`): dos toques a la misma fila
//     antes del commit apilan `?c=A` sobre `?c=A`. `IN04-mecanismo` mide el defecto con el ejecutor real y
//     el `from` congelado como lo da hoy el render (verde antes y después: es la medición, no el arreglo).
//     `tocarFila` es el espejo de lo que va a hacer la fila: pide el toque a `toqueDeFicha` —por el
//     namespace `PH`, así su ausencia es rojo de SU caso y no tira el cargador— con la URL de ahora y un
//     resolver que hace lo mismo que el render (la lista ya filtrada por tenant y la redirección de la
//     fusión). Un candado lee su cuerpo.
// Cada `esperado` es lo CORRECTO: un ROJO quiere decir que el caso REPRODUCE. Los ejecutores son los REALES
// contra la historia con retroceso ASÍNCRONO. `anotar`, `hechos`, `decidir`, `tocarLaBarra`, `queSeIgnora`,
// `nextReemplaza`, `lineas` y `chequeoEnVuelo` son copias exactas de las de los describes de 261118-pjd y
// 261119-32l, que no se tocan.

describe('R3-WR-01 y R2-IN-04 — medidos antes de arreglar (quick 261124-q68)', () => {
  const ID = 7
  const navegaciones: string[] = []

  afterEach(() => {
    drenarPopstateDelStub?.()
    drenarPopstateDelStub = null
    pageshowDelStub = null
    oyentesPageshowDelStub = null
    navegaciones.length = 0
    PB.takeBackLanding()
    PB.applyBranchMarkRequest('__drenaje__')
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  // Las pilas se FABRICAN en cada llamada: la identidad del state de cada entrada es la de ESE caso.
  const pilaFin = (): Entrada[] => [
    { url: '/afuera', state: null },
    { url: '/dashboard', state: null },
    { url: '/finances', state: { frjUnder: '/dashboard' } },
    { url: '/finances?tab=ventas', state: { frjView: 'tab' } },
  ]
  const pilaSeccion = (): Entrada[] => [
    { url: '/afuera', state: null },
    { url: '/dashboard', state: null },
    { url: '/finances', state: { frjUnder: '/dashboard' } },
  ]
  // ⚠ El stub no tiene hash: en la app el sentinel vive en `/dashboard#salir`, acá con URL `/dashboard`.
  const pilaSalida = (): Entrada[] => [
    { url: '/afuera', state: null },
    { url: '/dashboard', state: null },
    { url: '/dashboard', state: PB.panelExitState(ID) },
  ]
  // El listado de clientes con Inicio debajo, sin ficha abierta.
  const pilaListado = (): Entrada[] => [
    { url: '/dashboard', state: null },
    { url: '/clients', state: { frjUnder: '/dashboard' } },
  ]

  const anotar = (to: string, modo: 'push' | 'replace') => {
    navegaciones.push(`${modo} ${to}`)
  }
  const hechos = () =>
    PB.branchStackFacts({ estado: window.history.state, id: ID, root: PH.PANEL_ROOT, more: PH.PANEL_MORE })

  /** EXACTAMENTE `decidirDesdeElAterrizaje` del hook (`lib/panel-branch.ts`), sin React. */
  function decidir(href: string): void {
    const desde = window.location.pathname
    const plan = PH.panelBranchPlan({ from: desde, to: href, root: PH.PANEL_ROOT, more: PH.PANEL_MORE, ...hechos() })
    if (plan === 'none') return
    if (plan === 'push' || plan === 'replace') {
      anotar(href, plan)
      return
    }
    const seHizoCargo = PB.runBranchNavigation({
      plan,
      to: href,
      root: PH.PANEL_ROOT,
      more: PH.PANEL_MORE,
      navigate: anotar,
      exitId: ID,
      reDecidir: () => decidir(href),
    })
    if (!seHizoCargo) navegaciones.push(`caida ${href}`)
  }

  /** EXACTAMENTE `handleNavigate` del hook: `false` (y la navegación anotada) con push/replace; si no, el ejecutor. */
  function tocarLaBarra(href: string): boolean {
    const plan = PH.panelBranchPlan({
      from: window.location.pathname,
      to: href,
      root: PH.PANEL_ROOT,
      more: PH.PANEL_MORE,
      ...hechos(),
    })
    if (plan === 'push' || plan === 'replace') {
      anotar(href, plan)
      return false
    }
    return PB.runBranchNavigation({
      plan,
      to: href,
      root: PH.PANEL_ROOT,
      more: PH.PANEL_MORE,
      navigate: anotar,
      exitId: ID,
      reDecidir: () => decidir(href),
    })
  }

  // Un retroceso que el navegador IGNORA EN SILENCIO: ni tira, ni recorre, ni se cuenta.
  const queSeIgnora = () => vi.spyOn(window.history, 'back').mockImplementationOnce(() => {})

  // El commit de una transición de Next dentro de la ventana del recorrido: el `HistoryUpdater`
  // (`app-router.js:38-67`) reemplaza la entrada con el state de ahora esparcido (conserva `frjView`) y la
  // `canonicalUrl` del árbol que confirma, que en el flujo medido es la misma: la URL NO cambia, la identidad sí.
  const nextReemplaza = () => window.history.replaceState({ ...(window.history.state as object), __NA: true }, '')

  // El sidebar a OTRA entrada, como lo escribe el router de Next: un state nuevo con `__NA` y la URL de la sección.
  const sidebarReemplaza = (url: string) => window.history.replaceState({ __NA: true }, '', url)
  const sidebarEmpuja = (url: string) => window.history.pushState({ __NA: true }, '', url)

  // ── R3-WR-01 ──

  it('R1: un up ignorado, el sidebar reemplaza a /clients y ahí se abre una ficha ⇒ empuja', () => {
    const { actual } = montarHistoria(pilaSeccion(), { backAsincrono: true })
    queSeIgnora()
    tocarLaBarra(PH.PANEL_ROOT)
    sidebarReemplaza('/clients')
    const a = applyPanelView({ cause: 'user-open', param: 'c', from: null, to: 'A' })
    const medido = { a, url: actual().url }
    expect(medido).toEqual({ a: 'push', url: '/clients?c=A' })
  })

  it('R2: la salida ignorada, el sidebar empuja /finances y ahí se toca un tab ⇒ empuja', () => {
    const { actual } = montarHistoria(pilaSalida(), { backAsincrono: true })
    queSeIgnora()
    tocarLaBarra('/finances')
    sidebarEmpuja('/finances')
    const a = applyPanelView({ cause: 'user-open', param: 'tab', from: null, to: 'ventas' })
    // Se copia ANTES del drenaje del `afterEach`, que dispara el segundo paso que quedó enganchado.
    const medido = { a, url: actual().url }
    expect(medido).toEqual({ a: 'push', url: '/finances?tab=ventas' })
  })

  it('R3: el menú ignorado, el sidebar reemplaza a /settings y ahí se toca un tab ⇒ empuja', () => {
    const { actual } = montarHistoria(pilaFin(), { backAsincrono: true })
    queSeIgnora()
    PH.consumeOwnedPanelEntry()
    sidebarReemplaza('/settings')
    const a = applyPanelView({ cause: 'user-open', param: 'tab', from: null, to: 'seguridad' })
    const medido = { a, url: actual().url }
    expect(medido).toEqual({ a: 'push', url: '/settings?tab=seguridad' })
  })

  it('R4: el tab por defecto ignorado, el sidebar reemplaza a /clients y ahí se abre una ficha ⇒ empuja', () => {
    const { actual } = montarHistoria(pilaFin(), { backAsincrono: true })
    queSeIgnora()
    tocar(TABS_FINANZAS, 'appointments')
    sidebarReemplaza('/clients')
    const a = applyPanelView({ cause: 'user-open', param: 'c', from: null, to: 'A' })
    const medido = { a, url: actual().url }
    expect(medido).toEqual({ a: 'push', url: '/clients?c=A' })
  })

  it('R5-misma-entrada (el residuo): el tab por defecto ignorado y, SIN moverse, Egresos ⇒ none', () => {
    const { pila, actual } = montarHistoria(pilaFin(), { backAsincrono: true })
    queSeIgnora()
    tocar(TABS_FINANZAS, 'appointments')
    const a = tocar(TABS_FINANZAS, 'expenses')
    const medido = { a, retrocesos: pila.retrocesos, url: actual().url }
    expect(medido).toEqual({ a: 'none', retrocesos: 0, url: '/finances?tab=ventas' })
  })

  it('W1-tab (no regresión): el tab por defecto, un reemplazo de Next con la MISMA URL y el default otra vez ⇒ un solo retroceso', () => {
    const { pila, actual, procesar } = montarHistoria(pilaFin(), { backAsincrono: true })
    const a1 = tocar(TABS_FINANZAS, 'appointments')
    nextReemplaza()
    const a2 = tocar(TABS_FINANZAS, 'appointments')
    procesar()
    const medido = { a1, a2, retrocesos: pila.retrocesos, url: actual().url }
    expect(medido).toEqual({ a1: 'consume', a2: 'none', retrocesos: 1, url: '/finances' })
  })

  /** Las líneas de código de una región, sin sangría y sin las vacías que dejan los comentarios quitados. */
  const lineas = (region: string) =>
    region
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l !== '')

  /** Desde la primera línea que nombra `consumoEnVuelo` hasta la anterior a la que empieza con `const actual`. */
  const chequeoEnVuelo = (region: string): string[] => {
    const ls = lineas(region)
    const desde = ls.findIndex((l) => l.includes('consumoEnVuelo'))
    if (desde === -1) return []
    const hasta = ls.findIndex((l, i) => i > desde && l.startsWith('const actual'))
    return hasta === -1 ? [] : ls.slice(desde, hasta)
  }

  it('C-llegada-ejecutor: el chequeo del consumo en vuelo de applyPanelView es el del menú salvo el valor de retorno, y va antes de holding', () => {
    const fuente = sinComentarios(read('lib/panel-history.ts'))
    const menu = cuerpoDe(fuente, 'export function consumeOwnedPanelEntry(', '): boolean {')
    const at = fuente.indexOf('export function applyPanelView({')
    const fin = at === -1 ? -1 : fuente.indexOf('\n}\n', at)
    const ejecutor = at === -1 || fin === -1 ? '' : fuente.slice(at, fin + 2)
    expect(menu).not.toBe('')
    expect(ejecutor).not.toBe('')
    const delMenu = chequeoEnVuelo(menu)
    expect(delMenu.length).toBeGreaterThan(0)
    expect(delMenu.filter((l) => l.endsWith(') return true')).length).toBe(1)
    const esperado = delMenu.map((l) => (l.endsWith(') return true') ? l.slice(0, -'return true'.length) + "return 'none'" : l))
    expect(chequeoEnVuelo(ejecutor)).toEqual(esperado)
    const ls = lineas(ejecutor)
    const ultimaDelChequeo = ls.indexOf(esperado[esperado.length - 1])
    const holding = ls.findIndex((l) => l.startsWith('const holding ='))
    expect(holding).toBeGreaterThan(-1)
    expect(ultimaDelChequeo).toBeGreaterThan(-1)
    expect(ultimaDelChequeo).toBeLessThan(holding)
  })

  // ── R2-IN-04 ──

  // La lista de la pantalla, ya filtrada por tenant (`page.tsx`): lo que no está acá no se muestra.
  const LISTA = ['A', 'B', 'kept']
  const enLaLista = (pedido: string): string | null => (LISTA.includes(pedido) ? pedido : null)

  /**
   * EXACTAMENTE lo que hace la fila de la lista (`clients-client.tsx`): el toque con la URL de ahora (el MISMO
   * helper que llama la pantalla; un candado lee este cuerpo), la causa del destino y el ejecutor.
   */
  function tocarFila(id: string, resolver: (pedido: string) => string | null = enLaLista) {
    const toque = PH.toqueDeFicha({ search: window.location.search, param: 'c', to: id, resolver })
    return applyPanelView({ cause: 'user-open', param: 'c', from: toque.from, to: toque.to })
  }

  /** Corre un toque y, si tira (el helper todavía no existe), devuelve el motivo: así el rojo muestra el número. */
  const intentar = (f: () => unknown): unknown => {
    try {
      return f()
    } catch (e) {
      return `tiro: ${e instanceof Error ? e.message : String(e)}`
    }
  }

  it('candado del espejo: el tocarFila de ESTA suite pide el toque a toqueDeFicha con la URL de ahora', () => {
    const cuerpo = cuerpoDe(read('test/panel-tabs.test.ts'), 'function tocarFila(', '= enLaLista) {')
    expect(cuerpo).not.toBe('')
    expect(cuerpo).toContain('toqueDeFicha(')
    expect(cuerpo).toContain('window.location.search')
  })

  it('IN04-mecanismo (la medición del defecto): dos toques con el from congelado del render apilan ?c=A sobre ?c=A', () => {
    const { pila, actual } = montarHistoria(pilaListado())
    const a1 = applyPanelView({ cause: 'user-open', param: 'c', from: null, to: 'A' })
    const a2 = applyPanelView({ cause: 'user-open', param: 'c', from: null, to: 'A' })
    const conA = pila.entradas.filter((e) => e.url === '/clients?c=A').length
    window.history.back()
    const medido = { a1, a2, conA, trasUnAtras: actual().url }
    expect(medido).toEqual({ a1: 'push', a2: 'push', conA: 2, trasUnAtras: '/clients?c=A' })
  })

  it('IN04-doble: dos toques a la misma fila ⇒ push, none, y un atrás vuelve al listado', () => {
    const { pila, actual } = montarHistoria(pilaListado())
    const a1 = intentar(() => tocarFila('A'))
    const a2 = intentar(() => tocarFila('A'))
    const entradas = pila.entradas.length
    window.history.back()
    const medido = { a1, a2, entradas, trasUnAtras: actual().url }
    expect(medido).toEqual({ a1: 'push', a2: 'none', entradas: 3, trasUnAtras: '/clients' })
  })

  it('IN04-a-b: con ?c=A arriba, dos toques a B ⇒ push, none, y un atrás vuelve a ?c=A', () => {
    const { actual } = montarHistoria([...pilaListado(), { url: '/clients?c=A', state: { frjView: 'c' } }])
    const a1 = intentar(() => tocarFila('B'))
    const a2 = intentar(() => tocarFila('B'))
    window.history.back()
    const medido = { a1, a2, trasUnAtras: actual().url }
    expect(medido).toEqual({ a1: 'push', a2: 'none', trasUnAtras: '/clients?c=A' })
  })

  it('IN04-fusion: con ?c=dup absorbida por kept, tocar kept ⇒ none (el from sale resuelto como en el render)', () => {
    montarHistoria([...pilaListado(), { url: '/clients?c=dup', state: { frjView: 'c' } }])
    const fusion = (pedido: string) => enLaLista(pedido === 'dup' ? 'kept' : pedido)
    const a = intentar(() => tocarFila('kept', fusion))
    expect({ a }).toEqual({ a: 'none' })
  })

  it('IN04-ajeno: con ?c=ghost que no está en la lista, tocar A ⇒ push (from null, igual que el render)', () => {
    const { actual } = montarHistoria([...pilaListado(), { url: '/clients?c=ghost', state: null }])
    const a = intentar(() => tocarFila('A'))
    const medido = { a, url: actual().url }
    expect(medido).toEqual({ a: 'push', url: '/clients?c=A' })
  })

  it('toqueDeFicha: sin c, con c vacío o con un pedido que no resuelve ⇒ from null; el to es siempre el pedido', () => {
    expect(typeof (PH as Record<string, unknown>).toqueDeFicha).toBe('function')
    const nada = () => null
    expect(PH.toqueDeFicha({ search: '', param: 'c', to: 'A', resolver: enLaLista })).toEqual({ from: null, to: 'A' })
    expect(PH.toqueDeFicha({ search: '?tab=x', param: 'c', to: 'A', resolver: enLaLista })).toEqual({ from: null, to: 'A' })
    expect(PH.toqueDeFicha({ search: '?c=', param: 'c', to: 'A', resolver: enLaLista })).toEqual({ from: null, to: 'A' })
    expect(PH.toqueDeFicha({ search: '?c=x', param: 'c', to: 'B', resolver: nada })).toEqual({ from: null, to: 'B' })
    expect(PH.toqueDeFicha({ search: '?c=B', param: 'c', to: 'A', resolver: enLaLista })).toEqual({ from: 'B', to: 'A' })
  })
})
