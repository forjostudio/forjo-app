import { createAdminClient } from '@/lib/supabase/admin'
import type { NextRequest } from 'next/server'

// Cancelación pública por TOKEN (no por id). El token impredecible resuelve el turno y su
// negocio → no confiamos en ningún parámetro del cliente para el aislamiento por tenant.
// service role es server-only (este route handler). RLS no aplica acá, así que el filtro
// por cancel_token (+ id) es la única autorización.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!token) return Response.json({ ok: false, reason: 'invalid' }, { status: 400 })

  const supabase = createAdminClient()

  const { data: appt } = await supabase
    .from('appointments')
    .select('id, date, status')
    .eq('cancel_token', token)
    .single()

  // Sin token válido → no se cancela nada (ni se revela si existe).
  if (!appt) return Response.json({ ok: false, reason: 'not_found' }, { status: 404 })

  if (appt.status === 'cancelled') {
    return Response.json({ ok: false, reason: 'already_cancelled' })
  }

  const todayStr = new Date().toISOString().slice(0, 10)
  if (appt.date < todayStr) {
    return Response.json({ ok: false, reason: 'past' })
  }

  // Cancelar = status 'cancelled' → libera el horario (la disponibilidad excluye cancelled).
  const { error } = await supabase
    .from('appointments')
    .update({ status: 'cancelled' })
    .eq('id', appt.id)
    .eq('cancel_token', token)

  if (error) {
    console.error(`[cancel] error cancelando turno ${appt.id}:`, error.message)
    return Response.json({ ok: false, reason: 'error' }, { status: 500 })
  }

  console.log(`[cancel] turno ${appt.id} cancelado vía token`)
  return Response.json({ ok: true })
}
