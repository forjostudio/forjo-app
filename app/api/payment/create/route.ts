import { createAdminClient } from '@/lib/supabase/admin'
import { createDepositPreference } from '@/lib/payment'
import type { NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { appointmentId, businessSlug } = await request.json()
    if (!appointmentId || !businessSlug) {
      return Response.json({ ok: false, error: 'Faltan datos' }, { status: 400 })
    }

    const supabase = createAdminClient()

    const { data: business } = await supabase
      .from('businesses')
      .select('*')
      .eq('slug', businessSlug)
      .single()
    if (!business) {
      return Response.json({ ok: false, error: 'Negocio no encontrado' }, { status: 404 })
    }

    const { data: appt } = await supabase
      .from('appointments')
      .select('*, services(name, price)')
      .eq('id', appointmentId)
      .single()
    if (!appt) {
      return Response.json({ ok: false, error: 'Turno no encontrado' }, { status: 404 })
    }

    // La preferencia MP la arma la lib compartida (misma lógica que el retry por email).
    const result = await createDepositPreference(appt, business)
    if (!result.ok) {
      return Response.json({ ok: false, error: result.error }, { status: result.status })
    }
    return Response.json({ ok: true, url: result.url })
  } catch (e: unknown) {
    console.error('Payment create error:', e)
    return Response.json({ ok: false, error: e instanceof Error ? e.message : 'Error' }, { status: 500 })
  }
}
