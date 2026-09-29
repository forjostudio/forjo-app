import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ClientsClient } from './clients-client'

export default async function ClientsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: business } = await supabase
    .from('businesses')
    .select('*')
    .eq('owner_id', user.id)
    .single()

  if (!business) redirect('/onboarding')

  const [{ data: clients }, { data: appointments }, { data: professionals }] = await Promise.all([
    supabase.from('clients')
      .select('*')
      .eq('business_id', business.id)
      .order('created_at', { ascending: true }),
    supabase.from('appointments')
      .select('*, services(name, price)')
      .eq('business_id', business.id)
      .order('date', { ascending: false }),
    supabase.from('professionals')
      .select('id, name')
      .eq('business_id', business.id)
      .eq('active', true)
      .order('name', { ascending: true }),
  ])

  // `ClientsClient` lee el cliente abierto de la query (`?c=<id>`) con `useSearchParams`, que obliga a
  // un boundary de Suspense. Acá el fallback NUNCA se renderiza —esta ruta es dinámica porque el
  // `createClient()` de arriba usa `cookies()`, así que el bailout de prerender no puede dispararse—,
  // pero se envuelve igual: cuesta tres líneas, ya es el patrón del repo
  // (`app/(dashboard)/layout.tsx:60-62` alrededor de `<PlanBanner>`), y así el build deja de depender
  // de que nadie vuelva estática la ruta.
  return (
    <Suspense fallback={null}>
      <ClientsClient
        initialClients={clients || []}
        appointments={appointments || []}
        professionals={professionals || []}
        businessId={business.id}
      />
    </Suspense>
  )
}
