import { describe, it, expect } from 'vitest'
import { buildOnboardingAgendaPayload, servicesWithoutCoverage, type OnboardingDayDraft } from '@/lib/onboarding-agenda'

// ── El traductor del estado del wizard al payload del RPC (AGENDA-08, Phase 21) — suite pura ────
//
// QUÉ SE ROMPE SI ESTE ARCHIVO SE PONE ROJO: el negocio de clases sale del alta diciendo que los
// martes da un servicio DISTINTO del que quiso decir, o persistiendo un mapeo que la última pantalla
// no le mostró. Ninguno de los dos casos produce un error: producen un dato plausible y equivocado,
// que después el booking público le muestra a un cliente como si fuera la verdad del negocio.
//
// Sin DB y sin navegador: `lib/onboarding-agenda.ts` es un módulo puro, así que no hay nada que
// doblar. Los ids de los servicios son uuids LITERALES y no `randomUUID()`, para que cuando un caso
// falle el diff diga qué servicio se cruzó con cuál.
//
// ⚠ El caso del mapeo necesita DOS servicios: con uno solo la suite pasaría aunque el traductor
// correlacionara por posición en vez de por id (Pitfall 1).

const svcA = '11111111-1111-4111-8111-111111111111'
const svcB = '22222222-2222-4222-8222-222222222222'
/** Un servicio que el dueño borró en el paso 2 y cuyo id sobrevivió en el estado del bloque. */
const svcBorrado = '33333333-3333-4333-8333-333333333333'

/** Los SIETE días del wizard, con bloques sólo en los que se pasan. El índice ES el day_of_week. */
function week(byDay: Record<number, { start_time: string; end_time: string; service_ids: string[] }[]>): OnboardingDayDraft[] {
  return Array.from({ length: 7 }, (_, d) => {
    const blocks = byDay[d] ?? []
    return { enabled: blocks.length > 0, blocks }
  })
}

function block(over: Partial<{ start_time: string; end_time: string; service_ids: string[] }> = {}) {
  return { start_time: '09:00', end_time: '13:00', service_ids: [], ...over }
}

describe('buildOnboardingAgendaPayload: el estado del alta → el payload de save_agenda_blocks', () => {
  it('mapea cada franja a SU servicio, no al de al lado (dos servicios, Pitfall 1)', () => {
    const days = week({
      1: [block({ service_ids: [svcA] })],
      2: [block({ service_ids: [svcB] })],
    })

    const payload = buildOnboardingAgendaPayload(days, { mapServices: true, liveServiceIds: [svcA, svcB] })

    expect(payload).toHaveLength(2)
    expect(payload.find(b => b.day_of_week === 1)!.service_ids).toEqual([svcA])
    expect(payload.find(b => b.day_of_week === 2)!.service_ids).toEqual([svcB])
  })

  it('con el toggle APAGADO todas las franjas viajan en comodín, aunque el estado tenga mapeo (D-10)', () => {
    const days = week({
      1: [block({ service_ids: [svcA] })],
      2: [block({ service_ids: [svcA, svcB] })],
    })

    const payload = buildOnboardingAgendaPayload(days, { mapServices: false, liveServiceIds: [svcA, svcB] })

    // Los bloques NO desaparecen: lo que se apaga es el mapeo, no los horarios.
    expect(payload).toHaveLength(2)
    expect(payload.every(b => b.service_ids.length === 0)).toBe(true)
  })

  it('descarta el id de un servicio que ya no está vigente y conserva los que sí (Pitfall 7)', () => {
    const days = week({
      1: [block({ service_ids: [svcBorrado, svcA] })],
    })

    const payload = buildOnboardingAgendaPayload(days, { mapServices: true, liveServiceIds: [svcA, svcB] })

    expect(payload).toHaveLength(1)
    expect(payload[0].service_ids).toEqual([svcA])
  })

  it('un día cerrado no aporta bloques y NO corre la numeración de los demás', () => {
    const days = week({
      1: [block({ service_ids: [svcA] })],
      3: [block({ service_ids: [svcB] })],
    })
    days[2] = { enabled: false, blocks: [block({ service_ids: [svcA] })] } // martes cerrado, con basura adentro

    const payload = buildOnboardingAgendaPayload(days, { mapServices: true, liveServiceIds: [svcA, svcB] })

    expect(payload.map(b => b.day_of_week)).toEqual([1, 3])
    // El miércoles sigue siendo 3: si el traductor numerara por posición en la salida, daría 2.
    expect(payload[1].service_ids).toEqual([svcB])
  })

  it('el mismo id repetido en un bloque viaja una sola vez (dedupe heredado, sin evadirlo)', () => {
    const days = week({
      1: [block({ service_ids: [svcA, svcA, svcB] })],
    })

    const payload = buildOnboardingAgendaPayload(days, { mapServices: true, liveServiceIds: [svcA, svcB] })

    expect(payload[0].service_ids).toEqual([svcA, svcB])
  })

  it('toda franja del alta viaja sin id (⇒ INSERT), sin etiqueta y sin consultorio', () => {
    const days = week({
      1: [block(), block({ start_time: '15:00', end_time: '19:00' })],
    })

    const payload = buildOnboardingAgendaPayload(days, { mapServices: true, liveServiceIds: [] })

    expect(payload).toHaveLength(2)
    for (const b of payload) {
      expect(b.id).toBeNull()
      expect(b.label).toBeNull()
      expect(b.location_id).toBeNull()
    }
  })
})

