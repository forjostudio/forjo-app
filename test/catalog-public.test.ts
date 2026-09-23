import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

// ── Phase 24 (el catálogo que el cliente lee) — los invariantes del CABLEADO público ────────────
// Suite PURA: sin Supabase, sin fixtures y sin gate de entorno → corre siempre y cae sola en el
// carril paralelo `pure` (test/suite-split.ts clasifica por los imports del archivo, así que acá no
// se importa nada de `./env` ni ningún cliente de datos). Molde: test/shell-scope.test.ts.
//
// POR QUÉ ESTA SUITE LEE CÓDIGO FUENTE EN VEZ DE RENDERIZAR: el entorno de Vitest de este repo es
// `node` (vitest.config.mts) — no hay DOM, no hay Testing Library, `BookingClient` llama
// `useRouter()` en su cuerpo y el milestone prohíbe agregar paquetes. El cableado no se puede probar
// montando el componente, así que se afirma leyendo las fuentes. Es el mismo mecanismo de
// test/shell-scope.test.ts y test/auth-email-templates.test.ts.
//
// LO QUE ESTA SUITE NO HACE, a propósito:
//   · NO re-testea `groupCatalog` — 43 casos en test/service-categories.test.ts, incluido el del
//     modo presente con valor indefinido.
//   · NO re-testea el camino tabla base → vista anónima (test/service-categories-model.test.ts).
//   · NO re-testea el "Ver más" medido (components/booking/service-description.test.tsx, D-08).
//   · NO intenta renderizar el componente.
// Lo único que congela es lo que ninguno de esos tres puede ver: que el dato REALMENTE viaje desde
// la vista de Postgres hasta la pantalla del cliente, y que viaje bien.

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')

/**
 * Borra comentarios JSX, de bloque y de línea, en ese orden.
 *
 * ES LO QUE HACE HONESTA A TODA LA SUITE. Sin esto, cada aserción negativa de abajo se satisface —o
 * se rompe— con un COMENTARIO que mencione el término, que es exactamente el falso verde (y el falso
 * rojo) que este archivo viene a evitar: la región del paso 1 está llena de comentarios que nombran
 * los términos prohibidos justamente para explicar por qué están prohibidos.
 */
function sinComentarios(src: string): string {
  return src
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

/**
 * Todos los .ts/.tsx del repo (excluidas dependencias, artefactos de build y directorios ocultos).
 * Es el `grep -rln` del audit llevado a test: sin él, "ningún call site compone su tercer argumento
 * por propagación" es una afirmación sobre los archivos que a alguien se le ocurrió mirar, no un
 * invariante. Copiado de test/shell-scope.test.ts.
 */
function fuentesDelRepo(dir = process.cwd(), acc: string[] = []): string[] {
  const IGNORAR = new Set(['node_modules', 'coverage', 'supabase', 'public'])
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || IGNORAR.has(e.name)) continue
    const full = join(dir, e.name)
    if (e.isDirectory()) fuentesDelRepo(full, acc)
    else if (/\.tsx?$/.test(e.name)) acc.push(full)
  }
  return acc
}

/** Recorta una llamada balanceando paréntesis desde el de apertura (índice `desde`) hasta su cierre. */
function recorteDeLlamada(src: string, desde: number): string {
  let nivel = 0
  for (let i = desde; i < src.length; i++) {
    if (src[i] === '(') nivel++
    else if (src[i] === ')') {
      nivel--
      if (nivel === 0) return src.slice(desde, i + 1)
    }
  }
  return src.slice(desde)
}

/**
 * La marca de LLAMADA, armada por concatenación para que ESTE archivo no se matchee a sí mismo en el
 * barrido de todas las fuentes del repo (mismo truco que la MARCA de test/shell-scope.test.ts).
 */
const LLAMADA = 'groupCatalog' + '('

const PUBLIC_PAGE = join('app', '[slug]', 'page.tsx')
const BOOKING_CLIENT = join('app', '[slug]', 'booking-client.tsx')

