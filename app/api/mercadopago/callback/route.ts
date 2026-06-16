import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { exchangeMpCode } from '@/lib/mercadopago'

// Callback del OAuth de MercadoPago: valida el state, canjea el code y guarda las credenciales
// del negocio del dueño logueado. El access_token va a mp_access_token (lo usa el flujo de seña
// tal cual el modo manual). Vuelve a /settings con ?mp=connected|error.
export async function GET(request: NextRequest) {
  const base = (process.env.NEXT_PUBLIC_APP_URL || 'https://gestion.forjo.studio').replace(/\/$/, '')
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const saved = request.cookies.get('mp_oauth_state')?.value

  const fail = () => {
    const r = NextResponse.redirect(`${base}/settings?mp=error`)
    r.cookies.delete('mp_oauth_state')
    return r
  }

  if (!code || !state || !saved || state !== saved) return fail()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(`${base}/login`)

  const tokens = await exchangeMpCode(code)
  if (!tokens?.access_token) return fail()

  const expiresAt = tokens.expires_in
    ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
    : null

  // Resolver el business_id del dueño (necesario para keyear business_secrets por business_id).
  const { data: biz } = await supabase
    .from('businesses')
    .select('id')
    .eq('owner_id', user.id)
    .single()
  if (!biz) return fail()

  // mp_user_id NO es secreto (es el id de cuenta MP, el dashboard lo usa como flag de conexión)
  // → se queda en businesses. Lo escribimos con el session client (autorizado por owner_id).
  const { error: bizErr } = await supabase
    .from('businesses')
    .update({ mp_user_id: tokens.user_id != null ? String(tokens.user_id) : null })
    .eq('owner_id', user.id)
  if (bizErr) {
    console.error('[mp/callback] guardar mp_user_id falló:', bizErr.message)
    return fail()
  }

  // Los 3 secretos MP van a business_secrets (migración 027), keyed por business_id. El upsert
  // del session client lo autoriza la policy owner-only de business_secrets (Pitfall F).
  const { error: secErr } = await supabase
    .from('business_secrets')
    .upsert({
      business_id: biz.id,
      mp_access_token: tokens.access_token,
      mp_refresh_token: tokens.refresh_token ?? null,
      mp_token_expires_at: expiresAt,
    }, { onConflict: 'business_id' })
  if (secErr) {
    console.error('[mp/callback] guardar secretos MP falló:', secErr.message)
    return fail()
  }

  const r = NextResponse.redirect(`${base}/settings?mp=connected`)
  r.cookies.delete('mp_oauth_state')
  return r
}
