import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { resolveVertical } from '@/lib/verticals'
import { ClinicalHistoryClient } from './clinical-history-client'

export default async function ClinicalHistoryPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: business } = await supabase
    .from('businesses')
    .select('*')
    .eq('owner_id', user.id)
    .single()

  if (!business) redirect('/onboarding')

  // La historia clínica solo existe para el rubro salud.
  if (resolveVertical(business).key !== 'salud') redirect('/dashboard')

  const { data: clients } = await supabase
    .from('clients')
    .select('*')
    .eq('business_id', business.id)
    .order('name', { ascending: true })

  return (
    <ClinicalHistoryClient
      initialClients={clients || []}
      businessId={business.id}
      primaryColor={business.primary_color || '#d94a2b'}
    />
  )
}
