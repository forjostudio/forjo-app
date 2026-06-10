import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { revokeToken } from '@/lib/google-calendar'

// Desconecta Google Calendar: revoca el token en Google (best-effort) y lo borra del negocio.
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })

  const { data: biz } = await supabase
    .from('businesses')
    .select('google_refresh_token')
    .eq('owner_id', user.id)
    .single()
  if (biz?.google_refresh_token) await revokeToken(biz.google_refresh_token)

  const { error } = await supabase
    .from('businesses')
    .update({ google_refresh_token: null })
    .eq('owner_id', user.id)
  if (error) return NextResponse.json({ ok: false }, { status: 500 })

  return NextResponse.json({ ok: true })
}
