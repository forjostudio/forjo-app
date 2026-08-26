import { describe, it, expect } from 'vitest'
import { buildSaveHoursPayload, buildDayStatesFromRows, isValidBlockTime } from '@/lib/agenda-hours-payload'
import type { AgendaBlockDraft, AgendaDayDraft, SavedAgendaBlock } from '@/lib/agenda-hours-payload'

// ── Phase 19 (el panel de la agenda por servicio) — tests puros de lib/agenda-hours-payload.ts ──
// Espejan test/time-block-services.test.ts: describe/it/expect, import desde @/lib/..., SIN Supabase
// ni credenciales. Congelan las TRES reglas del guardado por diff que hoy están enterradas adentro
// de `saveHours` en el componente y que nadie puede ver sin leerlo entero.
//
// ⚠ Los dos casos que importan de verdad no son los felices, son los CONTROLES NEGATIVOS de las dos
// trampas caras de la fase:
//   · P-03 — el payload armado desde la lista ya filtrada por consultorio borra las otras sedes.
//     Una implementación con ese bug pasa TODOS los demás casos y falla sólo el caso 1.
//   · P-01 — el editor no re-sincroniza con la base, así que el segundo "Guardar horarios" duplica
//     cada bloque nuevo. Lo muerde el caso 12 (ida y vuelta), no la lectura del código.

// ── Factories mínimas (sólo los campos que leen las funciones puras) ──────────────
function draft(over: Partial<AgendaBlockDraft> = {}): AgendaBlockDraft {
  return { start_time: '09:00', end_time: '13:00', label: '', location_id: '', service_ids: [], ...over }
}

/** Los 7 días del editor, con bloques sólo en los días que se pasan. */
function week(byDay: Record<number, AgendaBlockDraft[]>): AgendaDayDraft[] {
  return Array.from({ length: 7 }, (_, d) => {
    const blocks = byDay[d] ?? []
    return { enabled: blocks.length > 0, blocks }
  })
}

function row(over: Partial<SavedAgendaBlock> = {}): SavedAgendaBlock {
  return {
    id: 'blk-1',
    day_of_week: 1,
    start_time: '09:00:00',
    end_time: '13:00:00',
    label: null,
    location_id: null,
    service_ids: null,
    ...over,
  }
}

/**
 * La base, simulada: le asigna un id a cada elemento nuevo y devuelve el set resultante — que es
 * exactamente lo que el RPC de la migr. 074 devuelve. No correlaciona nada con la entrada a
 * propósito: la garantía de P-01 no puede depender de una correlación.
 */
function simulateDb(payload: ReturnType<typeof buildSaveHoursPayload>): SavedAgendaBlock[] {
  let seq = 0
  return payload.map((p) => ({
    id: p.id ?? `nuevo-${++seq}`,
    day_of_week: p.day_of_week,
    start_time: `${p.start_time}:00`, // Postgres devuelve `time` con segundos
    end_time: `${p.end_time}:00`,
    label: p.label,
    location_id: p.location_id,
    service_ids: p.service_ids,
  }))
}

