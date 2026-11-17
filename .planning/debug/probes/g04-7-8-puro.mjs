#!/usr/bin/env node
// ── Sonda PURA de G-04-7 (doble toque) y G-04-8 (OAuth traba los tabs de Negocio), 2026-11-17 ──────────
//
// SIN navegador, SIN server y SIN turno de pantalla: corre el `applyPanelView`/`resolveTab` REALES
// (lib/panel-history.ts y lib/panel-tabs.ts importados tal cual, type-stripping de Node 24) contra una
// historia simulada con la semántica del navegador: pushState/replaceState cambian `location` SÍNCRONO,
// el "render" (lo que `useSearchParams()` le dio al último commit) sólo cambia con `commit()`, y `back()`
// queda en cola hasta `procesar()`. El handler y el efecto del OAuth están copiados de las pantallas tal
// como están en c934ea5. Registro: `.planning/debug/doble-toque-tab.md` y `oauth-traba-tabs-negocio.md`.
//
// Uso: node .planning/debug/probes/g04-7-8-puro.mjs [raíz del repo]

import { pathToFileURL } from 'node:url'

const REPO = process.argv[2] ?? process.cwd()
const PH = await import(pathToFileURL(`${REPO}/lib/panel-history.ts`).href)
const PT = await import(pathToFileURL(`${REPO}/lib/panel-tabs.ts`).href)
const { applyPanelView, panelTabCause } = PH
const { resolveTab, tabSlug, TABS_FINANZAS, TABS_NEGOCIO, TAB_PARAM } = PT

/** Historia con la semántica del navegador: push/replace cambian location SÍNCRONO; back() queda en cola. */
function montar(inicio) {
  const pila = { entradas: inicio.map((e) => ({ ...e })), indice: inicio.length - 1, backsPedidos: 0, cola: 0 }
  const actual = () => pila.entradas[pila.indice]
  const partir = (url) => {
    const q = url.indexOf('?')
    return q === -1 ? { pathname: url, search: '' } : { pathname: url.slice(0, q), search: url.slice(q) }
  }
  const history = {
    get state() { return actual().state },
    pushState(state, _t, url) {
      pila.entradas = pila.entradas.slice(0, pila.indice + 1)
      pila.entradas.push({ url: url ?? actual().url, state })
      pila.indice++
    },
    replaceState(state, _t, url) { pila.entradas[pila.indice] = { url: url ?? actual().url, state } },
    back() { pila.backsPedidos++; pila.cola++ },
  }
  const location = {
    get pathname() { return partir(actual().url).pathname },
    get search() { return partir(actual().url).search },
  }
  globalThis.window = { history, location }
  // El "render": lo que `useSearchParams()` le dio al último commit.
  const render = { search: location.search }
  const commit = () => { render.search = location.search }
  // El recorrido del navegador (Chromium computa desde la entrada pendiente: dos back en cola = -2).
  const procesar = () => { while (pila.cola > 0) { pila.cola--; if (pila.indice > 0) pila.indice-- } }
  const foto = () => `[${pila.entradas.map((e, i) => (i === pila.indice ? `*${e.url}` : e.url)).join(', ')}] backs=${pila.backsPedidos}`
  return { pila, actual, render, commit, procesar, foto }
}

// ── G-04-7 ──────────────────────────────────────────────────────────────────────────────────────
/** EXACTAMENTE `alElegirTab` de finances-client.tsx:275-281 HOY: el from sale del render. */
function tocarDesdeRender(h, value) {
  const tabResuelto = resolveTab({ grupo: TABS_FINANZAS, param: new URLSearchParams(h.render.search).get(TAB_PARAM) })
  // Base UI (TabsTab.onClick): `if (active) return` contra el value controlado del último commit.
  if (tabResuelto.value === value) return 'no-op(active)'
  const destino = tabSlug({ grupo: TABS_FINANZAS, value })
  if (!destino.ok) return 'none'
  const to = destino.slug
  return applyPanelView({ cause: panelTabCause({ from: tabResuelto.slug, to }), param: TAB_PARAM, from: tabResuelto.slug, to })
}
/** La variante del fix de WR-02: el from sale de window.location (lo que hace el `tocar` del simulador de la suite). */
function tocarDesdeLocation(h, value) {
  const visible = resolveTab({ grupo: TABS_FINANZAS, param: new URLSearchParams(h.render.search).get(TAB_PARAM) })
  if (visible.value === value) return 'no-op(active)'
  const from = resolveTab({ grupo: TABS_FINANZAS, param: new URLSearchParams(window.location.search).get(TAB_PARAM) }).slug
  const destino = tabSlug({ grupo: TABS_FINANZAS, value })
  if (!destino.ok) return 'none'
  const to = destino.slug
  return applyPanelView({ cause: panelTabCause({ from, to }), param: TAB_PARAM, from, to })
}

