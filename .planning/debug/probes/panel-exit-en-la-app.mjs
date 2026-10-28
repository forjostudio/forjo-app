#!/usr/bin/env node
// ── La sonda del sentinel de salida EN LA APP REAL (plan 03-12) ──────────────────────────────────
//
// QUE MIDE: la app de verdad —el servidor de desarrollo de Next levantado por esta misma sonda, el
// JS real del panel, el `pushState` parcheado por Next, el `popstate` y el temporizador reales— en un
// Chrome de verdad por CDP. Por cada recorrido mide el gesto de atras y devuelve la tupla completa
// (hash antes, si es nuestro, estado antes, largo del historial antes y despues, ruta despues, si el
// aviso quedo visible, si el gesto se absorbio) MAS el arreglo del canal de diagnostico del modulo
// (`recordExitDiag` en `lib/panel-branch.ts`), que es lo que NOMBRA la regla que declino y el valor de
// *seguimos absorbiendo* en el momento del armado y del retroceso.
//
// QUE CIERRA, y por que existe AHORA y no en el cierre de fase: la firma que comparten `G3-2` y `G3-3`
// —el hash esta en la URL y el atras no se absorbe— es una divergencia entre una referencia de React
// y la URL. Eso es CABLEADO DE REACT, y la sonda estatica (`panel-back-stack.mjs`) declara que no lo
// puede medir: monta un servidor estatico y no corre el codigo de la app. Esta si: cierra el cableado
// de React, el ORDEN de los efectos, el TEMPORIZADOR REAL y la carrera del `history.back()` asincrono
// de la limpieza del desmontaje (el doble montaje del modo estricto).
//
// QUE NO CIERRA, declarado en vez de insinuado:
//   · A11 — Chrome de Android y Safari de iOS. Esto es Chrome de ESCRITORIO headless. Los dos motores
//     reales siguen siendo del telefono del dueno.
//   · EL GESTO DE ATRAS DE LA INTERFAZ DEL NAVEGADOR. El atras de esta sonda es una navegacion de
//     historial iniciada por el navegador (`Page.navigateToHistoryEntry`, la entrada anterior).
//     ⚠ MEDIDO el 2026-10-28 contra una pagina de calibracion: en Chrome de escritorio por CDP NINGUNO
//     de los cuatro metodos disponibles (Alt+Izquierda: no navega; boton atras del mouse,
//     `navigateToHistoryEntry` y `history.back()`: aterrizan en la entrada inmediata anterior) SALTEA
//     una entrada empujada sin activacion del usuario, con o sin activacion previa. O sea que la
//     INTERVENCION DE HISTORIAL de Chrome (el atras de la interfaz saltea entradas agregadas sin gesto
//     del usuario) NO SE PUEDE REPRODUCIR con este instrumento. Si el fallo del telefono viene de ahi,
//     esta sonda va a dar VERDE en ese punto, y ese verde no lo descarta.
//   · Y no reemplaza a la UAT del dueno.
//
// COMO SE CORRE (siempre por el turno de pantalla: levanta servidor y navegador):
//
//   node scripts/con-turno.mjs node .planning/debug/probes/panel-exit-en-la-app.mjs dev
//   node scripts/con-turno.mjs node .planning/debug/probes/panel-exit-en-la-app.mjs dev-sin-estricto
//
// EL SERVIDOR: la sonda levanta el suyo en el 3031 y lo mata al salir (verificando el puerto libre).
// ⚠ SALVO que ya haya un `next dev` de ESTE repo vivo: Next 16 toma un candado en `.next/dev/lock` y
// NO deja levantar un segundo sobre el mismo directorio (medido el 2026-10-28: sale con *"Another next
// dev server is already running"*). En ese caso mide contra ESE —el del dueno, que es ademas el mismo
// entorno donde el telefono midio los dos fallos— y no lo levanta ni lo mata, porque no es suyo. Un
// cambio de `next.config.ts` lo reinicia solo: es lo que deja mover el modo estricto sin tocarlo.
//
// EL MODO es una ETIQUETA que la sonda VERIFICA contra `next.config.ts`, nunca una mutacion que haga
// ella: `dev` exige que el archivo NO declare `reactStrictMode` (el default del App Router desde Next
// 13.5.1 es el modo estricto ACTIVO: `node_modules/next/dist/docs/01-app/03-api-reference/05-config/
// 01-next-config-js/reactStrictMode.md`); `dev-sin-estricto` exige `reactStrictMode: false`. La
// mutacion del archivo y su restauracion (verificada por huella) son del operador.
//
// ⚠ POR QUE EL DISCRIMINADOR DEL DOBLE MONTAJE NO ES UN BUILD DE PRODUCCION, que seria lo obvio: las
// variables de entorno con prefijo publico se INCRUSTAN en el build, y el reparto de archivos de
// entorno de este repo deja el Supabase LOCAL solo en el archivo de desarrollo. Un build de produccion
// moveria DOS VARIABLES a la vez —el modo estricto Y contra que base corre el login— y el resultado no
// distinguiria una de la otra. Un discriminador que mueve dos variables no discrimina nada: por eso se
// corre el MISMO servidor de desarrollo dos veces, cambiando solo la clave del modo estricto.
//
// CERO paquetes nuevos: el `WebSocket` de CDP es el global de Node (existe desde Node 21; este repo
// corre v24), igual que la sonda estatica. Puertos PROPIOS en loopback: la app en 3031 y la depuracion
// de Chrome en 9335 (el dueno usa el 3000; la sonda estatica el 8731 y el 9334).
//
// LA CREDENCIAL es la del usuario sembrado del Supabase LOCAL (`supabase/seed.sql`), nunca una de
// produccion: el servidor lo levanta esta sonda y lee el archivo de entorno de desarrollo.

