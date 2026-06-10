import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Desconecta MercadoPago: limpia el token y los datos de la conexión OAuth del negocio.
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })

  const { error } = await supabase
    .from('businesses')
    .update({ mp_access_token: null, mp_refresh_token: null, mp_user_id: null, mp_token_expires_at: null })
    .eq('owner_id', user.id)
  if (error) return NextResponse.json({ ok: false }, { status: 500 })

  return NextResponse.json({ ok: true })
}