// ── Suite 1: buildSaveHoursPayload (qué viaja a la base) ──────────────────────────
describe('buildSaveHoursPayload — el set es COMPLETO (P-03) y sin cupo (D-12)', () => {
  it('CONTROL NEGATIVO de P-03: con dos consultorios en el mismo día viajan LOS DOS bloques', () => {
    // el caso que muerde: el editor opera por consultorio activo pero el guardado es por negocio.
    // Una implementación que filtre por consultorio pasa todos los demás casos de esta suite y
    // falla éste — y en producción se traduce en "guardé la sede A y perdí los horarios de la B"
    const days = week({ 1: [draft({ location_id: 'sede-a' }), draft({ location_id: 'sede-b' })] })
    const payload = buildSaveHoursPayload(days, { hasLocations: true })
    expect(payload).toHaveLength(2)
    expect(payload.map((p) => p.location_id)).toEqual(['sede-a', 'sede-b'])
  })

  it('un día cerrado no aporta bloques aunque los tenga cargados', () => {
    const days = week({ 1: [draft({ location_id: 'sede-a' })], 2: [draft({ location_id: 'sede-a' })] })
    days[2].enabled = false
    const payload = buildSaveHoursPayload(days, { hasLocations: true })
    expect(payload).toHaveLength(1)
    expect(payload[0].day_of_week).toBe(1)
  })

  it('con consultorios cargados el bloque sin consultorio se descarta; sin consultorios viaja con consultorio nulo', () => {
    // congela la regla de hoy (agenda-client.tsx:377): con consultorios cargados no existe
    // "General", así que un bloque huérfano no tiene dónde vivir
    const days = week({ 1: [draft({ location_id: '' })] })
    expect(buildSaveHoursPayload(days, { hasLocations: true })).toEqual([])
    const sinSedes = buildSaveHoursPayload(days, { hasLocations: false })
    expect(sinSedes).toHaveLength(1)
    expect(sinSedes[0].location_id).toBeNull()
  })

  it('bloque sin id ⇒ el elemento viaja con id nulo (INSERT); con id ⇒ lo conserva (UPDATE)', () => {
    const days = week({ 1: [draft(), draft({ id: 'blk-9' })] })
    const payload = buildSaveHoursPayload(days, { hasLocations: false })
    expect(payload.map((p) => p.id)).toEqual([null, 'blk-9'])
  })

  it('etiqueta con sólo espacios ⇒ viaja nula', () => {
    const days = week({ 1: [draft({ label: '   ' }), draft({ label: ' Turno tarde ' })] })
    const payload = buildSaveHoursPayload(days, { hasLocations: false })
    expect(payload[0].label).toBeNull()
    expect(payload[1].label).toBe('Turno tarde')
  })

  it('los ids de servicio se deduplican conservando el orden de entrada, y los vacíos se descartan', () => {
    const days = week({ 1: [draft({ service_ids: ['corte', 'color', 'corte', '', 'ceramica'] })] })
    const payload = buildSaveHoursPayload(days, { hasLocations: false })
    expect(payload[0].service_ids).toEqual(['corte', 'color', 'ceramica'])
  })

  it('CONTROL de D-12: ningún elemento del payload tiene la clave del cupo del bloque', () => {
    // assert sobre las CLAVES, no sobre el valor: un `cupo: undefined` seguiría siendo la columna
    // volviendo a entrar por la puerta de atrás. La columna dejó de decidir en la migr. 068 y
    // omitirla es seguro (NOT NULL con default: el INSERT toma el default y el UPDATE conserva)
    const days = week({ 1: [draft({ location_id: 'sede-a' })] })
    const payload = buildSaveHoursPayload(days, { hasLocations: true })
    const keys = Object.keys(payload[0])
    expect(keys).not.toContain('capacity')
    expect(keys).not.toContain('cupo')
    expect(keys.sort()).toEqual(
      ['day_of_week', 'end_time', 'id', 'label', 'location_id', 'service_ids', 'start_time'],
    )
  })
})

// ── Suite 2: buildDayStatesFromRows (el estado del editor, derivado de la base) ────
describe('buildDayStatesFromRows — la única derivación del estado (P-01)', () => {
  it('siempre devuelve 7 días y los que no tienen filas quedan cerrados', () => {
    const states = buildDayStatesFromRows([row({ day_of_week: 3 })])
    expect(states).toHaveLength(7)
    expect(states.map((d) => d.enabled)).toEqual([false, false, false, true, false, false, false])
    // una fila con un día fuera de 0..6 se descarta en vez de romper
    expect(buildDayStatesFromRows([row({ day_of_week: 9 })]).every((d) => !d.enabled)).toBe(true)
  })

  it("el horario se normaliza a 'HH:MM' (Postgres devuelve `time` con segundos)", () => {
    const states = buildDayStatesFromRows([row({ start_time: '09:00:00', end_time: '13:30:00' })])
    expect(states[1].blocks[0].start_time).toBe('09:00')
    expect(states[1].blocks[0].end_time).toBe('13:30')
  })

  it('etiqueta y consultorio nulos ⇒ cadena vacía (lo que esperan los inputs del editor)', () => {
    const states = buildDayStatesFromRows([row({ label: null, location_id: null })])
    expect(states[1].blocks[0].label).toBe('')
    expect(states[1].blocks[0].location_id).toBe('')
    expect(states[1].blocks[0].service_ids).toEqual([])
  })

  it('CONTROL de P-04: dos bloques nunca comparten el arreglo de servicios', () => {
    // copiar un día a otro y togglear un chip no puede cambiar el del día copiado: si las dos
    // filas comparten la referencia, mutar una corrompe la otra en silencio
    const compartido = ['corte']
    const states = buildDayStatesFromRows([
      row({ id: 'a', day_of_week: 2, service_ids: compartido }),
      row({ id: 'b', day_of_week: 2, service_ids: compartido }),
    ])
    states[2].blocks[0].service_ids.push('color')
    expect(states[2].blocks[1].service_ids).toEqual(['corte'])
    expect(compartido).toEqual(['corte'])
  })
})

