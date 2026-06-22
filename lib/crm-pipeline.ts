// ── Pipeline del CRM: STAGES (fuente de verdad de etapas) + totales por columna ─────────────────
// Módulo PURO (sin DB ni React ni 'use server'): lo consumen el tablero (Plan 02), los totales $ por
// columna y Phase 5 (RPT-02), y también los schemas zod (que calcan el enum de stage de STAGES).
//
// STAGES es la ÚNICA fuente de verdad de las 5 etapas del embudo. Sus keys coinciden EXACTAMENTE con
// el CHECK de deals.stage en la migración 034 (lead/calificado/trial/propuesta/pago). NO se duplica
// el listado de etapas en ningún otro lado: stage = text + CHECK en DB (D-03, no enum nativo), y acá
// vive la representación de UI (label/color/order).

// Colores mapeados a tokens CSS confirmados en app/globals.css (líneas 173-178):
//   lead       → gris  (var(--muted-foreground))   — prospecto recién entrado
//   calificado → azul  (var(--crm-info))            — contacto validado
//   trial      → amarillo (var(--primary))          — probando el producto
//   propuesta  → ámbar (var(--primary))             — propuesta enviada (mismo hue primary, distinto orden)
//   pago       → verde (var(--crm-success))         — convertido / ganado
export const STAGES = [
  { key: 'lead', label: 'Lead', color: 'var(--muted-foreground)', order: 0 },
  { key: 'calificado', label: 'Calificado', color: 'var(--crm-info)', order: 1 },
  { key: 'trial', label: 'Trial', color: 'var(--primary)', order: 2 },
  { key: 'propuesta', label: 'Propuesta', color: 'var(--primary)', order: 3 },
  { key: 'pago', label: 'Pago', color: 'var(--crm-success)', order: 4 },
] as const

// Key de etapa derivada de STAGES (typeof): no se redeclara el union a mano.
export type StageKey = (typeof STAGES)[number]['key']

// Status del deal, ortogonal al stage (D-04). Calca el CHECK de deals.status en 034.
export type DealStatus = 'open' | 'won' | 'lost'

// Forma mínima de un deal para los cálculos de totales (las queries traen más columnas; acá solo las
// que importan para sumar).
export type DealTotalsInput = {
  stage: StageKey
  value_ars: number
  status: DealStatus
}

/**
 * stageTotals — suma value_ars de los deals OPEN por etapa. Los deals won/lost NO suman al total de
 * su columna (un deal ganado o perdido ya salió del embudo activo). Devuelve un Record con TODAS las
 * keys de STAGES (las etapas sin deals open quedan en 0).
 */
export function stageTotals(deals: DealTotalsInput[]): Record<StageKey, number> {
  const totals = Object.fromEntries(STAGES.map((s) => [s.key, 0])) as Record<StageKey, number>
  for (const deal of deals) {
    if (deal.status !== 'open') continue
    totals[deal.stage] += deal.value_ars
  }
  return totals
}

/**
 * pipelineSummary — totales del header del tablero: $ abiertos (status open) vs $ ganados (status won).
 * 'lost' no suma a ninguno. Alimenta el copy "$X abiertos · $Y ganados".
 */
export function pipelineSummary(deals: DealTotalsInput[]): { openTotal: number; wonTotal: number } {
  let openTotal = 0
  let wonTotal = 0
  for (const deal of deals) {
    if (deal.status === 'open') openTotal += deal.value_ars
    else if (deal.status === 'won') wonTotal += deal.value_ars
  }
  return { openTotal, wonTotal }
}
