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
//   · Y no reemplaza a la UAT del dueno.
//
// ⚠ EL GESTO DE ATRAS, Y POR QUE HAY DOS — la pieza que decide si la medicion vale. Medido el
// 2026-10-28 contra una pagina de calibracion (/a → /b → pushState('#x'), sin y con activacion):
//   · `entrada` — una navegacion de historial iniciada por el navegador a la entrada inmediata
//     anterior (`Page.navigateToHistoryEntry`). Es lo que tambien hacen el boton atras del mouse y
//     `history.back()` por CDP, y los tres aterrizan SIEMPRE en la entrada inmediata anterior.
//     Alt+Izquierda por CDP no navega (ni headless ni con ventana).
//   · `interfaz` (el DEFAULT) — EL ATRAS DE LA INTERFAZ DEL NAVEGADOR (NavigationController::GoBack),
//     invocado con `chrome.tabs.goBack` desde una extension de prueba que la sonda escribe en un
//     directorio temporal y carga por CDP (`Extensions.loadUnpacked`, que exige el canal por TUBERIA y
//     `--enable-unsafe-extension-debugging`). Es el UNICO de los cinco que respeta la INTERVENCION DE
//     HISTORIAL de Chrome: sin activacion del usuario en el documento, el atras desde /b#x SALTEA /b y
//     aterriza en /a; con una activacion antes del empuje aterriza en /b; y con una activacion y DOS
//     empujes, el segundo NO vuelve salteable al primero (aterriza en /b#x).
// El gesto del dueno en el telefono es el de la interfaz. Con `entrada` esta sonda mide la LOGICA
// del modulo sin la intervencion; con `interfaz`, la logica MAS la intervencion.
//
// COMO SE CORRE (siempre por el turno de pantalla: levanta servidor y navegador):
//
//   node scripts/con-turno.mjs node .planning/debug/probes/panel-exit-en-la-app.mjs dev
//   node scripts/con-turno.mjs node .planning/debug/probes/panel-exit-en-la-app.mjs dev-sin-estricto
//   (segundo argumento opcional: el gesto, `interfaz` por omision o `entrada`)
//   (tercer argumento opcional, plan 03-13: una lista de ids separados por coma que corre SOLO esos,
//   `C-activacion` incluido si se lo nombra — para las pruebas en rojo; sin el corre todo)
//
// PLAN 03-13 — LA CALIBRACION VA PRIMERO. Antes del login, sobre `/login` (una pagina de la app SIN el
// hook del panel), `C-activacion` mide con numeros si la premisa de la decision del dueno del
// 2026-10-28 (`camino 1`: empujar el sentinel SOLO con activacion del usuario) vale en este motor: un
// empuje a los <=200 ms de un click real NO tiene que quedar salteable. Si queda, el plan PARA.
// Y el toque: `tocarLaPantalla` toca un punto NEUTRO de `main` y lo AFIRMA con el registro
// `sonda-click` del canal (un toque que no llega no mide nada).
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
import { mkdtempSync, rmSync, readFileSync, writeFileSync, createWriteStream } from 'node:fs'
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
// LAS ESPERAS PROPIAS (plan 03-13). Desde la decision del dueno del 2026-10-28 el aviso NO vence y el
// modulo ya no tiene una ventana que leer: la sonda deja de leer la constante del fuente (el plan la
// borra) y usa sus propias esperas.
//   · ESPERA_CORTA_MS / ESPERA_LARGA_MS — cuanto se espera con el aviso visible para afirmar que SIGUE.
//   · LAPSO_SIN_ACTIVACION_MS — mas que la activacion transitoria de Chromium (~5 s): pasado esto, un
//     empuje ya no lleva la activacion del ultimo toque.
const ESPERA_CORTA_MS = 2500
const ESPERA_LARGA_MS = 10000
const LAPSO_SIN_ACTIVACION_MS = 7000
// El margen por encima de cada espera. Toda espera que alimente un piso de tiempo es la espera MAS el
// margen, mientras el piso compara contra la espera SOLA: bajar el margen por debajo de cero A
// PROPOSITO prueba en rojo el piso, y se restaura verificando por huella.
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
    // plan 03-13: cada click en la BURBUJA de window, registrado al nacer el documento — corre despues
    // de los manejadores de React (la raiz de Next 16 es el documento) y ANTES del oyente del hook, asi
    // que dice si un link se llevo el gesto y si el navegador lo conto como activacion.
    addEventListener('click', (e) => canal.push({ tipo: 'sonda-click', ts: Date.now(), ruta: location.pathname, hash: location.hash, estado: estadoTexto(), defaultPrevented: e.defaultPrevented, isActive: navigator.userActivation ? navigator.userActivation.isActive : null }))
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

