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

  // Cancel in MercadoPago
  await mpFetch(`/preapproval/${business.mp_subscription_id}`, {
    method: 'PUT',
    body: JSON.stringify({ status: 'cancelled' }),
  })

  // Keep plan active until subscription_ends_at; just mark cancelled
  const admin = createAdminClient()
  await admin.from('businesses').update({ plan_status: 'cancelled' }).eq('id', business.id)

  return Response.json({ ok: true })
}
