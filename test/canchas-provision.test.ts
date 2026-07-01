import { describe, it, expect } from 'vitest'
import {
  provisionCancha,
  deleteCancha,
  canchasFromData,
} from '@/lib/canchas'
import type { Service, Professional, AgendaSpace } from '@/lib/types'

// ── Tests de la capa pura de canchas (lib/canchas.ts) ──────────────────────────────────
// Cubre CANCHA-01/02/03: auto-provisión de la tupla cancha (service + professional + space +
// agenda_spaces) con rollback manual (D-02), reconstrucción por professionals.service_id (D-06,
// NUNCA por nombre) y borrado soft/hard (D-05).
//
// Toda la lógica corre con un CLIENT MOCK: un objeto que simula la cadena
// from(tabla).insert(...).select().single() y from(tabla).update(...).eq(...) /
// delete().eq(...) de supabase-js. NO toca Supabase real → corre siempre en CI, sin DOM.
// El mock registra cada operación en `log` para assertear la orquestación + el rollback.

// ── Mock del SupabaseClient ────────────────────────────────────────────────────────────
// Config: por cada tabla se puede forzar que el insert falle (failInsertOn) devolviendo un error.
// `log` acumula { op, table, payload, filters } para las aserciones.

type Op = { op: 'insert' | 'update' | 'delete'; table: string; payload?: unknown; filters: Record<string, unknown> }

interface MockConfig {
  // Tabla en cuyo insert debe fallar (para probar rollback). undefined = todo OK.
  failInsertOn?: string
  // Código de error a devolver en el delete de una tabla (ej. '23503' en professionals).
  failDeleteCode?: { table: string; code: string }
  // Ids devueltos por cada insert (para linkear service→professional→space).
  ids?: Record<string, string>
}

function makeMockClient(cfg: MockConfig = {}) {
  const log: Op[] = []
  const ids = cfg.ids ?? { services: 'svc-1', professionals: 'pro-1', spaces: 'sp-1' }

  function chain(table: string) {
    const filters: Record<string, unknown> = {}
    const builder = {
      // insert(payload) → devuelve algo con select().single() o awaitable directo
      insert(payload: unknown) {
        log.push({ op: 'insert', table, payload, filters })
        const fail = cfg.failInsertOn === table
        const row = { id: ids[table] ?? `${table}-id`, ...(payload as object) }
        return {
          select() {
            return {
              async single() {
                if (fail) return { data: null, error: { message: `fail insert ${table}`, code: 'XXFAIL' } }
                return { data: row, error: null }
              },
            }
          },
          // insert sin select (agenda_spaces): thenable
          then(resolve: (r: { data: unknown; error: unknown }) => void) {
            resolve(fail ? { data: null, error: { message: `fail insert ${table}`, code: 'XXFAIL' } } : { data: row, error: null })
          },
        }
      },
      update(payload: unknown) {
        log.push({ op: 'update', table, payload, filters })
        return {
          eq(col: string, val: unknown) {
            filters[col] = val
            return this
          },
          then(resolve: (r: { data: unknown; error: unknown }) => void) {
            resolve({ data: null, error: null })
          },
        }
      },
      delete() {
        const delFilters: Record<string, unknown> = {}
        log.push({ op: 'delete', table, payload: undefined, filters: delFilters })
        const chainable = {
          eq(col: string, val: unknown) {
            delFilters[col] = val
            return chainable
          },
          then(resolve: (r: { data: unknown; error: unknown }) => void) {
            const fd = cfg.failDeleteCode
            if (fd && fd.table === table) resolve({ data: null, error: { message: 'fk', code: fd.code } })
            else resolve({ data: null, error: null })
          },
        }
        return chainable
      },
    }
    return builder
  }

  return {
    client: { from: (table: string) => chain(table) },
    log,
  }
}

// Helper: filtra el log por tabla + operación.
const opsOn = (log: Op[], table: string, op: Op['op']) => log.filter(o => o.table === table && o.op === op)

const BID = 'biz-1'

