import { createAdminClient } from '@/lib/supabase/admin'
import { getBusinessSecrets, type BusinessSecrets } from '@/lib/business-secrets'
import { sendExpiredHoldEmail } from '@/lib/email'
import { getPlanPrices } from '@/lib/plan-prices'
import { computeSnapshotRows, type BizRow } from '@/lib/crm-reports'
import { generateAbonoOccurrences } from '@/lib/abono-generation'
import { todayInAR } from '@/lib/booking-window'
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

// Cap del array skipped_occurrences persistido en cada abono: se guarda SOLO la cola más reciente (las
// últimas 50). Un abono `active` es INDEFINIDO: el cron appendea skips cada día que encuentra conflictos,
// así que sin techo el JSONB crecería para siempre. Es el MISMO cap que usa el alta manual (Plan 03) →
// los dos puntos de escritura coinciden. Se conserva la semántica de ACUMULACIÓN (append) y sólo se
// recorta la cola retenida.
const SKIPPED_CAP = 50

// 'yyyy-MM-dd' de un Date por sus componentes LOCALES (todayInAR devuelve medianoche local del día
// calendario AR). Idéntico al helper del alta (app/api/abonos/create) para que ambos bordes de ventana
// coincidan con la misma noción de "hoy" (hora AR, no new Date() crudo en UTC).
function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// addDaysISO: suma días a un 'yyyy-MM-dd' en UTC puro (no cruza DST ni desfasa el día). Comparar strings
// 'yyyy-MM-dd' lexicográficamente equivale a comparar fechas.
function addDaysISO(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

// ── Turnos REALES ya generados por una serie (D-07′) ────────────────────────────────────────────
// Cuenta los appointments NO cancelados etiquetados con ese abono_id. Es la fuente de verdad del
// progreso del abono FINITO: un choque no consume sesión (no crea turno) y un turno cancelado deja de
// contar. NO se puede usar result.created.length del motor: su `continue` de idempotencia (ocurrencia ya
// materializada) NO incrementa `created`, así que un re-run devolvería 0 y el finito se pasaría de N.
// SIEMPRE acotado por business_id (tenant, T-06-16/T-06-25). El alta manual (app/api/abonos/create) hace
// el MISMO conteo — los dos puntos que deciden 'completed' comparten criterio (igual que SKIPPED_CAP).
async function countAbonoAppointments(supabase: SupabaseClient, businessId: string, abonoId: string): Promise<number> {
  const { count } = await supabase
    .from('appointments')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', businessId)
    .eq('abono_id', abonoId)
    .neq('status', 'cancelled')
  return count ?? 0
}

export type ExtendAbonosResult = {
  abonosExtended: number
  abonoOccurrencesGenerated: number
  abonoOccurrencesSkipped: number
}

// Extensión de la ventana rolling de los abonos activos (ABONO-06, D-05/D-06): piggyback en el cron
// DIARIO existente (Vercel Hobby = 1 cron/día, NO se agrega un cron nuevo ni se toca vercel.json —
// T-06-18). Best-effort en su PROPIO try/catch (mismo criterio que writeMonthlySnapshot): un fallo de la
// extensión NO aborta cancel-expired. Además cada abono se procesa en su propio try/catch → un abono que
// falla no frena a los demás ni al cron (T-06-17).
//
// Por cada abono `active` genera SOLO la cola nueva (desde generated_until+1 día, o hoy si nunca se
// generó, hasta hoy + abono_window_weeks) reusando el motor del Plan 02 (generateAbonoOccurrences →
// createAppointmentCore, núcleo atómico) — NUNCA un insert directo (T-06-15). Ante conflicto la ocurrencia
// se saltea y se acumula en skipped, sin pisar el turno ajeno (D-06). Luego avanza generated_until al borde
// (idempotente: re-correr sobre la misma ventana el mismo día es no-op) y appendea los skipped nuevos.
// Los abonos FINITOS de N sesiones (total_occurrences, D-07′) usan el MISMO mecanismo rolling pero
// acotado por `maxCreated = N − turnos reales generados`; al llegar a N pasan a 'completed' y dejan de
// entrar al select. Los INDEFINIDOS (total_occurrences null) siguen extendiéndose para siempre
// (capados a SKIPPED_CAP). El cron corre con service-role (sin sesión → RLS NO aplica): el aislamiento por
// tenant lo da el motor, que filtra TODA query por el business_id del abono, y el UPDATE del abono lleva
// `.eq('business_id', ...)` (T-06-16).
export async function extendAbonoWindows(supabase: SupabaseClient): Promise<ExtendAbonosResult> {
  const out: ExtendAbonosResult = { abonosExtended: 0, abonoOccurrencesGenerated: 0, abonoOccurrencesSkipped: 0 }
  try {
    // El business es el tenant del abono: traemos id + buffer_minutes (lo usa el core) + abono_window_weeks
    // (borde de la ventana, migr. 054) por join to-one. Con service-role no hay RLS; iteramos por abono.
    const { data: abonos, error } = await supabase
      .from('abonos')
      .select(
        'id, business_id, client_id, day_of_week, start_time, service_id, professional_id, location_id, total_occurrences, generated_until, skipped_occurrences, businesses(id, buffer_minutes, abono_window_weeks)'
      )
      .eq('status', 'active') // 'completed' (finito que ya juntó sus N) y 'cancelled' quedan afuera (D-07′)
    if (error) {
      console.error('[cron/abono-extend] abonos read error:', error.message)
      return out
    }
    if (!abonos || abonos.length === 0) return out

    // "Hoy" en hora AR (no new Date() crudo): el server corre en UTC en Vercel — misma fuente de verdad
    // del borde que la ventana de reserva pública y el alta del abono.
    const today = todayInAR()
    const todayStr = toISODate(today)

    for (const abono of abonos) {
      try {
        const biz = abono.businesses as unknown as
          | { id: string; buffer_minutes: number | null; abono_window_weeks: number | null }
          | null
        if (!biz?.id) continue

        // Borde de la ventana para ESTE negocio: hoy + abono_window_weeks*7 (default 8). Mismo cálculo que
        // el alta (componentes locales sobre todayInAR).
        const windowWeeks = Number(biz.abono_window_weeks) || 8
        const toDate = toISODate(new Date(today.getFullYear(), today.getMonth(), today.getDate() + windowWeeks * 7))

        // ── Abono FINITO de N sesiones (D-07′) ────────────────────────────────────────────────────
        // Se resuelve ANTES del corte por ventana cubierta (fromDate > toDate): un finito que ya llegó a
        // N tiene la ventana cubierta, y si saliéramos por ese `continue` nunca se marcaría 'completed'.
        // El tope de ESTA corrida es N − turnos REALES ya generados (un choque no consume sesión), así
        // que el finito converge a exactamente N aunque tarde varias ventanas. maxCreated sólo ACOTA la
        // generación, nunca la fuerza: ninguna validación del core se relaja (T-06-23).
        const totalOccurrences = abono.total_occurrences as number | null
        let maxCreated: number | undefined
        if (totalOccurrences != null) {
          const generated = await countAbonoAppointments(supabase, abono.business_id as string, abono.id as string)
          if (generated >= totalOccurrences) {
            // Ya juntó sus N: se cierra la serie y el cron deja de extenderla (no vuelve a entrar al
            // select de arriba). UPDATE acotado por id + business_id (tenant, T-06-16).
            await supabase
              .from('abonos')
              .update({ status: 'completed' })
              .eq('id', abono.id)
              .eq('business_id', abono.business_id)
            continue
          }
          maxCreated = totalOccurrences - generated
        }

        // fromDate = SOLO la cola nueva: el mayor entre hoy y (generated_until + 1 día). Si el abono nunca
        // se generó (generated_until null), arranca hoy. Si la ventana ya está cubierta (fromDate > toDate)
        // no hay cola → se saltea (idempotencia del rolling: re-correr el mismo día es no-op).
        const generatedUntil = abono.generated_until as string | null
        const nextAfterGenerated = generatedUntil ? addDaysISO(generatedUntil, 1) : todayStr
        const fromDate = nextAfterGenerated > todayStr ? nextAfterGenerated : todayStr
        if (fromDate > toDate) continue

        const result = await generateAbonoOccurrences({
          supabase,
          business: { id: biz.id, buffer_minutes: biz.buffer_minutes },
          abono: {
            id: abono.id as string,
            client_id: abono.client_id as string | null,
            day_of_week: abono.day_of_week as number,
            start_time: abono.start_time as string,
            service_id: abono.service_id as string | null,
            professional_id: abono.professional_id as string | null,
            location_id: abono.location_id as string | null,
          },
          fromDate,
          toDate,
          maxCreated, // undefined en los indefinidos (rolling sin tope), N − generados en los finitos
        })

        // ¿El finito llegó a N con esta tanda? Se RECUENTA contra la DB (mismo criterio que arriba y que
        // el alta manual): result.created.length no alcanza porque no incluye lo ya materializado.
        const completed =
          totalOccurrences != null &&
          (await countAbonoAppointments(supabase, abono.business_id as string, abono.id as string)) >= totalOccurrences

        // Persistir el estado rolling (el motor es PURO, no toca la fila): avanzar generated_until al borde
        // y ACUMULAR los skipped nuevos sobre los existentes, capando a la cola más reciente (SKIPPED_CAP).
        // Si el finito ya juntó sus N, la serie se cierra en el mismo UPDATE ('completed' → deja de entrar
        // al select de abonos activos). UPDATE acotado por id + business_id (tenant, T-06-16).
        const existingSkipped = Array.isArray(abono.skipped_occurrences)
          ? (abono.skipped_occurrences as { date: string; reason: string }[])
          : []
        await supabase
          .from('abonos')
          .update({
            generated_until: toDate,
            skipped_occurrences: [...existingSkipped, ...result.skipped].slice(-SKIPPED_CAP),
            ...(completed ? { status: 'completed' } : {}),
          })
          .eq('id', abono.id)
          .eq('business_id', abono.business_id)

        out.abonosExtended++
        out.abonoOccurrencesGenerated += result.created.length
        out.abonoOccurrencesSkipped += result.skipped.length
      } catch (e) {
        // Un abono que falla NO frena al resto ni al cron (T-06-17).
        console.error(`[cron/abono-extend] abono ${abono.id} FALLÓ:`, e instanceof Error ? e.message : e)
      }
    }
    return out
  } catch (e) {
    console.error('[cron/abono-extend] FALLÓ:', e instanceof Error ? e.message : e)
    return out
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
    // Sin holds vencidos hoy, pero el snapshot mensual y la extensión de abonos igual deben correr
    // (ambos diarios/idempotentes/best-effort, D-01/D-05).
    const snapshotRows = await writeMonthlySnapshot(supabase)
    const abonos = await extendAbonoWindows(supabase)
    return Response.json({ cancelled: 0, snapshotRows, ...abonos })
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

  // Extensión de la ventana rolling de abonos activos (best-effort, idempotente, D-05); su propio
  // try/catch → no aborta cancel-expired aunque falle.
  const abonos = await extendAbonoWindows(supabase)

  return Response.json({ cancelled: ids.length, emailed, snapshotRows, ...abonos })
}
