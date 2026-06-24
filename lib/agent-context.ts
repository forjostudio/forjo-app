// ── Mapeo PURO del context endpoint (Phase 6, Plan 01, D-06) ──────────────────────────────────────
// Módulo SIN cliente Supabase ni React: extrae del route handler app/api/agent/context/route.ts la
// transformación business_hours→hours[] y services→[] al shape EXACTO que espera el bot (HANDOFF del
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

// Fila cruda de business_hours (columnas day_of_week/open_time/close_time/is_open).
export interface BusinessHourRow {
  day_of_week: number
  open_time: string | null
  close_time: string | null
  is_open: boolean
}

/**
 * mapBusinessHours — agrupa filas de business_hours por día en el shape del HANDOFF.
 * Devuelve SIEMPRE 7 entradas (domingo..sábado). Una fila con is_open=false o sin open/close se
 * ignora (ese día queda con ranges:[]). Los horarios se recortan a HH:MM (slice(0,5)) porque la DB
 * los guarda como time con segundos.
 */
export function mapBusinessHours(rows: BusinessHourRow[] | null | undefined): DayHours[] {
  const byDay = new Map<number, HoursRange[]>()
  for (const h of rows ?? []) {
    if (!h.is_open || !h.open_time || !h.close_time) continue
    const arr = byDay.get(h.day_of_week) ?? []
    arr.push({ open: String(h.open_time).slice(0, 5), close: String(h.close_time).slice(0, 5) })
    byDay.set(h.day_of_week, arr)
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
