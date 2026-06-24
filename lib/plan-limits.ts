import { getPlanLimits } from './plans'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function checkProfessionalLimit(businessId: string, supabase: any) {
  const [{ data: biz }, { count }] = await Promise.all([
    supabase.from('businesses').select('plan').eq('id', businessId).single(),
    supabase.from('professionals')
      .select('*', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .eq('active', true),
  ])
  const limits = getPlanLimits(biz?.plan || 'basic')
  const current = count || 0
  return { current, max: limits.max_agendas, canAdd: current < limits.max_agendas }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function checkLocationLimit(businessId: string, supabase: any) {
  // Sucursales sin tope de plan: el límite del negocio es la cantidad de agendas.
  const { count } = await supabase.from('locations')
    .select('*', { count: 'exact', head: true })
    .eq('business_id', businessId)
    .eq('is_active', true)
  return { current: count || 0, max: Infinity, canAdd: true }
}
