import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

// ── Phase 01 (el detalle de cliente en la URL) — los invariantes del CABLEADO ────────────────────
// Suite PURA: sin Supabase, sin fixtures y sin gate de entorno → corre siempre y cae sola en el
// carril paralelo `pure` (test/suite-split.ts clasifica por los IMPORTS del archivo, así que acá no
// se importa nada de `./env` ni ningún cliente de datos). Molde: test/catalog-public.test.ts.
//
// POR QUÉ ESTA SUITE LEE CÓDIGO FUENTE EN VEZ DE RENDERIZAR: el entorno de Vitest de este repo es
// `node` (vitest.config.mts) — no hay DOM, no hay Testing Library, `ClientsClient` llama
// `useSearchParams()` en su cuerpo y el milestone prohíbe agregar paquetes. El cableado no se puede
// probar montando el componente, así que se afirma leyendo las fuentes. Es el mismo mecanismo de
// test/catalog-public.test.ts, test/shell-scope.test.ts y test/auth-email-templates.test.ts.
//
// QUÉ CUBRE QUE `lib/panel-history.test.ts` NO PUEDE VER: aquella suite fija la POLÍTICA — que la
// causa `concurrent` decide no tocar el historial. Ésta fija que el CALL SITE DEL BORRADO DECLARA
// ESA CAUSA. Las dos hacen falta: `panelHistoryAction({cause:'concurrent'}) === 'none'` sigue verde
// aunque alguien cambie el call site del borrado a `'programmatic'` — y ahí vuelve C-1, que es el
// riesgo dominante de la fase. La política puede estar perfecta y el cableado equivocado.
//
// LO QUE ESTA SUITE NO HACE, a propósito:
//   · NO re-testea la tabla de decisiones (4 acciones × 6 causas): eso ya vive entero en
//     `lib/panel-history.test.ts`, incluido el caso compuesto de la ACCIÓN EFECTIVA de la fusión.
//   · NO intenta renderizar nada.
//   · NO toca código de producción: lee `lib/overlay-history.ts` y compañía, y leer no es tocar.
//
// LA REGLA DE HONESTIDAD, que es la que hace que este archivo valga algo: cada barrido descuenta
// los comentarios ANTES de afirmar, y afirma PRIMERO que encontró algo. Un recorte vacío —porque la
// función se renombró, porque el archivo se movió, porque el marcador dejó de matchear— tiene que
// FALLAR, no pasar. Doctrina escrita del repo: "Un barrido que no encuentra nada pasa por vacío y
// no prueba nada" (test/catalog-public.test.ts:227).

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')

/**
 * Borra comentarios JSX, de bloque y de línea, en ese orden.
 *
 * ES LO QUE HACE HONESTA A TODA LA SUITE. Sin esto, cada aserción negativa de abajo se satisface —o
 * se rompe— con un COMENTARIO que mencione el término, que es exactamente el falso verde (y el falso
 * rojo) que este archivo viene a evitar: los archivos de esta fase están llenos de comentarios que
 * nombran los términos prohibidos justamente para explicar por qué están prohibidos.
 */
