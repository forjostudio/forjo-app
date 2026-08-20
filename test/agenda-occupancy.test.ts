import { describe, it, expect } from 'vitest'
import { buildDayEntries, capacityOf, computeOverlapFull, occupiesSeat, timeToMin, type DayEntry, type OccupancyAppt, type OccupancyService } from '@/lib/agenda-occupancy'

// ── Phase 17 (POLISH-09) — tests puros de lib/agenda-occupancy.ts ─────────────────────────────
// Espejan test/client-status.test.ts: describe/it/expect, import por el alias @/lib/..., sin DB,
// sin credenciales y sin ningún gate de entorno que saltee casos → esta suite corre siempre.
//
// Qué congela cada bloque, y por qué:
//
//   · **buildDayEntries — agrupación (D-10).** El `service_id` es parte de la clave del slot. Sin él,
//     dos clases distintas de la misma hora se fusionarían y el contador de una mostraría a los
//     inscriptos de la otra (T-17-18). El caso "dos servicios grupales a la misma hora" es
//     DISCRIMINANTE: verificado por mutación (sacar el service_id de la clave lo pone en rojo).
//
//   · **buildDayEntries — ocupación (CR-01 / T-17-19).** Un `pending_payment` con la seña VENCIDA no
//     ocupa lugar: el motor lo descarta en el gate del RPC (migr. 063) y `availability` tampoco lo
//     cuenta. Sin la guarda, el panel avisa "lleno" sobre horarios que siguen reservables. El caso
//     del hold vencido también es DISCRIMINANTE: verificado por mutación.
//
//   · **buildDayEntries — el modo se LEE (D-11 / T-17-17).** Los casos de simultáneo e individual
//     fallan si alguien vuelve a deducir el modo del número: los tres servicios de esos casos tienen
//     cupo > 1 y ninguno agrupa.
//
//   · **buildDayEntries — sin servicio resoluble (D-12).** `service_id` nulo, o un servicio que no
//     está en el mapa (el caso real del servicio DESACTIVADO), cae en tratamiento individual: sin
//     contador y sin roster. No se inventa un número.
//
//   · **computeOverlapFull.** La ocupación por solape del recurso simultáneo, movida tal cual desde
//     la grilla. Se congela para que el traslado no la haya cambiado sin querer.

// ── Fixtures locales (objetos literales — esta suite no toca la base) ─────────────────────────

const DAY = '2026-08-25'
// Reloj FIJO: `nowMs` entra por parámetro, así el caso del hold vencido es determinista.
const NOW = Date.parse('2026-08-25T12:00:00Z')
const HOLD_VENCIDO = '2026-08-25T11:00:00Z'
const HOLD_VIVO = '2026-08-25T13:00:00Z'

let seq = 0
function appt(over: Partial<OccupancyAppt> = {}): OccupancyAppt {
  seq += 1
  return {
    id: `appt-${seq}`,
    date: DAY,
    time: '09:00:00',
    status: 'confirmed',
    duration_minutes: 60,
    expires_at: null,
    service_id: null,
    ...over,
  }
}

function services(map: Record<string, OccupancyService>): Map<string, OccupancyService> {
  return new Map(Object.entries(map))
}

/** El servicio grupal de referencia: yoga de 6 lugares. */
const YOGA: OccupancyService = { name: 'Yoga', capacity: 6, capacity_mode: 'group_class' }

function groupsOf<A>(entries: DayEntry<A>[]) {
  return entries.filter(e => e.kind === 'group')
}

// ── buildDayEntries ───────────────────────────────────────────────────────────────────────────

