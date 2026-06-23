import { STAGES, type StageKey, type DealStatus } from '@/lib/crm-pipeline'

// ── Módulo PURO de cálculos de Reportes de Ventas (RPT-01/RPT-02) ───────────────────────────────
// Espejo de lib/crm-metrics.ts y lib/crm-pipeline.ts: SIN DB, SIN React, SIN 'use server'. Tipos de
// dominio arriba, `now` inyectable como ÚLTIMO parámetro para determinismo en test. Disciplina
// null-not-NaN (D-05): datos faltantes devuelven `null`, nunca NaN/Infinity.
//
// La fórmula MRR se REUSA tal cual de computeKpis (crm-metrics.ts:53-61): Σ(prices[plan] ?? 0) sobre
// los negocios con plan_status === 'active'. El `?? 0` evita NaN cuando un plan activo no tiene precio.
// El orden del embudo viene de STAGES (crm-pipeline.ts) — única fuente de verdad, NO se redeclara (D-04).

// ── Tipos de dominio ───────────────────────────────────────────────────────────────────────────
// Subconjunto de columnas de `businesses` que necesitan los cálculos de reportes (MRR/ranking/snapshot).
export type BizRow = {
  id: string
  name: string
  plan: string
  plan_status: string
}

// Mapa plan_key → precio ARS (lo provee getPlanPrices, leído de plan_prices). D-02: ARS, no USD.
export type Prices = Record<string, number>

// Una fila del snapshot mensual de MRR (1 por mes/plan). month = 'YYYY-MM-01' en zona AR.
export type SnapshotRow = { month: string; plan: string; mrr: number; active_count: number }

// Un escalón del embudo: count = deals que ALCANZARON esta etapa; pct = ratio vs la etapa anterior.
export type FunnelStep = { key: StageKey; label: string; count: number; pct: number | null }

// Resultado de churn: bajas = count neto; pct = null cuando no hay historia previa (D-05, NUNCA NaN).
export type ChurnResult = { bajas: number; pct: number | null }

// Una fila del ranking de cuentas por MRR. var = null cuando no hay snapshot previo del negocio.
export type RankingRow = { id: string; name: string; plan: string; mrr: number; var: number | null }

// Zona AR fija (UTC-3 sin DST). Para la month-key usamos el offset literal -03:00 (Pitfall 5).
const AR_OFFSET = '-03:00'

// ── Helpers ──────────────────────────────────────────────────────────────────────────────────
// MRR de un negocio: precio de su plan si está activo, 0 si no (o si no hay fila de precio).
function bizMrr(row: BizRow, prices: Prices): number {
  if (row.plan_status !== 'active') return 0
  return prices[row.plan] ?? 0
}

// Primer día del mes en zona AR como 'YYYY-MM-01'. Reinterpretamos el instante UTC en el offset literal
// -03:00 para obtener la fecha civil argentina, y de ahí el mes (Pitfall 5: nunca usar getMonth() UTC
// crudo, que rompe en el borde de mes para horas de la madrugada AR).
function arMonthKey(now: Date): string {
  // Desplazar el instante 3h hacia atrás equivale a leer la hora de pared AR en componentes UTC.
  const arWall = new Date(now.getTime() - 3 * 3_600_000)
  const y = arWall.getUTCFullYear()
  const m = String(arWall.getUTCMonth() + 1).padStart(2, '0')
  return `${y}-${m}-01`
}

// ── mrrByPlan (D-06: donut "MRR por plan") ─────────────────────────────────────────────────────
/**
 * Agrupa el MRR del mes actual por plan: solo cuenta los `plan_status === 'active'`, suma
 * `prices[plan] ?? 0` (add-ons NO entran, D-02). Devuelve por plan `{ mrr, count }`. Los planes sin
 * negocios activos NO aparecen en el objeto (el caller decide si los muestra en 0).
 */
export function mrrByPlan(rows: BizRow[], prices: Prices): Record<string, { mrr: number; count: number }> {
  const out: Record<string, { mrr: number; count: number }> = {}
  for (const r of rows) {
    if (r.plan_status !== 'active') continue
    const e = (out[r.plan] ??= { mrr: 0, count: 0 })
    e.mrr += prices[r.plan] ?? 0
    e.count += 1
  }
  return out
}

// ── arpa (D-05: tarjeta ARPA) ──────────────────────────────────────────────────────────────────
/**
 * ARPA = MRR / negocios activos. Guard de divide-by-zero → 0 (nunca NaN/Infinity): sin activos no hay
 * promedio que mostrar, así que devolvemos 0 en vez de un valor inválido.
 */
export function arpa(mrr: number, activos: number): number {
  if (activos <= 0) return 0
  return mrr / activos
}

