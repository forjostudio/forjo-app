import { createClient } from '@/lib/supabase/server'
import { negocioDelDueno } from '@/lib/negocio-del-dueno'

// Limpieza manual de reservas con seña vencida/abandonada, disparada por el DUEÑO desde
// Settings. Equivale a lo que hace el cron cancel-expired, pero acotado al negocio del
// dueño logueado. Auth + ownership: sesión vía cliente que respeta RLS; la policy
// "business member access" ya aísla por tenant, y además filtramos explícito por
// business_id (defensa en profundidad). Solo cancela pending_payment:
//   - con seña vencida (expires_at < now), o
//   - abandonadas antes de iniciar el pago (expires_at NULL y creadas hace > 1h, para no
//     tocar una reserva recién hecha que todavía no seteó expires_at).
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ ok: false, error: 'No autenticado' }, { status: 401 })

  // negocioDelDueno (quick 261124-ubl) en vez del single de PostgREST: con dos negocios del mismo
  // dueño el single daba error y la ruta respondía como si no tuviera negocio. Elige siempre el más
  // viejo, el mismo que muestra el panel. «Falló la lectura» no es «no tenés negocio».
  const negocio = await negocioDelDueno(supabase, user.id, 'id')
  if (!negocio.ok) {
    if (negocio.reason === 'sin-negocio') return Response.json({ ok: false, error: 'Sin negocio' }, { status: 403 })
    return Response.json({ ok: false, error: 'read_failed' }, { status: 500 })
  }
  const business = negocio.business

  const nowIso = new Date().toISOString()
  const hourAgoIso = new Date(Date.now() - 60 * 60 * 1000).toISOString()

  // Vencidas (con expires_at en el pasado).
  const { data: expired, error: expiredErr } = await supabase
    .from('appointments')
    .update({ status: 'cancelled' })
    .eq('business_id', business.id)
    .eq('status', 'pending_payment')
    .lt('expires_at', nowIso)
    .select('id')

  // Abandonadas antes de iniciar el pago (sin expires_at, creadas hace más de 1h).
  const { data: abandoned, error: abandonedErr } = await supabase
    .from('appointments')
    .update({ status: 'cancelled' })
    .eq('business_id', business.id)
    .eq('status', 'pending_payment')
    .is('expires_at', null)
    .lt('created_at', hourAgoIso)
    .select('id')

  if (expiredErr || abandonedErr) {
    console.error('[cleanup-expired] error:', expiredErr?.message || abandonedErr?.message)
    return Response.json({ ok: false, error: 'cleanup_failed' }, { status: 500 })
  }

  const cancelled = (expired?.length ?? 0) + (abandoned?.length ?? 0)
  return Response.json({ ok: true, cancelled })
}
