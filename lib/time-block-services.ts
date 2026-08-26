import type { TimeBlockService } from '@/lib/types'

// ── Regla del comodín franja↔servicio (AGENDA-02, D-01/D-03) ────────────────────────────────
// Fuente ÚNICA de verdad de "qué servicios se dan en cada franja" en el modelo de la agenda por
// servicio (v0.28, migr. 071). Encierra la regla del comodín una sola vez para que las TRES capas
// que la necesitan la interpreten idéntico:
//   - la disponibilidad pública (Plan 18-03): qué horarios se OFRECEN para el servicio pedido,
//   - el backstop del `create` (Plan 18-04, D-04): qué horarios se ACEPTAN,
//   - el panel de configuración de la Phase 19: qué franjas cubren cada servicio, y el aviso de
//     D-06 cuando a un servicio no lo cubre ninguna.
// Definirla y testearla acá evita que tres implementaciones deriven en la interpretación de la
// regla — que es palabra por palabra el motivo escrito en la cabecera de `lib/staff-services.ts`,
// el molde de este módulo, en producción desde v0.25.
//
// Funciones PURAS: sin React, sin Supabase, sin nada de `next/` → usables en client y server,
// testeables sin base de datos. Las entradas son filas planas, nunca clientes de datos.
//
// ⚠ Contrato D-16 — el caller filtra ANTES de llamar: ninguna función de este módulo filtra por
// negocio ni por vigencia. El caller —route handler, RSC o el core del booking— ya acotó las filas
// por `business_id` antes de invocar. Y NO se relaja "por las dudas": filtrar por tenant acá
// adentro daría una falsa sensación de aislamiento en un módulo que recibe filas de un tercero y
// no puede validar su origen. El aislamiento real vive en la RLS de la migr. 071 y en las queries
// de los consumidores (que sí hacen `.eq('business_id', ...)`).
//
// Regla del comodín (D-01): una franja SIN filas en la puente sirve para TODOS los servicios. Es
// un default sensato y con cero backfill: el día de la migración todos los negocios tienen 0 filas
// ⇒ toda franja es comodín ⇒ nada cambia (D-02, la cero regresión es POR CONSTRUCCIÓN). Una franja
// con ≥1 fila sirve EXACTAMENTE los servicios mapeados.

/**
 * La ventana horaria de una franja: lo mínimo que leen las funciones que razonan sobre horarios.
 *
 * Es un tipo propio y no `TimeBlock` completo a propósito: el endpoint de disponibilidad lee sólo
 * `start_time`/`end_time` de `time_blocks`, y exigir la interfaz entera obligaría a un cast
 * mentiroso en el call site. `start_time`/`end_time` llegan como `'HH:MM'` o `'HH:MM:SS'` (Postgres
 * devuelve `time` con segundos).
 */
export type BlockWindow = {
  id: string
  start_time: string
  end_time: string
}

/**
 * `'HH:MM'` o `'HH:MM:SS'` → minutos desde medianoche.
 *
 * Local y no exportada: es la misma conversión que `timeToMinutes` de `lib/booking-core.ts` y que
 * el `toMin` de `availability/route.ts`, replicada acá porque este módulo no importa nada más que
 * tipos (pureza). Tolera los segundos: `time` de Postgres viaja como `'HH:MM:SS'`.
 */
function toMinutes(time: string): number {
  const [h, m] = time.split(':')
  return Number(h) * 60 + Number(m)
}

/**
 * Enumera los horarios de inicio `'HH:MM'` que genera una franja para una duración dada.
 *
 * MISMA fórmula que ya usan el endpoint de disponibilidad y el cliente público: desde la apertura,
 * paso = duración, mientras inicio + duración no pase el cierre. Si divergiera, el server ocultaría
 * horarios que el cliente ni muestra (o al revés) y la resta de conjuntos de `startTimesNotOffered`
 * dejaría residuos fantasma.
 */
function startTimesOf(block: BlockWindow, durationMinutes: number): string[] {
  const open = toMinutes(block.start_time)
  const close = toMinutes(block.end_time)
  const out: string[] = []
  for (let t = open; t + durationMinutes <= close; t += durationMinutes) {
    out.push(`${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`)
  }
  return out
}

