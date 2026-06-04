import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { mpFetch } from '@/lib/mercadopago'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'No autenticado' }, { status: 401 })

  const { data: business } = await supabase
    .from('businesses')
    .select('id, mp_subscription_id')
    .eq('owner_id', user.id)
    .single()
  if (!business) return Response.json({ error: 'Negocio no encontrado' }, { status: 404 })
  if (!business.mp_subscription_id) return Response.json({ error: 'Sin suscripción activa' }, { status: 400 })

  // Cancel in MercadoPago (mpFetch uses the platform token per MP_MODE).
  const result = await mpFetch(`/preapproval/${business.mp_subscription_id}`, {
    method: 'PUT',
    body: JSON.stringify({ status: 'cancelled' }),
  })

  // Do NOT write state optimistically: only drop plan_status once MP confirms the
  // preapproval is actually cancelled. A failed PUT returns an error object (HTTP
  // status code as a number / message), never status: 'cancelled'.
  if (result?.status !== 'cancelled') {
    console.error('MP cancel error:', JSON.stringify(result))
    return Response.json({ error: 'No se pudo cancelar en MercadoPago. Intentá de nuevo.' }, { status: 502 })
  }

  // Keep plan active until subscription_ends_at; just mark cancelled
  const admin = createAdminClient()
  await admin.from('businesses').update({ plan_status: 'cancelled' }).eq('id', business.id)

  return Response.json({ ok: true })
}