function sinComentarios(src: string): string {
  return src
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

/**
 * Recorta LA REGIÓN que arranca en `marcador`: desde el marcador hasta el cierre de su primer bloque,
 * balanceando llaves.
 *
 * POR QUÉ RECORTAR Y NO AFIRMAR SOBRE EL ARCHIVO: `clients-client.tsx` tiene ~1400 líneas. Afirmar
 * que "en algún lado del archivo aparece la causa del borrado" no prueba nada — pasaría por
 * casualidad, con la causa escrita en cualquier otro handler. Cada aserción de abajo mira SU región.
 *
 * Se lo llama SIEMPRE sobre el fuente ya pasado por {@link sinComentarios}: así ningún comentario
 * puede desbalancear el conteo de llaves ni contaminar la región.
 *
 * ⚠ Lo que no puede fallar en silencio es el caso "no encontré la región": devuelve string VACÍO, y
 * cada `it` lo afirma no vacío antes de seguir.
 */
function recorte(fuente: string, marcador: string): string {
  const at = fuente.indexOf(marcador)
  if (at === -1) return ''
  const abre = fuente.indexOf('{', at)
  if (abre === -1) return ''
  let profundidad = 0
  for (let i = abre; i < fuente.length; i++) {
    const ch = fuente[i]
    if (ch === '{') profundidad++
    else if (ch === '}') {
      profundidad--
      if (profundidad === 0) return fuente.slice(at, i + 1)
    }
  }
  return ''
}

const PANTALLA = 'app/(dashboard)/clients'
const CLIENTS_CLIENT = `${PANTALLA}/clients-client.tsx`
const CLIENTS_PAGE = `${PANTALLA}/page.tsx`
const HELPER = 'lib/panel-history.ts'
const OVERLAY = 'lib/overlay-history.ts'

/** Las seis causas del helper, con sus literales tal como se escriben en un call site. */
const CAUSAS = ["'user-open'", "'user-close'", "'programmatic'", "'filter'", "'stale'", "'concurrent'"]

/** Las mutaciones crudas del historial del navegador: el criterio 4 del roadmap, literal. */
const HISTORIAL_CRUDO = ['pushState', 'replaceState', 'history.back', 'history.forward', 'history.go']

describe('el cableado de /clients: cada cambio de vista declara SU causa', () => {
  const pantalla = sinComentarios(read(CLIENTS_CLIENT))
  const pagina = sinComentarios(read(CLIENTS_PAGE))

  const regionBorrado = recorte(pantalla, 'async function deleteClient()')
  const regionFusion = recorte(pantalla, 'async function mergeGroup(')
  const regionLista = recorte(pantalla, 'groupedByLetter[letter]?.map(client => {')
  const regionDetalle = recorte(pantalla, '{selected && stats && (')

  it('(a) el borrado declara la causa del commit concurrente — ES C-1', () => {
    // EL CASO QUE EL DUEÑO PIDIÓ POR NOMBRE: "un test que falle si se rompe, no un comentario que lo
    // advierta". El mecanismo entero, porque sin él nadie sabe qué está protegiendo esta línea:
    //   1) El cierre del `<Dialog>` de confirmación y el cambio de vista ocurren en el MISMO lote.
    //   2) El diálogo participa de `lib/overlay-history.ts`: al cerrarse deshace su propia entrada,
    //      pero ese `back()` es ASINCRÓNICO. En este instante la entrada de arriba del stack es LA
    //      DEL OVERLAY, no la del detalle.
    //   3) Escribir historial acá le borra al overlay su marca ⇒ el overlay deja de reconocer su
    //      entrada y no la deshace ⇒ la entrada del detalle queda huérfana ⇒ el atrás muestra la
    //      ficha de un cliente RECIÉN BORRADO.
    // Degradar esta causa a `'programmatic'` (que escribe un `replace`) o a `'user-close'` (que
    // consume) reintroduce exactamente eso, y la suite pura de `lib/panel-history.test.ts` seguiría
    // verde porque la política no cambió: cambió la declaración.
    expect(regionBorrado.length).toBeGreaterThan(0)
    expect(regionBorrado).toContain('applyPanelView')
    expect(regionBorrado).toContain("'concurrent'")
    for (const causa of CAUSAS.filter(c => c !== "'concurrent'")) {
      expect(regionBorrado).not.toContain(causa)
    }
  })

  it('(b) el borrado no escribe historial a mano', () => {
    // El OTRO modo de romper C-1, que el caso (a) no cubre: no degradar la causa sino saltear el
    // helper y escribir `history.replaceState` acá "para limpiar la URL". Misma consecuencia — le
    // borra la marca al overlay — y encima sin pasar por la regla 0.
    expect(regionBorrado.length).toBeGreaterThan(0)
    for (const crudo of HISTORIAL_CRUDO) {
      expect(regionBorrado).not.toContain(crudo)
    }
  })

  it('(c) la fusión REGISTRA la redirección y NO escribe historial', () => {
    // Es contraintuitivo y por eso va con el porqué medido: el botón "Fusionar" vive ADENTRO del
    // `<Dialog open={mergeModal}>` y `mergeGroup` no lo cierra ⇒ el modal está ABIERTO mientras esta
    // función corre ⇒ SU entrada es la de arriba. Escribir ahí le borraría el hash y la marca ⇒ al
    // cerrarlo no haría su `back()` ⇒ entrada huérfana + atrás muerto. Por eso redirige: el detalle
    // muestra el conservado EN EL ACTO (cero regresión) y la URL converge después.
    //
    // ⚠ REFERENCIA CRUZADA, para que nadie duplique el caso acá ni crea que falta: que el `replace`
    // de la fusión EXISTA IGUAL se mide sobre la ACCIÓN EFECTIVA, no sobre el texto de este call
    // site, y ese caso vive en `lib/panel-history.test.ts` — el describe que encadena
    // `resolveViewParam` → `panelHistoryAction` y afirma `'none'` con el modal abierto y `'replace'`
    // con el modal cerrado (criterio 3 del ROADMAP). Acá sólo se clava que el call site no se
    // saltee ese camino escribiendo por su cuenta.
    expect(regionFusion.length).toBeGreaterThan(0)
    expect(regionFusion).toContain('setMergedInto')
    expect(regionFusion).not.toContain('applyPanelView')
    for (const causa of CAUSAS) {
      expect(regionFusion).not.toContain(causa)
    }
    for (const crudo of HISTORIAL_CRUDO) {
      expect(regionFusion).not.toContain(crudo)
    }
  })

  it('(d) abrir un cliente declara que es un DESTINO', () => {
    // La decisión ① del plan 01-01 (A→B empuja, no reemplaza) clavada en el call site: el ítem de la
    // lista declara `user-open` y el helper es el que decide que eso empuja. Región = el cuerpo del
    // `.map(client => ...)` de la lista, no el archivo entero.
    expect(regionLista.length).toBeGreaterThan(0)
    expect(regionLista).toContain('applyPanelView')
    expect(regionLista).toContain("'user-open'")
    for (const crudo of HISTORIAL_CRUDO) {
      expect(regionLista).not.toContain(crudo)
    }
  })

  it('(e) cerrar por "Volver" declara el cierre del usuario', () => {
    // El call site NO vuelve a decidir política: declara `user-close` y el helper resuelve solo si
    // eso es CONSUMIR la entrada (la de arriba es nuestra: el dueño abrió desde el listado) o
    // REEMPLAZARLA (no es nuestra: entró pegando la URL, y un back lo sacaría del sitio). Esa
    // división del trabajo es toda la idea de NAV-05.
    expect(regionDetalle.length).toBeGreaterThan(0)
    expect(regionDetalle).toContain('applyPanelView')
    expect(regionDetalle).toContain("'user-close'")
  })

  it('(f) cero mutaciones crudas de historial en toda la pantalla', () => {
    // CRITERIO 4 DEL ROADMAP, LITERAL, convertido en invariante permanente en vez de un grep que
    // alguien tiene que acordarse de correr. Si aparece una escritura cruda acá hay un segundo
    // dialecto de historial en el panel, y la regla 0 —la que cierra C-1— deja de gobernarlo.
    const archivos = readdirSync(join(process.cwd(), PANTALLA)).filter(n => /\.tsx?$/.test(n))
    // Guarda de honestidad: si el directorio se movió, este barrido no puede pasar por vacío.
    expect(archivos.length).toBeGreaterThan(0)
    for (const nombre of archivos) {
      const src = sinComentarios(read(`${PANTALLA}/${nombre}`))
      for (const crudo of HISTORIAL_CRUDO) {
        expect(`${nombre}: ${src.includes(crudo)}`).toBe(`${nombre}: false`)
      }
    }
  })

  it('(g) no sobrevive ninguna segunda fuente de verdad del cliente abierto', () => {
    // El plan 01-01 borró el setter de selección: el cliente abierto se DERIVA de `?c=<id>`. Si el
    // setter reaparece hay dos fuentes de verdad, se pueden desincronizar, y el atrás vuelve a
    // mentir — que es el bug que esta fase vino a cerrar.
    const archivos = readdirSync(join(process.cwd(), PANTALLA)).filter(n => /\.tsx?$/.test(n))
    expect(archivos.length).toBeGreaterThan(0)
    for (const nombre of archivos) {
      const src = sinComentarios(read(`${PANTALLA}/${nombre}`))
      expect(`${nombre}: ${src.includes('setSelectedId')}`).toBe(`${nombre}: false`)
    }
  })

  it('(h) el consumidor de useSearchParams está dentro de un boundary', () => {
    // Hoy la ruta es DINÁMICA (el `createClient()` del server usa `cookies()`), así que el bailout
    // de prerender no puede dispararse y este caso NO protege el build de hoy: protege el día que
    // alguien vuelva estática la ruta (C-2, Pitfall 5 del research). Por eso se afirma el envoltorio,
    // no el efecto.
    const importa = /import\s*\{[^}]*\bSuspense\b[^}]*\}\s*from\s*'react'/.test(pagina)
    expect(importa).toBeTruthy()
    const abre = pagina.indexOf('<Suspense')
    const monta = pagina.indexOf('<ClientsClient')
    const cierra = pagina.indexOf('</Suspense>')
    expect(abre).toBeGreaterThan(-1)
    expect(monta).toBeGreaterThan(abre)
    expect(cierra).toBeGreaterThan(monta)
  })

  it('(i) las tres queries del server siguen acotadas por tenant', () => {
    // Es el invariante del que cuelga TODO el modelo de seguridad de esta fase: la URL puede
    // SELECCIONAR dentro de un conjunto autorizado, nunca AMPLIARLO. El detalle se resuelve contra
    // la lista que ya vino filtrada, no contra la base; si una de estas tres lecturas perdiera su
    // filtro, el `?c=<id>` pasaría a ser un oracle de existencia cross-tenant (T-01-01 / T-01-07).
    const filtros = pagina.split(".eq('business_id'").length - 1
    expect(filtros).toBe(3)
  })
})

