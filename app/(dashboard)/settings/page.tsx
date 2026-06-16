import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { mpConnectConfigured } from '@/lib/mercadopago'
import { getBusinessSecrets } from '@/lib/business-secrets'
import { SettingsClient } from './settings-client'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: business } = await supabase
    .from('businesses')
    .select('*')
    .eq('owner_id', user.id)
    .single()

  if (!business) redirect('/onboarding')

  // Secretos server-side (service role, server-only). Los 7 secretos ya no viven en businesses
  // (migración 027) → se leen vía getBusinessSecrets. Solo se pasan al form de edición del
  // PROPIO dueño (D-05 permite mostrar el valor a su dueño; nunca a anon ni a otro componente).
  const secrets = await getBusinessSecrets(business.id)

  const [{ data: services }, { data: professionals }, { data: locations }] = await Promise.all([
    supabase.from('services').select('*').eq('business_id', business.id).order('created_at'),
    supabase.from('professionals').select('*').eq('business_id', business.id).order('created_at'),
    supabase.from('locations').select('*').eq('business_id', business.id).order('created_at'),
  ])

  return (
    <SettingsClient
      business={business}
      secrets={secrets}
      initialServices={services || []}
      initialProfessionals={professionals || []}
      initialLocations={locations || []}
      mpConnectEnabled={mpConnectConfigured()}
    />
  )
}