// ── El ATRAS DE LA INTERFAZ: una extension de prueba por el canal de TUBERIA ────────────────────────
// `Extensions.loadUnpacked` solo existe por la tuberia de depuracion (no por el WebSocket del puerto),
// asi que Chrome se levanta con los dos: el puerto para la pagina (el mismo cliente de siempre) y la
// tuberia para cargar la extension y hablar con su service worker.
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

/**
 * Escribe la extension de prueba en un directorio temporal, la carga, y devuelve la funcion que hace
 * el atras de la interfaz sobre LA pestana. Si algo falla, TIRA: un gesto que cae en silencio a otro
 * metodo mediria otra cosa.
 */
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
    if (r.exceptionDetails) throw new Error(`el service worker tiro: ${r.exceptionDetails.text} ${r.exceptionDetails.exception?.description ?? ''}`)
    return r.result.value
  }
  // El service worker tarda en tener la API lista: se reintenta, con tope.
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

/** El gesto elegido. Lo fija `main` antes de medir. */
let gestoDeAtras = null

/**
 * EL GESTO DE ATRAS. Con `interfaz` (el default) es el atras de la interfaz del navegador; con
 * `entrada`, una navegacion de historial a la entrada inmediata anterior. Ver la cabecera: el primero
 * respeta la intervencion de historial y el segundo no. NUNCA es un `history.back()` desde la pagina.
 * Despues espera a que el gesto se asiente: si fue de otro documento, el evento de carga; si no, 700 ms
 * (el aviso dura la ventana entera, asi que se lee adentro).
 */
async function atras(cdp) {
  const h = await cdp.enviar('Page.getNavigationHistory')
  if (h.currentIndex === 0) return { hubo: false }
  const otroDocumento = new Promise((ok) => {
    const t = setTimeout(() => ok(false), 700)
    cdp.en('Page.loadEventFired', () => { clearTimeout(t); ok(true) })
  })
  if (gestoDeAtras.nombre === 'interfaz') {
    const r = await gestoDeAtras.hacer()
    if (r !== 'ok') throw new Error(`el atras de la interfaz fallo: ${r}`)
  } else {
    await cdp.enviar('Page.navigateToHistoryEntry', { entryId: h.entries[h.currentIndex - 1].id })
  }
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
  if (r.tipo === 'toque') return `toque     doc=${r.doc} id=${r.id} url=${r.ruta}${r.hash} accion=${r.accion} hechos=${JSON.stringify(r.hechos)} vivo_antes=${r.vivoAntes} vivo_despues=${r.vivoDespues}`
  if (r.tipo === 'sonda-click') return `sonda-click doc=${r.doc} url=${r.ruta}${r.hash} defaultPrevented=${r.defaultPrevented} isActive=${r.isActive}`
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
      // Cuantas entradas SALTEO el gesto: 0 es el atras de siempre; mas de 0 es la intervencion.
      entradas_salteadas: Math.max(0, antes.indice - despues.indice - 1),
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
  console.log(`${prefijo}tupla: hash_antes=${t.hash_antes || '(ninguno)'} es_nuestro=${t.es_nuestro} estado_antes=${t.estado_antes} largo_antes=${t.largo_antes} largo_despues=${t.largo_despues} entradas_salteadas=${t.entradas_salteadas} ruta_despues=${t.ruta_despues} documento_nuevo=${t.documento_nuevo} aviso_visible=${t.aviso_visible} absorbido=${t.absorbido}`)
  console.log(`${prefijo}gesto: accion=${m.accion_del_retroceso} regla=${m.regla_del_retroceso}`)
  console.log(`${prefijo}pila antes:   [${m.antes.entradas.join(', ')}] actual=${m.antes.indice}`)
  console.log(`${prefijo}pila despues: [${m.despues.entradas.join(', ')}] actual=${m.despues.indice}`)
  for (const r of m.diag) console.log(`${prefijo}  diag ${lineaDeRegistro(r)}`)
}

