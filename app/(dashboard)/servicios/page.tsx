import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { mpConnectConfigured } from '@/lib/mercadopago'
import { SettingsClient } from '../settings/settings-client'

export default async function ServiciosPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: business } = await supabase.from('businesses').select('*').eq('owner_id', user.id).single()
  if (!business) redirect('/onboarding')

  // /servicios sirve a TODOS los verticales. Para canchas (D-03) el manager vive acá y necesita
  // professionals/spaces/agenda_spaces (el motor v0.12) que hoy /equipo carga pero /servicios no.
  // Los cargamos por tenant (.eq('business_id') + RLS, defensa en profundidad). Para salud/belleza/
  // general estos datos no cambian el render de /servicios (el CRUD de servicios se mantiene igual):
  // el manager de canchas se gatea por vertical dentro del componente. NO redirigimos por vertical acá.
  const [{ data: services }, { data: locations }, { data: professionals }, { data: spaces }, { data: agendaSpaces }] = await Promise.all([
    supabase.from('services').select('*').eq('business_id', business.id).order('created_at'),
    supabase.from('locations').select('*').eq('business_id', business.id).order('created_at'),
    supabase.from('professionals').select('*').eq('business_id', business.id).order('created_at'),
    supabase.from('spaces').select('*').eq('business_id', business.id).order('created_at'),
    supabase.from('agenda_spaces').select('*').eq('business_id', business.id),
  ])

  return (
    <SettingsClient
      business={business}
      initialServices={services || []}
      initialProfessionals={professionals || []}
      initialLocations={locations || []}
      initialSpaces={spaces || []}
      initialAgendaSpaces={agendaSpaces || []}
      mpConnectEnabled={mpConnectConfigured()}
      view="servicios"
    />
  )
}
