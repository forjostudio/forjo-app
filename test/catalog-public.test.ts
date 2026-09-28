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

/**
 * La marca del MONTAJE del componente, también por concatenación y por el mismo motivo: el barrido
 * del preview cuenta call sites sobre TODAS las fuentes del repo, y este archivo es una de ellas.
 */
const MONTAJE = '<Booking' + 'Client'

/** La prop con su red de seguridad, tal cual tiene que aparecer en los dos call sites. */
const PROP_CON_DEFAULT = 'serviceCategories={serviceCategories || []}'

const PUBLIC_PAGE = join('app', '[slug]', 'page.tsx')
const BOOKING_CLIENT = join('app', '[slug]', 'booking-client.tsx')
const PANEL_PAGE = join('app', '(dashboard)', 'web', 'page.tsx')

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
    // `visibleCatalogGroups` y no `catalogGroups`: desde el plan 24-03 el paso 1 pinta los grupos
    // que dejó el chip elegido (D-16). El filtro NO está acá — lo resolvió `filterCatalogGroups` en
    // el módulo puro, y con el chip `Todo` (el estado inicial) devuelve la MISMA referencia, así que
    // la pantalla de entrada sigue siendo el catálogo completo.
    expect(region).toContain('visibleCatalogGroups.map')
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

describe('el preview del panel: el mismo dato por el otro camino de lectura (D-13, G-24-7)', () => {
  const panelPage = read(PANEL_PAGE)

  it('el select de negocio del PANEL pide LOS DOS modos de orden, igual que el del público', () => {
    // Previene el preview que ORDENA DISTINTO del público, sin ningún error a la vista. Los dos RSC
    // de negocio usan columnas EXPLÍCITAS a propósito (esa fila viaja entera al bundle del cliente),
    // así que las dos columnas van en LOS DOS selects o no van: el propio comentario de
    // app/(dashboard)/web/page.tsx declara que su lista es "misma lista que app/[slug]/page.tsx", así
    // que agregarlas en uno solo rompe una invariante escrita en el repo, además de D-09/D-13.
    const at = panelPage.indexOf("from('businesses')")
    expect(at).toBeGreaterThan(-1)
    const fin = panelPage.indexOf('.single()', at)
    expect(fin).toBeGreaterThan(at)
    const bloque = sinComentarios(panelPage.slice(at, fin))
    expect(bloque).toContain('category_sort_mode')
    expect(bloque).toContain('service_sort_mode')
    // Y nunca el comodín: un select('*') publicaría notification_email, plan_status, mp_subscription_id.
    expect(bloque).not.toContain("select('*')")
  })

  it('el preview lee las categorías de la TABLA BASE, por tenant y con el doble orden del panel', () => {
    // Previene DOS cosas distintas. (a) Que el dashboard termine leyendo la vista
    // `public_service_categories`, que es DEFINER sin security_invoker: desde una superficie
    // autenticada dejaría el aislamiento por tenant colgado de UNA sola capa, contra la doctrina
    // escrita en lib/preview-booking.ts. La tabla base suma la RLS al filtro explícito: las dos.
    // (b) Que al preview le falte la clave de desempate y quede en un orden distinto del de
    // /servicios — acá `created_at` SÍ existe (es la tabla base), y es la única de las dos lecturas
    // nuevas de la fase donde el doble `.order` es legal.
    const lectura = panelPage.match(/\.from\('service_categories'\)[\s\S]*?\),/)
    expect(lectura).not.toBeNull()
    const sentencia = sinComentarios(String(lectura))
    expect(sentencia).toContain("eq('business_id'")
    expect(sentencia).toContain("order('sort_order'")
    expect(sentencia).toContain("order('created_at'")
    expect(sinComentarios(panelPage)).not.toContain("from('public_service_categories')")
  })

  it('los call sites de BookingClient son exactamente DOS y los dos pasan la prop', () => {
    // Previene P-5 en su forma general: que una de las dos pantallas que montan el MISMO componente
    // reciba el dato y la otra no — el preview que miente, que es el defecto que el quick 260913-3tv
    // ya tuvo que cerrar una vez. Y deja clavado el hallazgo que corrigió el criterio 5 de la fase:
    // components/landing/landing-renderer.tsx NO es un call site desde que su `bookingSlot` pasó a
    // ser un ReactNode REQUERIDO (hereda las categorías del nodo que arma app/[slug]/page.tsx), así
    // que un TERCER montaje que aparezca sin la prop es una regresión, no una variante aceptable.
    // Barrido sobre todas las fuentes del repo: si no, "los dos call sites" es una afirmación sobre
    // los archivos que a alguien se le ocurrió mirar.
    const conMontaje: string[] = []
    let total = 0
    for (const archivo of fuentesDelRepo()) {
      const src = sinComentarios(readFileSync(archivo, 'utf8'))
      const veces = src.split(MONTAJE).length - 1
      if (veces === 0) continue
      total += veces
      conMontaje.push(archivo)
    }
    expect(total).toBe(2)
    expect(conMontaje).toHaveLength(2)
    for (const archivo of conMontaje) {
      // Cada archivo que MONTA el componente tiene que pasarle la prop con su red de seguridad
      // (D-15): el dato ausente deja la lista plana, nunca un catálogo vacío.
      expect(sinComentarios(readFileSync(archivo, 'utf8'))).toContain(PROP_CON_DEFAULT)
    }
    // Mismo timeout generoso que el barrido de arriba y por el mismo motivo (árbol frío en Windows).
  }, 60_000)
})