describe('canchas: provisionCancha', () => {
  it('provisiona con espacio dedicado (service + professional + space + agenda_space, todos con business_id)', async () => {
    const { client, log } = makeMockClient()
    const res = await provisionCancha(client as never, BID, { name: 'Cancha 11', price: 8000, duration: 90 })

    expect(res.ok).toBe(true)
    // Un insert por tabla.
    expect(opsOn(log, 'services', 'insert')).toHaveLength(1)
    expect(opsOn(log, 'professionals', 'insert')).toHaveLength(1)
    expect(opsOn(log, 'spaces', 'insert')).toHaveLength(1)
    expect(opsOn(log, 'agenda_spaces', 'insert')).toHaveLength(1)
    // business_id en cada insert.
    for (const table of ['services', 'professionals', 'spaces', 'agenda_spaces']) {
      const ins = opsOn(log, table, 'insert')[0].payload as Record<string, unknown>
      expect(ins.business_id).toBe(BID)
    }
    // El professional apunta al service creado (puntero 1:1 D-06).
    const proPayload = opsOn(log, 'professionals', 'insert')[0].payload as Record<string, unknown>
    expect(proPayload.service_id).toBe('svc-1')
    // El service lleva precio + duración.
    const svcPayload = opsOn(log, 'services', 'insert')[0].payload as Record<string, unknown>
    expect(svcPayload.price).toBe(8000)
    expect(svcPayload.duration_minutes).toBe(90)
    if (res.ok) expect(res.spaceIds).toEqual(['sp-1'])
  })

  it('comparte espacio (F11 → {A,B,C}): NO crea space, inserta 3 agenda_spaces', async () => {
    const { client, log } = makeMockClient()
    const res = await provisionCancha(client as never, BID, {
      name: 'F11', price: 12000, duration: 60, sharedSpaceIds: ['A', 'B', 'C'],
    })

    expect(res.ok).toBe(true)
    expect(opsOn(log, 'spaces', 'insert')).toHaveLength(0) // no crea space dedicado
    expect(opsOn(log, 'agenda_spaces', 'insert')).toHaveLength(3)
    const spaceIds = opsOn(log, 'agenda_spaces', 'insert').map(o => (o.payload as Record<string, unknown>).space_id)
    expect(spaceIds).toEqual(['A', 'B', 'C'])
    if (res.ok) expect(res.spaceIds).toEqual(['A', 'B', 'C'])
  })

  it('rollback si falla el insert de space: borra professional y service', async () => {
    const { client, log } = makeMockClient({ failInsertOn: 'spaces' })
    const res = await provisionCancha(client as never, BID, { name: 'X', price: 1, duration: 30 })

    expect(res.ok).toBe(false)
    // Se revirtió lo creado antes: delete de professionals y services, filtrando por business_id.
    expect(opsOn(log, 'professionals', 'delete')).toHaveLength(1)
    expect(opsOn(log, 'services', 'delete')).toHaveLength(1)
    expect(opsOn(log, 'professionals', 'delete')[0].filters.business_id).toBe(BID)
    expect(opsOn(log, 'services', 'delete')[0].filters.business_id).toBe(BID)
  })

  it('rollback si falla agenda_spaces: borra space dedicado + professional + service', async () => {
    const { client, log } = makeMockClient({ failInsertOn: 'agenda_spaces' })
    const res = await provisionCancha(client as never, BID, { name: 'X', price: 1, duration: 30 })

    expect(res.ok).toBe(false)
    expect(opsOn(log, 'spaces', 'delete')).toHaveLength(1)
    expect(opsOn(log, 'professionals', 'delete')).toHaveLength(1)
    expect(opsOn(log, 'services', 'delete')).toHaveLength(1)
  })

  it('NO borra spaces compartidos en el rollback (solo el dedicado)', async () => {
    // Comparte A,B,C y falla agenda_spaces → NO debe borrar A,B,C (no los creó).
    const { client, log } = makeMockClient({ failInsertOn: 'agenda_spaces' })
    const res = await provisionCancha(client as never, BID, {
      name: 'F11', price: 1, duration: 30, sharedSpaceIds: ['A', 'B', 'C'],
    })
    expect(res.ok).toBe(false)
    expect(opsOn(log, 'spaces', 'delete')).toHaveLength(0) // no creó space → no lo borra
    expect(opsOn(log, 'professionals', 'delete')).toHaveLength(1)
    expect(opsOn(log, 'services', 'delete')).toHaveLength(1)
  })
})

