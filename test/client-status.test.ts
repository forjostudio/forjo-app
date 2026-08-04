import { describe, it, expect } from 'vitest'
import { PAUSED_AFTER_DAYS, classifyClient } from '@/lib/client-status'

// ── Phase 14 (POLISH-07) — tests puros de lib/client-status.ts ────────────────────
// Espejan test/staff-services.test.ts: describe/it/expect, import por el alias @/lib/...,
// SIN Supabase, SIN creds y SIN describe.skipIf → esta suite corre en cualquier entorno,
// aunque no haya un Supabase local levantado.
//
// Congelan las dos reglas que el panel de Clientes reimplementaba en dos lugares distintos:
//   - D-10: `visits === 0` ⇒ 'new', SIEMPRE. El sentinela de `daysSinceLast` (999 cuando la
//     persona no tiene ninguna fecha) ya no puede empujar un alta reciente a 'paused'.
//   - D-11: un único umbral de pausa (60 días) compartido por el filtro y por la sugerencia.
//     Con el umbral viejo del filtro (45) los 46-60 días caían en 'paused'; ahora no.

describe('PAUSED_AFTER_DAYS — el umbral único (D-11)', () => {
  it('vale 60 días ("2 meses"), el mismo número que describe el tab en REQUIREMENTS', () => {
    expect(PAUSED_AFTER_DAYS).toBe(60)
  })
})

describe('classifyClient — sin ninguna visita nunca es pausa (D-10)', () => {
  it('0 visitas con el sentinela de 999 días → new (el caso exacto del bug)', () => {
    expect(classifyClient({ visits: 0, daysSinceLast: 999 })).toBe('new')
  })

  it('0 visitas con 0 días → new', () => {
    expect(classifyClient({ visits: 0, daysSinceLast: 0 })).toBe('new')
  })
})

describe('classifyClient — cortes por cantidad de visitas', () => {
  it('1 visita reciente → new', () => {
    expect(classifyClient({ visits: 1, daysSinceLast: 10 })).toBe('new')
  })

  it('2 visitas reciente → active', () => {
    expect(classifyClient({ visits: 2, daysSinceLast: 10 })).toBe('active')
  })

  it('4 visitas reciente → active (último valor antes de frecuente)', () => {
    expect(classifyClient({ visits: 4, daysSinceLast: 10 })).toBe('active')
  })

  it('5 visitas reciente → frequent', () => {
    expect(classifyClient({ visits: 5, daysSinceLast: 10 })).toBe('frequent')
  })
})

describe('classifyClient — umbral de pausa unificado en 60 días (D-11)', () => {
  it('50 días sin venir → active (con el umbral viejo de 45 esto daba paused)', () => {
    expect(classifyClient({ visits: 3, daysSinceLast: 50 })).toBe('active')
  })

  it('60 días exactos NO es pausa: el corte es estrictamente mayor', () => {
    expect(classifyClient({ visits: 3, daysSinceLast: 60 })).toBe('active')
  })

  it('61 días sin venir → paused', () => {
    expect(classifyClient({ visits: 3, daysSinceLast: 61 })).toBe('paused')
  })

  it('la pausa sigue ganándole a frecuente (no es un cambio de comportamiento)', () => {
    expect(classifyClient({ visits: 7, daysSinceLast: 120 })).toBe('paused')
  })
})
