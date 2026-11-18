import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { resolveViewParam, applyPanelView, panelHistoryAction } from '@/lib/panel-history'
// ⚠ El namespace se importa A PROPÓSITO (molde de `lib/panel-history.test.ts`): `panelTabCause` se
// pide como `PH.panelTabCause` y no como import nombrado, para que antes de existir el rojo sea el de
// la ASERCIÓN y no el del cargador.
import * as PH from '@/lib/panel-history'
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
 */
function montarHistoria(inicio: Entrada[], indice = inicio.length - 1) {
  const pila = { entradas: [...inicio], indice, retrocesos: 0 }
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
      if (pila.indice > 0) pila.indice--
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
  vi.stubGlobal('window', { history, location })
  return { pila, actual }
}

/** EXACTAMENTE lo que hace el handler del tab en la pantalla: slug actual, destino, causa, ejecutor. */
function tocar(grupo: PanelTabGroup, value: unknown) {
  const desde = resolveTab({ grupo, param: new URLSearchParams(window.location.search).get(TAB_PARAM) }).slug
  const destino = tabSlug({ grupo, value })
  if (!destino.ok) return 'none'
  return applyPanelView({ cause: PH.panelTabCause({ from: desde, to: destino.slug }), param: TAB_PARAM, from: desde, to: destino.slug })
}

/** EXACTAMENTE lo que hace el efecto de reconciliación de la pantalla (sin la memoria: una vuelta). */
function sanear(grupo: PanelTabGroup) {
  const enLaUrl = new URLSearchParams(window.location.search).get(TAB_PARAM)
  const v = resolveViewParam({ param: enLaUrl, resolvedTo: resolveTab({ grupo, param: enLaUrl }).slug })
  if (!v.reconcile || v.cause === null) return 'none'
  return applyPanelView({ cause: v.cause, param: TAB_PARAM, from: enLaUrl, to: v.to })
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
      expect(cuerpo).toContain('tabSlug(')
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
