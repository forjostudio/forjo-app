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
  // professional_services (STAFF, migr. 057): la cobertura por servicio (Bloque B) necesita las filas
  // del mapeo. Por tenant (.eq('business_id') + RLS, defensa en profundidad).
  // services ordena por el orden manual (migr. 078) con `created_at` de desempate: sin esto el orden
  // que arma el dueño en el organizador del catálogo no sobrevive a un reload. Es seguro para el
  // camino de cero categorías: todos los `sort_order` de producción valen 0 (la 078 declaró cero
  // backfill), así que la clave secundaria reproduce exactamente el orden de hoy.
  // service_categories (Phase 23): por tenant (.eq('business_id') + RLS). El desempate por
  // `created_at` NO es decorativo: varias categorías recién creadas pueden quedar empatadas en 0, y
  // sin una segunda clave el orden que devuelve PostgREST no está garantizado entre lecturas.
  const [{ data: services }, { data: locations }, { data: professionals }, { data: spaces }, { data: agendaSpaces }, { data: professionalServices }, { data: serviceCategories }] = await Promise.all([
    supabase.from('services').select('*').eq('business_id', business.id).order('sort_order', { ascending: true }).order('created_at', { ascending: true }),
    supabase.from('locations').select('*').eq('business_id', business.id).order('created_at'),
    supabase.from('professionals').select('*').eq('business_id', business.id).order('created_at'),
    supabase.from('spaces').select('*').eq('business_id', business.id).order('created_at'),
    supabase.from('agenda_spaces').select('*').eq('business_id', business.id),
    supabase.from('professional_services').select('*').eq('business_id', business.id),
    supabase.from('service_categories').select('*').eq('business_id', business.id).order('sort_order', { ascending: true }).order('created_at', { ascending: true }),
  ])

  return (
    <SettingsClient
      business={business}
      initialServices={services || []}
      initialProfessionals={professionals || []}
      initialLocations={locations || []}
      initialSpaces={spaces || []}
      initialAgendaSpaces={agendaSpaces || []}
      initialProfessionalServices={professionalServices || []}
      initialServiceCategories={serviceCategories || []}
      mpConnectEnabled={mpConnectConfigured()}
      view="servicios"
    />
  )
}