describe('buildDayEntries — el slot grupal se colapsa en una sola entrada (D-10)', () => {
  it('caso 1: tres confirmados de un grupal de cupo 6 ⇒ UNA entrada con occupied 3 / capacity 6', () => {
    const list = [
      appt({ service_id: 'yoga' }),
      appt({ service_id: 'yoga' }),
      appt({ service_id: 'yoga' }),
    ]
    const entries = buildDayEntries(list, services({ yoga: YOGA }), NOW)

    expect(entries).toHaveLength(1)
    const g = entries[0]
    expect(g.kind).toBe('group')
    if (g.kind !== 'group') return
    expect(g.occupied).toBe(3)
    expect(g.capacity).toBe(6)
    expect(g.pendingDeposit).toBe(0)
    expect(g.appts).toHaveLength(3)
    expect(g.serviceName).toBe('Yoga')
    expect(g.key).toBe(`${DAY}|09:00|yoga`)
  })

  it('caso 2 (DISCRIMINANTE, verificado por mutación): un hold VENCIDO sigue en la lista pero NO ocupa lugar', () => {
    const list = [
      appt({ service_id: 'yoga' }),
      appt({ service_id: 'yoga' }),
      appt({ service_id: 'yoga', status: 'pending_payment', expires_at: HOLD_VENCIDO }),
    ]
    const entries = buildDayEntries(list, services({ yoga: YOGA }), NOW)
    const g = entries[0]
    if (g.kind !== 'group') throw new Error('se esperaba una entrada de grupo')

    // Sin la guarda de hold vivo en occupiesSeat esto da 3 / 1 y el test se pone en rojo.
    expect(g.occupied).toBe(2)
    expect(g.pendingDeposit).toBe(0)
    // El roster lo sigue mostrando: no ocupa lugar, pero existe.
    expect(g.appts).toHaveLength(3)
  })

  it('caso 3: el mismo hold con vencimiento en el FUTURO sí ocupa, y se avisa como seña pendiente', () => {
    const list = [
      appt({ service_id: 'yoga' }),
      appt({ service_id: 'yoga' }),
      appt({ service_id: 'yoga', status: 'pending_payment', expires_at: HOLD_VIVO }),
    ]
    const entries = buildDayEntries(list, services({ yoga: YOGA }), NOW)
    const g = entries[0]
    if (g.kind !== 'group') throw new Error('se esperaba una entrada de grupo')

    expect(g.occupied).toBe(3)
    expect(g.pendingDeposit).toBe(1)
  })

  it('caso 4 (DISCRIMINANTE, verificado por mutación): dos servicios grupales DISTINTOS a la misma hora NO se fusionan', () => {
    const list = [
      appt({ service_id: 'yoga' }),
      appt({ service_id: 'pilates' }),
      appt({ service_id: 'yoga' }),
    ]
    const entries = buildDayEntries(
      list,
      services({ yoga: YOGA, pilates: { name: 'Pilates', capacity: 4, capacity_mode: 'group_class' } }),
      NOW
    )

    // Sacar el service_id de la clave del grupo fusiona los tres en una entrada y esto da 1.
    const gs = groupsOf(entries)
    expect(gs).toHaveLength(2)
    expect(entries).toHaveLength(2)

    const [yoga, pilates] = gs
    if (yoga.kind !== 'group' || pilates.kind !== 'group') throw new Error('se esperaban dos grupos')
    expect(yoga.serviceId).toBe('yoga')
    expect(yoga.occupied).toBe(2)
    expect(yoga.capacity).toBe(6)
    expect(pilates.serviceId).toBe('pilates')
    expect(pilates.occupied).toBe(1)
    expect(pilates.capacity).toBe(4)
  })

  it('caso 5: el mismo servicio en dos horarios ⇒ dos entradas de grupo', () => {
    const list = [
      appt({ service_id: 'yoga', time: '09:00:00' }),
      appt({ service_id: 'yoga', time: '10:30:00' }),
      appt({ service_id: 'yoga', time: '09:00:00' }),
    ]
    const entries = buildDayEntries(list, services({ yoga: YOGA }), NOW)
    const gs = groupsOf(entries)

    expect(gs).toHaveLength(2)
    expect(gs.map(g => (g.kind === 'group' ? `${g.time}:${g.occupied}` : ''))).toEqual(['09:00:2', '10:30:1'])
  })

  it('caso 11: un grupo cuyos miembros son TODOS no-ocupantes existe igual, con occupied 0', () => {
    const list = [
      appt({ service_id: 'yoga', status: 'completed' }),
      appt({ service_id: 'yoga', status: 'cancelled' }),
    ]
    const entries = buildDayEntries(list, services({ yoga: YOGA }), NOW)

    expect(entries).toHaveLength(1)
    const g = entries[0]
    if (g.kind !== 'group') throw new Error('colapsar no puede hacer desaparecer el slot')
    expect(g.occupied).toBe(0)
    expect(g.capacity).toBe(6)
    expect(g.appts).toHaveLength(2)
  })

  it('caso 12: capacity nula o 0 en el servicio ⇒ capacity 1 (piso fail-safe)', () => {
    const nula = buildDayEntries(
      [appt({ service_id: 'x' })],
      services({ x: { name: 'Sin cupo', capacity: null, capacity_mode: 'group_class' } }),
      NOW
    )[0]
    const cero = buildDayEntries(
      [appt({ service_id: 'x' })],
      services({ x: { name: 'Cupo 0', capacity: 0, capacity_mode: 'group_class' } }),
      NOW
    )[0]

    if (nula.kind !== 'group' || cero.kind !== 'group') throw new Error('se esperaban entradas de grupo')
    expect(nula.capacity).toBe(1)
    expect(cero.capacity).toBe(1)
  })
})

