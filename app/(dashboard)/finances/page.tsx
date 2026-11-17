import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { FinancesClient } from './finances-client'

export default async function FinancesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: business } = await supabase
    .from('businesses')
    .select('id')
    .eq('owner_id', user.id)
    .single()

  if (!business) redirect('/onboarding')

  // `FinancesClient` lee el tab de la query (`?tab=`, Phase 4) con `useSearchParams`, que obliga a un
  // boundary de Suspense. Acá el fallback NUNCA se renderiza —esta ruta es dinámica porque el
  // `createClient()` de arriba usa `cookies()`, así que el bailout de prerender no puede dispararse—,
  // pero se envuelve igual: es el molde de `app/(dashboard)/clients/page.tsx`, y así el build deja de
  // depender de que nadie vuelva estática la ruta. La query NO llega acá: el negocio sale del dueño
  // de la sesión y el tab sólo elige qué lista se muestra en el cliente.
  return (
    <Suspense fallback={null}>
      <FinancesClient businessId={business.id} />
    </Suspense>
  )
}