describe('la barra de chips que filtra, desde 2 categorías (D-16 / G-24-6)', () => {
  const bookingClient = read(BOOKING_CLIENT)
  const limpio = sinComentarios(bookingClient)
  const desde = bookingClient.indexOf('Step 1 - Service')
  const hasta = bookingClient.indexOf('Step 2 - Professional')
  const region = sinComentarios(bookingClient.slice(desde, hasta))

  it('el umbral NO se escribe acá: no hay una sola comparación contra un número distinto de cero', () => {
    // Previene el literal suelto que D-16 prohíbe explícitamente ("va como constante nombrada, para
    // que moverla sea una línea"). Un `categories.length >= 2` en el JSX pone el umbral en un lugar
    // sin test, y el día que el dueño lo quiera en 3 hay que buscarlo leyendo JSX.
    // La ÚNICA comparación de largo permitida en la región es contra 0 — la pregunta "¿hay chips?",
    // que es la misma forma con la que `title: null` decide el encabezado de grupo.
    expect(desde).toBeGreaterThan(-1)
    expect(hasta).toBeGreaterThan(desde)
    expect(region).toMatch(/chips\.length > 0/)
    expect(region).not.toMatch(/\.length\s*[<>]=?\s*[1-9]/)
    // Y el umbral existe, nombrado, en el módulo puro (su valor lo testea
    // test/service-categories.test.ts, que lo importa y lo ejecuta en vez de leerlo).
    expect(sinComentarios(read(join('lib', 'service-categories.ts')))).toContain('export const CHIPS_MIN_CATEGORIES = 2')
  })

  it('el chip seleccionado por defecto es la sentinela `Todo`', () => {
    // ES LA INVARIANTE DE LA ENTRADA, no un default cómodo: con `Todo` elegido al montar, el cliente
    // ve el catálogo COMPLETO y reservar no cuesta ni un click más que antes (CAT-09 intacto). Un
    // estado inicial distinto reabre exactamente la objeción que fundaba la versión anterior de
    // G-24-6, y es un cambio de una palabra que ningún otro gate vería.
    expect(limpio).toContain('useState<string>(ALL_GROUPS_KEY)')
    expect(limpio).toContain("ALL_GROUPS_KEY,")
  })

  it('la barra se gatea por la CANTIDAD DE CATEGORÍAS del negocio, no por la de grupos', () => {
    // Es el eje que nombra D-16 y el único que distingue "cero categorías" (la pantalla de hoy,
    // CAT-07 / G-24-2) de "categorías creadas pero ninguna asignada". Si acá se pasara
    // `catalogGroups.length`, un negocio con una sola categoría + sueltos tendría dos grupos y la
    // barra aparecería con un umbral que el dueño no eligió.
    const at = limpio.indexOf('const chips = useMemo(')
    expect(at).toBeGreaterThan(-1)
    const bloque = recorteDeLlamada(limpio, limpio.indexOf('(', at + 'const chips = useMemo'.length))
    expect(bloque).toContain('catalogChips(catalogGroups, (serviceCategories ?? []).length)')
  })

  it('el filtro no se escribe en el JSX: la región no filtra ni reordena a mano', () => {
    // Previene la deriva que D-09/D-10 vienen atajando desde la Phase 22: un `.filter()` o un
    // `.sort()` en el render es una SEGUNDA regla de catálogo, y el día que difiera de la del módulo
    // el dueño ordena una cosa y el cliente ve otra sin ningún error a la vista.
    // El gate se acota a los GRUPOS y no a cualquier `.filter(`: la tarjeta ya usa uno legítimo para
    // componer su `aria-describedby` (`[…].filter(Boolean)`), preexistente y fuera de esta fase.
    expect(region).not.toContain('catalogGroups.filter')
    expect(region).not.toContain('visibleCatalogGroups.filter')
    expect(region).not.toContain('Groups.sort')
    expect(region).not.toContain('services.filter')
    expect(region).not.toContain('services.sort')
  })

  it('la accesibilidad del molde portado está completa: tablist con nombre, tab con estado y 44px reales', () => {
    // Las cuatro juntas o ninguna: cuatro `<button>` sueltos sin `role` no le dicen a un lector de
    // pantalla que son un grupo de opciones con una elegida, y `aria-selected` sin `role="tab"` es
    // un atributo inválido que los lectores ignoran.
    expect(region).toContain('role="tablist"')
    expect(region).toContain('aria-label="Filtrar el catálogo por categoría"')
    expect(region).toContain('role="tab"')
    expect(region).toContain('aria-selected={elegido}')
    // Alto REAL de 44px, nunca el pseudo-elemento de la tarjeta: adentro de un contenedor con
    // `overflow-x` el pseudo-elemento que sobresale vuelve scrolleable también el eje vertical
    // (medido en el molde, forjo-tiendas/components/tienda/CatalogoCarta.tsx:56-60).
    expect(region).toContain('min-h-11')
    expect(region).not.toMatch(/after:-inset-[0-9]/)
    // Foco visible en cada chip (regla no negociable del proyecto).
    expect(region).toContain('focus-visible:ring-ring/50')
    // La fila scrollea en horizontal con la barra oculta en los dos motores.
    expect(region).toContain('overflow-x-auto')
    expect(region).toContain('[scrollbar-width:none]')
    expect(region).toContain('[&::-webkit-scrollbar]:hidden')
  })

  it('NO se portó el buscador ni la segunda fila de subcategorías', () => {
    // D-16 lo dice con todas las letras: del molde se porta SÓLO la fila de chips y su filtro. Forjo
    // no tiene subcategorías (fuera de alcance explícito en REQUIREMENTS.md) y nadie pidió búsqueda
    // — dos superficies que nadie decidió y que habría que mantener.
    expect(region).not.toContain('type="search"')
    expect(region).not.toContain('<input')
    expect(region).not.toContain('placeholder')
    // Y sigue sin colapsables ni contenedor de scroll propio para la lista (G-24-6).
    expect(region).not.toContain('<details')
    expect(region).not.toMatch(/max-h-\[?[0-9]/)
  })

  it('cero hex hardcodeado y cero acento a cuerpo chico en el chip apagado', () => {
    // El chip elegido usa el par `bg-primary`/`text-primary-foreground` que ya pinta el hero, y el
    // apagado va en `text-foreground` (16.2:1). `text-primary` a 14px falla AA en 3 de las 5 paletas
    // (3.54 / 3.59 / 2.36:1, medido en el 19-UI-SPEC), así que no puede llevar el texto del chip.
    const barra = region.slice(region.indexOf('role="tablist"'), region.indexOf('space-y-6'))
    expect(barra).toContain('bg-primary text-primary-foreground')
    expect(barra).toContain('text-foreground')
    expect(barra).not.toMatch(/#[0-9a-fA-F]{3,8}/)
    expect(barra).not.toContain('text-primary ')
    expect(barra).not.toContain('text-muted-foreground')
  })
})
