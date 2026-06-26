import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { startOfWeek, format } from 'date-fns'
import { googleConfigured } from '@/lib/google-calendar'
import { getBusinessSecrets } from '@/lib/business-secrets'
import { AgendaClient, type AgendaAppt } from './agenda-client'

export default async function AgendaPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: business } = await supabase
    .from('businesses')
    .select('*')
    .eq('owner_id', user.id)
    .single()

  if (!business) redirect('/onboarding')

  // google_refresh_token ya no vive en businesses (migración 027). Leemos la PRESENCIA server-side
  // vía getBusinessSecrets y pasamos solo un booleano al client (D-05: nunca el token crudo).
  const secrets = await getBusinessSecrets(business.id)

  // Turnos desde el inicio de la semana actual en adelante para la vista semanal (sin cancelados).
  const weekStartStr = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd')

  const [{ data: timeBlocks }, { data: locations }, { data: exceptions }, { data: appointments }, { data: services }, { data: professionals }, { data: clients }] = await Promise.all([
    supabase.from('time_blocks').select('*').eq('business_id', business.id).order('day_of_week').order('start_time'),
    supabase.from('locations').select('*').eq('business_id', business.id).order('created_at'),
    supabase.from('schedule_exceptions').select('*').eq('business_id', business.id).order('date'),
    supabase.from('appointments')
      .select('id, date, time, status, client_name, duration_minutes, location_id, services(name), professionals(name)')
      .eq('business_id', business.id)
      .gte('date', weekStartStr)
      .neq('status', 'cancelled')
      .order('date', { ascending: true })
      .order('time', { ascending: true }),
    // Datos para el form compartido "Nuevo turno" (D-08), filtrados por business_id en el server (T-01-14).
    supabase.from('services').select('*').eq('business_id', business.id).eq('active', true),
    supabase.from('professionals').select('*').eq('business_id', business.id).eq('active', true),
    supabase.from('clients').select('*').eq('business_id', business.id).order('name', { ascending: true }),
  ])

  return (
    <AgendaClient
      business={business}
      initialTimeBlocks={timeBlocks || []}
      initialLocations={locations || []}
      initialExceptions={exceptions || []}
      initialAppointments={(appointments || []) as unknown as AgendaAppt[]}
      services={services || []}
      professionals={professionals || []}
      clients={clients || []}
      googleEnabled={googleConfigured()}
      googleConnected={!!secrets.google_refresh_token}
    />
  )
}
