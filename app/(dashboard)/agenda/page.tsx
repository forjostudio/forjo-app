import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AgendaClient } from './agenda-client'

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

  const [{ data: timeBlocks }, { data: locations }, { data: exceptions }] = await Promise.all([
    supabase.from('time_blocks').select('*').eq('business_id', business.id).order('day_of_week').order('start_time'),
    supabase.from('locations').select('*').eq('business_id', business.id).order('created_at'),
    supabase.from('schedule_exceptions').select('*').eq('business_id', business.id).order('date'),
  ])

  return (
    <AgendaClient
      business={business}
      initialTimeBlocks={timeBlocks || []}
      initialLocations={locations || []}
      initialExceptions={exceptions || []}
    />
  )
}
