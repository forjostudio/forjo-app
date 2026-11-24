#!/usr/bin/env node
// ── Sonda: «Crear mi negocio» queda en «Guardando…» (debug onboarding-guardando-colgado) ──────────────
//
// QUE MIDE, en la app real (un `next dev` propio en el 3031) con un Chrome headless por CDP y el Supabase
// LOCAL (no toca produccion): un usuario NUEVO, sin negocio, completa el wizard y toca «Crear mi negocio».
// Durante los 40 s siguientes registra:
//   - cada request de red a Supabase (`/auth/v1/*`, `/rest/v1/*`) y a la app (incluido el POST de la
//     server action `linkLeadOnSignup`, header `Next-Action`), con su status o PENDIENTE si no termino;
//   - consola y excepciones de la pagina;
//   - el texto del boton, el toast (sonner) y `location.pathname`, cada 500 ms;
//   - `navigator.locks.query()` (held/pending del lock `lock:sb-…-auth-token` de auth-js);
//   - y al final, en la base local, si el negocio del usuario existe (SELECT read-only por docker exec).
//
// VARIANTES (argv[2]) = como entra el usuario nuevo al wizard:
//   mail      registro real en /register → mail de confirmacion (mailpit :54324) → la sonda abre
//             `/auth/callback?token_hash=…&type=signup` (verifyOtp server-side, 303 → /onboarding).
//   password  registro + confirmacion como arriba, pero despues se cierra la sesion y entra por /login
//             con contraseña (`window.location.assign('/dashboard')` → 307 → /onboarding).
//   oauth-ish registro + confirmacion, y despues una SEGUNDA pestaña queda abierta en /login (la del
//             registro) mientras la primera completa el wizard — el escenario "dos pestañas" de H1.
//   refresh-ok / refresh-colgado  experimento de MECANISMO (ver el comentario de ESPERADO): la sesion
//             se adelanta a "vence en 30 s" y, en `refresh-colgado`, CDP retiene POST /auth/v1/token
//             sin responder nunca.
//
// RESULTADOS (2026-11-24, codigo 02c6a17): mail, password, mail mobile, oauth-ish y refresh-ok → exito
// (5/5); refresh-colgado → «Guardando…» 40 s sin toast, sin /auth/v1/user, sin negocio (1/1).
//
// EL ESPERADO esta escrito ANTES de la primera corrida (ver ESPERADO y el archivo de debug): en local,
// sin lock retenido por otra pestaña, el alta NO se cuelga: /auth/v1/user 200 → POST /rest/v1/businesses
// 201 → toast de exito → /onboarding/integraciones (o /dashboard si integraciones redirige).
//
// COMO SE CORRE (levanta servidor y navegador → siempre por el turno):
//   node scripts/con-turno.mjs node .planning/debug/probes/onb-crear-negocio-colgado.mjs <mail|password|oauth-ish|refresh-ok|refresh-colgado> [mobile]
//
// QUE NO CIERRA: el Google OAuth real (en local no hay provider), la red de un telefono real, el build
// de produccion.

import { spawn, spawnSync, execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, readFileSync, createWriteStream } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const PUERTO_APP = 3031
const PUERTO_CDP = 9336
// `localhost` y no 127.0.0.1: el 303 del callback arma su Location con `request.url`, que `next dev`
// reporta como localhost; con 127.0.0.1 la cookie de sesion queda en otro host y el wizard rebota a /login
// (mismo motivo que el comentario de `site_url` en supabase/config.toml).
const ORIGEN = `http://localhost:${PUERTO_APP}`
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const REPO = process.cwd()
const MAILPIT = 'http://127.0.0.1:54324'
const DB_CONTAINER = 'supabase_db_forjo-app'
const STAMP = Date.now().toString(36)
const EMAIL = `onb-colgado-${STAMP}@forjo.local`
const CLAVE = 'Forjo1234!'
const NEGOCIO = `Sonda Colgado ${STAMP}`
const OBSERVAR_MS = 40_000