// ── Login, y la AFIRMACION de llegada ────────────────────────────────────────────────────────────

async function clickReal(cdp, selector) {
  const rect = await evaluar(cdp, `(() => { const b = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 } })()`)
  await clickEnPunto(cdp, rect)
}

/** Un click de mouse REAL (eventos de entrada de CDP: dan activacion) sobre un punto. */
async function clickEnPunto(cdp, punto) {
  for (const type of ['mousePressed', 'mouseReleased']) {
    await cdp.enviar('Input.dispatchMouseEvent', { type, x: punto.x, y: punto.y, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 })
  }
}

/**
 * Un punto NEUTRO adentro de `selector`: su `elementFromPoint` es descendiente del contenedor y NO
 * tiene como ancestro nada interactivo. Barre una grilla del area visible del contenedor.
 */
async function puntoNeutro(cdp, selector) {
  return evaluar(cdp, `(() => {
    const raiz = document.querySelector(${JSON.stringify(selector)})
    if (!raiz) return null
    const b = raiz.getBoundingClientRect()
    const x0 = Math.max(b.left, 0) + 4, x1 = Math.min(b.right, innerWidth) - 4
    const y0 = Math.max(b.top, 0) + 4, y1 = Math.min(b.bottom, innerHeight) - 4
    const INTERACTIVO = 'a, button, input, label, select, textarea, [role=button], [tabindex]'
    for (let y = y0; y <= y1; y += 12) {
      for (let x = x0; x <= x1; x += 12) {
        const el = document.elementFromPoint(x, y)
        if (!el || !raiz.contains(el) || el.closest(INTERACTIVO)) continue
        return { x, y, etiqueta: el.tagName.toLowerCase() }
      }
    }
    return null
  })()`)
}

/** Espera, con tope, el primer registro de `tipo` desde el indice `desde`. */
async function esperarRegistro(desde, tipo, tope) {
  const fin = Date.now() + tope
  while (Date.now() < fin) {
    const r = registros.slice(desde).find((x) => x.tipo === tipo)
    if (r) return r
    await dormir(50)
  }
  return null
}

/**
 * EL TOQUE DEL DUENO sobre un punto NEUTRO de `main` (plan 03-13): primero con la forma del dedo
 * (`Input.synthesizeTapGesture`) y, si en 1 s no llego ningun `sonda-click`, con un click de mouse.
 * IMPRIME la forma usada y TIRA si no llega un `sonda-click` sin `defaultPrevented` y con `isActive` en
 * verdadero: un toque que no llega, o que no cuenta como activacion, no mide nada.
 */
