// ── La regla de AGRUPAR el catálogo en títulos (CAT-06/CAT-07, D-03/D-05/D-08) ──────────────
// Fuente ÚNICA de verdad de "cómo se ve el catálogo agrupado" en el modelo de categorías de
// servicios (v0.29, migr. 078). Encierra la regla una sola vez para que las DOS superficies que la
// necesitan la interpreten idéntico:
//   - el panel del dueño (Phase 23): la lista que se arrastra y se reordena,
//   - la página pública de reservas (Phase 24): los títulos que ve el cliente.
// Definirla y testearla acá evita que dos implementaciones deriven — que es palabra por palabra el
// motivo escrito en las cabeceras de `lib/staff-services.ts` y `lib/time-block-services.ts`, los
// moldes de este módulo, los dos en producción.
//
// Funciones PURAS: sin React, sin Supabase, sin nada de `next/` → usables en client y server,
// testeables sin base de datos. Las entradas son filas planas, nunca clientes de datos.
//
// ⚠ Contrato: EL CALLER FILTRA ANTES DE LLAMAR. Ninguna función de este módulo filtra por negocio ni
// por vigencia (`active`). El caller —RSC o componente— ya acotó las filas por `business_id` antes
// de invocar. Y NO se relaja "por las dudas": filtrar por tenant acá adentro daría una falsa
// sensación de aislamiento en un módulo que recibe filas de un tercero y no puede validar su origen.
// El aislamiento real vive en la RLS de la migr. 078, en la FK compuesta
// `services_category_same_tenant` y en el `.eq('business_id', ...)` de los consumidores.
//
// ⚠ LA REGLA DE LA AUSENCIA (D-03/D-08), que es la razón de ser de todo esto: un negocio con CERO
// categorías, o un servicio con `category_id` nulo, son estados LEGALES Y PERMANENTES. La ausencia
// significa "vale igual", nunca "no vale". El día de la migración TODOS los negocios de producción
// tienen cero categorías ⇒ el camino de cero categorías es el de TODOS los clientes actuales, y
// tiene que devolver la lista de hoy — misma cantidad, mismo orden, SIN títulos — sin una sola rama
// de código que lo cuide. Eso es CAT-07 por construcción.
//
// ⚠ EL `name` ES TEXTO DEL DUEÑO QUE SE RENDERIZA PARA UN VISITANTE ANÓNIMO. Este módulo lo propaga
// como `string` plano en `title` y JAMÁS construye marcado. Restricción HEREDADA por quien lo pinte:
// se interpola en JSX (auto-escape de React), nunca por `dangerouslySetInnerHTML` (T-22-10).
//
// ⚠ ESTA FUNCIÓN NO ESCRIBE, Y DE ESO DEPENDE CAT-06. El modo de orden NO es un estado que se
// guarda: es un COMPARADOR que se elige adentro de una función pura. Como la función no persiste
// nada, el `sort_order` que el dueño arrastró no tiene POR DÓNDE perderse cuando él elige
// alfabético o precio — "el modo pisa PARA MOSTRAR, no borra" (D-06) no es una promesa que alguien
// tiene que acordarse de cumplir, es lo único que la función puede hacer. Si algún día hace falta
// PERSISTIR un reordenamiento (CAT-03, Phase 23), eso es un write path aparte, en otro archivo:
// meterlo acá adentro rompería CAT-06 en silencio y para todos los negocios a la vez.
//
// ⚠ EL DEFAULT ES LA IDENTIDAD, NO UN ORDEN "MEJOR". Los dos modos arrancan en 'custom' y todos los
// `sort_order` de producción están en 0; con un comparador que devuelve 0 ante el empate y un
// `sort` ESTABLE (garantizado por ES2019), la salida es la lista que llegó, byte por byte. Por eso
// ningún comparador de acá desempata por otra cosa: un "desempate alfabético" agregado de buena fe
// le cambiaría el orden del catálogo a TODOS los negocios el día del deploy, sin que ninguno haya
// tocado nada. El orden estable no es un detalle de implementación: es el mecanismo de CAT-07.

