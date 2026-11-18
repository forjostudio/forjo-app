import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { mpConnectConfigured } from '@/lib/mercadopago'
import { googleConfigured } from '@/lib/google-calendar'
import { getBusinessSecrets } from '@/lib/business-secrets'
import { SettingsClient } from '../settings/settings-client'

export default async function NegocioPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: business } = await supabase.from('businesses').select('*').eq('owner_id', user.id).single()
  if (!business) redirect('/onboarding')

  // NAV-02: las tabs Cobros/Integraciones/Notificaciones migraron a este hub y consumen los secretos
  // del dueño (mp_access_token, resend_*, etc.). Se leen server-side igual que en /settings. El scope
  // es business.id resuelto por owner_id (arriba) → aislamiento por tenant: getBusinessSecrets corre
  // con service role (bypassa RLS), por eso el business.id del dueño autenticado es la garantía. Nunca
  // un id que venga del cliente. Solo se pasa al form de edición del propio dueño (D-05).
  const secrets = await getBusinessSecrets(business.id)

  // `SettingsClient` lee el tab de la query (`?tab=`, Phase 4) con `useSearchParams`, que obliga a un
  // boundary de Suspense. El fallback SÍ se dibuja: en una entrada blanda (Más, el sidebar) con el chunk
  // del cliente todavía sin cargar en el documento, el boundary muestra su fallback mientras llega —310 a
  // 1724 ms medidos en Finanzas, el mismo molde—. Por eso es un nodo y no nada: el handler de scroll de Next
  // necesita un elemento del DOM para consumir el scroll de la navegación en el montaje; sin nodo lo deja
  // pendiente y el primer cambio de tab lo ejecuta (G-04-6, `.planning/debug/finanzas-primer-toque-scroll.md`).
  // Acá se midió el mismo pendiente con el recorrido `N-negocio-borde-movil`: con el borde de arriba fuera
  // de la pantalla, el primer toque de Cobros llevaba la página arriba. Un div vacío con la clase del
  // contenedor raíz de `SettingsClient` (alto cero: no agrega ningún píxel) lo consume al montar. La query
  // NO llega acá: el negocio y sus secretos salen del dueño de la sesión, y el tab sólo elige qué se
  // muestra en el cliente.
  return (
    <Suspense fallback={<div className="space-y-6 max-w-3xl" aria-busy="true" />}>
      <SettingsClient
        business={business}
        secrets={secrets}
        initialServices={[]}
        initialProfessionals={[]}
        initialLocations={[]}
        mpConnectEnabled={mpConnectConfigured()}
        googleEnabled={googleConfigured()}
        googleConnected={!!secrets.google_refresh_token}
        ownerEmail={user.email ?? null}
        view="negocio"
      />
    </Suspense>
  )
}