// ⚠ EL CUARTO INVARIANTE DE CONVIVENCIA NO VIVE ACÁ, Y ES A PROPÓSITO. "Los tres archivos que
// NAV-06 declara intocables siguen en su commit original" (`ed4d986` / `505667a` / `1460f25`) se
// mide como GATE DE BASH en el `<verify>` del plan 01-02, no como un `it`: los tres commits están a
// 14, 287 y 286 commits de HEAD (medido el 2026-09-29), y el CI clona con `actions/checkout@v4` sin
// `fetch-depth`, o sea profundidad 1. Un `it` con `git log -n 1 -- <archivo>` sería ROJO EN CI en
// cada push, por falta de historia y no por el invariante — un gate que falla por el clima no es un
// gate. Lo que el plan prohíbe, y acá no se hace, es dejarlo como un caso que pasa siempre.
describe('la convivencia con lib/overlay-history.ts (NAV-06)', () => {
  const helper = sinComentarios(read(HELPER))
  const overlay = sinComentarios(read(OVERLAY))

  it('(a) el helper nunca compone el state por propagación', () => {
    // LA TRAMPA QUE FALLA EN SILENCIO, y el defecto más caro de esta fase porque no avisa. La forma
    // "cuidadosa" —propagar el state actual y agregarle la marca— arrastra `__NA`, y el parche de
    // Next toma entonces su rama temprana (`if (data?.__NA || data?._N) return original…`,
    // `next/dist/client/components/app-router.js:253-255`) y NO despacha la acción de restore: la URL
    // en la barra cambia, `useSearchParams` NO se actualiza, el detalle NO abre, y no hay ni un
    // error en consola. El state se escribe SIEMPRE como objeto literal fresco.
    // Guarda positiva: si este archivo dejara de contener el punto de escritura, el barrido negativo
    // de abajo pasaría por vacío sin haber mirado nada.
    expect(helper).toContain('window.history.pushState')
    expect(/\.\.\.\s*(window\.)?history\.state/.test(helper)).toBe(false)
  })

  it('(b) la clave del marcador de overlay no derivó entre los dos módulos', () => {
    // El literal está DUPLICADO A PROPÓSITO: el CONTEXT prohíbe tocar `lib/overlay-history.ts` para
    // exportar de allá una constante (NAV-06: no empeorarlo, no rediseñarlo). El candado contra la
    // deriva no es la disciplina: es este caso. Si ese módulo renombra su marcador, el predicado del
    // helper deja de reconocer las entradas de overlay, la regla 0 —la que cierra C-1— se vuelve
    // INERTE EN SILENCIO, y el borrado vuelve a competir con el back del overlay.
    expect(helper.length).toBeGreaterThan(0)
    expect(overlay.length).toBeGreaterThan(0)
    expect(overlay).toContain('frjOverlay')
    expect(helper).toContain('frjOverlay')
  })

  it('(c) el helper no declara la directiva de cliente', () => {
    // Molde `lib/overlay-history.ts:45-48`: el consumidor (`clients-client.tsx`) ya la declara, y
    // marcar este módulo como frontera arrastraría sus funciones puras adentro sin ninguna necesidad
    // y las volvería más caras de importar desde un test. Se mira el ENCABEZADO sobre el fuente
    // CRUDO —la directiva sólo cuenta como tal si es la primera sentencia del archivo—.
    const encabezado = read(HELPER).split('\n').slice(0, 5).join('\n')
    expect(encabezado.length).toBeGreaterThan(0)
    expect(encabezado).not.toContain('use client')
  })
})