/**
 * Las franjas donde se da `serviceId`.
 *
 * Comodín (D-01): una franja sin ninguna fila en `bridge` entra siempre (sirve para cualquier
 * servicio); una franja con ≥1 fila entra sólo si alguna de SUS filas es de ese servicio. El mapeo
 * de otra franja no cambia el resultado de ésta — de ahí el filtro por `time_block_id` antes de
 * mirar el `service_id`.
 *
 * Genérica sobre el shape de la franja (cualquier fila con `id`) y no atada a la interfaz
 * `TimeBlock` completa: el endpoint de disponibilidad lee tres columnas de `time_blocks` y forzar
 * el tipo entero obligaría a un cast mentiroso en el call site (el molde `staff-services` usa el
 * tipo completo y paga ese cast en `availability/route.ts`; acá se evita).
 */
export function blocksForService<T extends { id: string }>(
  serviceId: string,
  blocks: T[],
  bridge: TimeBlockService[],
): T[] {
  return blocks.filter((b) => {
    const rows = bridge.filter((r) => r.time_block_id === b.id)
    if (rows.length === 0) return true // comodín: la franja sirve para todo
    return rows.some((r) => r.service_id === serviceId)
  })
}

/**
 * ¿`serviceId` tiene alguna franja que lo dé? (el dato de D-06)
 *
 * `true` salvo que TODAS las franjas recibidas tengan mapeo explícito (≥1 fila) y NINGUNA marque
 * ese servicio. Si queda al menos una comodín, todo servicio está agendado. Por construcción es
 * `blocksForService(...).length > 0`: una sola fuente, cero chance de que las dos respuestas
 * diverjan.
 *
 * ⚠ `false` NO es un error ni bloquea nada (D-06): un servicio sin franja que lo cubra es un estado
 * LEGAL —el dueño está a mitad de configurar—. Esta fase sólo lo deja computable; el aviso en el
 * panel es de la Phase 19 y la explicación al público de la Phase 20.
 */
export function isServiceScheduled<T extends { id: string }>(
  serviceId: string,
  blocks: T[],
  bridge: TimeBlockService[],
): boolean {
  return blocksForService(serviceId, blocks, bridge).length > 0
}

/**
 * La regla del ACEPTA (D-04): ¿se puede tomar `serviceId` a `startMinutes`?
 *
 * Sólo mira las franjas que CONTIENEN ese horario de inicio (`start_time <= t < end_time`):
 *   - si NINGUNA lo contiene ⇒ `true`. Esta fase NO introduce validación general de ventana: es
 *     exactamente el comportamiento de hoy. Implementarla como validación general rechazaría los
 *     días con horario especial que EXTIENDEN la jornada (no están en `time_blocks`) y el alta
 *     fuera de franja — una regresión grave de disponibilidad (AGENDA-04).
 *   - si alguna lo contiene ⇒ `true` sólo si AL MENOS UNA de las que lo contienen da el servicio
 *     (comodín incluido). Con franjas solapadas alcanza con que una lo dé.
 *
 * Contención por el horario de INICIO: el cierre es exclusivo (un turno no puede arrancar justo
 * cuando la franja termina), la apertura inclusiva.
 */
export function isServiceAllowedAt(
  serviceId: string,
  startMinutes: number,
  blocks: BlockWindow[],
  bridge: TimeBlockService[],
): boolean {
  const containing = blocks.filter((b) => {
    const open = toMinutes(b.start_time)
    const close = toMinutes(b.end_time)
    return startMinutes >= open && startMinutes < close
  })
  if (containing.length === 0) return true // sin franja contenedora: se acepta, como hoy
  return blocksForService(serviceId, containing, bridge).length > 0
}

/**
 * Los horarios de inicio `'HH:MM'` que hay que DEJAR DE OFRECER para `serviceId`.
 *
 * ⚠ La trampa que esta función existe para resolver — la lectura ingenua es al revés y además está
 * mal por dos motivos distintos:
 *   1. "Quedarse con las franjas que dan el servicio" no sirve: el endpoint de disponibilidad NO
 *      devuelve la grilla, devuelve la lista de horarios a OCULTAR. Quitar franjas de la entrada
 *      generaría MENOS horarios ocultos, o sea que se ofrecerían MÁS. Justo al revés de lo pedido.
 *   2. "Los horarios de las franjas que no lo dan" tampoco alcanza: con dos franjas solapadas que
 *      arrancan a la misma hora —una que da el servicio y otra que no— ese horario legítimo se
 *      ocultaría igual.
 * Por eso la operación es una RESTA DE CONJUNTOS: los horarios que generan las franjas que no lo
 * dan MENOS los que generan las que sí. Un horario que también produce una franja que sí lo da no
 * se oculta.
 *
 * Con la puente vacía devuelve `[]` — y no por un atajo, sino por la regla del comodín: sin filas
 * todas las franjas dan el servicio, así que no queda ninguna del lado a ocultar. El día de la
 * migración nada cambia (D-02). Con `durationMinutes <= 0` devuelve `[]` (entrada degenerada; sin
 * esa guarda el paso de la grilla sería cero y el bucle no terminaría).
 */
