import { createAdminClient } from '@/lib/supabase/admin'
import { getBusinessSecrets, type BusinessSecrets } from '@/lib/business-secrets'
import { sendExpiredHoldEmail } from '@/lib/email'
import { getPlanPrices } from '@/lib/plan-prices'
import { computeSnapshotRows, type BizRow } from '@/lib/crm-reports'
import type { NextRequest } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'

// Snapshot mensual de MRR (RPT-01, D-01): piggyback en el cron diario (Vercel Hobby = 1/día, NO se
// agrega un cron nuevo). Best-effort en su PROPIO try/catch (mismo criterio que el loop de emails): un
// fallo del snapshot NO aborta cancel-expired. Idempotente por la PK (month, plan).
// CONTRATO de congelado (WR-03): SOLO el mes EN CURSO se refresca — cada corrida del cron re-upsertea su
// fila con el MRR calculado a precios de HOY (getPlanPrices), así que si plan_prices cambia a mitad de
// mes, la barra del mes actual se recomputa con los precios nuevos en la próxima corrida. Los meses
// PASADOS quedan congelados de hecho porque su month-key ya no se vuelve a producir (no se re-upsertean),
// no porque el precio quede grabado. Reusa el mismo admin client (service-role) — no hay sesión admin en el cron.
async function writeMonthlySnapshot(supabase: SupabaseClient): Promise<number> {
  try {
    const [{ data: bizRows, error: bizErr }, prices] = await Promise.all([
      supabase.from('businesses').select('id, name, plan, plan_status'),
      getPlanPrices(),
    ])
    if (bizErr) {
      console.error('[cron/mrr-snapshot] businesses read error:', bizErr.message)
      return 0
    }
    const rows = computeSnapshotRows((bizRows ?? []) as BizRow[], prices)
    if (rows.length === 0) return 0
    const { error: snapErr } = await supabase
      .from('mrr_snapshots')
      .upsert(rows, { onConflict: 'month,plan' }) // dedupe = idempotencia (PK month,plan)
    if (snapErr) {
      console.error('[cron/mrr-snapshot] upsert error:', snapErr.message)
      return 0
    }
    return rows.length
  } catch (e) {
    console.error('[cron/mrr-snapshot] FALLÓ:', e instanceof Error ? e.message : e)
    return 0
  }
}

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  // Primero traemos los que se van a cancelar CON sus datos, para poder avisar al cliente.
  // Pitfall E: el nested join businesses(...) NO puede traer business_secrets → el join queda
  // con columnas NO secretas (incluye id para keyear los secretos) y los secretos Resend se
  // resuelven aparte con getBusinessSecrets, una sola vez por business_id distinto (abajo).
  const { data: expiring, error: fetchErr } = await supabase
    .from('appointments')
    .select('id, date, time, client_name, client_email, services(name), businesses(id, name, slug, primary_color, logo_url)')
    .eq('status', 'pending_payment')
    .lt('expires_at', new Date().toISOString())

  if (fetchErr) {
    console.error('Cron cancel-expired fetch error:', fetchErr)
    return Response.json({ error: fetchErr.message }, { status: 500 })
  }
  if (!expiring || expiring.length === 0) {
    // Sin holds vencidos hoy, pero el snapshot mensual igual debe correr (es diario/idempotente, D-01).
    const snapshotRows = await writeMonthlySnapshot(supabase)
    return Response.json({ cancelled: 0, snapshotRows })
  }

  const ids = expiring.map(a => a.id)
  const { error } = await supabase.from('appointments').update({ status: 'cancelled' }).in('id', ids)
  if (error) {
    console.error('Cron cancel-expired update error:', error)
    return Response.json({ error: error.message }, { status: 500 })
  }

  // Secretos Resend por negocio: el cron itera muchos turnos, así que resolvemos los secretos
  // UNA sola vez por business_id distinto (Map) en vez de una llamada por turno (Pitfall E).
  // getBusinessSecrets los lee de business_secrets (service-role).
  const secretsByBusiness = new Map<string, BusinessSecrets>()
  async function secretsFor(businessId: string): Promise<BusinessSecrets> {
    const cached = secretsByBusiness.get(businessId)
    if (cached) return cached
    const fetched = await getBusinessSecrets(businessId)
    secretsByBusiness.set(businessId, fetched)
    return fetched
  }

  // Aviso al cliente por cada turno cancelado (best-effort, awaiteado; branding del propio
  // negocio del turno → aislamiento por tenant). Un fallo de mail no aborta la cancelación.
  let emailed = 0
  for (const appt of expiring) {
    const business = appt.businesses as unknown as Record<string, string | null> | null
    if (!appt.client_email || !business?.id) continue
    const secrets = await secretsFor(business.id)
    try {
      await sendExpiredHoldEmail({
        to: appt.client_email,
        clientName: appt.client_name,
        service: (appt.services as { name?: string } | null)?.name || '',
        date: appt.date,
        time: appt.time,
        businessName: String(business.name || ''),
        businessSlug: String(business.slug || ''),
        primaryColor: business.primary_color,
        logoUrl: business.logo_url,
        resendApiKey: secrets.resend_api_key,
        resendFrom: secrets.resend_from,
      })
      emailed++
    } catch (e) {
      console.error(`[cancel-expired] email FALLÓ (turno ${appt.id}):`, e instanceof Error ? e.message : e)
    }
  }

  // Snapshot mensual de MRR (best-effort, idempotente) tras la lógica de cancel-expired (D-01).
  const snapshotRows = await writeMonthlySnapshot(supabase)

  return Response.json({ cancelled: ids.length, emailed, snapshotRows })
}
