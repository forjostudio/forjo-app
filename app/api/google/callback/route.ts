import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { exchangeCode } from '@/lib/google-calendar'

// Callback del OAuth: valida el state (cookie), canjea el code por el refresh_token y lo
// guarda en el negocio del dueño logueado. Vuelve a /agenda con ?google=connected|error.
export async function GET(request: NextRequest) {
  const base = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '')
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const saved = request.cookies.get('g_oauth_state')?.value

  const fail = () => {
    const r = NextResponse.redirect(`${base}/agenda?google=error`)
    r.cookies.delete('g_oauth_state')
    return r
  }

  if (!code || !state || !saved || state !== saved) return fail()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(`${base}/login`)

  const tokens = await exchangeCode(code)
  // Sin refresh_token no podemos renovar el acceso (prompt=consent debería garantizarlo).
  if (!tokens?.refresh_token) return fail()

  const { error } = await supabase
    .from('businesses')
    .update({ google_refresh_token: tokens.refresh_token })
    .eq('owner_id', user.id)
  if (error) {
    console.error('[google/callback] guardar token falló:', error.message)
    return fail()
  }

  const r = NextResponse.redirect(`${base}/agenda?google=connected`)
  r.cookies.delete('g_oauth_state')
  return r
}
