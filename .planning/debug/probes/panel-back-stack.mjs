#!/usr/bin/env node
// ── La sonda de la pila del atrás del panel ──────────────────────────────────────────────────────
//
// QUÉ MIDE: la pila REAL del navegador (`Page.getNavigationHistory` por CDP) para los dieciseis
// recorridos de la Phase 3 del workstream `panel-nav`. No deriva las pilas de leer el código: las
// MIDE en un Chrome de verdad y FALLA con código distinto de cero si alguna no coincide con la
// esperada. Es un instrumento con gate, no un script que imprime y se va.
//
// POR QUÉ EXISTE: la memoria `medir-antes-de-aceptar-un-fix-propuesto` tiene cinco casos de este
// mismo workstream en los que un fix confiado se cayó al medirlo. El modo de falla de esta fase es
// silencioso (la URL cambia y la vista no, o el atrás no hace nada) y NO lo ve `tsc`, ni la suite,
// ni el build. Los planes 03-02 y 03-03 escriben su mitad difícil contra lo que esta sonda mide.
//
// CÓMO SE CORRE (siempre por el turno de pantalla: en esta máquina se trabajan varios proyectos a la
// vez y dos suites de navegador simultáneas se quitan la CPU y las dos fallan por tiempos vencidos
// sin que haya ningún defecto):
//
//   node scripts/con-turno.mjs node .planning/debug/probes/panel-back-stack.mjs
//
// Si otro proyecto tiene el turno, la sonda ESPERA e imprime un cartel que nombra al dueño. Una
// espera no es un cuelgue. Para ver de quién es o destrabarlo:
//   bash D:/herramientas/turno-pantalla/turno-pantalla.sh estado | liberar
//
// LO QUE NO NECESITA, a propósito: ni el dev server ni la base de datos. Monta su propio servidor
// estático en loopback, igual que la sesión de v0.30 que midió en el mismo puerto sin tocar nada del
// dueño. Y CERO paquetes nuevos: el `WebSocket` de CDP es el global de Node (existe desde Node 21 y
// este repo corre v24), así que no hace falta ningún cliente de CDP ni ningún navegador de npm.
//
// ⚠ QUÉ ES "LA PILA" EN ESTA SONDA, y es la precisión que vuelve honestas las mediciones: un
// `history.back()` y un `replaceState` NO truncan las entradas de ADELANTE. Así que la sonda mide
// TRES cosas por escenario y las compara por separado:
//   · `abajo`    = las entradas desde la primera hasta la ACTUAL inclusive. Es el camino del atrás,
//                  o sea lo único que el dueño puede recorrer apretando atrás. Es lo que los
//                  criterios de la fase llaman "la pila".
//   · `actual`   = la entrada en la que está parado.
//   · `adelante` = las entradas que quedaron por encima. NO son basura en el camino del atrás
//                  —están adelante, no debajo— y el dueño estuvo ahí de verdad. Se DECLARAN en la
//                  expectativa en vez de ignorarse, igual que el caso de entrada directa de v0.30.
//
// LO QUE ESTA SONDA NO PUEDE CERRAR (está también en el documento de debug, no sólo acá): A1 (que el
// efecto que escribe la marca corra después de la escritura del router de Next — es semántica de
// React y del router, no de la pila), A2 (que no haya otro commit del router en vuelo) y A11
// (Safari/iOS y Chrome Android reales: todo lo medido en este repo sobre el retroceso fue Chrome de
// escritorio headless). Los tres van a la UAT del plan 03-04.

import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// ── Configuración ────────────────────────────────────────────────────────────────────────────────
// Los dos puertos son los de la sesión de v0.30 y son parte de la precondición del plan: si están
// ocupados la sonda no arranca, y eso es un rojo de entorno, no de la política.
const PUERTO_WEB = 8731
const PUERTO_CDP = 9334
const ORIGEN = `http://127.0.0.1:${PUERTO_WEB}`
// Ruta con BARRAS NORMALES a propósito: con barras invertidas el `spawn` de Windows falla.
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'

const ROOT = '/dashboard'
const MORE = '/mas'

// ── El servidor estático propio ──────────────────────────────────────────────────────────────────
// Responde el MISMO HTML a CUALQUIER path, y eso es deliberado: la política de la fase se define
// sobre PATHNAMES, así que hacen falta entradas de historial con ruta propia y no sólo con hash.
function montarServidor() {
  const html = '<!doctype html><html><head><title>sonda</title></head><body>sonda</body></html>'
  const server = createServer((req, res) => {
    if (req.url === '/favicon.ico') { res.writeHead(204); res.end(); return }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
    res.end(html)
  })
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(PUERTO_WEB, '127.0.0.1', () => resolve(server))
  })
}

// ── El cliente de CDP, sobre el WebSocket global de Node ─────────────────────────────────────────
function conectar(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url)
    let siguienteId = 1
    const pendientes = new Map()
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.id && pendientes.has(msg.id)) {
        const { ok, fail } = pendientes.get(msg.id)
        pendientes.delete(msg.id)
        if (msg.error) fail(new Error(`${msg.error.message} (${JSON.stringify(msg.error)})`))
        else ok(msg.result)
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
        cerrar() { try { ws.close() } catch { /* ya cerrado */ } },
      })
    })
  })
}

