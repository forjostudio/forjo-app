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

  const [{ data: services }, { data: locations }] = await Promise.all([
    supabase.from('services').select('*').eq('business_id', business.id).order('created_at'),
    supabase.from('locations').select('*').eq('business_id', business.id).order('created_at'),
  ])

  return (
    <SettingsClient
      business={business}
      initialServices={services || []}
      initialProfessionals={[]}
      initialLocations={locations || []}
      mpConnectEnabled={mpConnectConfigured()}
      view="servicios"
    />
  )
}
