import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { mpFetch } from '@/lib/mercadopago'
import { getSubscriptionPlan, FORJO_APP_URL } from '@/lib/subscription-plans'
import type { NextRequest } from 'next/server'

const VALID = ['basic', 'studio', 'pro']

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'No autenticado' }, { status: 401 })

  let body: { plan?: string }
  try { body = await request.json() } catch { return Response.json({ error: 'JSON inválido' }, { status: 400 }) }

  const plan = body.plan
  if (!plan || !VALID.includes(plan)) return Response.json({ error: 'Plan inválido' }, { status: 400 })

  const { data: business } = await supabase
    .from('businesses')
    .select('id, name, plan_status, mp_subscription_id, mp_plan_id_active')
    .eq('owner_id', user.id)
    .single()
  if (!business) return Response.json({ error: 'Negocio no encontrado' }, { status: 404 })

  // Idempotent retry guard: if the business is already active with a live
  // subscription, do NOT create another preapproval. Any other state (trial,
  // pending, cancelled, expired) falls through and generates a fresh preapproval,
  // so a rejected first attempt retries automatically — no manual SQL reset.
  if (business.plan_status === 'active' && business.mp_subscription_id) {
    return Response.json({ ok: false, error: 'Ya tenés una suscripción activa.' })
  }

  const planConfig = getSubscriptionPlan(plan)

  // Un preapproval_plan POR NEGOCIO, y el dueño paga desde el link del plan (mismo patrón que
  // webs-cms, probado en sandbox el 2026-10-26). Por qué un plan y no una preapproval: la
  // preapproval exige payer_email y tiene que coincidir con la cuenta de MP que paga, que muchas
  // veces no es la del panel ("Tu e-mail no coincide con el de la suscripción"). En el link del plan
  // el dueño entra con la cuenta que quiera. La suscripción que nace ahí NO trae external_reference:
  // el webhook reconoce al negocio por mp_plan_id_active.
  //
  // Se reusa el plan del negocio si sigue activo y es del monto elegido (alguien que abrió el link y
  // volvió sin pagar). Si eligió otro tier, plan nuevo.
  let mpPlan = business.mp_plan_id_active
    ? await mpFetch(`/preapproval_plan/${business.mp_plan_id_active}`)
    : null
  const reusable =
    mpPlan?.init_point &&
    mpPlan.status === 'active' &&
    mpPlan.auto_recurring?.transaction_amount === planConfig.price_ars

  if (!reusable) {
    mpPlan = await mpFetch('/preapproval_plan', {
      method: 'POST',
      body: JSON.stringify({
        reason: `Forjo Gestión — Plan ${planConfig.name}`,
        back_url: `${FORJO_APP_URL}/dashboard?subscription=success`,
        auto_recurring: {
          frequency: 1,
          frequency_type: 'months',
          transaction_amount: planConfig.price_ars,
          currency_id: 'ARS',
        },
      }),
    })
    if (!mpPlan?.id || !mpPlan?.init_point) {
      console.error('[subscription/create] MP preapproval_plan error:', JSON.stringify(mpPlan))
      return Response.json({ error: 'Error al crear la suscripción en MercadoPago' }, { status: 500 })
    }
    // mp_plan_id_active es columna admin (migr. 080: el trigger la revierte para el dueño), así que
    // va con service role — RLS ya confirmó arriba que el negocio es de esta sesión.
    const { error } = await createAdminClient()
      .from('businesses')
      .update({ mp_plan_id_active: mpPlan.id })
      .eq('id', business.id)
    if (error) {
      console.error('[subscription/create] no se guardó mp_plan_id_active:', error.message)
      return Response.json({ error: 'Error al iniciar la suscripción' }, { status: 500 })
    }
  }

  // Guardar el id del PLAN no es estado de pago: NO se escribe plan_status ni mp_subscription_id.
  // El negocio sigue en 'trial' hasta que el webhook confirma la suscripción `authorized`.
  return Response.json({ ok: true, init_point: mpPlan.init_point })
}