// ── funnel (D-04: embudo por etapa alcanzada, ventana de 90d la aplica el caller) ────────────────
/**
 * Embudo de conversión por ETAPA ALCANZADA: un deal en la etapa N cuenta en las etapas 1..N. Los
 * ganados (`status === 'won'`) cuentan hasta `pago` (alcanzaron todo el embudo); los perdidos
 * (`status === 'lost'`) cortan en su última etapa alcanzada (su `stage`). `pct[N] = count[N]/count[N-1]`;
 * la primera etapa tiene `pct = null` (no hay etapa anterior). Si la etapa anterior tiene 0 deals,
 * `pct = null` también (evita división por cero). Orden = STAGES (no se redeclara).
 *
 * La función recibe los deals YA filtrados a la ventana de 90 días (lo hace la query del caller).
 */
export function funnel(deals: { stage: StageKey; status: DealStatus }[]): FunnelStep[] {
  // order alcanzado por cada deal: won llega al último (pago); el resto, al order de su stage.
  const stageOrder = (s: StageKey) => STAGES.find((st) => st.key === s)?.order ?? 0
  const maxOrder = STAGES.length - 1

  const counts = STAGES.map(() => 0)
  for (const deal of deals) {
    const reached = deal.status === 'won' ? maxOrder : stageOrder(deal.stage)
    // Suma 1 en cada etapa 0..reached (etapa alcanzada). 'lost' usa su stage (su última etapa).
    for (let i = 0; i <= reached; i++) counts[i] += 1
  }

  return STAGES.map((stage, i) => {
    let pct: number | null = null
    if (i > 0) {
      const prev = counts[i - 1]
      pct = prev > 0 ? counts[i] / prev : null
    }
    return { key: stage.key, label: stage.label, count: counts[i], pct }
  })
}

// ── churn (D-05: cuenta neta de bajas; pct null sin historia previa) ─────────────────────────────
/**
 * Churn del mes: bajas = count('business.suspend') − count('business.reactivate') de la ventana del
 * mes (codes confirmados en _actions.ts). El % usa como denominador el `active_count` del mes ANTERIOR
 * (`prevActiveCount`); si es `null` o `0` (sin snapshot previo, primer mes), `pct = null` — empty-state
 * honesto "sin historia suficiente", NUNCA un % inventado ni NaN/Infinity (Pitfall 6).
 */
export function churn(events: { action: string }[], prevActiveCount: number | null): ChurnResult {
  let suspend = 0
  let reactivate = 0
  for (const e of events) {
    if (e.action === 'business.suspend') suspend += 1
    else if (e.action === 'business.reactivate') reactivate += 1
  }
  const bajas = suspend - reactivate
  if (prevActiveCount === null || prevActiveCount <= 0) return { bajas, pct: null }
  return { bajas, pct: bajas / prevActiveCount }
}

// ── ranking (D-07: top cuentas por MRR + VAR vs snapshot previo) ─────────────────────────────────
/**
 * Top cuentas por MRR (negocio, plan, MRR, VAR). MRR por negocio = precio de su plan si está activo
 * (0 si no). Ordena desc por MRR. La VAR vs el snapshot previo del negocio es `null` cuando no hay
 * historia (el cliente renderiza "—"); si hay snapshot previo, `var = mrr_actual − mrr_previo`.
 */
export function ranking(
  bizRows: BizRow[],
  prices: Prices,
  prevMrrByBiz?: Record<string, number>,
): RankingRow[] {
  const rows: RankingRow[] = bizRows.map((b) => {
    const mrr = bizMrr(b, prices)
    const prev = prevMrrByBiz?.[b.id]
    const variation = prev === undefined ? null : mrr - prev
    return { id: b.id, name: b.name, plan: b.plan, mrr, var: variation }
  })
  return rows.sort((a, b) => b.mrr - a.mrr)
}

// ── computeSnapshotRows (D-01: filas a upsertear en mrr_snapshots, 1 por plan activo) ────────────
/**
 * Construye las filas del snapshot mensual de MRR: una por plan ACTIVO con `{ month, plan, mrr,
 * active_count }`. `month` = primer día del mes en zona AR (offset literal -03:00). Idempotente por
 * forma: misma entrada → mismas filas; el dedupe real lo da la PK (month, plan) en DB (onConflict).
 * Reusa mrrByPlan para no duplicar la fórmula.
 */
export function computeSnapshotRows(rows: BizRow[], prices: Prices, now: Date = new Date()): SnapshotRow[] {
  const month = arMonthKey(now)
  const byPlan = mrrByPlan(rows, prices)
  return Object.entries(byPlan).map(([plan, { mrr, count }]) => ({
    month,
    plan,
    mrr,
    active_count: count,
  }))
}

// Exportado solo para legibilidad de tests/callers que necesiten la month-key sin recalcularla.
export { arMonthKey, AR_OFFSET }
