import { createAdminClient } from '@/lib/supabase/admin'
import { getBusinessSecrets, type BusinessSecrets } from '@/lib/business-secrets'
import { sendExpiredHoldEmail } from '@/lib/email'
import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  // Primero traemos los que se van a cancelar CON sus datos, para poder avisar al cliente.
  // Pitfall E: el nested join businesses(...) NO puede traer business_secrets → el join queda
  // con columnas NO secretas (incluye id para keyear los secretos) y los secretos Resend se
  // resuelven aparte con getBusinessSecrets, una sola vez por business_id distinto (abajo).
  const { data: expiring, error: fetchErr } = await supabase
    .from('appointments')
    .select('id, date, time, client_name, client_email, services(name), businesses(id, name, slug, primary_color, logo_url)')
    .eq('status', 'pending_payment')
    .lt('expires_at', new Date().toISOString())

  if (fetchErr) {
    console.error('Cron cancel-expired fetch error:', fetchErr)
    return Response.json({ error: fetchErr.message }, { status: 500 })
  }
  if (!expiring || expiring.length === 0) {
    return Response.json({ cancelled: 0 })
  }

  const ids = expiring.map(a => a.id)
  const { error } = await supabase.from('appointments').update({ status: 'cancelled' }).in('id', ids)
  if (error) {
    console.error('Cron cancel-expired update error:', error)
    return Response.json({ error: error.message }, { status: 500 })
  }

  // Secretos Resend por negocio: el cron itera muchos turnos, así que resolvemos los secretos
  // UNA sola vez por business_id distinto (Map) en vez de una llamada por turno (Pitfall E).
  // getBusinessSecrets los lee de business_secrets (service-role).
  const secretsByBusiness = new Map<string, BusinessSecrets>()
  async function secretsFor(businessId: string): Promise<BusinessSecrets> {
    const cached = secretsByBusiness.get(businessId)
    if (cached) return cached
    const fetched = await getBusinessSecrets(businessId)
    secretsByBusiness.set(businessId, fetched)
    return fetched
  }

  // Aviso al cliente por cada turno cancelado (best-effort, awaiteado; branding del propio
  // negocio del turno → aislamiento por tenant). Un fallo de mail no aborta la cancelación.
  let emailed = 0
  for (const appt of expiring) {
    const business = appt.businesses as unknown as Record<string, string | null> | null
    if (!appt.client_email || !business?.id) continue
    const secrets = await secretsFor(business.id)
    try {
      await sendExpiredHoldEmail({
        to: appt.client_email,
        clientName: appt.client_name,
        service: (appt.services as { name?: string } | null)?.name || '',
        date: appt.date,
        time: appt.time,
        businessName: String(business.name || ''),
        businessSlug: String(business.slug || ''),
        primaryColor: business.primary_color,
        logoUrl: business.logo_url,
        resendApiKey: secrets.resend_api_key,
        resendFrom: secrets.resend_from,
      })
      emailed++
    } catch (e) {
      console.error(`[cancel-expired] email FALLÓ (turno ${appt.id}):`, e instanceof Error ? e.message : e)
    }
  }

  return Response.json({ cancelled: ids.length, emailed })
}
