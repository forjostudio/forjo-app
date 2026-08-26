// ── El contrato del guardado de horarios del panel (AGENDA-05, D-01/D-12, P-01/P-03) ──────────
//
// Módulo PURO: cero imports. Ni React, ni Next, ni Supabase. Recibe objetos planos y devuelve
// objetos planos, y por eso se puede testear sin DB y sin navegador (test/agenda-hours-payload.
// test.ts) — que es justo lo que faltaba: las tres reglas que encierra vivían adentro de
// `saveHours()` en `agenda-client.tsx`, o sea en un componente que el runner de este repo no puede
// renderizar (`environment: 'node'`). Mismo molde que `lib/agenda-occupancy.ts`: la UI sólo PINTA y
// DISPARA; lo que se decide, se decide acá.
//
// Las TRES cosas que este módulo existe para que no se puedan volver a perder:
//
// 1. **El set es COMPLETO** (P-03). El editor opera por CONSULTORIO ACTIVO —la grilla que ve el
//    dueño es la de una sede— pero el guardado es POR NEGOCIO: el RPC de la migr. 074 borra los
//    bloques del negocio que no vengan en el payload. Armar el payload con la lista ya filtrada por
//    consultorio significa "guardé la sede A y perdí los horarios de la sede B" — una regresión que
//    sólo aparece en un negocio multi-sede y que en local, con un consultorio, nadie ve nunca. Por
//    eso `buildSaveHoursPayload` recibe los 7 días ENTEROS y **no acepta** ningún parámetro de
//    consultorio: no hay por dónde meter el filtro sin cambiar la firma.
//
// 2. **El cupo del bloque NO viaja** (D-12). La columna de cupo de `time_blocks` dejó de decidir en
//    la migr. 068 —el motor lee el cupo del SERVICIO— y arrastrarla al código nuevo la volvería a
//    legitimar. Omitirla es seguro por construcción: la columna es NOT NULL con default, así que el
//    INSERT que no la menciona toma el default y el UPDATE que no la menciona conserva el valor que
//    ya tenía. D-12 pide dejar de ESCRIBIRLA, no reescribirla a mano (P-06). Este módulo directamente
//    no la conoce.
//
// 3. **El retorno de la base ES el estado nuevo** (P-01). El editor inicializa sus 7 días con
//    `useState(initializer)` y NUNCA los re-deriva de las props: no hay ningún `useEffect` que los
//    re-sincronice, y `router.refresh()` no sirve porque el inicializador ya corrió y no vuelve a
//    correr. Hoy no molesta porque el borrar-todo-e-insertar vuelve basura todos los ids en cada
//    guardado y nadie los mira; con el guardado por DIFF, un bloque insertado en el guardado #1
//    seguiría con el id vacío y el guardado #2 lo volvería a INSERTAR: cada bloque nuevo duplicado.
//    La salida elegida es la más barata de sostener: el RPC devuelve el set resultante y el cliente
//    RE-DERIVA su estado de esas filas con `buildDayStatesFromRows` — la MISMA función que usa el
//    inicializador. Al no existir ninguna correlación entre el payload y el retorno, tampoco existe
//    la clase de bug de correlación. (El research recomendaba una clave temporal por bloque que el
//    RPC devolviera de vuelta; se descarta por innecesaria: la re-derivación completa es
//    estrictamente más simple y ELIMINA el modo de falla en vez de administrarlo.)

/**
 * Un bloque del editor, tal como lo tiene el componente mientras el dueño lo edita.
 *
 * `id` ausente = bloque nuevo que todavía no existe en la base. `label` y `location_id` son cadenas
 * (nunca `null`) porque es lo que esperan los inputs controlados; la traducción a `null` la hace el
 * constructor del payload, no el componente. `service_ids` vacío = franja COMODÍN (D-01): la
 * ausencia de mapeo ES la regla, no un dato faltante.
 */
export type AgendaBlockDraft = {
  id?: string
  start_time: string
  end_time: string
  label: string
  location_id: string
  service_ids: string[]
}

/**
 * Un día del editor: la bandera de abierto/cerrado y sus bloques, de TODOS los consultorios.
 *
 * Genérico sobre el shape del bloque —cualquier objeto que extienda el borrador— para que
 * `agenda-client` pueda sumarle su campo de error de validación sin castear en el call site. Mismo
 * criterio por el que `blocksForService` es genérica sobre el shape de la franja.
 */
export type AgendaDayDraft<B extends AgendaBlockDraft = AgendaBlockDraft> = {
  enabled: boolean
  blocks: B[]
}

/**
 * Una franja YA PERSISTIDA, tal como la devuelve la base: el retorno del RPC y también las filas
 * que llegan por props al render inicial. Los horarios pueden venir como `'HH:MM:SS'` (Postgres
 * devuelve `time` con segundos) y las columnas opcionales como `null`.
 */
export type SavedAgendaBlock = {
  id: string
  day_of_week: number
  start_time: string
  end_time: string
  label: string | null
  location_id: string | null
  service_ids: string[] | null
}

/**
 * Un elemento del arreglo que viaja como parámetro del RPC. `id: null` = INSERT; `id` presente =
 * UPDATE. No lleva `business_id`: el negocio es el otro parámetro del RPC y se valida contra
 * `auth.uid()` adentro — mandarlo por bloque sería darle al cliente una segunda forma de mentir.
 */
export type AgendaBlockPayload = {
  id: string | null
  day_of_week: number
  start_time: string
  end_time: string
  label: string | null
  location_id: string | null
  service_ids: string[]
}

