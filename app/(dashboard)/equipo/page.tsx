import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { mpConnectConfigured } from '@/lib/mercadopago'
import { resolveVertical } from '@/lib/verticals'
import { SettingsClient } from '../settings/settings-client'

export default async function EquipoPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: business } = await supabase.from('businesses').select('*').eq('owner_id', user.id).single()
  if (!business) redirect('/onboarding')

  // El rubro canchas no tiene "Equipo" (D-05): cada cancha es una fila de `professionals`, así que
  // cargar /equipo en un negocio canchas listaría las canchas como "Equipo" — leak de datos, no solo
  // estético. Redirigimos ANTES de las queries para no leer esos datos.
  if (resolveVertical(business).key === 'canchas') redirect('/dashboard')

  // spaces / agenda_spaces (motor-reservas / espacio compartido) viven en la vista Equipo (D-04):
  // el mapeo agenda→espacios se edita junto al CRUD de professionals. Cargados por tenant (RLS).
  // services + professional_services (STAFF, migr. 057): el editor de chips (Bloque A) necesita los
  // servicios del negocio como chips y las filas del mapeo. Todo por tenant (.eq('business_id') + RLS).
  const [{ data: professionals }, { data: services }, { data: spaces }, { data: agendaSpaces }, { data: professionalServices }] = await Promise.all([
    supabase.from('professionals').select('*').eq('business_id', business.id).order('created_at'),
    supabase.from('services').select('*').eq('business_id', business.id).order('created_at'),
    supabase.from('spaces').select('*').eq('business_id', business.id).order('created_at'),
    supabase.from('agenda_spaces').select('*').eq('business_id', business.id),
    supabase.from('professional_services').select('*').eq('business_id', business.id),
  ])

  return (
    <SettingsClient
      business={business}
      initialServices={services || []}
      initialProfessionals={professionals || []}
      initialLocations={[]}
      initialSpaces={spaces || []}
      initialAgendaSpaces={agendaSpaces || []}
      initialProfessionalServices={professionalServices || []}
      mpConnectEnabled={mpConnectConfigured()}
      view="equipo"
    />
  )
}