/** Modo de orden de las CATEGORÍAS, a nivel negocio (`businesses.category_sort_mode`, migr. 078). */
export type CategorySortMode = 'custom' | 'alpha'

/**
 * Modo de orden de los SERVICIOS dentro de su grupo (`businesses.service_sort_mode`, migr. 078).
 * Tiene un valor más que su hermano: ordenar categorías por precio no significa nada.
 */
export type ServiceSortMode = 'custom' | 'alpha' | 'price'

/** Los dos modos del negocio, juntos. El modo es por NEGOCIO, no por categoría (D-05). */
export interface CatalogSortModes {
  categories: CategorySortMode
  services: ServiceSortMode
}

/**
 * El default de la BASE, replicado acá para que un caller que todavía no leyó el negocio —o que lee
 * una fila vieja sin las columnas— caiga en el MISMO comportamiento que la DB, y no en otro.
 *
 * 'custom' en los dos y no alfabético: con el modo personalizado + todos los `sort_order` en 0 + un
 * orden estable, la salida es la IDENTIDAD sobre la lista que llega. La lectura pública de hoy no
 * tiene `ORDER BY`, así que "el mismo orden que hoy" sólo es reproducible si el modelo NO REORDENA
 * NADA (CAT-07).
 */
export const DEFAULT_SORT_MODES: CatalogSortModes = { categories: 'custom', services: 'custom' }

/**
 * El título del grupo de los servicios SUELTOS (los que no caen en ninguna categoría recibida).
 *
 * Es una constante y no un literal suelto porque lo leen el panel y la página pública, y dos
 * literales distintos serían dos nombres para el mismo grupo. Sin toggle para elegir entre "Otros" y
 * dejarlos sin título (D-04): la diferencia es cosmética, el control no.
 */
export const OTHER_GROUP_TITLE = 'Otros'

/**
 * Lo MÍNIMO que este módulo lee de un servicio.
 *
 * Es un tipo propio y no `Service` completo a propósito: la fila que devuelve `public_services` no
 * es un `Service` (no trae `capacity`, ni `capacity_mode`, ni `created_at` en todos los call sites),
 * y exigir la interfaz entera obligaría a un cast mentiroso en la página pública. Con esto, la fila
 * de la vista pública y el `Service` del panel entran las dos sin mentir.
 */
export interface CatalogService {
  id: string
  name: string
  price: number
  category_id?: string | null
  sort_order?: number | null
}

/** Lo mínimo que este módulo lee de una categoría: la fila de `public_service_categories` entra tal cual. */
export interface CatalogCategory {
  id: string
  name: string
  sort_order?: number | null
}

/**
 * Un grupo del catálogo ya agrupado.
 *
 * `title: null` NO es un hueco: es LA REGLA "sin títulos" VIVIENDO EN EL DATO. Un consumidor que
 * recibe `title` nulo no PUEDE pintar un encabezado, porque no hay texto que pintar — y eso es lo
 * que hace que CAT-07 no dependa de que alguien se acuerde de escribir un `if` en el JSX. Lo mismo
 * vale para `categoryId`, que es nulo en el grupo de los sueltos y en el grupo único de la identidad.
 */
export interface CatalogGroup<S> {
  categoryId: string | null
  title: string | null
  services: S[]
}

// ── Los comparadores de los dos ejes ──────────────────────────────────────────────────────────
// TODOS devuelven 0 ante el empate y NUNCA desempatan por otra cosa. `Array.prototype.sort` es
// estable desde ES2019, así que el 0 PRESERVA el orden de entrada — ver el segundo ⚠ de la cabecera.

/** Por `sort_order` ascendente. El ausente cuenta como 0, igual que el DEFAULT de la migr. 078. */
function porOrden(a: { sort_order?: number | null }, b: { sort_order?: number | null }): number {
  return (a.sort_order ?? 0) - (b.sort_order ?? 0)
}

