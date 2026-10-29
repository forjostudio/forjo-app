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
// PLAN 03-14 — EL ATERRIZAJE DEL LOGIN (`G3-4`). `R-login-con-activacion`, el ULTIMO recorrido, entra
// por el formulario con un click real y mide el montaje del panel con la activacion de ese click
// TODAVIA VIGENTE: el unico camino que arma con empuje desde AFUERA del panel, y el unico que ninguna
// sonda habia medido (en `loguearse` el login mas la compilacion tardaban mas que la ventana de
// activacion y el armado quedaba `pendiente`). Lo acompana el instrumento `SCRIPT_DE_LA_HISTORIA`,
// que graba cada `pushState`/`replaceState`/`back`/`go`/`forward` con su pila de JS: es lo que nombra
// QUIEN hizo el retroceso que nadie pidio.
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
// EL ATERRIZAJE DEL LOGIN (plan 03-14, `R-login-con-activacion`):
//   · INTENTOS_DEL_LOGIN — cuantas veces se intenta aterrizar CON la activacion del click vigente antes
//     de declarar que la sonda no reprodujo las condiciones del telefono (P-1). Nunca verde sin ella.
//   · VENTANA_DEL_ATERRIZAJE_MS — la espera quieta despues de llegar a la raiz, para que entren los
//     eventos tardios: el retroceso asincrono, el reemplazo del `refresh` y el `popstate`.
const INTENTOS_DEL_LOGIN = 3
const VENTANA_DEL_ATERRIZAJE_MS = 4000

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
// `tope` (plan 03-13): el chequeo del servidor EXISTENTE espera mas, porque justo despues de un recargado
// en caliente el primer pedido compila y tarda mas de 1,5 s (medido: la sonda lo tomo por muerto).
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
    if (await puertoLibre(lock.port, 60_000)) return null
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

// ── El instrumento de la HISTORIA (plan 03-14): quien llama a la pila, con su pila de JS ─────────────
// Envuelve en `History.prototype` los cinco metodos que mueven o reescriben la pila y graba en el canal
// un registro `sonda-historia` por llamada, ANTES de llamar al original: el metodo, la ruta y el hash
// de antes, el tercer argumento (la URL pedida; vacio en los tres retrocesos), el estado `frj*` y la
// PILA DE JS sin el marco del envoltorio. Es lo que NOMBRA quien hizo un `back()` que nadie pidio.
// ⚠ POR QUE EN EL PROTOTIPO y no en la instancia: Next parchea `pushState`/`replaceState` EN LA
// INSTANCIA capturando el metodo que encuentra al iniciar, asi que el prototipo envuelto al nacer el
// documento atrapa las llamadas del panel, las del router de Next y las de cualquiera.
// ⚠ EL TOPE DE LA PILA se sube adentro del envoltorio y se restaura: el de V8 es de 10 marcos, y la
// limpieza de efectos de React queda mas abajo que eso.
// Se registra SOLO adentro de `R-login-con-activacion` y se quita al terminarlo: los once recorridos
// de antes corren sin el.
const SCRIPT_DE_LA_HISTORIA = `(() => {
  const estadoTexto = () => { try { const s = history.state; if (!s || typeof s !== 'object') return JSON.stringify(s); const o = { claves: Object.keys(s).sort() }; for (const k of Object.keys(s)) if (k.startsWith('frj')) o[k] = s[k]; return JSON.stringify(o) } catch { return '?' } }
  for (const metodo of ['pushState', 'replaceState', 'back', 'go', 'forward']) {
    const original = History.prototype[metodo]
    History.prototype[metodo] = function (...args) {
      try {
        const canal = globalThis.__forjoPanelDiag
        if (Array.isArray(canal) && location.protocol.startsWith('http')) {
          const tope = Error.stackTraceLimit
          Error.stackTraceLimit = 400
          const crudo = new Error().stack || ''
          Error.stackTraceLimit = tope
          const marcos = crudo.split('\\n').slice(2).map((l) => l.trim())
          const pila = marcos.slice(0, 16).join(' | ')
          // La BASE de la pila (los ultimos marcos): la recursion de React por el arbol es mas larga que
          // los 16 de arriba, y lo que distingue el doble montaje del modo estricto de otro desmontaje
          // (\`doubleInvokeEffectsOnFiber\` contra, p. ej., ocultar un arbol) vive abajo.
          const base = marcos.length > 16 ? marcos.slice(-8).join(' | ') : ''
          const urlArg = metodo === 'pushState' || metodo === 'replaceState' ? String(args[2] ?? '') : ''
          canal.push({ tipo: 'sonda-historia', metodo, ts: Date.now(), ruta: location.pathname, hash: location.hash, urlArg, estado: estadoTexto(), pila, base, marcos: marcos.length })
        }
      } catch {}
      return original.apply(this, args)
    }
  }
})()`

/** Los registros espejados, en orden de llegada. La sonda corta por indice entre pasos. */
const registros = []

// ── Las primitivas ───────────────────────────────────────────────────────────────────────────────

