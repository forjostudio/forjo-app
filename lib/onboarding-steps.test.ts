import { describe, it, expect } from 'vitest'
import { wizardSteps, stepperSteps, INTEGRACIONES_STEP } from '@/lib/onboarding-steps'

// ── Test PURO: sin red, sin credenciales, sin Supabase ─────────────────────────────────────────
// Importa SOLO de @/lib/onboarding-steps. Nada del helper de entorno de la carpeta test/ (eso es la
// marca de un test de integración). Analog: lib/auth/callback.test.ts.
//
// Qué protege: la navegación del wizard (`wizardSteps`) y el pintado del stepper (`stepperSteps`) son
// listas distintas. Si el paso 5 «Integraciones» entrara en la de navegación, el último paso del
// wizard dejaría de ser Horarios y el botón «Finalizar» desaparecería.

const NO_CANCHAS = ['belleza', 'salud', 'general', '']

describe('wizardSteps', () => {
  it.each(NO_CANCHAS.map(v => [v]))('%j → los cuatro pasos de hoy', (v) => {
    const steps = wizardSteps(v)
    expect(steps.map(s => s.n)).toEqual([1, 2, 3, 4])
    expect(steps.map(s => s.label)).toEqual(['Tu negocio', 'Servicios', 'Profesionales', 'Horarios'])
  })

  it('canchas → sin Profesionales', () => {
    expect(wizardSteps('canchas').map(s => s.n)).toEqual([1, 2, 4])
  })

  it.each([...NO_CANCHAS, 'canchas'].map(v => [v]))('%j → nunca incluye el 5 y termina en Horarios (Finalizar no se mueve)', (v) => {
    const steps = wizardSteps(v)
    expect(steps.some(s => s.n === 5)).toBe(false)
    expect(steps[steps.length - 1].n).toBe(4)
  })
})

describe('stepperSteps', () => {
  it('belleza → cinco nodos, el último Integraciones', () => {
    const steps = stepperSteps('belleza')
    expect(steps.map(s => s.n)).toEqual([1, 2, 3, 4, 5])
    expect(steps).toHaveLength(5)
    expect(steps[steps.length - 1]).toEqual({ n: 5, label: 'Integraciones' })
  })

  it('canchas → cuatro nodos visibles', () => {
    const steps = stepperSteps('canchas')
    expect(steps.map(s => s.n)).toEqual([1, 2, 4, 5])
    expect(steps).toHaveLength(4)
  })

  it('INTEGRACIONES_STEP es el n=5', () => {
    expect(INTEGRACIONES_STEP).toEqual({ n: 5, label: 'Integraciones' })
  })
})

describe('arreglos nuevos en cada llamada', () => {
  it('mutar el resultado no altera la llamada siguiente', () => {
    const a = wizardSteps('belleza')
    a.pop()
    a[0].label = 'pisado'
    expect(wizardSteps('belleza').map(s => s.n)).toEqual([1, 2, 3, 4])
    expect(wizardSteps('belleza')[0].label).toBe('Tu negocio')

    const b = stepperSteps('belleza')
    b.length = 0
    expect(stepperSteps('belleza')).toHaveLength(5)
  })
})
