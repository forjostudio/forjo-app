// ── Las reglas PURAS del panel que organiza el catálogo (Phase 23, CAT-01/02/03) ──────────────
//
// POR QUÉ EXISTE
// El organizador de `/servicios` escribe dos cosas que nunca se habían escrito juntas en este repo:
// el ORDEN de una lista entera de hermanas (varias filas por gesto) y la CATEGORÍA de un servicio
// desde tres superficies distintas (el form, el arrastre y el diálogo "Mover …"). Las dos tienen
// una regla chica que, repetida en cada call site, diverge: un swap suelto que deja empates, un
// "sin categoría" que una superficie traduce a `null` y otra a `''`, o un rechazo de la base que
// alguien interpola en un toast. Encerrarlas acá las vuelve UNA sola regla y, sobre todo, la única
// parte automatizable del reordenamiento: todo lo demás sólo se ve a ojo.
//
// QUÉ HACE
//   - Posiciones: `renumber` (la lista completa desde 0) y `moveWithinList` (la regla que comparten
//     las flechas y el arrastre).
//   - La columna de categoría (D-07): `categoryPatch` es la ÚNICA fuente del valor escrito en
//     `services.category_id` y `mapCategoryWriteError` la ÚNICA traducción de sus rechazos.
//   - Copy: los plurales del Copywriting Contract y la traducción del rechazo del alta por CÓDIGO.
//
// QUÉ NO HACE
//   - NO agrupa ni ordena el catálogo. Esa regla vive en `groupCatalog()` de
//     `@/lib/service-categories`, y sus comparadores no se exportan a propósito: si el panel
//     ordenara por su cuenta, el dueño vería un orden y el cliente otro.
//   - NO filtra por tenant. Recibe ids y códigos; el caller acota por `business_id` ANTES de llamar
//     y cada escritura lleva su `.eq('business_id', …)` además de la RLS (mismo contrato que
//     `lib/staff-services.ts`).
//   - NO lee el texto de un error de Postgres. Ni siquiera lo recibe: el nombre del constraint viaja
//     dentro de ese texto y no puede cruzar a la pantalla (T-14-25 / T-13-09).
//
// Funciones PURAS: sin React, sin Supabase, sin nada de `next/` → testeables sin base.

/**
 * El valor del control que significa "este servicio no tiene categoría".
 *
 * Existe porque el `Select` de Base UI maneja `string` y no `null`. Es un valor que JAMÁS puede
 * coincidir con un uuid, y se traduce a la columna en un solo lugar: {@link categoryPatch}.
 */
export const SIN_CATEGORIA = '__sin_categoria__'

/**
 * El patch de UNA sola clave que escribe la columna de categoría de un servicio (D-07).
 *
 * Recibe el valor del control —el sentinel {@link SIN_CATEGORIA} o un uuid— y devuelve el objeto con
 * la columna: el sentinel da `null`, cualquier otro valor pasa tal cual.
 *
 * Contrato: es la ÚNICA traducción del sentinel de toda la fase y la ÚNICA fuente de la clave de la
 * columna en todo el código. El update suelto del organizador la recibe entera; el alta y la edición
 * del form la esparcen dentro de la única fila que ya escriben; y los espejos en memoria del estado
 * local también la esparcen. Tres interpretaciones distintas de "sin categoría" es exactamente el
 * molde de bug que D-07 existe para impedir.
 */
export function categoryPatch(value: string): { category_id: string | null } {
  return { category_id: value === SIN_CATEGORIA ? null : value }
}

/** El inverso de {@link categoryPatch}: hidrata el control desde la columna (nulo ⇒ el sentinel). */
export function fromCategoryId(id: string | null | undefined): string {
  return id ? id : SIN_CATEGORIA
}

