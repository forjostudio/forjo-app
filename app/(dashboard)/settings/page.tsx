import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
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

  const [{ data: services }, { data: professionals }, { data: timeBlocks }, { data: locations }] = await Promise.all([
    supabase.from('services').select('*').eq('business_id', business.id).order('created_at'),
    supabase.from('professionals').select('*').eq('business_id', business.id).order('created_at'),
    supabase.from('time_blocks').select('*').eq('business_id', business.id).order('day_of_week').order('start_time'),
    supabase.from('locations').select('*').eq('business_id', business.id).order('created_at'),
  ])

  return (
    <SettingsClient
      business={business}
      initialServices={services || []}
      initialProfessionals={professionals || []}
      initialTimeBlocks={timeBlocks || []}
      initialLocations={locations || []}
    />
  )
}
