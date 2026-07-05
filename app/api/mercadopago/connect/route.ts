import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildMpAuthUrl, mpConnectConfigured } from '@/lib/mercadopago'

// Inicia el OAuth de MercadoPago Connect: solo el dueño logueado. State en cookie (CSRF) y
// redirige a la autorización de MP.
export async function GET() {
  const base = (process.env.NEXT_PUBLIC_APP_URL || 'https://gestion.forjo.studio').replace(/\/$/, '')
  if (!mpConnectConfigured()) return NextResponse.redirect(`${base}/negocio?mp=error`)

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(`${base}/login`)

  const state = crypto.randomUUID()
  const res = NextResponse.redirect(buildMpAuthUrl(state))
  res.cookies.set('mp_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  })
  return res
}
