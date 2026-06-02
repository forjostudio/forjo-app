import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { FinancesClient } from './finances-client'
import { format, subMonths, startOfMonth } from 'date-fns'

export default async function FinancesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: business } = await supabase
    .from('businesses')
    .select('*')
    .eq('owner_id', user.id)
    .single()

  if (!business) redirect('/onboarding')

  const sixMonthsAgo = format(startOfMonth(subMonths(new Date(), 5)), 'yyyy-MM-dd')

  const { data: appointments } = await supabase
    .from('appointments')
    .select('*, services(name, price)')
    .eq('business_id', business.id)
    .neq('status', 'cancelled')
    .gte('date', sixMonthsAgo)
    .order('date', { ascending: false })

  return <FinancesClient appointments={appointments || []} />
}
