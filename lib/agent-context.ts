// ── Mapeo PURO del context endpoint (Phase 6, Plan 01, D-06; horarios migrados en Phase 1/01-02, D-05) ─
// Módulo SIN cliente Supabase ni React: extrae del route handler app/api/agent/context/route.ts la
// transformación time_blocks→hours[] y services→[] al shape EXACTO que espera el bot (HANDOFF del
// whatsapp-ai-agent-kit). El route queda delgado (solo I/O) y el mapeo es testeable con Vitest.

// day_of_week 0..6 → nombre del día. El bot recibe los 7 días con sus rangos (HANDOFF).
export const DAYS = [
  'domingo',
  'lunes',
  'martes',
  'miércoles',
  'jueves',
  'viernes',
  'sábado',
] as const

export interface HoursRange {
  open: string // HH:MM
  close: string // HH:MM
}

export interface DayHours {
  day: string
  ranges: HoursRange[]
}

// Fila cruda de time_blocks (columnas que lee el motor: day_of_week/start_time/end_time). En
// time_blocks NO hay is_open: cada bloque presente = tramo abierto; un día sin bloques = cerrado.
export interface TimeBlockRow {
  day_of_week: number
  start_time: string
  end_time: string
}

/**
 * mapTimeBlocks — agrupa filas de time_blocks por día en el shape del HANDOFF (misma fuente que
 * panel/booking/landing). Devuelve SIEMPRE 7 entradas (domingo..sábado). Cada bloque del día se acumula
 * como un range → múltiples bloques = horario partido. Un día sin bloques queda con ranges:[] (cerrado).
 * Los horarios se recortan a HH:MM (slice(0,5)) porque la DB los guarda como time con segundos.
 */
export function mapTimeBlocks(rows: TimeBlockRow[] | null | undefined): DayHours[] {
  const byDay = new Map<number, HoursRange[]>()
  for (const b of rows ?? []) {
    const arr = byDay.get(b.day_of_week) ?? []
    arr.push({ open: String(b.start_time).slice(0, 5), close: String(b.end_time).slice(0, 5) })
    byDay.set(b.day_of_week, arr)
  }
  return DAYS.map((day, i) => ({ day, ranges: byDay.get(i) ?? [] }))
}

export interface ServiceOut {
  name: string
  durationMinutes: number | null
  price: number | null
  description: string | null
}

// Fila cruda de services (price puede venir como numeric/string de Postgres).
export interface ServiceRow {
  name: string
  duration_minutes: number | null
  price: number | string | null
  description: string | null
}

/**
 * mapServices — mapea filas de services al shape del bot. price se convierte a number (Postgres puede
 * devolver numeric como string); null se preserva como null (tolerante a servicios sin precio).
 */
export function mapServices(rows: ServiceRow[] | null | undefined): ServiceOut[] {
  return (rows ?? []).map((s) => ({
    name: s.name,
    durationMinutes: s.duration_minutes ?? null,
    price: s.price != null ? Number(s.price) : null,
    description: s.description ?? null,
  }))
}