/**
 * Por nombre, en español, insensible a acentos y a capitalización.
 *
 * El locale `'es'` importa (la Ñ es una letra propia, no una N decorada). Y `sensitivity: 'base'`
 * es COHERENTE CON LA BASE, no una preferencia: el índice único `service_categories_name_uq` está
 * sobre `(business_id, lower(btrim(name)))` (migr. 078, normalizado por la 079), así que dos
 * categorías del mismo negocio no PUEDEN diferir sólo en capitalización ni en espacios de borde —
 * un comparador sensible a mayúsculas estaría resolviendo un empate que la base hace imposible.
 *
 * ⚠ UN NOMBRE ROTO NO PUEDE TIRAR. `a.name.localeCompare(...)` a secas explota con `null`, y un
 * throw ACÁ ADENTRO es un 500 en la página pública de reservas: el comparador corre dentro del
 * render de un RSC, así que la excepción no la atrapa nadie y el cliente ve "no se ve nada" — el
 * único modo de falla que la cabecera de este módulo declara imposible. Peor todavía, el crash era
 * POSICIONAL (`'b'.localeCompare(null)` coerciona al string "null" y no tira), así que la misma
 * fila rota o rompía la página o mis-ordenaba según dónde hubiera caído. Se normaliza a '' y el
 * orden estable hace el resto.
 */
function porNombre(a: { name: string }, b: { name: string }): number {
  const na = typeof a.name === 'string' ? a.name : ''
  const nb = typeof b.name === 'string' ? b.name : ''
  return na.localeCompare(nb, 'es', { sensitivity: 'base' })
}

/**
 * Normaliza a número lo que llega de PostgREST, o a `NaN` cuando NO HAY precio que comparar.
 *
 * ⚠ Existe por un agujero de la coerción, no por prolijidad: `Number(null)`, `Number(undefined ?? '')`
 * y `Number('   ')` devuelven **0**, que es finito. Sin esta normalización, un precio roto se
 * ordenaba como si el servicio fuera GRATIS y salía PRIMERO en su grupo —la posición más ruidosa
 * posible— por un dato que el dueño no ve. La ausencia acá significa "sin criterio", nunca "cero".
 */
function precioDe(v: unknown): number {
  if (v === null || v === undefined) return NaN
  if (typeof v === 'string' && v.trim() === '') return NaN
  return Number(v)
}

/**
 * Por precio ascendente.
 *
 * ⚠ Si alguno de los dos NO es un número finito, devuelve 0: el par queda SIN CRITERIO y el orden
 * estable conserva la entrada. El precio llega de PostgREST como `numeric` —que puede viajar como
 * string, igual que ya normaliza `booking-client.tsx`— y una lectura rota puede traer `null` o el
 * string vacío, que {@link precioDe} manda a `NaN` en vez de dejar que se coercionen a 0.
 * Mandar el inválido "al final" (o al principio) sería una decisión de producto que nadie tomó, y
 * le movería el catálogo al dueño por un dato roto que él no ve.
 */
function porPrecio(a: { price: number }, b: { price: number }): number {
  const pa = precioDe(a.price)
  const pb = precioDe(b.price)
  if (!Number.isFinite(pa) || !Number.isFinite(pb)) return 0
  return pa - pb
}

/** El comparador del eje CATEGORÍAS según el modo. Ordenar categorías por precio no significa nada. */
function comparadorDeCategorias(mode: CategorySortMode) {
  return mode === 'alpha' ? porNombre : porOrden
}

/** El comparador del eje SERVICIOS según el modo. */
function comparadorDeServicios<S extends CatalogService>(mode: ServiceSortMode) {
  if (mode === 'alpha') return porNombre as (a: S, b: S) => number
  if (mode === 'price') return porPrecio as (a: S, b: S) => number
  return porOrden as (a: S, b: S) => number
}

/**
 * Ordena SOBRE UNA COPIA, siempre.
 *
 * `Array.prototype.sort` ordena IN PLACE: aplicado al arreglo que mandó el caller le reordenaría su
 * prop. Los consumidores son componentes de React —y en un RSC el mismo arreglo alimenta otras
 * lecturas—, así que mutar la entrada es un bug de re-render esperando. Ninguna llamada a `.sort()`
 * de este módulo se hace sobre un parámetro: todas pasan por acá.
 */
function ordenadas<T>(arr: T[], cmp: (a: T, b: T) => number): T[] {
  return [...arr].sort(cmp)
}

