import { createClient } from '@/lib/supabase/server'
import { negocioDelPanel } from '@/lib/negocio-del-dueno'
import { redirect } from 'next/navigation'
import { mpConnectConfigured } from '@/lib/mercadopago'
import { SettingsClient } from '../settings/settings-client'

export default async function ConsultoriosPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const business = await negocioDelPanel(supabase, user.id, '*')

  const { data: locations } = await supabase.from('locations').select('*').eq('business_id', business.id).order('created_at')

  return (
    <SettingsClient
      business={business}
      initialServices={[]}
      initialProfessionals={[]}
      initialLocations={locations || []}
      mpConnectEnabled={mpConnectConfigured()}
      view="consultorios"
    />
  )
}
