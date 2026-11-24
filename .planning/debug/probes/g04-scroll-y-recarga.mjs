#!/usr/bin/env node
// ── La sonda de G-04-6 y G-04-9 (UAT de la Phase 4 de panel-nav, 2026-11-17) ─────────────────────
//
// QUE MIDE, en la app real (el `next dev` que levanta esta misma sonda, en un Chrome de verdad por CDP):
//
//   · G-04-6 (`finanzas-primer-toque-scroll`): el `scrollY` de la pagina justo ANTES y justo DESPUES del
//     primer y del segundo toque de un tab de Finanzas, con los tabs debajo del pliegue, por cada camino
//     de entrada (Mas, la tarjeta de Inicio, el sidebar de escritorio, la recarga dura, la re-entrada en
//     la misma sesion), y el de Negocio con el borde de arriba fuera de la pantalla (la prediccion (c) de
//     WR-01). Junto con el numero graba CADA escritura de scroll de la pagina —el setter de `scrollTop`
//     sobre `<html>`/`<body>`, `scrollTo`/`scroll`/`scrollBy`, `scrollIntoView` y un `focus()` que mueva
//     el scroll— con su PILA DE JS: es lo que NOMBRA quien llevo la pagina arriba. Y un MutationObserver
//     del contenedor de la pagina (`main > div.grow`) que dice si la pagina hizo commit VACIA al entrar
//     (el `fallback={null}` del Suspense de la pagina).
//   · IN-02 (emulado, declarado como tal; recorrido `IN02-refresh-corto`): carga dura de `/negocio`, toque en
//     Integraciones (pushState con el arbol viejo), borde de arriba fuera, y `window.next.router.refresh()`, a
//     390x480 para que Integraciones desborde. NO es el boton de desconectar (no hay cuenta conectada en
//     local); es el MISMO router y el mismo reductor de refresh.
//
// LAS CORRIDAS de la sesion del 2026-11-17 y lo que cerraron estan en `.planning/debug/finanzas-primer-toque-scroll.md`
// (G-04-6, incluido el experimento temporal del fallback, revertido) y `.planning/debug/b1-tras-recarga.md` (G-04-9).
//   · G-04-9 (`b1-tras-recarga`): Mas -> Negocio -> Cobros -> tocar Inicio, con y sin una recarga antes
//     del toque; la pila cruda y normalizada, el hash, la marca de la entrada, los documentos nuevos,
//     los `popstate`, cada llamada a la historia (con su pila) y el aviso; despues, un atras de la
//     interfaz.
//
// EL ARNES es el de `panel-exit-en-la-app.mjs`, COPIADO (esa sonda corre su `main()` al cargarse y no se
// puede importar): el mismo servidor en el 3031, el mismo Chrome en el 9335, el mismo canal de
// diagnostico, el mismo login sembrado, el mismo atras de la interfaz (`chrome.tabs.goBack`) y las mismas
// primitivas de toque (`tocarEnLaBarra`, `tocarEnlace`, `tocarTab`, con la conversion al viewport VISUAL).
//
// COMO SE CORRE (siempre por el turno de pantalla: levanta servidor y navegador):
//
//   node scripts/con-turno.mjs node .planning/debug/probes/g04-scroll-y-recarga.mjs [ids] [etiqueta] [modo]
//
//   ids: lista separada por coma (sin ella, todos). etiqueta: texto libre que se imprime (p. ej. la
//   variante de la pagina que se midio). modo: `hipotesis` (por omision) o `tras-el-fix` (ver abajo). La
//   sonda imprime ademas la linea del Suspense de `app/(dashboard)/finances/page.tsx`, de `negocio/page.tsx` y
//   de `settings/page.tsx` con su huella, para que el registro diga QUE paginas se midieron. La linea es la
//   primera que abre el boundary y NO es un comentario: el comentario de una pagina puede nombrar el boundary
//   y lo que importa es el codigo, no la prosa.
//
//   Sin navegador (no hace falta el turno): `--autotest` juzga el clasificador del toque con los numeros medidos, y
//   `--reclasificar <log>...` aplica el clasificador actual a los toques de un log guardado (ver `clasificarToque`).
//
// MODO tras-el-fix (plan 04-06, G-04-6): juzga cada recorrido contra su `esperado_tras_el_fix`, escrito y
// commiteado ANTES de la primera corrida que lo juzga (la de las paginas sin tocar, que tiene que dar rojo). Lo que
// afirma: en los cinco recorridos de G-04-6 ningun toque de tab lleva la pagina al inicio (`salto_toque*: no`) ni
// tiene una escritura de scroll cuya pila nombre el handler de scroll de Next (`next_toque*: no`); en Negocio,
// lo mismo en el primer toque con el borde de arriba fuera, y ninguna escritura de Next en el segundo.
// `vacio_al_entrar` y `vacio_al_reentrar` quedan AFUERA a proposito: la corrida 6 del debug midio que con el
// fallback con nodo el contenedor sigue con cero hijos VISIBLES (el div del fallback tiene alto 0), asi que esa
// clave no es lo que el arreglo afirma (el arreglo afirma que HAY un nodo mientras suspende, no que se vea).
// `IN02-refresh-corto` y los `B1-*` no llevan `esperado_tras_el_fix` (IN-02 diferido; G-04-9 no se planifica):
// pedirlos en este modo es un error del instrumento. La primera linea de cada recorrido es `OK  <id>` o
// `FALLA <id>` (el formato que cuentan los gates del repo) y el veredicto dice cuantos coinciden con lo esperado
// tras el fix; la sonda sale con 1 si no coinciden todos. Los `esperado_si_HA` son el REGISTRO del diagnostico
// (`.planning/debug/finanzas-primer-toque-scroll.md`) y no se tocan: el modo `hipotesis` los sigue juzgando igual.
//
// MODO obs-G1 (quick 261118-jdq): los recorridos `G1-*` JUZGAN `recorte_por_alto` (en el resto de los recorridos
// es informativo). Necesitan un mes con >= 10 turnos y 0 ventas y 0 egresos, que buscan retrocediendo con el boton
// real «Mes anterior» de Finanzas (datos locales, sin escribir en la base). Su `esperado_si_HA` es el ROJO (el
// codigo sin el alto minimo de los paneles) y su `esperado_tras_el_fix` es el arreglo (decision del dueno, opcion A,
// 2026-11-18: cada panel de los tabs de Finanzas con el alto de la pantalla como minimo). La sonda imprime ademas la
// linea `finances-client.tsx huella=... paneles con alto minimo: N` para que el log diga que variante se midio.
//
// MODO R2-WR-01 (quick 261118-kat): el recorrido `K1-bfcache-cruce` mide si la guarda de consumo en vuelo de
// `applyPanelView` queda ENCENDIDA cuando el retroceso del consumo cruza a otro documento y la pagina vuelve despues
// de la bfcache con «adelante» (llega `pageshow` con `persisted`, no `popstate`): si queda, ningun tab responde. El
// cruce se FUERZA: una carga dura de `/finances?tab=ventas` encima de una carga dura de `/finances` (dos documentos)
// y la marca de tab escrita por la sonda sobre la entrada de arriba, porque WR-04 (`.planning/debug/b1-tras-recarga.md`)
// midio que en Chrome 157 una recarga NO deja la entrada de abajo en otro documento. Su `esperado_si_HA` es el
// DEFECTO (el tab no responde despues de volver de la cache) y su `esperado_tras_el_fix` exige el mismo cruce y la
// misma vuelta con el tab respondiendo. Un `NO-COINCIDE` en modo `hipotesis` es un VEREDICTO (el caso no reproduce,
// con su motivo: no cruzo, no volvio de la cache o volvio y el tab respondio), no un error del instrumento.
//
// MODO /clients (quick 261124-q68): los recorridos `CL-ficha-movil` y `CL-ficha-escritorio` miden si `/clients`
// tiene el mecanismo de G-04-6 (el `fallback={null}` de su `<Suspense>`): entrada BLANDA a `/clients` en un documento
// nuevo (el chunk de `ClientsClient` sin cargar), la CONDICION armada por la sonda (el borde de arriba del primer nodo
// de la pagina fuera de la pantalla, si el documento scrollea; la lista a la mitad de su scroll propio) y un click REAL
// en una fila. Miden si al abrir la ficha la pagina salto (`scrollY` o el `scrollTop` de la lista, este solo si la lista
// se ve antes y despues) y si alguna escritura de scroll nombra el handler de Next. `condicion` dice si se pudo armar:
// `inalcanzable` (el documento no scrollea) NO es un «no salto», es que la condicion no existio. `vacio_al_entrar` es
// informativo (dice si la pagina hizo commit vacia al entrar, lo que desmiente el comentario de `clients/page.tsx`).
// Sin escribir en la base. La sonda imprime ademas la linea del Suspense de `clients/page.tsx` con su huella.
// No cierra: el telefono real, Safari de iOS, y el build de produccion.
//
// MODO ancho de Finanzas (quick 261124-q68): el recorrido `D-finanzas-ancho` mide el desborde horizontal de Finanzas
// por CDP (`Emulation.setDeviceMetricsOverride`, el viewport emulado de verdad) a 360/375/390/430 (movil, 844 de alto,
// escala 3) y 1280x800 (escritorio), en un documento que NACE en `/finances`, en los tres tabs y en dos meses (el actual
// y uno con >= 10 turnos, retrocediendo con el boton real, sin escribir en la base). Por medicion: `clientWidth`,
// `scrollWidth`, `innerWidth`, `visualViewport` y los CULPABLES (el mas externo de cada cadena que pasa el borde, sin
// recortados ni fijos). En escritorio, una huella por tab (`huella_escritorio_<tab>=`, los rectangulos de `main` en el
// mes actual) para afirmar que un arreglo movil no toco un pixel del escritorio. Guarda una captura a 390 en
// `$SONDA_CAPTURAS` (o el temporal): `fin-390-antes.png` en `hipotesis`, `fin-390-despues.png` en `tras-el-fix`.
// No cierra: el telefono real, Safari de iOS, el build de produccion.
//
// QUE NO CIERRA: Chrome de Android y Safari de iOS (esto es Chrome de escritorio headless con emulacion
// movil), y el build de PRODUCCION (las variables publicas se incrustan en el build y el Supabase local
// vive solo en el entorno de desarrollo: un build de produccion moveria dos variables a la vez).
// Para obs-G1: el telefono real (la UAT del dueno va con R2-WR-01, despues del push conjunto).
// Para R2-WR-01 (K1): Safari de iOS, Android real, la pestana descartada y restaurada por el sistema, y el build de produccion.

import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, readFileSync, writeFileSync, createWriteStream } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// ── Configuracion (la de panel-exit-en-la-app.mjs) ───────────────────────────────────────────────
const PUERTO_APP = 3031
const PUERTO_CDP = 9335
let ORIGEN = `http://127.0.0.1:${PUERTO_APP}`
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const REPO = process.cwd()
const ROOT = '/dashboard'
const AFUERA = 'data:text/html,<title>afuera</title>afuera'
const EMAIL = 'test@forjo.local'
const CLAVE = 'Forjo1234!'

const dormir = (ms) => new Promise((r) => setTimeout(r, ms))

// ── El servidor de Next (copiado) ────────────────────────────────────────────────────────────────
async function puertoLibre(puerto, tope = 1500) {
  try {
    await fetch(`http://127.0.0.1:${puerto}/`, { signal: AbortSignal.timeout(tope) })
    return false
  } catch {
    return true
  }
}

function levantarNext(logPath) {
  const log = createWriteStream(logPath)
  const hijo = spawn(process.execPath, [join(REPO, 'node_modules/next/dist/bin/next'), 'dev', '-p', String(PUERTO_APP), '-H', '127.0.0.1'], {
    cwd: REPO,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1', BROWSER: 'none' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  hijo.stdout.pipe(log)
  hijo.stderr.pipe(log)
  return hijo
}

async function esperarServidor() {
  const tope = Date.now() + 180_000
  while (Date.now() < tope) {
    try {
      const r = await fetch(`${ORIGEN}/login`, { signal: AbortSignal.timeout(60_000) })
      if (r.status < 500) return r.status
    } catch { /* todavia no levanto */ }
    await dormir(1000)
  }
  throw new Error(`el servidor de Next no respondio en ${ORIGEN} en 180 s`)
}

/**
 * ⚠ EL ENTORNO (corridas 1 y 4, 2026-11-17): dos de cuatro `next dev` recien levantados respondieron `GET /login 404`
 * con un arbol de rutas INCOMPLETO (el `.next/dev/types/routes.d.ts` que generaron lista solo `/`, `/[slug]` y
 * `/suspendido`: ninguna pagina anidada), sin ningun cambio en `app/`; un servidor nuevo despues anduvo. Por eso la
 * sonda exige `/login` en 200 (con espera) y, si no llega, reinicia SU servidor. Nunca toca la app ni next.config.ts.
 */
async function esperarLogin200(tope = 45_000) {
  const fin = Date.now() + tope
  let ultimo = null
  while (Date.now() < fin) {
    try { const r = await fetch(`${ORIGEN}/login`, { signal: AbortSignal.timeout(60_000) }); ultimo = r.status; if (r.status === 200) return 200 } catch { /* todavia no */ }
    await dormir(2000)
  }
  return ultimo
}

async function servidorExistente() {
  try {
    const lock = JSON.parse(readFileSync(join(REPO, '.next/dev/lock'), 'utf8'))
    if (!Number.isInteger(lock.pid) || !Number.isInteger(lock.port)) return null
    try { process.kill(lock.pid, 0) } catch { return null }
    const origen = `http://127.0.0.1:${lock.port}`
    if (await puertoLibre(lock.port, 60_000)) return null
    return { pid: lock.pid, port: lock.port, origen }
  } catch {
    return null
  }
}

function matarArbol(hijo) {
  if (!hijo || hijo.exitCode !== null) return
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(hijo.pid), '/T', '/F'], { stdio: 'ignore' })
  else { try { process.kill(-hijo.pid, 'SIGKILL') } catch { try { hijo.kill('SIGKILL') } catch { /* ya murio */ } } }
}

// ── CDP (copiado) ────────────────────────────────────────────────────────────────────────────────
function conectar(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url)
    let siguienteId = 1
    const pendientes = new Map()
    const oyentes = new Map()
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.id && pendientes.has(msg.id)) {
        const { ok, fail } = pendientes.get(msg.id)
        pendientes.delete(msg.id)
        if (msg.error) fail(new Error(`${msg.error.message} (${JSON.stringify(msg.error)})`))
        else ok(msg.result)
      } else if (msg.method && oyentes.has(msg.method)) {
        for (const fn of oyentes.get(msg.method)) fn(msg.params)
      }
    })
    ws.addEventListener('error', () => reject(new Error(`no se pudo abrir el WebSocket de CDP: ${url}`)))
    ws.addEventListener('open', () => {
      resolve({
        enviar(metodo, params = {}) {
          const id = siguienteId++
          ws.send(JSON.stringify({ id, method: metodo, params }))
          return new Promise((ok, fail) => pendientes.set(id, { ok, fail }))
        },
        en(evento, fn) {
          if (!oyentes.has(evento)) oyentes.set(evento, [])
          oyentes.get(evento).push(fn)
        },
        cerrar() { try { ws.close() } catch { /* ya cerrado */ } },
      })
    })
  })
}