describe('canchas: canchasFromData', () => {
  const svc = (id: string, name: string): Service => ({
    id, business_id: BID, name, duration_minutes: 60, price: 100, description: null, active: true, created_at: '',
  })
  const pro = (id: string, service_id: string | null): Professional => ({
    id, business_id: BID, name: 'agenda', last_name: null, specialty: null, license_number: null,
    phone: null, email: null, photo_url: null, active: true, service_id, created_at: '',
  })
  const as = (professional_id: string, space_id: string): AgendaSpace => ({ business_id: BID, professional_id, space_id })

  it('empareja por service_id (puntero estable), no por nombre; ignora professionals sin service_id', () => {
    const services = [svc('s1', 'Cancha A'), svc('s2', 'Cancha B')]
    const professionals = [pro('p1', 's1'), pro('p2', 's2'), pro('p3', null)]
    const agendaSpaces = [as('p1', 'spA'), as('p2', 'spB1'), as('p2', 'spB2')]

    const canchas = canchasFromData(services, professionals, agendaSpaces)
    expect(canchas).toHaveLength(2) // p3 (service_id null) ignorado
    const cA = canchas.find(c => c.service.id === 's1')!
    const cB = canchas.find(c => c.service.id === 's2')!
    expect(cA.professional.id).toBe('p1')
    expect(cA.spaceIds).toEqual(['spA'])
    expect(cB.spaceIds).toEqual(['spB1', 'spB2'])
  })

  it('renombrar el service NO rompe el match (empareja por id, no por nombre)', () => {
    const services = [svc('s1', 'NOMBRE TOTALMENTE DISTINTO')]
    const professionals = [pro('p1', 's1')]
    const canchas = canchasFromData(services, professionals, [as('p1', 'spA')])
    expect(canchas).toHaveLength(1)
    expect(canchas[0].professional.id).toBe('p1')
  })
})

describe('canchas: deleteCancha', () => {
  const svc: Service = {
    id: 's1', business_id: BID, name: 'Cancha', duration_minutes: 60, price: 100,
    description: null, active: true, created_at: '',
  }
  const proBase: Professional = {
    id: 'p1', business_id: BID, name: 'agenda', last_name: null, specialty: null, license_number: null,
    phone: null, email: null, photo_url: null, active: true, service_id: 's1', created_at: '',
  }
  const cancha = { service: svc, professional: proBase, spaceIds: ['spA'] }

  it('soft-delete (default): active=false en service Y professional', async () => {
    const { client, log } = makeMockClient()
    const res = await deleteCancha(client as never, BID, cancha)
    expect(res.ok).toBe(true)
    const svcUpd = opsOn(log, 'services', 'update')
    const proUpd = opsOn(log, 'professionals', 'update')
    expect(svcUpd).toHaveLength(1)
    expect(proUpd).toHaveLength(1)
    expect((svcUpd[0].payload as Record<string, unknown>).active).toBe(false)
    expect((proUpd[0].payload as Record<string, unknown>).active).toBe(false)
    // Filtro por business_id (defensa en profundidad).
    expect(svcUpd[0].filters.business_id).toBe(BID)
    expect(proUpd[0].filters.business_id).toBe(BID)
    // No borra nada.
    expect(log.some(o => o.op === 'delete')).toBe(false)
  })

  it('hard-delete sin reservas: borra agenda_spaces, space dedicado, professional, service', async () => {
    const { client, log } = makeMockClient()
    const res = await deleteCancha(client as never, BID, cancha, { hard: true })
    expect(res.ok).toBe(true)
    expect(opsOn(log, 'agenda_spaces', 'delete')).toHaveLength(1)
    expect(opsOn(log, 'professionals', 'delete')).toHaveLength(1)
    expect(opsOn(log, 'services', 'delete')).toHaveLength(1)
    // Cada delete filtra por business_id.
    for (const table of ['agenda_spaces', 'professionals', 'services']) {
      expect(opsOn(log, table, 'delete')[0].filters.business_id).toBe(BID)
    }
  })

  it('hard-delete con turnos (FK 23503) devuelve error de dominio sugiriendo desactivar', async () => {
    const { client } = makeMockClient({ failDeleteCode: { table: 'professionals', code: '23503' } })
    const res = await deleteCancha(client as never, BID, cancha, { hard: true })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toBe('has_appointments')
  })
})
