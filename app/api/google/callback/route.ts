import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { exchangeCode } from '@/lib/google-calendar'

// Callback del OAuth: valida el state (cookie), canjea el code por el refresh_token y lo
// guarda en el negocio del dueño logueado. Vuelve al origen (agenda o negocio) con ?google=connected|error.
export async function GET(request: NextRequest) {
  const base = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '')
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const saved = request.cookies.get('g_oauth_state')?.value
  // Destino de vuelta desde una lista CERRADA (anti open-redirect T-05-02): el cookie guarda solo un
  // token ('negocio'|'agenda'); cualquier otra cosa cae a /agenda. Nunca se usa un path crudo del cliente.
  const returnPath = request.cookies.get('g_oauth_from')?.value === 'negocio' ? '/negocio' : '/agenda'

  const fail = () => {
    const r = NextResponse.redirect(`${base}${returnPath}?google=error`)
    r.cookies.delete('g_oauth_state')
    r.cookies.delete('g_oauth_from')
    return r
  }

  if (!code || !state || !saved || state !== saved) return fail()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(`${base}/login`)

  const tokens = await exchangeCode(code)
  // Sin refresh_token no podemos renovar el acceso (prompt=consent debería garantizarlo).
  if (!tokens?.refresh_token) return fail()

  // Resolver el business_id del dueño para keyear business_secrets por business_id.
  const { data: biz } = await supabase
    .from('businesses')
    .select('id')
    .eq('owner_id', user.id)
    .single()
  if (!biz) return fail()

  // google_refresh_token es secreto → va a business_secrets (migración 027), keyed por
  // business_id. El upsert del session client lo autoriza la policy owner-only (Pitfall F).
  const { error } = await supabase
    .from('business_secrets')
    .upsert({ business_id: biz.id, google_refresh_token: tokens.refresh_token }, { onConflict: 'business_id' })
  if (error) {
    console.error('[google/callback] guardar token falló:', error.message)
    return fail()
  }

  const r = NextResponse.redirect(`${base}${returnPath}?google=connected`)
  r.cookies.delete('g_oauth_state')
  r.cookies.delete('g_oauth_from')
  return r
}
