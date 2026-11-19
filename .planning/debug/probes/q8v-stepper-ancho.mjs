#!/usr/bin/env node
// ── Sonda del ancho del stepper del onboarding (quick 261119-q8v, WR-01) ─────────────────────────
//
// QUE MIDE, en la app real (un `next dev` propio en el 3031, o el existente de este repo) con un Chrome
// headless por CDP: si el stepper de 5 nodos (`components/onboarding/onboarding-stepper.tsx`) entra en el
// ancho util de su contenedor real, en el wizard (`/onboarding`, paso 1 activo) y en el paso 5
// (`/onboarding/integraciones`, Integraciones activo), a 375, 640, 720, 768 y 1024 px de viewport.
//
// Por cada ancho y ruta imprime:
//   scrollW / clientW   del stepper (el criterio pedido: scrollWidth <= clientWidth)
//   contenido           suma de los anchos de los pasos (incluye conectores y sus margenes). Con
//                       `justify-center` el desborde sale por LOS DOS lados y el izquierdo no suma a
//                       scrollWidth, por eso se mide aparte.
//   izq / der           cuanto se sale el primer nodo por la izquierda y el ultimo por la derecha
//   doc                 scrollWidth vs clientWidth del documento (scroll horizontal de la pagina)
//   etiquetas           cuantas etiquetas se ven (a partir de `sm` se ven las 5)
// `cabe` = contenido <= clientW, sin salida por ningun lado y sin scroll horizontal del documento.
//
// EL ESPERADO esta escrito ANTES de la primera corrida (ver ESPERADO): con el codigo de 16eff1b (`antes`)
// el review calcula ~715 px de contenido desde `sm` contra 608/672 px utiles -> no cabe en 640/720/768/1024
// y si cabe en 375 (308 contra 343). Con el arreglo (`despues`) tiene que caber en los cinco anchos.
//
// LOGIN: el negocio sembrado (`supabase/seed.sql`, vertical general -> 5 pasos). El wizard no exige que
// el usuario no tenga negocio, asi que con ese usuario se renderiza igual: mide el componente real en su
// contenedor real. Si el entorno local no tiene MP ni Google configurados, `/onboarding/integraciones`
// redirige a /dashboard y esa ruta sale como `no-medible` (el wizard alcanza para el componente).
//
// COMO SE CORRE (levanta servidor y navegador -> siempre por el turno):
//   node scripts/con-turno.mjs node .planning/debug/probes/q8v-stepper-ancho.mjs <antes|despues>
//
// QUE NO CIERRA: Safari/Chrome de telefono reales y el build de produccion.

import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, readFileSync, createWriteStream } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const PUERTO_APP = 3031
const PUERTO_CDP = 9335
let ORIGEN = `http://127.0.0.1:${PUERTO_APP}`
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const REPO = process.cwd()
const EMAIL = 'test@forjo.local'
const CLAVE = 'Forjo1234!'
const ANCHOS = [375, 640, 720, 768, 1024]
const RUTAS = ['/onboarding', '/onboarding/integraciones']
const NODOS = 5

// El esperado, fijado antes de medir: true = cabe.
const ESPERADO = {
  antes: { 375: true, 640: false, 720: false, 768: false, 1024: false },
  despues: { 375: true, 640: true, 720: true, 768: true, 1024: true },
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms))

async function puertoLibre(puerto, tope = 1500) {
  try { await fetch(`http://127.0.0.1:${puerto}/`, { signal: AbortSignal.timeout(tope) }); return false } catch { return true }
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
    try { const r = await fetch(`${ORIGEN}/login`, { signal: AbortSignal.timeout(60_000) }); if (r.status < 500) return r.status } catch { /* todavia no */ }
    await dormir(1000)
  }
  throw new Error(`el servidor de Next no respondio en ${ORIGEN} en 180 s`)
}

// La guarda de g04-scroll-y-recarga.mjs: un `next dev` recien levantado a veces sirve un arbol de rutas
// incompleto (`/login` 404). Se exige 200 y, si no llega, se reinicia el servidor PROPIO.
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
    if (await puertoLibre(lock.port, 60_000)) return null
    return { pid: lock.pid, port: lock.port, origen: `http://127.0.0.1:${lock.port}` }
  } catch { return null }
}

function matarArbol(hijo) {
  if (!hijo || hijo.exitCode !== null) return
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(hijo.pid), '/T', '/F'], { stdio: 'ignore' })
  else { try { process.kill(-hijo.pid, 'SIGKILL') } catch { try { hijo.kill('SIGKILL') } catch { /* ya murio */ } } }
}

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
    ws.addEventListener('open', () => resolve({
      enviar(metodo, params = {}) {
        const id = siguienteId++
        ws.send(JSON.stringify({ id, method: metodo, params }))
        return new Promise((ok, fail) => pendientes.set(id, { ok, fail }))
      },
      en(evento, fn) { if (!oyentes.has(evento)) oyentes.set(evento, []); oyentes.get(evento).push(fn) },
      cerrar() { try { ws.close() } catch { /* ya cerrado */ } },
    }))
  })
}