describe('buildDayEntries — lo que NO agrupa (D-11, D-12)', () => {
  it('caso 6: service_id nulo ⇒ entrada individual (D-12)', () => {
    const entries = buildDayEntries([appt({ service_id: null })], services({ yoga: YOGA }), NOW)

    expect(entries).toHaveLength(1)
    expect(entries[0].kind).toBe('appt')
  })

  it('caso 7: service_id que NO está en el mapa (servicio desactivado o borrado) ⇒ individual, sin contador (D-12)', () => {
    const list = [appt({ service_id: 'yoga-viejo' }), appt({ service_id: 'yoga-viejo' })]
    const entries = buildDayEntries(list, services({ yoga: YOGA }), NOW)

    // Dos entradas sueltas, no un grupo con un cupo inventado.
    expect(entries).toHaveLength(2)
    expect(groupsOf(entries)).toHaveLength(0)
  })

  it('caso 8: un servicio simultaneous_resource de cupo 3 NO agrupa (el modo se lee, no se deduce del número)', () => {
    const list = [appt({ service_id: 'camilla' }), appt({ service_id: 'camilla' })]
    const entries = buildDayEntries(
      list,
      services({ camilla: { name: 'Camilla', capacity: 3, capacity_mode: 'simultaneous_resource' } }),
      NOW
    )

    expect(entries).toHaveLength(2)
    expect(groupsOf(entries)).toHaveLength(0)
  })

  it('caso 9: un servicio individual (aunque tuviera capacity > 1) ⇒ entradas individuales', () => {
    const list = [appt({ service_id: 'corte' }), appt({ service_id: 'corte' })]
    const entries = buildDayEntries(
      list,
      services({ corte: { name: 'Corte', capacity: 5, capacity_mode: 'individual' } }),
      NOW
    )

    expect(entries).toHaveLength(2)
    expect(groupsOf(entries)).toHaveLength(0)
  })
})

describe('buildDayEntries — orden: la columna se sigue leyendo como línea de tiempo', () => {
  it('caso 10: el grupo queda en la posición de su PRIMER miembro y los individuales conservan la suya', () => {
    const nueve = appt({ time: '09:00:00', service_id: null })
    const grupo1 = appt({ time: '10:00:00', service_id: 'yoga' })
    const diezIndiv = appt({ time: '10:00:00', service_id: null })
    const grupo2 = appt({ time: '10:00:00', service_id: 'yoga' })
    const once = appt({ time: '11:00:00', service_id: null })

    const entries = buildDayEntries([nueve, grupo1, diezIndiv, grupo2, once], services({ yoga: YOGA }), NOW)

    expect(entries.map(e => e.kind)).toEqual(['appt', 'group', 'appt', 'appt'])
    expect(entries[0].kind === 'appt' && entries[0].appt.id).toBe(nueve.id)
    expect(entries[1].kind === 'group' && entries[1].appts.map(a => a.id)).toEqual([grupo1.id, grupo2.id])
    expect(entries[2].kind === 'appt' && entries[2].appt.id).toBe(diezIndiv.id)
    expect(entries[3].kind === 'appt' && entries[3].appt.id).toBe(once.id)
  })
})