/**
 * Agrupa el catálogo de un negocio en grupos con título.
 *
 * Genérica sobre el shape de la fila (cualquier objeto con `id`, `name`, `price` y opcionalmente
 * `category_id`/`sort_order`) para que sirva IGUAL a la fila de `public_services` y a `Service`, sin
 * obligar a un cast mentiroso en ningún call site.
 *
 * Las reglas, en este orden:
 *
 * 0. **Sin servicios no hay grupos**: devuelve `[]`. Ningún grupo de la salida está vacío jamás.
 *
 * 1. **Identidad (CAT-07, D-08).** Si NINGUNA categoría recibida tiene al menos un servicio —lo que
 *    incluye el caso de cero categorías, que es el de todos los negocios de producción el día de la
 *    migración— devuelve UN SOLO grupo `{ categoryId: null, title: null, services }` con la lista EN
 *    EL ORDEN EN QUE LLEGÓ. Misma cantidad, mismo orden, sin títulos: exactamente la lista de hoy.
 *    También cubre el caso del dueño que creó categorías pero todavía no asignó ninguna — no tendría
 *    sentido pintarle "Otros" a un catálogo entero que no cambió.
 *
 * 2. **Un grupo por categoría CON servicios**, ordenadas entre sí por `modes.categories`. Una
 *    categoría vacía NO produce grupo: un encabezado sin nada abajo es ruido para el cliente y un
 *    estado normal para el dueño que está a mitad de configurar.
 *
 * 3. **Los sueltos van al final**, con `title` = {@link OTHER_GROUP_TITLE}, y SÓLO si hay alguno.
 *    Se ordenan con el MISMO `modes.services` que los demás grupos: un último bloque sin ordenar
 *    se lee como roto.
 *
 * `modes` es opcional y se completa campo por campo con {@link DEFAULT_SORT_MODES}, para que un
 * caller que sólo conoce un eje no pierda el default del otro.
 *
 * ⚠ **EN EL CAMINO DE LA IDENTIDAD LOS MODOS NI SE MIRAN** (D-08). Con cero categorías —o con
 * categorías creadas pero ninguna asignada— la salida es la lista que llegó, en el orden que llegó,
 * CUALQUIERA sea `modes`. Es la única lectura de CAT-07 que no le deja a un negocio de producción
 * un orden distinto al del día anterior: sin categorías no hay nada que agrupar, así que tampoco
 * hay nada que ordenar.
 *
 * ⚠ **INVARIANTE DE CONSERVACIÓN — todo servicio de la entrada aparece EXACTAMENTE UNA VEZ en la
 * salida.** Un servicio cuyo `category_id` no matchea ninguna categoría recibida —nulo, colgado, de
 * otro tenant, o porque la lectura de las categorías falló y llegó `[]`— cae en el grupo de los
 * sueltos. JAMÁS se descarta. Éste es el modo de falla que ya mordió DOS veces en este repo (CR-01
 * del code review de la Phase 20, y otra vez en la 21): un helper que responde "no" para todo y
 * apaga el catálogo entero, en silencio. Acá el peor caso posible es "se ve como hoy", nunca "no se
 * ve nada".
 *
 * ⚠ NO MUTA LA ENTRADA: los arreglos de salida son copias. Los consumidores son componentes de React
 * que reciben props; ordenar in-place la prop del padre es un bug de re-render esperando.
 */
