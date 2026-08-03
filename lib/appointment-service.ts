// ── Servicio de un turno en el historial (HIST-03, D-05) ────────────────────────────────────
// Fuente ÚNICA de verdad del fallback **snapshot → join** para el nombre y el precio del servicio
// de un turno (y del nombre del servicio de un abono). Antes de esta capa el mismo ternario vivía
// duplicado a mano en Finanzas, el CSV, el Dashboard, la ficha del cliente, Turnos y Abonos: migrar
// una copia y olvidarse de otra no se ve como un error, se ve como "el gráfico bajó".
//
// Por qué existe: desde la migración 065 `services` se puede BORRAR de verdad. El FK quedó en
// `ON DELETE SET NULL`, así que el join a `services` de un turno viejo puede venir vacío. Lo que
// sostiene la historia es el SNAPSHOT (`appointments.service_name` / `appointments.service_price`,
// `abonos.service_name`), que escribe el trigger `appointments_service_snapshot_trg` /
// `abonos_service_snapshot_trg` en el INSERT y no se refresca nunca (D-03: es una foto inmutable,
// no un espejo). El join queda de RED DE SEGURIDAD por si un snapshot quedó en NULL.
//
// Funciones PURAS: sin React ni Supabase → se consumen igual desde Server Components, Client
// Components y route handlers, y se testean sin base (test/appointment-service.test.ts).
//
// Regla dura: las cadenas de fallback usan SIEMPRE el operador nullish `??`, NUNCA `||`. Con `||`
// un precio 0 legítimo (un servicio gratis, una consulta bonificada) colapsa con `null` y el turno
// pasa a facturar el precio ACTUAL del servicio — ése era el bug de la versión inline.
//
// El mismo `apptServiceName` sirve para las filas de `abonos` (misma forma estructural: columna
// `service_name` + embed `services(name)`). NO crear un segundo helper para eso.

/**
 * Subconjunto mínimo de una fila con snapshot de servicio. Es un tipo ESTRUCTURAL a propósito: lo
 * cumplen tanto un `Appointment` completo como las filas acotadas que devuelve PostgREST en
 * Finanzas (`select('service_price, services(price)')`) y las filas de `abonos`.
 *
 * `service_price` admite `string` porque un `numeric` de PostgreSQL puede llegar serializado como
 * string por PostgREST según el driver/versión.
 */
export type ServiceSnapshotRow = {
  service_name?: string | null
  service_price?: number | string | null
  services?: { name?: string | null; price?: number | string | null } | null
}

/**
 * Nombre del servicio para mostrar: snapshot primero, join de fallback, y recién ahí el literal.
 * El `fallback` por defecto es el guion largo que ya usaba el historial.
 */
export function apptServiceName(row: ServiceSnapshotRow, fallback = '—'): string {
  return row.service_name ?? row.services?.name ?? fallback
}

/**
 * Precio del servicio, o `null` si no hay ninguno. Para los renders que distinguen "sin precio"
 * de "$0" (la tabla de Turnos muestra "—" en el primer caso).
 *
 * `??` y no `||`: un `service_price = 0` es un precio válido y tiene que ganarle al join.
 */
export function apptServicePriceOrNull(row: ServiceSnapshotRow): number | null {
  const raw = row.service_price ?? row.services?.price ?? null
  if (raw === null || raw === undefined) return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

/** Precio del servicio para sumar/mostrar; sin precio = 0 (mismo contrato que los reduces viejos). */
export function apptServicePrice(row: ServiceSnapshotRow): number {
  return apptServicePriceOrNull(row) ?? 0
}
