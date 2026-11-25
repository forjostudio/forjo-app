import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { negocioDelDueno } from '@/lib/negocio-del-dueno'

// Desconecta MercadoPago: limpia el token y los datos de la conexión OAuth del negocio.
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })

  // Resolver el business_id del dueño para nullear sus secretos en business_secrets.
  // negocioDelDueno (quick 261124-ubl) en vez del single de PostgREST: con el single, un dueño con dos
  // negocios recibía 404. Elige siempre el más viejo, el mismo que muestra el panel. «Falló la lectura»
  // no es «no tenés negocio»: 500 read_failed.
  const negocio = await negocioDelDueno(supabase, user.id, 'id')
  if (!negocio.ok) {
    if (negocio.reason === 'sin-negocio') return NextResponse.json({ ok: false }, { status: 404 })
    return NextResponse.json({ ok: false, error: 'read_failed' }, { status: 500 })
  }
  const biz = negocio.business

  // mp_user_id NO es secreto → se queda en businesses; lo nulleamos como flag de desconexión.
  // Acotado por el id del negocio resuelto Y por owner_id: con sólo owner_id, a un dueño con dos
  // negocios se le desconectaban LOS DOS (quick 261124-ubl). owner_id queda como defensa en profundidad
  // (molde: app/api/mercadopago/callback/route.ts).
  const { error: bizErr } = await supabase
    .from('businesses')
    .update({ mp_user_id: null })
    .eq('id', biz.id)
    .eq('owner_id', user.id)
  if (bizErr) return NextResponse.json({ ok: false }, { status: 500 })

  // Los 3 secretos MP viven en business_secrets (027) → upsert nulleándolos (owner RLS, Pitfall F).
  const { error: secErr } = await supabase
    .from('business_secrets')
    .upsert({
      business_id: biz.id,
      mp_access_token: null,
      mp_refresh_token: null,
      mp_token_expires_at: null,
    }, { onConflict: 'business_id' })
  if (secErr) return NextResponse.json({ ok: false }, { status: 500 })

  return NextResponse.json({ ok: true })
}
