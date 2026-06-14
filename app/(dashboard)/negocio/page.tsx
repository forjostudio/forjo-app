import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { mpConnectConfigured } from '@/lib/mercadopago'
import { SettingsClient } from '../settings/settings-client'

export default async function NegocioPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: business } = await supabase.from('businesses').select('*').eq('owner_id', user.id).single()
  if (!business) redirect('/onboarding')

  return (
    <SettingsClient
      business={business}
      initialServices={[]}
      initialProfessionals={[]}
      initialLocations={[]}
      mpConnectEnabled={mpConnectConfigured()}
      view="negocio"
    />
  )
}