// ── Suite 3: la ida y vuelta (el caso que cierra P-01) ────────────────────────────
describe('ida y vuelta estado → payload → base → estado', () => {
  it('guardar dos veces seguidas SIN recargar no duplica nada: el segundo payload tiene los mismos elementos y ninguno con id nulo', () => {
    // el editor inicializa dayStates con useState(initializer) y nunca lo re-deriva de las props:
    // sin re-derivar desde lo que devuelve la base, el bloque insertado en el guardado #1 sigue
    // con id undefined y el guardado #2 lo vuelve a INSERTAR (P-01)
    const estadoInicial = week({
      1: [draft({ service_ids: ['corte'] }), draft({ id: 'blk-viejo', start_time: '14:00', end_time: '18:00' })],
    })
    const primerPayload = buildSaveHoursPayload(estadoInicial, { hasLocations: false })
    expect(primerPayload.filter((p) => p.id === null)).toHaveLength(1)

    const filas = simulateDb(primerPayload)
    const estadoRederivado = buildDayStatesFromRows(filas)
    const segundoPayload = buildSaveHoursPayload(estadoRederivado, { hasLocations: false })

    expect(segundoPayload).toHaveLength(primerPayload.length)
    expect(segundoPayload.filter((p) => p.id === null)).toHaveLength(0)
    // y el contenido sobrevive la vuelta completa (horarios normalizados y servicios intactos)
    expect(segundoPayload.map((p) => p.start_time)).toEqual(['09:00', '14:00'])
    expect(segundoPayload[0].service_ids).toEqual(['corte'])
  })
})

// ── Suite 4: isValidBlockTime (el hueco que dejaba pasar una hora vacía) ──────────
describe('isValidBlockTime — la forma de la hora, antes del orden', () => {
  it('acepta las horas que el editor produce de verdad', () => {
    for (const t of ['00:00', '09:00', '13:45', '23:59']) {
      expect(isValidBlockTime(t)).toBe(true)
    }
  })

  it('rechaza el input VACIADO, que es el caso que motivó la función', () => {
    // un <input type="time"> se puede borrar: el valor queda '' y el ::time del RPC revienta con
    // 22007 antes de llegar a su propio backstop de invalid_block
    expect(isValidBlockTime('')).toBe(false)
    expect(isValidBlockTime(undefined)).toBe(false)
    expect(isValidBlockTime(null)).toBe(false)
  })

  it('rechaza las formas que rompen el mismo cast por el mismo motivo', () => {
    for (const t of ['9:00', '09:0', '25:00', '12:60', '24:00', '09:00:00', 'ab:cd', ' 09:00']) {
      expect(isValidBlockTime(t)).toBe(false)
    }
  })

  it('CONTROL NEGATIVO: la comparación de orden sola NO alcanza sobre una hora vacía', () => {
    // '18:00' <= '' es false (cualquier cadena no vacía ordena después de ''), así que un bloque con
    // el inicio borrado pasaba la única validación que había. Si esta expectativa se cae, alguien
    // volvió a confiar el chequeo al orden lexicográfico.
    expect('18:00' <= '').toBe(false)
    expect(isValidBlockTime('')).toBe(false)
  })
})
