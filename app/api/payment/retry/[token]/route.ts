import { createAdminClient } from '@/lib/supabase/admin'
import { createDepositPreference } from '@/lib/payment'
import { getBusinessSecrets } from '@/lib/business-secrets'
import type { NextRequest } from 'next/server'

// Retry de pago de seña por TOKEN (link "Completar pago" del email de seña pendiente).
// Resuelve el turno SOLO por cancel_token (impredecible) → no se confía en ningún id del
// cliente. Re-genera la preferencia de MP y redirige al checkout. Si el turno ya no está
// pendiente o venció, manda a la página pública del negocio.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://gestion.forjo.studio'
  const supabase = createAdminClient()

  // El join embebido trae SOLO columnas no secretas del negocio (en vez del viejo join-estrella
  // que arrastraba mp_access_token): los secretos vienen aparte de business_secrets (Pitfall E).
  const { data: appt } = await supabase
    .from('appointments')
    .select('*, services(name, price), businesses(id, name, slug, deposit_amount, deposit_expiry_hours)')
    .eq('cancel_token', token)
    .single()

  const business = appt?.businesses as {
    id?: string; slug?: string; name?: string
    deposit_amount?: number | null; deposit_expiry_hours?: number | null
  } | null

  // Token inválido / sin negocio → al home.
  if (!appt || !business || !business.id) {
    return Response.redirect(`${baseUrl}/`, 302)
  }

  const slug = business.slug || ''

  // Solo se paga lo que está pendiente y no venció. Ya confirmado / cancelado / vencido →
  // no hay nada que pagar: a la página del negocio.
  const expired = appt.expires_at != null && new Date(appt.expires_at as string).getTime() <= Date.now()
  if (appt.status !== 'pending_payment' || expired) {
    return Response.redirect(`${baseUrl}/${slug}`, 302)
  }

  // Secretos MP desde business_secrets (fallback transitorio a businesses pre-028) — D-01/D-02.
  const secrets = await getBusinessSecrets(business.id)

  const result = await createDepositPreference(appt, {
    id: business.id,
    name: business.name || '',
    slug,
    deposit_amount: business.deposit_amount ?? null,
    deposit_expiry_hours: business.deposit_expiry_hours ?? null,
    mp_access_token: secrets.mp_access_token,
    mp_refresh_token: secrets.mp_refresh_token,
    mp_token_expires_at: secrets.mp_token_expires_at,
  })
  if (!result.ok) {
    return Response.redirect(`${baseUrl}/${slug}/pago/fallido`, 302)
  }
  return Response.redirect(result.url, 302)
}