import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, readFileSync, createWriteStream } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// ── Configuracion ────────────────────────────────────────────────────────────────────────────────
const PUERTO_APP = 3031
const PUERTO_CDP = 9335
// `let` y no `const`: si ya hay un servidor de desarrollo de ESTE repo vivo, se mide contra ese (ver
// `servidorExistente`), y el origen sale de su candado.
let ORIGEN = `http://127.0.0.1:${PUERTO_APP}`
// Ruta con BARRAS NORMALES a proposito: con barras invertidas el `spawn` de Windows falla.
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const REPO = process.cwd()
const ROOT = '/dashboard'
// La pagina "de afuera" que queda DEBAJO de la entrada directa: en el telefono es lo que habia en la
// pestana antes de entrar (otro sitio, la pagina nueva). Atras hasta aca = SALIR DEL SITIO.
const AFUERA = 'data:text/html,<title>afuera</title>afuera'
// El usuario sembrado del Supabase local. Las dos lineas se rompen A PROPOSITO para probar en rojo la
// afirmacion de llegada (plan 03-12, task 2), y se restauran verificando por huella.
const EMAIL = 'test@forjo.local'
const CLAVE = 'Forjo1234!'
// La ventana del aviso, la MISMA constante del modulo (`PANEL_EXIT_HINT_MS`), leida del fuente y no
// copiada: si alguien la cambia alla, la espera de R-3.1 la sigue.
const VENTANA_MS = Number(
  /export const PANEL_EXIT_HINT_MS = (\d+)/.exec(readFileSync(join(REPO, 'lib/panel-branch.ts'), 'utf8'))?.[1] ?? NaN,
)
// El margen por encima de la ventana. Se baja A PROPOSITO por debajo de cero para probar en rojo el
// piso del tiempo transcurrido, y se restaura verificando por huella.
const MARGEN_MS = 900

const MODOS = {
  dev: { estricto: true },
  'dev-sin-estricto': { estricto: false },
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms))

