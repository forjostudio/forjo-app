import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { negocioDelDueno } from '@/lib/negocio-del-dueno'

export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Con error de lectura se va al panel y NUNCA al wizard (WR-03 de onboarding/integraciones, quick
  // 261124-neg): el wizard no verifica si ya hay negocio. El layout del panel vuelve a leer y decide
  // (sigue fallando → aviso con «Reintentar»; 0 filas reales → wizard), y `/dashboard` nunca manda a
  // `/`, así que no hay loop. No se agrega un `app/error.tsx` raíz: cambiaría la pantalla de error de
  // las reservas públicas, el landing, el CRM y el login, que nadie pidió tocar.
  const negocio = await negocioDelDueno(supabase, user.id, 'id')
  if (negocio.ok || negocio.reason === 'error') redirect('/dashboard')
  redirect('/onboarding')
}
