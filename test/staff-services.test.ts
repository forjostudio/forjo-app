import { describe, it, expect } from 'vitest'
import {
  servicesForProfessional,
  professionalsForService,
  isServiceCovered,
} from '@/lib/staff-services'
import type { Professional, Service, ProfessionalService } from '@/lib/types'

// ── Phase 8 (equipo — staff↔servicios) — tests puros de lib/staff-services.ts ──────
// Espejan test/verticals.test.ts: describe/it/expect, import desde @/lib/..., SIN Supabase
// ni creds. Congelan la regla del comodín (D-01) que la UI de esta fase (D-08/D-10), el RPC
// de la Phase 9 y la grilla pública de la Phase 10 tienen que interpretar IGUAL:
//   - profesional con 0 filas en la puente = capaz de TODOS los servicios (comodín).
//   - profesional con ≥1 fila = capaz de exactamente los mapeados.
//   - un servicio queda sin cobertura SOLO si todos los activos tienen mapeo explícito y ninguno
//     lo marcó; si hay al menos un comodín entre los activos, todo servicio está cubierto.
//   - la cobertura cuenta SOLO profesionales activos (D-16); el caller pasa la lista ya filtrada.

// ── Factories mínimas (solo los campos que leen las funciones puras) ──────────────
function pro(id: string, active = true): Professional {
  return {
    id,
    business_id: 'biz',
    name: id,
    last_name: null,
    specialty: null,
    license_number: null,
    phone: null,
    email: null,
    photo_url: null,
    active,
    created_at: '2026-01-01',
  }
}

function svc(id: string): Service {
  return {
    id,
    business_id: 'biz',
    name: id,
    duration_minutes: 30,
    price: 0,
    description: null,
    active: true,
    capacity_mode: 'group_class',
    capacity: 1,
    created_at: '2026-01-01',
  }
}

function map(professional_id: string, service_id: string): ProfessionalService {
  return { business_id: 'biz', professional_id, service_id }
}

// Servicios del negocio para las suites
const services = [svc('corte'), svc('color'), svc('barba')]

// ── Suite 1: servicesForProfessional (qué hace cada persona) ──────────────────────
describe('servicesForProfessional — regla del comodín (D-01)', () => {
  it('profesional con 0 filas hace TODOS los servicios (comodín)', () => {
    const result = servicesForProfessional('ana', services, [])
    expect(result.map((s) => s.id).sort()).toEqual(['barba', 'color', 'corte'])
  })

  it('profesional con mapeo explícito hace SOLO los marcados', () => {
    const bridge = [map('ana', 'corte'), map('ana', 'barba')]
    const result = servicesForProfessional('ana', services, bridge)
    expect(result.map((s) => s.id).sort()).toEqual(['barba', 'corte'])
  })

  it('el mapeo de OTRO profesional no afecta a este (queda comodín si él no tiene filas)', () => {
    const bridge = [map('juan', 'corte')] // juan mapeado; ana no tiene filas
    const result = servicesForProfessional('ana', services, bridge)
    expect(result.map((s) => s.id).sort()).toEqual(['barba', 'color', 'corte'])
  })
})

// ── Suite 2: professionalsForService + isServiceCovered (cobertura, STAFF-02) ──────
describe('professionalsForService / isServiceCovered — cobertura (D-16)', () => {
  it('bridge vacío: TODOS los activos ofrecen el servicio y está cubierto', () => {
    const activos = [pro('ana'), pro('juan')]
    const result = professionalsForService('corte', activos, [])
    expect(result.map((p) => p.id).sort()).toEqual(['ana', 'juan'])
    expect(isServiceCovered('corte', activos, [])).toBe(true)
  })

  it('desmarcar al último que lo ofrecía → servicio sin cobertura', () => {
    // ana y juan con mapeo explícito; ninguno marcó "color" → sin cobertura
    const activos = [pro('ana'), pro('juan')]
    const bridge = [map('ana', 'corte'), map('juan', 'barba')]
    expect(professionalsForService('color', activos, bridge)).toEqual([])
    expect(isServiceCovered('color', activos, bridge)).toBe(false)
    // corte sí está cubierto (lo hace ana)
    expect(professionalsForService('corte', activos, bridge).map((p) => p.id)).toEqual(['ana'])
    expect(isServiceCovered('corte', activos, bridge)).toBe(true)
  })

  it('si al menos un activo es comodín (0 filas), NINGÚN servicio queda sin cobertura', () => {
    // ana comodín (sin filas), juan con mapeo explícito a otro servicio
    const activos = [pro('ana'), pro('juan')]
    const bridge = [map('juan', 'barba')]
    // "color" no lo marcó nadie explícitamente, pero ana (comodín) lo cubre
    expect(professionalsForService('color', activos, bridge).map((p) => p.id)).toEqual(['ana'])
    expect(isServiceCovered('color', activos, bridge)).toBe(true)
  })

  it('un profesional INACTIVO no cuenta: la función respeta la lista de activos que recibe (D-16)', () => {
    // la caller ya filtró a activos; juan (inactivo) NO está en la lista aunque tenga la fila
    const activos = [pro('ana')] // solo ana, con mapeo explícito a "corte"
    const bridge = [map('ana', 'corte'), map('juan', 'color')] // juan mapeó color pero está inactivo/excluido
    expect(professionalsForService('color', activos, bridge)).toEqual([])
    expect(isServiceCovered('color', activos, bridge)).toBe(false)
  })

  it('isServiceCovered es consistente con professionalsForService().length > 0', () => {
    const activos = [pro('ana'), pro('juan')]
    const bridge = [map('ana', 'corte'), map('juan', 'barba')]
    for (const id of ['corte', 'color', 'barba']) {
      expect(isServiceCovered(id, activos, bridge)).toBe(
        professionalsForService(id, activos, bridge).length > 0,
      )
    }
  })
})
