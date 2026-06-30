import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { mpConnectConfigured } from '@/lib/mercadopago'
import { SettingsClient } from '../settings/settings-client'

export default async function EquipoPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: business } = await supabase.from('businesses').select('*').eq('owner_id', user.id).single()
  if (!business) redirect('/onboarding')

  // spaces / agenda_spaces (motor-reservas / espacio compartido) viven en la vista Equipo (D-04):
  // el mapeo agenda→espacios se edita junto al CRUD de professionals. Cargados por tenant (RLS).
  const [{ data: professionals }, { data: spaces }, { data: agendaSpaces }] = await Promise.all([
    supabase.from('professionals').select('*').eq('business_id', business.id).order('created_at'),
    supabase.from('spaces').select('*').eq('business_id', business.id).order('created_at'),
    supabase.from('agenda_spaces').select('*').eq('business_id', business.id),
  ])

  return (
    <SettingsClient
      business={business}
      initialServices={[]}
      initialProfessionals={professionals || []}
      initialLocations={[]}
      initialSpaces={spaces || []}
      initialAgendaSpaces={agendaSpaces || []}
      mpConnectEnabled={mpConnectConfigured()}
      view="equipo"
    />
  )
}
