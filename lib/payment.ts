import { createAdminClient } from '@/lib/supabase/admin'
import { refreshMpToken } from '@/lib/mercadopago'

const MP_API = 'https://api.mercadopago.com'

interface ApptForDeposit {
  id: string
  client_name: string
  client_email: string | null
  services?: unknown
}

// Los secretos MP (access/refresh/expires) vienen de business_secrets (vía getBusinessSecrets
// en el caller) — D-01/D-02. El caller resuelve los campos no secretos de businesses
// (id, name, slug, deposit_*) y los mezcla con los mp_* de business_secrets.
interface BusinessForDeposit {
  id: string
  name: string
  slug: string
  mp_access_token: string | null
  mp_refresh_token?: string | null
  mp_token_expires_at?: string | null
  deposit_amount: number | null
  deposit_expiry_hours: number | null
}

interface MpTokenBusiness {
  id: string
  mp_access_token: string | null
  mp_refresh_token?: string | null
  mp_token_expires_at?: string | null
}

// Devuelve un access_token válido del negocio (MercadoPago Connect), refrescándolo si vence en
// menos de 24 h. Persiste el nuevo token + el refresh rotado + la expiración en business_secrets
// (NO en businesses): MP rota el refresh token en cada uso, así que este write es load-bearing —
// si quedara apuntando a businesses, tras el drop de 028 la próxima rotación se perdería (T-01-07).
// Para tokens cargados a mano (sin refresh_token) devuelve el actual tal cual. Si el refresh falla,
// también cae al token actual (best-effort, no rompe el cobro).
export async function getValidMpAccessToken(business: MpTokenBusiness): Promise<string | null> {
  const current = business.mp_access_token
  if (!business.mp_refresh_token) return current
  const expMs = business.mp_token_expires_at ? new Date(business.mp_token_expires_at).getTime() : 0
  if (expMs && expMs > Date.now() + 24 * 60 * 60 * 1000) return current

  const refreshed = await refreshMpToken(business.mp_refresh_token)
  if (!refreshed?.access_token) {
    console.error(`[mp] refresh falló (negocio ${business.id}); uso el token actual`)
    return current
  }
  const newExpiresAt = refreshed.expires_in ? new Date(Date.now() + refreshed.expires_in * 1000).toISOString() : null
  const supabase = createAdminClient()
  // Escritura de la rotación a business_secrets keyed por business_id (NO businesses).
  await supabase
    .from('business_secrets')
    .update({
      mp_access_token: refreshed.access_token,
      mp_refresh_token: refreshed.refresh_token ?? business.mp_refresh_token,
      mp_token_expires_at: newExpiresAt,
    })
    .eq('business_id', business.id)
  console.log(`[mp] access_token refrescado (negocio ${business.id})`)
  return refreshed.access_token
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
  // business.mp_access_token (+ refresh/expires) llega resuelto desde business_secrets vía el
  // caller (getBusinessSecrets) — D-01. El armado de la preferencia MP queda intacto
  // (esto NO es la fase de endurecimiento de firma — Fase 2).
  if (!business.mp_access_token) {
    return { ok: false, error: 'El negocio no tiene MercadoPago configurado', status: 400 }
  }
  const amount = Number(business.deposit_amount)
  if (!amount || amount <= 0) {
    return { ok: false, error: 'El monto de la seña no es válido', status: 400 }
  }
  // Token válido (refresca si el de OAuth está por vencer; el manual pasa de largo).
  const accessToken = await getValidMpAccessToken(business)
  if (!accessToken) {
    return { ok: false, error: 'El negocio no tiene MercadoPago configurado', status: 400 }
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
      Authorization: `Bearer ${accessToken}`,
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