describe('el camino del dato: de la vista de Postgres a la pantalla pública', () => {
  const publicPage = read(PUBLIC_PAGE)

  it('el select de public_businesses pide LOS DOS modos de orden', () => {
    // Previene EL FALLO SILENCIOSO de la fase. Los dos RSC de negocio usan columnas EXPLÍCITAS a
    // propósito (nunca un select con comodín: esa fila viaja entera al bundle del cliente), así que
    // una columna nueva NO llega sola. Sin nombrarlas acá, los dos modos viajan `undefined`, el
    // catálogo ordena igual que hoy POR CASUALIDAD y nadie se entera: no hay error, hay un orden
    // equivocado para todos los negocios (D-09; lib/service-categories.ts:275-285 lo dice en prosa).
    const at = publicPage.indexOf("from('public_businesses')")
    expect(at).toBeGreaterThan(-1)
    const fin = publicPage.indexOf('.single()', at)
    expect(fin).toBeGreaterThan(at)
    const bloque = sinComentarios(publicPage.slice(at, fin))
    expect(bloque).toContain('category_sort_mode')
    expect(bloque).toContain('service_sort_mode')
  })

  it('la lectura de categorías va por la vista acotada, filtra por tenant y ordena por UNA sola clave', () => {
    // Previene P-3: copiar el `.order('created_at')` del panel
    // (app/(dashboard)/servicios/page.tsx:35) a esta lectura. `created_at` NO existe en
    // `public_service_categories` (la vista proyecta cuatro columnas: id, business_id, name,
    // sort_order), así que la query fallaría, el `|| []` la convertiría en cero categorías y el
    // catálogo se desagruparía SIN NINGÚN ERROR VISIBLE. Y de paso deja clavado el filtro por
    // tenant: la vista es DEFINER y es una proyección SIN WHERE, así que el aislamiento efectivo lo
    // pone este .eq (T-24-02).
    const at = publicPage.indexOf("from('public_service_categories')")
    expect(at).toBeGreaterThan(-1)
    const fin = publicPage.indexOf('\n', at)
    const lectura = publicPage.slice(at, fin === -1 ? undefined : fin)
    expect(lectura).toContain("eq('business_id'")
    expect(lectura).toContain('sort_order')
    expect(lectura).not.toContain('created_at')
    // Nunca la tabla base con anon key: para eso está la vista (la migr. 078 sólo define policies
    // de tenant sobre `service_categories`, así que leerla como anon ni siquiera es una alternativa).
    expect(sinComentarios(publicPage)).not.toContain("from('service_categories')")
  })

  it('el call site público pasa la prop con su red de seguridad', () => {
    // Previene que la lectura exista y el dato igual no llegue a la pantalla — el eslabón que más
    // barato se pierde en un refactor del call site.
    const ocurrencias = publicPage.split('serviceCategories={serviceCategories || []}').length - 1
    expect(ocurrencias).toBe(1)
  })
})

describe('el cableado del cliente: la prop, su default y los dos modos', () => {
  const bookingClient = read(BOOKING_CLIENT)

  it('declara la prop OPCIONAL con el tipo del módulo puro y aplica el default en el punto de consumo', () => {
    // Previene tres cosas. (a) Que alguien la tipe con `ServiceCategory` de lib/types, que exige
    // `created_at` — una columna que la vista pública deliberadamente NO expone — y obligaría a un
    // cast mentiroso. (b) Que la prop deje de ser opcional: el `?` ES la declaración, en el tipo, de
    // que el dato ausente DEGRADA (D-15). (c) Que el fail-safe direccional se pierda (sin el `??`
    // una lectura fallida dejaría de degradar) o que alguno de los dos modos se quede en el camino,
    // que es el defecto que no produce ningún error.
    expect(bookingClient).toContain("from '@/lib/service-categories'")
    expect(bookingClient).toContain('serviceCategories?: CatalogCategory[]')
    // La aserción del agrupado se acota AL BLOQUE del useMemo, no al archivo: la lección de
    // test/shell-scope.test.ts:105-110 es que una búsqueda sobre el archivo entero se satisface con
    // un comentario que mencione el término.
    const memo = bookingClient.match(/const catalogGroups = useMemo\([\s\S]*?\n {2}\)/)
    expect(memo).not.toBeNull()
    const bloque = sinComentarios(String(memo))
    expect(bloque).toContain(LLAMADA)
    expect(bloque).toContain('serviceCategories ?? []')
    expect(bloque).toContain('categories: business.category_sort_mode')
    expect(bloque).toContain('services: business.service_sort_mode')
  })
})