/**
 * El valor del control saneado contra las categorías que EXISTEN hoy (code review CR-01).
 *
 * Un borrador del form (alta o edición) guarda el uuid que eligió el dueño. Si después borra esa
 * categoría desde el organizador, sin recargar, el `Select` pinta "Sin categoría" (su fallback) pero
 * el valor sigue siendo el uuid borrado, y la escritura rebota con 23503 contra un control que dice
 * que no eligió ninguna. Si era la ÚLTIMA categoría, el Select ni se renderiza y todas las altas
 * fallan hasta recargar. Saneado acá, lo que se escribe es lo que se ve: un uuid que ya no está en
 * `liveIds` pasa a ser el sentinel. El sentinel y los uuids vivos pasan tal cual.
 *
 * Se aplica ANTES de {@link categoryPatch}, nunca en su lugar: la traducción a la columna sigue
 * siendo una sola.
 */
export function liveCategoryValue(value: string, liveIds: Iterable<string>): string {
  if (value === SIN_CATEGORIA) return value
  for (const id of liveIds) if (id === value) return value
  return SIN_CATEGORIA
}

/**
 * La ÚNICA traducción de un rechazo de escritura de la columna de categoría a copy propia (D-07).
 *
 * Recibe SÓLO el código. `'23503'` es la FK compuesta `services_category_same_tenant`: la categoría
 * es de otro negocio o se borró mientras el panel la mostraba — para el dueño, en los dos casos, lo
 * que tiene en pantalla dejó de existir. Cualquier otro código, o ninguno, devuelve `null` para que
 * el caller siga por el camino de error que ya tenía. Si mañana otro código necesita copy, se agrega
 * ACÁ, nunca en un call site.
 */
export function mapCategoryWriteError(code: string | null | undefined): string | null {
  if (code === '23503') return 'Esa categoría ya no existe. Recargá la página y elegí otra.'
  return null
}

/**
 * La lista COMPLETA de hermanas, renumerada desde 0: sin huecos y sin empates. No muta la entrada.
 *
 * Se renumera la lista entera y no sólo el par que cambió porque un swap deja huecos y empates, y
 * con dos filas empatadas el orden lo decide la lectura —que cambia entre reloads—.
 */
export function renumber(ids: string[]): { id: string; sort_order: number }[] {
  return ids.map((id, i) => ({ id, sort_order: i }))
}

/**
 * La posición de una fila que entra AL FINAL de una lista de hermanas: la mayor que hay, más uno.
 * Lista vacía ⇒ 0. Un `sort_order` ausente cuenta como 0 (el DEFAULT de la columna).
 *
 * NO es `rows.length` (code review WR-01): borrar deja huecos, y con `[C:2]` el largo daría 1, que
 * pinta la fila nueva ANTES de C. Tampoco renumera a nadie: la fila nueva va detrás de todas sin
 * escribir ninguna otra posición, así que vale en cualquier modo de orden.
 */
export function nextSortOrder(rows: { sort_order?: number | null }[]): number {
  return rows.reduce((max, r) => Math.max(max, r.sort_order ?? 0), -1) + 1
}

/**
 * Los servicios que comparten grupo con el valor `value` del control (un uuid o el sentinel), para
 * calcular DÓNDE LLEGA un servicio que entra a ese grupo (code review WR-02). No es para pintar: el
 * orden y los títulos siguen siendo de `groupCatalog`.
 *
 * Mismo reparto que `groupCatalog`: un `category_id` nulo o que no está en `liveIds` (colgado, de otro
 * tenant) cuenta como suelto, o sea hermano del sentinel. `excludeId` saca al propio servicio (el
 * que se edita o se mueve) para que no se cuente a sí mismo. No muta la entrada.
 */
export function categorySiblings<S extends { id: string; category_id?: string | null }>(
  services: S[],
  value: string,
  liveIds: Iterable<string>,
  excludeId?: string,
): S[] {
  const vivas = new Set(liveIds)
  return services.filter(s => {
    if (s.id === excludeId) return false
    const suyo = s.category_id && vivas.has(s.category_id) ? s.category_id : SIN_CATEGORIA
    return suyo === value
  })
}

