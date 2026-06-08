import { createAdminClient } from '@/lib/supabase/admin'
import type { NextRequest } from 'next/server'

// Sentinela para el "sin profesional": debe coincidir con el COALESCE del índice 011 para
// que la disponibilidad y la constraint hablen el mismo idioma (cada profesional —y el "sin
// preferencia"— tiene su propia agenda).
const SENTINEL = '00000000-0000-0000-0000-000000000000'

// Disponibilidad pública de un negocio para una fecha (y profesional). El anon NO puede leer
// appointments (RLS), así que la disponibilidad la sirve este endpoint con service role,
// devolviendo SOLO time/status/expires_at — NUNCA datos del cliente (nombre/teléfono/email).
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
    .select('time, status, expires_at, professional_id')
    .eq('business_id', business.id)
    .eq('date', date)
    .in('status', ['confirmed', 'pending_payment'])

  if (error) {
    console.error('[booking/availability] error:', error.message)
    return Response.json({ ok: false, error: 'query_failed' }, { status: 500 })
  }

  // Filtramos por bucket de profesional (coalesce sentinel) y descartamos pending_payment
  // vencidos (seña expirada libera el slot; el cron además los pasa a cancelled). No se
  // expone professional_id en la respuesta.
  const bucket = professionalId && professionalId !== 'none' ? professionalId : SENTINEL
  const nowMs = Date.now()
  const busy = (appts || [])
    .filter(a => (a.professional_id ?? SENTINEL) === bucket)
    .filter(a => a.status === 'confirmed' || a.expires_at == null || new Date(a.expires_at as string).getTime() > nowMs)
    .map(a => ({ time: a.time, status: a.status, expires_at: a.expires_at }))

  return Response.json({ ok: true, busy })
}