export function groupCatalog<S extends CatalogService>(
  services: S[],
  categories: CatalogCategory[],
  modes?: Partial<CatalogSortModes>,
): CatalogGroup<S>[] {
  // Campo por campo con `??`, y NO con `{ ...DEFAULT_SORT_MODES, ...modes }`: el spread NO cae al
  // default cuando la clave EXISTE con valor `undefined` — la pisa con `undefined`. Y ése es
  // justamente el call site natural de las Phases 23/24, porque en `lib/types.ts` las dos columnas
  // son opcionales (`category_sort_mode?` / `service_sort_mode?`): pasar
  // `{ categories: business.category_sort_mode, services: business.service_sort_mode }` manda
  // `undefined` en los dos cada vez que la fila se leyó con un `select` más angosto. Hoy la salida
  // igual coincide con 'custom', pero POR CASUALIDAD (los dos comparadores caen a `porOrden` al
  // final de su cadena de `if`); el día que cambie un default, o que alguien meta un `switch` con
  // guarda exhaustiva, sería un orden equivocado para TODOS los negocios y en silencio — la clase
  // exacta de cambio que CAT-07 existe para impedir.
  const modoCategorias = modes?.categories ?? DEFAULT_SORT_MODES.categories
  const modoServicios = modes?.services ?? DEFAULT_SORT_MODES.services

  // Regla 0 — SIN SERVICIOS NO HAY GRUPOS. Devolver un grupo con cero servicios no le sirve a
  // ningún consumidor y sí lo puede confundir: un `groups.length > 0` leído como "hay catálogo"
  // pintaría una sección vacía. La invariante que esto sostiene es general y la testea la suite:
  // NINGÚN grupo de la salida está vacío, nunca.
  if (services.length === 0) return []
  // Índice de las categorías REALMENTE recibidas. Es lo que decide si un `category_id` "matchea":
  // un id colgado (categoría borrada entre dos lecturas) o de otro tenant no está acá, así que su
  // servicio cae en los sueltos por el mismo camino que un `category_id` nulo — sin una rama aparte.
  const conocidas = new Set(categories.map((c) => c.id))

  // Una sola pasada, en el orden de entrada: el orden dentro de cada grupo es el de llegada, que con
  // modo 'custom' y todos los `sort_order` en 0 es el de hoy.
  const porCategoria = new Map<string, S[]>()
  const sueltos: S[] = []
  for (const s of services) {
    const cat = s.category_id
    if (cat && conocidas.has(cat)) {
      const acc = porCategoria.get(cat)
      if (acc) acc.push(s)
      else porCategoria.set(cat, [s])
    } else {
      sueltos.push(s)
    }
  }

  // Regla 1 — la identidad. `porCategoria` vacío ⇔ ninguna categoría recibida tiene servicios.
  // Se pregunta por el resultado del reparto y no por `categories.length === 0` a propósito: así el
  // negocio con categorías pero sin ninguna asignada cae en el mismo camino, que es el correcto.
  // ⚠ SALE ANTES DE TOCAR NINGÚN COMPARADOR: acá los modos no se miran (D-08, ver el JSDoc).
  if (porCategoria.size === 0) {
    return [{ categoryId: null, title: null, services: [...services] }]
  }

  const ordenarServicios = comparadorDeServicios<S>(modoServicios)

  // Regla 2 — un grupo por categoría con servicios, las categorías ordenadas por su propio eje.
  const grupos: CatalogGroup<S>[] = []
  for (const c of ordenadas(categories, comparadorDeCategorias(modoCategorias))) {
    const suyos = porCategoria.get(c.id)
    if (!suyos || suyos.length === 0) continue
    // ⚠ SE CONSUME EL BUCKET, y de eso depende la invariante de conservación en su otra dirección:
    // "EXACTAMENTE una vez" también prohíbe DOS veces. Si `categories` trae dos filas con el mismo
    // `id`, sin este `delete` las dos iteraciones leen el MISMO arreglo y lo empujan a dos grupos
    // distintos: el cliente ve el mismo servicio reservable bajo dos títulos, y React recibe keys
    // repetidas. La PK de `service_categories` lo impide en la base, pero este módulo recibe filas
    // de un tercero: alcanza con que un caller concatene dos lecturas, mezcle una lista cacheada, o
    // que una UI optimista agregue una categoría que el refetch también devuelve (Phase 23).
    porCategoria.delete(c.id)
    grupos.push({ categoryId: c.id, title: c.name, services: ordenadas(suyos, ordenarServicios) })
  }

  // Regla 3 — los sueltos, últimos y sólo si hay. Nunca se descartan (invariante de conservación).
  // Mismo comparador que los demás grupos: el último bloque no queda "crudo".
  if (sueltos.length > 0) {
    grupos.push({
      categoryId: null,
      title: OTHER_GROUP_TITLE,
      services: ordenadas(sueltos, ordenarServicios),
    })
  }

  return grupos
}
