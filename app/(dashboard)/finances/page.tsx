import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { FinancesClient } from './finances-client'

export default async function FinancesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: business } = await supabase
    .from('businesses')
    .select('id')
    .eq('owner_id', user.id)
    .single()

  if (!business) redirect('/onboarding')

  return <FinancesClient businessId={business.id} />
}