async function tocarLaPantalla(cdp) {
  const punto = await puntoNeutro(cdp, 'main')
  if (!punto) throw new Error('el toque no llego como click: no hay un punto neutro en main')
  const desde = registros.length
  let forma = 'dedo'
  await cdp.enviar('Input.synthesizeTapGesture', { x: punto.x, y: punto.y, duration: 40, tapCount: 1, gestureSourceType: 'touch' })
  let click = await esperarRegistro(desde, 'sonda-click', 1000)
  if (!click) {
    forma = 'raton'
    await clickEnPunto(cdp, punto)
    click = await esperarRegistro(desde, 'sonda-click', 1000)
  }
  console.log(`      forma del toque=${forma} punto=(${Math.round(punto.x)},${Math.round(punto.y)}) sobre <${punto.etiqueta}>`)
  if (!click || click.defaultPrevented || click.isActive !== true) {
    throw new Error(`el toque no llego como click (forma=${forma} sonda-click=${click ? `defaultPrevented=${click.defaultPrevented} isActive=${click.isActive}` : 'ninguno'})`)
  }
  // Lo que el toque haya disparado (un armado, bajar el aviso) se asienta antes de seguir.
  await asentar(desde, 3_000)
  return click
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

/**
 * Un toque REAL (eventos de entrada de CDP: el documento recibe activacion del usuario) sobre el
 * destino de la barra de abajo, el VISIBLE (el sidebar de escritorio tiene los mismos destinos, oculto).
 */
async function tocarEnLaBarra(cdp, href) {
  const desde = registros.length
  const rect = await evaluar(cdp, `(() => { const a = [...document.querySelectorAll('a[href=' + JSON.stringify(${JSON.stringify(href)}) + ']')].find((x) => { const b = x.getBoundingClientRect(); return b.width > 0 && b.height > 0 && b.bottom > innerHeight / 2 }); if (!a) return null; const b = a.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 } })()`)
  if (!rect) throw new Error(`no hay un destino visible de la barra para ${href}`)
  for (const type of ['mousePressed', 'mouseReleased']) {
    await cdp.enviar('Input.dispatchMouseEvent', { type, x: rect.x, y: rect.y, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 })
  }
  // ⚠ PRIMERO LA RUTA, DESPUES EL ASENTADO: el primer pedido a una seccion compila en el servidor de
  // desarrollo, y un registro de armado intermedio (el de la raiz) dejaria asentar antes de llegar.
  // Medido: sin esto el toque siguiente caia todavia en Inicio y el recorrido media otro camino.
  const tope = Date.now() + 90_000
  while (Date.now() < tope && (await evaluar(cdp, 'location.pathname')) !== href) await dormir(200)
  if ((await evaluar(cdp, 'location.pathname')) !== href) throw new Error(`el toque en ${href} no llego a ${href}`)
  const llegada = registros.length
  await asentar(desde, 60_000)
  if (registros.slice(llegada).every((r) => r.tipo !== 'armado')) await asentar(llegada, 5_000)
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

// ── La calibracion del navegador (plan 03-13): corre ANTES del login ─────────────────────────────
//
// ⚠ DECIDE SI LA PREMISA DE LA DECISION VALE EN ESTE MOTOR. Sobre `/login` —una pagina de la app SIN
// el hook del panel, con el perfil desechable todavia sin sesion (despues del login el guard de rutas
// la redirigiria)—, con historial limpio en cada fila (la pagina de afuera, el historial reseteado,
// `/login`), un empuje de hash propio y el atras del gesto elegido. Las filas:
//   1. un click real sobre un punto neutro y el empuje a los <=200 ms ⇒ ¿salteada?
//   2. lo mismo con el empuje a los LAPSO_SIN_ACTIVACION_MS ⇒ ¿salteada? (dice si `isActive` es
//      EXACTO —salteada— o MAS ESTRICTO que el navegador —no salteada—)
//   3. un empuje SIN ninguna activacion, despues un click real, y el atras ⇒ ¿una activacion
//      posterior vuelve visitable la entrada?
//   4. `navigator.userActivation.isActive` leido adentro de un `pointerdown` de un toque emulado (solo
//      el inicio del toque) y adentro de un `click` real.
// El `esperado` lleva SOLO dos claves: la fila 1 NO salteada y `isActive` en verdadero adentro del
// `click`. Las filas 2, 3 y la parte tactil de la 4 se IMPRIMEN como medicion.
// Las ramas, escritas antes de medir: (a) fila 1 salteada ⇒ PARAR, la premisa no vale y no se escribe
// arreglo; (b) fila 2 NO salteada ⇒ el gate queda mas estricto que el navegador (la direccion segura);
// (c) fila 2 salteada ⇒ el gate es exacto.

const INSTALAR_CALIBRACION = `(() => {
  window.__cal = { pointerdowns: [], clicks: [] }
  addEventListener('pointerdown', (e) => __cal.pointerdowns.push({ tipo: e.pointerType, activa: navigator.userActivation ? navigator.userActivation.isActive : null, t: performance.now() }))
  addEventListener('click', () => __cal.clicks.push({ activa: navigator.userActivation ? navigator.userActivation.isActive : null, t: performance.now() }))
  return true
})()`

const EMPUJAR_CALIBRACION = `(() => {
  history.pushState(history.state, '', location.pathname + '#cal')
  return { t: performance.now(), activa: navigator.userActivation ? navigator.userActivation.isActive : null, alguna_vez: navigator.userActivation ? navigator.userActivation.hasBeenActive : null }
})()`

/** Historial limpio: la pagina de afuera, el historial reseteado, `/login` con los oyentes de la calibracion. */
async function documentoDeCalibracion(cdp) {
  await navegar(cdp, AFUERA)
  await cdp.enviar('Page.resetNavigationHistory')
  await navegar(cdp, `${ORIGEN}/login`)
  await evaluar(cdp, INSTALAR_CALIBRACION)
  const punto = await puntoNeutro(cdp, 'body')
  if (!punto) throw new Error('la calibracion no encontro un punto neutro en /login')
  return punto
}

/** Una fila de empuje: devuelve si el atras salteo la entrada de `/login` y los tiempos medidos en la pagina. */
async function filaDeEmpuje(cdp, { clickAntes, esperaMs, clickDespues }) {
  const punto = await documentoDeCalibracion(cdp)
  if (clickAntes) await clickEnPunto(cdp, punto)
  if (esperaMs) await dormir(esperaMs)
  const empuje = await evaluar(cdp, EMPUJAR_CALIBRACION)
  if (clickDespues) await clickEnPunto(cdp, punto)
  const cal = await evaluar(cdp, 'window.__cal')
  const m = await gestoMedido(cdp)
  const click = cal.clicks[0] ?? null
  return {
    salteada: m.despues.ruta === '/login' ? 'no' : 'si',
    entradasSalteadas: m.tupla.entradas_salteadas,
    rutaDespues: m.tupla.ruta_despues,
    msDelClickAlEmpuje: click ? Math.round(empuje.t - click.t) : null,
    activaAlEmpujar: empuje.activa,
    algunaVezActiva: empuje.alguna_vez,
    activaEnElClick: click ? click.activa : null,
  }
}

const CALIBRACION = {
  id: 'C-activacion',
  titulo: 'la calibracion del navegador sobre /login, antes del login: ¿un empuje con activacion es salteable?',
  async correr(cdp) {
    const f1 = await filaDeEmpuje(cdp, { clickAntes: true, esperaMs: 0, clickDespues: false })
    const f2 = await filaDeEmpuje(cdp, { clickAntes: true, esperaMs: LAPSO_SIN_ACTIVACION_MS, clickDespues: false })
    const f3 = await filaDeEmpuje(cdp, { clickAntes: false, esperaMs: 0, clickDespues: true })
    // Fila 4: PRIMERO el toque (documento sin ninguna activacion todavia) y despues el click; al reves
    // el `pointerdown` del toque leeria la activacion del click.
    const punto = await documentoDeCalibracion(cdp)
    await cdp.enviar('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 })
    await cdp.enviar('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: punto.x, y: punto.y }] })
    await dormir(300)
    const trasElToque = await evaluar(cdp, 'window.__cal')
    await cdp.enviar('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] })
    await cdp.enviar('Emulation.setTouchEmulationEnabled', { enabled: false })
    await dormir(200)
    await clickEnPunto(cdp, punto)
    await dormir(200)
    const trasElClick = await evaluar(cdp, 'window.__cal')
    const pdTactil = trasElToque.pointerdowns.find((p) => p.tipo === 'touch') ?? null
    const clickReal4 = trasElClick.clicks.at(-1) ?? null
    const fila = (n, f) => `fila ${n}: salteada=${f.salteada} entradas_salteadas=${f.entradasSalteadas} ruta_despues=${f.rutaDespues} ms_del_click_al_empuje=${f.msDelClickAlEmpuje} isActive_al_empujar=${f.activaAlEmpujar} hasBeenActive_al_empujar=${f.algunaVezActiva} isActive_en_el_click=${f.activaEnElClick}`
    return {
      detalle: (p) => {
        console.log(`${p}${fila(1, f1)}  (click real y empuje a los <=200 ms)`)
        console.log(`${p}${fila(2, f2)}  (click real y empuje a los ${LAPSO_SIN_ACTIVACION_MS} ms)`)
        console.log(`${p}${fila(3, f3)}  (empuje SIN activacion y despues un click real)`)
        console.log(`${p}fila 4: isActive_en_pointerdown_tactil=${pdTactil ? pdTactil.activa : 'sin-pointerdown'} (pointerdowns=${JSON.stringify(trasElToque.pointerdowns.map((x) => x.tipo + ':' + x.activa))}) · isActive_en_el_click_real=${clickReal4 ? clickReal4.activa : 'sin-click'}`)
        const rama = f1.salteada === 'si' ? '(a) PARAR: un empuje con activacion es salteable en este motor' : f2.salteada === 'no' ? '(b) el gate es MAS ESTRICTO que el navegador (pendientes donde un empuje habria servido: la direccion segura)' : '(c) el gate es EXACTO (la activacion transitoria de Chromium)'
        console.log(`${p}rama de la calibracion: ${rama}`)
      },
      medido: {
        fila_1_salteada: f1.salteada,
        isActive_en_el_click: clickReal4 && clickReal4.activa === true ? 'si' : 'no',
      },
      esperado: { fila_1_salteada: 'no', isActive_en_el_click: 'si' },
    }
  },
}

// ── Los recorridos ───────────────────────────────────────────────────────────────────────────────

/** El ultimo registro de armado desde `desde`, o null. */
function ultimoArmado(desde) {
  return registros.slice(desde).filter((r) => r.tipo === 'armado').at(-1) ?? null
}

const RECORRIDOS = [
  {
    id: 'R-1.3-sin-toque',
    titulo: 'entrada DIRECTA a Inicio, SIN tocar nada, UN atras: el costo declarado de la decision (sale sin aviso)',
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
          accion_del_armado: armado.filter((r) => r.tipo === 'armado').at(-1)?.accion ?? 'sin-registro',
          absorbido: m.tupla.absorbido,
          ruta_despues: m.tupla.ruta_despues,
        },
        // La decision del dueno del 2026-10-28 (camino 1): sin activacion no se empuja (pendiente, sin
        // hash), y el atras SALE sin aviso. Es el COSTO DECLARADO, afirmado como tal.
        esperado: { hash_al_entrar: '', accion_del_armado: 'pendiente', absorbido: 'no', ruta_despues: '(afuera)' },
      }
    },
  },
  {
    id: 'R-1.3-con-toque',
    titulo: 'entrada DIRECTA a Inicio, UN toque neutro, UN atras: el hash aparece y el atras avisa y no sale',
    async correr(cdp) {
      const desde = await entrarDirecto(cdp)
      const alEntrar = await foto(cdp)
      const desdeElToque = registros.length
      await tocarLaPantalla(cdp)
      const trasElToque = await foto(cdp)
      const delToque = registros.slice(desdeElToque)
      const m = await gestoMedido(cdp)
      return {
        detalle: (p) => {
          console.log(`${p}al entrar: url=${alEntrar.url} armado=${ultimoArmado(desde)?.accion ?? 'sin-registro'}`)
          console.log(`${p}el toque:`)
          for (const r of delToque) console.log(`${p}  diag ${lineaDeRegistro(r)}`)
          console.log(`${p}tras el toque: url=${trasElToque.url}`)
          imprimirTupla(p, m)
        },
        medido: {
          hash_tras_el_toque: trasElToque.hash,
          absorbido: m.tupla.absorbido,
          ruta_despues: m.tupla.ruta_despues,
          aviso_visible: m.tupla.aviso_visible,
        },
        esperado: { hash_tras_el_toque: '#salir', absorbido: 'si', ruta_despues: ROOT, aviso_visible: 'si' },
      }
    },
  },
]

// ── El arnes ─────────────────────────────────────────────────────────────────────────────────────

function iguales(a, b) { return JSON.stringify(a) === JSON.stringify(b) }

/** Corre un recorrido, imprime su linea `OK `/`FALLA` con sus claves y devuelve si coincidio. */
async function correrYReportar(cdp, rec) {
  const r = await rec.correr(cdp)
  const claves = Object.keys(r.esperado)
  const malas = claves.filter((k) => !iguales(r.medido[k], r.esperado[k]))
  const ok = malas.length === 0
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
  return ok
}

async function main() {
  const modo = process.argv[2] ?? 'dev'
  const gesto = process.argv[3] ?? 'interfaz'
  // El tercer argumento opcional (plan 03-13): ids separados por coma; sin el, corre todo.
  const seleccion = process.argv[4] ? new Set(process.argv[4].split(',').map((s) => s.trim()).filter(Boolean)) : null
  const elegido = (id) => !seleccion || seleccion.has(id)
  const perfil = mkdtempSync(join(tmpdir(), 'forjo-sonda-app-'))
  const dirExt = mkdtempSync(join(tmpdir(), 'forjo-sonda-ext-'))
  const logNext = join(perfil, '..', `forjo-sonda-app-next-${process.pid}.log`)
  let next = null
  let chrome = null
  let cdp = null
  let fallados = 0

  try {
    if (seleccion) {
      const conocidos = new Set([CALIBRACION.id, ...RECORRIDOS.map((r) => r.id)])
      const desconocidos = [...seleccion].filter((id) => !conocidos.has(id))
      if (desconocidos.length > 0) throw new Error(`ids desconocidos en la seleccion: ${desconocidos.join(', ')}`)
      console.log(`seleccion por id: ${[...seleccion].join(', ')}`)
    }
    if (gesto !== 'interfaz' && gesto !== 'entrada') throw new Error(`gesto desconocido "${gesto}" (validos: interfaz, entrada)`)
    const m = verificarModo(modo)
    console.log(`gesto=${gesto} · ${gesto === 'interfaz' ? 'el ATRAS DE LA INTERFAZ (chrome.tabs.goBack: respeta la intervencion de historial)' : 'navegacion a la entrada inmediata anterior (NO respeta la intervencion)'}`)
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
      // La tuberia, ademas del puerto: `Extensions.loadUnpacked` solo existe por la tuberia.
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
    gestoDeAtras = gesto === 'interfaz'
      ? { nombre: 'interfaz', hacer: await prepararAtrasDeLaInterfaz(conectarTuberia(chrome), dirExt) }
      : { nombre: 'entrada' }
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

    // LA CALIBRACION VA PRIMERO, antes del login (el unico recorrido que corre antes de `loguearse`),
    // con la misma linea `OK `/`FALLA` y contada igual en el veredicto.
    let medidos = 0
    if (elegido(CALIBRACION.id)) {
      console.log('')
      medidos++
      if (!(await correrYReportar(cdp, CALIBRACION))) fallados++
    }

    const aCorrer = RECORRIDOS.filter((r) => elegido(r.id))
    if (aCorrer.length > 0) {
      await loguearse(cdp)
      // El ancho del telefono, DESPUES del login: en mobile el formulario vive en una hoja que hay que
      // abrir, y el login no es lo que se mide. La barra de abajo es la del celular (oculta a >= 1024px).
      await cdp.enviar('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
      console.log('')
    }

    for (const rec of aCorrer) {
      medidos++
      if (!(await correrYReportar(cdp, rec))) fallados++
    }

    console.log('── veredicto ─────────────────────────────────────────────────────────────────')
    console.log(`gesto=${gesto} · modo=${modo} · recorridos medidos: ${medidos} · coinciden con lo esperado: ${medidos - fallados} · no coinciden: ${fallados}`)
    console.log('⚠ LO QUE ESTA SONDA NO CIERRA: A11 (Chrome Android / Safari iOS reales). Esto es Chrome de escritorio.')
    if (fallados > 0) {
      console.error('')
      console.error(`${fallados} recorrido(s) no coinciden con lo esperado. Este instrumento MIDE: el esperado de cada`)
      console.error('recorrido es el de la decision del dueno del 2026-10-28 (camino 1); ver 03-DECISION-UAT-3.md.')
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
    try { rmSync(dirExt, { recursive: true, force: true }) } catch { /* lo limpia el sistema */ }
  }
}

await main()
