import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { revokeToken } from '@/lib/google-calendar'
import { getBusinessSecrets } from '@/lib/business-secrets'

// Desconecta Google Calendar: revoca el token en Google (best-effort) y lo borra del negocio.
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })

  // Resolver el business_id del dueño.
  const { data: biz } = await supabase
    .from('businesses')
    .select('id')
    .eq('owner_id', user.id)
    .single()
  if (!biz) return NextResponse.json({ ok: false }, { status: 404 })

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
