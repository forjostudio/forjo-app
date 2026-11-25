import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { negocioDelDueno } from '@/lib/negocio-del-dueno'
import { revokeToken } from '@/lib/google-calendar'
import { getBusinessSecrets } from '@/lib/business-secrets'

// Desconecta Google Calendar: revoca el token en Google (best-effort) y lo borra del negocio.
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })

  // Resolver el business_id del dueño.
  // negocioDelDueno (quick 261124-ubl) en vez del single de PostgREST: con dos negocios del mismo
  // dueño el single daba error y la ruta respondía como si no tuviera negocio. Elige siempre el más
  // viejo, el mismo que muestra el panel. «Falló la lectura» no es «no tenés negocio».
  const negocio = await negocioDelDueno(supabase, user.id, 'id')
  if (!negocio.ok) {
    if (negocio.reason === 'sin-negocio') return NextResponse.json({ ok: false }, { status: 404 })
    return NextResponse.json({ ok: false, error: 'read_failed' }, { status: 500 })
  }
  const biz = negocio.business

  // El refresh token vive en business_secrets (027). Lo leemos server-side (service role) para
  // el revoke best-effort; nunca viaja al cliente.
  const secrets = await getBusinessSecrets(biz.id)
  if (secrets.google_refresh_token) await revokeToken(secrets.google_refresh_token)

  // Nulleamos el secreto en business_secrets vía session client (owner RLS, Pitfall F).
  const { error } = await supabase
    .from('business_secrets')
    .upsert({ business_id: biz.id, google_refresh_token: null }, { onConflict: 'business_id' })
  if (error) return NextResponse.json({ ok: false }, { status: 500 })

  return NextResponse.json({ ok: true })
}
