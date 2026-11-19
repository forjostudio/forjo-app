import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildAuthUrl, googleConfigured } from '@/lib/google-calendar'
import { GOOGLE_RETURN, oauthReturnPath, resolveOAuthReturn } from '@/lib/oauth-return'

// Inicia el OAuth de Google Calendar: solo el dueño logueado. Setea un state en cookie
// (CSRF) y redirige a la pantalla de consentimiento de Google.
export async function GET(request: NextRequest) {
  const base = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '')
  // Anti open-redirect (T-05-02): el destino de vuelta sale de la lista CERRADA de Google
  // (`lib/oauth-return.ts`), nunca del valor crudo del cliente. `from` elige entre tres destinos:
  // agenda (default, sin `from`), negocio (Integraciones del panel) y onboarding (paso 5 del
  // onboarding); cualquier otra cosa → agenda. Volvemos a la superficie que lo inició.
  const from = resolveOAuthReturn(new URL(request.url).searchParams.get('from'), GOOGLE_RETURN)
  const returnPath = oauthReturnPath(from)
  if (!googleConfigured()) return NextResponse.redirect(`${base}${returnPath}?google=error`)

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(`${base}/login`)

  const state = crypto.randomUUID()
  const res = NextResponse.redirect(buildAuthUrl(state))
  const cookieOpts = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, maxAge: 600, path: '/' }
  res.cookies.set('g_oauth_state', state, cookieOpts)
  // Guardamos solo el TOKEN del origen (no un path), que el callback mapea contra la lista cerrada.
  res.cookies.set('g_oauth_from', from, cookieOpts)
  return res
}