// ── computeOverlapFull ────────────────────────────────────────────────────────────────────────

describe('computeOverlapFull — ocupación por solape del recurso simultáneo', () => {
  const CAMILLAS: Record<string, OccupancyService> = {
    camilla: { name: 'Camilla', capacity: 2, capacity_mode: 'simultaneous_resource' },
  }

  it('caso 13: dos turnos que se pisan sobre un cupo 2 ⇒ los dos en el mapa con count 2 / capacity 2', () => {
    const a = appt({ service_id: 'camilla', time: '09:00:00', duration_minutes: 60 })
    const b = appt({ service_id: 'camilla', time: '09:30:00', duration_minutes: 60 })
    const full = computeOverlapFull([a, b], services(CAMILLAS), NOW)

    expect(full.size).toBe(2)
    expect(full.get(a.id)).toEqual({ count: 2, capacity: 2 })
    expect(full.get(b.id)).toEqual({ count: 2, capacity: 2 })
  })

  it('caso 14: dos turnos escalonados que NO se pisan sobre cupo 2 ⇒ mapa vacío', () => {
    const a = appt({ service_id: 'camilla', time: '09:00:00', duration_minutes: 30 })
    const b = appt({ service_id: 'camilla', time: '09:30:00', duration_minutes: 30 })

    expect(computeOverlapFull([a, b], services(CAMILLAS), NOW).size).toBe(0)
  })

  it('caso 15: un hold VENCIDO no cuenta hacia el solape', () => {
    const a = appt({ service_id: 'camilla', time: '09:00:00', duration_minutes: 60 })
    const vencido = appt({
      service_id: 'camilla',
      time: '09:30:00',
      duration_minutes: 60,
      status: 'pending_payment',
      expires_at: HOLD_VENCIDO,
    })

    // Con el hold contado serían 2/2 y los dos entrarían al mapa como "lleno".
    expect(computeOverlapFull([a, vencido], services(CAMILLAS), NOW).size).toBe(0)
  })

  it('caso 16: un servicio group_class NUNCA aparece en este mapa', () => {
    const a = appt({ service_id: 'yoga', duration_minutes: 60 })
    const b = appt({ service_id: 'yoga', duration_minutes: 60 })

    expect(computeOverlapFull([a, b], services({ yoga: { ...YOGA, capacity: 1 } }), NOW).size).toBe(0)
  })
})

// ── Piezas compartidas ────────────────────────────────────────────────────────────────────────

describe('occupiesSeat y capacityOf — las piezas que comparten los dos modos', () => {
  it('un cancelado no ocupa lugar aunque el hold esté vivo', () => {
    expect(occupiesSeat(appt({ status: 'cancelled', expires_at: HOLD_VIVO }), NOW)).toBe(false)
  })

  it('un pending_payment sin vencimiento ocupa lugar (el hold no vence)', () => {
    expect(occupiesSeat(appt({ status: 'pending_payment', expires_at: null }), NOW)).toBe(true)
  })

  it('capacityOf con el servicio ausente devuelve el piso 1', () => {
    expect(capacityOf(undefined)).toBe(1)
    expect(capacityOf({ capacity: 6, capacity_mode: 'group_class' })).toBe(6)
  })

  it('timeToMin lee HH:MM y HH:MM:SS igual', () => {
    expect(timeToMin('09:30')).toBe(570)
    expect(timeToMin('09:30:00')).toBe(570)
  })
})