describe('la regla dura del tercer argumento (D-10 / CAT-07)', () => {
  it('ningún call site del repo compone los modos por propagación', () => {
    // Previene el único cambio que volvería equivocado el orden de TODOS los negocios en silencio:
    // un spread sobre la tabla de defaults NO cae al default cuando la clave existe con valor
    // `undefined` — la PISA. El `??` campo por campo ya vive ADENTRO de la función
    // (lib/service-categories.ts:275-285), así que el call site sólo puede escribir un objeto
    // literal. Barrido sobre TODAS las fuentes del repo, con comentarios descontados.
    const encontrados: string[] = []
    for (const archivo of fuentesDelRepo()) {
      // `archivo` ya es una ruta ABSOLUTA (fuentesDelRepo arranca en process.cwd()): no pasa por
      // `read`, que compone contra el cwd y la duplicaría.
      const src = sinComentarios(readFileSync(archivo, 'utf8'))
      let at = src.indexOf(LLAMADA)
      while (at !== -1) {
        encontrados.push(recorteDeLlamada(src, at + LLAMADA.length - 1))
        at = src.indexOf(LLAMADA, at + 1)
      }
    }
    // Un barrido que no encuentra nada pasa por vacío y no prueba nada.
    expect(encontrados.length).toBeGreaterThan(0)
    for (const llamada of encontrados) {
      expect(llamada).not.toContain('...')
    }
    // Timeout explícito y generoso: el barrido lee ~370 archivos y en caliente tarda ~200ms, pero en
    // frío (primer toque del antivirus de Windows sobre el árbol entero, medido una vez en esta
    // sesión) puede irse a decenas de segundos. Con el default de 5s este caso sería FLAKY, y un gate
    // que falla por el clima no es un gate: es ruido que se termina borrando.
  }, 60_000)
})

describe('el render del paso 1', () => {
  const bookingClient = read(BOOKING_CLIENT)
  // La región se recorta ANTES de descontar comentarios: los dos marcadores de paso SON comentarios
  // JSX, así que hacerlo al revés borraría los bordes de la región.
  const desde = bookingClient.indexOf('Step 1 - Service')
  const hasta = bookingClient.indexOf('Step 2 - Professional')
  const region = sinComentarios(bookingClient.slice(desde, hasta))

  it('itera GRUPOS y el único condicional nuevo es el del título', () => {
    // Previene P-1: el helper que responde "no" para todo y apaga el catálogo entero en silencio —
    // el modo de falla que ya mordió DOS veces en este repo (CR-01 del code review de la Phase 20 y
    // otra vez en la 21). La regla de "sin títulos" vive en el DATO (el título nulo), no en un `if`
    // sobre el largo de un arreglo: ese `if` además se olvida del caso "categorías creadas pero
    // ninguna asignada", que groupCatalog ya manda al camino de identidad.
    expect(desde).toBeGreaterThan(-1)
    expect(hasta).toBeGreaterThan(desde)
    expect(region).toContain('catalogGroups.map')
    expect(region).toContain('group.services.map')
    expect(region).toContain('group.title !== null')
    expect(region).toContain('{group.title}')
    expect(region).toContain('text-sm font-bold break-words mb-2')
    expect(region).toContain('space-y-6')
    // Ningún condicional por cantidad de elementos decide visibilidad acá.
    expect(region).not.toContain('serviceCategories.length')
    expect(region).not.toContain('group.services.length')
  })

  it('la grilla del paso 1 quedó en UNA columna y la del paso 3 sigue en DOS', () => {
    // Previene las dos mitades del mismo error. Hay DOS grillas byte-idénticas en este archivo y
    // sólo una es de esta fase: la del paso 1 (servicios) y la del selector de sede/consultorio del
    // paso 3, que está FUERA DE ALCANCE. Un buscar-y-reemplazar sobre la cadena ensancharía también
    // el picker de sedes; y un gate del estilo "la clase ya no está" sería incorrecto y empujaría a
    // borrar la ocurrencia equivocada. Por eso se CUENTA: 1 y 1.
    const dosColumnas = bookingClient.split('className="grid grid-cols-1 sm:grid-cols-2 gap-3"').length - 1
    const unaColumna = bookingClient.split('className="grid grid-cols-1 gap-3"').length - 1
    expect(dosColumnas).toBe(1)
    expect(unaColumna).toBe(1)
  })

  it('el título del dueño llega interpolado: la pantalla pública no inyecta marcado crudo', () => {
    // Previene la reapertura de T-23-06 / T-23-10 / T-23-26. El nombre de categoría es texto escrito
    // por el dueño que ahora lee alguien SIN SESIÓN: llega al h3 interpolado en JSX (auto-escape de
    // React) y el literal del grupo de sueltos viene del módulo puro, nunca escrito a mano acá.
    expect(sinComentarios(bookingClient)).not.toContain('dangerouslySetInnerHTML')
  })
})
