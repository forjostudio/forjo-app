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
    expect(pagina).toContain('<Suspense fallback={null}>')
    expect(pagina).toContain(".eq('owner_id', user.id)")
    expect(pagina).not.toContain('searchParams')
  })
})
