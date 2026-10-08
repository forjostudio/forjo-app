import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { MasClient } from './mas-client'

// Pantalla Más del panel (MOB-03), el quinto destino de la barra inferior. Server Component que
// espeja el molde de `app/(dashboard)/abonos/page.tsx`: resuelve el negocio por `owner_id` de la
// sesión, así el aislamiento por tenant lo garantiza la propia query y nunca un id que venga del
// cliente. Es UNA sola lectura de `businesses` y nada más — Más no muestra datos del negocio más
// allá del nombre, el logo y el plan, así que no hay otra tabla que consultar: cero tablas nuevas,
// cero policies, cero migraciones.
//
// El layout de `(dashboard)` NO pasa `business` a `children` (sólo a `<Sidebar>`), por eso la
// pantalla lo re-resuelve acá. No es duplicación evitable: es el patrón de las 13 pantallas del
// panel.
//
// El directorio se llama `mas` SIN TILDE a propósito: un `/más` viajaría percent-encoded
// (`/m%C3%A1s`) en el historial y en `usePathname()`, y el activo de la barra se decide por igualdad
// literal de pathname. La tilde vive en el label, no en la URL.
export default async function MasPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: business } = await supabase
    .from('businesses')
    .select('*')
    .eq('owner_id', user.id)
    .single()

  if (!business) redirect('/onboarding')

  return <MasClient business={business} />
}