/** `''` y `'   '` son lo mismo que "no hay dato": la base guarda `null`, no una cadena vacía. */
function textOrNull(value: string | undefined): string | null {
  const trimmed = (value ?? '').trim()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * Ids únicos, en el orden en que el dueño los fue tocando, sin vacíos.
 *
 * El orden importa poco para la base (la puente no tiene orden) pero sí para la ida y vuelta de los
 * tests y para que el diff del payload sea estable entre dos guardados idénticos.
 */
function uniqueIds(ids: string[] | null | undefined): string[] {
  const out: string[] = []
  for (const id of ids ?? []) {
    if (!id) continue
    if (out.includes(id)) continue
    out.push(id)
  }
  return out
}

/**
 * ¿La hora que tiene el editor es una hora que la base pueda castear? (`'HH:MM'`, 00:00–23:59)
 *
 * Existe porque un `<input type="time">` se puede **vaciar**: el valor pasa a `''` y el editor
 * seguía dejándolo viajar. La única validación del cliente era la comparación de orden
 * `end_time <= start_time`, y con `start_time === ''` esa comparación devuelve `false` —cualquier
 * cadena no vacía ordena DESPUÉS de `''`—, así que el bloque pasaba el filtro. Del otro lado, el
 * `::time` del RPC (migr. 074) revienta con `22007 invalid input syntax for type time: ""` ANTES de
 * poder llegar a su propio backstop de `invalid_block`, y el dueño se come un error de la base por
 * un campo vacío que la pantalla podría haberle marcado.
 *
 * Se valida la forma COMPLETA y no sólo el "no vacío": `'9:0'`, `'25:00'` y `'ab:cd'` rompen el
 * mismo cast por el mismo motivo, y una franja con una hora imposible no es una franja.
 */
export function isValidBlockTime(value: string | undefined | null): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value ?? '')
}

/** `'09:00:00'` → `'09:00'`. Los inputs `type="time"` del editor no toleran los segundos. */
function toHHMM(time: string): string {
  return time.slice(0, 5)
}

/**
 * El estado deseado COMPLETO del negocio: lo que el dueño quiere que quede después de guardar.
 *
 * Se manda el estado deseado y no un delta a propósito: el editor no guarda el estado original, así
 * que no puede calcular un delta confiable, y un delta calculado en el cliente queda viejo si otra
 * pestaña guardó en el medio. El estado deseado es idempotente y es exactamente la semántica que el
 * dueño ya tiene en la cabeza ("lo que veo es lo que queda").
 *
 * ⚠ `days` son los SIETE días con TODOS sus bloques, de todos los consultorios (P-03). La firma no
 * acepta consultorio: el filtro por sede es de la vista, no del guardado.
 *
 * `hasLocations` es la única regla que sí depende de las sedes: con consultorios cargados no existe
 * el concepto "General", así que un bloque sin consultorio no tiene dónde vivir y se descarta — es
 * literalmente el comportamiento de hoy (`agenda-client.tsx:377`), sólo que ahora está escrito en un
 * lugar donde se puede leer y testear. Sin consultorios cargados el bloque viaja con consultorio
 * nulo, que es la grilla única de siempre.
 */
export function buildSaveHoursPayload<B extends AgendaBlockDraft>(
  days: AgendaDayDraft<B>[],
  { hasLocations }: { hasLocations: boolean },
): AgendaBlockPayload[] {
  const payload: AgendaBlockPayload[] = []
  days.forEach((day, dayOfWeek) => {
    if (!day.enabled) return
    for (const block of day.blocks) {
      const locationId = textOrNull(block.location_id)
      if (hasLocations && !locationId) continue // sin sede no hay dónde ponerlo (regla de hoy)
      payload.push({
        id: block.id ?? null, // sin id = bloque nuevo ⇒ INSERT; nunca un uuid inventado en el cliente
        day_of_week: dayOfWeek,
        start_time: block.start_time,
        end_time: block.end_time,
        label: textOrNull(block.label),
        location_id: locationId,
        service_ids: uniqueIds(block.service_ids),
      })
    }
  })
  return payload
}

/**
 * Los 7 días del editor, derivados de las filas persistidas.
 *
 * ÚNICA derivación del estado del editor, compartida por el inicializador del componente y por el
 * post-guardado (P-01). Tener dos derivaciones distintas del mismo estado es exactamente cómo se
 * llega a que el segundo "Guardar horarios" duplique todo: la del inicializador se mantiene y la del
 * guardado se olvida.
 *
 * Siempre devuelve 7 entradas indexadas por día de la semana (0 = domingo, igual que la columna), y
 * `enabled` sale de los datos —un día tiene bloques o no los tiene—, no de una bandera aparte que
 * pueda quedar desincronizada.
 *
 * ⚠ Cada bloque recibe su PROPIA copia del arreglo de servicios (P-04): si dos bloques compartieran
 * la referencia —cosa fácil de provocar copiando un día a otro—, togglear un chip en uno cambiaría
 * el otro en silencio.
 *
 * Una fila con un día fuera de 0..6 se descarta en vez de romper: es dato de la base que no puede
 * existir (hay CHECK), y tumbar el render de la agenda entera por una fila imposible es peor que
 * ignorarla.
 */
export function buildDayStatesFromRows(rows: SavedAgendaBlock[]): AgendaDayDraft[] {
  const days: AgendaDayDraft[] = Array.from({ length: 7 }, () => ({ enabled: false, blocks: [] }))
  for (const r of rows) {
    if (!Number.isInteger(r.day_of_week) || r.day_of_week < 0 || r.day_of_week > 6) continue
    days[r.day_of_week].blocks.push({
      id: r.id,
      start_time: toHHMM(r.start_time),
      end_time: toHHMM(r.end_time),
      label: r.label ?? '',
      location_id: r.location_id ?? '',
      service_ids: [...(r.service_ids ?? [])], // copia propia por bloque (P-04)
    })
  }
  for (const day of days) day.enabled = day.blocks.length > 0
  return days
}
