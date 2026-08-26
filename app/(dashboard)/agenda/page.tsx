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

  const [{ data: timeBlocks }, { data: locations }, { data: exceptions }, { data: appointments }, { data: services }, { data: professionals }, { data: clients }, { data: timeBlockServices }, { data: serviceCatalog }] = await Promise.all([
    supabase.from('time_blocks').select('*').eq('business_id', business.id).order('day_of_week').order('start_time'),
    supabase.from('locations').select('*').eq('business_id', business.id).order('created_at'),
    supabase.from('schedule_exceptions').select('*').eq('business_id', business.id).order('date'),
    supabase.from('appointments')
      // client_phone/client_email para el roster del admin (D-04). Datos propios del negocio
      // sobre SUS clientes; el set ya viene filtrado por business_id (aislamiento por tenant).
      // abono_id (migr. 054, D-09): marca el turno como parte de una serie fija → badge "Fijo" en la agenda.
      // service_id (migr. 062, D-11): resuelve el modo de cupo del servicio para contar la ocupación
      // por SOLAPE de los recursos simultáneos (el join services(name) solo trae el nombre).
      // expires_at (code-review CR-01): un hold `pending_payment` con la seña VENCIDA ya no ocupa
      // lugar (el RPC y availability lo descartan), así que el aviso "lleno" por solape del panel
      // tampoco puede contarlo. Sin esta columna el badge mentía hasta que corriera el cron diario.
      // professional_id (code-review CR-01 de la Phase 17): el motor cuenta los lugares por AGENDA
      // — COALESCE(professional_id, sentinel) + date + time, SIN service_id —, así que sin esta
      // columna el panel no puede contar por el mismo eje. El join professionals(name) NO sirve para
      // esto: trae el nombre para mostrar, no el id con el que se agrupa (y colapsa a null los
      // turnos sin profesional, que en el motor son un bucket propio, el sentinel).
      .select('id, date, time, status, client_name, client_phone, client_email, expires_at, duration_minutes, location_id, abono_id, service_id, professional_id, services(name), professionals(name)')
      .eq('business_id', business.id)
      .gte('date', weekStartStr)
      .neq('status', 'cancelled')
      .order('date', { ascending: true })
      .order('time', { ascending: true }),
    // Datos para el form compartido "Nuevo turno" (D-08), filtrados por business_id en el server (T-01-14).
    supabase.from('services').select('*').eq('business_id', business.id).eq('active', true),
    supabase.from('professionals').select('*').eq('business_id', business.id).eq('active', true),
    supabase.from('clients').select('*').eq('business_id', business.id).order('name', { ascending: true }),
    // El mapeo franja↔servicio (migr. 071): decide QUÉ se ofrece en cada franja. Mismas tres
    // columnas con las que lo leen los dos consumidores públicos (availability y el backstop del
    // create), para que el panel no interprete una forma distinta del mismo dato. Filtrado por
    // business_id ADEMÁS de la RLS: defensa en profundidad, regla dura del proyecto (T-19-18).
    supabase.from('time_block_services').select('business_id, time_block_id, service_id').eq('business_id', business.id),
    // El catálogo de los chips del editor de horarios. Son DOS lecturas de `services` en la misma
    // página y no una compartida a propósito: la de arriba va filtrada a activos porque la consume
    // el form de alta manual, y sacarle ese filtro metería servicios dados de baja en el alta =
    // regresión (T-19-20). Ésta, en cambio:
    //   - NO filtra por activo: un servicio desactivado que sigue mapeado a una franja tiene que
    //     poder NOMBRARSE en el editor (D-11); sin él, la franja se vería como comodín cuando el
    //     motor la trata como restringida.
    //   - ordena por created_at: es el orden que fija el UI-SPEC, y prohíbe reordenar por
    //     seleccionados — los chips saltarían de lugar en el mismo click que los marca.
    // Sólo tres columnas: el editor no necesita precio ni duración en el browser (T-19-19).
    supabase.from('services').select('id, name, active').eq('business_id', business.id).order('created_at'),
  ])

  return (
    <AgendaClient
      business={business}
      initialTimeBlocks={timeBlocks || []}
      initialLocations={locations || []}
      initialExceptions={exceptions || []}
      initialAppointments={(appointments || []) as unknown as AgendaAppt[]}
      initialTimeBlockServices={timeBlockServices || []}
      serviceCatalog={serviceCatalog || []}
      services={services || []}
      professionals={professionals || []}
      clients={clients || []}
      googleEnabled={googleConfigured()}
      googleConnected={!!secrets.google_refresh_token}
    />
  )
}