async function descubrirTarget() {
  for (let i = 0; i < 80; i++) {
    try {
      const page = (await (await fetch(`http://127.0.0.1:${PUERTO_CDP}/json/list`)).json()).find((t) => t.type === 'page' && t.webSocketDebuggerUrl)
      if (page) return page
    } catch { /* todavia no */ }
    await dormir(125)
  }
  throw new Error(`Chrome no publico ningun target en el puerto ${PUERTO_CDP}`)
}

async function evaluar(cdp, expresion) {
  const r = await cdp.enviar('Runtime.evaluate', { expression: expresion, returnByValue: true, awaitPromise: true })
  if (r.exceptionDetails) throw new Error(`la pagina tiro: ${r.exceptionDetails.text} ${r.exceptionDetails.exception?.description ?? ''}`)
  return r.result.value
}

async function navegar(cdp, url) {
  const cargo = new Promise((ok) => {
    const t = setTimeout(ok, 150_000)
    cdp.en('Page.loadEventFired', () => { clearTimeout(t); ok() })
  })
  await cdp.enviar('Page.navigate', { url })
  await cargo
}

async function clickReal(cdp, selector) {
  const p = await evaluar(cdp, `(() => { const b = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 } })()`)
  for (const type of ['mousePressed', 'mouseReleased']) {
    await cdp.enviar('Input.dispatchMouseEvent', { type, x: p.x, y: p.y, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 })
  }
}

async function loguearse(cdp) {
  await navegar(cdp, `${ORIGEN}/login`)
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
  const tope = Date.now() + 120_000
  while (Date.now() < tope) {
    const r = await evaluar(cdp, 'location.pathname').catch(() => null)
    if (r && r !== '/login') break
    await dormir(300)
  }
  const ruta = await evaluar(cdp, 'location.pathname')
  if (ruta === '/login') throw new Error('el login no salio de /login')
  console.log(`login OK: aterrizo en ${ruta}`)
}

// La medicion de una pagina ya cargada. `null` si no hay stepper (la ruta redirigio).
const EXPR_MEDIR = `(async () => {
  await document.fonts.ready
  const nodo = document.querySelector('[aria-current="step"]')
  if (!nodo) return null
  const raiz = nodo.parentElement.parentElement.parentElement
  const pasos = [...raiz.children]
  const r = raiz.getBoundingClientRect()
  const primero = pasos[0].getBoundingClientRect()
  const ultimo = pasos[pasos.length - 1].getBoundingClientRect()
  const contenido = pasos.reduce((s, p) => s + p.getBoundingClientRect().width, 0)
  const etiquetas = [...raiz.querySelectorAll('span')].filter((s) => s.getBoundingClientRect().width > 0)
  return {
    ruta: location.pathname,
    nodos: pasos.length,
    activo: nodo.textContent.trim() || '(check)',
    scrollW: raiz.scrollWidth,
    clientW: raiz.clientWidth,
    contenido: Math.round(contenido * 10) / 10,
    izq: Math.round((r.left - primero.left) * 10) / 10,
    der: Math.round((ultimo.right - r.right) * 10) / 10,
    docScroll: document.documentElement.scrollWidth,
    docClient: document.documentElement.clientWidth,
    etiquetas: etiquetas.length,
    anchosEtiquetas: etiquetas.map((s) => s.textContent.trim() + '=' + Math.round(s.getBoundingClientRect().width)).join(' '),
    conector: (() => { const c = pasos[0].children[1]; return c ? Math.round(c.getBoundingClientRect().width) : null })(),
  }
})()`

async function medir(cdp, ruta) {
  await navegar(cdp, ORIGEN + ruta)
  const tope = Date.now() + 90_000
  while (Date.now() < tope) {
    const listo = await evaluar(cdp, `Boolean(document.querySelector('[aria-current="step"]')) || (location.pathname !== ${JSON.stringify(ruta)})`).catch(() => false)
    if (listo) break
    await dormir(300)
  }
  await dormir(400)
  const m = await evaluar(cdp, EXPR_MEDIR)
  if (!m) return { noMedible: await evaluar(cdp, 'location.pathname') }
  return m
}

