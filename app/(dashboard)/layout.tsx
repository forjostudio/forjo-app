import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Sidebar } from '@/components/dashboard/sidebar'
import { PlanBanner } from '@/components/dashboard/plan-banner'
import { TestModeBanner } from '@/components/dashboard/test-mode-banner'
import { MpConnectionBanner } from '@/components/dashboard/mp-connection-banner'
import { VerticalProvider } from '@/lib/use-terminology'
import { resolveVertical } from '@/lib/verticals'
import { PaletteScript } from '@/components/palette-script'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: business } = await supabase
    .from('businesses')
    .select('*')
    .eq('owner_id', user.id)
    .single()

  if (!business) redirect('/onboarding')

  const planStatus = business.plan_status ?? 'trial'

  // D-06: suspender = corte REAL, no marca. Un negocio suspendido NO entra al dashboard — se redirige
  // a /suspendido (fuera del route group (dashboard), sin sidebar). Va antes del return del JSX para
  // no renderizar parcialmente el dashboard. redirect() LANZA NEXT_REDIRECT: no envolver en try/catch.
  if (planStatus === 'suspended') redirect('/suspendido')

  const daysLeft = business.trial_ends_at
    ? Math.max(0, Math.ceil((new Date(business.trial_ends_at).getTime() - Date.now()) / 86_400_000))
    : 30

  const vertical = resolveVertical(business)

  return (
    <VerticalProvider vertical={vertical}>
      <PaletteScript palette={business.palette} theme={business.theme} font={business.font} />
      <div className="min-h-screen">
        <Sidebar business={business} />
        <main className="lg:pl-60 pt-14 lg:pt-0 min-h-screen">
          <TestModeBanner />
          <MpConnectionBanner connectionError={business.mp_connection_status === 'error' && !!business.mp_user_id} />
          <Suspense fallback={null}>
            <PlanBanner planStatus={planStatus} daysLeft={daysLeft} />
          </Suspense>
          <div className="p-4 sm:p-6 lg:p-8">
            {children}
          </div>
        </main>
      </div>
    </VerticalProvider>
  )
}
