import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildAuthUrl, googleConfigured } from '@/lib/google-calendar'

// Inicia el OAuth de Google Calendar: solo el dueño logueado. Setea un state en cookie
// (CSRF) y redirige a la pantalla de consentimiento de Google.
export async function GET() {
  const base = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '')
  if (!googleConfigured()) return NextResponse.redirect(`${base}/agenda?google=error`)

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(`${base}/login`)

  const state = crypto.randomUUID()
  const res = NextResponse.redirect(buildAuthUrl(state))
  res.cookies.set('g_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  })
  return res
}
