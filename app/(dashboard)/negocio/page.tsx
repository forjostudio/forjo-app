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

  return (
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
  )
}