async function historial(cdp) {
  const h = await cdp.enviar('Page.getNavigationHistory')
  return {
    indice: h.currentIndex,
    // Normalizada a ruta+hash: Chrome guarda la URL sin el puerto 80, asi que comparar contra ORIGEN no alcanza.
    entradas: h.entries.map((e) => (e.url.startsWith('data:') ? '(afuera)' : /^https?:/.test(e.url) && new URL(e.url).hostname === '127.0.0.1' ? new URL(e.url).pathname + new URL(e.url).hash : e.url)),
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

/**
 * Una linea ASCII por registro del canal: la accion y la regla que la decidio. `t0` (opcional, plan
 * 03-14) imprime el tiempo RELATIVO a un instante (el click del login) en vez del absoluto.
 */
function lineaDeRegistro(r, t0 = null) {
  const t = t0 === null ? '' : ` t=+${r.ts - t0}ms`
  if (r.tipo === 'sonda-historia') return `sonda-historia doc=${r.doc}${t} metodo=${r.metodo} url=${r.ruta}${r.hash} urlArg=${r.urlArg || '(vacio)'} estado=${r.estado}`
  if (t0 !== null) return `${lineaDeRegistro(r)}${t}`
  if (r.tipo === 'armado') return `armado    doc=${r.doc} id=${r.id} duena=${r.duenaFigurando} vivas=${r.instanciasVivas} url=${r.ruta}${r.hash} estado=${r.estado} accion=${r.accion} regla=${reglaDelArmado(r.hechos)} vivo_antes=${r.vivoAntes} vivo_despues=${r.vivoDespues}`
  if (r.tipo === 'retroceso') return `retroceso doc=${r.doc} id=${r.id} duena=${r.duenaFigurando} vivas=${r.instanciasVivas} url=${r.ruta}${r.hash} estado=${r.estado} accion=${r.accion} regla=${reglaDelRetroceso(r.hechos)} holding=${r.hechos?.holding}`
  if (r.tipo === 'desmontaje') return `desmontaje doc=${r.doc} id=${r.id} url=${r.ruta}${r.hash} accion=${r.accion} sigue_montada=${r.hechos?.sigueMontada} nuestro_arriba=${r.hechos?.nuestroArriba} vivo_despues=${r.vivoDespues}`
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

/**
 * El formulario del login, con la pagina YA parada en `/login`: la espera de la hidratacion, el tipeo de
 * email y clave y el click REAL en el boton (plan 03-14: extraida de `loguearse` sin cambio de
 * comportamiento, para que `R-login-con-activacion` entre por EXACTAMENTE el mismo camino; dos caminos
 * de login pueden divergir sin que nadie lo vea).
 */
async function enviarElLogin(cdp) {
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

/** Deja la pagina parada en Inicio CON el sentinel armado (el hash en la URL), o tira. */
async function asegurarArmadoEnInicio(cdp) {
  let f = await foto(cdp)
  if (f.ruta !== ROOT) { await entrarDirecto(cdp); f = await foto(cdp) }
  if (!/^#salir/.test(f.hash)) { await tocarLaPantalla(cdp); f = await foto(cdp) }
  if (!/^#salir/.test(f.hash)) throw new Error(`no se pudo dejar Inicio armado antes de recargar: url=${f.url}`)
  return f
}

/**
 * Recarga y devuelve lo que la recarga PRESERVO (el `frjExit` del estado de la entrada al nacer el
 * documento) contra el `id` que se asigno la instancia nueva, y el primer armado.
 */
async function recargar(cdp) {
  const desde = registros.length
  const cargo = new Promise((ok) => { const t = setTimeout(ok, 150_000); cdp.en('Page.loadEventFired', () => { clearTimeout(t); ok() }) })
  await cdp.enviar('Page.reload', {})
  await cargo
  await asentar(desde)
  const alRecargar = registros.slice(desde)
  const nacido = alRecargar.find((r) => r.tipo === 'sonda-documento-nuevo')
  const primerArmado = alRecargar.find((r) => r.tipo === 'armado') ?? null
  const frjExitPreservado = nacido ? (JSON.parse(nacido.estado || 'null') ?? {}).frjExit ?? null : null
  return { alRecargar, primerArmado, frjExitPreservado }
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
      const armadoAlEntrar = ultimoArmado(desde)
      const desdeElToque = registros.length
      await tocarLaPantalla(cdp)
      const trasElToque = await foto(cdp)
      const delToque = registros.slice(desdeElToque)
      const m = await gestoMedido(cdp)
      return {
        detalle: (p) => {
          console.log(`${p}al entrar: url=${alEntrar.url} armado=${armadoAlEntrar?.accion ?? 'sin-registro'}`)
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
  {
    id: 'R-1.3-recarga-logica',
    titulo: 'la RECARGA del 1.3 por la opcion (A): tres recargas parado en Inicio armado; el armado acredita (none con vivo_despues)',
    async correr(cdp) {
      await entrarDirecto(cdp)
      await tocarLaPantalla(cdp)
      const vueltas = []
      for (let vuelta = 1; vuelta <= 3; vuelta++) {
        await asegurarArmadoEnInicio(cdp)
        const r = await recargar(cdp)
        vueltas.push({ vuelta, ...r })
      }
      return {
        detalle: (p) => {
          for (const v of vueltas) {
            console.log(`${p}Vuelta ${v.vuelta}: frjExit de la entrada preservada=${v.frjExitPreservado} id de la instancia nueva=${v.primerArmado?.id ?? 'sin-registro'} coinciden=${v.frjExitPreservado === (v.primerArmado?.id ?? NaN) ? 'si' : 'no'}`)
            console.log(`${p}  primer armado tras recargar: accion=${v.primerArmado?.accion ?? 'sin-registro'} regla=${reglaDelArmado(v.primerArmado?.hechos)} vivo_despues=${v.primerArmado?.vivoDespues}`)
            for (const r of v.alRecargar) console.log(`${p}    diag ${lineaDeRegistro(r)}`)
          }
        },
        // (A), determinista: con o sin coincidencia de `id`, el primer armado dice `none` (por la
        // septima o por la cuarta) y la referencia queda ACREDITADA.
        medido: Object.fromEntries(vueltas.map((v) => [`vuelta_${v.vuelta}_none_y_acreditado`, v.primerArmado?.accion === 'none' && v.primerArmado?.vivoDespues === true ? 'si' : 'no'])),
        esperado: { vuelta_1_none_y_acreditado: 'si', vuelta_2_none_y_acreditado: 'si', vuelta_3_none_y_acreditado: 'si' },
      }
    },
  },
  {
    id: 'R-1.3-recarga-gesto',
    titulo: 'la RECARGA del 1.3 con el atras de la interfaz: (i) sin tocar despues de recargar, (ii) con un toque — tres vueltas cada una',
    async correr(cdp) {
      const variantes = { i: [], ii: [] }
      for (const variante of ['i', 'ii']) {
        await entrarDirecto(cdp)
        await tocarLaPantalla(cdp)
        for (let vuelta = 1; vuelta <= 3; vuelta++) {
          await asegurarArmadoEnInicio(cdp)
          const r = await recargar(cdp)
          if (variante === 'ii') await tocarLaPantalla(cdp)
          const m = await gestoMedido(cdp)
          variantes[variante].push({ vuelta, ...r, m })
        }
      }
      return {
        detalle: (p) => {
          for (const variante of ['i', 'ii']) {
            for (const v of variantes[variante]) {
              console.log(`${p}(${variante}) vuelta ${v.vuelta}: frjExit preservado=${v.frjExitPreservado} id nuevo=${v.primerArmado?.id ?? 'sin-registro'} primer armado=${v.primerArmado?.accion ?? 'sin-registro'} vivo_despues=${v.primerArmado?.vivoDespues}`)
              imprimirTupla(`${p}  `, v.m)
            }
          }
        },
        // Las ramas, escritas ANTES de medir (plan 03-13, task 3): si (i) sale salteado mientras
        // R-1.3-recarga-logica pasa, es el COSTO declarado y el esperado de (i) se cambia CON LOS
        // NUMEROS pegados aca; si (ii) sale salteado y (i) no, es un DEFECTO y se para.
        medido: Object.fromEntries(['i', 'ii'].flatMap((variante) => variantes[variante].map((v) => [`${variante}_vuelta_${v.vuelta}_absorbido`, v.m.tupla.absorbido]))),
        esperado: {
          i_vuelta_1_absorbido: 'si', i_vuelta_2_absorbido: 'si', i_vuelta_3_absorbido: 'si',
          ii_vuelta_1_absorbido: 'si', ii_vuelta_2_absorbido: 'si', ii_vuelta_3_absorbido: 'si',
        },
      }
    },
  },
  {
    id: 'R-1.1',
    titulo: 'el recorrido del dueno, textual: entrar, tocar Turnos, Clientes y Agenda, tocar Inicio; avisa y despues sale',
    async correr(cdp) {
      await entrarDirecto(cdp)
      for (const href of ['/appointments', '/clients', '/agenda', ROOT]) await tocarEnLaBarra(cdp, href)
      const alLlegar = await foto(cdp)
      const primero = await gestoMedido(cdp)
      const segundo = await gestoMedido(cdp)
      return {
        detalle: (p) => {
          console.log(`${p}al tocar Inicio: url=${alLlegar.url} pila=[${alLlegar.entradas.join(', ')}] actual=${alLlegar.indice}`)
          console.log(`${p}primer atras:`)
          imprimirTupla(`${p}  `, primero)
          console.log(`${p}segundo atras:`)
          imprimirTupla(`${p}  `, segundo)
        },
        medido: {
          ruta_al_llegar: alLlegar.ruta,
          hash_al_llegar: alLlegar.hash,
          primer_atras_absorbido: primero.tupla.absorbido,
          segundo_atras_ruta: segundo.tupla.ruta_despues,
        },
        esperado: { ruta_al_llegar: ROOT, hash_al_llegar: '#salir', primer_atras_absorbido: 'si', segundo_atras_ruta: '(afuera)' },
      }
    },
  },
  {
    id: 'R-3.1',
    titulo: 'el aviso que SE QUEDA: no vence a los 2,5 s ni a los 10 s, con el aviso el atras sale; un toque lo baja y re-arma',
    async correr(cdp) {
      // MITAD A — el punto de partida del 1.2 (entrar, tocar Clientes, tocar Inicio): armado tocando.
      await entrarDirecto(cdp)
      await tocarEnLaBarra(cdp, '/clients')
      await tocarEnLaBarra(cdp, ROOT)
      const primero = await gestoMedido(cdp)
      // EL PISO DEL TIEMPO, medido DENTRO de la pagina: cada espera es la espera MAS el margen, y el
      // piso compara contra la espera SOLA. Con el margen bajado a proposito, la espera real se acorta y
      // el piso tiene que decir que no.
      const t0 = await evaluar(cdp, 'Date.now()')
      const arranque = Date.now()
      await dormir(Math.max(0, ESPERA_CORTA_MS + MARGEN_MS))
      const aLaCorta = await foto(cdp)
      await dormir(Math.max(0, ESPERA_LARGA_MS + MARGEN_MS - (Date.now() - arranque)))
      const aLaLarga = await foto(cdp)
      const t1 = await evaluar(cdp, 'Date.now()')
      const transcurrido = t1 - t0
      const conElAviso = await gestoMedido(cdp)
      // MITAD B — otra vez desde el principio hasta el aviso visible, y un toque.
      await entrarDirecto(cdp)
      await tocarEnLaBarra(cdp, '/clients')
      await tocarEnLaBarra(cdp, ROOT)
      const primeroB = await gestoMedido(cdp)
      const desdeElToque = registros.length
      await tocarLaPantalla(cdp)
      const trasElToque = await foto(cdp)
      const delToque = registros.slice(desdeElToque)
      const otraVez = await gestoMedido(cdp)
      return {
        detalle: (p) => {
          console.log(`${p}MITAD A · primer atras:`)
          imprimirTupla(`${p}  `, primero)
          console.log(`${p}transcurrido=${transcurrido} ms dentro de la pagina (espera corta=${ESPERA_CORTA_MS} ms, larga=${ESPERA_LARGA_MS} ms, margen=${MARGEN_MS} ms)`)
          console.log(`${p}a la espera corta: url=${aLaCorta.url} aviso=${aLaCorta.aviso ? 'visible' : 'oculto'} · a la larga: url=${aLaLarga.url} aviso=${aLaLarga.aviso ? 'visible' : 'oculto'}`)
          console.log(`${p}atras con el aviso visible:`)
          imprimirTupla(`${p}  `, conElAviso)
          console.log(`${p}MITAD B · primer atras:`)
          imprimirTupla(`${p}  `, primeroB)
          console.log(`${p}el toque:`)
          for (const r of delToque) console.log(`${p}  diag ${lineaDeRegistro(r)}`)
          console.log(`${p}tras el toque: url=${trasElToque.url} aviso=${trasElToque.aviso ? 'visible' : 'oculto'}`)
          console.log(`${p}el atras siguiente:`)
          imprimirTupla(`${p}  `, otraVez)
        },
        medido: {
          primer_atras_absorbido: primero.tupla.absorbido,
          aviso_sigue_a_la_espera_corta: aLaCorta.aviso ? 'si' : 'no',
          hash_a_la_espera_corta: aLaCorta.hash,
          aviso_sigue_a_la_espera_larga: aLaLarga.aviso ? 'si' : 'no',
          transcurrido_supera_la_espera: transcurrido > ESPERA_LARGA_MS ? 'si' : 'no',
          atras_con_el_aviso_ruta: conElAviso.tupla.ruta_despues,
          b_primer_atras_absorbido: primeroB.tupla.absorbido,
          b_el_toque_bajo_el_aviso: trasElToque.aviso ? 'no' : 'si',
          b_el_hash_volvio: trasElToque.hash,
          b_el_atras_vuelve_a_avisar: otraVez.tupla.absorbido,
        },
        esperado: {
          primer_atras_absorbido: 'si',
          aviso_sigue_a_la_espera_corta: 'si',
          hash_a_la_espera_corta: '',
          aviso_sigue_a_la_espera_larga: 'si',
          transcurrido_supera_la_espera: 'si',
          atras_con_el_aviso_ruta: '(afuera)',
          b_primer_atras_absorbido: 'si',
          b_el_toque_bajo_el_aviso: 'si',
          b_el_hash_volvio: '#salir',
          b_el_atras_vuelve_a_avisar: 'si',
        },
      }
    },
  },
  {
    id: 'R-1.4',
    titulo: 'llegar a Inicio CON EL ATRAS: sin hash, armado pendiente y el atras siguiente sale (la consecuencia declarada); con un toque, avisa',
    async correr(cdp) {
      const mitad = async (conToque) => {
        await entrarDirecto(cdp)
        await tocarEnLaBarra(cdp, '/clients')
        await tocarEnLaBarra(cdp, ROOT)
        await tocarEnLaBarra(cdp, '/clients')
        // Para que la activacion del toque ya no este vigente y el resultado no dependa de la velocidad.
        await dormir(LAPSO_SIN_ACTIVACION_MS)
        const desde = registros.length
        const vuelta = await gestoMedido(cdp)
        await asentar(desde, 3_000)
        const armadoAlVolver = registros.slice(desde).filter((r) => r.tipo === 'armado').at(-1) ?? null
        const alVolver = await foto(cdp)
        if (conToque) await tocarLaPantalla(cdp)
        const trasElToque = await foto(cdp)
        const siguiente = await gestoMedido(cdp)
        return { vuelta, armadoAlVolver, alVolver, trasElToque, siguiente }
      }
      const a = await mitad(false)
      const b = await mitad(true)
      return {
        detalle: (p) => {
          for (const [nombre, x] of [['MITAD A (sin tocar)', a], ['MITAD B (con un toque)', b]]) {
            console.log(`${p}${nombre} · el atras que vuelve a Inicio:`)
            imprimirTupla(`${p}  `, x.vuelta)
            console.log(`${p}  armado al volver: ${x.armadoAlVolver ? lineaDeRegistro(x.armadoAlVolver) : 'sin-registro'}`)
            console.log(`${p}  al volver: url=${x.alVolver.url} aviso=${x.alVolver.aviso ? 'visible' : 'oculto'} · tras el toque: url=${x.trasElToque.url}`)
            console.log(`${p}  el atras siguiente:`)
            imprimirTupla(`${p}    `, x.siguiente)
          }
        },
        medido: {
          a_ruta_al_volver: a.alVolver.ruta,
          a_hash_al_volver: a.alVolver.hash,
          a_armado_al_volver: a.armadoAlVolver?.accion ?? 'sin-registro',
          a_aviso_al_volver: a.alVolver.aviso ? 'si' : 'no',
          a_el_atras_siguiente_ruta: a.siguiente.tupla.ruta_despues,
          b_hash_tras_el_toque: b.trasElToque.hash,
          b_el_atras_siguiente_absorbido: b.siguiente.tupla.absorbido,
        },
        esperado: {
          a_ruta_al_volver: ROOT,
          a_hash_al_volver: '',
          a_armado_al_volver: 'pendiente',
          a_aviso_al_volver: 'no',
          a_el_atras_siguiente_ruta: '(afuera)',
          b_hash_tras_el_toque: '#salir',
          b_el_atras_siguiente_absorbido: 'si',
        },
      }
    },
  },
  {
    id: 'R-barra-con-aviso',
    titulo: 'tocar Clientes en la barra con el aviso VISIBLE: el aviso se va y la pila queda sin #salir enterrado',
    async correr(cdp) {
      await entrarDirecto(cdp)
      await tocarEnLaBarra(cdp, '/clients')
      await tocarEnLaBarra(cdp, ROOT)
      const atras = await gestoMedido(cdp)
      const desde = registros.length
      await tocarEnLaBarra(cdp, '/clients')
      const toque = registros.slice(desde).find((r) => r.tipo === 'toque') ?? null
      const f = await foto(cdp)
      const camino = f.entradas.slice(0, f.indice + 1)
      return {
        detalle: (p) => {
          console.log(`${p}el atras que levanta el aviso:`)
          imprimirTupla(`${p}  `, atras)
          console.log(`${p}el toque: ${toque ? lineaDeRegistro(toque) : 'sin-registro'}`)
          console.log(`${p}pila=[${f.entradas.join(', ')}] actual=${f.indice}`)
        },
        medido: {
          aviso_antes_del_toque: atras.tupla.aviso_visible,
          ruta: f.ruta,
          aviso_visible: f.aviso ? 'si' : 'no',
          pila_hasta_la_actual: camino.join(','),
          salir_en_el_camino_del_atras: camino.some((e) => e.includes('#salir')) ? 'si' : 'no',
          accion_del_toque: toque?.accion ?? 'sin-registro',
        },
        esperado: {
          aviso_antes_del_toque: 'si',
          ruta: '/clients',
          aviso_visible: 'no',
          pila_hasta_la_actual: `(afuera),${ROOT},/clients`,
          salir_en_el_camino_del_atras: 'no',
          accion_del_toque: 'drop',
        },
      }
    },
  },
  {
    id: 'R-barra-pendiente',
    titulo: 'tocar Clientes en la barra recien entrado directo (armado pendiente): la sesion abre sin armar y la pila queda sin #salir',
    async correr(cdp) {
      await entrarDirecto(cdp)
      const desde = registros.length
      await tocarEnLaBarra(cdp, '/clients')
      const toque = registros.slice(desde).find((r) => r.tipo === 'toque') ?? null
      const f = await foto(cdp)
      const camino = f.entradas.slice(0, f.indice + 1)
      return {
        detalle: (p) => {
          console.log(`${p}el toque: ${toque ? lineaDeRegistro(toque) : 'sin-registro'}`)
          console.log(`${p}pila=[${f.entradas.join(', ')}] actual=${f.indice}`)
          for (const r of registros.slice(desde)) console.log(`${p}  diag ${lineaDeRegistro(r)}`)
        },
        medido: {
          ruta: f.ruta,
          pila_hasta_la_actual: camino.join(','),
          salir_en_el_camino_del_atras: camino.some((e) => e.includes('#salir')) ? 'si' : 'no',
          gesto_tomado: toque?.hechos?.gestoTomado === true ? 'si' : 'no',
          accion_del_toque: toque?.accion ?? 'sin-registro',
        },
        esperado: {
          ruta: '/clients',
          pila_hasta_la_actual: `(afuera),${ROOT},/clients`,
          salir_en_el_camino_del_atras: 'no',
          gesto_tomado: 'si',
          accion_del_toque: 'none',
        },
      }
    },
  },
  {
    id: 'R-lateral',
    titulo: 'el hallazgo lateral del plan 03-12: tocar Clientes parado en Inicio ARMADO; el consumo se ignora y el armado queda pendiente, sin #salir enterrado',
    async correr(cdp) {
      await entrarDirecto(cdp)
      await tocarLaPantalla(cdp)
      const armado = await foto(cdp)
      const desde = registros.length
      await tocarEnLaBarra(cdp, '/clients')
      const regs = registros.slice(desde)
      const iRetroceso = regs.findIndex((r) => r.tipo === 'retroceso')
      const retroceso = iRetroceso >= 0 ? regs[iRetroceso] : null
      const armadoTrasElConsumo = iRetroceso >= 0 ? regs.slice(iRetroceso + 1).find((r) => r.tipo === 'armado') ?? null : null
      const f = await foto(cdp)
      const camino = f.entradas.slice(0, f.indice + 1)
      return {
        detalle: (p) => {
          console.log(`${p}armado tocando: url=${armado.url} pila=[${armado.entradas.join(', ')}] actual=${armado.indice}`)
          for (const r of regs) console.log(`${p}  diag ${lineaDeRegistro(r)}`)
          console.log(`${p}pila=[${f.entradas.join(', ')}] actual=${f.indice}`)
        },
        medido: {
          hash_armado: armado.hash,
          ruta: f.ruta,
          pila_hasta_la_actual: camino.join(','),
          salir_en_el_camino_del_atras: camino.some((e) => e.includes('#salir')) ? 'si' : 'no',
          retroceso_del_consumo: retroceso?.accion ?? 'sin-registro',
          armado_tras_el_consumo: armadoTrasElConsumo?.accion ?? 'sin-registro',
        },
        esperado: {
          hash_armado: '#salir',
          ruta: '/clients',
          pila_hasta_la_actual: `(afuera),${ROOT},/clients`,
          salir_en_el_camino_del_atras: 'no',
          retroceso_del_consumo: 'ignore',
          armado_tras_el_consumo: 'pendiente',
        },
      }
    },
  },
  {
    // ⚠ ULTIMO A PROPOSITO: cierra la sesion y vuelve a abrirla, y eso no puede ensuciar a los otros.
    id: 'R-login-con-activacion',
    titulo: 'G3-4: loguearse por el formulario con la activacion del click VIGENTE al aterrizar; sin aviso, sin popstate, con #salir, y el atras tras un toque avisa',
    async correr(cdp) {
      // (a) El ancho de escritorio por omision, como `loguearse`: en mobile el formulario vive en una
      // hoja que hay que abrir. El hook monta y corre IGUAL en cualquier ancho (D-05: `lg:hidden` es
      // CSS, no una consulta del mecanismo), y el formulario del TELEFONO
      // (`components/auth/mobile-login-hero.tsx`) comparte la secuencia `router.push('/dashboard')` +
      // `router.refresh()` del de escritorio.
      await cdp.enviar('Emulation.clearDeviceMetricsOverride')
      // (b) El instrumento de la historia, solo para este recorrido (se quita en el `finally`).
      const { identifier } = await cdp.enviar('Page.addScriptToEvaluateOnNewDocument', { source: SCRIPT_DE_LA_HISTORIA })
      const intentos = []
      let vale = null
      let toque = null
      let m = null
      try {
        // (c) Hasta INTENTOS_DEL_LOGIN intentos. LA GUARDA DE LLEGADA: un intento vale SOLO si algun
        // armado del aterrizaje empujo (`accion === 'arm'`), o sea si la activacion del click del login
        // seguia vigente al montar el panel — la condicion del telefono. Con `pendiente` la sonda NO
        // reprodujo lo que el telefono hizo, y medir ahi seria el verde sobre nada.
        for (let n = 1; n <= INTENTOS_DEL_LOGIN && !vale; n++) {
          // Cerrar la sesion del PERFIL DESECHABLE de la sonda (nunca del navegador del dueno). El origen
          // se normaliza con `URL`: Chrome omite el puerto 80.
          await cdp.enviar('Network.clearBrowserCookies')
          await cdp.enviar('Storage.clearDataForOrigin', { origin: new URL(ORIGEN).origin, storageTypes: 'local_storage,session_storage' })
          await navegar(cdp, AFUERA)
          await cdp.enviar('Page.resetNavigationHistory')
          await navegar(cdp, `${ORIGEN}/login`)
          // Si el guard la mando a la raiz, la sesion NO se borro: es un error del instrumento, no un veredicto.
          const rutaDelLogin = await evaluar(cdp, 'location.pathname')
          if (rutaDelLogin !== '/login') throw new Error(`el cierre de sesion del instrumento fallo: /login redirigio a ${rutaDelLogin}`)
          const desde = registros.length
          await enviarElLogin(cdp)
          const click = await esperarRegistro(desde, 'sonda-click', 5_000)
          if (!click || click.isActive !== true) throw new Error(`el click del login no llego con activacion (sonda-click=${click ? `isActive=${click.isActive}` : 'ninguno'})`)
          const t0 = click.ts
          const tope = Date.now() + 60_000
          let ruta = null
          while (Date.now() < tope) {
            ruta = await evaluar(cdp, 'location.pathname').catch(() => null)
            if (ruta === ROOT) break
            await dormir(100)
          }
          if (ruta !== ROOT) throw new Error(`el login no aterrizo en ${ROOT} en 60 s (ruta=${ruta})`)
          // `/dashboard` ya esta compilado (lo compilo `loguearse` al principio de `main`): la espera quieta
          // es para los eventos tardios, no para el compilador.
          await dormir(VENTANA_DEL_ATERRIZAJE_MS)
          const regs = registros.slice(desde)
          const armados = regs.filter((r) => r.tipo === 'armado')
          const valio = armados.some((r) => r.accion === 'arm')
          const primero = armados[0]
          console.log(`      intento ${n}: ms del click al primer armado=${primero ? primero.ts - t0 : 'sin-armado'} acciones=[${armados.map((r) => r.accion).join(',')}] ids=[${armados.map((r) => r.id).join(',')}]${valio ? ' · VALE (armado con empuje)' : ' · no vale (sin empuje: la activacion vencio)'}`)
          intentos.push({ n, valio })
          if (valio) vale = { n, t0, regs, armados, foto: await foto(cdp) }
        }
        if (vale) {
          // (e) El camino 1 despues del aterrizaje: un toque neutro y el atras de la interfaz.
          toque = await tocarLaPantalla(cdp)
          m = await gestoMedido(cdp)
        } else {
          console.log(`      NO REPRODUCE LAS CONDICIONES DEL TELEFONO: ninguno de ${INTENTOS_DEL_LOGIN} intentos armo con empuje (la activacion del click vencio antes de montar el panel)`)
        }
      } finally {
        // (f) El instrumento se quita y vuelve el ancho del telefono.
        await cdp.enviar('Page.removeScriptToEvaluateOnNewDocument', { identifier })
        await cdp.enviar('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
      }
      // Las firmas de las dos hipotesis, CALCULADAS sobre los registros del aterrizaje e impresas para
      // el veredicto. No deciden nada solas: el veredicto lo escribe la persona con estos numeros.
      const firmas = (v) => {
        const regs = v.regs
        const iArm = regs.findIndex((r) => r.tipo === 'armado' && r.accion === 'arm')
        const arm = iArm >= 0 ? regs[iArm] : null
        const despues = (pred) => regs.findIndex((r, i) => i > iArm && pred(r))
        const iNone = despues((r) => r.tipo === 'armado' && r.accion === 'none')
        const none = iNone >= 0 ? regs[iNone] : null
        const iPop = despues((r) => r.tipo === 'sonda-popstate')
        const retrocesos = regs.filter((r, i) => i > iArm && (iPop < 0 || i < iPop) && r.tipo === 'sonda-historia' && (r.metodo === 'back' || r.metodo === 'go'))
        const MARCOS_DEL_DESMONTAJE = /disconnectPassiveEffect|doubleInvokeEffectsOnFiber|commitHookEffectListUnmount|safelyCallDestroy|recursivelyTraverseDisconnectPassiveEffects/
        const MARCOS_DEL_ESTRICTO = /doubleInvokeEffectsOnFiber|doubleInvokeEffectsInDEVIfNecessary|recursivelyTraverseAndDoubleInvokeEffectsInDEV|commitDoubleInvokeEffectsInDEV/
        const delDesmontaje = retrocesos.find((r) => MARCOS_DEL_DESMONTAJE.test(r.pila))
        const hint = regs.find((r, i) => i > iArm && r.tipo === 'retroceso' && r.accion === 'hint' && r.hechos?.holding === true) ?? null
        const iPushSalir = regs.findIndex((r) => r.tipo === 'sonda-historia' && r.metodo === 'pushState' && /#salir/.test(r.urlArg))
        // H2 exige que el reemplazo aterrice ENTRE el empuje del sentinel y el `popstate` (un reemplazo
        // posterior al `popstate` es la REACCION del router a ese `popstate`, no su causa).
        const reemplazoDeNext = iPushSalir < 0 ? null : regs.find((r, i) => i > iPushSalir && (iPop < 0 || i < iPop) && r.tipo === 'sonda-historia' && r.metodo === 'replaceState' && !/#salir/.test(r.urlArg) && !/panel-branch|usePanelBranch/.test(r.pila)) ?? null
        const nombres = (texto, re) => [...new Set(texto.match(new RegExp(re.source, 'g')) ?? [])].join(',') || '(ninguno)'
        return {
          h1: `firma H1: arm->none mismo id=${arm && none && none.id === arm.id ? 'si' : 'no'} (arm id=${arm?.id ?? '-'} none id=${none?.id ?? '-'}) · back/go entre el arm y el popstate=${retrocesos.length} · con marcos del desmontaje de React=${delDesmontaje ? 'si' : 'no'} · con marcos del modo estricto en la base=${delDesmontaje && MARCOS_DEL_ESTRICTO.test(delDesmontaje.base) ? 'si' : 'no'} · retroceso hint con holding=true=${hint ? `si (id=${hint.id})` : 'no'}`,
          h2: `firma H2: pushState del sentinel=${iPushSalir >= 0 ? 'si' : 'no'} · replaceState ENTRE el empuje y el popstate, sin #salir y sin el panel en la pila=${reemplazoDeNext ? `si (urlArg=${reemplazoDeNext.urlArg || '(vacio)'})` : 'no'} · el popstate atribuido a=${delDesmontaje ? 'el back del desmontaje' : retrocesos.length ? 'un back/go sin desmontaje' : 'ningun back/go registrado'}`,
          marcos: delDesmontaje ? `arriba=[${nombres(delDesmontaje.pila, MARCOS_DEL_DESMONTAJE)}] base=[${nombres(delDesmontaje.base, MARCOS_DEL_ESTRICTO)}] (marcos totales=${delDesmontaje.marcos})` : '(ninguno)',
        }
      }
      // EL ORDEN DEL CONSUMO DIFERIDO (plan 03-14, rama H1): el registro `desmontaje` tiene que llegar
      // DESPUES del `armado` `none` del remontaje (el microtask corre despues de que React reconecta) y
      // decir `keep`. Si aterriza antes, o con `sigueMontada` en falso dentro del ciclo del modo
      // estricto, es la regla P-5 y se para: no se escala a un temporizador.
      const ordenDelDesmontaje = (v) => {
        if (!v) return { accion: 'sin-medir', despues: 'sin-medir' }
        const iDes = v.regs.findIndex((r) => r.tipo === 'desmontaje')
        const iNone = v.regs.findIndex((r) => r.tipo === 'armado' && r.accion === 'none')
        return {
          accion: iDes >= 0 ? v.regs[iDes].accion : 'sin-registro',
          despues: iDes >= 0 && iNone >= 0 && iDes > iNone ? 'si' : 'no',
        }
      }
      const orden = ordenDelDesmontaje(vale)
      return {
        detalle: (p) => {
          for (const x of intentos) console.log(`${p}intento ${x.n}: ${x.valio ? 'VALE' : 'no vale'}`)
          if (!vale) return
          const f = firmas(vale)
          console.log(`${p}intento que vale: ${vale.n} · al aterrizar (tras ${VENTANA_DEL_ATERRIZAJE_MS} ms quietos): url=${vale.foto.url} aviso=${vale.foto.aviso ? 'visible' : 'oculto'} pila=[${vale.foto.entradas.join(', ')}] actual=${vale.foto.indice}`)
          console.log(`${p}los registros del aterrizaje, con el tiempo relativo al click del login:`)
          for (const r of vale.regs) {
            console.log(`${p}  diag ${lineaDeRegistro(r, vale.t0)}`)
            if (r.tipo === 'sonda-historia') {
              console.log(`${p}       pila: ${r.pila}`)
              if (r.base) console.log(`${p}       base (${r.marcos} marcos): ${r.base}`)
            }
          }
          console.log(`${p}${firmaDelMontaje(vale.regs)}`)
          console.log(`${p}${f.h1}`)
          console.log(`${p}  marcos del desmontaje nombrados en la pila del back: ${f.marcos}`)
          console.log(`${p}${f.h2}`)
          console.log(`${p}el toque despues del aterrizaje: ${toque ? `isActive=${toque.isActive}` : 'sin-toque'}`)
          imprimirTupla(p, m)
        },
        medido: {
          llegada_con_activacion: vale ? 'si' : 'no',
          popstates_al_aterrizar: vale ? vale.regs.filter((r) => r.tipo === 'sonda-popstate').length : 'sin-medir',
          aviso_al_aterrizar: vale ? (vale.foto.aviso ? 'si' : 'no') : 'sin-medir',
          hash_al_aterrizar: vale ? vale.foto.hash : 'sin-medir',
          atras_tras_un_toque_absorbido: m ? m.tupla.absorbido : 'sin-medir',
          accion_del_desmontaje: orden.accion,
          desmontaje_despues_del_remontaje: orden.despues,
        },
        // LA PROPIEDAD DESPUES DEL ARREGLO (MOB-05 con el camino 1 intacto): con la activacion vigente al
        // aterrizar, Inicio arma CON el hash, sin ningun `popstate` que nadie pidio y sin aviso; y el
        // primer atras despues de un toque avisa y no sale.
        esperado: {
          llegada_con_activacion: 'si',
          popstates_al_aterrizar: 0,
          aviso_al_aterrizar: 'no',
          hash_al_aterrizar: '#salir',
          atras_tras_un_toque_absorbido: 'si',
          // Rama H1 del plan 03-14: el consumo diferido conserva el sentinel y aterriza DESPUES del remontaje.
          accion_del_desmontaje: 'keep',
          desmontaje_despues_del_remontaje: 'si',
        },
      }
    },
  },
]

/** Lo que cierra cada recorrido, impreso en el veredicto. */
const QUE_CIERRA = {
  'C-activacion': 'la premisa: un empuje con activacion NO es salteable en este motor (y si isActive es exacto o mas estricto)',
  'R-1.3-sin-toque': 'G3-3, el costo declarado: sin tocar no se empuja (pendiente, sin hash) y el atras sale',
  'R-1.3-con-toque': 'G3-3: con un toque el hash aparece y el primer atras avisa y no sale',
  'R-1.3-recarga-logica': 'la recarga del 1.3 por (A): el armado acredita sobre la marca de una instancia muerta',
  'R-1.3-recarga-gesto': 'la recarga del 1.3 con el atras de la interfaz, sin y con toque despues de recargar',
  'R-1.1': 'G3-1 re-medido con el gate de activacion: llegar tocando Inicio arma y avisa',
  'R-3.1': 'G3-2: el aviso se queda (piso del tiempo probado), con el aviso el atras sale, el toque re-arma',
  'R-1.4': 'la consecuencia declarada: llegar a Inicio con el atras no arma; con un toque, si',
  'R-barra-con-aviso': 'el toque que navega con el aviso visible: baja el aviso, no arma, pila sin #salir',
  'R-barra-pendiente': 'el toque que navega con el armado pendiente: no arma, pila sin #salir',
  'R-lateral': 'el hallazgo lateral del plan 03-12: el reintento del consumo queda pendiente, sin #salir enterrado',
  'R-login-con-activacion': 'G3-4 (plan 03-14): el aterrizaje del login con la activacion vigente, sin aviso solo, sin popstate y con #salir',
}

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
    console.log('lo que cierra cada recorrido (plan 03-13, camino 1 del dueno + opcion (A)):')
    for (const [id, que] of Object.entries(QUE_CIERRA)) if (elegido(id)) console.log(`  ${id.padEnd(22)} ${que}`)
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
