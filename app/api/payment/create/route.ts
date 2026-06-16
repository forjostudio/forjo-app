import { createAdminClient } from '@/lib/supabase/admin'
import { createDepositPreference } from '@/lib/payment'
import { getBusinessSecrets } from '@/lib/business-secrets'
import type { NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { appointmentId, businessSlug } = await request.json()
    if (!appointmentId || !businessSlug) {
      return Response.json({ ok: false, error: 'Faltan datos' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // Columnas NO secretas explícitas para armar la preferencia (en vez del viejo select-estrella).
    const { data: business } = await supabase
      .from('businesses')
      .select('id, name, slug, deposit_amount, deposit_expiry_hours')
      .eq('slug', businessSlug)
      .single()
    if (!business) {
      return Response.json({ ok: false, error: 'Negocio no encontrado' }, { status: 404 })
    }

    // Secretos MP desde business_secrets (fallback transitorio a businesses pre-028) — D-01/D-02.
    const secrets = await getBusinessSecrets(business.id)

    const { data: appt } = await supabase
      .from('appointments')
      .select('*, services(name, price)')
      .eq('id', appointmentId)
      .single()
    if (!appt) {
      return Response.json({ ok: false, error: 'Turno no encontrado' }, { status: 404 })
    }

    // La preferencia MP la arma la lib compartida (misma lógica que el retry por email).
    // BusinessForDeposit = columnas no secretas de business + tokens MP de business_secrets.
    const result = await createDepositPreference(appt, {
      id: business.id,
      name: business.name,
      slug: business.slug,
      deposit_amount: business.deposit_amount,
      deposit_expiry_hours: business.deposit_expiry_hours,
      mp_access_token: secrets.mp_access_token,
      mp_refresh_token: secrets.mp_refresh_token,
      mp_token_expires_at: secrets.mp_token_expires_at,
    })
    if (!result.ok) {
      return Response.json({ ok: false, error: result.error }, { status: result.status })
    }
    return Response.json({ ok: true, url: result.url })
  } catch (e: unknown) {
    console.error('Payment create error:', e)
    return Response.json({ ok: false, error: e instanceof Error ? e.message : 'Error' }, { status: 500 })
  }
}