export function startTimesNotOffered(
  serviceId: string,
  blocks: BlockWindow[],
  bridge: TimeBlockService[],
  durationMinutes: number,
): string[] {
  if (durationMinutes <= 0) return []
  const offering = blocksForService(serviceId, blocks, bridge)
  const offeringIds = new Set(offering.map((b) => b.id))
  // Los horarios que SÍ se ofrecen: el minuendo que salva los solapes (caso 2 de la trampa).
  const offered = new Set<string>()
  for (const b of offering) {
    for (const hhmm of startTimesOf(b, durationMinutes)) offered.add(hhmm)
  }
  const hidden: string[] = []
  const seen = new Set<string>()
  for (const b of blocks) {
    if (offeringIds.has(b.id)) continue
    for (const hhmm of startTimesOf(b, durationMinutes)) {
      if (offered.has(hhmm) || seen.has(hhmm)) continue
      seen.add(hhmm)
      hidden.push(hhmm)
    }
  }
  return hidden
}

/**
 * Los `service_id` que DECLARA esta franja. Arreglo vacío = franja comodín (D-01).
 *
 * Es la pregunta INVERSA de `blocksForService`: aquélla responde *"¿en qué franjas se da el
 * servicio X?"* (lo que necesita la disponibilidad pública), ésta responde *"¿qué declara la franja
 * Y?"* — lo que necesita el panel de la Phase 19, que pinta la lista de servicios de cada franja.
 * La cabecera de este módulo ya anticipaba a ese consumidor (`:9-10`), y AGENDA-02 prohíbe
 * explícitamente reimplementar la lectura en el componente: un `.filter(r => r.time_block_id ===
 * ...)` inline en el JSX es una SEGUNDA interpretación de la regla del comodín, y dos
 * interpretaciones es exactamente cómo el panel y el motor terminan diciendo cosas distintas sobre
 * la misma franja.
 *
 * ⚠ El `[]` es un estado DECLARADO, no un hueco: la AUSENCIA de filas ES la regla del comodín. No
 * hay sentinel ni columna nullable donde leerlo —las tres columnas de la puente son NOT NULL—, así
 * que "esta franja sirve para todo" se COMPUTA, no se lee. Quien reciba `[]` no está viendo un dato
 * faltante: está viendo la respuesta.
 *
 * Contrato D-16 intacto: no filtra por negocio ni por vigencia. El orden de salida es el orden de
 * `bridge`, estable y sin criterio propio (el panel ordena por su catálogo, no por acá).
 */
export function servicesOfBlock(blockId: string, bridge: TimeBlockService[]): string[] {
  return bridge.filter((r) => r.time_block_id === blockId).map((r) => r.service_id)
}

/**
 * ¿Esta franja es comodín? Sí ⟺ no tiene NINGUNA fila en la puente.
 *
 * Por construcción es `servicesOfBlock(...).length === 0` —y se implementa así, delegando, igual que
 * `isServiceScheduled` se apoya en `blocksForService` (`:116`)— para que las dos respuestas no
 * puedan divergir nunca.
 *
 * ⚠ El matiz que muerde (D-11): mira TODAS las filas, incluidas las de servicios que el negocio
 * tiene DESACTIVADOS y que hoy nadie puede reservar. La columna `active` es de `services`, no de la
 * puente: desactivar un servicio NO borra su mapeo, así que una franja cuyo único mapeo es a un
 * servicio desactivado sigue restringida para el motor. Si esta función filtrara por vigencia, el
 * panel pintaría "Cualquier servicio" sobre una franja que el público ve restringida — o sea, el
 * panel mentiría sobre lo que ve el cliente. Ése es el modo de falla que esta función existe para
 * prevenir, y por eso su firma NO tiene por dónde recibir una noción de vigencia: sólo filas.
 */
export function isBlockWildcard(blockId: string, bridge: TimeBlockService[]): boolean {
  return servicesOfBlock(blockId, bridge).length === 0
}