// ── El aviso de D-07: qué servicios no cubre NINGUNA franja (Plan 21-02) ────────────────────────
//
// QUÉ SE ROMPE SI ESTE BLOQUE SE PONE ROJO: el dueño termina el alta creyendo que su catálogo está
// reservable y el cliente se encuentra con "Sin horarios disponibles" en la página pública. O, peor,
// el aviso se pone a mentir: con los 7 días cerrados —que es UN click— diría que TODO el catálogo se
// quedó sin horario, y un aviso que grita cuando no pasa nada es un aviso que el dueño aprende a
// ignorar. Ese caso (el de cero franjas) es el discriminante de la suite: apoyado en la función cruda
// `isServiceScheduled` en vez de en `hasScheduleCoverage`, es el único que se pone rojo.

/** Un servicio del paso 2 tal como lo tiene el wizard: id estable (D-09) y el nombre que escribió el dueño. */
function svc(id: string, name: string) {
  return { id, name }
}

describe('servicesWithoutCoverage: los servicios que ninguna franja del alta cubre (D-07)', () => {
  it('con cada servicio declarado en alguna franja, no avisa nada', () => {
    const days = week({
      1: [block({ service_ids: [svcA] })],
      2: [block({ service_ids: [svcB] })],
    })

    expect(servicesWithoutCoverage([svc(svcA, 'Cerámica'), svc(svcB, 'Yoga')], days)).toEqual([])
  })

  it('nombra SOLO al servicio que ninguna franja declara', () => {
    const days = week({
      1: [block({ service_ids: [svcA] })],
      2: [block({ service_ids: [svcA] })],
    })

    const sinCobertura = servicesWithoutCoverage([svc(svcA, 'Cerámica'), svc(svcB, 'Yoga')], days)

    expect(sinCobertura.map(s => s.name)).toEqual(['Yoga'])
  })

  it('con los SIETE días cerrados no avisa de nada (la guarda del negocio sin franjas, CR-01)', () => {
    const days = week({}) // cero franjas abiertas: la pregunta no tiene sujeto

    // Apoyado en `isServiceScheduled` en vez de en `hasScheduleCoverage`, acá saldrían los DOS
    // servicios y el dueño vería su catálogo entero marcado como sin horario.
    expect(servicesWithoutCoverage([svc(svcA, 'Cerámica'), svc(svcB, 'Yoga')], days)).toEqual([])
  })

  it('una sola franja comodín alcanza para cubrir todo el catálogo (D-01)', () => {
    const days = week({
      1: [block({ service_ids: [svcA] })],
      2: [block()], // comodín: no declara ningún servicio ⇒ sirve para todos
    })

    expect(servicesWithoutCoverage([svc(svcA, 'Cerámica'), svc(svcB, 'Yoga')], days)).toEqual([])
  })

  it('ignora las filas de servicio sin nombre: el dueño no puede recibir un aviso de una fila que ni cargó', () => {
    const days = week({
      1: [block({ service_ids: [svcA] })],
    })

    const sinCobertura = servicesWithoutCoverage(
      [svc(svcA, 'Cerámica'), svc(svcB, '  '), svc(svcBorrado, 'Yoga')],
      days,
    )

    expect(sinCobertura.map(s => s.id)).toEqual([svcBorrado])
  })

  it('un día cerrado no aporta sus franjas, pero un día abierto entre cerrados sí', () => {
    const days = week({ 3: [block({ service_ids: [svcA] })] })
    // Lunes cerrado con basura adentro: declara svcB, pero como el día está cerrado no cuenta.
    days[1] = { enabled: false, blocks: [block({ service_ids: [svcB] })] }

    const sinCobertura = servicesWithoutCoverage([svc(svcA, 'Cerámica'), svc(svcB, 'Yoga')], days)

    // svcA está cubierto por el miércoles (abierto, en el medio de días cerrados); svcB no, porque su
    // única franja está en un día cerrado.
    expect(sinCobertura.map(s => s.name)).toEqual(['Yoga'])
  })
})