async function descubrirTarget() {
  for (let intento = 0; intento < 80; intento++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PUERTO_CDP}/json/list`)
      const page = (await r.json()).find((t) => t.type === 'page' && t.webSocketDebuggerUrl)
      if (page) return page
    } catch { /* todavia no levanto */ }
    await dormir(125)
  }
  throw new Error(`Chrome no publico ningun target en el puerto ${PUERTO_CDP}`)
}

async function evaluar(cdp, expresion) {
  const r = await cdp.enviar('Runtime.evaluate', { expression: expresion, returnByValue: true, awaitPromise: true })
  if (r.exceptionDetails) throw new Error(`la pagina tiro: ${r.exceptionDetails.text} ${r.exceptionDetails.exception?.description ?? ''}`)
  return r.result.value
}

// ── El canal de diagnostico (copiado tal cual de panel-exit-en-la-app.mjs) ───────────────────────
const SCRIPT_DEL_CANAL = `(() => {
  const canal = []
  const pushOriginal = Array.prototype.push
  const doc = Math.random().toString(36).slice(2, 8)
  canal.push = function (...r) {
    for (const x of r) { try { __forjoSondaReporta(JSON.stringify({ doc, ...x })) } catch {} }
    return pushOriginal.apply(this, r)
  }
  globalThis.__forjoPanelDiag = canal
  const estadoTexto = () => { try { const s = history.state; if (!s || typeof s !== 'object') return JSON.stringify(s); const o = { claves: Object.keys(s).sort() }; for (const k of Object.keys(s)) if (k.startsWith('frj')) o[k] = s[k]; return JSON.stringify(o) } catch { return '?' } }
  if (location.protocol.startsWith('http')) {
    canal.push({ tipo: 'sonda-documento-nuevo', ts: Date.now(), ruta: location.pathname, hash: location.hash, estado: estadoTexto() })
    addEventListener('popstate', () => canal.push({ tipo: 'sonda-popstate', ts: Date.now(), ruta: location.pathname, hash: location.hash, estado: estadoTexto() }))
    addEventListener('click', (e) => canal.push({ tipo: 'sonda-click', ts: Date.now(), ruta: location.pathname, hash: location.hash, estado: estadoTexto(), defaultPrevented: e.defaultPrevented, isActive: navigator.userActivation ? navigator.userActivation.isActive : null }))
  }
})()`

// ── Los instrumentos NUEVOS de esta sonda, instalados al nacer cada documento ─────────────────────
// (1) La historia: cada pushState/replaceState/back/go/forward, con la URL pedida, la marca frj* y los
//     primeros marcos de su pila; espejado por el canal, asi que sobrevive a un documento que se va.
// (2) pageshow/pagehide con `persisted` (si un aterrizaje sale del bfcache).
// (3) El scroll: cada escritura de scroll de la pagina con su pila (en `__sondaScroll`, del documento)
//     y cada cambio de `scrollY` del documento. `__sondaPropio` marca las escrituras de la SONDA.
const SCRIPT_DE_LOS_INSTRUMENTOS = `(() => {
  if (!location.protocol.startsWith('http')) return
  const canal = () => globalThis.__forjoPanelDiag
  const estadoTexto = () => { try { const s = history.state; if (!s || typeof s !== 'object') return JSON.stringify(s); const o = {}; for (const k of Object.keys(s)) if (k.startsWith('frj')) o[k] = s[k]; return JSON.stringify(o) } catch { return '?' } }
  const pila = (n) => { const t = Error.stackTraceLimit; Error.stackTraceLimit = 80; const s = (new Error().stack || '').split('\\n').slice(2).map((l) => l.trim().replace(/^at /, '').replace(/ \\(.*\\)$/, '')); Error.stackTraceLimit = t; return s.slice(0, n).join(' < ') }
  for (const metodo of ['pushState', 'replaceState', 'back', 'go', 'forward']) {
    const original = History.prototype[metodo]
    History.prototype[metodo] = function (...args) {
      try { const c = canal(); if (Array.isArray(c)) c.push({ tipo: 'sonda-historia', metodo, ts: Date.now(), ruta: location.pathname + location.search, hash: location.hash, urlArg: metodo.endsWith('State') ? String(args[2] ?? '') : '', estado: estadoTexto(), pila: pila(7) }) } catch {}
      return original.apply(this, args)
    }
  }
  addEventListener('pageshow', (e) => { try { canal()?.push({ tipo: 'sonda-pageshow', persisted: e.persisted, ts: Date.now(), ruta: location.pathname + location.search, hash: location.hash, estado: estadoTexto() }) } catch {} })
  addEventListener('pagehide', (e) => { try { canal()?.push({ tipo: 'sonda-pagehide', persisted: e.persisted, ts: Date.now(), ruta: location.pathname + location.search, hash: location.hash }) } catch {} })
  const log = []
  globalThis.__sondaScroll = log
  globalThis.__sondaPropio = false
  const registrar = (que, en) => { if (log.length < 2000) log.push({ tipo: 'escritura', que, en, t: Math.round(performance.now()), y: Math.round(scrollY), propio: globalThis.__sondaPropio === true, ruta: location.pathname + location.search, pila: pila(12) }) }
  const nombre = (el) => el === window ? 'window' : (el && el.tagName ? el.tagName.toLowerCase() + (el.getAttribute('role') ? '[role=' + el.getAttribute('role') + ']' : '') + (el.id ? '#' + el.id : '') : '?')
  const desc = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop')
  Object.defineProperty(Element.prototype, 'scrollTop', {
    configurable: true,
    enumerable: desc.enumerable,
    get() { return desc.get.call(this) },
    set(v) { if (this === document.documentElement || this === document.body) registrar('scrollTop=' + v, nombre(this)); desc.set.call(this, v) },
  })
  for (const [obj, m] of [[Element.prototype, 'scrollIntoView'], [Element.prototype, 'scrollTo'], [Element.prototype, 'scroll'], [Element.prototype, 'scrollBy'], [window, 'scrollTo'], [window, 'scroll'], [window, 'scrollBy']]) {
    const orig = obj[m]
    obj[m] = function (...a) { let arg = ''; try { arg = JSON.stringify(a) } catch {} registrar(m + '(' + arg + ')', nombre(this)); return orig.apply(this, a) }
  }
  const focusOrig = HTMLElement.prototype.focus
  HTMLElement.prototype.focus = function (...a) { const y0 = scrollY; const r = focusOrig.apply(this, a); if (scrollY !== y0) registrar('focus() movio el scroll ' + Math.round(y0) + '->' + Math.round(scrollY), nombre(this)); return r }
  let ultimoY = null
  addEventListener('scroll', (e) => { if (e.target !== document) return; const y = Math.round(scrollY); if (y !== ultimoY) { if (log.length < 2000) log.push({ tipo: 'scroll', y, t: Math.round(performance.now()) }); ultimoY = y } }, { passive: true, capture: true })
})()`

/** Los registros espejados del canal, en orden de llegada. */
const registros = []

// ── Las primitivas (copiadas de panel-exit-en-la-app.mjs) ─────────────────────────────────────────
async function asentar(desde, tope = 120_000) {
  const fin = Date.now() + tope
  while (Date.now() < fin) {
    const ultimo = registros.slice(desde).filter((r) => r.tipo === 'armado').at(-1)
    if (ultimo && Date.now() - ultimo.llegada > 900) return true
    await dormir(150)
  }
  return false
}

async function navegar(cdp, url) {
  const cargo = new Promise((ok) => {
    const t = setTimeout(ok, 150_000)
    cdp.en('Page.loadEventFired', () => { clearTimeout(t); ok() })
  })
  await cdp.enviar('Page.navigate', { url })
  await cargo
}

async function historial(cdp) {
  const h = await cdp.enviar('Page.getNavigationHistory')
  return {
    indice: h.currentIndex,
    entradas: h.entries.map((e) => (e.url.startsWith('data:') ? '(afuera)' : /^https?:/.test(e.url) && new URL(e.url).hostname === '127.0.0.1' ? new URL(e.url).pathname + new URL(e.url).hash : e.url)),
  }
}

async function foto(cdp) {
  const h = await historial(cdp)
  const pag = await evaluar(cdp, `(() => {
    const s = history.state
    const cont = [...document.querySelectorAll('[role="status"][aria-atomic="true"]')].find((d) => d.querySelector('span.whitespace-nowrap'))
    return {
      url: location.protocol.startsWith('http') ? location.pathname + location.hash : '(afuera)',
      ruta: location.protocol.startsWith('http') ? location.pathname : '(afuera)',
      hash: location.hash,
      estado: s && typeof s === 'object' ? JSON.stringify(Object.fromEntries(Object.entries(s).filter(([k]) => k.startsWith('frj')))) : JSON.stringify(s),
      contenedorDelAviso: Boolean(cont),
      aviso: cont ? cont.textContent.trim() : null,
    }
  })()`)
  return { ...pag, largo: h.entradas.length, indice: h.indice, entradas: h.entradas }
}

function conectarTuberia(hijo) {
  const salida = hijo.stdio[3]
  const entrada = hijo.stdio[4]
  let buffer = ''
  let siguienteId = 1
  const pendientes = new Map()
  entrada.on('data', (d) => {
    buffer += d.toString()
    let i
    while ((i = buffer.indexOf('\0')) >= 0) {
      const msg = JSON.parse(buffer.slice(0, i))
      buffer = buffer.slice(i + 1)
      if (msg.id && pendientes.has(msg.id)) {
        const { ok, fail } = pendientes.get(msg.id)
        pendientes.delete(msg.id)
        if (msg.error) fail(new Error(`${msg.error.message} (${JSON.stringify(msg.error)})`))
        else ok(msg.result)
      }
    }
  })
  return {
    enviar(metodo, params = {}, sessionId) {
      const id = siguienteId++
      salida.write(JSON.stringify({ id, method: metodo, params, ...(sessionId ? { sessionId } : {}) }) + '\0')
      return new Promise((ok, fail) => pendientes.set(id, { ok, fail }))
    },
  }
}

async function prepararAtrasDeLaInterfaz(tuberia, dirExt) {
  writeFileSync(join(dirExt, 'manifest.json'), JSON.stringify({ manifest_version: 3, name: 'sonda-atras', version: '1.0', permissions: ['tabs'], background: { service_worker: 'sw.js' } }))
  writeFileSync(join(dirExt, 'sw.js'), "self.addEventListener('install', () => {})\n")
  const { id: extId } = await tuberia.enviar('Extensions.loadUnpacked', { path: dirExt })
  let sw = null
  for (let i = 0; i < 40 && !sw; i++) {
    const { targetInfos } = await tuberia.enviar('Target.getTargets')
    sw = targetInfos.find((t) => t.type === 'service_worker' && t.url.includes(extId))
    if (!sw) await dormir(150)
  }
  if (!sw) throw new Error('la extension del atras de la interfaz no levanto su service worker')
  const { sessionId } = await tuberia.enviar('Target.attachToTarget', { targetId: sw.targetId, flatten: true })
  const enElSw = async (expr) => {
    const r = await tuberia.enviar('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, sessionId)
    if (r.exceptionDetails) throw new Error(`el service worker tiro: ${r.exceptionDetails.text}`)
    return r.result.value
  }
  let pestanas = null
  let ultimoError = null
  for (let i = 0; i < 40 && pestanas === null; i++) {
    try { pestanas = await enElSw('chrome.tabs.query({}).then((t) => t.map((x) => x.id))') } catch (e) { ultimoError = e; await dormir(250) }
  }
  if (pestanas === null) throw ultimoError
  if (!Array.isArray(pestanas) || pestanas.length !== 1) throw new Error(`se esperaba UNA pestana y hay ${JSON.stringify(pestanas)}`)
  const tabId = pestanas[0]
  return () => enElSw(`chrome.tabs.goBack(${tabId}).then(() => 'ok', (e) => 'rechazo: ' + e)`)
}

let atrasDeLaInterfaz = null

/** El ATRAS DE LA INTERFAZ (chrome.tabs.goBack), como el gesto `interfaz` de la otra sonda. */
async function atras(cdp) {
  const h = await cdp.enviar('Page.getNavigationHistory')
  if (h.currentIndex === 0) return { hubo: false }
  const otroDocumento = new Promise((ok) => {
    const t = setTimeout(() => ok(false), 700)
    cdp.en('Page.loadEventFired', () => { clearTimeout(t); ok(true) })
  })
  const r = await atrasDeLaInterfaz()
  if (r !== 'ok') throw new Error(`el atras de la interfaz fallo: ${r}`)
  const recargo = await otroDocumento
  if (recargo) await dormir(1200)
  return { hubo: true, recargo }
}

async function clickReal(cdp, selector) {
  const rect = await evaluar(cdp, `(() => { const b = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 } })()`)
  await clickEnPunto(cdp, rect)
}

async function clickEnPunto(cdp, punto) {
  for (const type of ['mousePressed', 'mouseReleased']) {
    await cdp.enviar('Input.dispatchMouseEvent', { type, x: punto.x, y: punto.y, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 })
  }
}

async function enviarElLogin(cdp) {
  for (let i = 0; i < 400; i++) {
    const listo = await evaluar(cdp, `(() => { const e = document.getElementById('email'); return Boolean(e && Object.keys(e).some((k) => k.startsWith('__reactProps'))) })()`)
    if (listo) break
    await dormir(250)
  }
  for (const [id, valor] of [['email', EMAIL], ['password', CLAVE]]) {
    await evaluar(cdp, `document.getElementById(${JSON.stringify(id)}).focus()`)
    await cdp.enviar('Input.insertText', { text: valor })
  }
  await clickReal(cdp, 'button[type="submit"]')
}

async function loguearse(cdp) {
  await navegar(cdp, `${ORIGEN}/login`)
  await enviarElLogin(cdp)
  const tope = Date.now() + 120_000
  while (Date.now() < tope) {
    const r = await evaluar(cdp, 'location.pathname').catch(() => null)
    if (r === ROOT) break
    await dormir(300)
  }
  await dormir(1500)
  const f = await foto(cdp)
  if (f.ruta !== ROOT || !f.contenedorDelAviso) throw new Error(`no se pudo llegar a Inicio: ruta=${f.ruta} contenedor_del_aviso=${f.contenedorDelAviso}`)
  console.log(`llegada a Inicio AFIRMADA: ruta=${f.ruta} contenedor_del_aviso=${f.contenedorDelAviso}`)
}

// ⚠ P-1 DE ESTA SONDA (corrida 3, 2026-11-17): la copia literal de `tocarEnLaBarra` tocaba en coordenadas del
// viewport de LAYOUT. En el PRIMER recorrido de las corridas 2 y 3 el toque en Mas «no llego a /mas» y el servidor
// registro `GET /mas` seguido de `GET /finances`: el punto cayo en otra cosa (la tarjeta de Inicio), la misma
// cuarta vuelta del P-1 que el 04-01 cerro en `tocarTab` (el viewport VISUAL desplazado con `mobile: true`). Ahora
// convierte al viewport visual, AFIRMA con `elementFromPoint` que el punto cae en el enlace y, si no llega, dice
// DONDE quedo.
async function tocarEnLaBarra(cdp, href) {
  const desde = registros.length
  const rect = await evaluar(cdp, `(() => { const a = [...document.querySelectorAll('a[href=' + JSON.stringify(${JSON.stringify(href)}) + ']')].find((x) => { const b = x.getBoundingClientRect(); return b.width > 0 && b.height > 0 && b.bottom > innerHeight / 2 }); if (!a) return null; const b = a.getBoundingClientRect(); const cx = b.x + b.width / 2, cy = b.y + b.height / 2; const el = document.elementFromPoint(cx, cy); const vv = globalThis.visualViewport; const e = vv ? vv.scale : 1; return { x: vv ? (cx - vv.offsetLeft) * e : cx, y: vv ? (cy - vv.offsetTop) * e : cy, adentro: Boolean(el && a.contains(el)), dx: vv ? vv.offsetLeft : 0, dy: vv ? vv.offsetTop : 0 } })()`)
  if (!rect) throw new Error(`no hay un destino visible de la barra para ${href}`)
  if (!rect.adentro) throw new Error(`P-1: el punto del destino ${href} de la barra no cae en el enlace (${JSON.stringify(rect)})`)
  if (rect.dx !== 0 || rect.dy !== 0) console.log(`      el viewport visual no es el de layout al tocar ${href} en la barra: desplazamiento=(${rect.dx},${rect.dy})`)
  await clickEnPunto(cdp, rect)
  const tope = Date.now() + 90_000
  while (Date.now() < tope && (await evaluar(cdp, 'location.pathname')) !== href) await dormir(200)
  if ((await evaluar(cdp, 'location.pathname')) !== href) throw new Error(`el toque en ${href} no llego a ${href}: quedo en ${await ubicacion(cdp).catch(() => '?')}`)
  const llegada = registros.length
  await asentar(desde, 60_000)
  if (registros.slice(llegada).every((r) => r.tipo !== 'armado')) await asentar(llegada, 5_000)
}

async function entrarDirecto(cdp) {
  await navegar(cdp, AFUERA)
  await cdp.enviar('Page.resetNavigationHistory')
  const desde = registros.length
  await navegar(cdp, ORIGEN + ROOT)
  await asentar(desde)
  return desde
}

async function tocarSinEsperar(cdp, href) {
  const rect = await evaluar(cdp, `(() => { const a = [...document.querySelectorAll('a[href=' + JSON.stringify(${JSON.stringify(href)}) + ']')].find((x) => { const b = x.getBoundingClientRect(); return b.width > 0 && b.height > 0 && b.bottom > innerHeight / 2 }); if (!a) return null; const b = a.getBoundingClientRect(); const cx = b.x + b.width / 2, cy = b.y + b.height / 2; const el = document.elementFromPoint(cx, cy); const vv = globalThis.visualViewport; const e = vv ? vv.scale : 1; return { x: vv ? (cx - vv.offsetLeft) * e : cx, y: vv ? (cy - vv.offsetTop) * e : cy, adentro: Boolean(el && a.contains(el)) } })()`)
  if (!rect) throw new Error(`no hay un destino visible de la barra para ${href}`)
  if (!rect.adentro) throw new Error(`P-1: el punto del destino ${href} de la barra no cae en el enlace (${JSON.stringify(rect)})`)
  await clickEnPunto(cdp, rect)
}

async function tocarEnlace(cdp, href) {
  const desde = registros.length
  // (corrida 3) centrar UNA vez; despues leer sin mover nada y convertir al viewport VISUAL (el P-1 de tocarTab)
  const centrar = `(() => { const a = [...document.querySelectorAll('a[href=' + JSON.stringify(${JSON.stringify(href)}) + ']')].find((x) => { const b = x.getBoundingClientRect(); return b.width > 0 && b.height > 0 }); if (!a) return false; a.scrollIntoView({ block: 'center' }); return true })()`
  const buscar = `(() => { const a = [...document.querySelectorAll('a[href=' + JSON.stringify(${JSON.stringify(href)}) + ']')].find((x) => { const b = x.getBoundingClientRect(); return b.width > 0 && b.height > 0 }); if (!a) return null; const b = a.getBoundingClientRect(); const cx = b.x + b.width / 2, cy = b.y + b.height / 2; const el = document.elementFromPoint(cx, cy); const vv = globalThis.visualViewport; const e = vv ? vv.scale : 1; return { x: vv ? (cx - vv.offsetLeft) * e : cx, y: vv ? (cy - vv.offsetTop) * e : cy, adentro: Boolean(el && a.contains(el)) } })()`
  if (!(await evaluar(cdp, centrar))) throw new Error(`no hay un enlace visible a ${href}`)
  await dormir(300)
  const rect = await evaluar(cdp, buscar)
  if (!rect || !rect.adentro) throw new Error(`P-1: el punto del enlace a ${href} no cae en el enlace (${JSON.stringify(rect)})`)
  await clickEnPunto(cdp, rect)
  const tope = Date.now() + 90_000
  while (Date.now() < tope && (await evaluar(cdp, 'location.pathname')) !== href) await dormir(200)
  if ((await evaluar(cdp, 'location.pathname')) !== href) throw new Error(`el toque en el enlace a ${href} no llego a ${href}: quedo en ${await ubicacion(cdp).catch(() => '?')}`)
  const llegada = registros.length
  await asentar(desde, 60_000)
  if (registros.slice(llegada).every((r) => r.tipo !== 'armado')) await asentar(llegada, 5_000)
}

async function ubicacion(cdp) {
  return evaluar(cdp, `location.protocol.startsWith('http') ? location.pathname + location.search + location.hash : '(afuera)'`)
}

async function pilaConQuery(cdp) {
  const h = await cdp.enviar('Page.getNavigationHistory')
  return {
    indice: h.currentIndex,
    entradas: h.entries.map((e) => {
      if (e.url.startsWith('data:')) return '(afuera)'
      if (/^https?:/.test(e.url) && new URL(e.url).hostname === '127.0.0.1') { const u = new URL(e.url); return u.pathname + u.search + u.hash }
      return e.url
    }),
  }
}

/** `tocarTab` de panel-exit-en-la-app.mjs, copiado (la posicion quieta y el viewport VISUAL). */
async function tocarTab(cdp, texto) {
  const centrar = `(() => { const t = [...document.querySelectorAll('[role="tab"]')].find((x) => { const b = x.getBoundingClientRect(); return b.width > 0 && b.height > 0 && x.textContent.replace(/\\s+/g, ' ').trim().startsWith(${JSON.stringify(texto)}) }); if (!t) return false; t.scrollIntoView({ block: 'center' }); return true })()`
  const buscar = `(() => { const t = [...document.querySelectorAll('[role="tab"]')].find((x) => { const b = x.getBoundingClientRect(); return b.width > 0 && b.height > 0 && x.textContent.replace(/\\s+/g, ' ').trim().startsWith(${JSON.stringify(texto)}) }); if (!t) return null; const b = t.getBoundingClientRect(); const cx = b.x + b.width / 2, cy = b.y + b.height / 2; const el = document.elementFromPoint(cx, cy); const vv = globalThis.visualViewport; const escala = vv ? vv.scale : 1; const x = vv ? (cx - vv.offsetLeft) * escala : cx; const y = vv ? (cy - vv.offsetTop) * escala : cy; return { x, y, escala, dx: vv ? vv.offsetLeft : 0, dy: vv ? vv.offsetTop : 0, adentro: Boolean(el && t.contains(el)) } })()`
  const seleccionado = `(() => { if (!location.protocol.startsWith('http')) return 'afuera'; const t = [...document.querySelectorAll('[role="tab"][aria-selected="true"]')].find((x) => { const b = x.getBoundingClientRect(); return b.width > 0 && b.height > 0 }); return t && t.textContent.replace(/\\s+/g, ' ').trim().startsWith(${JSON.stringify(texto)}) ? 'si' : 'no' })()`
  for (let intento = 1; intento <= 3; intento++) {
    let punto = null
    let previo = null
    let iguales = 0
    const topeBusqueda = Date.now() + 10_000
    while (Date.now() < topeBusqueda && !(await evaluar(cdp, centrar).catch(() => false))) await dormir(200)
    while (Date.now() < topeBusqueda) {
      const p = await evaluar(cdp, buscar).catch(() => null)
      if (p && p.adentro && previo && Math.abs(p.x - previo.x) < 1 && Math.abs(p.y - previo.y) < 1) iguales++
      else iguales = 0
      if (p && !p.adentro) await evaluar(cdp, centrar).catch(() => false)
      previo = p
      if (iguales >= 2) { punto = p; break }
      await dormir(250)
    }
    if (!punto) throw new Error(`no hay un tab visible que empiece con ${texto}`)
    await clickEnPunto(cdp, punto)
    const tope = Date.now() + (intento < 3 ? 2_000 : 10_000)
    let s = 'no'
    while (Date.now() < tope) {
      s = await evaluar(cdp, seleccionado).catch(() => 'no')
      if (s !== 'no') break
      await dormir(150)
    }
    if (s !== 'no') break
    console.log(`      el toque en el tab ${texto} no lo selecciono (intento ${intento})`)
  }
  await dormir(500)
  return { ubicacion: await ubicacion(cdp) }
}

/**
 * UN SOLO toque en el tab (quick 261118-kat, K1): la misma busqueda que `tocarTab` (posicion quieta en dos lecturas,
 * viewport VISUAL, `adentro` afirmado con `elementFromPoint`) y un unico `clickEnPunto`, sin reintentos y sin esperar a
 * que se seleccione: un tab muerto se mide con un toque, no con tres (los reintentos de `tocarTab` esconderian justo
 * el defecto). Si el tab no aparece, es un P-1 del instrumento.
 */
async function tocarTabUnaVez(cdp, texto) {
  const centrar = `(() => { const t = ${exprTab(texto)}; if (!t) return false; t.scrollIntoView({ block: 'center' }); return true })()`
  const buscar = `(() => { const t = ${exprTab(texto)}; if (!t) return null; const b = t.getBoundingClientRect(); const cx = b.x + b.width / 2, cy = b.y + b.height / 2; const el = document.elementFromPoint(cx, cy); const vv = globalThis.visualViewport; const escala = vv ? vv.scale : 1; return { x: vv ? (cx - vv.offsetLeft) * escala : cx, y: vv ? (cy - vv.offsetTop) * escala : cy, adentro: Boolean(el && t.contains(el)) } })()`
  let punto = null
  let previo = null
  let iguales = 0
  const tope = Date.now() + 10_000
  while (Date.now() < tope && !(await evaluar(cdp, centrar).catch(() => false))) await dormir(200)
  while (Date.now() < tope) {
    const p = await evaluar(cdp, buscar).catch(() => null)
    if (p && p.adentro && previo && Math.abs(p.x - previo.x) < 1 && Math.abs(p.y - previo.y) < 1) iguales++
    else iguales = 0
    if (p && !p.adentro) await evaluar(cdp, centrar).catch(() => false)
    previo = p
    if (iguales >= 2) { punto = p; break }
    await dormir(250)
  }
  if (!punto) throw new Error(`P-1: no hay un tab visible y quieto que empiece con ${texto} (ultima lectura: ${JSON.stringify(previo)})`)
  await clickEnPunto(cdp, punto)
}

function sinIdDeFicha(u) { return u.replace(/([?&]c=)[^&#]*/, '$1*') }
function lugarDe(u) { return u === '(afuera)' ? u : sinIdDeFicha(u.split('#')[0]) }

async function pilaNormalizada(cdp) {
  const p = await pilaConQuery(cdp)
  return p.entradas
    .slice(0, p.indice + 1)
    .filter((e) => e !== '(afuera)')
    .filter((e) => { const i = e.indexOf('#'); return !(i >= 0 && e.slice(i).startsWith('#salir')) })
    .map(sinIdDeFicha)
}

async function avisoArmado(cdp) {
  return evaluar(cdp, `/^#salir(-\\d+)?$/.test(location.hash) ? 'si' : 'no'`)
}