// ── El modo, VERIFICADO contra el archivo ─────────────────────────────────────────────────────────
function verificarModo(modo) {
  if (!(modo in MODOS)) throw new Error(`modo desconocido "${modo}" (validos: ${Object.keys(MODOS).join(', ')})`)
  const cfg = readFileSync(join(REPO, 'next.config.ts'), 'utf8')
  const declaraFalso = /reactStrictMode:\s*false/.test(cfg)
  const declaraAlgo = /reactStrictMode/.test(cfg)
  if (MODOS[modo].estricto && declaraAlgo) {
    throw new Error('modo dev: next.config.ts NO puede declarar reactStrictMode (el default del App Router es el estricto ACTIVO)')
  }
  if (!MODOS[modo].estricto && !declaraFalso) {
    throw new Error('modo dev-sin-estricto: next.config.ts tiene que declarar reactStrictMode: false (una sola variable movida)')
  }
  return { estricto: MODOS[modo].estricto, reactStrictModeEnElArchivo: declaraAlgo ? (declaraFalso ? 'false' : 'otro') : 'ausente (default: true)' }
}

// ── El servidor de Next, levantado por la sonda ──────────────────────────────────────────────────
// Un solo comando envuelto por el turno es dueno de todo: el turno es un candado de UN comando y no se
// puede sostener entre dos.
async function puertoLibre(puerto) {
  try {
    await fetch(`http://127.0.0.1:${puerto}/`, { signal: AbortSignal.timeout(1500) })
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

/** Espera a que el servidor RESPONDA (con reintentos y tope), antes de abrir Chrome. */
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
 * ¿Hay un servidor de desarrollo de ESTE repo ya vivo? Next 16 NO deja levantar un segundo `next dev`
 * sobre el mismo directorio: toma un candado en `.next/dev/lock` y el segundo sale con *"Another next
 * dev server is already running"* (medido el 2026-10-28: el del dueno, en el puerto 80, el mismo que
 * abre el telefono). En ese caso la sonda mide contra ESE servidor —que es ademas exactamente el
 * entorno donde el dueno midio los dos fallos— y no lo levanta ni lo mata: no es suyo.
 */
async function servidorExistente() {
  try {
    const lock = JSON.parse(readFileSync(join(REPO, '.next/dev/lock'), 'utf8'))
    if (!Number.isInteger(lock.pid) || !Number.isInteger(lock.port)) return null
    try { process.kill(lock.pid, 0) } catch { return null }
    const origen = `http://127.0.0.1:${lock.port}`
    if (await puertoLibre(lock.port)) return null
    return { pid: lock.pid, port: lock.port, origen }
  } catch {
    return null
  }
}

/** Mata el ARBOL entero (next dev hace fork): con `kill` a secas el hijo queda con el puerto tomado. */
function matarArbol(hijo) {
  if (!hijo || hijo.exitCode !== null) return
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(hijo.pid), '/T', '/F'], { stdio: 'ignore' })
  else { try { process.kill(-hijo.pid, 'SIGKILL') } catch { try { hijo.kill('SIGKILL') } catch { /* ya murio */ } } }
}

// ── El cliente de CDP, sobre el WebSocket global de Node ─────────────────────────────────────────
// La forma de la sonda estatica, mas los EVENTOS: el canal de diagnostico se espeja a la sonda por un
// binding, para no perder los registros de un documento que se va (una salida del sitio lo descarga).
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
    } catch { /* todavia no levanto: se reintenta */ }
    await dormir(125)
  }
  throw new Error(`Chrome no publico ningun target en el puerto ${PUERTO_CDP} (¿esta ocupado?)`)
}

async function evaluar(cdp, expresion) {
  const r = await cdp.enviar('Runtime.evaluate', { expression: expresion, returnByValue: true, awaitPromise: true })
  if (r.exceptionDetails) throw new Error(`la pagina tiro: ${r.exceptionDetails.text} ${r.exceptionDetails.exception?.description ?? ''}`)
  return r.result.value
}

