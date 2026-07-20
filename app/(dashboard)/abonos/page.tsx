import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AbonosClient, type AbonoRow } from './abonos-client'

// Página de abonos del panel (ABONO-01, D-04). Server Component: espeja agenda/page.tsx — resuelve el
// negocio por owner_id de la sesión y carga TODO filtrado por business.id (aislamiento por tenant, T-06-20).
// El público NUNCA lee abonos (RLS owner-only), así que acá sólo corre con la sesión del dueño (anon+RLS).
export default async function AbonosPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: business } = await supabase
    .from('businesses')
    .select('*')
    .eq('owner_id', user.id)
    .single()

  if (!business) redirect('/onboarding')

  // Datos del negocio en paralelo. Toda query filtra por business.id (tenant). Los abonos traen los
  // nombres (cliente / servicio / cancha) por join para la lista; los appointments con abono_id se usan
  // sólo para contar cuántos turnos generó cada serie (no cancelados).
  const [{ data: abonos }, { data: apptRows }, { data: services }, { data: professionals }, { data: locations }, { data: clients }] = await Promise.all([
    supabase
      .from('abonos')
      .select('id, day_of_week, start_time, status, generated_until, skipped_occurrences, created_at, clients(name), services(name), professionals(name)')
      .eq('business_id', business.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('appointments')
      .select('abono_id')
      .eq('business_id', business.id)
      .not('abono_id', 'is', null)
      .neq('status', 'cancelled'),
    supabase.from('services').select('*').eq('business_id', business.id).eq('active', true),
    supabase.from('professionals').select('*').eq('business_id', business.id).eq('active', true),
    supabase.from('locations').select('*').eq('business_id', business.id).order('created_at'),
    supabase.from('clients').select('*').eq('business_id', business.id).order('name', { ascending: true }),
  ])

  // Conteo de turnos generados por abono (en memoria; el set ya viene acotado por business_id).
  const turnoCounts: Record<string, number> = {}
  for (const r of apptRows || []) {
    const id = (r as { abono_id: string | null }).abono_id
    if (id) turnoCounts[id] = (turnoCounts[id] ?? 0) + 1
  }

  return (
    <AbonosClient
      business={business}
      abonos={(abonos || []) as unknown as AbonoRow[]}
      turnoCounts={turnoCounts}
      clients={clients || []}
      services={services || []}
      professionals={professionals || []}
      locations={locations || []}
    />
  )
}
