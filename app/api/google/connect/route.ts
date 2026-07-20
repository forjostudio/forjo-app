import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildAuthUrl, googleConfigured } from '@/lib/google-calendar'

// Inicia el OAuth de Google Calendar: solo el dueño logueado. Setea un state en cookie
// (CSRF) y redirige a la pantalla de consentimiento de Google.
export async function GET(request: NextRequest) {
  const base = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '')
  // Anti open-redirect (T-05-02): el destino de vuelta sale de una lista CERRADA, nunca del valor
  // crudo del cliente. `from` solo elige entre agenda (default) y negocio; cualquier otra cosa → agenda.
  // El control de Google vive en las dos superficies (Agenda e Integraciones) → volvemos a la que lo inició.
  const from = new URL(request.url).searchParams.get('from') === 'negocio' ? 'negocio' : 'agenda'
  const returnPath = from === 'negocio' ? '/negocio' : '/agenda'
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
