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
// ⚠ ALCANCE DE ESTE PLAN (22-01): acá vive SÓLO la regla de agrupar. Los comparadores de los tres
// modos de orden ('custom' / 'alpha' / 'price') los trae el plan 22-02, junto con el parámetro de
// modos de `groupCatalog`. Hasta entonces el agrupado respeta EL ORDEN EN QUE LLEGAN las filas, que
// es exactamente lo que hace el modo 'custom' con todos los `sort_order` en 0 — o sea, el default de
// la base y el estado de todos los negocios de producción. El rojo temporal es deliberado, no una
// sorpresa.

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

/**
 * Agrupa el catálogo de un negocio en grupos con título.
 *
 * Genérica sobre el shape de la fila (cualquier objeto con `id`, `name`, `price` y opcionalmente
 * `category_id`/`sort_order`) para que sirva IGUAL a la fila de `public_services` y a `Service`, sin
 * obligar a un cast mentiroso en ningún call site.
 *
 * Las tres reglas, en este orden:
 *
 * 1. **Identidad (CAT-07, D-08).** Si NINGUNA categoría recibida tiene al menos un servicio —lo que
 *    incluye el caso de cero categorías, que es el de todos los negocios de producción el día de la
 *    migración— devuelve UN SOLO grupo `{ categoryId: null, title: null, services }` con la lista EN
 *    EL ORDEN EN QUE LLEGÓ. Misma cantidad, mismo orden, sin títulos: exactamente la lista de hoy.
 *    También cubre el caso del dueño que creó categorías pero todavía no asignó ninguna — no tendría
 *    sentido pintarle "Otros" a un catálogo entero que no cambió.
 *
 * 2. **Un grupo por categoría CON servicios**, en el orden en que llegaron las categorías. Una
 *    categoría vacía NO produce grupo: un encabezado sin nada abajo es ruido para el cliente y un
 *    estado normal para el dueño que está a mitad de configurar.
 *
 * 3. **Los sueltos van al final**, con `title` = {@link OTHER_GROUP_TITLE}, y SÓLO si hay alguno.
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
): CatalogGroup<S>[] {
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
  if (porCategoria.size === 0) {
    return [{ categoryId: null, title: null, services: [...services] }]
  }

  // Regla 2 — un grupo por categoría con servicios, en el orden en que llegaron las categorías.
  const grupos: CatalogGroup<S>[] = []
  for (const c of categories) {
    const suyos = porCategoria.get(c.id)
    if (!suyos || suyos.length === 0) continue
    grupos.push({ categoryId: c.id, title: c.name, services: suyos })
  }

  // Regla 3 — los sueltos, últimos y sólo si hay. Nunca se descartan (invariante de conservación).
  if (sueltos.length > 0) {
    grupos.push({ categoryId: null, title: OTHER_GROUP_TITLE, services: sueltos })
  }

  return grupos
}
