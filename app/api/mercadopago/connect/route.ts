import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildMpAuthUrl, mpConnectConfigured } from '@/lib/mercadopago'
import { MP_RETURN, oauthReturnPath, resolveOAuthReturn } from '@/lib/oauth-return'

// Inicia el OAuth de MercadoPago Connect: solo el dueño logueado. State en cookie (CSRF) y
// redirige a la autorización de MP.
export async function GET(request: NextRequest) {
  const base = (process.env.NEXT_PUBLIC_APP_URL || 'https://gestion.forjo.studio').replace(/\/$/, '')
  // Anti open-redirect (T-05-02): el destino de vuelta sale de la lista CERRADA de MP
  // (`negocio` | `onboarding`, default `negocio`), nunca del valor crudo del cliente. El panel llama
  // sin `from` → vuelve a /negocio como siempre; el paso 5 del onboarding manda `from=onboarding`.
  const from = resolveOAuthReturn(new URL(request.url).searchParams.get('from'), MP_RETURN)
  const returnPath = oauthReturnPath(from)
  if (!mpConnectConfigured()) return NextResponse.redirect(`${base}${returnPath}?mp=error`)

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(`${base}/login`)

  const state = crypto.randomUUID()
  const res = NextResponse.redirect(buildMpAuthUrl(state))
  const cookieOpts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: 600,
    path: '/',
  }
  res.cookies.set('mp_oauth_state', state, cookieOpts)
  // Guardamos solo el TOKEN del origen (no un path), que el callback vuelve a normalizar contra MP_RETURN.
  res.cookies.set('mp_oauth_from', from, cookieOpts)
  return res
}
