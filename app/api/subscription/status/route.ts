import { createClient } from '@/lib/supabase/server'

// Lightweight read-only endpoint for the post-checkout return screen to poll
// while it waits for the MercadoPago webhook to flip the business to 'active'.
// It does NOT write anything — the webhook remains the single source of truth.
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'No autenticado' }, { status: 401 })

  const { data: business } = await supabase
    .from('businesses')
    .select('plan_status')
    .eq('owner_id', user.id)
    .single()
  if (!business) return Response.json({ error: 'Negocio no encontrado' }, { status: 404 })

  return Response.json({ plan_status: business.plan_status ?? 'trial' })
}