const BASE_FIN = [{ url: '/dashboard', state: null }, { url: '/finances', state: { frjUnder: '/dashboard' } }]
for (const [nombre, tocar] of [['render (HOY)', tocarDesdeRender], ['location (fix WR-02)', tocarDesdeLocation]]) {
  console.log(`\n== G-04-7, from desde ${nombre}`)
  {
    const h = montar(BASE_FIN)
    const a = tocar(h, 'sales'); const b = tocar(h, 'sales'); h.commit()
    console.log(`E1 Turnos→Ventas x2 sin commit: ${a}, ${b} :: ${h.foto()}`)
  }
  {
    const h = montar(BASE_FIN)
    const a = tocar(h, 'sales'); const b = tocar(h, 'expenses'); h.commit()
    console.log(`E2 Turnos→Ventas→Egresos sin commit: ${a}, ${b} :: ${h.foto()}`)
  }
  {
    const h = montar([...BASE_FIN, { url: '/finances?tab=ventas', state: { frjView: 'tab' } }]); h.commit()
    const a = tocar(h, 'appointments'); const b = tocar(h, 'appointments'); h.procesar(); h.commit()
    console.log(`E3 Ventas→Turnos x2 antes del recorrido: ${a}, ${b} :: ${h.foto()}`)
  }
  {
    const h = montar([...BASE_FIN, { url: '/finances?tab=ventas', state: { frjView: 'tab' } }]); h.commit()
    const a = tocar(h, 'appointments'); h.procesar(); const b = tocar(h, 'appointments'); h.commit()
    console.log(`E4 Ventas→Turnos x2, recorrido hecho sin commit: ${a}, ${b} :: ${h.foto()} estado_de_/finances=${JSON.stringify(h.actual().state)}`)
  }
}

// ── G-04-8 ──────────────────────────────────────────────────────────────────────────────────────
/** El render de settings-client.tsx:1008-1019 + 1042 con isNegocio = true. */
function renderNegocio(search) {
  const sp = new URLSearchParams(search)
  const vueltaDeOAuth = sp.get('mp') !== null || sp.get('google') !== null
  const tabNegocio = resolveTab({ grupo: TABS_NEGOCIO, param: sp.get(TAB_PARAM) })
  return { vueltaDeOAuth, tabNegocio, tabValue: vueltaDeOAuth ? 'integraciones' : tabNegocio.value }
}
/** El efecto de settings-client.tsx:1108-1128 (sin el toast). */
function efectoOAuth() {
  const params = new URLSearchParams(window.location.search)
  const mp = params.get('mp')
  const google = params.get('google')
  if (!mp && !google) return 'salió-sin-escribir'
  return applyPanelView({ cause: 'programmatic', param: TAB_PARAM, from: params.get(TAB_PARAM), to: 'integraciones', drop: ['mp', 'google'] })
}
/** Base UI + `alElegirTab` de settings-client.tsx:1029-1036 (from = tabNegocio.slug del render). */
function tocarNegocio(h, value) {
  const r = renderNegocio(h.render.search)
  if (r.tabValue === value) return 'no-op(active)'
  const destino = tabSlug({ grupo: TABS_NEGOCIO, value })
  if (!destino.ok) return 'none'
  const to = destino.slug
  return applyPanelView({ cause: panelTabCause({ from: r.tabNegocio.slug, to }), param: TAB_PARAM, from: r.tabNegocio.slug, to })
}

console.log('\n== G-04-8 (Negocio)')
for (const entrada of [
  '/negocio?mp=connected',
  '/negocio?mp=',
  '/negocio?tab=integraciones&mp=connected',
  '/negocio?google=',
  '/negocio?tab=integraciones&google=connected',
  '/negocio?tab=integraciones&mp=',
  '/negocio?tab=cobros&mp=connected',
]) {
  const h = montar([{ url: '/afuera', state: null }, { url: entrada, state: { __NA: true } }]); h.commit()
  const r0 = renderNegocio(h.render.search)
  const ef = efectoOAuth(); h.commit()
  const r1 = renderNegocio(h.render.search)
  console.log(`\n${entrada}\n  1er render: muestra=${r0.tabValue} vuelta=${r0.vueltaDeOAuth}\n  efecto: ${ef} → url=${h.actual().url} muestra=${r1.tabValue}`)
  for (const t of ['business', 'cobros', 'notificaciones', 'integraciones', 'business']) {
    const acc = tocarNegocio(h, t); h.procesar(); h.commit()
    console.log(`  toque ${t.padEnd(14)} → ${String(acc).padEnd(13)} url=${h.actual().url.padEnd(40)} muestra=${renderNegocio(h.render.search).tabValue} :: ${h.foto()}`)
  }
}

console.log('\n== Agenda (IN-03)')
for (const entrada of ['/agenda?google=connected', '/agenda?google=']) {
  const h = montar([{ url: '/afuera', state: null }, { url: entrada, state: { __NA: true } }])
  const g = new URLSearchParams(window.location.search).get('google')
  const ef = !g ? 'salió-sin-escribir' : applyPanelView({ cause: 'stale', param: 'google', from: g, to: null })
  console.log(`${entrada} → efecto ${ef} → url=${h.actual().url} (el render de Agenda no lee 'google')`)
}
