import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { negocioDelPanel } from '@/lib/negocio-del-dueno'
import { redirect } from 'next/navigation'
import { mpConnectConfigured } from '@/lib/mercadopago'
import { getBusinessSecrets } from '@/lib/business-secrets'
import { SettingsClient } from './settings-client'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const business = await negocioDelPanel(supabase, user.id, '*')

  // Secretos server-side (service role, server-only). Los 7 secretos ya no viven en businesses
  // (migración 027) → se leen vía getBusinessSecrets. Solo se pasan al form de edición del
  // PROPIO dueño (D-05 permite mostrar el valor a su dueño; nunca a anon ni a otro componente).
  const secrets = await getBusinessSecrets(business.id)

  // spaces / agenda_spaces (motor-reservas / espacio compartido): se cargan por tenant con el
  // cliente server (anon + RLS) — las policies por op del Plan 01 garantizan el aislamiento.
  // agenda_spaces no tiene created_at (PK professional_id,space_id) → no se ordena.
  const [{ data: services }, { data: professionals }, { data: locations }, { data: spaces }, { data: agendaSpaces }] = await Promise.all([
    supabase.from('services').select('*').eq('business_id', business.id).order('created_at'),
    supabase.from('professionals').select('*').eq('business_id', business.id).order('created_at'),
    supabase.from('locations').select('*').eq('business_id', business.id).order('created_at'),
    supabase.from('spaces').select('*').eq('business_id', business.id).order('created_at'),
    supabase.from('agenda_spaces').select('*').eq('business_id', business.id),
  ])

  // `SettingsClient` lee el tab de la query (`?tab=`, Phase 4) con `useSearchParams`, que obliga a un
  // boundary de Suspense. El fallback SÍ se dibuja: en una entrada blanda con el chunk del cliente todavía
  // sin cargar en el documento, el boundary muestra su fallback mientras llega —310 a 1724 ms medidos en
  // Finanzas, el mismo molde—. Por eso es un nodo y no nada: el handler de scroll de Next necesita un
  // elemento del DOM para consumir el scroll de la navegación en el montaje; sin nodo lo deja pendiente y
  // el primer cambio de tab lo ejecuta (G-04-6, `.planning/debug/finanzas-primer-toque-scroll.md`). Esta
  // página monta el mismo `SettingsClient` detrás del mismo boundary que `negocio/page.tsx`, donde el
  // pendiente se midió; acá los tabs están arriba de todo y casi nunca lo dejan ver, pero el pendiente es
  // el mismo. Un div vacío con la clase del contenedor raíz de `SettingsClient` (alto cero: no agrega
  // ningún píxel) lo consume al montar. La query NO llega acá: el negocio y sus secretos salen del dueño
  // de la sesión, y el tab sólo elige qué se muestra en el cliente.
  return (
    <Suspense fallback={<div className="space-y-6 max-w-3xl" aria-busy="true" />}>
      <SettingsClient
        business={business}
        secrets={secrets}
        initialServices={services || []}
        initialProfessionals={professionals || []}
        initialLocations={locations || []}
        initialSpaces={spaces || []}
        initialAgendaSpaces={agendaSpaces || []}
        mpConnectEnabled={mpConnectConfigured()}
      />
    </Suspense>
  )
}
