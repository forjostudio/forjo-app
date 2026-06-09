import { createAdminClient } from '@/lib/supabase/admin'

const MP_API = 'https://api.mercadopago.com'

interface ApptForDeposit {
  id: string
  client_name: string
  client_email: string | null
  services?: unknown
}

interface BusinessForDeposit {
  name: string
  slug: string
  mp_access_token: string | null
  deposit_amount: number | null
  deposit_expiry_hours: number | null
}

type PreferenceResult =
  | { ok: true; url: string }
  | { ok: false; error: string; status: number }

// Crea la preferencia de checkout de MercadoPago para la seña de un turno y deja el turno
// con expires_at + deposit_amount. Devuelve el init_point. Compartido por el alta del pago
// (cliente) y el retry por link de email. Usa el token MP propio del negocio. NO escribe
// estado de pago optimista: el turno sigue pending_payment hasta que el webhook confirme.
export async function createDepositPreference(
  appt: ApptForDeposit,
  business: BusinessForDeposit
): Promise<PreferenceResult> {
  if (!business.mp_access_token) {
    return { ok: false, error: 'El negocio no tiene MercadoPago configurado', status: 400 }
  }
  const amount = Number(business.deposit_amount)
  if (!amount || amount <= 0) {
    return { ok: false, error: 'El monto de la seña no es válido', status: 400 }
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://gestion.forjo.studio'
  const expiryHours = Number(business.deposit_expiry_hours) || 1
  const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000)
  const serviceName = (appt.services as { name?: string } | null)?.name || 'Servicio'
  const descriptor = business.name
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, '')
    .substring(0, 22) || 'FORJO'

  const mpRes = await fetch(`${MP_API}/checkout/preferences`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${business.mp_access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      items: [{
        title: `Seña — ${serviceName} · ${business.name}`,
        quantity: 1,
        unit_price: amount,
        currency_id: 'ARS',
      }],
      payer: {
        name: appt.client_name,
        email: appt.client_email || 'cliente@forjo.studio',
      },
      back_urls: {
        success: `${baseUrl}/${business.slug}/pago/exitoso`,
        failure: `${baseUrl}/${business.slug}/pago/fallido`,
        pending: `${baseUrl}/${business.slug}/pago/pendiente`,
      },
      auto_return: 'approved',
      notification_url: `${baseUrl}/api/payment/webhook/${business.slug}`,
      external_reference: String(appt.id),
      statement_descriptor: descriptor,
      expires: true,
      expiration_date_to: expiresAt.toISOString(),
    }),
  })

  const preference = await mpRes.json()
  if (!preference.init_point) {
    console.error('MP preference error:', JSON.stringify(preference))
    return { ok: false, error: 'Error al crear el pago en MercadoPago', status: 500 }
  }

  // Sella la ventana de la seña en el turno (no escribe estado de pago).
  const supabase = createAdminClient()
  await supabase
    .from('appointments')
    .update({ expires_at: expiresAt.toISOString(), deposit_amount: amount })
    .eq('id', appt.id)

  return { ok: true, url: preference.init_point }
}