async function main() {
  const variante = process.argv[2]
  if (!ESPERADO[variante]) throw new Error('uso: q8v-stepper-ancho.mjs <antes|despues>')
  const comp = readFileSync(join(REPO, 'components/onboarding/onboarding-stepper.tsx'), 'utf8').replace(/\r\n/g, '\n')
  const lineaConector = comp.split('\n').find((l) => l.includes('const connectorWidth')) ?? '(sin connectorWidth)'
  console.log(`variante=${variante}`)
  console.log(`onboarding-stepper.tsx huella=${createHash('sha256').update(comp).digest('hex').slice(0, 16)} ${lineaConector.trim()}`)
  const perfil = mkdtempSync(join(tmpdir(), 'forjo-sonda-q8v-'))
  const logNext = join(perfil, '..', `forjo-sonda-q8v-next-${process.pid}.log`)
  let next = null
  let chrome = null
  let cdp = null
  let fallas = 0
  try {
    if (!(await puertoLibre(PUERTO_CDP))) throw new Error(`el puerto ${PUERTO_CDP} esta ocupado`)
    const existente = await servidorExistente()
    if (existente) {
      ORIGEN = existente.origen
      await esperarServidor()
      console.log(`servidor EXISTENTE de este repo en ${ORIGEN} (pid ${existente.pid}): no se levanta ni se mata`)
    } else {
      if (!(await puertoLibre(PUERTO_APP))) throw new Error(`el puerto ${PUERTO_APP} esta ocupado`)
      next = levantarNext(logNext)
      await esperarServidor()
      let login = await esperarLogin200()
      for (let intento = 1; intento <= 2 && login !== 200; intento++) {
        console.log(`ENTORNO: /login respondio ${login}; se reinicia el servidor PROPIO (intento ${intento})`)
        matarArbol(next)
        for (let i = 0; i < 30 && !(await puertoLibre(PUERTO_APP)); i++) await dormir(500)
        next = levantarNext(`${logNext}.reinicio${intento}.log`)
        await esperarServidor()
        login = await esperarLogin200()
      }
      if (login !== 200) throw new Error(`ENTORNO: /login sigue en ${login}`)
      console.log(`servidor propio en ${ORIGEN} · /login 200 · log: ${logNext}`)
    }
    chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PUERTO_CDP}`, `--user-data-dir=${perfil}`, '--no-first-run', '--no-default-browser-check', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
    chrome.on('error', (e) => { console.error(`no se pudo arrancar Chrome: ${e.message}`); process.exitCode = 1 })
    cdp = await conectar((await descubrirTarget()).webSocketDebuggerUrl)
    await cdp.enviar('Page.enable')
    await cdp.enviar('Runtime.enable')
    const version = await (await fetch(`http://127.0.0.1:${PUERTO_CDP}/json/version`)).json()
    console.log(`navegador: ${version.Browser} · node ${process.version}`)
    await cdp.enviar('Emulation.setDeviceMetricsOverride', { width: 1024, height: 900, deviceScaleFactor: 1, mobile: false })
    await loguearse(cdp)
    // Calentamiento: compila las dos rutas antes de medir.
    for (const ruta of RUTAS) { const t = Date.now(); await navegar(cdp, ORIGEN + ruta); console.log(`calentamiento ${ruta}: ${Date.now() - t} ms`) }
    console.log('')
    for (const ancho of ANCHOS) {
      const movil = ancho < 768
      await cdp.enviar('Emulation.setDeviceMetricsOverride', { width: ancho, height: 900, deviceScaleFactor: movil ? 2 : 1, mobile: movil })
      for (const ruta of RUTAS) {
        const m = await medir(cdp, ruta)
        if (m.noMedible) { console.log(`NO-MEDIBLE ${ancho}px ${ruta}: redirigio a ${m.noMedible}`); continue }
        const cabe = m.contenido <= m.clientW + 0.5 && m.scrollW <= m.clientW && m.izq <= 0.5 && m.der <= 0.5 && m.docScroll <= m.docClient
        const esperado = ESPERADO[variante][ancho]
        const ok = cabe === esperado && m.nodos === NODOS
        if (!ok) fallas++
        console.log(`${ok ? 'OK   ' : 'FALLA'} ${String(ancho).padStart(4)}px ${ruta.padEnd(26)} cabe=${cabe ? 'si' : 'no'} (esperado ${esperado ? 'si' : 'no'}) nodos=${m.nodos} scrollW=${m.scrollW} clientW=${m.clientW} contenido=${m.contenido} izq=${m.izq} der=${m.der} doc=${m.docScroll}/${m.docClient} conector=${m.conector} etiquetas=${m.etiquetas}`)
        if (m.etiquetas > 0) console.log(`       etiquetas: ${m.anchosEtiquetas}`)
      }
    }
    console.log('')
    console.log(`veredicto variante=${variante}: ${fallas === 0 ? 'COINCIDE con el esperado' : `${fallas} medicion(es) NO coinciden con el esperado`}`)
    if (fallas > 0) process.exitCode = 1
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
    await dormir(500)
    console.log(`puerto de depuracion ${PUERTO_CDP} libre al salir: ${(await puertoLibre(PUERTO_CDP)) ? 'si' : 'NO'}`)
    try { rmSync(perfil, { recursive: true, force: true }) } catch { /* lo limpia el sistema */ }
  }
}

await main()