/** Chrome tarda unos cientos de ms en abrir el puerto de depuración: hay que reintentar. */
async function descubrirTarget() {
  for (let intento = 0; intento < 80; intento++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PUERTO_CDP}/json/list`)
      const targets = await r.json()
      const page = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)
      if (page) return page
    } catch { /* todavía no levantó: se reintenta */ }
    await new Promise((r) => setTimeout(r, 125))
  }
  throw new Error(`Chrome no publicó ningún target en el puerto ${PUERTO_CDP} (¿está ocupado?)`)
}

// ── Las primitivas de medición ───────────────────────────────────────────────────────────────────

/** Evalúa en la página y devuelve el valor. Lanza si la página tiró. */
async function evaluar(cdp, expresion, { esperarPromesa = false } = {}) {
  const r = await cdp.enviar('Runtime.evaluate', {
    expression: expresion,
    awaitPromise: esperarPromesa,
    returnByValue: true,
  })
  if (r.exceptionDetails) {
    throw new Error(`la página tiró: ${r.exceptionDetails.text} ${JSON.stringify(r.exceptionDetails.exception?.description ?? '')}`)
  }
  return r.result.value
}

/** Normaliza la URL de una entrada de historial a `pathname + hash`, que es la unidad de la política. */
function comoRuta(url) {
  if (!url.startsWith(ORIGEN)) return url
  const u = new URL(url)
  return u.pathname + u.hash
}

/**
 * LA MEDICIÓN. `Page.getNavigationHistory` devuelve TODAS las entradas más el índice actual; de ahí
 * salen las tres cantidades que la cabecera define (abajo / actual / adelante). `marca` es el state
 * de la entrada actual leído de la página, que es lo que los planes 03-02 y 03-03 van a consultar.
 */
async function medir(cdp) {
  const h = await cdp.enviar('Page.getNavigationHistory')
  const rutas = h.entries.map((e) => comoRuta(e.url))
  const marca = await evaluar(cdp, 'JSON.stringify(history.state ?? null)')
  return {
    abajo: rutas.slice(0, h.currentIndex + 1),
    actual: rutas[h.currentIndex],
    adelante: rutas.slice(h.currentIndex + 1),
    indice: h.currentIndex,
    marca: JSON.parse(marca),
  }
}

/** Deja la pestaña con UNA sola entrada en la ruta pedida: el punto de partida limpio de cada escenario. */
async function reiniciarEn(cdp, ruta) {
  await cdp.enviar('Page.navigate', { url: ORIGEN + ruta })
  await new Promise((r) => setTimeout(r, 150))
  await cdp.enviar('Page.resetNavigationHistory')
}

/**
 * Igual que {@link reiniciarEn}, pero además **borra el estado** de la entrada que queda.
 *
 * ⚠ **POR QUÉ HACE FALTA, Y ES UN HECHO MEDIDO EN ESTA SONDA (2026-10-27).** Un `Page.navigate` a la
 * **misma URL** en la que ya estamos **no es una navegación nueva: es una recarga**, y una recarga
 * **PRESERVA `history.state`**. O sea que un escenario que empiece con `reiniciarEn(ROOT)` justo
 * después de otra mitad que terminó parada en `/dashboard` arranca con la **marca de la mitad
 * anterior** pegada a la entrada de Inicio. Medido: la mitad B de **E-14** aterrizaba sobre
 * `{ frjUnder: '/clients' }` en vez de sobre una entrada **sin marca**, y el armado daba `no-armar`
 * — un rojo que no era del diseño sino del punto de partida.
 *
 * Es el mismo mecanismo por el que la marca **sobrevive al F5** del dueño, así que no es una rareza
 * del instrumento: es la semántica real. Los escenarios que afirman algo sobre la entrada
 * **ORIGINAL** de Inicio —la que nadie nuestro empujó— tienen que partir de acá.
 */
async function reiniciarEnLimpio(cdp, ruta) {
  await reiniciarEn(cdp, ruta)
  await evaluar(cdp, `history.replaceState(null, '')`)
}

/**
 * Empuja una entrada marcándola con la ruta que le queda DEBAJO.
 * ⚠ La marca guarda LA RUTA y no un booleano, y no es un lujo: el caso degenerado de E-5 necesita
 * saber CUÁL es la ruta de abajo para compararla con el destino. Un booleano no alcanza.
 */
async function empujar(cdp, ruta, debajo) {
  await evaluar(cdp, `history.pushState({ frjUnder: ${JSON.stringify(debajo)} }, '', ${JSON.stringify(ruta)})`)
}

/**
 * Un retroceso GUARDADO: lee la marca de la entrada de arriba, y sólo retrocede si es NUESTRA.
 * Es la disciplina que los tres dueños de la pila declaran (re-verificar la marca justo antes de cada
 * `back()`), y es lo único que impide la cicatriz 2: un `back()` sobre una entrada ajena saca al
 * dueño del sitio. Devuelve el state con el que aterrizó.
 */
function retrocederGuardado(cdp) {
  return evaluar(cdp, `
    new Promise((res, rej) => {
      if (!history.state || typeof history.state.frjUnder === 'undefined') {
        rej(new Error('la entrada de arriba NO lleva nuestra marca: un back() acá seria sobre entrada ajena'))
        return
      }
      window.addEventListener('popstate', (e) => res(JSON.stringify(e.state ?? null)), { once: true })
      history.back()
    })
  `, { esperarPromesa: true }).then((s) => JSON.parse(s))
}

/**
 * El colapso: retroceder, leer la marca de la entrada que aparece y recién entonces decidir.
 * ⚠ LAS DOS LECCIONES MEDIDAS QUE ESTÁN ESCRITAS ACÁ ADENTRO y que el plan 03-02 tiene que copiar:
 *   1. el listener se engancha EN EL GESTO y con `{ once: true }`, no en un efecto — el `back()` del
 *      consumo es una navegación same-route y un listener que dependa de un efecto se pierde el evento;
 *   2. NO se navega DENTRO del `popstate`: el segundo paso se difiere fuera del evento (acá con un
 *      `setTimeout(0)`, en la app con un pedido en estado que ejecuta un efecto). Pedido adentro del
 *      evento, el router de Next está procesando SU traverse y la escritura NO ocurre.
 */
function colapsar(cdp, destino) {
  return evaluar(cdp, `
    new Promise((res, rej) => {
      const DESTINO = ${JSON.stringify(destino)}
      window.addEventListener('popstate', (e) => {
        const marca = e.state && typeof e.state.frjUnder === 'string' ? e.state.frjUnder : null
        setTimeout(() => {
          if (marca === null) { rej(new Error('la entrada no lleva marca: no se colapsa a ciegas')); return }
          if (marca === DESTINO) {
            window.addEventListener('popstate', (e2) => {
              res(JSON.stringify({ rama: 'doble-retroceso', marcaLeida: marca, aterrizo: e2.state ?? null }))
            }, { once: true })
            history.back()
          } else {
            history.replaceState({ frjUnder: marca }, '', DESTINO)
            res(JSON.stringify({ rama: 'retroceso-y-reemplazo', marcaLeida: marca, aterrizo: history.state }))
          }
        }, 0)
      }, { once: true })
      history.back()
    })
  `, { esperarPromesa: true }).then((s) => JSON.parse(s))
}

/**
 * EL REEMPLAZO DEL `<Link>`, TAL COMO ES: cambia la **ruta** y escribe el state del router **encima**,
 * o sea **se lleva nuestra marca**. Es el reemplazo blando ajeno de la mitad A de **E-16**
 * (`{ router: 'ajeno' }`) con la **url** puesta.
 *
 * ⚠ **ES LA PIEZA QUE LOS DIECISEIS ESCENARIOS DE ANTES NO TENIAN, y por eso ninguno podia ver
 * `G3-1`.** Todos median marcas **por separado**: una marca escrita, una marca pisada. Ninguno medía
 * una **CADENA** de reemplazos, que es la causa medida del gap — la marca se escribe una vez y nadie
 * la vuelve a escribir.
 */
function reemplazarComoElRouter(cdp, ruta) {
  return evaluar(cdp, `history.replaceState({ router: 'ajeno' }, '', ${JSON.stringify(ruta)})`)
}

/**
 * LA PROPAGACION: escribe la marca **LEIDA** sobre la entrada actual, con las **dos guardas del
 * escritor unico** (entrada de otro dueno primero, idempotencia despues) y devolviendo **si
 * escribio** — asi el escenario puede afirmar la **ABSTENCION** y no solo la escritura.
 *
 * ⚠ **SIN VALOR LEIDO NO SE INVENTA NINGUNO.** Es la regla que no se negocia: una marca falsa manda
 * el gesto de atras a una entrada que no empujamos nosotros y deja al dueno **fuera del sitio**;
 * quedarse sin marca deja una pila **un escalon mas larga**. El molde es el segundo paso de
 * {@link colapsar}, que propaga exactamente igual.
 */
function propagarLaMarca(cdp, rutaLeida) {
  return evaluar(cdp, `
    (() => {
      const LEIDA = ${JSON.stringify(rutaLeida ?? null)}
      if (LEIDA === null) return false
      const st = history.state
      // Guarda 1 — la regla 0: la entrada de arriba no puede tener otro dueno.
      if (st && (typeof st.frjOverlay !== 'undefined' || typeof st.frjDirty !== 'undefined' || typeof st.frjExit !== 'undefined')) return false
      // Guarda 2 — idempotencia: una entrada que ya lleva la marca ya sabe que tiene debajo.
      if (st && typeof st.frjUnder === 'string') return false
      history.replaceState({ frjUnder: LEIDA }, '')
      return true
    })()
  `)
}

/**
 * SALIR DE LA RAIZ CONSUMIENDO EL SENTINEL DE SALIDA, en DOS PASOS. Es lo que el plan 03-06
 * implementa en la app (el sexto miembro del plan de rama y su ejecutor).
 *
 * ⚠ **PARA QUE EXISTE, y es la causa MEDIDA de G-1 y G-2.** La entrada del sentinel es
 * **ABSORBENTE**: se empujo para consumirla. Si el dueno navega con ella arriba —la forma **vieja**,
 * que empuja el destino **ENCIMA**— queda **enterrada** en el camino del atras, y entonces el atras
 * aterriza en una entrada de la raiz **con hash** (`/dashboard#salir`) que en pantalla se ve **igual
 * que Inicio**, con un atras siguiente que no hace **nada visible**. Es literalmente lo que el dueno
 * midio en el telefono: *recarga y vuelve a `dashboard#salir-3`*, y *a la primera que toco atras no
 * hace nada*. Las dos formas quedan medidas una al lado de la otra en **E-9**.
 *
 * ⚠ LAS TRES LECCIONES MEDIDAS QUE ESTAN ESCRITAS ACA ADENTRO, las mismas de `colapsar` y de
 * `cadenaDeTresPasos`:
 *   1. **la guarda se re-verifica EN EL GESTO**, y pregunta por la marca del sentinel **de esta
 *      instancia** (`frjExit` con nuestro id) y no solo por "algun dueno de salida": un `back()`
 *      sobre una entrada que no empujamos nosotros **expulsa al dueno del sitio** (cicatriz 2);
 *   2. el listener se engancha **en el gesto** y con `{ once: true }` — en un efecto se perderia el
 *      evento, y sin `once` sobreviviria al paso y el proximo atras del dueno disparia una
 *      navegacion que nadie pidio;
 *   3. **el empuje del destino va DIFERIDO fuera del evento** (aca con un `setTimeout(0)`, en la app
 *      con un pedido en estado que ejecuta un efecto): pedido adentro del `popstate`, el router de
 *      Next esta procesando SU traverse y la escritura **no ocurre**.
 *
 * Lo que cambia respecto de `colapsar` es **qué entrada se consume**: alla la de la seccion de la
 * rama (`frjUnder`), aca la del sentinel de salida (`frjExit`).
 */
function salirDeLaRaizConsumiendoElSentinel(cdp, destino, debajo) {
  return evaluar(cdp, `
    new Promise((res, rej) => {
      const DESTINO = ${JSON.stringify(destino)}
      const DEBAJO = ${JSON.stringify(debajo)}
      // ── PASO 1 · la guarda: la entrada de arriba tiene que ser NUESTRO sentinel de salida ─────
      if (!history.state || typeof history.state.frjExit === 'undefined') {
        rej(new Error('la entrada de arriba NO lleva la marca del sentinel de salida: un back() aca seria sobre entrada ajena'))
        return
      }
      const idDelSentinel = history.state.frjExit
      window.addEventListener('popstate', (e) => {
        const paradoTrasElConsumo = location.pathname + location.hash
        const aterrizo = e.state ?? null
        // ── PASO 2 · el empuje del destino, DIFERIDO fuera del evento ───────────────────────────
        setTimeout(() => {
          history.pushState({ frjUnder: DEBAJO }, '', DESTINO)
          res(JSON.stringify({
            idDelSentinelConsumido: idDelSentinel,
            aterrizo,
            paradoTrasElConsumo,
            marcaDelDestino: history.state,
          }))
        }, 0)
      }, { once: true })
      history.back()
    })
  `, { esperarPromesa: true }).then((s) => JSON.parse(s))
}

/**
 * ARMA el sentinel de salida: empuja una entrada propia con su estado y el hash **DERIVADO del hash
 * actual**, igual que `nextPanelExitHash` en la app.
 *
 * ⚠ **POR QUE EL HASH SE DERIVA Y NO ES LA CONSTANTE A SECAS** (cicatriz 1): dos entradas
 * consecutivas con la **misma** URL hacen que el router **colapse** la entrada — no se crea ninguna,
 * el atras no tiene nada que deshacer y **saca al dueno de la pagina**, justo lo contrario de lo que
 * el sentinel viene a hacer. Devuelve el hash que empujo, que es el dato que **E-13** mide vuelta por
 * vuelta: con el ciclo sano tiene que ser **siempre el base**, y el **escalado** aparece solo en el
 * caso del estado pisado.
 */
function armarElSentinel(cdp, id) {
  return evaluar(cdp, `
    (() => {
      const BASE = '#salir'
      const actual = location.hash
      let hash = BASE
      if (actual === BASE) hash = BASE + '-2'
      else if (actual.startsWith(BASE + '-')) {
        const profundidad = Number(actual.slice(BASE.length + 1))
        if (Number.isInteger(profundidad) && profundidad >= 2) hash = BASE + '-' + (profundidad + 1)
      }
      history.pushState({ frjExit: ${id} }, '', location.pathname + hash)
      return hash
    })()
  `)
}

/**
 * CONSUME nuestra entrada del sentinel, con **su** guarda re-verificada en el gesto: si la entrada de
 * arriba no lleva la marca del sentinel, se **niega** en vez de retroceder (cicatriz 2 — un `back()`
 * sobre una entrada ajena expulsa al dueno del sitio). Devuelve el state con el que aterrizo.
 */
function consumirElSentinel(cdp) {
  return evaluar(cdp, `
    new Promise((res, rej) => {
      if (!history.state || typeof history.state.frjExit === 'undefined') {
        rej(new Error('la entrada de arriba NO lleva la marca del sentinel: un back() aca seria sobre entrada ajena'))
        return
      }
      window.addEventListener('popstate', (e) => res(JSON.stringify(e.state ?? null)), { once: true })
      history.back()
    })
  `, { esperarPromesa: true }).then((s) => JSON.parse(s))
}

/**
 * Empuja el **sentinel de CAMBIOS SIN GUARDAR** (`lib/dirty-history.ts`) encima de la entrada actual.
 *
 * ⚠ **Su state lleva SÓLO su propia marca (`{ frjDirty }`), igual que en la app** (`dirtyHistoryState`
 * devuelve exactamente eso): **no** copia la marca de la rama de la entrada de abajo. Esa asimetría
 * no es un detalle del helper — es **el hecho que E-8 mide**, y es el que decide el diseño del
 * provider del guard de salida.
 */
function empujarSentinelDeCambios(cdp, ruta) {
  return evaluar(cdp, `history.pushState({ frjDirty: 1 }, '', ${JSON.stringify(ruta)})`)
}

/**
 * LA CADENA DE TRES PASOS, tal como la tiene que correr el provider del guard de cambios sin guardar
 * cuando el dueño toca "Salir sin guardar" desde una **sección de la rama de Más**: consumir el
 * sentinel de cambios sin guardar → consumir la entrada de la sección → recién entonces navegar.
 *
 * ⚠ LAS TRES LECCIONES MEDIDAS QUE ESTÁN ESCRITAS ACÁ ADENTRO, y que el provider tiene que copiar:
 *   1. **cada paso sale del EVENTO del anterior**, nunca dos en el mismo tick: `history.back()` es
 *      asíncrono y encadenarlo a mano está medido como roto (la navegación se pierde);
 *   2. el listener se engancha **en el gesto** y con `{ once: true }` — en un efecto se perdería el
 *      evento, y sin `once` sobreviviría al paso y el próximo atrás del dueño dispararía una
 *      navegación que nadie pidió;
 *   3. **la navegación va DIFERIDA fuera del evento** (acá con un `setTimeout(0)`, en la app con un
 *      pedido en estado que ejecuta un efecto): pedida adentro del `popstate`, el router de Next está
 *      procesando SU traverse y la escritura **no ocurre**.
 *
 * Y la medición que de verdad importa: `marcaConElSentinelArriba` se lee **antes** del primer
 * consumo y `marcaTrasElConsumo` **después**. Si la primera es nula y la segunda no, entonces el
 * plan de la rama **no se puede decidir en el momento del click** y hay que re-derivarlo con la
 * entrada de la sección a la vista — que es exactamente la forma que `branchSecondStep` ya tiene en
 * `lib/panel-branch.ts` por el mismo motivo.
 */
function cadenaDeTresPasos(cdp, destino) {
  return evaluar(cdp, `
    new Promise((res, rej) => {
      const DESTINO = ${JSON.stringify(destino)}
      // ── PASO 1 · consumir el sentinel de cambios sin guardar, con SU guarda de marca ──────────
      if (!history.state || typeof history.state.frjDirty !== 'number') {
        rej(new Error('la entrada de arriba no es el sentinel de cambios sin guardar: no se consume a ciegas'))
        return
      }
      // La marca de la rama, LEÍDA CON EL SENTINEL ARRIBA. Es el momento del click.
      const marcaConElSentinelArriba = typeof history.state.frjUnder === 'string' ? history.state.frjUnder : null
      window.addEventListener('popstate', (e1) => {
        // Parados sobre la entrada de la SECCIÓN: acá la marca de la rama vuelve a ser legible.
        const marcaTrasElConsumo = e1.state && typeof e1.state.frjUnder === 'string' ? e1.state.frjUnder : null
        if (marcaTrasElConsumo === null) {
          // Sin marca no se retrocede: es la regla 0, y la degradación segura es navegar.
          setTimeout(() => {
            history.replaceState(null, '', DESTINO)
            res(JSON.stringify({ rama: 'sin-marca-tras-el-consumo', marcaConElSentinelArriba, marcaTrasElConsumo, marcaDebajo: null, aterrizo: history.state }))
          }, 0)
          return
        }
        // ── PASO 2 · consumir la entrada de la sección, desde adentro del evento del paso 1 ─────
        window.addEventListener('popstate', (e2) => {
          const marcaDebajo = e2.state && typeof e2.state.frjUnder === 'string' ? e2.state.frjUnder : null
          setTimeout(() => {
            // ── PASO 3 · el degenerado: si el destino ya está debajo, un tercer retroceso ───────
            if (marcaDebajo === DESTINO) {
              window.addEventListener('popstate', (e3) => {
                res(JSON.stringify({ rama: 'triple-retroceso', marcaConElSentinelArriba, marcaTrasElConsumo, marcaDebajo, aterrizo: e3.state ?? null }))
              }, { once: true })
              history.back()
              return
            }
            // ── PASO 3 · el normal: la navegación, DIFERIDA fuera del evento ────────────────────
            history.replaceState({ frjUnder: marcaDebajo }, '', DESTINO)
            res(JSON.stringify({ rama: 'dos-consumos-y-reemplazo', marcaConElSentinelArriba, marcaTrasElConsumo, marcaDebajo, aterrizo: history.state }))
          }, 0)
        }, { once: true })
        history.back()
      }, { once: true })
      history.back()
    })
  `, { esperarPromesa: true }).then((s) => JSON.parse(s))
}

// ── Los trece escenarios ────────────────────────────────────────────────────────────────────────
// Cada uno declara su expectativa ACÁ, en código que se ejecuta. La sonda es la fuente de verdad: si
// una medición no coincide, el arreglo NO es bajar la expectativa — es rehacer el diseño del plan
// correspondiente contra lo medido y dejarlo escrito en el documento de debug.

const ESCENARIOS = [
  {
    id: 'E-1',
    titulo: 'MOB-04 nivel 1 — Inicio → Más → Finanzas: el atrás cae en Más, y el siguiente en Inicio',
    cierra: 'A4',
    async correr(cdp) {
      await reiniciarEn(cdp, ROOT)
      await empujar(cdp, MORE, ROOT)
      await empujar(cdp, '/finances', MORE)
      const armada = await medir(cdp)
      await retrocederGuardado(cdp)
      const unAtras = await medir(cdp)
      await retrocederGuardado(cdp)
      const dosAtras = await medir(cdp)
      return {
        medido: {
          armada: armada.abajo,
          tras_un_atras: unAtras.actual,
          tras_dos_atras: dosAtras.actual,
          abajo_al_final: dosAtras.abajo,
        },
        esperado: {
          armada: [ROOT, MORE, '/finances'],
          tras_un_atras: MORE,
          tras_dos_atras: ROOT,
          abajo_al_final: [ROOT],
        },
      }
    },
  },
  {
    id: 'E-2',
    titulo: 'D-02 — Inicio → Turnos → Más: el atrás cae en Turnos, y la pila tiene TRES escalones',
    cierra: 'A4',
    async correr(cdp) {
      await reiniciarEn(cdp, ROOT)
      await empujar(cdp, '/appointments', ROOT)
      await empujar(cdp, MORE, '/appointments')
      const armada = await medir(cdp)
      await retrocederGuardado(cdp)
      const unAtras = await medir(cdp)
      return {
        medido: {
          armada: armada.abajo,
          escalones: armada.abajo.length,
          tras_un_atras: unAtras.actual,
        },
        esperado: {
          armada: [ROOT, '/appointments', MORE],
          escalones: 3,
          tras_un_atras: '/appointments',
        },
      }
    },
  },
  {
    id: 'E-3',
    titulo: 'subir un nivel (D-03, lo que implementa 03-02) — el retroceso guardado deja Más como entrada actual',
    cierra: 'A4',
    async correr(cdp) {
      await reiniciarEn(cdp, ROOT)
      await empujar(cdp, MORE, ROOT)
      await empujar(cdp, '/finances', MORE)
      const aterrizo = await retrocederGuardado(cdp)
      const m = await medir(cdp)
      return {
        medido: {
          abajo: m.abajo,
          actual: m.actual,
          adelante: m.adelante,
          marca_con_la_que_aterrizo: aterrizo,
        },
        esperado: {
          abajo: [ROOT, MORE],
          actual: MORE,
          adelante: ['/finances'],
          marca_con_la_que_aterrizo: { frjUnder: ROOT },
        },
      }
    },
  },
  {
    id: 'E-4',
    titulo: 'el colapso normal (criterio 2) — [Inicio, Más, Finanzas] + destino Clientes: el atrás cae en Inicio',
    cierra: 'A5',
    async correr(cdp) {
      await reiniciarEn(cdp, ROOT)
      await empujar(cdp, MORE, ROOT)
      await empujar(cdp, '/finances', MORE)
      const plan = await colapsar(cdp, '/clients')
      const m = await medir(cdp)
      return {
        medido: {
          rama_tomada: plan.rama,
          marca_leida_en_la_entrada_de_mas: plan.marcaLeida,
          abajo: m.abajo,
          actual: m.actual,
          adelante: m.adelante,
          atras_cae_en: m.abajo[m.abajo.length - 2] ?? null,
        },
        esperado: {
          rama_tomada: 'retroceso-y-reemplazo',
          marca_leida_en_la_entrada_de_mas: ROOT,
          abajo: [ROOT, '/clients'],
          actual: '/clients',
          adelante: ['/finances'],
          atras_cae_en: ROOT,
        },
      }
    },
  },
  {
    id: 'E-5',
    titulo: 'el colapso degenerado (A6) — destino = la ruta que quedaría debajo: se retrocede DOS veces y no se navega',
    cierra: 'A6',
    async correr(cdp) {
      await reiniciarEn(cdp, ROOT)
      await empujar(cdp, '/appointments', ROOT)
      await empujar(cdp, MORE, '/appointments')
      await empujar(cdp, '/finances', MORE)
      const plan = await colapsar(cdp, '/appointments')
      const m = await medir(cdp)
      const hayIdenticasAdyacentes = m.abajo.some((r, i) => i > 0 && r === m.abajo[i - 1])
      return {
        medido: {
          rama_tomada: plan.rama,
          marca_leida_en_la_entrada_de_mas: plan.marcaLeida,
          abajo: m.abajo,
          actual: m.actual,
          marca_de_la_entrada_actual: m.marca,
          dos_entradas_identicas_adyacentes: hayIdenticasAdyacentes,
        },
        esperado: {
          rama_tomada: 'doble-retroceso',
          marca_leida_en_la_entrada_de_mas: '/appointments',
          abajo: [ROOT, '/appointments'],
          actual: '/appointments',
          marca_de_la_entrada_actual: { frjUnder: ROOT },
          dos_entradas_identicas_adyacentes: false,
        },
      }
    },
  },
  {
    id: 'E-6',
    titulo: 'el sentinel de salida (MOB-05 / A7, lo que implementa 03-03) — estar parado sobre él cuenta como armado',
    cierra: 'A7',
    async correr(cdp) {
      await reiniciarEn(cdp, ROOT)
      await evaluar(cdp, `history.pushState({ frjExit: 1 }, '', '${ROOT}#salir')`)
      await empujar(cdp, '/appointments', `${ROOT}#salir`)
      const armada = await medir(cdp)
      const primerAtras = await retrocederGuardado(cdp)
      const sobreElSentinel = await medir(cdp)
      const pathnameSobreElSentinel = await evaluar(cdp, 'location.pathname')
      await evaluar(cdp, `
        new Promise((res) => {
          window.addEventListener('popstate', (e) => res(JSON.stringify(e.state ?? null)), { once: true })
          history.back()
        })
      `, { esperarPromesa: true })
      const consumido = await medir(cdp)
      return {
        medido: {
          armada: armada.abajo,
          marca_con_la_que_aterrizo_el_primer_atras: primerAtras,
          actual_tras_el_primer_atras: sobreElSentinel.actual,
          sentinel_vivo: sobreElSentinel.marca?.frjExit ?? null,
          pathname_sobre_el_sentinel: pathnameSobreElSentinel,
          actual_tras_consumirlo: consumido.actual,
          sentinel_tras_consumirlo: consumido.marca?.frjExit ?? null,
        },
        esperado: {
          armada: [ROOT, `${ROOT}#salir`, '/appointments'],
          marca_con_la_que_aterrizo_el_primer_atras: { frjExit: 1 },
          actual_tras_el_primer_atras: `${ROOT}#salir`,
          sentinel_vivo: 1,
          pathname_sobre_el_sentinel: ROOT,
          actual_tras_consumirlo: ROOT,
          sentinel_tras_consumirlo: null,
        },
      }
    },
  },
  {
    id: 'E-7',
    titulo: 'entrada directa (cicatriz 2) — con una sola entrada NO hay nada debajo y la política no puede retroceder',
    cierra: 'A4',
    async correr(cdp) {
      await reiniciarEn(cdp, '/finances')
      const m = await medir(cdp)
      // El candado explícito: pedir un retroceso guardado acá tiene que NEGARSE, no retroceder.
      let seNego = false
      try { await retrocederGuardado(cdp) } catch { seNego = true }
      const despues = await medir(cdp)
      return {
        medido: {
          indice: m.indice,
          abajo: m.abajo,
          el_retroceso_guardado_se_nego: seNego,
          sigue_parado_en: despues.actual,
        },
        esperado: {
          indice: 0,
          abajo: ['/finances'],
          el_retroceso_guardado_se_nego: true,
          sigue_parado_en: '/finances',
        },
      }
    },
  },
  {
    id: 'E-8',
    titulo: 'la cadena de TRES pasos (criterio 4, lo que implementa 03-04) — /web con cambios sin guardar hacia un destino de la barra',
    cierra: 'A5 + A6 COMPUESTOS: el disparador real del colapso es el guard de salida, no la barra',
    async correr(cdp) {
      // `[Inicio, Más, /web, /web#sin-guardar]`: una sección de la rama de Más con el sentinel de
      // cambios sin guardar arriba. Es la pila EXACTA del caso vivo — `/web` es una de las dos
      // únicas pantallas con guarda, y la única que es sección de la rama de Más.
      await reiniciarEn(cdp, ROOT)
      await empujar(cdp, MORE, ROOT)
      await empujar(cdp, '/web', MORE)
      await empujarSentinelDeCambios(cdp, '/web#sin-guardar')
      const armada = await medir(cdp)
      const cadena = await cadenaDeTresPasos(cdp, '/clients')
      const m = await medir(cdp)
      const hayIdenticasAdyacentes = m.abajo.some((r, i) => i > 0 && r === m.abajo[i - 1])
      return {
        medido: {
          armada: armada.abajo,
          marca_de_la_entrada_de_arriba_al_armar: armada.marca,
          // ⚠ LAS DOS MEDICIONES QUE DECIDEN EL DISEÑO DEL PROVIDER.
          la_marca_de_la_rama_con_el_sentinel_arriba: cadena.marcaConElSentinelArriba,
          la_marca_de_la_rama_tras_consumir_el_sentinel: cadena.marcaTrasElConsumo,
          rama_tomada: cadena.rama,
          marca_leida_en_la_entrada_de_mas: cadena.marcaDebajo,
          abajo: m.abajo,
          actual: m.actual,
          adelante: m.adelante,
          atras_cae_en: m.abajo[m.abajo.length - 2] ?? null,
          dos_entradas_identicas_adyacentes: hayIdenticasAdyacentes,
          mas_quedo_inmediatamente_debajo: m.abajo[m.abajo.length - 2] === MORE,
        },
        esperado: {
          armada: [ROOT, MORE, '/web', '/web#sin-guardar'],
          marca_de_la_entrada_de_arriba_al_armar: { frjDirty: 1 },
          // El sentinel de cambios sin guardar lleva SÓLO su marca ⇒ con él arriba la marca de la
          // rama NO es legible. Es el hecho que obliga a re-derivar el plan tras el consumo.
          la_marca_de_la_rama_con_el_sentinel_arriba: null,
          la_marca_de_la_rama_tras_consumir_el_sentinel: MORE,
          rama_tomada: 'dos-consumos-y-reemplazo',
          marca_leida_en_la_entrada_de_mas: ROOT,
          abajo: [ROOT, '/clients'],
          actual: '/clients',
          adelante: ['/web', '/web#sin-guardar'],
          atras_cae_en: ROOT,
          dos_entradas_identicas_adyacentes: false,
          mas_quedo_inmediatamente_debajo: false,
        },
      }
    },
  },
  {
    id: 'E-9',
    titulo: 'el sentinel NO se queda enterrado (G-1 / G-2) — la forma VIEJA (empujar ENCIMA) contra la NUEVA (consumirlo primero)',
    cierra:
      'la causa MEDIDA de G-1 y G-2: con el destino empujado ENCIMA, la entrada del sentinel queda ' +
      'ENTERRADA en el camino del atras y deja dos entradas adyacentes de la MISMA PANTALLA — el ' +
      'atras muerto que el criterio 2 prohibe explicitamente. Consumiendola primero, no',
    async correr(cdp) {
      // ⚠ LAS DOS FORMAS VAN EN EL MISMO ESCENARIO A PROPOSITO: es lo que lo vuelve una MEDICION y no
      // una afirmacion. La booleana de la forma vieja se declara en VERDADERO porque ese valor ES el
      // bug medido, y tiene que quedar en el instrumento y no en un comentario.

      // ── LA FORMA VIEJA · el destino se empuja ENCIMA del sentinel ──────────────────────────────
      await reiniciarEn(cdp, ROOT)
      await evaluar(cdp, `history.pushState({ frjExit: 1 }, '', '${ROOT}#salir')`)
      // La seccion de la barra se marca con el PATHNAME de la raiz y no con la ruta completa que la
      // entrada de abajo tiene en la URL (`/dashboard#salir`): la marca la escribe un efecto que
      // observa `usePathname()`, y el pathname NO ve el hash. Esa asimetria es justo la razon por la
      // que el candado de abajo compara por PATHNAME y no por ruta completa.
      await empujar(cdp, '/appointments', ROOT)
      const vieja = await medir(cdp)
      const pathnamesVieja = vieja.abajo.map((ruta) => ruta.split('#')[0])
      const paresVieja = vieja.abajo
        .map((ruta, i) =>
          i > 0 && pathnamesVieja[i] === pathnamesVieja[i - 1] ? `${vieja.abajo[i - 1]} | ${ruta}` : null,
        )
        .filter((par) => par !== null)
      // "Enterrada" = hay al menos una entrada ARRIBA del sentinel dentro del camino del atras.
      const indiceDelSentinelVieja = vieja.abajo.findIndex((ruta) => ruta.includes('#salir'))
      const sentinelEnterradoVieja =
        indiceDelSentinelVieja !== -1 && indiceDelSentinelVieja < vieja.abajo.length - 1

      // ── LA FORMA NUEVA · se consume el sentinel y RECIEN ENTONCES se navega ────────────────────
      await reiniciarEn(cdp, ROOT)
      await evaluar(cdp, `history.pushState({ frjExit: 1 }, '', '${ROOT}#salir')`)
      const salida = await salirDeLaRaizConsumiendoElSentinel(cdp, '/appointments', ROOT)
      const nueva = await medir(cdp)
      const pathnamesNueva = nueva.abajo.map((ruta) => ruta.split('#')[0])
      const paresNueva = nueva.abajo
        .map((ruta, i) =>
          i > 0 && pathnamesNueva[i] === pathnamesNueva[i - 1] ? `${nueva.abajo[i - 1]} | ${ruta}` : null,
        )
        .filter((par) => par !== null)
      await retrocederGuardado(cdp)
      const unAtras = await medir(cdp)

      return {
        medido: {
          // (1) LA FORMA VIEJA, con el bug medido como numero y como booleana.
          vieja_abajo: vieja.abajo,
          vieja_pathnames_del_camino_del_atras: pathnamesVieja,
          vieja_pares_de_pathnames_repetidos: paresVieja,
          vieja_el_sentinel_quedo_enterrado: sentinelEnterradoVieja,
          vieja_hay_dos_entradas_adyacentes_de_la_misma_pantalla: paresVieja.length > 0,
          // (2) LA FORMA NUEVA: dos escalones, sin el sentinel en el camino del atras.
          nueva_consumio_el_sentinel_de_esta_instancia: salida.idDelSentinelConsumido,
          nueva_parado_tras_el_consumo: salida.paradoTrasElConsumo,
          nueva_abajo: nueva.abajo,
          nueva_escalones: nueva.abajo.length,
          nueva_el_sentinel_sobrevive_en_el_camino_del_atras: nueva.abajo.filter((r) => r.includes('#salir')),
          nueva_marca_del_destino: salida.marcaDelDestino,
          nueva_pathnames_del_camino_del_atras: pathnamesNueva,
          nueva_pares_de_pathnames_repetidos: paresNueva,
          nueva_atras_cae_en: nueva.abajo[nueva.abajo.length - 2] ?? null,
          nueva_actual_tras_un_atras: unAtras.actual,
        },
        esperado: {
          vieja_abajo: [ROOT, `${ROOT}#salir`, '/appointments'],
          vieja_pathnames_del_camino_del_atras: [ROOT, ROOT, '/appointments'],
          vieja_pares_de_pathnames_repetidos: [`${ROOT} | ${ROOT}#salir`],
          // ⚠ LAS DOS EN VERDADERO: es el bug, medido. Con el sentinel enterrado el atras aterriza
          // en `/dashboard#salir` —que se ve igual que Inicio— y el atras siguiente no hace nada
          // visible. (En E-11 ese mismo par esta ADMITIDO porque alla el sentinel es la entrada de
          // ARRIBA y su "nada visible" lo cubre el aviso de MOB-05; enterrado, no lo cubre nada.)
          vieja_el_sentinel_quedo_enterrado: true,
          vieja_hay_dos_entradas_adyacentes_de_la_misma_pantalla: true,
          nueva_consumio_el_sentinel_de_esta_instancia: 1,
          nueva_parado_tras_el_consumo: ROOT,
          nueva_abajo: [ROOT, '/appointments'],
          nueva_escalones: 2,
          nueva_el_sentinel_sobrevive_en_el_camino_del_atras: [],
          nueva_marca_del_destino: { frjUnder: ROOT },
          nueva_pathnames_del_camino_del_atras: [ROOT, '/appointments'],
          nueva_pares_de_pathnames_repetidos: [],
          nueva_atras_cae_en: ROOT,
          nueva_actual_tras_un_atras: ROOT,
        },
      }
    },
  },
  {
    id: 'E-10',
    titulo: 'la DECISION (a) del dueno (item H / G-4) — el sentinel se arma SOLO si no hay nada nuestro debajo',
    cierra:
      'la colision que la UAT destapo: parado en Inicio CON historia debajo, MOB-04 y MOB-05 no ' +
      'pueden ser verdad a la vez. El dueno eligio (a), y aca quedan medidas sus dos mitades',
    async correr(cdp) {
      // ⚠ LAS SEIS CONDICIONES EN ORDEN, escritas aca como las va a tener la app, igual que los otros
      // escenarios escriben la decision que miden. La de la decision (a) va **ULTIMA** y el orden es
      // el argumento: las cinco anteriores son de SEGURIDAD (nadie a quien avisar, lugar equivocado,
      // ventana abierta, ya armado, la entrada de arriba es de otro dueno) y esta es de POLITICA. Asi
      // nunca lee la marca de la rama estando parados sobre el sentinel, donde ese dato no significa
      // nada porque el state del sentinel lleva solo su propia clave.
      const accionDeArmado = ({ participates, atRoot, hintOpen, topIsOurs, foreignOwnsTop, algoNuestroDebajo }) => {
        if (!participates) return 'no-armar'
        if (!atRoot) return 'no-armar'
        if (hintOpen) return 'no-armar'
        if (topIsOurs) return 'no-armar'
        if (foreignOwnsTop) return 'no-armar'
        if (algoNuestroDebajo) return 'no-armar'
        return 'armar'
      }
      const LIBRE = { participates: true, atRoot: true, hintOpen: false, topIsOurs: false, foreignOwnsTop: false }

      // ── MITAD 1 · SIN NADA NUESTRO DEBAJO ⇒ ARMAR (MOB-05) ────────────────────────────────────
      // Una sola entrada en la raiz: la marca de la rama de la entrada de arriba es NULA.
      await reiniciarEn(cdp, ROOT)
      const sola = await medir(cdp)
      const marcaSinNadaDebajo = typeof sola.marca?.frjUnder === 'string' ? sola.marca.frjUnder : null
      const accionSinNadaDebajo = accionDeArmado({ ...LIBRE, algoNuestroDebajo: marcaSinNadaDebajo !== null })

      // ── MITAD 2 · CON UNA SECCION DEBAJO ⇒ NO ARMAR (MOB-04 / item H) ─────────────────────────
      // ⚠ LOS DOS TRAMOS SON **EMPUJES**, que es lo que la politica dice para ellos
      // (`from === root` ⇒ push, `to === root` ⇒ push). Con un reemplazo la marca no queda donde esta
      // mitad necesita y la medicion no mediria la decision.
      await reiniciarEn(cdp, ROOT)
      await empujar(cdp, '/appointments', ROOT)
      await empujar(cdp, ROOT, '/appointments')
      const conSeccion = await medir(cdp)
      const marcaConSeccionDebajo = typeof conSeccion.marca?.frjUnder === 'string' ? conSeccion.marca.frjUnder : null
      const accionConSeccionDebajo = accionDeArmado({ ...LIBRE, algoNuestroDebajo: marcaConSeccionDebajo !== null })
      // Y el atras: con (a) el sentinel NO se armo, asi que el retroceso guardado aterriza en LA
      // SECCION. Es MOB-04 y el item H de la UAT, que es lo que la decision del dueno recupera.
      await retrocederGuardado(cdp)
      const unAtras = await medir(cdp)

      return {
        medido: {
          mitad_1_abajo: sola.abajo,
          mitad_1_marca_de_la_rama_de_la_entrada_de_arriba: marcaSinNadaDebajo,
          mitad_1_hay_algo_nuestro_debajo: marcaSinNadaDebajo !== null,
          mitad_1_accion_de_armado: accionSinNadaDebajo,
          mitad_2_abajo: conSeccion.abajo,
          mitad_2_marca_de_la_rama_de_la_entrada_de_arriba: marcaConSeccionDebajo,
          mitad_2_hay_algo_nuestro_debajo: marcaConSeccionDebajo !== null,
          mitad_2_accion_de_armado: accionConSeccionDebajo,
          mitad_2_el_atras_cae_en: unAtras.actual,
          // El candado del ORDEN: parados SOBRE nuestro propio sentinel, la cuarta regla devuelve
          // antes y la de (a) NO se evalua — aunque la marca de la rama este presente.
          parados_sobre_el_nuestro_con_marca_de_rama_presente: accionDeArmado({
            ...LIBRE,
            topIsOurs: true,
            algoNuestroDebajo: true,
          }),
        },
        esperado: {
          mitad_1_abajo: [ROOT],
          mitad_1_marca_de_la_rama_de_la_entrada_de_arriba: null,
          mitad_1_hay_algo_nuestro_debajo: false,
          mitad_1_accion_de_armado: 'armar',
          mitad_2_abajo: [ROOT, '/appointments', ROOT],
          mitad_2_marca_de_la_rama_de_la_entrada_de_arriba: '/appointments',
          mitad_2_hay_algo_nuestro_debajo: true,
          mitad_2_accion_de_armado: 'no-armar',
          mitad_2_el_atras_cae_en: '/appointments',
          parados_sobre_el_nuestro_con_marca_de_rama_presente: 'no-armar',
        },
      }
    },
  },
  {
    // ⚠ EL ID SALTA DE E-10 A E-11 A PROPÓSITO: el plan 03-05 lo escribió reservando E-9 y E-10 para
    // los otros planes de esta misma tanda de cierre de gaps —el 03-06 los agrega arriba— y E-12 es
    // del mismo plan, más abajo. Un id reusado haría que dos escenarios distintos se llamen igual en
    // el veredicto, y el veredicto es el único lugar donde se lee qué se midió.
    id: 'E-11',
    titulo: 'LA INTERSECCION que faltaba (G-1 / G-3) — el sentinel de salida al fondo + la rama de Mas + el colapso, en la MISMA pila (el recorrido D7 de la UAT)',
    cierra:
      'el hueco que la UAT nombro: la interseccion de la marca de la rama con el SENTINEL DE SALIDA. ' +
      'Ningun escenario anterior la tocaba — E-6 probaba el sentinel AISLADO sobre una pila limpia, y ' +
      'E-8 lo cruzaba con el sentinel de CAMBIOS SIN GUARDAR, que es otra marca. Por eso la sonda dio ' +
      '8/8 con el telefono fallando en 5 items mas una colision de diseno',
    async correr(cdp) {
      // ── La pila de D7, con el sentinel al FONDO ────────────────────────────────────────────────
      // `Inicio (con el sentinel armado) → Turnos → Mas → Finanzas`. Es la pila que el dueno midio
      // en el telefono: recargo, quedo en Clientes, y dos atras lo dejaron en `dashboard#salir-3`.
      await reiniciarEn(cdp, ROOT)
      // El sentinel de salida: `{ frjExit }` y nada mas, igual que `panelExitState(id)` en la app.
      await evaluar(cdp, `history.pushState({ frjExit: 1 }, '', '${ROOT}#salir')`)
      // ⚠ LA SECCION DE LA BARRA SE MARCA CON EL **PATHNAME** DE LA RAIZ, no con la ruta completa que
      // la entrada de abajo tiene en la URL (`/dashboard#salir`). Es lo que hace la app: la marca la
      // escribe un efecto que observa `usePathname()`, y el pathname NO ve el hash. Esa asimetria es
      // justo la razon por la que el candado del atras muerto de mas abajo compara por **pathname** y
      // no por ruta completa.
      await empujar(cdp, '/appointments', ROOT)
      await empujar(cdp, MORE, '/appointments')
      await empujar(cdp, '/finances', MORE)
      const armada = await medir(cdp)

      // El colapso hacia un destino de la barra que NO es la ruta de abajo ⇒ rama de
      // retroceso-y-reemplazo. (La degenerada la mide el plan 03-06.)
      const plan = await colapsar(cdp, '/clients')
      const m = await medir(cdp)

      // ── EL CANDADO DEL ATRAS MUERTO, COMPARADO POR PATHNAME ────────────────────────────────────
      // E-5 compara por ruta completa, y aca eso pasaria EN FALSO: `/dashboard` y `/dashboard#salir`
      // son rutas DISTINTAS y pantallas IGUALES, o sea exactamente el atras que no hace nada visible.
      const pathnamesDelCaminoDelAtras = m.abajo.map((ruta) => ruta.split('#')[0])
      const paresDePathnamesRepetidos = m.abajo
        .map((ruta, i) =>
          i > 0 && pathnamesDelCaminoDelAtras[i] === pathnamesDelCaminoDelAtras[i - 1]
            ? `${m.abajo[i - 1]} | ${ruta}`
            : null,
        )
        .filter((par) => par !== null)
      // El unico par de pathnames repetidos ADMITIDO es el del sentinel: es una entrada ABSORBENTE
      // —existe para comerse el primer atras en la raiz— y su "nada visible" lo cubre el aviso de
      // MOB-05. Cualquier otro par es el defecto.
      const paresQueNoSonElDelSentinel = paresDePathnamesRepetidos.filter(
        (par) => !par.split(' | ')[1].includes('#salir'),
      )

      // ── Los dos atras, para ver que el sentinel sigue al fondo y sigue siendo suyo ─────────────
      await retrocederGuardado(cdp)
      const unAtras = await medir(cdp)
      await retrocederGuardado(cdp)
      const dosAtras = await medir(cdp)

      return {
        medido: {
          armada: armada.abajo,
          abajo: m.abajo,
          actual: m.actual,
          adelante: m.adelante,
          // (1) LA PROPAGACION: el reemplazo del colapso deja la RUTA REAL DE ABAJO.
          marca_de_la_entrada_actual: m.marca,
          // (2) de donde sale ese dato: lo leyo el segundo paso en la entrada de Mas.
          ruta_que_leyo_el_segundo_paso_en_la_entrada_de_mas: plan.marcaLeida,
          rama_tomada: plan.rama,
          // (3) ⚠ LA MENTIRA DEL PAR DE RUTAS, MEDIDA COMO NUMERO. El tramo que el efecto de marcado
          // ve es (ruta de Mas → destino), y la politica lo declara EMPUJE (`from === more`), asi que
          // derivaria la ruta de Mas. Pero el reemplazo PISO la entrada de Mas: lo que quedo debajo
          // es lo que habia debajo de Mas. Las dos claves y la afirmacion de que NO coinciden quedan
          // medidas para que el dia que alguien "simplifique" la propagacion el candado lo diga.
          marca_que_DERIVARIA_el_par_de_rutas: MORE,
          ruta_real_de_abajo: plan.marcaLeida,
          la_derivada_y_la_real_coinciden: plan.marcaLeida === MORE,
          // (4) el candado del atras muerto, por pathname.
          pathnames_del_camino_del_atras: pathnamesDelCaminoDelAtras,
          pares_de_pathnames_repetidos: paresDePathnamesRepetidos,
          pares_de_pathnames_repetidos_que_no_son_el_del_sentinel: paresQueNoSonElDelSentinel,
          // (5) donde cae el atras, y el sentinel al fondo con su clave viva.
          atras_cae_en: m.abajo[m.abajo.length - 2] ?? null,
          actual_tras_un_atras: unAtras.actual,
          actual_tras_dos_atras: dosAtras.actual,
          marca_de_la_entrada_del_sentinel: dosAtras.marca,
          el_sentinel_sigue_al_fondo: m.abajo.filter((ruta) => ruta.includes('#salir')),
        },
        esperado: {
          armada: [ROOT, `${ROOT}#salir`, '/appointments', MORE, '/finances'],
          abajo: [ROOT, `${ROOT}#salir`, '/appointments', '/clients'],
          actual: '/clients',
          adelante: ['/finances'],
          marca_de_la_entrada_actual: { frjUnder: '/appointments' },
          ruta_que_leyo_el_segundo_paso_en_la_entrada_de_mas: '/appointments',
          rama_tomada: 'retroceso-y-reemplazo',
          marca_que_DERIVARIA_el_par_de_rutas: MORE,
          ruta_real_de_abajo: '/appointments',
          la_derivada_y_la_real_coinciden: false,
          pathnames_del_camino_del_atras: [ROOT, ROOT, '/appointments', '/clients'],
          pares_de_pathnames_repetidos: [`${ROOT} | ${ROOT}#salir`],
          pares_de_pathnames_repetidos_que_no_son_el_del_sentinel: [],
          atras_cae_en: '/appointments',
          actual_tras_un_atras: '/appointments',
          actual_tras_dos_atras: `${ROOT}#salir`,
          marca_de_la_entrada_del_sentinel: { frjExit: 1 },
          el_sentinel_sigue_al_fondo: [`${ROOT}#salir`],
        },
      }
    },
  },
  {
    id: 'E-12',
    titulo: 'el DEGENERADO con el sentinel al fondo (G-2) — el primer atras CAMBIA DE PANTALLA',
    cierra:
      'G-2 (*"a la primera que toco atras no hace nada"*): el caso degenerado del criterio 2 armado ' +
      'con el consumo del sentinel al salir de la raiz, asi que el sentinel nunca queda enterrado y ' +
      'el primer atras hace algo VISIBLE. E-5 medía el degenerado SIN sentinel; este, con el',
    async correr(cdp) {
      // ── La pila armada CON EL HELPER NUEVO ─────────────────────────────────────────────────────
      // `Inicio (con el sentinel armado) → Turnos → Mas → Finanzas`, igual que la de E-11, pero
      // saliendo de la raiz CONSUMIENDO el sentinel en vez de empujando encima. Ese es el punto: el
      // sentinel no queda enterrado, y por eso el camino del atras no tiene dos entradas de la misma
      // pantalla cuando el colapso termina.
      await reiniciarEn(cdp, ROOT)
      await evaluar(cdp, `history.pushState({ frjExit: 1 }, '', '${ROOT}#salir')`)
      await salirDeLaRaizConsumiendoElSentinel(cdp, '/appointments', ROOT)
      await empujar(cdp, MORE, '/appointments')
      await empujar(cdp, '/finances', MORE)
      const armada = await medir(cdp)

      // El colapso hacia LA SECCION DE LA BARRA, que es el caso DEGENERADO: el destino coincide con
      // la ruta que quedaria debajo ⇒ rama de DOBLE RETROCESO, sin navegar.
      const plan = await colapsar(cdp, '/appointments')
      const m = await medir(cdp)

      // El candado del atras muerto, comparado por PATHNAME (no por ruta completa: `/dashboard` y
      // `/dashboard#salir` son rutas distintas y pantallas iguales).
      const pathnamesDelCaminoDelAtras = m.abajo.map((ruta) => ruta.split('#')[0])
      const paresDePathnamesRepetidos = m.abajo
        .map((ruta, i) =>
          i > 0 && pathnamesDelCaminoDelAtras[i] === pathnamesDelCaminoDelAtras[i - 1]
            ? `${m.abajo[i - 1]} | ${ruta}`
            : null,
        )
        .filter((par) => par !== null)

      // ── LA CLAVE DE G-2: que el atras SIGUIENTE cambie de pathname ────────────────────────────
      // Lo que el dueno midio no fue una pila mal armada: fue un gesto que no produjo NADA VISIBLE.
      // Asi que se mide el pathname antes y despues del atras, y se afirma que son distintos.
      const pathnameAntesDelAtras = await evaluar(cdp, 'location.pathname')
      await retrocederGuardado(cdp)
      const unAtras = await medir(cdp)
      const pathnameTrasElAtras = await evaluar(cdp, 'location.pathname')

      return {
        medido: {
          armada: armada.abajo,
          el_sentinel_quedo_enterrado_al_armar: armada.abajo.filter((r) => r.includes('#salir')),
          rama_tomada: plan.rama,
          marca_leida_en_la_entrada_de_mas: plan.marcaLeida,
          abajo: m.abajo,
          actual: m.actual,
          adelante: m.adelante,
          marca_de_la_entrada_actual: m.marca,
          pathnames_del_camino_del_atras: pathnamesDelCaminoDelAtras,
          pares_de_pathnames_repetidos: paresDePathnamesRepetidos,
          atras_cae_en: m.abajo[m.abajo.length - 2] ?? null,
          pathname_antes_del_atras: pathnameAntesDelAtras,
          pathname_tras_el_atras: pathnameTrasElAtras,
          el_primer_atras_cambia_de_pathname: pathnameAntesDelAtras !== pathnameTrasElAtras,
          actual_tras_un_atras: unAtras.actual,
        },
        esperado: {
          armada: [ROOT, '/appointments', MORE, '/finances'],
          // La prueba de que el helper hizo su trabajo: el sentinel NO esta en el camino del atras.
          el_sentinel_quedo_enterrado_al_armar: [],
          rama_tomada: 'doble-retroceso',
          marca_leida_en_la_entrada_de_mas: '/appointments',
          abajo: [ROOT, '/appointments'],
          actual: '/appointments',
          adelante: [MORE, '/finances'],
          marca_de_la_entrada_actual: { frjUnder: ROOT },
          pathnames_del_camino_del_atras: [ROOT, '/appointments'],
          pares_de_pathnames_repetidos: [],
          atras_cae_en: ROOT,
          pathname_antes_del_atras: '/appointments',
          pathname_tras_el_atras: ROOT,
          el_primer_atras_cambia_de_pathname: true,
          actual_tras_un_atras: ROOT,
        },
      }
    },
  },
  {
    id: 'E-13',
    titulo: 'el CICLO de re-armado x3 sin acumular (G-5 / G-6) — y de donde sale el hash ESCALADO',
    cierra:
      'la SEMANTICA DE LA PILA del re-armado: el ciclo armar-consumir-rearmar repetido TRES veces no ' +
      'hace crecer el camino del atras ni produce entradas con el hash escalado (mitad A); y con el ' +
      'estado de la entrada PISADO por una escritura ajena, la URL sigue llevando nuestro hash, las ' +
      'cinco reglas viejas no detectan nada y el armado ESCALA el hash y suma una entrada mas — que ' +
      'es el origen MEDIDO de `dashboard#salir-3` y el argumento de la SEPTIMA regla (mitad B). ' +
      'NO cierra el cableado de React: esta sonda monta su propio servidor estatico y no corre el ' +
      'codigo de la app, asi que A1, A2 y A11 siguen abiertos y los cierra la UAT del plan 03-08',
    async correr(cdp) {
      // ⚠ LAS CINCO REGLAS VIEJAS, escritas aca como las tiene la app HOY —sin la septima—, igual que
      // E-10 escribe las seis. Son las que la mitad B afirma que NO detectan nada con el estado
      // pisado: ese es todo el argumento de la regla nueva.
      const accionDeArmadoVieja = ({ participates, atRoot, hintOpen, topIsOurs, foreignOwnsTop, algoNuestroDebajo }) => {
        if (!participates) return 'no-armar'
        if (!atRoot) return 'no-armar'
        if (hintOpen) return 'no-armar'
        if (topIsOurs) return 'no-armar'
        if (foreignOwnsTop) return 'no-armar'
        if (algoNuestroDebajo) return 'no-armar'
        return 'armar'
      }
      // Y la SEPTIMA, en el lugar exacto en el que va: DESPUES de *ya estoy armado* y ANTES de la de
      // politica. Las dos primeras hablan de la entrada de arriba; la de politica es la unica que no.
      const accionDeArmadoConLaSeptima = ({ participates, atRoot, hintOpen, topIsOurs, foreignOwnsTop, urlYaLlevaNuestroHash, algoNuestroDebajo }) => {
        if (!participates) return 'no-armar'
        if (!atRoot) return 'no-armar'
        if (hintOpen) return 'no-armar'
        if (topIsOurs) return 'no-armar'
        if (urlYaLlevaNuestroHash) return 'no-armar'
        if (foreignOwnsTop) return 'no-armar'
        if (algoNuestroDebajo) return 'no-armar'
        return 'armar'
      }
      const LIBRE = { participates: true, atRoot: true, hintOpen: false, topIsOurs: false, foreignOwnsTop: false, urlYaLlevaNuestroHash: false, algoNuestroDebajo: false }

      // ── MITAD A · EL CICLO DE RE-ARMADO, TRES VECES, SIN ACUMULAR ─────────────────────────────
      // Es el candado de `dashboard#salir-3`: lo que el dueno midio era que las entradas de salida se
      // **acumulaban**. Se parte de la raiz con UNA sola entrada y se repite el ciclo completo
      // (armar → consumir → re-armar) tres veces seguidas, midiendo cada vuelta.
      await reiniciarEn(cdp, ROOT)
      const hashesEmpujados = []
      const caminosAlArmar = []
      const actualesAlArmar = []
      const sentinelesVivos = []
      const caminosTrasConsumir = []
      const actualesTrasConsumir = []
      for (let vuelta = 1; vuelta <= 3; vuelta++) {
        hashesEmpujados.push(await armarElSentinel(cdp, 1))
        const armado = await medir(cdp)
        caminosAlArmar.push(armado.abajo)
        actualesAlArmar.push(armado.actual)
        sentinelesVivos.push(armado.marca?.frjExit ?? null)
        await consumirElSentinel(cdp)
        const consumido = await medir(cdp)
        caminosTrasConsumir.push(consumido.abajo)
        actualesTrasConsumir.push(consumido.actual)
      }
      // El candado que de verdad importa: ninguna entrada del camino del atras, en ninguna vuelta,
      // llego a tener el hash ESCALADO.
      const entradasConHashEscalado = [...caminosAlArmar, ...caminosTrasConsumir]
        .flat()
        .filter((ruta) => ruta.includes('#salir-'))
      const largosAlArmar = caminosAlArmar.map((camino) => camino.length)

      // ── MITAD B · DE DONDE SALE EL HASH ESCALADO ──────────────────────────────────────────────
      // El estado de la entrada del sentinel PISADO por una escritura ajena: un `replaceState` con un
      // state que NO lleva nuestra clave y SIN url, que es exactamente lo que hace el router al
      // sincronizar su propio estado. La URL se queda con nuestro hash; el estado, no.
      await reiniciarEn(cdp, ROOT)
      await armarElSentinel(cdp, 1)
      await evaluar(cdp, `history.replaceState({ router: 'ajeno' }, '')`)
      const pisado = await medir(cdp)
      const hashEnLaUrl = await evaluar(cdp, 'location.hash')
      const laUrlLlevaNuestroHash = hashEnLaUrl.startsWith('#salir')
      const elEstadoLlevaNuestraMarca = typeof pisado.marca?.frjExit !== 'undefined'
      // Las cinco viejas con los hechos REALES de este momento: la entrada de arriba ya no es nuestra
      // (su estado se perdio) y no lleva marca de rama, asi que ninguna devuelve antes y el armado
      // sigue adelante. Es el bug, medido.
      const veredictoDeLasViejas = accionDeArmadoVieja({
        ...LIBRE,
        topIsOurs: elEstadoLlevaNuestraMarca,
        algoNuestroDebajo: typeof pisado.marca?.frjUnder === 'string',
      })
      const veredictoConLaSeptima = accionDeArmadoConLaSeptima({
        ...LIBRE,
        topIsOurs: elEstadoLlevaNuestraMarca,
        urlYaLlevaNuestroHash: laUrlLlevaNuestroHash,
        algoNuestroDebajo: typeof pisado.marca?.frjUnder === 'string',
      })
      // Y lo que PASARIA si se armara igual: el hash escalado y una entrada mas en el camino del
      // atras, cada una con un atras que no hace nada visible.
      const hashEscalado = await armarElSentinel(cdp, 1)
      const trasArmarSobreElPisado = await medir(cdp)

      return {
        medido: {
          mitad_A_hashes_empujados_en_las_tres_vueltas: hashesEmpujados,
          mitad_A_camino_del_atras_al_armar_en_cada_vuelta: caminosAlArmar,
          mitad_A_largos_del_camino_del_atras_al_armar: largosAlArmar,
          mitad_A_el_camino_del_atras_crecio: largosAlArmar.some((largo) => largo !== largosAlArmar[0]),
          mitad_A_actual_al_armar_en_cada_vuelta: actualesAlArmar,
          mitad_A_sentinel_vivo_en_cada_vuelta: sentinelesVivos,
          mitad_A_camino_del_atras_tras_consumir_en_cada_vuelta: caminosTrasConsumir,
          mitad_A_actual_tras_consumir_en_cada_vuelta: actualesTrasConsumir,
          mitad_A_entradas_con_el_hash_escalado: entradasConHashEscalado,
          mitad_B_hash_en_la_url_con_el_estado_pisado: hashEnLaUrl,
          mitad_B_la_url_lleva_nuestro_hash: laUrlLlevaNuestroHash,
          mitad_B_el_estado_lleva_nuestra_marca: elEstadoLlevaNuestraMarca,
          mitad_B_camino_del_atras_con_el_estado_pisado: pisado.abajo,
          mitad_B_las_cinco_reglas_viejas_dicen: veredictoDeLasViejas,
          mitad_B_la_septima_regla_dice: veredictoConLaSeptima,
          mitad_B_hash_que_produce_armar_sobre_el_estado_pisado: hashEscalado,
          mitad_B_camino_del_atras_tras_armar_sobre_el_estado_pisado: trasArmarSobreElPisado.abajo,
          mitad_B_el_camino_del_atras_crecio_un_escalon: trasArmarSobreElPisado.abajo.length === pisado.abajo.length + 1,
        },
        esperado: {
          // El ciclo sano: el hash es SIEMPRE el base, porque tras consumir la entrada el navegador
          // restaura la URL de abajo (que no tiene hash). Si aqui saliera el escalado, el escenario
          // estaria re-armando PARADO SOBRE la entrada vieja en vez de despues de consumirla.
          mitad_A_hashes_empujados_en_las_tres_vueltas: ['#salir', '#salir', '#salir'],
          mitad_A_camino_del_atras_al_armar_en_cada_vuelta: [
            [ROOT, `${ROOT}#salir`],
            [ROOT, `${ROOT}#salir`],
            [ROOT, `${ROOT}#salir`],
          ],
          mitad_A_largos_del_camino_del_atras_al_armar: [2, 2, 2],
          mitad_A_el_camino_del_atras_crecio: false,
          mitad_A_actual_al_armar_en_cada_vuelta: [`${ROOT}#salir`, `${ROOT}#salir`, `${ROOT}#salir`],
          mitad_A_sentinel_vivo_en_cada_vuelta: [1, 1, 1],
          mitad_A_camino_del_atras_tras_consumir_en_cada_vuelta: [[ROOT], [ROOT], [ROOT]],
          mitad_A_actual_tras_consumir_en_cada_vuelta: [ROOT, ROOT, ROOT],
          mitad_A_entradas_con_el_hash_escalado: [],
          // La mitad B es EL BUG MEDIDO, con sus valores literales: la URL nuestra, el estado ajeno.
          mitad_B_hash_en_la_url_con_el_estado_pisado: '#salir',
          mitad_B_la_url_lleva_nuestro_hash: true,
          mitad_B_el_estado_lleva_nuestra_marca: false,
          mitad_B_camino_del_atras_con_el_estado_pisado: [ROOT, `${ROOT}#salir`],
          mitad_B_las_cinco_reglas_viejas_dicen: 'armar',
          mitad_B_la_septima_regla_dice: 'no-armar',
          mitad_B_hash_que_produce_armar_sobre_el_estado_pisado: '#salir-2',
          mitad_B_camino_del_atras_tras_armar_sobre_el_estado_pisado: [ROOT, `${ROOT}#salir`, `${ROOT}#salir-2`],
          mitad_B_el_camino_del_atras_crecio_un_escalon: true,
        },
      }
    },
  },
  {
    id: 'E-14',
    titulo: 'G2-1 — el ciclo Inicio<->seccion: la forma VIEJA (empuja, +2 por vuelta) contra la NUEVA (retrocede)',
    cierra:
      'el CRUCE que faltaba entre la regla de seccion->raiz y el SENTINEL DE SALIDA. El 8/8 de la ronda 1 ' +
      'era verdad y no alcanzaba porque ningun escenario cruzaba `frjExit` con `frjUnder`, y esa es la causa ' +
      'MEDIDA de cuatro gaps. Aca el ciclo Inicio<->seccion se mide con el sentinel ADENTRO del ciclo: la ' +
      'mitad A deja el crecimiento de DOS entradas por vuelta y la falta del aviso medidos como NUMEROS, y la ' +
      'mitad B afirma que con el retroceso guardado la profundidad NO crece, el aterrizaje no lleva nuestra ' +
      'marca, el armado procede y el hash empujado es SIEMPRE el base. ' +
      'NO cierra el cableado de React: esta sonda monta su propio servidor estatico y no corre el codigo de ' +
      'la app, asi que A1, A2 y A11 siguen abiertos y los cierra la UAT del plan 03-10',
    async correr(cdp) {
      // ⚠ LA DECISION DE RAMA, EN CODIGO EJECUTABLE ADENTRO DEL ESCENARIO y con sus reglas EN ORDEN,
      // igual que E-10 y E-13. El orden es la mitad del arreglo: la regla nueva va DESPUES de la del
      // sentinel en la raiz —ahi el gesto ya tiene dueno— y ANTES de la que dice *sin el hecho de la
      // rama no se retrocede* —ahi el hecho de la rama es falso y la decision caeria en EMPUJAR, que
      // es literalmente el bug—. Un escenario que lo escriba de otra forma mide otra cosa.
      const planDeRama = ({ from, to, root, more, raizDebajo, masDebajo, holdsExitSentinel }) => {
        const modo =
          from === to ? 'replace'
            : from === root ? 'push'
              : to === root ? 'push'
                : to === more ? 'push'
                  : from === more ? 'push'
                    : 'replace'
        if (holdsExitSentinel && from === to) return 'none'
        if (holdsExitSentinel && from === root && to !== from) return 'consume-exit-then-navigate'
        // ── LA REGLA NUEVA (G2-1) — seccion -> raiz es un RETROCESO, no un empuje. ──────────────
        if (raizDebajo && to === root && from !== to) return 'up'
        if (!masDebajo) return modo
        if (from === to) return modo
        if (to === more) return 'up'
        return 'collapse-then-replace'
      }
      // La accion de armado con las SIETE reglas, copiada de E-13 (la de E-10 tiene seis y quedo vieja).
      const accionDeArmado = ({ participates, atRoot, hintOpen, topIsOurs, foreignOwnsTop, urlYaLlevaNuestroHash, algoNuestroDebajo }) => {
        if (!participates) return 'no-armar'
        if (!atRoot) return 'no-armar'
        if (hintOpen) return 'no-armar'
        if (topIsOurs) return 'no-armar'
        if (urlYaLlevaNuestroHash) return 'no-armar'
        if (foreignOwnsTop) return 'no-armar'
        if (algoNuestroDebajo) return 'no-armar'
        return 'armar'
      }
      const LIBRE = { participates: true, atRoot: true, hintOpen: false, topIsOurs: false, foreignOwnsTop: false, urlYaLlevaNuestroHash: false, algoNuestroDebajo: false }
      const SECCION = '/clients'
      const soloPathname = (ruta) => ruta.split('#')[0]
      /** Pares ADYACENTES con el mismo pathname en el camino del atras (la cicatriz 1, mirada por pathname). */
      const paresAdyacentes = (camino) => camino.filter((r, i) => i > 0 && soloPathname(camino[i - 1]) === soloPathname(r)).length
      /** Los hechos de la pila, leidos del estado de la entrada de arriba: la marca DICE la raiz / DICE Mas. */
      const hechosDe = (marca) => ({
        raizDebajo: (marca && typeof marca.frjUnder === 'string' ? marca.frjUnder : null) === ROOT,
        masDebajo: (marca && typeof marca.frjUnder === 'string' ? marca.frjUnder : null) === MORE,
        holdsExitSentinel: typeof marca?.frjExit !== 'undefined',
      })

      // ── MITAD A · LA FORMA VIEJA: tocar Inicio EMPUJA (lo que la politica de rutas dice hoy) ──
      // Se entra a Inicio, se arma el sentinel y se sale de la raiz CONSUMIENDOLO hacia una seccion
      // de la barra (plan 03-06). A partir de ahi el ciclo Inicio<->seccion, tres vueltas.
      await reiniciarEnLimpio(cdp, ROOT)
      const hashAlEntrarA = await armarElSentinel(cdp, 1)
      await salirDeLaRaizConsumiendoElSentinel(cdp, SECCION, ROOT)
      const profundidadesA = []
      const marcasDeInicioA = []
      const armadosA = []
      for (let vuelta = 1; vuelta <= 3; vuelta++) {
        await empujar(cdp, ROOT, SECCION)
        const m = await medir(cdp)
        profundidadesA.push(m.abajo.length)
        marcasDeInicioA.push(m.marca)
        armadosA.push(accionDeArmado({ ...LIBRE, algoNuestroDebajo: typeof m.marca?.frjUnder === 'string' }))
        if (vuelta < 3) await empujar(cdp, SECCION, ROOT)
      }
      const finalA = await medir(cdp)

      // ── MITAD B · LA FORMA NUEVA: el gesto lo resuelve el RETROCESO GUARDADO ──────────────────
      // El mismo ciclo, con el sentinel adentro: se retrocede, se arma sobre el aterrizaje, se
      // consume y se vuelve a la seccion. Tres vueltas, midiendo las mismas tres cosas.
      await reiniciarEnLimpio(cdp, ROOT)
      const hashAlEntrarB = await armarElSentinel(cdp, 1)
      await salirDeLaRaizConsumiendoElSentinel(cdp, SECCION, ROOT)
      const planesB = []
      const profundidadesB = []
      const marcasDeInicioB = []
      const armadosB = []
      const hashesB = []
      const paresB = []
      for (let vuelta = 1; vuelta <= 3; vuelta++) {
        const arriba = await medir(cdp)
        planesB.push(planDeRama({ from: SECCION, to: ROOT, root: ROOT, more: MORE, ...hechosDe(arriba.marca) }))
        await retrocederGuardado(cdp)
        const m = await medir(cdp)
        profundidadesB.push(m.abajo.length)
        marcasDeInicioB.push(m.marca)
        armadosB.push(accionDeArmado({ ...LIBRE, algoNuestroDebajo: typeof m.marca?.frjUnder === 'string' }))
        hashesB.push(await armarElSentinel(cdp, 1))
        paresB.push(paresAdyacentes((await medir(cdp)).abajo))
        await consumirElSentinel(cdp)
        await empujar(cdp, SECCION, ROOT)
      }

      return {
        medido: {
          mitad_A_hash_al_entrar_a_inicio: hashAlEntrarA,
          mitad_A_profundidades_del_camino_del_atras: profundidadesA,
          mitad_A_crece_dos_por_vuelta:
            profundidadesA[1] - profundidadesA[0] === 2 && profundidadesA[2] - profundidadesA[1] === 2,
          mitad_A_marca_de_la_entrada_de_inicio: marcasDeInicioA,
          mitad_A_accion_de_armado_en_cada_vuelta: armadosA,
          mitad_A_el_sentinel_en_el_camino_del_atras: finalA.abajo.filter((r) => r.includes('#salir')),
          mitad_B_hash_al_entrar_a_inicio: hashAlEntrarB,
          mitad_B_plan_en_cada_vuelta: planesB,
          mitad_B_profundidades_del_camino_del_atras: profundidadesB,
          mitad_B_la_profundidad_crecio: profundidadesB.some((p) => p !== profundidadesB[0]),
          mitad_B_marca_del_aterrizaje: marcasDeInicioB,
          mitad_B_accion_de_armado_en_cada_vuelta: armadosB,
          mitad_B_hashes_empujados_por_el_armado: hashesB,
          mitad_B_hashes_escalados: hashesB.filter((h) => h !== '#salir'),
          mitad_B_pares_adyacentes_con_el_mismo_pathname_al_armar: paresB,
        },
        esperado: {
          mitad_A_hash_al_entrar_a_inicio: '#salir',
          // EL NUMERO DEL BUG: 3 -> 5 -> 7. Dos entradas por vuelta, sin techo.
          mitad_A_profundidades_del_camino_del_atras: [3, 5, 7],
          mitad_A_crece_dos_por_vuelta: true,
          // Y LA OTRA MITAD, la que el dueno vio: cada entrada de Inicio alcanzada por el empuje
          // queda marcada con la SECCION que quedo debajo ⇒ la septima regla dice *no armar* ⇒ el
          // aviso de salida NUNCA se arma. *"al tocar inicio despues de haber hecho otras cosas cae
          // a /dashboard y la guarda de salir no esta"*.
          mitad_A_marca_de_la_entrada_de_inicio: [
            { frjUnder: SECCION },
            { frjUnder: SECCION },
            { frjUnder: SECCION },
          ],
          mitad_A_accion_de_armado_en_cada_vuelta: ['no-armar', 'no-armar', 'no-armar'],
          mitad_A_el_sentinel_en_el_camino_del_atras: [],
          mitad_B_hash_al_entrar_a_inicio: '#salir',
          mitad_B_plan_en_cada_vuelta: ['up', 'up', 'up'],
          // LA CORRECCION, medida: la profundidad se queda IGUAL en las tres vueltas.
          mitad_B_profundidades_del_camino_del_atras: [1, 1, 1],
          mitad_B_la_profundidad_crecio: false,
          // El dueno aterriza en la entrada ORIGINAL de Inicio, que no tiene nada nuestro debajo.
          mitad_B_marca_del_aterrizaje: [null, null, null],
          mitad_B_accion_de_armado_en_cada_vuelta: ['armar', 'armar', 'armar'],
          mitad_B_hashes_empujados_por_el_armado: ['#salir', '#salir', '#salir'],
          mitad_B_hashes_escalados: [],
          // ⚠ EL CANDADO DE LA CICATRIZ 1, CON EL OJO PUESTO DONDE IMPORTA. Tiene que haber
          // EXACTAMENTE UN par adyacente con el mismo pathname: el par raiz / raiz-con-el-hash-del-
          // sentinel, que es LA CONDICION DE EXISTENCIA de la entrada del sentinel y NO un atras
          // muerto — consumirla muestra el aviso. Un candado copiado de E-11 (que compara por
          // pathname justamente para cazar el atras muerto) daria aca un falso rojo.
          mitad_B_pares_adyacentes_con_el_mismo_pathname_al_armar: [1, 1, 1],
        },
      }
    },
  },
  {
    id: 'E-15',
    titulo: 'la regla nueva DENTRO de la rama de Mas, donde el colapso YA compite: cual gana, medido',
    cierra:
      'el CRUCE de la regla nueva con la MARCA DE LA RAMA (`frjUnder` diciendo Mas) mas el SENTINEL DE ' +
      'SALIDA en el aterrizaje. Afirma, midiendo los DOS hechos como numeros, que la regla nueva NO le roba ' +
      'el gesto al colapso: dentro de la rama la marca dice Mas, asi que el hecho nuevo es FALSO y la ' +
      'decision sigue cayendo en colapsar-y-reemplazar, incluido su caso DEGENERADO (E-5). Y en la pila de ' +
      'dos escalones de la rama la marca dice la RAIZ, asi que el hecho nuevo es VERDADERO y el gesto es el ' +
      'retroceso. Es el hueco que el 8/8 de la ronda 1 no tocaba. ' +
      'NO cierra el cableado de React: A1, A2 y A11 siguen abiertos y los cierra la UAT del plan 03-10',
    async correr(cdp) {
      // La MISMA decision de rama, con sus reglas en el MISMO orden que E-14: la regla nueva despues
      // de la del sentinel en la raiz y antes de la que dice *sin el hecho de la rama no se retrocede*.
      const planDeRama = ({ from, to, root, more, raizDebajo, masDebajo, holdsExitSentinel }) => {
        const modo =
          from === to ? 'replace'
            : from === root ? 'push'
              : to === root ? 'push'
                : to === more ? 'push'
                  : from === more ? 'push'
                    : 'replace'
        if (holdsExitSentinel && from === to) return 'none'
        if (holdsExitSentinel && from === root && to !== from) return 'consume-exit-then-navigate'
        // ── LA REGLA NUEVA (G2-1) — seccion -> raiz es un RETROCESO, no un empuje. ──────────────
        if (raizDebajo && to === root && from !== to) return 'up'
        if (!masDebajo) return modo
        if (from === to) return modo
        if (to === more) return 'up'
        return 'collapse-then-replace'
      }
      const accionDeArmado = ({ participates, atRoot, hintOpen, topIsOurs, foreignOwnsTop, urlYaLlevaNuestroHash, algoNuestroDebajo }) => {
        if (!participates) return 'no-armar'
        if (!atRoot) return 'no-armar'
        if (hintOpen) return 'no-armar'
        if (topIsOurs) return 'no-armar'
        if (urlYaLlevaNuestroHash) return 'no-armar'
        if (foreignOwnsTop) return 'no-armar'
        if (algoNuestroDebajo) return 'no-armar'
        return 'armar'
      }
      const LIBRE = { participates: true, atRoot: true, hintOpen: false, topIsOurs: false, foreignOwnsTop: false, urlYaLlevaNuestroHash: false, algoNuestroDebajo: false }
      const soloPathname = (ruta) => ruta.split('#')[0]
      const paresAdyacentes = (camino) => camino.filter((r, i) => i > 0 && soloPathname(camino[i - 1]) === soloPathname(r)).length
      const hechosDe = (marca) => ({
        raizDebajo: (marca && typeof marca.frjUnder === 'string' ? marca.frjUnder : null) === ROOT,
        masDebajo: (marca && typeof marca.frjUnder === 'string' ? marca.frjUnder : null) === MORE,
        holdsExitSentinel: typeof marca?.frjExit !== 'undefined',
      })

      // ── MITAD A · LA PILA DE DOS ESCALONES DE LA RAMA: raiz y Mas encima ──────────────────────
      // La marca de la entrada de Mas dice la RAIZ ⇒ el hecho nuevo es VERDADERO y el de la rama
      // FALSO ⇒ la decision es el retroceso, y el dueno aterriza en la raiz con la pila en UN escalon.
      await reiniciarEnLimpio(cdp, ROOT)
      await empujar(cdp, MORE, ROOT)
      const arribaA = await medir(cdp)
      const hechosA = hechosDe(arribaA.marca)
      const planA = planDeRama({ from: MORE, to: ROOT, root: ROOT, more: MORE, ...hechosA })
      await retrocederGuardado(cdp)
      const aterrizajeA = await medir(cdp)
      const armadoA = accionDeArmado({ ...LIBRE, algoNuestroDebajo: typeof aterrizajeA.marca?.frjUnder === 'string' })

      // ── MITAD B · LA SECCION ABIERTA POR MAS: raiz, Mas y una seccion encima ──────────────────
      // La marca de la seccion dice MAS ⇒ el hecho nuevo es FALSO y el de la rama VERDADERO ⇒ la
      // decision es colapsar y reemplazar. Y como la ruta que quedo debajo de Mas COINCIDE con el
      // destino, el segundo paso es el DOBLE RETROCESO del caso degenerado (E-5).
      await reiniciarEnLimpio(cdp, ROOT)
      await empujar(cdp, MORE, ROOT)
      await empujar(cdp, '/finances', MORE)
      const arribaB = await medir(cdp)
      const hechosB = hechosDe(arribaB.marca)
      const planB = planDeRama({ from: '/finances', to: ROOT, root: ROOT, more: MORE, ...hechosB })
      const colapso = await colapsar(cdp, ROOT)
      const aterrizajeB = await medir(cdp)
      const armadoB = accionDeArmado({ ...LIBRE, algoNuestroDebajo: typeof aterrizajeB.marca?.frjUnder === 'string' })

      return {
        medido: {
          mitad_A_marca_de_la_entrada_de_mas: arribaA.marca,
          mitad_A_hecho_nuevo_la_marca_dice_la_raiz: hechosA.raizDebajo,
          mitad_A_hecho_de_la_rama_la_marca_dice_mas: hechosA.masDebajo,
          mitad_A_plan: planA,
          mitad_A_camino_del_atras_tras_el_retroceso: aterrizajeA.abajo,
          mitad_A_actual: aterrizajeA.actual,
          mitad_A_marca_del_aterrizaje: aterrizajeA.marca,
          mitad_A_accion_de_armado_del_aterrizaje: armadoA,
          mitad_B_marca_de_la_seccion: arribaB.marca,
          mitad_B_hecho_nuevo_la_marca_dice_la_raiz: hechosB.raizDebajo,
          mitad_B_hecho_de_la_rama_la_marca_dice_mas: hechosB.masDebajo,
          mitad_B_plan: planB,
          mitad_B_rama_que_tomo_el_colapso: colapso.rama,
          mitad_B_marca_leida_en_la_entrada_de_mas: colapso.marcaLeida,
          mitad_B_camino_del_atras: aterrizajeB.abajo,
          mitad_B_actual: aterrizajeB.actual,
          mitad_B_pares_adyacentes_con_el_mismo_pathname: paresAdyacentes(aterrizajeB.abajo),
          mitad_B_accion_de_armado_del_aterrizaje: armadoB,
        },
        esperado: {
          mitad_A_marca_de_la_entrada_de_mas: { frjUnder: ROOT },
          mitad_A_hecho_nuevo_la_marca_dice_la_raiz: true,
          mitad_A_hecho_de_la_rama_la_marca_dice_mas: false,
          mitad_A_plan: 'up',
          mitad_A_camino_del_atras_tras_el_retroceso: [ROOT],
          mitad_A_actual: ROOT,
          mitad_A_marca_del_aterrizaje: null,
          mitad_A_accion_de_armado_del_aterrizaje: 'armar',
          mitad_B_marca_de_la_seccion: { frjUnder: MORE },
          // ESTO es lo que afirma que la regla nueva NO le roba el gesto al colapso: dentro de la
          // rama de Mas el hecho nuevo es FALSO por construccion, porque la marca dice Mas.
          mitad_B_hecho_nuevo_la_marca_dice_la_raiz: false,
          mitad_B_hecho_de_la_rama_la_marca_dice_mas: true,
          mitad_B_plan: 'collapse-then-replace',
          mitad_B_rama_que_tomo_el_colapso: 'doble-retroceso',
          mitad_B_marca_leida_en_la_entrada_de_mas: ROOT,
          mitad_B_camino_del_atras: [ROOT],
          mitad_B_actual: ROOT,
          mitad_B_pares_adyacentes_con_el_mismo_pathname: 0,
          mitad_B_accion_de_armado_del_aterrizaje: 'armar',
        },
      }
    },
  },
  {
    id: 'E-16',
    titulo: 'las DOS formas en las que la regla NO se dispara, y que ve el dueno en cada una',
    cierra:
      'la DEGRADACION SEGURA y el LIMITE HONESTO de la regla nueva, medidos en vez de prometidos, y cruzados ' +
      'con las otras dos marcas: la mitad A pisa el estado de la entrada de arriba con un reemplazo blando ' +
      'ajeno (la marca PERDIDA) y afirma que NO hubo ningun retroceso —la pila queda un escalon mas larga, ' +
      'nunca el dueno fuera del sitio (cicatriz 2)— aunque el aviso se pierda; la mitad B usa la pila de TRES ' +
      'escalones que D-02 acepta a proposito, donde la raiz NO esta inmediatamente debajo, y afirma que el ' +
      'gesto SIGUE EMPUJANDO y que el atras desde ahi hace algo VISIBLE (vuelve a Mas). Es el hueco que el ' +
      '8/8 de la ronda 1 no tocaba: ningun escenario cruzaba el sentinel de salida con la marca de la rama. ' +
      'NO cierra el cableado de React: A1, A2 y A11 siguen abiertos y los cierra la UAT del plan 03-10',
    async correr(cdp) {
      // La MISMA decision de rama, con sus reglas en el MISMO orden que E-14 y E-15.
      const planDeRama = ({ from, to, root, more, raizDebajo, masDebajo, holdsExitSentinel }) => {
        const modo =
          from === to ? 'replace'
            : from === root ? 'push'
              : to === root ? 'push'
                : to === more ? 'push'
                  : from === more ? 'push'
                    : 'replace'
        if (holdsExitSentinel && from === to) return 'none'
        if (holdsExitSentinel && from === root && to !== from) return 'consume-exit-then-navigate'
        // ── LA REGLA NUEVA (G2-1) — seccion -> raiz es un RETROCESO, no un empuje. ──────────────
        if (raizDebajo && to === root && from !== to) return 'up'
        if (!masDebajo) return modo
        if (from === to) return modo
        if (to === more) return 'up'
        return 'collapse-then-replace'
      }
      const accionDeArmado = ({ participates, atRoot, hintOpen, topIsOurs, foreignOwnsTop, urlYaLlevaNuestroHash, algoNuestroDebajo }) => {
        if (!participates) return 'no-armar'
        if (!atRoot) return 'no-armar'
        if (hintOpen) return 'no-armar'
        if (topIsOurs) return 'no-armar'
        if (urlYaLlevaNuestroHash) return 'no-armar'
        if (foreignOwnsTop) return 'no-armar'
        if (algoNuestroDebajo) return 'no-armar'
        return 'armar'
      }
      const LIBRE = { participates: true, atRoot: true, hintOpen: false, topIsOurs: false, foreignOwnsTop: false, urlYaLlevaNuestroHash: false, algoNuestroDebajo: false }
      const SECCION = '/clients'
      const hechosDe = (marca) => ({
        raizDebajo: (marca && typeof marca.frjUnder === 'string' ? marca.frjUnder : null) === ROOT,
        masDebajo: (marca && typeof marca.frjUnder === 'string' ? marca.frjUnder : null) === MORE,
        holdsExitSentinel: typeof marca?.frjExit !== 'undefined',
      })

      // ── MITAD A · LA MARCA PERDIDA ────────────────────────────────────────────────────────────
      // Se arma la pila raiz + seccion y despues se PISA el estado de la entrada de arriba con un
      // reemplazo blando ajeno: un `replaceState` con un state que no lleva nuestra clave y SIN url,
      // que es literalmente lo que hace el router al sincronizar el suyo (el molde de E-13 mitad B).
      await reiniciarEnLimpio(cdp, ROOT)
      await empujar(cdp, SECCION, ROOT)
      await evaluar(cdp, `history.replaceState({ router: 'ajeno' }, '')`)
      const pisado = await medir(cdp)
      const hechosA = hechosDe(pisado.marca)
      const planA = planDeRama({ from: SECCION, to: ROOT, root: ROOT, more: MORE, ...hechosA })
      // El plan dice EMPUJAR, y el empuje marca con la ruta que queda debajo: la SECCION.
      await empujar(cdp, ROOT, SECCION)
      const despuesA = await medir(cdp)
      const armadoA = accionDeArmado({ ...LIBRE, algoNuestroDebajo: typeof despuesA.marca?.frjUnder === 'string' })

      // ── MITAD B · LA RAIZ QUE NO ESTA INMEDIATAMENTE DEBAJO ───────────────────────────────────
      // La pila de TRES escalones que D-02 acepta a proposito: raiz, una seccion de la barra y Mas
      // encima. La marca de la entrada de arriba dice la SECCION, no la raiz ⇒ el hecho nuevo es
      // FALSO ⇒ la decision EMPUJA, porque un retroceso de un paso aterrizaria en la seccion.
      await reiniciarEnLimpio(cdp, ROOT)
      await empujar(cdp, '/appointments', ROOT)
      await empujar(cdp, MORE, '/appointments')
      const arribaB = await medir(cdp)
      const hechosB = hechosDe(arribaB.marca)
      const planB = planDeRama({ from: MORE, to: ROOT, root: ROOT, more: MORE, ...hechosB })
      await empujar(cdp, ROOT, MORE)
      const despuesB = await medir(cdp)
      const armadoB = accionDeArmado({ ...LIBRE, algoNuestroDebajo: typeof despuesB.marca?.frjUnder === 'string' })
      const pathnameAntesDelAtras = await evaluar(cdp, 'location.pathname')
      await retrocederGuardado(cdp)
      const pathnameTrasElAtras = await evaluar(cdp, 'location.pathname')

      return {
        medido: {
          mitad_A_marca_con_el_estado_pisado: pisado.marca,
          mitad_A_hecho_nuevo_la_marca_dice_la_raiz: hechosA.raizDebajo,
          mitad_A_hecho_de_la_rama_la_marca_dice_mas: hechosA.masDebajo,
          mitad_A_plan: planA,
          mitad_A_el_plan_pide_un_retroceso: planA === 'up',
          mitad_A_camino_del_atras_antes: pisado.abajo,
          mitad_A_camino_del_atras_despues: despuesA.abajo,
          mitad_A_el_camino_del_atras_crecio_un_escalon: despuesA.abajo.length === pisado.abajo.length + 1,
          mitad_A_marca_de_la_entrada_nueva: despuesA.marca,
          mitad_A_accion_de_armado: armadoA,
          mitad_B_marca_de_la_entrada_de_arriba: arribaB.marca,
          mitad_B_hecho_nuevo_la_marca_dice_la_raiz: hechosB.raizDebajo,
          mitad_B_hecho_de_la_rama_la_marca_dice_mas: hechosB.masDebajo,
          mitad_B_plan: planB,
          mitad_B_camino_del_atras: despuesB.abajo,
          mitad_B_atras_cae_en: despuesB.abajo[despuesB.abajo.length - 2] ?? null,
          mitad_B_accion_de_armado: armadoB,
          mitad_B_pathname_antes_del_atras: pathnameAntesDelAtras,
          mitad_B_pathname_tras_el_atras: pathnameTrasElAtras,
          mitad_B_el_atras_hace_algo_visible: pathnameAntesDelAtras !== pathnameTrasElAtras,
        },
        esperado: {
          mitad_A_marca_con_el_estado_pisado: { router: 'ajeno' },
          // Los DOS hechos en falso ⇒ la decision EMPUJA. JAMAS un retroceso sin el hecho: un
          // `back()` sobre una entrada que no empujamos nosotros EXPULSA AL DUENO DEL SITIO.
          mitad_A_hecho_nuevo_la_marca_dice_la_raiz: false,
          mitad_A_hecho_de_la_rama_la_marca_dice_mas: false,
          mitad_A_plan: 'push',
          mitad_A_el_plan_pide_un_retroceso: false,
          mitad_A_camino_del_atras_antes: [ROOT, SECCION],
          mitad_A_camino_del_atras_despues: [ROOT, SECCION, ROOT],
          mitad_A_el_camino_del_atras_crecio_un_escalon: true,
          mitad_A_marca_de_la_entrada_nueva: { frjUnder: SECCION },
          // ⚠ Y ESTO SE DECLARA, NO SE ESCONDE: con la marca perdida el dueno pierde el AVISO,
          // porque el marcado anota la seccion debajo y la septima regla dice *no armar*. Pierde el
          // aviso, pero NUNCA el sitio — que es la degradacion segura de toda la fase.
          mitad_A_accion_de_armado: 'no-armar',
          mitad_B_marca_de_la_entrada_de_arriba: { frjUnder: '/appointments' },
          mitad_B_hecho_nuevo_la_marca_dice_la_raiz: false,
          mitad_B_hecho_de_la_rama_la_marca_dice_mas: false,
          mitad_B_plan: 'push',
          mitad_B_camino_del_atras: [ROOT, '/appointments', MORE, ROOT],
          mitad_B_atras_cae_en: MORE,
          // La decision (a) funcionando: con algo nuestro debajo el atras no saca del sitio.
          mitad_B_accion_de_armado: 'no-armar',
          mitad_B_pathname_antes_del_atras: ROOT,
          mitad_B_pathname_tras_el_atras: MORE,
          // El invariante del criterio 2: el atras desde ahi hace algo VISIBLE.
          mitad_B_el_atras_hace_algo_visible: true,
        },
      }
    },
  },
  {
    id: 'E-17',
    titulo: 'G3-1 — la CADENA de replace cruzada con la regla -1c y con el sentinel: la marca perdida contra la marca que VIAJA',
    cierra:
      'el CRUCE que faltaba: la regla de seccion->raiz contra una CADENA de reemplazos. Los dieciseis escenarios ' +
      'de antes median marcas POR SEPARADO y ninguno tenia dos reemplazos seguidos, que es la causa MEDIDA de ' +
      'G3-1: la marca se escribe solo cuando la politica dice empujar, el reemplazo deja que el router escriba su ' +
      'propio state encima y NADIE la vuelve a escribir. Tres mitades en la MISMA corrida: la A es la forma de hoy ' +
      '(la marca perdida, el hecho falso, el plan EMPUJAR, la profundidad creciendo y cero entradas con el hash en ' +
      'el camino del atras — o sea *sale sin el hash y atras me lleva a donde estaba antes*), la B es la marca ' +
      'VIAJANDO (sobrevive la cadena ENTERA, el plan es el retroceso, el aterrizaje no lleva nuestra marca, el ' +
      'armado procede y el hash es el BASE) y la C es la marca que NUNCA SE LEYO (la propagacion se ABSTIENE, el ' +
      'plan empuja y la pila queda un escalon mas larga: la degradacion segura, medida en vez de prometida). ' +
      'NO cierra el cableado de React: esta sonda monta su propio servidor estatico y no corre el codigo de la ' +
      'app, asi que A1, A2 y A11 siguen abiertos y los cierra la ronda 3 de la UAT en el telefono',
    async correr(cdp) {
      // ⚠ LA MISMA DECISION DE RAMA, en codigo ejecutable adentro del escenario y con sus reglas en el
      // MISMO orden que E-14, E-15 y E-16. El arreglo de este gap NO toca ninguna de las dos funciones
      // de politica: lo que cambia es que el hecho que la regla -1c lee AHORA ESTA AHI.
      const planDeRama = ({ from, to, root, more, raizDebajo, masDebajo, holdsExitSentinel }) => {
        const modo =
          from === to ? 'replace'
            : from === root ? 'push'
              : to === root ? 'push'
                : to === more ? 'push'
                  : from === more ? 'push'
                    : 'replace'
        if (holdsExitSentinel && from === to) return 'none'
        if (holdsExitSentinel && from === root && to !== from) return 'consume-exit-then-navigate'
        if (raizDebajo && to === root && from !== to) return 'up'
        if (!masDebajo) return modo
        if (from === to) return modo
        if (to === more) return 'up'
        return 'collapse-then-replace'
      }
      // La accion de armado con las SIETE reglas, copiada de E-13/E-14.
      const accionDeArmado = ({ participates, atRoot, hintOpen, topIsOurs, foreignOwnsTop, urlYaLlevaNuestroHash, algoNuestroDebajo }) => {
        if (!participates) return 'no-armar'
        if (!atRoot) return 'no-armar'
        if (hintOpen) return 'no-armar'
        if (topIsOurs) return 'no-armar'
        if (urlYaLlevaNuestroHash) return 'no-armar'
        if (foreignOwnsTop) return 'no-armar'
        if (algoNuestroDebajo) return 'no-armar'
        return 'armar'
      }
      const LIBRE = { participates: true, atRoot: true, hintOpen: false, topIsOurs: false, foreignOwnsTop: false, urlYaLlevaNuestroHash: false, algoNuestroDebajo: false }
      // Las tres secciones de la barra del recorrido del dueno: Turnos -> Clientes -> Agenda.
      const S1 = '/appointments'
      const S2 = '/clients'
      const S3 = '/agenda'
      const soloPathname = (ruta) => ruta.split('#')[0]
      const paresAdyacentes = (camino) => camino.filter((r, i) => i > 0 && soloPathname(camino[i - 1]) === soloPathname(r)).length
      /** El lector de la marca: LA RUTA que quedo debajo, o null. Es `panelUnderRoute` de la app. */
      const laRutaDeAbajo = (marca) => (marca && typeof marca.frjUnder === 'string' ? marca.frjUnder : null)
      const hechosDe = (marca) => ({
        raizDebajo: laRutaDeAbajo(marca) === ROOT,
        masDebajo: laRutaDeAbajo(marca) === MORE,
        holdsExitSentinel: typeof marca?.frjExit !== 'undefined',
      })

      // ── MITAD A · LA FORMA DE HOY: la marca se pierde en la CADENA ────────────────────────────
      // Se entra a Inicio EN LIMPIO, se arma el sentinel y se sale de la raiz CONSUMIENDOLO hacia la
      // primera seccion de la barra. De ahi dos secciones mas con el reemplazo del <Link>, SIN
      // propagar nada: es literalmente el recorrido que el dueno midio en el telefono.
      await reiniciarEnLimpio(cdp, ROOT)
      const hashAlEntrarA = await armarElSentinel(cdp, 1)
      await salirDeLaRaizConsumiendoElSentinel(cdp, S1, ROOT)
      const marcaEnLaPrimeraSeccionA = (await medir(cdp)).marca
      await reemplazarComoElRouter(cdp, S2)
      const marcaTrasElPrimerReemplazoA = (await medir(cdp)).marca
      await reemplazarComoElRouter(cdp, S3)
      const arribaA = await medir(cdp)
      const hechosA = hechosDe(arribaA.marca)
      const planA = planDeRama({ from: S3, to: ROOT, root: ROOT, more: MORE, ...hechosA })
      const profundidadAntesA = arribaA.abajo.length
      await empujar(cdp, ROOT, S3)
      const despuesA = await medir(cdp)
      const armadoA = accionDeArmado({ ...LIBRE, algoNuestroDebajo: typeof despuesA.marca?.frjUnder === 'string' })

      // ── MITAD B · LA MARCA VIAJANDO: se LEE antes de cada reemplazo y se PROPAGA despues ──────
      await reiniciarEnLimpio(cdp, ROOT)
      const hashAlEntrarB = await armarElSentinel(cdp, 1)
      await salirDeLaRaizConsumiendoElSentinel(cdp, S1, ROOT)
      const escribioEnCadaTramoB = []
      const leida1B = laRutaDeAbajo((await medir(cdp)).marca)
      await reemplazarComoElRouter(cdp, S2)
      escribioEnCadaTramoB.push(await propagarLaMarca(cdp, leida1B))
      const marcaTrasElPrimerReemplazoB = (await medir(cdp)).marca
      const leida2B = laRutaDeAbajo((await medir(cdp)).marca)
      await reemplazarComoElRouter(cdp, S3)
      escribioEnCadaTramoB.push(await propagarLaMarca(cdp, leida2B))
      const arribaB = await medir(cdp)
      const hechosB = hechosDe(arribaB.marca)
      const planB = planDeRama({ from: S3, to: ROOT, root: ROOT, more: MORE, ...hechosB })
      const profundidadAntesB = arribaB.abajo.length
      // El gesto lo resuelve el RETROCESO GUARDADO, con su guarda re-verificada en el momento.
      await retrocederGuardado(cdp)
      const aterrizajeB = await medir(cdp)
      const armadoB = accionDeArmado({ ...LIBRE, algoNuestroDebajo: typeof aterrizajeB.marca?.frjUnder === 'string' })
      const hashEmpujadoB = await armarElSentinel(cdp, 1)
      const paresTrasArmarB = paresAdyacentes((await medir(cdp)).abajo)

      // ── MITAD C · LA MARCA QUE NUNCA SE LEYO: la propagacion se ABSTIENE ─────────────────────
      // La marca ya estaba pisada ANTES del primer reemplazo (una escritura blanda ajena, o el camino
      // del guard de cambios sin guardar, que es el residuo declarado de este plan).
      await reiniciarEnLimpio(cdp, ROOT)
      await armarElSentinel(cdp, 1)
      await salirDeLaRaizConsumiendoElSentinel(cdp, S1, ROOT)
      await evaluar(cdp, `history.replaceState({ router: 'ajeno' }, '')`)
      const leidaC = laRutaDeAbajo((await medir(cdp)).marca)
      await reemplazarComoElRouter(cdp, S2)
      const escribioC = await propagarLaMarca(cdp, leidaC)
      const arribaC = await medir(cdp)
      const hechosC = hechosDe(arribaC.marca)
      const planC = planDeRama({ from: S2, to: ROOT, root: ROOT, more: MORE, ...hechosC })
      const profundidadAntesC = arribaC.abajo.length
      await empujar(cdp, ROOT, S2)
      const despuesC = await medir(cdp)

      return {
        medido: {
          mitad_A_hash_al_entrar_a_inicio: hashAlEntrarA,
          mitad_A_marca_en_la_primera_seccion: marcaEnLaPrimeraSeccionA,
          mitad_A_marca_tras_el_primer_reemplazo: marcaTrasElPrimerReemplazoA,
          mitad_A_marca_tras_los_dos_reemplazos: arribaA.marca,
          mitad_A_hecho_nuevo_la_marca_dice_la_raiz: hechosA.raizDebajo,
          mitad_A_hecho_de_la_rama_la_marca_dice_mas: hechosA.masDebajo,
          mitad_A_plan: planA,
          mitad_A_profundidades_antes_y_despues: [profundidadAntesA, despuesA.abajo.length],
          mitad_A_camino_del_atras_despues: despuesA.abajo,
          mitad_A_marca_de_la_entrada_de_inicio: despuesA.marca,
          mitad_A_accion_de_armado: armadoA,
          mitad_A_el_sentinel_en_el_camino_del_atras: despuesA.abajo.filter((r) => r.includes('#salir')),
          mitad_B_hash_al_entrar_a_inicio: hashAlEntrarB,
          mitad_B_la_propagacion_escribio_en_cada_tramo: escribioEnCadaTramoB,
          mitad_B_marca_tras_el_primer_reemplazo: marcaTrasElPrimerReemplazoB,
          mitad_B_marca_tras_los_dos_reemplazos: arribaB.marca,
          mitad_B_hecho_nuevo_la_marca_dice_la_raiz: hechosB.raizDebajo,
          mitad_B_hecho_de_la_rama_la_marca_dice_mas: hechosB.masDebajo,
          mitad_B_plan: planB,
          mitad_B_profundidades_antes_y_despues: [profundidadAntesB, aterrizajeB.abajo.length],
          mitad_B_parado_tras_el_retroceso: aterrizajeB.actual,
          mitad_B_marca_del_aterrizaje: aterrizajeB.marca,
          mitad_B_accion_de_armado: armadoB,
          mitad_B_hash_empujado_por_el_armado: hashEmpujadoB,
          mitad_B_pares_adyacentes_con_el_mismo_pathname_al_armar: paresTrasArmarB,
          mitad_C_valor_leido: leidaC,
          mitad_C_la_propagacion_escribio: escribioC,
          mitad_C_marca_tras_el_reemplazo: arribaC.marca,
          mitad_C_hecho_nuevo_la_marca_dice_la_raiz: hechosC.raizDebajo,
          mitad_C_plan: planC,
          mitad_C_profundidades_antes_y_despues: [profundidadAntesC, despuesC.abajo.length],
          contraste_plan_A_contra_B: [planA, planB],
          contraste_profundidad_final_A_contra_B: [despuesA.abajo.length, aterrizajeB.abajo.length],
          contraste_la_marca_sobrevivio_la_cadena_A_B_C: [hechosA.raizDebajo, hechosB.raizDebajo, hechosC.raizDebajo],
        },
        esperado: {
          mitad_A_hash_al_entrar_a_inicio: '#salir',
          // La primera seccion SI tiene la marca: la escribio el empuje del paso 2 del sentinel.
          mitad_A_marca_en_la_primera_seccion: { frjUnder: ROOT },
          // Y despues del PRIMER reemplazo ya no esta: el router escribio su propio state encima.
          mitad_A_marca_tras_el_primer_reemplazo: { router: 'ajeno' },
          mitad_A_marca_tras_los_dos_reemplazos: { router: 'ajeno' },
          // EL GAP ENTERO, en una linea: el hecho de la regla -1c es FALSO ⇒ el gesto EMPUJA.
          mitad_A_hecho_nuevo_la_marca_dice_la_raiz: false,
          mitad_A_hecho_de_la_rama_la_marca_dice_mas: false,
          mitad_A_plan: 'push',
          mitad_A_profundidades_antes_y_despues: [2, 3],
          mitad_A_camino_del_atras_despues: [ROOT, S3, ROOT],
          mitad_A_marca_de_la_entrada_de_inicio: { frjUnder: S3 },
          // *"toque inicio y sale sin el hash"*: la septima regla dice no armar, asi que el aviso no
          // existe y el atras siguiente sale del panel sin avisar.
          mitad_A_accion_de_armado: 'no-armar',
          mitad_A_el_sentinel_en_el_camino_del_atras: [],
          mitad_B_hash_al_entrar_a_inicio: '#salir',
          mitad_B_la_propagacion_escribio_en_cada_tramo: [true, true],
          mitad_B_marca_tras_el_primer_reemplazo: { frjUnder: ROOT },
          // ⚠ EL CORAZON DEL CRUCE: la marca sobrevive la CADENA ENTERA, no un reemplazo solo.
          mitad_B_marca_tras_los_dos_reemplazos: { frjUnder: ROOT },
          mitad_B_hecho_nuevo_la_marca_dice_la_raiz: true,
          mitad_B_hecho_de_la_rama_la_marca_dice_mas: false,
          mitad_B_plan: 'up',
          // La correccion, medida: la profundidad BAJA en vez de crecer.
          mitad_B_profundidades_antes_y_despues: [2, 1],
          mitad_B_parado_tras_el_retroceso: ROOT,
          // El dueno aterriza en la entrada ORIGINAL de Inicio, sin nada nuestro debajo.
          mitad_B_marca_del_aterrizaje: null,
          mitad_B_accion_de_armado: 'armar',
          mitad_B_hash_empujado_por_el_armado: '#salir',
          // ⚠ EXACTAMENTE UN par adyacente: el par raiz / raiz-con-el-hash-del-sentinel, que es LA
          // CONDICION DE EXISTENCIA de la entrada del sentinel y NO un atras muerto.
          mitad_B_pares_adyacentes_con_el_mismo_pathname_al_armar: 1,
          mitad_C_valor_leido: null,
          // SIN VALOR LEIDO NO SE INVENTA NINGUNO: se abstiene. Es el candado de la marca falsa.
          mitad_C_la_propagacion_escribio: false,
          mitad_C_marca_tras_el_reemplazo: { router: 'ajeno' },
          mitad_C_hecho_nuevo_la_marca_dice_la_raiz: false,
          mitad_C_plan: 'push',
          // La degradacion segura, medida: UN escalon mas largo, nunca el dueno fuera del sitio.
          mitad_C_profundidades_antes_y_despues: [2, 3],
          // ⚠ EL CONTRASTE QUE EL GAP PIDE, en la misma corrida: la unica diferencia entre los dos
          // recorridos del dueno es UN REEMPLAZO, y aca queda como numero.
          contraste_plan_A_contra_B: ['push', 'up'],
          contraste_profundidad_final_A_contra_B: [3, 1],
          contraste_la_marca_sobrevivio_la_cadena_A_B_C: [false, true, false],
        },
      }
    },
  },
  {
    id: 'E-18',
    titulo: 'G3-1 dentro de la rama de Mas: la propagacion NO le roba el gesto al colapso, y el limite de D-02 sigue empujando',
    cierra:
      'el CRUCE de la CADENA de reemplazos con la MARCA DE LA RAMA diciendo Mas, que es donde el colapso ya ' +
      'compite. Afirma, midiendo los DOS hechos como numeros, que la propagacion es GENERAL sin romper nada: ' +
      'dentro de la rama la marca sigue diciendo Mas por encima del reemplazo, asi que D-03 se SOSTIENE (tocar ' +
      'Mas desde dos secciones de Mas SUBE, y sin la propagacion habria EMPUJADO) y el gesto hacia un destino ' +
      'de la barra sigue siendo COLAPSAR Y REEMPLAZAR, sin dejar dos entradas con el mismo pathname pegadas. Y ' +
      're-afirma el LIMITE DECLARADO de D-02: con la pila de TRES escalones, todas por empuje y sin ningun ' +
      'reemplazo en el camino, el hecho nuevo sigue FALSO, el gesto hacia la raiz sigue EMPUJANDO y el atras ' +
      'desde ahi sigue cayendo en Mas — el no-defecto del bloque 2.3 del guion, medido para que nadie lo ' +
      '"arregle" de paso. NO cierra el cableado de React: A1, A2 y A11 siguen abiertos y los cierra la ronda 3',
    async correr(cdp) {
      // La MISMA decision de rama, con sus reglas en el MISMO orden que E-14, E-15, E-16 y E-17.
      const planDeRama = ({ from, to, root, more, raizDebajo, masDebajo, holdsExitSentinel }) => {
        const modo =
          from === to ? 'replace'
            : from === root ? 'push'
              : to === root ? 'push'
                : to === more ? 'push'
                  : from === more ? 'push'
                    : 'replace'
        if (holdsExitSentinel && from === to) return 'none'
        if (holdsExitSentinel && from === root && to !== from) return 'consume-exit-then-navigate'
        if (raizDebajo && to === root && from !== to) return 'up'
        if (!masDebajo) return modo
        if (from === to) return modo
        if (to === more) return 'up'
        return 'collapse-then-replace'
      }
      const accionDeArmado = ({ participates, atRoot, hintOpen, topIsOurs, foreignOwnsTop, urlYaLlevaNuestroHash, algoNuestroDebajo }) => {
        if (!participates) return 'no-armar'
        if (!atRoot) return 'no-armar'
        if (hintOpen) return 'no-armar'
        if (topIsOurs) return 'no-armar'
        if (urlYaLlevaNuestroHash) return 'no-armar'
        if (foreignOwnsTop) return 'no-armar'
        if (algoNuestroDebajo) return 'no-armar'
        return 'armar'
      }
      const LIBRE = { participates: true, atRoot: true, hintOpen: false, topIsOurs: false, foreignOwnsTop: false, urlYaLlevaNuestroHash: false, algoNuestroDebajo: false }
      // TRES secciones que viven DENTRO de la rama de Mas, y una de la barra. Son tres y no dos a
      // proposito: lo que este escenario tiene que medir es una CADENA de reemplazos, no uno solo —
      // con uno se mide lo que E-16 mitad A ya medía (una marca pisada) y el gap se vuelve invisible.
      const M1 = '/finances'
      const M2 = '/web'
      const M3 = '/ayuda'
      const DE_LA_BARRA = '/clients'
      const soloPathname = (ruta) => ruta.split('#')[0]
      const paresAdyacentes = (camino) => camino.filter((r, i) => i > 0 && soloPathname(camino[i - 1]) === soloPathname(r)).length
      const laRutaDeAbajo = (marca) => (marca && typeof marca.frjUnder === 'string' ? marca.frjUnder : null)
      const hechosDe = (marca) => ({
        raizDebajo: laRutaDeAbajo(marca) === ROOT,
        masDebajo: laRutaDeAbajo(marca) === MORE,
        holdsExitSentinel: typeof marca?.frjExit !== 'undefined',
      })
      /**
       * Raiz, Mas y una seccion de Mas por EMPUJE, y de ahi DOS secciones mas de Mas por REEMPLAZO,
       * leyendo la marca antes de cada uno y propagandola despues. Es la CADENA, adentro de la rama.
       */
      const armarLaRamaConUnaCadenaDeReemplazos = async () => {
        await reiniciarEnLimpio(cdp, ROOT)
        await empujar(cdp, MORE, ROOT)
        await empujar(cdp, M1, MORE)
        const leidas = []
        const escribio = []
        leidas.push(laRutaDeAbajo((await medir(cdp)).marca))
        await reemplazarComoElRouter(cdp, M2)
        escribio.push(await propagarLaMarca(cdp, leidas[0]))
        leidas.push(laRutaDeAbajo((await medir(cdp)).marca))
        await reemplazarComoElRouter(cdp, M3)
        escribio.push(await propagarLaMarca(cdp, leidas[1]))
        return { leidas, escribio }
      }

      // ── MITAD A · D-03 POR ENCIMA DEL REEMPLAZO: tocar Mas desde ahi SUBE ────────────────────
      const propagacionA = await armarLaRamaConUnaCadenaDeReemplazos()
      const arribaA = await medir(cdp)
      const hechosA = hechosDe(arribaA.marca)
      const planConPropagacionA = planDeRama({ from: M3, to: MORE, root: ROOT, more: MORE, ...hechosA })
      // Y el MISMO gesto sin la propagacion, que es lo que pasaba antes de este plan: con la marca
      // pisada los dos hechos son falsos y la politica de rutas dice EMPUJAR (destino Mas).
      const planSinPropagacionA = planDeRama({ from: M3, to: MORE, root: ROOT, more: MORE, raizDebajo: false, masDebajo: false, holdsExitSentinel: false })
      await retrocederGuardado(cdp)
      const aterrizajeA = await medir(cdp)
      const armadoA = accionDeArmado({ ...LIBRE, atRoot: aterrizajeA.actual === ROOT, algoNuestroDebajo: typeof aterrizajeA.marca?.frjUnder === 'string' })

      // ── MITAD B · LA PROPAGACION NO LE ROBA EL GESTO AL COLAPSO ─────────────────────────────
      const propagacionB = await armarLaRamaConUnaCadenaDeReemplazos()
      const arribaB = await medir(cdp)
      const hechosB = hechosDe(arribaB.marca)
      const planB = planDeRama({ from: M3, to: DE_LA_BARRA, root: ROOT, more: MORE, ...hechosB })
      const colapsoB = await colapsar(cdp, DE_LA_BARRA)
      const despuesB = await medir(cdp)

      // ── EL LIMITE DECLARADO DE D-02, re-afirmado: TODO por empuje, ningun reemplazo ─────────
      await reiniciarEnLimpio(cdp, ROOT)
      await empujar(cdp, '/appointments', ROOT)
      await empujar(cdp, MORE, '/appointments')
      const arribaL = await medir(cdp)
      const hechosL = hechosDe(arribaL.marca)
      const planL = planDeRama({ from: MORE, to: ROOT, root: ROOT, more: MORE, ...hechosL })
      await empujar(cdp, ROOT, MORE)
      const despuesL = await medir(cdp)
      const armadoL = accionDeArmado({ ...LIBRE, algoNuestroDebajo: typeof despuesL.marca?.frjUnder === 'string' })

      return {
        medido: {
          mitad_A_valores_leidos_antes_de_cada_reemplazo: propagacionA.leidas,
          mitad_A_la_propagacion_escribio_en_cada_tramo: propagacionA.escribio,
          mitad_A_marca_tras_los_dos_reemplazos: arribaA.marca,
          mitad_A_hecho_de_la_rama_la_marca_dice_mas: hechosA.masDebajo,
          mitad_A_hecho_nuevo_la_marca_dice_la_raiz: hechosA.raizDebajo,
          mitad_A_plan_con_la_propagacion: planConPropagacionA,
          mitad_A_plan_sin_la_propagacion: planSinPropagacionA,
          mitad_A_parado_tras_el_retroceso: aterrizajeA.actual,
          mitad_A_marca_del_aterrizaje: aterrizajeA.marca,
          mitad_A_camino_del_atras_tras_el_retroceso: aterrizajeA.abajo,
          mitad_A_accion_de_armado: armadoA,
          mitad_B_la_propagacion_escribio_en_cada_tramo: propagacionB.escribio,
          mitad_B_hecho_de_la_rama_la_marca_dice_mas: hechosB.masDebajo,
          mitad_B_hecho_nuevo_la_marca_dice_la_raiz: hechosB.raizDebajo,
          mitad_B_plan: planB,
          mitad_B_rama_del_colapso: colapsoB.rama,
          mitad_B_marca_leida_en_la_entrada_de_mas: colapsoB.marcaLeida,
          mitad_B_camino_del_atras: despuesB.abajo,
          mitad_B_marca_del_destino: despuesB.marca,
          mitad_B_pares_adyacentes_con_el_mismo_pathname: paresAdyacentes(despuesB.abajo),
          limite_marca_de_la_entrada_de_arriba: arribaL.marca,
          limite_hecho_nuevo_la_marca_dice_la_raiz: hechosL.raizDebajo,
          limite_plan: planL,
          limite_camino_del_atras: despuesL.abajo,
          limite_atras_cae_en: despuesL.abajo[despuesL.abajo.length - 2] ?? null,
          limite_accion_de_armado: armadoL,
        },
        esperado: {
          mitad_A_valores_leidos_antes_de_cada_reemplazo: [MORE, MORE],
          mitad_A_la_propagacion_escribio_en_cada_tramo: [true, true],
          // La marca sigue diciendo Mas POR ENCIMA del reemplazo: un reemplazo no cambia lo de abajo.
          mitad_A_marca_tras_los_dos_reemplazos: { frjUnder: MORE },
          mitad_A_hecho_de_la_rama_la_marca_dice_mas: true,
          mitad_A_hecho_nuevo_la_marca_dice_la_raiz: false,
          // D-03 sosteniendose: SUBIR. Y sin la propagacion el mismo gesto habria APILADO.
          mitad_A_plan_con_la_propagacion: 'up',
          mitad_A_plan_sin_la_propagacion: 'push',
          mitad_A_parado_tras_el_retroceso: MORE,
          mitad_A_marca_del_aterrizaje: { frjUnder: ROOT },
          mitad_A_camino_del_atras_tras_el_retroceso: [ROOT, MORE],
          // No estamos en la raiz, asi que el aviso no se arma: es de MOB-05 y vive en Inicio.
          mitad_A_accion_de_armado: 'no-armar',
          mitad_B_la_propagacion_escribio_en_cada_tramo: [true, true],
          mitad_B_hecho_de_la_rama_la_marca_dice_mas: true,
          mitad_B_hecho_nuevo_la_marca_dice_la_raiz: false,
          // El colapso sigue siendo el dueno del gesto hacia un destino de la barra.
          mitad_B_plan: 'collapse-then-replace',
          mitad_B_rama_del_colapso: 'retroceso-y-reemplazo',
          mitad_B_marca_leida_en_la_entrada_de_mas: ROOT,
          mitad_B_camino_del_atras: [ROOT, DE_LA_BARRA],
          mitad_B_marca_del_destino: { frjUnder: ROOT },
          // El criterio 2: ningun par adyacente con el mismo pathname, o sea ningun atras muerto.
          mitad_B_pares_adyacentes_con_el_mismo_pathname: 0,
          // ⚠ EL LIMITE DECLARADO DE D-02, Y NO ES UN DEFECTO: sin ningun reemplazo en el camino la
          // propagacion NO PARTICIPA, la marca de arriba dice la SECCION y no la raiz ⇒ el hecho es
          // falso ⇒ el gesto sigue empujando y el atras vuelve a Mas. MOB-04 lo registra con fecha y
          // el bloque 2.3 del guion le avisa al dueno que es lo esperado.
          limite_marca_de_la_entrada_de_arriba: { frjUnder: '/appointments' },
          limite_hecho_nuevo_la_marca_dice_la_raiz: false,
          limite_plan: 'push',
          limite_camino_del_atras: [ROOT, '/appointments', MORE, ROOT],
          limite_atras_cae_en: MORE,
          limite_accion_de_armado: 'no-armar',
        },
      }
    },
  },
]

// ── El arnés ─────────────────────────────────────────────────────────────────────────────────────

function iguales(a, b) { return JSON.stringify(a) === JSON.stringify(b) }

async function main() {
  const perfil = mkdtempSync(join(tmpdir(), 'forjo-sonda-atras-'))
  let server = null
  let chrome = null
  let cdp = null
  let fallados = 0

  try {
    server = await montarServidor()
    console.log(`servidor estatico propio en ${ORIGEN} (ni dev server ni base de datos)`)

    chrome = spawn(CHROME, [
      '--headless=new',
      `--remote-debugging-port=${PUERTO_CDP}`,
      `--user-data-dir=${perfil}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
      ORIGEN + ROOT,
    ], { stdio: 'ignore' })
    chrome.on('error', (e) => { console.error(`no se pudo arrancar Chrome: ${e.message}`); process.exitCode = 1 })

    const target = await descubrirTarget()
    cdp = await conectar(target.webSocketDebuggerUrl)
    await cdp.enviar('Page.enable')
    await cdp.enviar('Runtime.enable')

    const version = await (await fetch(`http://127.0.0.1:${PUERTO_CDP}/json/version`)).json()
    console.log(`navegador: ${version.Browser} · node ${process.version}`)
    console.log('')

    for (const esc of ESCENARIOS) {
      const { medido, esperado } = await esc.correr(cdp)
      const claves = Object.keys(esperado)
      const malas = claves.filter((k) => !iguales(medido[k], esperado[k]))
      const ok = malas.length === 0
      if (!ok) fallados++
      // ⚠ EL PREFIJO ES `OK ` (UNA sola sangría) Y NO `OK  `, Y NO ES COSMÉTICO: los gates de los
      // cuatro planes de cierre de gaps (03-05..03-08) cuentan las líneas con `grep -cE '^OK  E-n'`,
      // o sea `OK` + DOS espacios + el id. Con dos espacios acá, el espacio de la plantilla hacía
      // TRES y los cuatro gates medían **cero** con la sonda en verde — un gate que no mide es peor
      // que no tenerlo.
      console.log(`${ok ? 'OK ' : 'FALLA'} ${esc.id} · ${esc.titulo}`)
      console.log(`      cierra el supuesto ${esc.cierra}`)
      for (const k of claves) {
        const marca = malas.includes(k) ? '  <-- NO COINCIDE' : ''
        console.log(`      ${k}: medido=${JSON.stringify(medido[k])}${marca}`)
        if (malas.includes(k)) console.log(`      ${' '.repeat(k.length)}  esperado=${JSON.stringify(esperado[k])}`)
      }
      console.log('')
    }

    console.log('── veredicto ─────────────────────────────────────────────────────────────────')
    console.log(`escenarios medidos: ${ESCENARIOS.length} · coinciden con lo esperado: ${ESCENARIOS.length - fallados} · no coinciden: ${fallados}`)
    console.log('supuestos CERRADOS por esta medicion: A4 (E-1/E-2/E-3/E-7), A5 (E-4), A6 (E-5), A7 (E-6),')
    console.log('                                      A5+A6 compuestos y el disparador real del colapso (E-8),')
    console.log('                                      la INTERSECCION sentinel-de-salida x marca-de-la-rama (E-11),')
    console.log('                                      el sentinel ENTERRADO contra el consumido, las dos formas (E-9),')
    console.log('                                      la DECISION (a) del dueno y sus dos mitades (E-10),')
    console.log('                                      el DEGENERADO con el sentinel al fondo y el primer atras visible (E-12),')
    console.log('                                      el CICLO de re-armado x3 sin acumular y el origen del hash ESCALADO (E-13),')
    console.log('                                      el CICLO Inicio<->seccion: la forma vieja (+2 por vuelta, sin aviso)')
    console.log('                                      contra la nueva (profundidad fija, el aviso se arma) (E-14),')
    console.log('                                      que la regla nueva NO le roba el gesto al COLAPSO dentro de la rama (E-15),')
    console.log('                                      y las DOS formas en las que la regla NO se dispara: la marca')
    console.log('                                      PERDIDA y la raiz que no esta inmediatamente debajo (E-16),')
    console.log('                                      la CADENA de replace cruzada con la regla -1c y con el sentinel:')
    console.log('                                      la marca perdida contra la que VIAJA, mas la abstencion sin')
    console.log('                                      valor leido (E-17), y la misma cadena DENTRO de la rama de Mas,')
    console.log('                                      donde D-03 se sostiene por encima del reemplazo y el limite de')
    console.log('                                      D-02 sigue empujando (E-18)')
    console.log('⚠ LO QUE ESTA SONDA NO CIERRA, y va declarado en vez de insinuado: el CABLEADO DE REACT.')
    console.log('  Esta sonda monta su propio servidor estatico y NO CORRE EL CODIGO DE LA APP: mide la')
    console.log('  SEMANTICA DE LA PILA del navegador, que es lo que las decisiones puras necesitan. Confundir')
    console.log('  un verde de aca con un cierre del cableado es el error exacto que llevo esta fase a la UAT')
    console.log('  con la sonda en 8/8 y cinco fallos mas una colision de diseno en el telefono.')
    console.log('supuestos que esta sonda NO puede cerrar, y van a la UAT (del plan 03-04, y ahora del 03-08):')
    console.log('  A1  — el orden del efecto que escribe la marca contra la escritura del router de Next')
    console.log('  A2  — que no haya otro commit del router en vuelo cuando se escribe la marca')
    console.log('  A11 — Safari/iOS y Chrome Android REALES (todo lo medido aca fue Chrome de escritorio headless)')

    if (fallados > 0) {
      console.error('')
      console.error(`una pila MEDIDA no coincide con la esperada en ${fallados} escenario(s).`)
      console.error('el arreglo NO es ajustar la expectativa: es rehacer el diseno del plan correspondiente')
      console.error('contra lo medido (03-02 para E-3/E-4/E-5, 03-03 para E-6, 03-04 para E-8, 03-05 para E-11,')
    console.error('03-06 para E-9/E-10/E-12, 03-07 para E-13, 03-09 para E-14/E-15/E-16, 03-11 para E-17/E-18) y dejarlo')
      console.error('escrito en .planning/debug/pila-de-dos-niveles-medida.md. Para eso existe esta sonda.')
      process.exitCode = 1
    }
  } catch (e) {
    console.error(`la sonda no pudo completar la medicion: ${e instanceof Error ? e.message : e}`)
    console.error(`sospechosos de entorno (los declara la precondicion del plan): Chrome fuera de ${CHROME},`)
    console.error(`o los puertos ${PUERTO_WEB} / ${PUERTO_CDP} ocupados.`)
    process.exitCode = 1
  } finally {
    if (cdp) cdp.cerrar()
    if (chrome) { try { chrome.kill() } catch { /* ya murio */ } }
    if (server) await new Promise((r) => server.close(r))
    try { rmSync(perfil, { recursive: true, force: true }) } catch { /* lo limpia el sistema */ }
  }
}

await main()
