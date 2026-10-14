#!/usr/bin/env node
// ── La sonda de la pila del atrás del panel ──────────────────────────────────────────────────────
//
// QUÉ MIDE: la pila REAL del navegador (`Page.getNavigationHistory` por CDP) para los ocho
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

// ── Los ocho escenarios ──────────────────────────────────────────────────────────────────────────
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
      console.log(`${ok ? 'OK  ' : 'FALLA'} ${esc.id} · ${esc.titulo}`)
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
    console.log('                                      A5+A6 compuestos y el disparador real del colapso (E-8)')
    console.log('supuestos que esta sonda NO puede cerrar, y van a la UAT del plan 03-04:')
    console.log('  A1  — el orden del efecto que escribe la marca contra la escritura del router de Next')
    console.log('  A2  — que no haya otro commit del router en vuelo cuando se escribe la marca')
    console.log('  A11 — Safari/iOS y Chrome Android REALES (todo lo medido aca fue Chrome de escritorio headless)')

    if (fallados > 0) {
      console.error('')
      console.error(`una pila MEDIDA no coincide con la esperada en ${fallados} escenario(s).`)
      console.error('el arreglo NO es ajustar la expectativa: es rehacer el diseno del plan correspondiente')
      console.error('contra lo medido (03-02 para E-3/E-4/E-5, 03-03 para E-6, 03-04 para E-8) y dejarlo')
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