// ── El canal de diagnostico, abierto ANTES del JS de la app ──────────────────────────────────────
// `Page.addScriptToEvaluateOnNewDocument` corre en cada documento nuevo antes de cualquier script de
// la pagina: el arreglo existe cuando el modulo carga, y sobrevive a recargas y navegaciones. Cada
// `push` se espeja a la sonda por el binding. La sonda agrega DOS registros propios, marcados
// `sonda-*`: el documento nuevo (con el estado de la entrada al nacer, que es lo que una recarga
// PRESERVA) y cada `popstate` (registrado ANTES que los de la app, asi que un retroceso que la app
// IGNORA o en el que se ABSTIENE se ve igual).
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
  }
})()`

/** Los registros espejados, en orden de llegada. La sonda corta por indice entre pasos. */
const registros = []

// ── Las primitivas ───────────────────────────────────────────────────────────────────────────────

async function historial(cdp) {
  const h = await cdp.enviar('Page.getNavigationHistory')
  return {
    indice: h.currentIndex,
    entradas: h.entries.map((e) => (e.url.startsWith(ORIGEN) ? e.url.slice(ORIGEN.length) : e.url.startsWith('data:') ? '(afuera)' : e.url)),
    ids: h.entries.map((e) => e.id),
  }
}

/** Espera a que la pagina haya armado (o decidido no armar): un registro de armado y 900 ms quietos. */
async function asentar(desde, tope = 120_000) {
  const fin = Date.now() + tope
  while (Date.now() < fin) {
    const ultimo = registros.slice(desde).filter((r) => r.tipo === 'armado').at(-1)
    if (ultimo && Date.now() - ultimo.llegada > 900) return true
    await dormir(150)
  }
  return false
}

/** Navega y espera el evento de carga (el primer pedido a una ruta compila: puede tardar). */
async function navegar(cdp, url) {
  const cargo = new Promise((ok) => {
    const t = setTimeout(ok, 150_000)
    cdp.en('Page.loadEventFired', () => { clearTimeout(t); ok() })
  })
  await cdp.enviar('Page.navigate', { url })
  await cargo
}

/** Lo que la pantalla y la URL dicen AHORA. */
async function foto(cdp) {
  const h = await historial(cdp)
  const pag = await evaluar(cdp, `(() => {
    const s = history.state
    const cont = [...document.querySelectorAll('[role="status"][aria-atomic="true"]')].find((d) => d.querySelector('span.whitespace-nowrap'))
    return {
      url: location.protocol.startsWith('http') ? location.pathname + location.hash : '(afuera)',
      ruta: location.protocol.startsWith('http') ? location.pathname : '(afuera)',
      hash: location.hash,
      frjExit: s && typeof s === 'object' && 'frjExit' in s ? s.frjExit : null,
      estado: s && typeof s === 'object' ? JSON.stringify(Object.fromEntries(Object.entries(s).filter(([k]) => k.startsWith('frj')))) : JSON.stringify(s),
      contenedorDelAviso: Boolean(cont),
      aviso: cont ? cont.textContent.trim() : null,
      ahora: Date.now(),
    }
  })()`)
  return { ...pag, largo: h.entradas.length, indice: h.indice, entradas: h.entradas }
}

/**
 * EL GESTO DE ATRAS: una navegacion de historial iniciada por el NAVEGADOR a la entrada anterior
 * (`Page.navigateToHistoryEntry`), que es lo que hace el boton atras del mouse —medido en la
 * calibracion de la cabecera: los dos aterrizan en la entrada inmediata anterior—. NO es un
 * `history.back()` desde la pagina. Despues espera a que el gesto se asiente: si fue de otro documento,
 * el evento de carga; si no, 700 ms (el aviso dura la ventana entera, asi que se lee adentro).
 */
async function atras(cdp) {
  const h = await cdp.enviar('Page.getNavigationHistory')
  if (h.currentIndex === 0) return { hubo: false }
  const otroDocumento = new Promise((ok) => {
    const t = setTimeout(() => ok(false), 700)
    cdp.en('Page.loadEventFired', () => { clearTimeout(t); ok(true) })
  })
  await cdp.enviar('Page.navigateToHistoryEntry', { entryId: h.entries[h.currentIndex - 1].id })
  const recargo = await otroDocumento
  if (recargo) await dormir(1200)
  return { hubo: true, recargo }
}

/** Que regla devolvio la accion, nombrada. Mismo ORDEN que las dos decisiones puras. */
function reglaDelArmado(h) {
  if (!h) return 'sin-registro'
  if (!h.participates) return 'regla-1-participates'
  if (!h.atRoot) return 'regla-2-atRoot'
  if (h.hintOpen) return 'regla-3-hintOpen'
  if (h.topIsOurs) return 'regla-4-topIsOurs(E-6)'
  if (h.urlYaLlevaNuestroHash) return 'septima-urlYaLlevaNuestroHash(E-13)'
  if (h.foreignOwnsTop) return 'regla-0-foreignOwnsTop'
  if (h.algoNuestroDebajo) return 'decision-(a)-algoNuestroDebajo'
  return 'ninguna-ARMA'
}
function reglaDelRetroceso(h) {
  if (!h) return 'sin-registro'
  if (h.topIsOurs) return 'regla-1-topIsOurs'
  if (!h.participates) return 'regla-2-participates'
  if (!h.atRoot) return 'regla-3-atRoot'
  if (!h.holding) return 'regla-4-holding-false'
  if (h.keyboardGuards) return 'regla-5-teclado'
  return 'ninguna-AVISA'
}

/** Una linea ASCII por registro del canal: la accion y la regla que la decidio. */
function lineaDeRegistro(r) {
  if (r.tipo === 'armado') return `armado    doc=${r.doc} id=${r.id} duena=${r.duenaFigurando} vivas=${r.instanciasVivas} url=${r.ruta}${r.hash} estado=${r.estado} accion=${r.accion} regla=${reglaDelArmado(r.hechos)} vivo_antes=${r.vivoAntes} vivo_despues=${r.vivoDespues}`
  if (r.tipo === 'retroceso') return `retroceso doc=${r.doc} id=${r.id} duena=${r.duenaFigurando} vivas=${r.instanciasVivas} url=${r.ruta}${r.hash} estado=${r.estado} accion=${r.accion} regla=${reglaDelRetroceso(r.hechos)} holding=${r.hechos?.holding}`
  return `${r.tipo.padEnd(9)} doc=${r.doc} url=${r.ruta}${r.hash} estado=${r.estado}`
}

/**
 * LA FIRMA DEL DOBLE MONTAJE, medida y no supuesta: sin ningun gesto de por medio, ¿hubo un `popstate`
 * al entrar? Con el modo estricto, React monta, LIMPIA y vuelve a montar: la limpieza del desmontaje
 * hace un `history.back()` sobre el sentinel recien empujado, y ese retroceso aterriza como un
 * `popstate` que nadie pidio. Es la marca observable de que el servidor corre con el estricto activo.
 */
function firmaDelMontaje(regs) {
  const popstates = regs.filter((r) => r.tipo === 'sonda-popstate').length
  const retrocesos = regs.filter((r) => r.tipo === 'retroceso')
  const armados = regs.filter((r) => r.tipo === 'armado')
  return `firma_doble_montaje: popstates_sin_gesto=${popstates} retrocesos_sin_gesto=${retrocesos.length} (acciones=[${retrocesos.map((r) => r.accion).join(',')}]) armados_al_entrar=${armados.length} (acciones=[${armados.map((r) => r.accion).join(',')}]) ids=[${[...new Set(armados.map((r) => r.id))].join(',')}]`
}

/** El gesto, con la tupla completa medida alrededor. */
async function gestoMedido(cdp) {
  const antes = await foto(cdp)
  const desde = registros.length
  const g = await atras(cdp)
  const despues = await foto(cdp)
  const diag = registros.slice(desde)
  const documentoNuevo = diag.some((r) => r.tipo === 'sonda-documento-nuevo')
  const absorbido = g.hubo && !documentoNuevo && despues.ruta === ROOT && Boolean(despues.aviso)
  const retroceso = diag.find((r) => r.tipo === 'retroceso')
  return {
    tupla: {
      hash_antes: antes.hash,
      es_nuestro: /^#salir(-\d+)?$/.test(antes.hash) ? 'si' : 'no',
      estado_antes: antes.estado,
      largo_antes: antes.largo,
      largo_despues: despues.largo,
      ruta_despues: despues.url,
      documento_nuevo: documentoNuevo ? 'si' : 'no',
      aviso_visible: despues.aviso ? 'si' : 'no',
      absorbido: absorbido ? 'si' : 'no',
    },
    antes,
    despues,
    diag,
    accion_del_retroceso: retroceso ? retroceso.accion : documentoNuevo ? 'sin-popstate(otro-documento)' : 'sin-registro',
    regla_del_retroceso: retroceso ? reglaDelRetroceso(retroceso.hechos) : 'sin-registro',
  }
}

function imprimirTupla(prefijo, m) {
  const t = m.tupla
  console.log(`${prefijo}tupla: hash_antes=${t.hash_antes || '(ninguno)'} es_nuestro=${t.es_nuestro} estado_antes=${t.estado_antes} largo_antes=${t.largo_antes} largo_despues=${t.largo_despues} ruta_despues=${t.ruta_despues} documento_nuevo=${t.documento_nuevo} aviso_visible=${t.aviso_visible} absorbido=${t.absorbido}`)
  console.log(`${prefijo}gesto: accion=${m.accion_del_retroceso} regla=${m.regla_del_retroceso}`)
  console.log(`${prefijo}pila antes:   [${m.antes.entradas.join(', ')}] actual=${m.antes.indice}`)
  console.log(`${prefijo}pila despues: [${m.despues.entradas.join(', ')}] actual=${m.despues.indice}`)
  for (const r of m.diag) console.log(`${prefijo}  diag ${lineaDeRegistro(r)}`)
}

// ── Login, y la AFIRMACION de llegada ────────────────────────────────────────────────────────────

async function clickReal(cdp, selector) {
  const rect = await evaluar(cdp, `(() => { const b = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 } })()`)
  for (const type of ['mousePressed', 'mouseReleased']) {
    await cdp.enviar('Input.dispatchMouseEvent', { type, x: rect.x, y: rect.y, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 })
  }
}

async function loguearse(cdp) {
  await navegar(cdp, `${ORIGEN}/login`)
  // Hidratado: sin React el boton cae al submit nativo y la sonda mediria otra cosa.
  for (let i = 0; i < 400; i++) {
    const listo = await evaluar(cdp, `(() => { const e = document.getElementById('email'); return Boolean(e && Object.keys(e).some((k) => k.startsWith('__reactProps'))) })()`)
    if (listo) break
    await dormir(250)
  }
  for (const [id, valor] of [['email', EMAIL], ['password', CLAVE]]) {
    await evaluar(cdp, `document.getElementById(${JSON.stringify(id)}).focus()`)
    // `Input.insertText` es TIPEO de verdad: dispara el evento de entrada que el formulario necesita.
    await cdp.enviar('Input.insertText', { text: valor })
  }
  await clickReal(cdp, 'button[type="submit"]')
  const tope = Date.now() + 120_000
  while (Date.now() < tope) {
    const r = await evaluar(cdp, 'location.pathname').catch(() => null)
    if (r === ROOT) break
    await dormir(300)
  }
  await dormir(1500)
  const f = await foto(cdp)
  // ⚠ LA LINEA QUE IMPIDE EL VERDE SOBRE NADA: parados en la raiz Y con el contenedor del aviso en el
  // documento. Una sonda que se quedo en la pantalla de login mediria todo y reportaria verde.
  if (f.ruta !== ROOT || !f.contenedorDelAviso) {
    const pista = await evaluar(cdp, `(() => ({ email: document.getElementById('email')?.value ?? null, clave_largo: document.getElementById('password')?.value?.length ?? null, texto: document.body.innerText.replace(/\s+/g, ' ').slice(0, 240) }))()`).catch(() => null)
    console.error(`pista del login: ${JSON.stringify(pista)}`)
    throw new Error(`no se pudo llegar a Inicio: ruta=${f.ruta} contenedor_del_aviso=${f.contenedorDelAviso} (¿credencial, Supabase local o el servidor?)`)
  }
  console.log(`llegada a Inicio AFIRMADA: ruta=${f.ruta} contenedor_del_aviso=${f.contenedorDelAviso}`)
}

/** Entrada DIRECTA a la raiz: una pagina de afuera debajo, historial limpio, documento nuevo. */
async function entrarDirecto(cdp) {
  await navegar(cdp, AFUERA)
  await cdp.enviar('Page.resetNavigationHistory')
  const desde = registros.length
  await navegar(cdp, ORIGEN + ROOT)
  await asentar(desde)
  return desde
}

// ── Los recorridos ───────────────────────────────────────────────────────────────────────────────

const RECORRIDOS = [
  {
    id: 'R-1.3-nueva',
    titulo: 'entrada DIRECTA a Inicio en una pestana limpia, sentinel armado, UN atras',
    async correr(cdp) {
      const desde = await entrarDirecto(cdp)
      const armado = registros.slice(desde)
      const m = await gestoMedido(cdp)
      return {
        detalle: (p) => {
          console.log(`${p}armado al entrar:`)
          for (const r of armado) console.log(`${p}  diag ${lineaDeRegistro(r)}`)
          console.log(`${p}${firmaDelMontaje(armado)}`)
          imprimirTupla(p, m)
        },
        medido: {
          hash_al_entrar: m.tupla.hash_antes,
          absorbido: m.tupla.absorbido,
          ruta_despues: m.tupla.ruta_despues,
          aviso_visible: m.tupla.aviso_visible,
        },
        // Lo que el guion pide (1.3): el primer atras NO sale y avisa.
        esperado: { hash_al_entrar: '#salir', absorbido: 'si', ruta_despues: ROOT, aviso_visible: 'si' },
      }
    },
  },
]

// ── El arnes ─────────────────────────────────────────────────────────────────────────────────────

function iguales(a, b) { return JSON.stringify(a) === JSON.stringify(b) }

async function main() {
  const modo = process.argv[2] ?? 'dev'
  const perfil = mkdtempSync(join(tmpdir(), 'forjo-sonda-app-'))
  const logNext = join(perfil, '..', `forjo-sonda-app-next-${process.pid}.log`)
  let next = null
  let chrome = null
  let cdp = null
  let fallados = 0

  try {
    if (!Number.isInteger(VENTANA_MS)) throw new Error('no se pudo leer PANEL_EXIT_HINT_MS de lib/panel-branch.ts')
    const m = verificarModo(modo)
    console.log(`modo=${modo} · modo estricto ${m.estricto ? 'ACTIVO' : 'APAGADO'} · reactStrictMode en next.config.ts: ${m.reactStrictModeEnElArchivo}`)
    if (!(await puertoLibre(PUERTO_CDP))) throw new Error(`el puerto ${PUERTO_CDP} esta ocupado: la sonda usa puertos PROPIOS`)
    const existente = await servidorExistente()
    if (existente) {
      ORIGEN = existente.origen
      const status = await esperarServidor()
      console.log(`servidor de desarrollo EXISTENTE de este repo en ${ORIGEN} (pid ${existente.pid}, respondio ${status}): Next 16 no deja levantar un segundo next dev sobre el mismo directorio; la sonda no lo levanta ni lo mata`)
    } else {
      if (!(await puertoLibre(PUERTO_APP))) throw new Error(`el puerto ${PUERTO_APP} esta ocupado: la sonda usa puertos PROPIOS`)
      next = levantarNext(logNext)
      const status = await esperarServidor()
      console.log(`servidor de desarrollo de Next propio en ${ORIGEN} (respondio ${status}) · log: ${logNext}`)
    }

    chrome = spawn(CHROME, [
      '--headless=new',
      `--remote-debugging-port=${PUERTO_CDP}`,
      `--user-data-dir=${perfil}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
      'about:blank',
    ], { stdio: 'ignore' })
    chrome.on('error', (e) => { console.error(`no se pudo arrancar Chrome: ${e.message}`); process.exitCode = 1 })

    const target = await descubrirTarget()
    cdp = await conectar(target.webSocketDebuggerUrl)
    await cdp.enviar('Page.enable')
    await cdp.enviar('Runtime.enable')
    cdp.en('Runtime.bindingCalled', (p) => {
      if (p.name !== '__forjoSondaReporta') return
      try { registros.push({ ...JSON.parse(p.payload), llegada: Date.now() }) } catch { /* registro ilegible */ }
    })
    await cdp.enviar('Runtime.addBinding', { name: '__forjoSondaReporta' })
    await cdp.enviar('Page.addScriptToEvaluateOnNewDocument', { source: SCRIPT_DEL_CANAL })

    const version = await (await fetch(`http://127.0.0.1:${PUERTO_CDP}/json/version`)).json()
    console.log(`navegador: ${version.Browser} · node ${process.version}`)

    await loguearse(cdp)
    // El ancho del telefono, DESPUES del login: en mobile el formulario vive en una hoja que hay que
    // abrir, y el login no es lo que se mide. La barra de abajo es la del celular (oculta a >= 1024px).
    await cdp.enviar('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
    console.log('')

    for (const rec of RECORRIDOS) {
      const r = await rec.correr(cdp)
      const claves = Object.keys(r.esperado)
      const malas = claves.filter((k) => !iguales(r.medido[k], r.esperado[k]))
      const ok = malas.length === 0
      if (!ok) fallados++
      // ⚠ EL PREFIJO ES `OK ` (UNA sangria) y la plantilla agrega el espacio: los gates cuentan
      // `OK` + DOS espacios + el id, igual que en la sonda estatica.
      console.log(`${ok ? 'OK ' : 'FALLA'} ${rec.id} · ${rec.titulo}`)
      for (const k of claves) {
        const marca = malas.includes(k) ? '  <-- NO COINCIDE' : ''
        console.log(`      ${k}: medido=${JSON.stringify(r.medido[k])}${marca}`)
        if (malas.includes(k)) console.log(`      ${' '.repeat(k.length)}  esperado=${JSON.stringify(r.esperado[k])}`)
      }
      r.detalle('      ')
      console.log('')
    }

    console.log('── veredicto ─────────────────────────────────────────────────────────────────')
    console.log(`modo=${modo} · recorridos medidos: ${RECORRIDOS.length} · coinciden con el guion: ${RECORRIDOS.length - fallados} · no coinciden: ${fallados}`)
    console.log('⚠ LO QUE ESTA SONDA NO CIERRA: A11 (Chrome Android / Safari iOS reales) y el atras de la INTERFAZ')
    console.log('  del navegador (la intervencion de historial de Chrome no se reproduce por CDP: calibrado).')
    if (fallados > 0) {
      console.error('')
      console.error(`${fallados} recorrido(s) no coinciden con lo que el guion pide. Este instrumento MIDE: el arreglo`)
      console.error('lo escribe el plan 03-13 contra .planning/debug/la-absorcion-que-no-absorbe-medida.md.')
      process.exitCode = 1
    }
  } catch (e) {
    console.error(`la sonda no pudo completar la medicion: ${e instanceof Error ? e.message : e}`)
    console.error(`sospechosos de entorno: Docker / Supabase local caido, Chrome fuera de ${CHROME}, o los puertos`)
    console.error(`${PUERTO_APP} / ${PUERTO_CDP} ocupados. Log del servidor de Next: ${logNext}`)
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
  }
}

await main()