async function hastaCobrosPorMas(cdp) {
  await entrarDirecto(cdp)
  await tocarEnLaBarra(cdp, '/mas')
  await tocarEnlace(cdp, '/negocio')
  await tocarTab(cdp, 'Cobros')
  const u = await ubicacion(cdp)
  if (lugarDe(u) !== '/negocio?tab=cobros') throw new Error(`no se pudo llegar a Cobros por Mas: la URL quedo en ${u}`)
}

async function escritorio(cdp) {
  await cdp.enviar('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false })
}
async function celular(cdp) {
  await cdp.enviar('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
}

// ── Las primitivas NUEVAS: el scroll del toque de un tab (G-04-6) ─────────────────────────────────

/** El tab visible cuyo texto empieza con `texto`, como expresion de pagina (la misma busqueda que `tocarTab`). */
function exprTab(texto) {
  return `[...document.querySelectorAll('[role="tab"]')].find((x) => { const b = x.getBoundingClientRect(); return b.width > 0 && b.height > 0 && x.textContent.replace(/\\s+/g, ' ').trim().startsWith(${JSON.stringify(texto)}) })`
}

/** El primer hijo VISIBLE del contenedor de la pagina: el nodo que mira el handler de scroll de Next. */
const EXPR_PRIMERA = `(() => { const c = document.querySelector('main > div.grow'); return c ? [...c.children].find((h) => h.getBoundingClientRect().height > 0) ?? null : null })()`

/**
 * El MutationObserver del contenedor de la pagina (`main > div.grow`, el `{children}` del layout del panel):
 * graba cada cambio de (hijos, visibles, primer hijo visible, hay tablist) con su tiempo. Lo que dice si la
 * pagina hizo commit VACIA (el `fallback={null}`) durante la entrada.
 */
const OBSERVAR_CONTENEDOR = `(() => {
  const c = document.querySelector('main > div.grow')
  if (!c) return 'sin-contenedor'
  if (globalThis.__sondaObs) globalThis.__sondaObs.disconnect()
  const reg = []
  globalThis.__sondaContenedor = reg
  let ultimo = ''
  const tomar = (momento) => {
    const hijos = [...c.children]
    const vis = hijos.filter((h) => h.getBoundingClientRect().height > 0)
    const f = { hijos: hijos.length, visibles: vis.length, primera: vis[0] ? vis[0].tagName.toLowerCase() + '.' + String(vis[0].className).split(' ').slice(0, 3).join('.') : '(ninguna)', tablist: Boolean(c.querySelector('[role="tablist"]')), ruta: location.pathname + location.search }
    const clave = JSON.stringify(f)
    if (clave === ultimo && momento !== 'inicio') return
    ultimo = clave
    if (reg.length < 400) reg.push({ t: Math.round(performance.now()), momento, ...f })
  }
  tomar('inicio')
  const obs = new MutationObserver(() => tomar('mutacion'))
  obs.observe(c, { childList: true, subtree: true })
  globalThis.__sondaObs = obs
  return 'ok'
})()`

async function leerContenedor(cdp) {
  return evaluar(cdp, `(() => { const r = globalThis.__sondaContenedor || []; if (globalThis.__sondaObs) globalThis.__sondaObs.disconnect(); globalThis.__sondaObs = null; return r })()`)
}

/** Resume el registro del contenedor: ¿hubo un tramo SIN nada visible? cuanto duro? */
function resumenContenedor(reg) {
  const tramos = []
  for (let i = 0; i < reg.length; i++) {
    if (reg[i].visibles === 0) tramos.push({ desde: reg[i].t, hasta: reg[i + 1]?.t ?? null, ruta: reg[i].ruta })
  }
  return {
    vacio_durante_la_entrada: tramos.length > 0 ? 'si' : 'no',
    tramos_vacios_ms: tramos.map((x) => (x.hasta === null ? 'abierto' : x.hasta - x.desde)),
    lineas: reg.map((r) => `t=${r.t} ${r.momento} ruta=${r.ruta} hijos=${r.hijos} visibles=${r.visibles} primera=${r.primera} tablist=${r.tablist}`),
  }
}

/** Espera la pagina QUIETA: el tab `texto` visible y su posicion absoluta igual en 4 lecturas (1,2 s). */
async function esperarTabQuieto(cdp, texto, { tope = 120_000, condicion = 'true' } = {}) {
  const leer = `(() => { const t = ${exprTab(texto)}; if (!t || !(${condicion})) return null; const b = t.getBoundingClientRect(); return Math.round(b.top + scrollY) + '|' + document.documentElement.scrollHeight })()`
  const fin = Date.now() + tope
  let previo = null
  let iguales = 0
  while (Date.now() < fin) {
    const v = await evaluar(cdp, leer).catch(() => null)
    if (v !== null && v === previo) iguales++
    else iguales = 0
    previo = v
    if (iguales >= 3) return v
    await dormir(300)
  }
  throw new Error(`la pagina no quedo quieta con el tab ${texto} visible en ${tope} ms`)
}

/**
 * Lleva el scroll a la posicion del toque, COMO LA SONDA (`__sondaPropio`, asi su escritura se distingue):
 *   · `centro` — el tab al centro del viewport (lo que hace el dueno: scrollear hasta los tabs);
 *   · `borde`  — el primer nodo de la pagina 40 px por encima del viewport, con el tab todavia a la vista
 *                (la prediccion (c) de WR-01, para Negocio, cuyos tabs estan arriba).
 * Espera a que el scroll y el tab queden quietos.
 */
async function posicionar(cdp, texto, modo) {
  const r = await evaluar(cdp, `(() => {
    const t = ${exprTab(texto)}; const p = ${EXPR_PRIMERA}
    if (!t || !p) return { ok: false, motivo: !t ? 'sin-tab' : 'sin-primera' }
    const bt = t.getBoundingClientRect(); const tabAbs = bt.top + scrollY; const pAbs = p.getBoundingClientRect().top + scrollY
    const max = document.documentElement.scrollHeight - innerHeight
    let y = ${JSON.stringify(modo)} === 'centro' ? tabAbs + bt.height / 2 - innerHeight / 2 : pAbs + 40
    y = Math.max(0, Math.min(max, Math.round(y)))
    globalThis.__sondaPropio = true; window.scrollTo(0, y); globalThis.__sondaPropio = false
    return { ok: true, pedido: y, max: Math.round(max), tabAbs: Math.round(tabAbs), primeraAbs: Math.round(pAbs) }
  })()`)
  if (!r.ok) throw new Error(`no se pudo posicionar para tocar ${texto}: ${r.motivo}`)
  let previo = null
  for (let i = 0; i < 20; i++) {
    await dormir(250)
    const v = await evaluar(cdp, `(() => { const t = ${exprTab(texto)}; return Math.round(scrollY) + '|' + (t ? Math.round(t.getBoundingClientRect().top) : 'x') })()`)
    if (v === previo) break
    previo = v
  }
  return r
}

/** Lo que importa del scroll AHORA. */
async function estadoDelScroll(cdp, texto) {
  return evaluar(cdp, `(() => {
    const t = ${exprTab(texto)}; const p = ${EXPR_PRIMERA}; const bt = t ? t.getBoundingClientRect() : null
    const vv = globalThis.visualViewport
    return {
      y: Math.round(scrollY), scrollTop: Math.round(document.documentElement.scrollTop), alto: document.documentElement.scrollHeight, viewport: innerHeight,
      tab_top: bt ? Math.round(bt.top) : null, tab_bottom: bt ? Math.round(bt.bottom) : null,
      primera_top: p ? Math.round(p.getBoundingClientRect().top) : null,
      primera: p ? p.tagName.toLowerCase() + '.' + String(p.className).split(' ').slice(0, 3).join('.') : '(ninguna)',
      vv: vv ? { escala: vv.scale, dx: Math.round(vv.offsetLeft), dy: Math.round(vv.offsetTop) } : null,
      ruta: location.pathname + location.search, marca: globalThis.__sondaScroll ? globalThis.__sondaScroll.length : -1,
    }
  })()`)
}

/**
 * EL CLASIFICADOR del toque, PURO (sin navegador): lo usan `tocarTabMedido`, `--autotest` y `--reclasificar`.
 *
 * `llevo_al_inicio` crudo es el criterio de la corrida 3: el borde de la pagina pasa de afuera (< -20) a >= -2, o
 * `scrollY` arranca > 50 y toca <= 5. ⚠ PLAN 04-06, P-1 DECIDIDO POR EL DUENO («A + control», 2026-11-17): en
 * `N-negocio-borde-movil`, con el arreglo, el primer toque ya no tenia NINGUNA escritura de scroll y aun asi daba
 * `si`: al mostrar Cobros (sin cuenta de MP en local) el documento bajo de 1389 a 844 px (= viewport) y el navegador
 * RECORTO `scrollY` de 187 a 0 sin que nadie escribiera. Eso no es un scroll de Next ni de nadie: es el maximo de
 * scroll que se achico. Regla: es `recorte_por_alto` SOLO si en ese toque no hubo NINGUNA escritura de scroll de la
 * pagina (la lista entera que graba la sonda, no solo las de Next) Y el maximo de scroll posible despues del toque
 * (`alto_despues - viewport_despues`) es menor que `y_antes`. En ese caso `llevo_al_inicio` es `no` y el recorte se
 * imprime aparte como dato informativo (no se juzga). Con cualquier escritura, o si el maximo alcanzaba, manda el
 * criterio crudo. Ningun esperado cambia (ni `esperado_tras_el_fix` ni `esperado_si_HA`).
 */
function clasificarToque({ y_antes, min_durante, primera_top_antes, primera_top_despues, alto_despues, viewport_despues, escrituras }) {
  const borde = primera_top_antes !== null && primera_top_despues !== null && primera_top_antes < -20 && primera_top_despues >= -2
  const crudo = borde || (y_antes > 50 && min_durante <= 5)
  const recorte = escrituras === 0 && alto_despues - viewport_despues < y_antes
  return { llevo_al_inicio: crudo && !recorte ? 'si' : 'no', recorte_por_alto: recorte ? 'si' : 'no', crudo: crudo ? 'si' : 'no' }
}

/**
 * EL TOQUE MEDIDO de un tab: posicion (`centro` o `borde`) → foto de antes → click REAL en el centro del
 * tab convertido al viewport VISUAL (afirmado con `elementFromPoint`) → espera a que quede seleccionado →
 * 1,5 s muestreando `scrollY` cada 100 ms → foto de despues → las escrituras de scroll desde la marca.
 * NO reintenta: un toque que no llega TIRA (P-1: el instrumento no midio lo que dice medir).
 */
async function tocarTabMedido(cdp, texto, { modo = 'centro' } = {}) {
  const pos = await posicionar(cdp, texto, modo)
  const antes = await estadoDelScroll(cdp, texto)
  const punto = await evaluar(cdp, `(() => { const t = ${exprTab(texto)}; if (!t) return null; const b = t.getBoundingClientRect(); const cx = b.x + b.width / 2, cy = b.y + b.height / 2; const el = document.elementFromPoint(cx, cy); const vv = globalThis.visualViewport; const e = vv ? vv.scale : 1; return { x: vv ? (cx - vv.offsetLeft) * e : cx, y: vv ? (cy - vv.offsetTop) * e : cy, adentro: Boolean(el && t.contains(el)) } })()`)
  if (!punto || !punto.adentro) throw new Error(`P-1: el punto del toque no cae adentro del tab ${texto} (${JSON.stringify(punto)})`)
  const t0 = Date.now()
  await clickEnPunto(cdp, punto)
  const sel = `(() => { const t = [...document.querySelectorAll('[role="tab"][aria-selected="true"]')].find((x) => { const b = x.getBoundingClientRect(); return b.width > 0 && b.height > 0 }); return Boolean(t && t.textContent.replace(/\\s+/g, ' ').trim().startsWith(${JSON.stringify(texto)})) })()`
  let seleccionado = false
  const muestras = []
  while (Date.now() - t0 < 5_000) {
    muestras.push(await evaluar(cdp, 'Math.round(scrollY)').catch(() => null))
    seleccionado = await evaluar(cdp, sel).catch(() => false)
    if (seleccionado) break
    await dormir(50)
  }
  const ms = Date.now() - t0
  for (let i = 0; i < 15; i++) { await dormir(100); muestras.push(await evaluar(cdp, 'Math.round(scrollY)').catch(() => null)) }
  const despues = await estadoDelScroll(cdp, texto)
  const log = await evaluar(cdp, `(globalThis.__sondaScroll || []).slice(${antes.marca})`)
  const escrituras = log.filter((x) => x.tipo === 'escritura' && !x.propio)
  const ys = muestras.filter((x) => typeof x === 'number')
  const minimo = Math.min(antes.y, ...ys, despues.y)
  // ⚠ CORRIDA 3 (2026-11-17, declarado en .planning/debug/finanzas-primer-toque-scroll.md): el criterio de la
  // corrida 2 (`salto_al_inicio`, min_y <= 5) suponia y -> 0 y no ve el caso real: la pagina arranca a 115-147 px
  // (header y banners) y Next hace `scrollTop=0` + `scrollIntoView()` del div con `scroll-behavior: smooth`, asi que
  // termina con el div pegado arriba. `llevo_al_inicio` mide ESO (el borde de la pagina pasa de afuera a >= 0) y
  // `escritura_de_next` dice si la escritura salio del handler de scroll de Next. Ningun esperado cambia.
  // ⚠ PLAN 04-06 (P-1, decidido por el dueno): el criterio de arriba ahora lo aplica `clasificarToque`, que descuenta
  // el RECORTE del navegador cuando el documento se achica (ver su comentario). Ningun esperado cambia.
  const cls = clasificarToque({
    y_antes: antes.y, min_durante: minimo, primera_top_antes: antes.primera_top, primera_top_despues: despues.primera_top,
    alto_despues: despues.alto, viewport_despues: despues.viewport, escrituras: escrituras.length,
  })
  const deNext = escrituras.some((e) => e.pila.includes('handlePotentialScroll'))
  return {
    llevo_al_inicio: cls.llevo_al_inicio,
    recorte_por_alto: cls.recorte_por_alto,
    escritura_de_next: deNext ? 'si' : 'no',
    tab: texto,
    modo,
    posicion: pos,
    antes,
    despues,
    seleccionado,
    ms_hasta_seleccionado: ms,
    min_y_durante: minimo,
    delta: despues.y - antes.y,
    salto_al_inicio: antes.y > 50 && minimo <= 5 ? 'si' : 'no',
    se_movio: Math.abs(despues.y - antes.y) > 2 || minimo < antes.y - 2 ? 'si' : 'no',
    escrituras,
    scrolls: log.filter((x) => x.tipo === 'scroll').map((x) => x.y),
  }
}

function imprimirToque(p, nombre, m) {
  console.log(`${p}${nombre}: tab=${m.tab} modo=${m.modo} y_antes=${m.antes.y} y_despues=${m.despues.y} min_durante=${m.min_y_durante} delta=${m.delta} llevo_al_inicio=${m.llevo_al_inicio} escritura_de_next=${m.escritura_de_next} (criterio viejo salto_al_inicio=${m.salto_al_inicio}) se_movio=${m.se_movio} seleccionado=${m.seleccionado} (${m.ms_hasta_seleccionado} ms)`)
  console.log(`${p}   antes: alto=${m.antes.alto} viewport=${m.antes.viewport} tab_top=${m.antes.tab_top} primera_top=${m.antes.primera_top} primera=${m.antes.primera} vv=${JSON.stringify(m.antes.vv)} ruta=${m.antes.ruta}`)
  console.log(`${p}   despues: alto=${m.despues.alto} viewport=${m.despues.viewport} tab_top=${m.despues.tab_top} primera_top=${m.despues.primera_top} ruta=${m.despues.ruta}`)
  if (m.recorte_por_alto === 'si') console.log(`${p}   recorte_por_alto: si (informativo, no se juzga: sin escrituras de scroll en el toque y el maximo de scroll despues, ${m.despues.alto - m.despues.viewport}, es menor que y_antes=${m.antes.y}; el navegador recorto scrollY)`)
  console.log(`${p}   posicion pedida: ${JSON.stringify(m.posicion)}`)
  console.log(`${p}   cambios de scrollY del documento: [${m.scrolls.join(', ')}]`)
  if (m.escrituras.length === 0) console.log(`${p}   escrituras de scroll de la pagina: ninguna`)
  for (const e of m.escrituras) console.log(`${p}   ESCRITURA t=${e.t} ${e.que} en=${e.en} y_en_ese_momento=${e.y} ruta=${e.ruta} pila: ${e.pila}`)
}

/** Las escrituras de scroll que NO son de la sonda en un tramo de la entrada (para ver si la entrada misma scrolleo). */
async function escriturasDesde(cdp, marca) {
  const log = await evaluar(cdp, `(globalThis.__sondaScroll || []).slice(${marca})`)
  return log.filter((x) => x.tipo === 'escritura' && !x.propio)
}
async function marcaDelScroll(cdp) {
  return evaluar(cdp, `globalThis.__sondaScroll ? globalThis.__sondaScroll.length : 0`)
}

/** El click REAL en el enlace visible a `href` adentro de `contenedor` (el sidebar), enganchado por React. */
async function tocarEnlaceDentro(cdp, contenedor, href) {
  const sel = `${contenedor} a[href="${href}"]`
  const buscar = `(() => { const a = [...document.querySelectorAll(${JSON.stringify(sel)})].find((x) => { const b = x.getBoundingClientRect(); return b.width > 0 && b.height > 0 }); if (!a) return null; const b = a.getBoundingClientRect(); const cx = b.x + b.width / 2, cy = b.y + b.height / 2; const vv = globalThis.visualViewport; const e = vv ? vv.scale : 1; return { x: vv ? (cx - vv.offsetLeft) * e : cx, y: vv ? (cy - vv.offsetTop) * e : cy, enganchado: Object.keys(a).some((k) => k.startsWith('__reactProps')) } })()`
  const tope = Date.now() + 10_000
  let punto = null
  while (Date.now() < tope) {
    punto = await evaluar(cdp, buscar).catch(() => null)
    if (punto && punto.enganchado) break
    await dormir(200)
  }
  if (!punto) throw new Error(`P-1: no hay un enlace visible ${sel}`)
  await clickEnPunto(cdp, punto)
  const fin = Date.now() + 90_000
  while (Date.now() < fin && (await evaluar(cdp, 'location.pathname')) !== href) await dormir(200)
  if ((await evaluar(cdp, 'location.pathname')) !== href) throw new Error(`el toque en ${sel} no llego a ${href}`)
}

const COND_FINANZAS = `document.body.innerText.includes('Saldo del mes')`

// ── Las primitivas NUEVAS: B1 tras la recarga (G-04-9) ────────────────────────────────────────────

/** Espera a que la URL quede igual `quieto` ms seguidos (tolera un documento navegando). */
async function asentarUbicacion(cdp, { quieto = 3000, tope = 40_000 } = {}) {
  const fin = Date.now() + tope
  let antes = null
  let desde = Date.now()
  while (Date.now() < fin) {
    const u = await ubicacion(cdp).catch(() => '(navegando)')
    if (u !== antes) { antes = u; desde = Date.now() }
    else if (u !== '(navegando)' && Date.now() - desde >= quieto) return u
    await dormir(200)
  }
  return antes
}

/** Espera a que el destino de la barra a `href` este enganchado por React (hidratado), con tope. */
async function esperarBarraEnganchada(cdp, href, tope = 30_000) {
  const expr = `(() => { const a = [...document.querySelectorAll('a[href=' + JSON.stringify(${JSON.stringify(href)}) + ']')].find((x) => { const b = x.getBoundingClientRect(); return b.width > 0 && b.height > 0 && b.bottom > innerHeight / 2 }); return Boolean(a && Object.keys(a).some((k) => k.startsWith('__reactProps'))) })()`
  const fin = Date.now() + tope
  while (Date.now() < fin) {
    if (await evaluar(cdp, expr).catch(() => false)) return true
    await dormir(200)
  }
  return false
}

async function recargar(cdp) {
  const desde = registros.length
  const cargo = new Promise((ok) => { const t = setTimeout(ok, 150_000); cdp.en('Page.loadEventFired', () => { clearTimeout(t); ok() }) })
  await cdp.enviar('Page.reload', {})
  await cargo
  await asentarUbicacion(cdp, { quieto: 2000 })
  const enganchada = await esperarBarraEnganchada(cdp, ROOT)
  await dormir(1500)
  return { regs: registros.slice(desde), enganchada }
}

async function fotoB1(cdp) {
  const f = await foto(cdp)
  return { u: await ubicacion(cdp), estado: f.estado, aviso_armado: await avisoArmado(cdp), aviso_visible: f.aviso ? 'si' : 'no', pila: await pilaNormalizada(cdp), cruda: await pilaConQuery(cdp) }
}

function imprimirFotoB1(p, paso, f) {
  console.log(`${p}${paso}: url=${f.u} estado=${f.estado} aviso_armado=${f.aviso_armado} aviso_visible=${f.aviso_visible} pila=[${f.pila.join(', ')}] cruda=[${f.cruda.entradas.join(', ')}] actual=${f.cruda.indice}`)
}

function lineaDeRegistro(r) {
  if (r.tipo === 'sonda-historia') return `historia doc=${r.doc} ${r.metodo} en=${r.ruta}${r.hash} urlArg=${r.urlArg || '(vacio)'} estado=${r.estado} pila: ${r.pila}`
  if (r.tipo === 'sonda-documento-nuevo') return `DOCUMENTO-NUEVO doc=${r.doc} ruta=${r.ruta}${r.hash} estado=${r.estado}`
  if (r.tipo === 'sonda-popstate') return `popstate doc=${r.doc} ruta=${r.ruta}${r.hash} estado=${r.estado}`
  if (r.tipo === 'sonda-pageshow' || r.tipo === 'sonda-pagehide') return `${r.tipo.slice(6)} doc=${r.doc} persisted=${r.persisted} ruta=${r.ruta}${r.hash}`
  if (r.tipo === 'sonda-click') return `click doc=${r.doc} ruta=${r.ruta}${r.hash} defaultPrevented=${r.defaultPrevented} isActive=${r.isActive}`
  return `${r.tipo} doc=${r.doc} ruta=${r.ruta ?? ''}${r.hash ?? ''} accion=${r.accion ?? ''}`
}

/** Los registros de un tramo que importan para B1 (sin los de armado repetidos). */
function tramoB1(regs) {
  return regs.filter((r) => ['sonda-historia', 'sonda-documento-nuevo', 'sonda-popstate', 'sonda-pageshow', 'sonda-pagehide', 'sonda-click'].includes(r.tipo))
}

// ── Los recorridos ────────────────────────────────────────────────────────────────────────────────

const RECORRIDOS = [
  {
    id: 'F-blanda-mas-movil',
    titulo: 'G-04-6 movil 390x844: Inicio -> Mas -> Finanzas (BLANDA, primera vez en el documento) -> Ventas -> Egresos; despues Mas -> Finanzas otra vez (re-entrada, misma sesion) -> Ventas',
    async correr(cdp) {
      await celular(cdp)
      await entrarDirecto(cdp)
      await tocarEnLaBarra(cdp, '/mas')
      await evaluar(cdp, OBSERVAR_CONTENEDOR)
      const marcaEntrada = await marcaDelScroll(cdp)
      await tocarEnlace(cdp, '/finances')
      await esperarTabQuieto(cdp, 'Ventas', { condicion: COND_FINANZAS })
      const entrada = resumenContenedor(await leerContenedor(cdp))
      const escriturasEntrada = await escriturasDesde(cdp, marcaEntrada)
      const t1 = await tocarTabMedido(cdp, 'Ventas')
      const t2 = await tocarTabMedido(cdp, 'Egresos')
      // re-entrada en el MISMO documento (el chunk de FinancesClient ya cargado)
      await tocarEnLaBarra(cdp, '/mas')
      await evaluar(cdp, OBSERVAR_CONTENEDOR)
      await tocarEnlace(cdp, '/finances')
      await esperarTabQuieto(cdp, 'Ventas', { condicion: COND_FINANZAS })
      const reentrada = resumenContenedor(await leerContenedor(cdp))
      const t3 = await tocarTabMedido(cdp, 'Ventas')
      return {
        detalle: (p) => {
          console.log(`${p}entrada blanda: contenedor vacio=${entrada.vacio_durante_la_entrada} tramos_ms=${JSON.stringify(entrada.tramos_vacios_ms)}`)
          for (const l of entrada.lineas) console.log(`${p}   ${l}`)
          for (const e of escriturasEntrada) console.log(`${p}   ESCRITURA en la entrada t=${e.t} ${e.que} en=${e.en} y=${e.y} ruta=${e.ruta} pila: ${e.pila}`)
          imprimirToque(p, 'toque 1 (primer toque tras la entrada blanda)', t1)
          imprimirToque(p, 'toque 2 (segundo toque)', t2)
          console.log(`${p}re-entrada: contenedor vacio=${reentrada.vacio_durante_la_entrada} tramos_ms=${JSON.stringify(reentrada.tramos_vacios_ms)}`)
          for (const l of reentrada.lineas) console.log(`${p}   ${l}`)
          imprimirToque(p, 'toque 3 (primer toque tras la RE-entrada)', t3)
        },
        medido: { vacio_al_entrar: entrada.vacio_durante_la_entrada, salto_toque1: t1.llevo_al_inicio, next_toque1: t1.escritura_de_next, salto_toque2: t2.llevo_al_inicio, next_toque2: t2.escritura_de_next, vacio_al_reentrar: reentrada.vacio_durante_la_entrada, salto_toque3_reentrada: t3.llevo_al_inicio, next_toque3_reentrada: t3.escritura_de_next },
        esperado_si_HA: { vacio_al_entrar: 'si', salto_toque1: 'si', next_toque1: 'si', salto_toque2: 'no', next_toque2: 'no', vacio_al_reentrar: 'no', salto_toque3_reentrada: 'no', next_toque3_reentrada: 'no' },
        esperado_tras_el_fix: { salto_toque1: 'no', next_toque1: 'no', salto_toque2: 'no', next_toque2: 'no', salto_toque3_reentrada: 'no', next_toque3_reentrada: 'no' },
      }
    },
  },
  {
    id: 'F-directa-movil',
    titulo: 'G-04-6 movil 390x844, prediccion (a): recarga DURA de /finances (documento nuevo) -> Ventas -> Egresos',
    async correr(cdp) {
      await celular(cdp)
      await navegar(cdp, AFUERA)
      await cdp.enviar('Page.resetNavigationHistory')
      await navegar(cdp, ORIGEN + '/finances')
      await esperarTabQuieto(cdp, 'Ventas', { condicion: COND_FINANZAS })
      const t1 = await tocarTabMedido(cdp, 'Ventas')
      const t2 = await tocarTabMedido(cdp, 'Egresos')
      return {
        detalle: (p) => { imprimirToque(p, 'toque 1 (primer toque tras la carga dura)', t1); imprimirToque(p, 'toque 2', t2) },
        medido: { salto_toque1: t1.llevo_al_inicio, next_toque1: t1.escritura_de_next, salto_toque2: t2.llevo_al_inicio, next_toque2: t2.escritura_de_next },
        esperado_si_HA: { salto_toque1: 'no', next_toque1: 'no', salto_toque2: 'no', next_toque2: 'no' },
        esperado_tras_el_fix: { salto_toque1: 'no', next_toque1: 'no', salto_toque2: 'no', next_toque2: 'no' },
      }
    },
  },
  {
    id: 'F-tarjeta-movil',
    titulo: 'G-04-6 movil 390x844: Inicio -> tarjeta «Ingresos del mes» -> Finanzas (BLANDA, documento nuevo) -> Egresos -> Ventas',
    async correr(cdp) {
      await celular(cdp)
      await entrarDirecto(cdp)
      await evaluar(cdp, OBSERVAR_CONTENEDOR)
      await tocarEnlace(cdp, '/finances')
      await esperarTabQuieto(cdp, 'Egresos', { condicion: COND_FINANZAS })
      const entrada = resumenContenedor(await leerContenedor(cdp))
      const t1 = await tocarTabMedido(cdp, 'Egresos')
      const t2 = await tocarTabMedido(cdp, 'Ventas')
      return {
        detalle: (p) => {
          console.log(`${p}entrada blanda: contenedor vacio=${entrada.vacio_durante_la_entrada} tramos_ms=${JSON.stringify(entrada.tramos_vacios_ms)}`)
          for (const l of entrada.lineas) console.log(`${p}   ${l}`)
          imprimirToque(p, 'toque 1 (Egresos, primer toque)', t1)
          imprimirToque(p, 'toque 2 (Ventas)', t2)
        },
        medido: { vacio_al_entrar: entrada.vacio_durante_la_entrada, salto_toque1: t1.llevo_al_inicio, next_toque1: t1.escritura_de_next, salto_toque2: t2.llevo_al_inicio, next_toque2: t2.escritura_de_next },
        esperado_si_HA: { vacio_al_entrar: 'si', salto_toque1: 'si', next_toque1: 'si', salto_toque2: 'no', next_toque2: 'no' },
        esperado_tras_el_fix: { salto_toque1: 'no', next_toque1: 'no', salto_toque2: 'no', next_toque2: 'no' },
      }
    },
  },
  {
    id: 'F-sidebar-escritorio',
    titulo: 'G-04-6 escritorio 1280x800: Inicio -> sidebar Finanzas (BLANDA, documento nuevo) -> Ventas -> Egresos',
    async correr(cdp) {
      await escritorio(cdp)
      try {
        await entrarDirecto(cdp)
        await evaluar(cdp, OBSERVAR_CONTENEDOR)
        await tocarEnlaceDentro(cdp, 'nav[aria-label="Navegación"]', '/finances')
        await esperarTabQuieto(cdp, 'Ventas', { condicion: COND_FINANZAS })
        const entrada = resumenContenedor(await leerContenedor(cdp))
        const t1 = await tocarTabMedido(cdp, 'Ventas')
        const t2 = await tocarTabMedido(cdp, 'Egresos')
        return {
          detalle: (p) => {
            console.log(`${p}entrada blanda: contenedor vacio=${entrada.vacio_durante_la_entrada} tramos_ms=${JSON.stringify(entrada.tramos_vacios_ms)}`)
            for (const l of entrada.lineas) console.log(`${p}   ${l}`)
            imprimirToque(p, 'toque 1 (primer toque)', t1)
            imprimirToque(p, 'toque 2', t2)
          },
          medido: { vacio_al_entrar: entrada.vacio_durante_la_entrada, salto_toque1: t1.llevo_al_inicio, next_toque1: t1.escritura_de_next, salto_toque2: t2.llevo_al_inicio, next_toque2: t2.escritura_de_next },
          esperado_si_HA: { vacio_al_entrar: 'si', salto_toque1: 'si', next_toque1: 'si', salto_toque2: 'no', next_toque2: 'no' },
          esperado_tras_el_fix: { salto_toque1: 'no', next_toque1: 'no', salto_toque2: 'no', next_toque2: 'no' },
        }
      } finally {
        await celular(cdp)
      }
    },
  },
  {
    id: 'N-negocio-borde-movil',
    titulo: 'G-04-6 movil 390x844, prediccion (c): Inicio -> Mas -> Negocio (BLANDA) -> con el borde de arriba 40 px fuera, tocar Cobros -> Integraciones',
    async correr(cdp) {
      await celular(cdp)
      await entrarDirecto(cdp)
      await tocarEnLaBarra(cdp, '/mas')
      await evaluar(cdp, OBSERVAR_CONTENEDOR)
      await tocarEnlace(cdp, '/negocio')
      await esperarTabQuieto(cdp, 'Cobros')
      const entrada = resumenContenedor(await leerContenedor(cdp))
      const t1 = await tocarTabMedido(cdp, 'Cobros', { modo: 'borde' })
      const t2 = await tocarTabMedido(cdp, 'Integraciones', { modo: 'borde' })
      return {
        detalle: (p) => {
          console.log(`${p}entrada blanda: contenedor vacio=${entrada.vacio_durante_la_entrada} tramos_ms=${JSON.stringify(entrada.tramos_vacios_ms)}`)
          for (const l of entrada.lineas) console.log(`${p}   ${l}`)
          imprimirToque(p, 'toque 1 (Cobros, primer toque, borde fuera)', t1)
          imprimirToque(p, 'toque 2 (Integraciones)', t2)
        },
        medido: { vacio_al_entrar: entrada.vacio_durante_la_entrada, salto_toque1: t1.llevo_al_inicio, next_toque1: t1.escritura_de_next, next_toque2: t2.escritura_de_next },
        esperado_si_HA: { vacio_al_entrar: 'si', salto_toque1: 'si', next_toque1: 'si', next_toque2: 'no' },
        esperado_tras_el_fix: { salto_toque1: 'no', next_toque1: 'no', next_toque2: 'no' },
      }
    },
  },
  {
    id: 'IN02-refresh-corto',
    // ⚠ CORRIDA 4: en la corrida 3 se entro por carga dura de `/negocio?tab=integraciones`, y ahi el arbol del router
    // YA trae `__PAGE__?{"tab":"integraciones"}`: el refresh coincide y no puede crear un scroll nuevo. La precondicion
    // de IN-02 es un arbol VIEJO (`__PAGE__`) despues de un pushState del tab. Ahora: carga dura de `/negocio` (sin
    // scroll pendiente de entrada: la hidratacion no lo asigna), toque REAL en Integraciones (pushState), y refresh.
    titulo: 'IN-02 emulado, movil 390x480 (para que Integraciones desborde): carga DURA de /negocio (sin scroll pendiente) -> toque en Integraciones (pushState, arbol viejo) -> borde de arriba 40 px fuera -> window.next.router.refresh()',
    async correr(cdp) {
      await cdp.enviar('Emulation.setDeviceMetricsOverride', { width: 390, height: 480, deviceScaleFactor: 2, mobile: true })
      try {
        await navegar(cdp, AFUERA)
        await cdp.enviar('Page.resetNavigationHistory')
        await navegar(cdp, ORIGEN + '/negocio')
        await esperarTabQuieto(cdp, 'Integraciones')
        const toque = await tocarTabMedido(cdp, 'Integraciones', { modo: 'borde' })
        console.log(`      (IN-02) toque previo en Integraciones tras la carga dura: llevo_al_inicio=${toque.llevo_al_inicio} escritura_de_next=${toque.escritura_de_next} ruta=${toque.despues.ruta}`)
        await esperarTabQuieto(cdp, 'Integraciones')
        const pos = await posicionar(cdp, 'Integraciones', 'borde')
        const antes = await estadoDelScroll(cdp, 'Integraciones')
        const hayRouter = await evaluar(cdp, `Boolean(globalThis.next && globalThis.next.router && typeof globalThis.next.router.refresh === 'function')`)
        if (hayRouter) await evaluar(cdp, `(globalThis.next.router.refresh(), true)`)
        await dormir(5000)
        const despues = await estadoDelScroll(cdp, 'Integraciones')
        const escrituras = await escriturasDesde(cdp, antes.marca)
        const discrimina = antes.primera_top !== null && antes.primera_top < -20
        return {
          detalle: (p) => {
            console.log(`${p}router=${hayRouter} posicion=${JSON.stringify(pos)} discrimina(borde fuera)=${discrimina}`)
            console.log(`${p}antes: y=${antes.y} alto=${antes.alto} viewport=${antes.viewport} primera_top=${antes.primera_top} ruta=${antes.ruta}`)
            console.log(`${p}despues: y=${despues.y} alto=${despues.alto} primera_top=${despues.primera_top} ruta=${despues.ruta}`)
            if (escrituras.length === 0) console.log(`${p}escrituras de scroll tras el refresh: ninguna`)
            for (const e of escrituras) console.log(`${p}ESCRITURA t=${e.t} ${e.que} en=${e.en} y=${e.y} ruta=${e.ruta} pila: ${e.pila}`)
          },
          medido: {
            borde_fuera_antes_del_refresh: discrimina ? 'si' : 'no',
            refresh_lleva_al_inicio: discrimina && despues.primera_top !== null && despues.primera_top >= -2 ? 'si' : 'no',
            refresh_escritura_de_next: escrituras.some((e) => e.pila.includes('handlePotentialScroll')) ? 'si' : 'no',
          },
          // los dos `si` son la prediccion de IN-02 (derivacion del code review), no de H-A
          esperado_si_HA: { borde_fuera_antes_del_refresh: 'si', refresh_lleva_al_inicio: 'si', refresh_escritura_de_next: 'si' },
        }
      } finally {
        await celular(cdp)
      }
    },
  },
  {
    id: 'B1-recarga-movil',
    titulo: 'G-04-9 movil 390x844: control Mas -> Negocio -> Cobros -> tocar Inicio (sin recargar); variante: lo mismo con una RECARGA antes del toque; despues un atras de la interfaz en cada uno',
    async correr(cdp) {
      await celular(cdp)
      // control
      await hastaCobrosPorMas(cdp)
      const ctlAntes = await fotoB1(cdp)
      const dCtl = registros.length
      await tocarEnLaBarra(cdp, ROOT)
      await asentarUbicacion(cdp, { quieto: 2000 })
      const ctlTras = await fotoB1(cdp)
      const regsCtl = tramoB1(registros.slice(dCtl))
      const dCtlAtras = registros.length
      await atras(cdp)
      await asentarUbicacion(cdp, { quieto: 1500 })
      const ctlAtras = await fotoB1(cdp)
      const regsCtlAtras = tramoB1(registros.slice(dCtlAtras))
      // variante
      await hastaCobrosPorMas(cdp)
      const varAntesDeRecargar = await fotoB1(cdp)
      const rec = await recargar(cdp)
      const varTrasRecargar = await fotoB1(cdp)
      const dVar = registros.length
      await tocarSinEsperar(cdp, ROOT)
      const final = await asentarUbicacion(cdp, { quieto: 3000, tope: 60_000 })
      await dormir(800)
      const varTras = await fotoB1(cdp)
      const regsVar = tramoB1(registros.slice(dVar))
      const dVarAtras = registros.length
      await atras(cdp)
      await asentarUbicacion(cdp, { quieto: 1500 })
      const varAtras = await fotoB1(cdp)
      const regsVarAtras = tramoB1(registros.slice(dVarAtras))
      const docsNuevos = regsVar.filter((r) => r.tipo === 'sonda-documento-nuevo')
      return {
        detalle: (p) => {
          imprimirFotoB1(p, 'control, en Cobros antes del toque', ctlAntes)
          imprimirFotoB1(p, 'control, tras tocar Inicio', ctlTras)
          for (const r of regsCtl) console.log(`${p}   ${lineaDeRegistro(r)}`)
          imprimirFotoB1(p, 'control, tras el atras', ctlAtras)
          for (const r of regsCtlAtras) console.log(`${p}   ${lineaDeRegistro(r)}`)
          imprimirFotoB1(p, 'variante, en Cobros antes de recargar', varAntesDeRecargar)
          console.log(`${p}   recarga: barra enganchada=${rec.enganchada}`)
          for (const r of tramoB1(rec.regs)) console.log(`${p}   ${lineaDeRegistro(r)}`)
          imprimirFotoB1(p, 'variante, tras recargar (antes del toque)', varTrasRecargar)
          imprimirFotoB1(p, `variante, tras tocar Inicio (ubicacion asentada=${final})`, varTras)
          for (const r of regsVar) console.log(`${p}   ${lineaDeRegistro(r)}`)
          imprimirFotoB1(p, 'variante, tras el atras', varAtras)
          for (const r of regsVarAtras) console.log(`${p}   ${lineaDeRegistro(r)}`)
        },
        medido: {
          control_url: lugarDe(ctlTras.u),
          control_aviso_armado: ctlTras.aviso_armado,
          control_atras_avisa: ctlAtras.aviso_visible === 'si' && lugarDe(ctlAtras.u) === ROOT ? 'si' : 'no',
          marca_tras_recargar: varTrasRecargar.estado,
          variante_url: lugarDe(varTras.u),
          variante_aviso_armado: varTras.aviso_armado,
          variante_documentos_nuevos_tras_el_toque: docsNuevos.map((r) => r.ruta),
          variante_popstates_tras_el_toque: regsVar.filter((r) => r.tipo === 'sonda-popstate').length,
          variante_pila: varTras.pila,
          variante_atras_avisa: varAtras.aviso_visible === 'si' && lugarDe(varAtras.u) === ROOT ? 'si' : 'no',
          variante_igual_al_control: lugarDe(varTras.u) === lugarDe(ctlTras.u) && varTras.aviso_armado === ctlTras.aviso_armado ? 'si' : 'no',
        },
        esperado_si_HA: {
          control_url: '/dashboard',
          control_aviso_armado: 'si',
          control_atras_avisa: 'si',
          marca_tras_recargar: '{"frjView":"tab"}',
          variante_url: '/negocio',
          variante_aviso_armado: 'no',
          variante_documentos_nuevos_tras_el_toque: ['/negocio'],
          variante_popstates_tras_el_toque: 0,
          variante_pila: ['/dashboard', '/mas', '/negocio'],
          variante_atras_avisa: 'no',
          variante_igual_al_control: 'no',
        },
      }
    },
  },
]

// ── B1 tras la recarga hacia los OTROS destinos de la barra (WR-04 dice «todos los gestos de la barra») ──
// Control (sin recarga) y variante (con recarga), la pila normalizada y la URL de cada uno.
function b1RecargaHacia(id, destino) {
  return {
    id,
    titulo: `G-04-9 movil 390x844: Mas -> Negocio -> Cobros -> tocar ${destino}, sin y con una RECARGA antes del toque`,
    async correr(cdp) {
      await celular(cdp)
      await hastaCobrosPorMas(cdp)
      await tocarEnLaBarra(cdp, destino)
      await asentarUbicacion(cdp, { quieto: 2000 })
      const ctl = await fotoB1(cdp)
      await hastaCobrosPorMas(cdp)
      await recargar(cdp)
      const trasRecargar = await fotoB1(cdp)
      const d = registros.length
      await tocarSinEsperar(cdp, destino)
      const final = await asentarUbicacion(cdp, { quieto: 3000, tope: 60_000 })
      await dormir(800)
      const vari = await fotoB1(cdp)
      const regs = tramoB1(registros.slice(d))
      return {
        detalle: (p) => {
          imprimirFotoB1(p, 'control, tras el toque', ctl)
          imprimirFotoB1(p, 'variante, tras recargar', trasRecargar)
          imprimirFotoB1(p, `variante, tras el toque (asentada=${final})`, vari)
          for (const r of regs) console.log(`${p}   ${lineaDeRegistro(r)}`)
        },
        medido: {
          documentos_nuevos_tras_el_toque: regs.filter((r) => r.tipo === 'sonda-documento-nuevo').map((r) => r.ruta),
          variante_url: lugarDe(vari.u),
          variante_pila_igual_al_control: iguales(vari.pila, ctl.pila) ? 'si' : 'no',
        },
        // lo que predice WR-04 (H-1): un documento nuevo en /negocio y la pila distinta del control
        esperado_si_HA: { documentos_nuevos_tras_el_toque: ['/negocio'], variante_url: '/negocio', variante_pila_igual_al_control: 'no' },
      }
    },
  }
}
RECORRIDOS.push(b1RecargaHacia('B1-recarga-turnos', '/appointments'), b1RecargaHacia('B1-recarga-mas', '/mas'))

// ── obs-G1 (quick 261118-jdq): el recorte por alto al cambiar a un tab corto de Finanzas ──────────
// La re-UAT del 04-08 (obs-G1): «cada vez que voy a ventas hace un salto ahi porque se achica». No es un scroll de la
// app: con Ventas en 0 ventas el documento queda mas corto que el scrollY del toque y el navegador RECORTA el scroll
// (el mismo `recorte_por_alto` que `clasificarToque` ya mide). En estos tres recorridos el recorte se JUZGA.
// Hace falta un mes con muchos turnos y 0 ventas / 0 egresos: el mes actual de los datos locales no tiene turnos, asi
// que se retrocede con el boton real «Mes anterior» (sin escribir en la base).

/** Los conteos de los tres tabs de Finanzas, el mes del selector y si la pagina termino de cargar. */
const EXPR_CONTEOS_FINANZAS = `(() => {
  const c = {}
  for (const t of document.querySelectorAll('[role="tab"]')) {
    const b = t.getBoundingClientRect()
    if (!(b.width > 0 && b.height > 0)) continue
    const m = /^(Turnos|Ventas|Egresos) \\((\\d+)\\)$/.exec(t.textContent.replace(/\\s+/g, ' ').trim())
    if (m) c[m[1]] = Number(m[2])
  }
  const bt = [...document.querySelectorAll('button[aria-label="Mes anterior"]')].find((x) => { const b = x.getBoundingClientRect(); return b.width > 0 && b.height > 0 })
  const mes = bt && bt.nextElementSibling ? bt.nextElementSibling.textContent.replace(/\\s+/g, ' ').trim() : null
  return { mes, turnos: c.Turnos ?? null, ventas: c.Ventas ?? null, egresos: c.Egresos ?? null, listo: Boolean(${COND_FINANZAS}), alto: document.documentElement.scrollHeight }
})()`

/** Espera los conteos QUIETOS: la pagina cargada y los mismos conteos, mes y alto en 4 lecturas seguidas (1,2 s). */
async function conteosQuietos(cdp, tope = 60_000) {
  const fin = Date.now() + tope
  let previo = null
  let iguales = 0
  let ultimo = null
  while (Date.now() < fin) {
    ultimo = await evaluar(cdp, EXPR_CONTEOS_FINANZAS).catch(() => null)
    const v = ultimo && ultimo.listo && ultimo.turnos !== null ? JSON.stringify(ultimo) : null
    if (v !== null && v === previo) iguales++
    else iguales = 0
    previo = v
    if (iguales >= 3) return ultimo
    await dormir(300)
  }
  throw new Error(`P-1 obs-G1: los conteos de los tabs de Finanzas no quedaron quietos en ${tope} ms (ultimo: ${JSON.stringify(ultimo)})`)
}

/**
 * Retrocede mes por mes con el boton REAL «Mes anterior» hasta uno con >= `minimo` turnos y 0 en cada tab de `vacios`.
 * El click va al centro del boton convertido al viewport VISUAL y afirmado con `elementFromPoint` (el patron de
 * `tocarTabMedido`); antes, el scroll a 0 como propio de la sonda (`__sondaPropio`, como `posicionar`).
 */
async function irAlMesConTurnos(cdp, { minimo = 10, vacios, tope = 12 }) {
  const clave = { Turnos: 'turnos', Ventas: 'ventas', Egresos: 'egresos' }
  let pasos = 0
  for (;;) {
    const c = await conteosQuietos(cdp)
    if (c.turnos >= minimo && vacios.every((v) => c[clave[v]] === 0)) return { mes: c.mes, turnos: c.turnos, ventas: c.ventas, egresos: c.egresos, pasos }
    if (pasos >= tope) throw new Error(`P-1 obs-G1: ningun mes de los ultimos ${tope} tiene >= ${minimo} turnos con 0 en ${vacios.join(', ')} (el caso no se reproduce con los datos locales)`)
    await evaluar(cdp, `(() => { globalThis.__sondaPropio = true; window.scrollTo(0, 0); globalThis.__sondaPropio = false; return true })()`)
    await dormir(400)
    const punto = await evaluar(cdp, `(() => { const t = [...document.querySelectorAll('button[aria-label="Mes anterior"]')].find((x) => { const b = x.getBoundingClientRect(); return b.width > 0 && b.height > 0 }); if (!t) return null; const b = t.getBoundingClientRect(); const cx = b.x + b.width / 2, cy = b.y + b.height / 2; const el = document.elementFromPoint(cx, cy); const vv = globalThis.visualViewport; const e = vv ? vv.scale : 1; return { x: vv ? (cx - vv.offsetLeft) * e : cx, y: vv ? (cy - vv.offsetTop) * e : cy, adentro: Boolean(el && t.contains(el)) } })()`)
    if (!punto || !punto.adentro) throw new Error(`P-1 obs-G1: el punto del toque no cae adentro del boton Mes anterior (${JSON.stringify(punto)})`)
    await clickEnPunto(cdp, punto)
    const fin = Date.now() + 10_000
    let mes = c.mes
    while (Date.now() < fin) {
      const ahora = await evaluar(cdp, EXPR_CONTEOS_FINANZAS).catch(() => null)
      mes = ahora ? ahora.mes : mes
      if (mes !== c.mes) break
      await dormir(100)
    }
    if (mes === c.mes) throw new Error(`P-1 obs-G1: el mes no cambio en 10 s despues de tocar Mes anterior (sigue en ${c.mes})`)
    pasos++
    await esperarTabQuieto(cdp, 'Turnos', { condicion: COND_FINANZAS })
  }
}

/** Un recorrido de obs-G1: entrar a Finanzas por `entrada`, ir al mes con turnos y tocar `primero` (desde Turnos) y `segundo`. */
function g1Recorrido({ id, titulo, entrada, primero, segundo }) {
  return {
    id,
    titulo,
    async correr(cdp) {
      const medir = async () => {
        await esperarTabQuieto(cdp, 'Turnos', { condicion: COND_FINANZAS })
        const mes = await irAlMesConTurnos(cdp, { vacios: ['Ventas', 'Egresos'] })
        const t1 = await tocarTabMedido(cdp, primero)
        const t2 = await tocarTabMedido(cdp, segundo)
        return { mes, t1, t2 }
      }
      let r
      if (entrada === 'sidebar') {
        await escritorio(cdp)
        try {
          await entrarDirecto(cdp)
          await tocarEnlaceDentro(cdp, 'nav[aria-label="Navegación"]', '/finances')
          r = await medir()
        } finally {
          await celular(cdp)
        }
      } else if (entrada === 'mas' || entrada === 'tarjeta') {
        await celular(cdp)
        await entrarDirecto(cdp)
        if (entrada === 'mas') await tocarEnLaBarra(cdp, '/mas')
        await tocarEnlace(cdp, '/finances')
        r = await medir()
      } else {
        throw new Error(`entrada desconocida en ${id}: ${entrada}`)
      }
      const { mes, t1, t2 } = r
      return {
        detalle: (p) => {
          console.log(`${p}mes con turnos: ${mes.mes} turnos=${mes.turnos} ventas=${mes.ventas} egresos=${mes.egresos} pasos=${mes.pasos}`)
          imprimirToque(p, `toque 1 (${primero}, desde Turnos)`, t1)
          imprimirToque(p, `toque 2 (${segundo})`, t2)
        },
        medido: { recorte_toque1: t1.recorte_por_alto, salto_toque1: t1.llevo_al_inicio, next_toque1: t1.escritura_de_next, recorte_toque2: t2.recorte_por_alto, salto_toque2: t2.llevo_al_inicio, next_toque2: t2.escritura_de_next },
        // El ROJO no afirma `recorte_toque2`: sin el arreglo el segundo toque sale de un tab ya corto con el scroll
        // pegado al maximo, y su recorte depende del desborde horizontal del viewport emulado (innerHeight 881/899),
        // no de obs-G1. Con el arreglo los dos toques tienen que dar `no` (la geometria del plan: el alto del
        // documento es al menos el borde del panel mas una pantalla, asi que el maximo de scroll no baja del toque).
        esperado_si_HA: { recorte_toque1: 'si', salto_toque1: 'no', next_toque1: 'no', salto_toque2: 'no', next_toque2: 'no' },
        esperado_tras_el_fix: { recorte_toque1: 'no', salto_toque1: 'no', next_toque1: 'no', recorte_toque2: 'no', salto_toque2: 'no', next_toque2: 'no' },
      }
    },
  }
}

RECORRIDOS.push(
  g1Recorrido({ id: 'G1-ventas-movil', entrada: 'mas', primero: 'Ventas', segundo: 'Egresos', titulo: 'obs-G1 movil 390x844: Inicio -> Mas -> Finanzas -> retroceder al mes con turnos (>= 10, 0 ventas, 0 egresos) -> Ventas (desde Turnos) -> Egresos' }),
  g1Recorrido({ id: 'G1-egresos-movil', entrada: 'tarjeta', primero: 'Egresos', segundo: 'Ventas', titulo: 'obs-G1 movil 390x844: Inicio -> tarjeta «Ingresos del mes» -> Finanzas -> retroceder al mes con turnos (>= 10, 0 ventas, 0 egresos) -> Egresos (desde Turnos) -> Ventas' }),
  g1Recorrido({ id: 'G1-ventas-escritorio', entrada: 'sidebar', primero: 'Ventas', segundo: 'Egresos', titulo: 'obs-G1 escritorio 1280x800: Inicio -> sidebar Finanzas -> retroceder al mes con turnos (>= 10, 0 ventas, 0 egresos) -> Ventas (desde Turnos) -> Egresos' }),
)
RECORRIDOS.push(k1BfcacheCruce())
RECORRIDOS.push(dFinanzasAncho())
RECORRIDOS.push(
  clFichaRecorrido({ id: 'CL-ficha-movil', pantalla: 'movil', titulo: '/clients movil 390x844: Inicio -> barra Clientes (BLANDA, documento nuevo) -> el borde de arriba fuera (si el documento scrollea) y la lista a la mitad -> tocar una fila' }),
  clFichaRecorrido({ id: 'CL-ficha-escritorio', pantalla: 'escritorio', titulo: '/clients escritorio 1280x800: Inicio -> sidebar Clientes (BLANDA, documento nuevo) -> el borde de arriba fuera (si el documento scrollea) y la lista a la mitad -> tocar una fila' }),
)

// ── R2-WR-01, caso 1 (quick 261118-kat): la guarda de consumo en vuelo y la vuelta desde la bfcache ──────────────
// Ver la cabecera (MODO R2-WR-01). El recorrido arma a mano lo que WR-04 midio que la recarga no arma en Chrome 157:
// una entrada de tab NUESTRA con otro documento debajo. El consumo (Turnos) enciende la guarda en el documento B y su
// retroceso cruza al documento A, asi que el `popstate` que la apagaria nunca llega a B. Si B entra a la bfcache y
// vuelve con «adelante», vuelve con la guarda ENCENDIDA y el toque siguiente (Egresos) no escribe nada.

/** Espera a que React haya enganchado el tab (hidratado), con tope. */
async function esperarTabEnganchado(cdp, texto, tope = 30_000) {
  const expr = `(() => { const t = ${exprTab(texto)}; return Boolean(t && Object.keys(t).some((k) => k.startsWith('__reactProps'))) })()`
  const fin = Date.now() + tope
  while (Date.now() < fin) {
    if (await evaluar(cdp, expr).catch(() => false)) return true
    await dormir(200)
  }
  return false
}

/** Espera hasta `tope` ms a que `location.pathname + location.search` cumpla `pred`; devuelve la ultima lectura. */
async function esperarUbicacion(cdp, pred, tope) {
  const fin = Date.now() + tope
  let u = await ubicacion(cdp).catch(() => '(navegando)')
  while (Date.now() < fin && !pred(u)) {
    await dormir(200)
    u = await ubicacion(cdp).catch(() => '(navegando)')
  }
  return u
}

function k1BfcacheCruce() {
  return {
    id: 'K1-bfcache-cruce',
    titulo: 'R2-WR-01 caso 1, movil 390x844: carga dura de /finances (A), carga dura de /finances?tab=ventas (B) con la marca de tab forzada, Turnos (el consumo cruza de B a A), adelante (B vuelve de la bfcache?) y Egresos',
    async correr(cdp) {
      await celular(cdp)
      await entrarDirecto(cdp)
      // 1. El documento A.
      await navegar(cdp, ORIGEN + '/finances')
      await esperarTabQuieto(cdp, 'Turnos', { condicion: COND_FINANZAS })
      // 2. El documento B: una entrada nueva, con A debajo. Se espera a que React lo hidrate antes de forzar la marca,
      //    para que la escritura inicial del router de Next no la pise despues.
      await navegar(cdp, ORIGEN + '/finances?tab=ventas')
      await esperarTabQuieto(cdp, 'Ventas', { condicion: COND_FINANZAS })
      const hidratadoB = await esperarTabEnganchado(cdp, 'Turnos')
      await dormir(1500)
      // 3. La marca forzada, con el metodo PARCHEADO de la pagina (conserva los internos de Next), y leida de vuelta.
      //    Ademas una marca de documento y un registro de `pageshow` propios de B: si B vuelve de la cache, siguen ahi.
      const forzado = await evaluar(cdp, `(() => {
        history.replaceState({ frjView: 'tab' }, '')
        globalThis.__k1Doc = 'B'
        globalThis.__k1Shows = []
        addEventListener('pageshow', (e) => globalThis.__k1Shows.push(e.persisted))
        const s = history.state
        return { url: location.pathname + location.search, frjView: s && typeof s === 'object' ? (s.frjView ?? null) : null, claves: s && typeof s === 'object' ? Object.keys(s).sort() : [] }
      })()`)
      await dormir(800)
      const marcaAntesDelToque = await evaluar(cdp, `(() => { const s = history.state; return s && typeof s === 'object' ? (s.frjView ?? null) : null })()`)
      const pilaAntes = await pilaConQuery(cdp)
      // 4. El consumo. Los eventos de la bfcache se juntan solo durante este recorrido.
      const eventosCache = []
      let etapa = 'consumo (B -> A)'
      let escuchando = true
      cdp.en('Page.backForwardCacheNotUsed', (p) => { if (escuchando) eventosCache.push({ etapa, ...p }) })
      const d1 = registros.length
      await tocarTabUnaVez(cdp, 'Turnos')
      const trasElConsumo = await esperarUbicacion(cdp, (u) => u === '/finances', 30_000)
      await asentarUbicacion(cdp, { quieto: 2000 })
      await dormir(800)
      const docTrasElConsumo = await evaluar(cdp, 'globalThis.__k1Doc ?? null').catch(() => '?')
      const nrrA = await evaluar(cdp, `JSON.stringify(performance.getEntriesByType('navigation')[0]?.notRestoredReasons ?? null)`).catch((e) => `? ${e.message}`)
      const regsConsumo = registros.slice(d1)
      const cruzo = regsConsumo.some((r) => (r.tipo === 'sonda-documento-nuevo' && r.ruta === '/finances') || (r.tipo === 'sonda-pageshow' && r.persisted === true && r.ruta === '/finances'))
      // 5. «Adelante» del navegador, a la entrada siguiente (B).
      etapa = 'adelante (A -> B)'
      const h = await cdp.enviar('Page.getNavigationHistory')
      const siguiente = h.entries[h.currentIndex + 1]
      if (!siguiente) throw new Error(`P-1: no hay entrada adelante para volver a B (pila: ${JSON.stringify((await pilaConQuery(cdp)).entradas)})`)
      const d2 = registros.length
      await cdp.enviar('Page.navigateToHistoryEntry', { entryId: siguiente.id })
      const trasAdelante = await esperarUbicacion(cdp, (u) => u.includes('tab=ventas'), 30_000)
      await dormir(1500)
      const regsAdelante = registros.slice(d2)
      const enB = await evaluar(cdp, `({ doc: globalThis.__k1Doc ?? null, shows: Array.isArray(globalThis.__k1Shows) ? globalThis.__k1Shows : null, marca: (history.state && typeof history.state === 'object') ? (history.state.frjView ?? null) : null })`).catch(() => ({ doc: '?', shows: null, marca: '?' }))
      const docNuevoB = regsAdelante.some((r) => r.tipo === 'sonda-documento-nuevo')
      const pageshowDelCanal = regsAdelante.some((r) => r.tipo === 'sonda-pageshow' && r.persisted === true)
      // La señal es la del canal (`sonda-pageshow` con `persisted`). La marca de documento y el registro propio de B son
      // la corroboracion por si el enlace de la sonda no sobreviviera a la restauracion: los dos juntos son el MISMO
      // documento B recibiendo un `pageshow` persistido.
      const pageshowDeB = enB.doc === 'B' && Array.isArray(enB.shows) && enB.shows.includes(true)
      const vuelve = (pageshowDelCanal || pageshowDeB) && !docNuevoB
      // 6. El toque siguiente: un solo toque en Egresos y hasta 5 s de espera.
      etapa = 'egresos'
      await esperarTabQuieto(cdp, 'Egresos', { condicion: COND_FINANZAS, tope: 60_000 })
      const hidratadoFinal = await esperarTabEnganchado(cdp, 'Egresos')
      const d3 = registros.length
      await tocarTabUnaVez(cdp, 'Egresos')
      const trasEgresos = await esperarUbicacion(cdp, (u) => u.includes('tab=egresos'), 5_000)
      const responde = trasEgresos.includes('tab=egresos')
      escuchando = false
      await dormir(500)
      const regsEgresos = registros.slice(d3)
      const nrrFinal = await evaluar(cdp, `JSON.stringify(performance.getEntriesByType('navigation')[0]?.notRestoredReasons ?? null)`).catch((e) => `? ${e.message}`)
      const cacheControl = await evaluar(cdp, `fetch(location.href, { credentials: 'include' }).then((r) => r.headers.get('cache-control')).catch((e) => 'fetch fallo: ' + e.message)`).catch((e) => `? ${e.message}`)
      const urlFinal = await ubicacion(cdp).catch(() => '?')
      const todos = registros.slice(d1)
      return {
        detalle: (p) => {
          console.log(`${p}forzado: la sonda escribio history.replaceState({ frjView: 'tab' }) sobre ${forzado.url} (documento B, hidratado=${hidratadoB ? 'si' : 'no'}); leida de vuelta: frjView=${JSON.stringify(forzado.frjView)} claves=[${forzado.claves.join(', ')}]; justo antes del toque: frjView=${JSON.stringify(marcaAntesDelToque)}`)
          console.log(`${p}pila antes del toque: [${pilaAntes.entradas.join(', ')}] actual=${pilaAntes.indice}`)
          if (eventosCache.length === 0) console.log(`${p}bfcache: sin eventos backForwardCacheNotUsed`)
          for (const e of eventosCache) {
            const motivos = (e.notRestoredExplanations ?? []).map((x) => `${x.type}/${x.reason}${x.context ? `(${x.context})` : ''}`).join(', ')
            console.log(`${p}bfcache: navegacion=${e.etapa} loader=${e.loaderId} motivos=[${motivos || '(ninguno)'}]`)
          }
          console.log(`${p}tras el consumo: url=${trasElConsumo} marca de documento=${JSON.stringify(docTrasElConsumo)} notRestoredReasons(A)=${nrrA}`)
          console.log(`${p}tras adelante: url=${trasAdelante} documento=${JSON.stringify(enB.doc)} pageshow propios de B=${JSON.stringify(enB.shows)} marca=${JSON.stringify(enB.marca)} pageshow persistido por el canal=${pageshowDelCanal ? 'si' : 'no'} documento nuevo=${docNuevoB ? 'si' : 'no'}`)
          console.log(`${p}notRestoredReasons (documento final): ${nrrFinal}`)
          console.log(`${p}cache-control del documento: ${cacheControl}`)
          for (const r of todos.filter((x) => x.tipo === 'sonda-pagehide' || x.tipo === 'sonda-pageshow' || x.tipo === 'sonda-documento-nuevo')) console.log(`${p}   ${lineaDeRegistro(r)}`)
          console.log(`${p}tras Egresos (hidratado=${hidratadoFinal ? 'si' : 'no'}): ${regsEgresos.filter((r) => r.tipo === 'sonda-historia').length} escrituras de historia`)
          for (const r of regsEgresos.filter((x) => x.tipo === 'sonda-historia')) console.log(`${p}   ${lineaDeRegistro(r)}`)
          console.log(`${p}url final: ${urlFinal}`)
        },
        medido: {
          cruzo_de_documento: cruzo ? 'si' : 'no',
          b_vuelve_de_la_cache: vuelve ? 'si' : 'no',
          tab_responde: responde ? 'si' : 'no',
        },
        // El defecto: el consumo cruzo de documento, B volvio de la cache y el tab no responde.
        esperado_si_HA: { cruzo_de_documento: 'si', b_vuelve_de_la_cache: 'si', tab_responde: 'no' },
        // El verde tambien exige el cruce y la vuelta desde la cache: sin ellos, un `tab_responde: si` saldria de un
        // documento nuevo (la guarda nace apagada) y no probaria nada del arreglo.
        esperado_tras_el_fix: { cruzo_de_documento: 'si', b_vuelve_de_la_cache: 'si', tab_responde: 'si' },
      }
    },
  }
}

// ── /clients con la lista scrolleada (quick 261124-q68) ───────────────────────────────────────────
// Ver la cabecera (MODO /clients). El mecanismo de G-04-6: con `fallback={null}` en el `<Suspense>` de la pagina, una
// entrada BLANDA con el chunk de `ClientsClient` todavia sin cargar deja el handler de scroll de Next sin un nodo del
// DOM para consumir el scroll de la navegacion; queda pendiente, y la primera actualizacion siguiente del arbol (abrir
// una ficha: el `?c=` es navegacion real) lo ejecuta y lleva la pagina arriba. Pero el handler NO mueve nada si el
// borde de arriba de la pagina ya esta en la pantalla: por eso el recorrido arma primero esa CONDICION y dice si pudo.

/** El contenedor con scroll propio de la lista (`listRef`): el `overflow-y-auto` que tiene las filas. */
const EXPR_LISTA_CL = `[...document.querySelectorAll('div.overflow-y-auto')].find((d) => d.querySelector('button.border-l-2'))`

/** La geometria del documento, del primer nodo de la pagina y de la lista, AHORA. */
const EXPR_GEOMETRIA_CL = `(() => {
  const html = document.documentElement; const p = ${EXPR_PRIMERA}; const l = ${EXPR_LISTA_CL}
  const bl = l ? l.getBoundingClientRect() : null
  return {
    y: Math.round(scrollY), alto_doc: html.scrollHeight, alto_vista: html.clientHeight, inner: innerHeight,
    primera_top: p ? Math.round(p.getBoundingClientRect().top) : null,
    primera: p ? p.tagName.toLowerCase() + '.' + String(p.className).split(' ').slice(0, 4).join('.') : '(ninguna)',
    lista: l ? { scrollTop: Math.round(l.scrollTop), scrollHeight: l.scrollHeight, clientHeight: l.clientHeight, visible: bl.width > 0 && bl.height > 0 } : null,
    filas: l ? l.querySelectorAll('button.border-l-2').length : 0,
    ruta: location.pathname + location.search,
    marca: globalThis.__sondaScroll ? globalThis.__sondaScroll.length : -1,
  }
})()`

/** Espera la lista con filas y la geometria QUIETA (4 lecturas iguales, 1,2 s). */
async function listaQuieta(cdp, tope = 120_000) {
  const fin = Date.now() + tope
  let previo = null
  let iguales = 0
  let ultimo = null
  while (Date.now() < fin) {
    ultimo = await evaluar(cdp, EXPR_GEOMETRIA_CL).catch(() => null)
    const v = ultimo && ultimo.filas > 0 ? JSON.stringify({ ...ultimo, marca: 0 }) : null
    if (v !== null && v === previo) iguales++
    else iguales = 0
    previo = v
    if (iguales >= 3) return ultimo
    await dormir(300)
  }
  throw new Error(`la lista de /clients no quedo quieta con filas en ${tope} ms (ultimo: ${JSON.stringify(ultimo)})`)
}

function clFichaRecorrido({ id, titulo, pantalla }) {
  return {
    id,
    titulo,
    async correr(cdp) {
      const medir = async () => {
        await entrarDirecto(cdp)
        await evaluar(cdp, OBSERVAR_CONTENEDOR)
        const marcaEntrada = await marcaDelScroll(cdp)
        if (pantalla === 'escritorio') await tocarEnlaceDentro(cdp, 'nav[aria-label="Navegación"]', '/clients')
        else await tocarEnLaBarra(cdp, '/clients')
        const alEntrar = await listaQuieta(cdp)
        const entrada = resumenContenedor(await leerContenedor(cdp))
        const escriturasEntrada = await escriturasDesde(cdp, marcaEntrada)
        // La CONDICION, como la sonda (`__sondaPropio`): (a) el documento, con el borde de arriba del primer nodo de la
        // pagina 40 px fuera de la pantalla (`posicionar(..., 'borde')`); (b) la lista, a la mitad de su scroll.
        const armado = await evaluar(cdp, `(() => {
          const html = document.documentElement; const p = ${EXPR_PRIMERA}; const l = ${EXPR_LISTA_CL}
          const docScrollea = html.scrollHeight > html.clientHeight
          const listaScrollea = Boolean(l && l.scrollHeight > l.clientHeight)
          let pedido = null
          globalThis.__sondaPropio = true
          if (docScrollea && p) { const pAbs = p.getBoundingClientRect().top + scrollY; const max = html.scrollHeight - innerHeight; pedido = Math.max(0, Math.min(max, Math.round(pAbs + 40))); window.scrollTo(0, pedido) }
          if (listaScrollea) l.scrollTop = Math.round((l.scrollHeight - l.clientHeight) / 2)
          globalThis.__sondaPropio = false
          return { docScrollea, listaScrollea, pedido }
        })()`)
        const antes = await listaQuieta(cdp, 20_000)
        const condicion = armado.docScrollea && antes.primera_top !== null && antes.primera_top < -1 ? 'alcanzada' : 'inalcanzable'
        // La fila: una que no este abierta, con su centro adentro de la lista y de la pantalla, afirmado con
        // `elementFromPoint` (la letra pegajosa puede tapar una), enganchada por React, en el viewport VISUAL.
        const buscarFila = `(() => {
          const l = ${EXPR_LISTA_CL}; if (!l) return null
          const bl = l.getBoundingClientRect()
          for (const f of l.querySelectorAll('button.border-l-2')) {
            if (f.className.includes('border-l-primary')) continue
            const b = f.getBoundingClientRect(); const cx = b.x + b.width / 2, cy = b.y + b.height / 2
            if (b.height <= 0 || cy < Math.max(0, bl.top) + 4 || cy > Math.min(innerHeight, bl.bottom) - 4) continue
            const el = document.elementFromPoint(cx, cy); if (!el || !f.contains(el)) continue
            const vv = globalThis.visualViewport; const e = vv ? vv.scale : 1
            const nombre = (f.querySelector('p.font-medium') || f).textContent.replace(/\\s+/g, ' ').trim()
            return { x: vv ? (cx - vv.offsetLeft) * e : cx, y: vv ? (cy - vv.offsetTop) * e : cy, nombre, enganchada: Object.keys(f).some((k) => k.startsWith('__reactProps')) }
          }
          return null
        })()`
        let fila = null
        const topeFila = Date.now() + 15_000
        while (Date.now() < topeFila) {
          fila = await evaluar(cdp, buscarFila).catch(() => null)
          if (fila && fila.enganchada) break
          await dormir(200)
        }
        if (!fila || !fila.enganchada) throw new Error(`P-1: no hay una fila visible, enganchada y sin abrir en /clients (${JSON.stringify(fila)})`)
        const abierta = `(() => {
          if (!/[?&]c=/.test(location.search)) return false
          const l = ${EXPR_LISTA_CL}
          return [...document.querySelectorAll('h1, h2, h3, p, span')].some((x) => { if (l && l.contains(x)) return false; const b = x.getBoundingClientRect(); return b.width > 0 && b.height > 0 && x.textContent.replace(/\\s+/g, ' ').trim() === ${JSON.stringify(fila.nombre)} })
        })()`
        const t0 = Date.now()
        await clickEnPunto(cdp, fila)
        const muestras = []
        let llego = false
        while (Date.now() - t0 < 15_000) {
          muestras.push(await evaluar(cdp, 'Math.round(scrollY)').catch(() => null))
          llego = await evaluar(cdp, abierta).catch(() => false)
          if (llego) break
          await dormir(50)
        }
        const ms = Date.now() - t0
        if (!llego) throw new Error(`P-1: el toque en la fila «${fila.nombre}» no abrio la ficha en 15 s (quedo en ${await ubicacion(cdp).catch(() => '?')})`)
        for (let i = 0; i < 15; i++) { await dormir(100); muestras.push(await evaluar(cdp, 'Math.round(scrollY)').catch(() => null)) }
        const despues = await evaluar(cdp, EXPR_GEOMETRIA_CL)
        const escrituras = await escriturasDesde(cdp, antes.marca)
        const ys = muestras.filter((x) => typeof x === 'number')
        const minimo = Math.min(antes.y, ...ys, despues.y)
        // La lista sólo se compara si se ve antes Y despues: en el celular la ficha REEMPLAZA a la lista (`hidden`), y
        // un elemento oculto lee `scrollTop` 0 sin que nadie lo haya movido (un salto falso).
        const listaComparable = Boolean(antes.lista && despues.lista && antes.lista.visible && despues.lista.visible)
        const saltoDoc = antes.y - minimo > 1
        const saltoLista = listaComparable && Math.abs(despues.lista.scrollTop - antes.lista.scrollTop) > 1
        const deNext = escrituras.some((e) => e.pila.includes('handlePotentialScroll'))
        return { alEntrar, entrada, escriturasEntrada, armado, antes, condicion, fila, ms, despues, escrituras, minimo, listaComparable, saltoDoc, saltoLista, deNext }
      }
      let r
      if (pantalla === 'escritorio') {
        await escritorio(cdp)
        try { r = await medir() } finally { await celular(cdp) }
      } else {
        await celular(cdp)
        r = await medir()
      }
      return {
        detalle: (p) => {
          console.log(`${p}entrada blanda: contenedor vacio=${r.entrada.vacio_durante_la_entrada} tramos_ms=${JSON.stringify(r.entrada.tramos_vacios_ms)}`)
          for (const l of r.entrada.lineas) console.log(`${p}   ${l}`)
          for (const e of r.escriturasEntrada) console.log(`${p}   ESCRITURA en la entrada t=${e.t} ${e.que} en=${e.en} y=${e.y} ruta=${e.ruta} pila: ${e.pila}`)
          console.log(`${p}al entrar: ${JSON.stringify(r.alEntrar)}`)
          console.log(`${p}condicion=${r.condicion} · documento scrollea=${r.armado.docScrollea} (alto_doc=${r.alEntrar.alto_doc} alto_vista=${r.alEntrar.alto_vista} inner=${r.alEntrar.inner}) · scroll pedido=${r.armado.pedido} · lista scrollea=${r.armado.listaScrollea}`)
          console.log(`${p}antes del toque: y=${r.antes.y} primera_top=${r.antes.primera_top} primera=${r.antes.primera} lista=${JSON.stringify(r.antes.lista)} filas=${r.antes.filas} ruta=${r.antes.ruta}`)
          console.log(`${p}toque en la fila «${r.fila.nombre}» -> ficha abierta en ${r.ms} ms`)
          console.log(`${p}despues: y=${r.despues.y} min_durante=${r.minimo} primera_top=${r.despues.primera_top} lista=${JSON.stringify(r.despues.lista)} ruta=${r.despues.ruta}`)
          console.log(`${p}salto del documento=${r.saltoDoc ? 'si' : 'no'} · salto de la lista=${r.listaComparable ? (r.saltoLista ? 'si' : 'no') : 'no comparable (la lista no se ve antes y despues)'}`)
          if (r.escrituras.length === 0) console.log(`${p}escrituras de scroll de la pagina al abrir: ninguna`)
          for (const e of r.escrituras) console.log(`${p}ESCRITURA t=${e.t} ${e.que} en=${e.en} y_en_ese_momento=${e.y} ruta=${e.ruta} pila: ${e.pila}`)
        },
        medido: { condicion: r.condicion, salto_al_abrir: r.saltoDoc || r.saltoLista ? 'si' : 'no', next_al_abrir: r.deNext ? 'si' : 'no', vacio_al_entrar: r.entrada.vacio_durante_la_entrada },
        esperado_si_HA: { condicion: 'alcanzada', salto_al_abrir: 'si', next_al_abrir: 'si' },
        esperado_tras_el_fix: { condicion: 'alcanzada', salto_al_abrir: 'no', next_al_abrir: 'no' },
      }
    },
  }
}

// ── El ancho de Finanzas (quick 261124-q68) ───────────────────────────────────────────────────────
// Ver la cabecera (MODO ancho de Finanzas). La medicion diferida (`.planning/debug/tabs-en-la-url-medida.md`, el
// documento que nace en `/finances` a 390x844 con `mobile: true`) dio un documento de 407-415 px: 17-25 px de mas.
// Este recorrido lo mide por CDP —que emula el viewport de verdad— en cinco anchos, tres tabs y dos meses, y NOMBRA el
// elemento que desborda.

/**
 * El ancho del documento AHORA y los CULPABLES: los elementos visibles cuyo borde derecho pasa `clientWidth + 0.5`,
 * sin los que tienen un ancestro que recorta en x (`overflow-x` distinto de `visible`; el `<body>` no cuenta: su
 * overflow se propaga al viewport) ni los que estan dentro de un `position: fixed`, quedandose con el mas externo de
 * cada cadena (tope 5).
 */
const EXPR_ANCHO_FINANZAS = `(() => {
  const html = document.documentElement
  const vv = globalThis.visualViewport
  const cw = html.clientWidth
  const recortaX = (el) => { for (let a = el.parentElement; a && a !== document.body && a !== html; a = a.parentElement) { if (getComputedStyle(a).overflowX !== 'visible') return true } return false }
  const enFijo = (el) => { for (let a = el; a && a !== html; a = a.parentElement) { if (getComputedStyle(a).position === 'fixed') return true } return false }
  const pasan = []
  for (const el of document.body.querySelectorAll('*')) {
    const b = el.getBoundingClientRect()
    if (b.width <= 0 || b.height <= 0) continue
    if (b.right <= cw + 0.5) continue
    if (getComputedStyle(el).visibility === 'hidden') continue
    if (recortaX(el) || enFijo(el)) continue
    pasan.push(el)
  }
  const externos = pasan.filter((el) => !pasan.some((o) => o !== el && o.contains(el)))
  const culpables = externos.slice(0, 5).map((el) => {
    const b = el.getBoundingClientRect(); const s = getComputedStyle(el)
    return { tag: el.tagName.toLowerCase(), clase: String(el.getAttribute('class') || '').slice(0, 120), texto: el.textContent.replace(/\\s+/g, ' ').trim().slice(0, 40), left: Math.round(b.left * 10) / 10, right: Math.round(b.right * 10) / 10, width: Math.round(b.width * 10) / 10, whiteSpace: s.whiteSpace, minWidth: s.minWidth, flexShrink: s.flexShrink }
  })
  return { clientWidth: cw, scrollWidth: html.scrollWidth, innerWidth, vv: vv ? { width: Math.round(vv.width * 10) / 10, offsetLeft: Math.round(vv.offsetLeft) } : null, culpables, total: externos.length }
})()`

/** Los rectangulos (absolutos, redondeados) de todos los descendientes de `main`: la HUELLA del escritorio. */
const EXPR_RECTS_MAIN = `(() => {
  const m = document.querySelector('main'); if (!m) return ''
  return [...m.querySelectorAll('*')].map((el) => { const b = el.getBoundingClientRect(); return [Math.round(b.left + scrollX), Math.round(b.top + scrollY), Math.round(b.width), Math.round(b.height)].join(',') }).join(';')
})()`

const ANCHOS_FINANZAS = [
  { nombre: '360', width: 360, height: 844, deviceScaleFactor: 3, mobile: true },
  { nombre: '375', width: 375, height: 844, deviceScaleFactor: 3, mobile: true },
  { nombre: '390', width: 390, height: 844, deviceScaleFactor: 3, mobile: true },
  { nombre: '430', width: 430, height: 844, deviceScaleFactor: 3, mobile: true },
  { nombre: '1280', width: 1280, height: 800, deviceScaleFactor: 1, mobile: false },
]
const TABS_DE_FINANZAS = ['Turnos', 'Ventas', 'Egresos']

function dFinanzasAncho() {
  return {
    id: 'D-finanzas-ancho',
    titulo: 'Finanzas: documento que NACE en /finances a 360/375/390/430 (movil) y 1280 (escritorio), los tres tabs en el mes actual y en uno con >= 10 turnos: scrollWidth contra clientWidth y los culpables',
    async correr(cdp, modo) {
      const mediciones = []
      const huellas = {}
      let captura = null
      try {
        for (const a of ANCHOS_FINANZAS) {
          await cdp.enviar('Emulation.setDeviceMetricsOverride', { width: a.width, height: a.height, deviceScaleFactor: a.deviceScaleFactor, mobile: a.mobile })
          await navegar(cdp, AFUERA)
          await cdp.enviar('Page.resetNavigationHistory')
          await navegar(cdp, ORIGEN + '/finances')
          await esperarTabQuieto(cdp, 'Turnos', { condicion: COND_FINANZAS })
          await conteosQuietos(cdp)
          const meses = []
          for (let vuelta = 0; vuelta < 2; vuelta++) {
            let mes
            if (vuelta === 0) {
              mes = await conteosQuietos(cdp)
            } else {
              // El mes con >= 10 turnos; si los datos locales no lo tienen (corrida rojo-q68: ninguno en 12 meses), el
              // primero con al menos un turno, y si tampoco, sólo el actual. Lo que se midió queda DECLARADO en el detalle.
              let m = null
              for (const minimo of [10, 1]) {
                console.log(`      [D-finanzas-ancho] ancho ${a.nombre}: buscando un mes con >= ${minimo} turnos`)
                try {
                  m = { ...(await irAlMesConTurnos(cdp, { minimo, vacios: [] })), minimo }
                  break
                } catch (e) {
                  if (e instanceof Error && e.message.includes('el mes no cambio')) {
                    // Corrida verde-q68 (tres veces, a 390): el toque en «Mes anterior» no cambio el mes. No se
                    // aborta el recorrido entero por el SEGUNDO mes: se declara, con una captura del momento para
                    // ver si es la app o el instrumento, y se sigue con el ancho siguiente.
                    const png = await cdp.enviar('Page.captureScreenshot', { format: 'png' })
                    const archivo = join(process.env.SONDA_CAPTURAS || tmpdir(), `fin-mes-no-cambio-${a.nombre}.png`)
                    writeFileSync(archivo, Buffer.from(png.data, 'base64'))
                    const estado = await evaluar(cdp, EXPR_CONTEOS_FINANZAS).catch(() => null)
                    console.log(`      [D-finanzas-ancho] ancho ${a.nombre}: «Mes anterior» no cambio el mes (${e.message}); estado=${JSON.stringify(estado)} captura=${archivo}`)
                    m = { mes: `(segundo mes NO medido: «Mes anterior» no cambio el mes; captura ${archivo})`, sin_segundo: true, error: true }
                    break
                  }
                  if (!(e instanceof Error) || !e.message.includes('ningun mes')) throw e
                  await navegar(cdp, ORIGEN + '/finances')
                  await esperarTabQuieto(cdp, 'Turnos', { condicion: COND_FINANZAS })
                  // Tras la recarga, el boton «Mes anterior» tiene que estar ENGANCHADO por React antes del primer
                  // toque: si no, el click se pierde y `irAlMesConTurnos` lo lee como «el mes no cambio» (corrida
                  // verde-q68, dos veces seguidas).
                  const enganchado = `(() => { const t = [...document.querySelectorAll('button[aria-label="Mes anterior"]')].find((x) => { const b = x.getBoundingClientRect(); return b.width > 0 && b.height > 0 }); return Boolean(t && Object.keys(t).some((k) => k.startsWith('__reactProps'))) })()`
                  const topeEnganche = Date.now() + 30_000
                  while (Date.now() < topeEnganche && !(await evaluar(cdp, enganchado).catch(() => false))) await dormir(200)
                  await conteosQuietos(cdp)
                }
              }
              if (m === null) { meses.push({ mes: '(ningun mes con turnos en 12)', sin_segundo: true }); break }
              if (m.error) { meses.push(m); break }
              if (m.pasos === 0) { meses.push({ ...m, igual_al_actual: true }); break }
              mes = m
            }
            meses.push(mes)
            for (const tab of TABS_DE_FINANZAS) {
              await tocarTab(cdp, tab)
              await conteosQuietos(cdp)
              await dormir(400)
              const w = await evaluar(cdp, EXPR_ANCHO_FINANZAS)
              const med = { ancho: a.nombre, tab, mes: mes.mes, ...w, desborda: w.scrollWidth > w.clientWidth }
              mediciones.push(med)
              if (a.nombre === '390' && (captura === null || (!captura.desborda && med.desborda))) {
                const png = await cdp.enviar('Page.captureScreenshot', { format: 'png' })
                const dir = process.env.SONDA_CAPTURAS || tmpdir()
                const archivo = join(dir, modo === 'tras-el-fix' ? 'fin-390-despues.png' : 'fin-390-antes.png')
                writeFileSync(archivo, Buffer.from(png.data, 'base64'))
                captura = { archivo, tab, mes: mes.mes, desborda: med.desborda }
              }
              if (!a.mobile && vuelta === 0) {
                const rects = await evaluar(cdp, EXPR_RECTS_MAIN)
                huellas[tab.toLowerCase()] = { hash: createHash('sha256').update(rects).digest('hex').slice(0, 16), nodos: rects === '' ? 0 : rects.split(';').length }
              }
            }
          }
          mediciones.push({ ancho: a.nombre, meses: meses.map((m) => `${m.mes}${m.igual_al_actual ? ` (el actual ya cumple el minimo ${m.minimo}: un solo mes)` : ''}${m.sin_segundo ? ' (sin segundo mes)' : ''}${m.minimo !== undefined ? ` [minimo pedido=${m.minimo}]` : ''} turnos=${m.turnos} ventas=${m.ventas} egresos=${m.egresos}`), soloMeses: true })
        }
      } finally {
        await celular(cdp)
      }
      const desborde = (n) => (mediciones.some((m) => !m.soloMeses && m.ancho === n && m.desborda) ? 'si' : 'no')
      return {
        detalle: (p) => {
          for (const m of mediciones) {
            if (m.soloMeses) { console.log(`${p}ancho ${m.ancho}: meses medidos: ${m.meses.join(' · ')}`); continue }
            console.log(`${p}ancho ${m.ancho} · ${m.tab} · ${m.mes}: clientWidth=${m.clientWidth} scrollWidth=${m.scrollWidth} innerWidth=${m.innerWidth} vv=${JSON.stringify(m.vv)} desborda=${m.desborda ? 'si' : 'no'} culpables=${m.total}`)
            for (const c of m.culpables) console.log(`${p}   CULPABLE <${c.tag}> left=${c.left} right=${c.right} width=${c.width} white-space=${c.whiteSpace} min-width=${c.minWidth} flex-shrink=${c.flexShrink} clase="${c.clase}" texto="${c.texto}"`)
          }
          for (const tab of TABS_DE_FINANZAS) {
            const h = huellas[tab.toLowerCase()]
            if (h) console.log(`${p}huella_escritorio_${tab.toLowerCase()}=${h.hash} (nodos=${h.nodos}, mes actual)`)
          }
          console.log(`${p}captura a 390: ${captura ? `${captura.archivo} (${captura.tab}, ${captura.mes}, desborda=${captura.desborda ? 'si' : 'no'})` : '(ninguna)'}`)
        },
        medido: { desborde_360: desborde('360'), desborde_375: desborde('375'), desborde_390: desborde('390'), desborde_430: desborde('430') },
        esperado_si_HA: { desborde_390: 'si' },
        esperado_tras_el_fix: { desborde_360: 'no', desborde_375: 'no', desborde_390: 'no', desborde_430: 'no' },
      }
    },
  }
}

function iguales(a, b) { return JSON.stringify(a) === JSON.stringify(b) }

async function correrYReportar(cdp, rec, modo) {
  const r = await rec.correr(cdp, modo)
  if (modo === 'tras-el-fix') {
    // sin `esperado_tras_el_fix` el recorrido no tiene nada que afirmar en este modo: es un error del instrumento
    // (lo cuenta el catch de `main` como ERROR-DEL-INSTRUMENTO), nunca un OK por omision.
    if (!r.esperado_tras_el_fix) throw new Error(`el recorrido ${rec.id} no tiene esperado_tras_el_fix y se lo pidio en modo tras-el-fix`)
    const claves = Object.keys(r.esperado_tras_el_fix)
    const malas = claves.filter((k) => !iguales(r.medido[k], r.esperado_tras_el_fix[k]))
    const ok = malas.length === 0
    // EL PREFIJO ES `OK ` y la plantilla agrega el espacio: los gates cuentan `OK` + DOS espacios + el id
    // (el formato de panel-exit-en-la-app.mjs).
    console.log(`${ok ? 'OK ' : 'FALLA'} ${rec.id} · ${rec.titulo}`)
    for (const k of claves) {
      const marca = malas.includes(k) ? '  <-- NO COINCIDE' : ''
      console.log(`      ${k}: medido=${JSON.stringify(r.medido[k])}${marca}`)
      if (malas.includes(k)) console.log(`      ${' '.repeat(k.length)}  esperado=${JSON.stringify(r.esperado_tras_el_fix[k])}`)
    }
    r.detalle('      ')
    console.log('')
    return ok
  }
  const claves = Object.keys(r.esperado_si_HA)
  const distintas = claves.filter((k) => !iguales(r.medido[k], r.esperado_si_HA[k]))
  console.log(`${distintas.length === 0 ? 'COINCIDE-CON-LA-HIPOTESIS' : 'NO-COINCIDE'} ${rec.id} · ${rec.titulo}`)
  for (const k of claves) {
    console.log(`      ${k}: medido=${JSON.stringify(r.medido[k])}${distintas.includes(k) ? `   <-- la hipotesis decia ${JSON.stringify(r.esperado_si_HA[k])}` : ''}`)
  }
  r.detalle('      ')
  console.log('')
  return distintas.length === 0
}

async function main() {
  const seleccion = process.argv[2] ? new Set(process.argv[2].split(',').map((s) => s.trim()).filter(Boolean)) : null
  const etiqueta = process.argv[3] ?? '(sin etiqueta)'
  const modo = process.argv[4] ?? 'hipotesis'
  const perfil = mkdtempSync(join(tmpdir(), 'forjo-sonda-g04-'))
  const dirExt = mkdtempSync(join(tmpdir(), 'forjo-sonda-g04-ext-'))
  const logNext = join(perfil, '..', `forjo-sonda-g04-next-${process.pid}.log`)
  let next = null
  let chrome = null
  let cdp = null
  try {
    if (seleccion) {
      const desconocidos = [...seleccion].filter((id) => !RECORRIDOS.some((r) => r.id === id))
      if (desconocidos.length > 0) throw new Error(`ids desconocidos: ${desconocidos.join(', ')}`)
    }
    if (modo !== 'hipotesis' && modo !== 'tras-el-fix') throw new Error(`modo desconocido: ${modo} (hipotesis | tras-el-fix)`)
    const cfg = readFileSync(join(REPO, 'next.config.ts'), 'utf8')
    console.log(`etiqueta=${etiqueta}`)
    console.log(`modo=${modo}`)
    console.log(`next.config.ts huella=${createHash('sha256').update(cfg).digest('hex').slice(0, 16)} reactStrictMode=${/reactStrictMode/.test(cfg) ? 'declarado' : 'ausente (default true)'}`)
    for (const ruta of ['finances', 'negocio', 'settings', 'clients']) {
      const pagina = readFileSync(join(REPO, `app/(dashboard)/${ruta}/page.tsx`), 'utf8')
      // la primera linea que ABRE el boundary y no es un comentario (el comentario puede nombrar el boundary)
      const lineaSuspense = pagina.split(/\r?\n/).find((l) => l.includes('<Suspense') && !l.trim().startsWith('//')) ?? '(sin Suspense)'
      console.log(`${ruta}/page.tsx huella=${createHash('sha256').update(pagina.replace(/\r\n/g, '\n')).digest('hex').slice(0, 16)} suspense: ${lineaSuspense.trim()}`)
    }
    // obs-G1 (quick 261118-jdq): cuantos paneles de los tabs de Finanzas llevan un alto minimo (el rojo 0, el verde 3)
    const finCliente = readFileSync(join(REPO, 'app/(dashboard)/finances/finances-client.tsx'), 'utf8').replace(/\r\n/g, '\n')
    const panelesConMinimo = finCliente.split('\n').filter((l) => l.includes('<TabsContent value=') && l.includes('min-h-')).length
    console.log(`finances-client.tsx huella=${createHash('sha256').update(finCliente).digest('hex').slice(0, 16)} paneles con alto minimo: ${panelesConMinimo}`)
    if (!(await puertoLibre(PUERTO_CDP))) throw new Error(`el puerto ${PUERTO_CDP} esta ocupado`)
    const existente = await servidorExistente()
    if (existente) {
      ORIGEN = existente.origen
      await esperarServidor()
      console.log(`servidor de desarrollo EXISTENTE de este repo en ${ORIGEN} (pid ${existente.pid}): no se levanta ni se mata`)
    } else {
      if (!(await puertoLibre(PUERTO_APP))) throw new Error(`el puerto ${PUERTO_APP} esta ocupado`)
      next = levantarNext(logNext)
      const status = await esperarServidor()
      console.log(`servidor de desarrollo de Next propio en ${ORIGEN} (respondio ${status}) · log: ${logNext}`)
      let login = await esperarLogin200()
      for (let intento = 1; intento <= 2 && login !== 200; intento++) {
        console.log(`ENTORNO: /login respondio ${login} (arbol de rutas incompleto del next dev recien levantado); se reinicia el servidor PROPIO (intento ${intento})`)
        matarArbol(next)
        for (let i = 0; i < 30 && !(await puertoLibre(PUERTO_APP)); i++) await dormir(500)
        next = levantarNext(`${logNext}.reinicio${intento}.log`)
        await esperarServidor()
        login = await esperarLogin200()
      }
      if (login !== 200) throw new Error(`ENTORNO: /login sigue en ${login} despues de reiniciar el servidor propio`)
      console.log('ENTORNO: /login 200 (arbol de rutas completo)')
    }
    chrome = spawn(CHROME, [
      '--headless=new',
      `--remote-debugging-port=${PUERTO_CDP}`,
      '--remote-debugging-pipe',
      '--enable-unsafe-extension-debugging',
      `--user-data-dir=${perfil}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
      'about:blank',
    ], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] })
    chrome.on('error', (e) => { console.error(`no se pudo arrancar Chrome: ${e.message}`); process.exitCode = 1 })
    const target = await descubrirTarget()
    atrasDeLaInterfaz = await prepararAtrasDeLaInterfaz(conectarTuberia(chrome), dirExt)
    cdp = await conectar(target.webSocketDebuggerUrl)
    await cdp.enviar('Page.enable')
    await cdp.enviar('Runtime.enable')
    cdp.en('Page.javascriptDialogOpening', () => { cdp.enviar('Page.handleJavaScriptDialog', { accept: true }).catch(() => {}) })
    cdp.en('Runtime.bindingCalled', (p) => {
      if (p.name !== '__forjoSondaReporta') return
      try { registros.push({ ...JSON.parse(p.payload), llegada: Date.now() }) } catch { /* ilegible */ }
    })
    await cdp.enviar('Runtime.addBinding', { name: '__forjoSondaReporta' })
    await cdp.enviar('Page.addScriptToEvaluateOnNewDocument', { source: SCRIPT_DEL_CANAL })
    await cdp.enviar('Page.addScriptToEvaluateOnNewDocument', { source: SCRIPT_DE_LOS_INSTRUMENTOS })
    const version = await (await fetch(`http://127.0.0.1:${PUERTO_CDP}/json/version`)).json()
    console.log(`navegador: ${version.Browser} · node ${process.version} · gesto de atras: interfaz (chrome.tabs.goBack)`)
    await loguearse(cdp)
    await celular(cdp)
    // CALENTAMIENTO (corrida 3): en la corrida 2 la PRIMERA navegacion blanda de la sesion (Inicio -> Mas, en frio)
    // no llego en 90 s y el recorrido no midio nada. Cargas duras de las rutas que se miden, en documentos que se
    // tiran: compilan el servidor y los chunks del cliente. No cambia lo medido: cada recorrido abre su PROPIO
    // documento (`entrarDirecto`), con el registro de modulos vacio, que es lo que el dueno tiene en una pestana nueva.
    for (const ruta of ['/mas', '/finances', '/negocio', '/clients', ROOT]) {
      const t = Date.now()
      await navegar(cdp, ORIGEN + ruta)
      console.log(`calentamiento: ${ruta} cargada en ${Date.now() - t} ms`)
    }
    console.log('')
    let coinciden = 0
    const aCorrer = RECORRIDOS.filter((r) => !seleccion || seleccion.has(r.id))
    for (const rec of aCorrer) {
      try {
        if (await correrYReportar(cdp, rec, modo)) coinciden++
      } catch (e) {
        console.log(`ERROR-DEL-INSTRUMENTO ${rec.id}: ${e instanceof Error ? e.message : e}`)
        console.log('')
      }
    }
    console.log('── veredicto ─────────────────────────────────────────────────────────────────')
    if (modo === 'tras-el-fix') {
      console.log(`etiqueta=${etiqueta} · modo=tras-el-fix · recorridos: ${aCorrer.length} · coinciden con lo esperado tras el fix: ${coinciden}`)
      if (coinciden < aCorrer.length) process.exitCode = 1
    } else {
      console.log(`etiqueta=${etiqueta} · recorridos: ${aCorrer.length} · coinciden con la hipotesis: ${coinciden}`)
    }
  } catch (e) {
    console.error(`la sonda no pudo completar la medicion: ${e instanceof Error ? e.message : e}`)
    console.error(`log del servidor de Next: ${logNext}`)
    process.exitCode = 1
  } finally {
    if (cdp) cdp.cerrar()
    if (chrome) { try { chrome.kill() } catch { /* ya murio */ } }
    if (next) {
      matarArbol(next)
      await dormir(800)
      const libre = await puertoLibre(PUERTO_APP)
      console.log(`puerto ${PUERTO_APP} libre al salir: ${libre ? 'si' : 'NO'}`)
      if (!libre) process.exitCode = 1
    }
    const cdpLibre = await puertoLibre(PUERTO_CDP)
    console.log(`puerto de depuracion ${PUERTO_CDP} libre al salir: ${cdpLibre ? 'si' : 'NO'}`)
    try { rmSync(perfil, { recursive: true, force: true }) } catch { /* lo limpia el sistema */ }
    try { rmSync(dirExt, { recursive: true, force: true }) } catch { /* lo limpia el sistema */ }
  }
}

// ── El control del clasificador, SIN navegador (plan 04-06, P-1) ────────────────────────────────
// Que el instrumento corregido no quedo ciego. `--autotest` juzga `clasificarToque` con los numeros medidos;
// `--reclasificar <log>...` re-lee el log de una corrida (las lineas de cada toque y sus escrituras) y aplica el
// clasificador nuevo: si ningun toque cambia de `llevo_al_inicio`, el veredicto de esa corrida es el mismo (las
// claves `next_*` salen de la pila de las escrituras, que esta correccion no toca). No levantan servidor ni Chrome.

function autotest() {
  const casos = [
    // el RED de Negocio (rojo-04-06): dos escrituras de Next, 187 -> 0, el alto 1389 -> 844
    { nombre: 'RED de Negocio: escritura presente, 187->0, alto 1389->844', e: { y_antes: 187, min_durante: 0, primera_top_antes: -40, primera_top_despues: 147, alto_despues: 844, viewport_despues: 844, escrituras: 2 }, salto: 'si', recorte: 'no' },
    // el verde de Negocio (verde-04-06): cero escrituras, mismos numeros
    { nombre: 'verde de Negocio: sin escritura, 187->0, alto 1389->844, innerHeight 844', e: { y_antes: 187, min_durante: 0, primera_top_antes: -40, primera_top_despues: 147, alto_despues: 844, viewport_despues: 844, escrituras: 0 }, salto: 'no', recorte: 'si' },
    // sin escritura y SIN recorte: el maximo (1389 - 844 = 545) alcanza para 187 y aun asi scrollY baja a 0
    { nombre: 'sin escritura sin recorte: max 545 >= 187, scrollY 187->0', e: { y_antes: 187, min_durante: 0, primera_top_antes: -40, primera_top_despues: 147, alto_despues: 1389, viewport_despues: 844, escrituras: 0 }, salto: 'si', recorte: 'no' },
    // el RED de F-blanda-mas-movil: 1404 -> 147, borde -1257 -> 0, dos escrituras de Next
    { nombre: 'RED de F-blanda: escritura presente, 1404->147, alto 2248', e: { y_antes: 1404, min_durante: 147, primera_top_antes: -1257, primera_top_despues: 0, alto_despues: 2248, viewport_despues: 844, escrituras: 2 }, salto: 'si', recorte: 'no' },
    // F-directa-movil (control): 1404 -> 1367 por el viewport emulado, sin escrituras
    { nombre: 'F-directa: sin escritura, 1404->1367, alto 2248', e: { y_antes: 1404, min_durante: 1367, primera_top_antes: -1257, primera_top_despues: -1220, alto_despues: 2248, viewport_despues: 844, escrituras: 0 }, salto: 'no', recorte: 'no' },
  ]
  let bien = 0
  for (const c of casos) {
    const r = clasificarToque(c.e)
    const ok = r.llevo_al_inicio === c.salto && r.recorte_por_alto === c.recorte
    if (ok) bien++
    console.log(`${ok ? 'OK ' : 'FALLA'} autotest · ${c.nombre} => salto=${r.llevo_al_inicio} recorte_por_alto=${r.recorte_por_alto} (esperado salto=${c.salto} recorte_por_alto=${c.recorte})`)
  }
  console.log(`autotest del clasificador: ${bien}/${casos.length}`)
  if (bien < casos.length) process.exitCode = 1
}

function reclasificar(archivos) {
  if (archivos.length === 0) { console.error('uso: --reclasificar <log> [<log> ...]'); process.exitCode = 1; return }
  const RE_REC = /^(?:OK {2}|FALLA |COINCIDE-CON-LA-HIPOTESIS |NO-COINCIDE )(\S+) /
  const RE_TOQUE = /^\s*(toque \d+).*?: tab=(\S+) modo=\S+ y_antes=(-?\d+) y_despues=(-?\d+) min_durante=(-?\d+) .*?llevo_al_inicio=(si|no) escritura_de_next=(si|no)/
  const RE_ANTES = /^\s*antes: alto=(\d+) viewport=(\d+) tab_top=\S+ primera_top=(-?\d+|null) /
  const RE_DESPUES = /^\s*despues: alto=(\d+)(?: viewport=(\d+))? tab_top=\S+ primera_top=(-?\d+|null) /
  const num = (s) => (s === 'null' ? null : Number(s))
  let errores = 0
  for (const archivo of archivos) {
    const lineas = readFileSync(archivo, 'utf8').split(/\r?\n/)
    const veredicto = lineas.find((l) => /^etiqueta=.* · recorridos: /.test(l)) ?? '(sin veredicto)'
    console.log(`── ${archivo}`)
    console.log(`   veredicto del log: ${veredicto}`)
    const toques = []
    let rec = '(?)'
    let actual = null
    const cerrar = () => { if (actual) toques.push(actual); actual = null }
    for (const l of lineas) {
      const mr = RE_REC.exec(l)
      if (mr) { cerrar(); rec = mr[1]; continue }
      const mt = RE_TOQUE.exec(l)
      if (mt) { cerrar(); actual = { rec, toque: mt[1], tab: mt[2], y_antes: num(mt[3]), y_despues: num(mt[4]), min_durante: num(mt[5]), llevo_log: mt[6], next_log: mt[7], escrituras: 0, ninguna: false }; continue }
      if (!actual) continue
      const ma = RE_ANTES.exec(l)
      if (ma) { actual.alto_antes = num(ma[1]); actual.viewport_antes = num(ma[2]); actual.primera_top_antes = num(ma[3]); continue }
      const md = RE_DESPUES.exec(l)
      if (md) { actual.alto_despues = num(md[1]); actual.viewport_despues = md[2] === undefined ? null : num(md[2]); actual.primera_top_despues = num(md[3]); continue }
      if (/^\s*ESCRITURA t=/.test(l)) actual.escrituras++
      if (/escrituras de scroll de la pagina: ninguna/.test(l)) actual.ninguna = true
      if (/^── veredicto/.test(l)) cerrar()
    }
    cerrar()
    let cambian = 0
    for (const t of toques) {
      // el log viejo no imprimia el viewport de DESPUES: se usa el de ANTES y se declara
      const vp = t.viewport_despues ?? t.viewport_antes
      const origenVp = t.viewport_despues === null ? 'viewport de antes (el log no trae el de despues)' : 'viewport de despues'
      const r = clasificarToque({ y_antes: t.y_antes, min_durante: t.min_durante, primera_top_antes: t.primera_top_antes, primera_top_despues: t.primera_top_despues, alto_despues: t.alto_despues, viewport_despues: vp, escrituras: t.escrituras })
      // un log de ANTES de esta correccion (sin el viewport de despues) imprimio el criterio crudo; uno de despues
      // ya imprimio el clasificado: el auto-chequeo del parser compara contra lo que ese log imprimio
      const logNuevo = t.viewport_despues !== null
      const parserMal = (logNuevo ? r.llevo_al_inicio : r.crudo) !== t.llevo_log || (t.ninguna && t.escrituras > 0) || (!t.ninguna && t.escrituras === 0)
      if (parserMal) errores++
      const cambia = !logNuevo && r.llevo_al_inicio !== t.llevo_log
      if (cambia) cambian++
      console.log(`   ${t.rec} ${t.toque} (${t.tab}): y ${t.y_antes}->${t.y_despues} min=${t.min_durante} alto_despues=${t.alto_despues} ${origenVp}=${vp} escrituras=${t.escrituras} next=${t.next_log} · salto log=${t.llevo_log}${logNuevo ? ' (log ya clasificado)' : ''} crudo_recalculado=${r.crudo} nuevo=${r.llevo_al_inicio} recorte_por_alto=${r.recorte_por_alto}${cambia ? '  <-- CAMBIA' : ''}${parserMal ? '  <-- ERROR DEL PARSER' : ''}`)
    }
    console.log(`   toques: ${toques.length} · cambian de salto con el clasificador nuevo: ${cambian}${cambian === 0 ? ' (el veredicto del log no cambia)' : ''}`)
  }
  if (errores > 0) { console.log(`ERROR-DEL-INSTRUMENTO: el parser no reprodujo el criterio crudo en ${errores} toque(s)`); process.exitCode = 1 }
}

if (process.argv[2] === '--autotest') autotest()
else if (process.argv[2] === '--reclasificar') reclasificar(process.argv.slice(3))
else await main()
