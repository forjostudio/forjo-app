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
  // boundary de Suspense. Acá el fallback NUNCA se renderiza —esta ruta es dinámica porque el
  // `createClient()` de arriba usa `cookies()`, así que el bailout de prerender no puede dispararse—,
  // pero se envuelve igual: es el molde de `app/(dashboard)/clients/page.tsx` y de `finances/page.tsx`,
  // y así el build deja de depender de que nadie vuelva estática la ruta. La query NO llega acá: el
  // negocio y sus secretos salen del dueño de la sesión, y el tab sólo elige qué se muestra en el cliente.
  return (
    <Suspense fallback={null}>
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
