import { createClient } from '@/lib/supabase/server'
import { negocioDelDueno } from '@/lib/negocio-del-dueno'

// Lightweight read-only endpoint for the post-checkout return screen to poll
// while it waits for the MercadoPago webhook to flip the business to 'active'.
// It does NOT write anything — the webhook remains the single source of truth.
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'No autenticado' }, { status: 401 })

  // negocioDelDueno (quick 261124-ubl) en vez del single de PostgREST: con dos negocios del mismo
  // dueño el single daba error y la ruta respondía como si no tuviera negocio. Elige siempre el más
  // viejo, el mismo que muestra el panel. «Falló la lectura» no es «no tenés negocio».
  const negocio = await negocioDelDueno(supabase, user.id, 'plan_status')
  if (!negocio.ok) {
    if (negocio.reason === 'sin-negocio') return Response.json({ error: 'Negocio no encontrado' }, { status: 404 })
    return Response.json({ error: 'No pudimos leer tu negocio. Probá de nuevo.' }, { status: 500 })
  }
  const business = negocio.business

  return Response.json({ plan_status: business.plan_status ?? 'trial' })
}
