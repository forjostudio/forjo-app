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
 */
function montarHistoria(inicio: Entrada[], opciones: { backAsincrono?: boolean } = {}) {
  const pila = { entradas: [...inicio], indice: inicio.length - 1, retrocesos: 0, oyentes: 0 }
  const oyentes: { fn: () => void; once: boolean }[] = []
  const cola: number[] = []
  const popstate = () => {
    for (const o of [...oyentes]) {
      if (o.once) oyentes.splice(oyentes.indexOf(o), 1)
      o.fn()
    }
    pila.oyentes = oyentes.length
  }
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
    if (tipo !== 'popstate') return
    oyentes.push({ fn, once: op?.once === true })
    pila.oyentes = oyentes.length
  }
  const removeEventListener = (tipo: string, fn: () => void) => {
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
  return applyPanelView({ cause: 'programmatic', param: TAB_PARAM, from: params.get(TAB_PARAM), to: 'integraciones', drop: ['mp', 'google'] })
}

describe('el simulador de pila — el applyPanelView REAL contra una historia falsa', () => {
  afterEach(() => {
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
  ]) {
    it(`G-04-8: ${url} → Integraciones limpia sin agregar entradas ni retroceder, y Datos responde`, () => {
      const { pila, actual } = montarHistoria([{ url: '/afuera', state: null }, { url, state: { __NA: true } }])
      volverDelOAuth()
      const q = new URLSearchParams(window.location.search)
      expect(`${url}: ${q.has('mp') || q.has('google')}`).toBe(`${url}: false`)
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

  it('la página: Suspense, el negocio por owner_id y SIN searchParams (el tab no decide qué se lee)', () => {
    const pagina = sinComentarios(read(PAGINA))
    // G-04-6 (plan 04-06): el boundary tiene un NODO mientras suspende —un div vacío con la clase del contenedor
    // raíz de FinancesClient—; con el fallback nulo el handler de scroll de Next deja pendiente el scroll de la
    // navegación blanda y el primer toque de un tab lo ejecuta (medido en `.planning/debug/finanzas-primer-toque-scroll.md`).
    expect(pagina).toContain('<Suspense fallback={<div className="space-y-6 max-w-5xl" aria-busy="true" />}>')
    expect(pagina).not.toContain('fallback={null}')
    expect(pagina).toContain(".eq('owner_id', user.id)")
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
    expect(efecto).toContain("drop: ['mp', 'google']")
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
    expect(espejo).toContain("drop: ['mp', 'google']")
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
    const guarda = region.indexOf("if (consumoEnVuelo) return 'none'")
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
