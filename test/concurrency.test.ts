import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { hasSupabaseCreds } from './env'
import { seedOneTenant, teardownOneTenant, seedTimeBlock, type SeededTenant } from './helpers/booking-fixtures'

// ── Tests de concurrencia: cupos grupales (Phase 2 — CONC-01, CONC-02, CUPOS-03) ──────────
//
// ⚠ SCAFFOLD (Wave 0). Este archivo es el esqueleto que Plan 02-05 completa con los cuerpos reales
// (moldes en 02-RESEARCH.md §CONC-01 / §CONC-02 / §CUPOS-03). Acá SOLO se deja la estructura del
// suite + el seed del tenant/time_block para que los `it` existan y se puedan filtrar con `-t`.
// Los cuerpos son placeholders que FALLAN a propósito (expect.fail) — NO deben pasar en falso, así
// el gate de Plan 05 los ve rojos hasta que se implementen.
//
// describe.skipIf(!hasSupabaseCreds): sin las 3 creds de Supabase, se skipean (igual que booking-core).
// Corren contra Supabase LOCAL (supabase db reset PG17) o el proyecto dev compartido.
//
// Fecha futura fija (lunes) para alinear con el day_of_week del time_block sembrado (seedTimeBlock
// default day_of_week=1) y no chocar con turnos pasados.
const DATE = '2031-03-03' // lunes → EXTRACT(dow) = 1

describe.skipIf(!hasSupabaseCreds)('concurrencia: cupos grupales', () => {
  let t: SeededTenant
  let supabase: SupabaseClient

  beforeAll(async () => {
    // Tenant con buffer 0 y servicio de 30'. El time_block lo siembra cada test con su capacity
    // (CONC-01/CUPOS-03 cupo N; CONC-02 cupo 1), así que acá NO se siembra el bloque por defecto.
    t = await seedOneTenant({ bufferMinutes: 0, serviceDurationMinutes: 30 })
    supabase = t.admin
  })

  afterAll(async () => {
    if (t) await teardownOneTenant(t)
  })

  // Cada test limpia appointments + time_blocks para no contaminar al siguiente (mismo business/date).
  afterEach(async () => {
    if (t) {
      await t.admin.from('appointments').delete().eq('business_id', t.businessId)
      await t.admin.from('time_blocks').delete().eq('business_id', t.businessId)
    }
  })

  // CONC-01 — anti-sobrecupo bajo concurrencia: con capacity=2 y 1 lugar ocupado, dos altas EN
  // PARALELO sobre el último lugar deben resolver exactamente 1 ok + 1 slot_full (el advisory lock
  // del RPC serializa la carrera en la DB). Plan 05: sembrar seedTimeBlock({ capacity: 2 }), ocupar
  // seat 0, luego Promise.all de dos createAppointmentCore y asertar oks=1 / fulls=1 + exactamente 2
  // filas confirmadas en el slot (no 3).
  it('CONC-01 — anti-sobrecupo: dos reservas concurrentes sobre el último lugar, solo una confirma', async () => {
    void seedTimeBlock // referencia para evitar unused hasta Plan 05
    expect.fail('pendiente: Plan 02-05 completa el cuerpo (molde 02-RESEARCH.md §CONC-01)')
  })

  // CONC-02 — no-regresión cupo 1: con capacity=1 (default), la 2ª reserva del mismo slot debe dar
  // slot_taken (NO slot_full) — el índice único de seat (seat 0 único) rechaza la 2ª igual que hoy.
  // Plan 05: seedTimeBlock({ capacity: 1 }), 1ª ok, 2ª → error 'slot_taken'.
  it('CONC-02 — no-regresion: capacity=1 sigue rechazando la 2ª con slot_taken', async () => {
    expect.fail('pendiente: Plan 02-05 completa el cuerpo (molde 02-RESEARCH.md §CONC-02)')
  })

  // CUPOS-03 — admite hasta capacity y rechaza el excedente: con capacity=N, las primeras N altas
  // confirman (seats 0..N-1) y la N+1 da slot_full. Plan 05: seedTimeBlock({ capacity: N }), loop de
  // N altas ok + 1 alta extra → 'slot_full'.
  it('CUPOS-03 — admite hasta capacity y rechaza el excedente con slot_full', async () => {
    expect.fail('pendiente: Plan 02-05 completa el cuerpo (molde 02-RESEARCH.md §CUPOS-03)')
  })
})
