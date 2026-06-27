import { createAdminClient } from '@/lib/supabase/admin'
import type { NextRequest } from 'next/server'

// Disponibilidad SIEMPRE fresca: nunca cachear (ni framework ni CDN ni browser). Un turno
// recién tomado tiene que verse ocupado en la próxima consulta.
export const dynamic = 'force-dynamic'

// Sentinela para el "sin profesional": debe coincidir con el COALESCE del índice 011 para
// que la disponibilidad y la constraint hablen el mismo idioma (cada profesional —y el "sin
// preferencia"— tiene su propia agenda).
const SENTINEL = '00000000-0000-0000-0000-000000000000'

// Disponibilidad pública de un negocio para una fecha (y profesional). El anon NO puede leer
// appointments (RLS), así que la disponibilidad la sirve este endpoint con service role,
// devolviendo solo time/status/expires_at/duration_minutes (la duración hace falta para el
// cálculo de solapamiento; NO es dato del cliente) — NUNCA nombre/teléfono/email del cliente.
// Lookup por slug → aislamiento por tenant.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const slug = searchParams.get('slug') || ''
  const date = searchParams.get('date') || ''
  const professionalId = searchParams.get('professionalId') // ausente/'none' = sin preferencia
  if (!slug || !date) {
    return Response.json({ ok: false, error: 'missing_params' }, { status: 400 })
  }

  const supabase = createAdminClient()

  const { data: business } = await supabase
    .from('businesses')
    .select('id')
    .eq('slug', slug)
    .single()
  if (!business) return Response.json({ ok: false, error: 'not_found' }, { status: 404 })

  // Turnos que ocupan slots: confirmed + pending_payment (consistente con el índice 011).
  const { data: appts, error } = await supabase
    .from('appointments')
    .select('time, status, expires_at, professional_id, duration_minutes')
    .eq('business_id', business.id)
    .eq('date', date)
    .in('status', ['confirmed', 'pending_payment'])

  if (error) {
    console.error('[booking/availability] error:', error.message)
    return Response.json({ ok: false, error: 'query_failed' }, { status: 500 })
  }

  // Capacity por slot: vive en la plantilla semanal (time_blocks), no en el turno. Se resuelve
  // por slot vía day_of_week (de la `date` consultada) + ventana [start_time, end_time). MISMA
  // convención de dow que EXTRACT(dow) de la DB y que book_slot_atomic: new Date('yyyy-MM-dd')
  // parsea a medianoche UTC → getUTCDay() (0=domingo..6=sábado) coincide con la DB.
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay()
  const { data: capBlocks } = await supabase
    .from('time_blocks')
    .select('start_time, end_time, capacity')
    .eq('business_id', business.id)
    .eq('day_of_week', dow)

  // capacityFor(time): MAX de la capacity de los bloques cuya ventana cubre el slot (consistente
  // con el COALESCE(MAX(tb.capacity), 1) del RPC). Sin bloque que lo cubra → 1 (individual).
  const toMin = (t: string) => {
    const [h, m] = t.split(':')
    return Number(h) * 60 + Number(m)
  }
  const capacityFor = (time: string) => {
    const tMin = toMin(time)
    let cap = 0
    for (const b of capBlocks || []) {
      if (toMin(b.start_time) <= tMin && tMin < toMin(b.end_time)) {
        cap = Math.max(cap, Number(b.capacity) || 1)
      }
    }
    return cap || 1
  }

  // Filtramos por bucket de profesional (coalesce sentinel) y descartamos pending_payment
  // vencidos (seña expirada libera el slot; el cron además los pasa a cancelled). No se
  // expone professional_id en la respuesta.
  const bucket = professionalId && professionalId !== 'none' ? professionalId : SENTINEL
  const nowMs = Date.now()
  const live = (appts || [])
    .filter(a => (a.professional_id ?? SENTINEL) === bucket)
    .filter(a => a.status === 'confirmed' || a.expires_at == null || new Date(a.expires_at as string).getTime() > nowMs)

  const busy = live.map(a => ({ time: a.time, status: a.status, expires_at: a.expires_at, duration_minutes: a.duration_minutes }))

  // Ocupación por slot vs capacity → `full` (solo la lista de horarios llenos). MISMO bucket y
  // mismo descarte de holds vencidos que `busy`. D-06 (LOCKED): el público SOLO recibe libre/lleno;
  // NUNCA el conteo de ocupantes, ni los lugares restantes, ni una entrada por inscripto que
  // permita inferirlos. Por eso el conteo por horario colapsa a un booleano por slot
  // (count >= capacity) y jamás se serializa. Para capacity=1, `full` y `busy` coinciden.
  const countByTime = new Map<string, number>()
  for (const a of live) countByTime.set(a.time, (countByTime.get(a.time) ?? 0) + 1)
  const full = [...countByTime.entries()]
    .filter(([time, n]) => n >= capacityFor(time))
    .map(([time]) => time)

  return Response.json({ ok: true, busy, full }, { headers: { 'Cache-Control': 'no-store' } })
}
