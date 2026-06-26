import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AppointmentsClient } from './appointments-client'

export default async function AppointmentsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: business } = await supabase
    .from('businesses')
    .select('*')
    .eq('owner_id', user.id)
    .single()

  if (!business) redirect('/onboarding')

  const [{ data: appointments }, { data: professionals }, { data: services }, { data: timeBlocks }, { data: clients }, { data: locations }] = await Promise.all([
    supabase.from('appointments')
      .select('*, professionals(name), services(name, price, duration_minutes)')
      .eq('business_id', business.id)
      .order('date', { ascending: true })
      .order('time', { ascending: true }),
    supabase.from('professionals')
      .select('*')
      .eq('business_id', business.id)
      .eq('active', true),
    supabase.from('services')
      .select('*')
      .eq('business_id', business.id)
      .eq('active', true),
    supabase.from('time_blocks')
      .select('*')
      .eq('business_id', business.id),
    // Clientes para el combobox del form compartido (filtrados por business_id en el server — T-01-14).
    supabase.from('clients')
      .select('*')
      .eq('business_id', business.id)
      .order('name', { ascending: true }),
    supabase.from('locations')
      .select('*')
      .eq('business_id', business.id)
      .order('created_at', { ascending: true }),
  ])

  return (
    <AppointmentsClient
      initialAppointments={appointments || []}
      professionals={professionals || []}
      services={services || []}
      timeBlocks={timeBlocks || []}
      clients={clients || []}
      locations={locations || []}
      businessId={business.id}
    />
  )
}
