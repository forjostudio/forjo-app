import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Desconecta MercadoPago: limpia el token y los datos de la conexión OAuth del negocio.
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })

  // Resolver el business_id del dueño para nullear sus secretos en business_secrets.
  const { data: biz } = await supabase
    .from('businesses')
    .select('id')
    .eq('owner_id', user.id)
    .single()
  if (!biz) return NextResponse.json({ ok: false }, { status: 404 })

  // mp_user_id NO es secreto → se queda en businesses; lo nulleamos como flag de desconexión.
  const { error: bizErr } = await supabase
    .from('businesses')
    .update({ mp_user_id: null })
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