/**
 * Saca el elemento de `from` y lo inserta en `to`, sobre una COPIA.
 *
 * No-op (copia idéntica) si los índices son iguales o si alguno cae fuera del rango. Es la operación
 * que comparten las flechas y el arrastre: una sola regla de movimiento, dos disparadores.
 */
export function moveWithinList(ids: string[], from: number, to: number): string[] {
  const copia = [...ids]
  const fueraDeRango = (i: number) => !Number.isInteger(i) || i < 0 || i >= copia.length
  if (from === to || fueraDeRango(from) || fueraDeRango(to)) return copia
  const [movido] = copia.splice(from, 1)
  copia.splice(to, 0, movido)
  return copia
}

/**
 * La lista de un grupo después de soltar `movedId` sobre el elemento `targetId` (code review WR-03).
 *
 * `groupIds` es el grupo DESTINO en el orden que se ve.
 *   - Si ya contiene a `movedId` (mismo grupo): la misma semántica que el arrastre de filas,
 *     `moveWithinList(groupIds, from, índice del destino)`. Así bajar uno y llegar al último son
 *     posibles; con "insertar antes del destino" soltar A sobre B en `[A, B, C]` no cambiaba nada.
 *   - Si no lo contiene (viene de otro grupo): se inserta EN el índice del destino, o al final si el
 *     destino no está en la lista.
 * No muta la entrada. Soltar un elemento sobre sí mismo devuelve la copia idéntica.
 */
export function placeOnTarget(groupIds: string[], movedId: string, targetId: string): string[] {
  const from = groupIds.indexOf(movedId)
  const to = groupIds.indexOf(targetId)
  if (from >= 0) return to < 0 ? [...groupIds] : moveWithinList(groupIds, from, to)
  const copia = [...groupIds]
  copia.splice(to < 0 ? copia.length : to, 0, movedId)
  return copia
}

/** true si las dos listas tienen los mismos ids en el mismo orden. */
export function sameOrder(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i])
}

/** Pill del header: `Sin categorías` · `1 categoría` · `{n} categorías`. */
export function categoryCountLabel(n: number): string {
  if (n <= 0) return 'Sin categorías'
  return n === 1 ? '1 categoría' : `${n} categorías`
}

/** Conteo por categoría: `Sin servicios` · `1 servicio` · `{n} servicios`. */
export function serviceCountLabel(n: number): string {
  if (n <= 0) return 'Sin servicios'
  return n === 1 ? '1 servicio' : `${n} servicios`
}

/** El motivo de dominio de un rechazo del alta (o del renombrado) de una categoría. */
export type CategoryWriteReject = 'duplicate' | 'blank' | 'unknown'

/**
 * Clasifica el rechazo de una escritura de `service_categories` SÓLO por su código.
 *
 * `'23505'` lo tira el índice normalizado `service_categories_name_uq` (migr. 079: mismo nombre sin
 * distinguir mayúsculas ni blancos de borde) y `'23514'` el CHECK de no-blanco. Todo lo demás es
 * `unknown`. La función no recibe ni mira el texto del error: ahí viaja el nombre del constraint.
 */
export function classifyCategoryWriteError(error: { code?: string | null } | null | undefined): CategoryWriteReject {
  const code = error?.code
  if (code === '23505') return 'duplicate'
  if (code === '23514') return 'blank'
  return 'unknown'
}

/** La copy literal del Copywriting Contract para cada motivo de rechazo. */
export const CATEGORY_WRITE_REJECT_COPY: Record<CategoryWriteReject, string> = {
  duplicate: 'Ya tenés una categoría con ese nombre.',
  blank: 'Escribí un nombre para la categoría.',
  unknown: 'No se pudo guardar la categoría. Probá de nuevo.',
}

/** El aviso de D-10.2: el orden no se guardó y la pantalla volvió a mostrar el que está en la base. */
export const ORDER_REJECT_COPY = 'No se pudo guardar el orden. Volvimos a mostrar el que está guardado.'

/** El aviso de un "Mover …" que no se guardó. */
export function moveRejectCopy(serviceName: string): string {
  return `No se pudo mover “${serviceName}”. Probá de nuevo.`
}