const ESPERADO = {
  mail: 'exito',
  password: 'exito',
  'oauth-ish': 'exito',
  // Experimento de MECANISMO (H1), no de reproduccion: en el paso 4 se adelanta `expires_at` de la
  // sesion guardada en la cookie a "vence en 30 s" (adentro del margen de 90 s de auth-js), asi el
  // proximo getUser()/getSession() tiene que refrescar EN LINEA, adentro del lock.
  //   refresh-ok       el refresh responde normal → control: el alta tiene que terminar en exito.
  //   refresh-colgado  CDP retiene POST /auth/v1/token sin responder (un fetch que nunca vuelve, como
  //                    una conexion movil muerta) → si H1 vale: «Guardando…» sin toast, sin
  //                    /auth/v1/user, sin POST /rest/v1/businesses y sin negocio en la base.
  'refresh-ok': 'exito',
  'refresh-colgado': 'colgado',
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms))
const t0 = Date.now()
const ts = () => `+${((Date.now() - t0) / 1000).toFixed(1)}s`

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

async function esperarLogin200(tope = 45_000) {
  const fin = Date.now() + tope
  let ultimo = null
  while (Date.now() < fin) {
    try { const r = await fetch(`${ORIGEN}/login`, { signal: AbortSignal.timeout(60_000) }); ultimo = r.status; if (r.status === 200) return 200 } catch { /* todavia no */ }
    await dormir(2000)
  }
  return ultimo
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

async function targets() {
  return (await (await fetch(`http://127.0.0.1:${PUERTO_CDP}/json/list`)).json()).filter((t) => t.type === 'page' && t.webSocketDebuggerUrl)
}

async function descubrirTarget() {
  for (let i = 0; i < 80; i++) {
    try { const page = (await targets())[0]; if (page) return page } catch { /* todavia no */ }
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

async function esperar(cdp, expr, tope = 90_000, etiqueta = expr) {
  const fin = Date.now() + tope
  while (Date.now() < fin) {
    const v = await evaluar(cdp, expr).catch(() => false)
    if (v) return v
    await dormir(250)
  }
  const diag = await evaluar(cdp, `JSON.stringify({ ruta: location.pathname, h2: [...document.querySelectorAll('h2')].map((h) => h.textContent.trim()), botones: [...document.querySelectorAll('button')].map((b) => b.textContent.trim().slice(0, 30) + (b.disabled ? '[x]' : '')).filter(Boolean), popup: Boolean(document.querySelector('[data-slot="select-content"]')) })`).catch((e) => e.message)
  throw new Error(`timeout esperando: ${etiqueta} · diag=${diag}`)
}

async function clickEn(cdp, exprElemento, etiqueta) {
  // `behavior: 'instant'` + leer el rect DESPUES: con `scroll-behavior: smooth` en el html, el rect leido
  // en el mismo tick es el de antes del scroll y el click cae fuera del boton (corrida 5: y=1233 en un
  // viewport de 900).
  const hay = await evaluar(cdp, `(() => { const el = (${exprElemento}); if (!el) return false; el.scrollIntoView({ block: 'center', behavior: 'instant' }); return true })()`)
  if (!hay) throw new Error(`no encontre el elemento para click: ${etiqueta}`)
  await dormir(250)
  const p = await evaluar(cdp, `(() => { const b = (${exprElemento}).getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 } })()`)
  // Quien recibe el click en esas coordenadas: si no es el elemento (o algo adentro), hay una capa encima
  // (p. ej. el Positioner del Select de Base UI). Se loguea para no confundir "el click no llego" con
  // "la app no reacciono".
  const blanco = await evaluar(cdp, `(() => { const el = (${exprElemento}); const h = document.elementFromPoint(${p.x}, ${p.y}); return { ok: Boolean(h && (h === el || el.contains(h))), hit: h ? (h.tagName + '.' + String(h.className).slice(0, 60) + ' [' + (h.getAttribute('data-slot') || '') + ']') : null } })()`)
  if (!blanco.ok) console.log(`${ts()} AVISO click «${etiqueta}»: en (${Math.round(p.x)},${Math.round(p.y)}) esta ${blanco.hit}`)
  for (const type of ['mousePressed', 'mouseReleased']) {
    await cdp.enviar('Input.dispatchMouseEvent', { type, x: p.x, y: p.y, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 })
  }
}

const botonPorTexto = (texto) => `[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === ${JSON.stringify(texto)})`

async function tipear(cdp, selector, texto) {
  await evaluar(cdp, `(() => { const e = document.querySelector(${JSON.stringify(selector)}); e.focus(); e.select && e.select() })()`)
  await cdp.enviar('Input.insertText', { text: texto })
}

const hidratado = (selector) => `(() => { const e = document.querySelector(${JSON.stringify(selector)}); return Boolean(e && Object.keys(e).some((k) => k.startsWith('__reactProps'))) })()`

// ── Mail de confirmacion (mailpit) ──────────────────────────────────────────────────────────────
async function linkDeConfirmacion(email) {
  const fin = Date.now() + 60_000
  while (Date.now() < fin) {
    const lista = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`)).json()
    const msg = lista.messages?.[0]
    if (msg) {
      const full = await (await fetch(`${MAILPIT}/api/v1/message/${msg.ID}`)).json()
      const html = full.HTML || full.Text || ''
      const m = html.match(/auth\/callback\?token_hash=([^&"]+)&(?:amp;)?type=([a-z]+)/)
      if (!m) throw new Error('el mail de confirmacion no trae el link token_hash')
      return { token_hash: m[1], type: m[2] }
    }
    await dormir(1000)
  }
  throw new Error(`no llego el mail de confirmacion a ${email}`)
}

function sql(query) {
  return execFileSync('docker', ['exec', DB_CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-tAc', query], { encoding: 'utf8' }).trim()
}

async function registrar(cdp) {
  await navegar(cdp, `${ORIGEN}/register`)
  await esperar(cdp, hidratado('#email'), 120_000, '/register hidratado')
  await tipear(cdp, '#email', EMAIL)
  await tipear(cdp, '#password', CLAVE)
  await tipear(cdp, '#confirmPassword', CLAVE)
  await clickEn(cdp, `document.querySelector('button[type="submit"]')`, 'submit register')
  await esperar(cdp, `document.body.innerText.includes(${JSON.stringify(EMAIL)}) && document.body.innerText.includes('Confirmá')`, 60_000, 'pantalla revisá tu mail')
  console.log(`${ts()} registro OK (${EMAIL}), esperando el mail`)
  return linkDeConfirmacion(EMAIL)
}

async function loginPassword(cdp) {
  await navegar(cdp, `${ORIGEN}/login`)
  await esperar(cdp, hidratado('#email'), 120_000, '/login hidratado')
  await tipear(cdp, '#email', EMAIL)
  await tipear(cdp, '#password', CLAVE)
  await clickEn(cdp, `document.querySelector('button[type="submit"]')`, 'submit login')
  await esperar(cdp, `location.pathname === '/onboarding'`, 120_000, 'login → /onboarding')
}

// La navegacion del wizard NO es lo que se mide: si el click real no avanza en 4 s (capa del Select de
// Base UI encima, por ejemplo), se loguea y se cae a `el.click()`. El click que SI se mide (Crear mi
// negocio) es siempre real y su blanco se verifica.
async function avanzar(cdp, etiqueta, llegada) {
  await clickEn(cdp, botonPorTexto('Siguiente'), etiqueta)
  try { await esperar(cdp, llegada, 4_000, etiqueta); return } catch { /* cae al click por JS */ }
  console.log(`${ts()} AVISO ${etiqueta}: el click real no avanzo en 4 s; se usa el.click()`)
  await evaluar(cdp, `${botonPorTexto('Siguiente')}.click()`)
  await esperar(cdp, llegada, 10_000, etiqueta)
}

async function completarWizard(cdp) {
  await esperar(cdp, hidratado('input[placeholder="Ej: Estudio Nova"]'), 120_000, '/onboarding hidratado')
  await tipear(cdp, 'input[placeholder="Ej: Estudio Nova"]', NEGOCIO)
  await clickEn(cdp, `document.querySelector('[data-slot="select-trigger"]')`, 'trigger rubro')
  await esperar(cdp, `[...document.querySelectorAll('[data-slot="select-item"]')].some((o) => o.textContent.trim() === 'General')`, 20_000, 'opciones de rubro')
  await clickEn(cdp, `[...document.querySelectorAll('[data-slot="select-item"]')].find((o) => o.textContent.trim() === 'General')`, 'opcion General')
  await esperar(cdp, `!document.querySelector('[data-slot="select-content"][data-open]') && document.querySelector('[data-slot="select-trigger"]').textContent.includes('General')`, 10_000, 'rubro General elegido y popup cerrado')
  await esperar(cdp, `document.body.innerText.includes('✓ Disponible')`, 30_000, 'slug disponible')
  await esperar(cdp, `(() => { const b = ${botonPorTexto('Siguiente')}; return b && !b.disabled })()`, 10_000, 'Siguiente habilitado')
  await avanzar(cdp, 'Siguiente 1', `Boolean(document.querySelector('input[placeholder="Ej: Corte de cabello"]'))`)
  await tipear(cdp, 'input[placeholder="Ej: Corte de cabello"]', 'Corte')
  await evaluar(cdp, `document.activeElement && document.activeElement.blur()`)
  await avanzar(cdp, 'Siguiente 2', `Boolean(document.querySelector('input[placeholder="Profesional 1"]'))`)
  await tipear(cdp, 'input[placeholder="Profesional 1"]', 'Ana')
  await evaluar(cdp, `document.activeElement && document.activeElement.blur()`)
  await avanzar(cdp, 'Siguiente 3', `Boolean(${botonPorTexto('Crear mi negocio')})`)
  console.log(`${ts()} wizard completo, en el paso 4`)
}

const EXPR_ESTADO = `(async () => {
  const boton = [...document.querySelectorAll('button')].find((b) => /Crear mi negocio|Guardando/.test(b.textContent))
  const toasts = [...document.querySelectorAll('[data-sonner-toast]')].map((t) => t.textContent.trim())
  let locks = null
  try { const q = await navigator.locks.query(); locks = { held: q.held.map((l) => l.name), pending: q.pending.map((l) => l.name) } } catch (e) { locks = String(e) }
  return { ruta: location.pathname, boton: boton ? boton.textContent.trim() + (boton.disabled ? ' [disabled]' : '') : null, toasts, locks }
})()`

async function main() {
  const variante = process.argv[2]
  const movil = process.argv[3] === 'mobile'
  if (!ESPERADO[variante]) throw new Error(`uso: onb-crear-negocio-colgado.mjs <${Object.keys(ESPERADO).join('|')}> [mobile]`)
  const page = readFileSync(join(REPO, 'app/(onboarding)/onboarding/page.tsx'), 'utf8')
  console.log(`variante=${variante} movil=${movil} email=${EMAIL}`)
  console.log(`page.tsx: finally{setLoading(false)} presente=${/finally \{\s*setLoading\(false\)/.test(page)} · boton='${/Crear mi negocio/.test(page) ? 'Crear mi negocio' : 'Finalizar'}'`)
  const perfil = mkdtempSync(join(tmpdir(), 'forjo-sonda-onbcolg-'))
  const logNext = join(perfil, '..', `forjo-sonda-onbcolg-next-${process.pid}.log`)
  let next = null
  let chrome = null
  let cdp = null
  try {
    if (!(await puertoLibre(PUERTO_CDP))) throw new Error(`el puerto ${PUERTO_CDP} esta ocupado`)
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
    console.log(`${ts()} servidor propio en ${ORIGEN} · /login 200 · log: ${logNext}`)

    chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PUERTO_CDP}`, `--user-data-dir=${perfil}`, '--no-first-run', '--no-default-browser-check', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
    chrome.on('error', (e) => { console.error(`no se pudo arrancar Chrome: ${e.message}`); process.exitCode = 1 })
    cdp = await conectar((await descubrirTarget()).webSocketDebuggerUrl)
    await cdp.enviar('Page.enable')
    await cdp.enviar('Runtime.enable')
    await cdp.enviar('Network.enable')
    const version = await (await fetch(`http://127.0.0.1:${PUERTO_CDP}/json/version`)).json()
    console.log(`navegador: ${version.Browser} · node ${process.version}`)
    await cdp.enviar('Emulation.setDeviceMetricsOverride', movil ? { width: 390, height: 844, deviceScaleFactor: 2, mobile: true } : { width: 1024, height: 900, deviceScaleFactor: 1, mobile: false })

    // ── Registro de red, consola y excepciones (todo el tiempo; se filtra despues del click) ─────
    const reqs = new Map()
    let marcaClick = null
    cdp.en('Network.requestWillBeSent', (p) => {
      const u = p.request.url
      if (!/:54321\/|:3031\//.test(u)) return
      if (/\/_next\/static|__nextjs|\.(png|svg|woff2?|css|js)(\?|$)|webpack-hmr|turbopack/.test(u)) return
      const accion = p.request.headers['Next-Action'] || p.request.headers['next-action']
      reqs.set(p.requestId, { t: Date.now(), metodo: p.request.method, url: u.replace(/\?.*$/, (q) => (q.length > 60 ? q.slice(0, 60) + '…' : q)), accion: Boolean(accion), status: 'PENDIENTE' })
    })
    cdp.en('Network.responseReceived', (p) => { const r = reqs.get(p.requestId); if (r) r.status = p.response.status })
    cdp.en('Network.loadingFailed', (p) => { const r = reqs.get(p.requestId); if (r) r.status = `FALLO ${p.errorText}${p.canceled ? ' (cancelado)' : ''}` })
    cdp.en('Network.loadingFinished', (p) => { const r = reqs.get(p.requestId); if (r) r.fin = Date.now() })
    const consola = []
    cdp.en('Runtime.consoleAPICalled', (p) => consola.push({ t: Date.now(), tipo: p.type, texto: p.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 300) }))
    cdp.en('Runtime.exceptionThrown', (p) => consola.push({ t: Date.now(), tipo: 'EXCEPCION', texto: (p.exceptionDetails.exception?.description || p.exceptionDetails.text).slice(0, 400) }))

    // ── Entrada del usuario nuevo al wizard ─────────────────────────────────────────────────────
    const link = await registrar(cdp)
    console.log(`${ts()} mail OK: type=${link.type}`)
    await navegar(cdp, `${ORIGEN}/auth/callback?token_hash=${link.token_hash}&type=${link.type}`)
    await esperar(cdp, `location.pathname === '/onboarding'`, 120_000, 'callback → /onboarding')
    console.log(`${ts()} /auth/callback → ${await evaluar(cdp, 'location.pathname')}`)

    if (variante === 'password') {
      // Cerrar sesion (boton del wizard) y entrar por /login con contraseña.
      await esperar(cdp, hidratado('input[placeholder="Ej: Estudio Nova"]'), 120_000, '/onboarding hidratado (logout)')
      await clickEn(cdp, botonPorTexto('Cerrar sesión'), 'Cerrar sesión')
      await esperar(cdp, `location.pathname === '/login'`, 60_000, 'logout → /login')
      await loginPassword(cdp)
      console.log(`${ts()} login con contraseña → /onboarding`)
    }

    if (variante === 'oauth-ish') {
      // Segunda pestaña abierta en /login (como la del registro) mientras la primera completa el wizard.
      const t2 = await cdp.enviar('Target.createTarget', { url: `${ORIGEN}/login` })
      console.log(`${ts()} segunda pestaña abierta en /login (target ${t2.targetId.slice(0, 8)})`)
      await dormir(4000)
      // La pestaña nueva queda al frente y la del wizard pasa a `hidden` (rAF y el Positioner del Select
      // dejan de andar). Se trae la del wizard al frente, como haria el dueño al volver a ella.
      await cdp.enviar('Page.bringToFront')
      await dormir(500)
      console.log(`${ts()} pestaña del wizard al frente: visibilityState=${await evaluar(cdp, 'document.visibilityState')}`)
    }

    await completarWizard(cdp)

    if (variante.startsWith('refresh-')) {
      const r = await evaluar(cdp, `(() => {
        const partes = document.cookie.split('; ').map((c) => [c.slice(0, c.indexOf('=')), c.slice(c.indexOf('=') + 1)])
          .filter(([n]) => /^sb-[^=]+-auth-token(\\.\\d+)?$/.test(n)).sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true }))
        if (!partes.length) return { error: 'sin cookie de sesion' }
        const base = partes[0][0].replace(/\\.\\d+$/, '')
        let v = partes.map(([, x]) => decodeURIComponent(x)).join('')
        if (!v.startsWith('base64-')) return { error: 'cookie no base64-', muestra: v.slice(0, 12) }
        const b64 = v.slice(7).replace(/-/g, '+').replace(/_/g, '/')
        const json = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(b64 + '==='.slice((b64.length + 3) % 4)), (c) => c.charCodeAt(0))))
        const antes = json.expires_at
        json.expires_at = Math.floor(Date.now() / 1000) + 30
        const bytes = new TextEncoder().encode(JSON.stringify(json))
        let bin = ''; for (const b of bytes) bin += String.fromCharCode(b)
        const nuevo = 'base64-' + btoa(bin).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '')
        for (const [n] of partes) document.cookie = n + '=; path=/; max-age=0'
        document.cookie = base + '=' + nuevo + '; path=/; max-age=3600; samesite=lax'
        return { cookie: base, chunks: partes.length, expires_at_antes: antes, expires_at_nuevo: json.expires_at, largo: nuevo.length }
      })()`)
      console.log(`${ts()} sesion adelantada a "vence en 30 s": ${JSON.stringify(r)}`)
      if (r.error) throw new Error(`no se pudo adelantar la sesion: ${r.error}`)
      if (variante === 'refresh-colgado') {
        await cdp.enviar('Fetch.enable', { patterns: [{ urlPattern: '*auth/v1/token*', requestStage: 'Request' }] })
        cdp.en('Fetch.requestPaused', (p) => console.log(`${ts()} RETENIDO (sin responder nunca): ${p.request.method} ${p.request.url.replace(/\?.*$/, '?…')}`))
      }
    }

    const antes = await evaluar(cdp, EXPR_ESTADO)
    console.log(`${ts()} antes del click: ${JSON.stringify(antes)}`)

    // ── El click y la observacion ───────────────────────────────────────────────────────────────
    marcaClick = Date.now()
    await clickEn(cdp, botonPorTexto('Crear mi negocio'), 'Crear mi negocio')
    console.log(`${ts()} CLICK en «Crear mi negocio»`)
    let ultimo = ''
    let resultado = 'colgado'
    let primerToast = null
    let vioGuardando = false
    const fin = Date.now() + OBSERVAR_MS
    while (Date.now() < fin) {
      const e = await evaluar(cdp, EXPR_ESTADO).catch((err) => ({ error: err.message }))
      const linea = JSON.stringify(e)
      if (linea !== ultimo) { console.log(`${ts()} estado: ${linea}`); ultimo = linea }
      if (e.toasts?.length && !primerToast) primerToast = e.toasts[0]
      if (/Guardando/.test(e.boton ?? '')) vioGuardando = true
      if (e.ruta && e.ruta !== '/onboarding') { resultado = 'exito'; await dormir(1500); break }
      await dormir(500)
    }
    if (resultado !== 'exito' && primerToast && /Error/.test(primerToast)) resultado = 'error'
    if (resultado === 'colgado' && !vioGuardando) resultado = 'click-no-llego'
    console.log(`el boton paso por «Guardando…»: ${vioGuardando ? 'si' : 'no'}`)

    console.log('')
    console.log('── red desde el click ──')
    for (const r of [...reqs.values()].filter((r) => r.t >= marcaClick - 50).sort((a, b) => a.t - b.t)) {
      const dur = r.fin ? `${r.fin - r.t} ms` : '—'
      console.log(`  +${((r.t - marcaClick) / 1000).toFixed(2)}s ${r.metodo.padEnd(6)} ${String(r.status).padEnd(10)} ${dur.padStart(8)} ${r.accion ? '[server action] ' : ''}${r.url}`)
    }
    console.log('── consola desde el click ──')
    for (const c of consola.filter((c) => c.t >= marcaClick - 50)) console.log(`  +${((c.t - marcaClick) / 1000).toFixed(2)}s [${c.tipo}] ${c.texto}`)
    const pendientes = [...reqs.values()].filter((r) => r.t >= marcaClick - 50 && r.status === 'PENDIENTE')
    console.log(`requests pendientes al cierre: ${pendientes.length}`)
    const enBase = sql(`select coalesce(string_agg(b.slug || ' @ ' || to_char(b.created_at at time zone 'America/Argentina/Buenos_Aires', 'HH24:MI:SS'), ', '), '(ninguno)') from public.businesses b join auth.users u on u.id = b.owner_id where u.email = '${EMAIL}'`)
    console.log(`negocio en la base local para ${EMAIL}: ${enBase}`)
    console.log(`primer toast: ${primerToast ?? '(ninguno)'}`)
    console.log('')
    console.log(`veredicto variante=${variante}: resultado=${resultado} (esperado ${ESPERADO[variante]}) → ${resultado === ESPERADO[variante] ? 'COINCIDE' : 'NO COINCIDE'}`)
    if (resultado !== ESPERADO[variante]) process.exitCode = 2
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
