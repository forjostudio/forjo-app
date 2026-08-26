import { describe, it, expect } from 'vitest'
import {
  blocksForService,
  isServiceScheduled,
  isServiceAllowedAt,
  startTimesNotOffered,
  servicesOfBlock,
  isBlockWildcard,
} from '@/lib/time-block-services'
import type { BlockWindow } from '@/lib/time-block-services'
import type { TimeBlockService } from '@/lib/types'

// ── Phase 18 (la agenda por servicio) — tests puros de lib/time-block-services.ts ──
// Espejan test/staff-services.test.ts: describe/it/expect, import desde @/lib/..., SIN Supabase
// ni credenciales. Congelan la regla del comodín (D-01) que la disponibilidad (Plan 03), el
// backstop del create (Plan 04) y el panel de la Phase 19 tienen que interpretar IGUAL.
//
// ⚠ El estándar del workstream es el CONTROL NEGATIVO, y acá hay un agravante propio de la fase
// (D-02): los casos con la puente VACÍA son el camino comodín, o sea el comportamiento de HOY —
// pasan aunque la regla no exista y por sí solos no prueban nada. Por eso cada caso comodín va
// emparejado con su caso con filas, que es el que muerde.

// ── Factories mínimas (solo los campos que leen las funciones puras) ──────────────
function block(id: string, start_time: string, end_time: string): BlockWindow {
  return { id, start_time, end_time }
}

function map(time_block_id: string, service_id: string, business_id = 'biz'): TimeBlockService {
  return { business_id, time_block_id, service_id }
}

// ── Suite 1: blocksForService (dónde se da cada servicio) ─────────────────────────
describe('blocksForService — regla del comodín (D-01)', () => {
  it('franja con 0 filas sirve para TODOS los servicios (comodín)', () => {
    const blocks = [block('manana', '09:00', '13:00')]
    expect(blocksForService('corte', blocks, []).map((b) => b.id)).toEqual(['manana'])
    expect(blocksForService('color', blocks, []).map((b) => b.id)).toEqual(['manana'])
    expect(blocksForService('ceramica', blocks, []).map((b) => b.id)).toEqual(['manana'])
  })

  it('CONTROL NEGATIVO de 1: franja con mapeo explícito sirve SOLO los servicios marcados', () => {
    const blocks = [block('manana', '09:00', '13:00'), block('tarde', '14:00', '18:00')]
    const bridge = [map('manana', 'corte'), map('tarde', 'color')]
    expect(blocksForService('corte', blocks, bridge).map((b) => b.id)).toEqual(['manana'])
    expect(blocksForService('color', blocks, bridge).map((b) => b.id)).toEqual(['tarde'])
    // ceramica no la marcó ninguna franja y ninguna es comodín → no se da en ningún lado
    expect(blocksForService('ceramica', blocks, bridge)).toEqual([])
  })

  it('CONTROL NEGATIVO: el mapeo de OTRA franja no afecta a ésta (sigue comodín)', () => {
    // detecta el bug de filtrar la puente GLOBAL sin filtrar por time_block_id: ese bug pasa el
    // caso feliz y falla éste, porque "tarde" no tiene filas propias y debe seguir sirviendo todo
    const blocks = [block('manana', '09:00', '13:00'), block('tarde', '14:00', '18:00')]
    const bridge = [map('manana', 'corte')]
    expect(blocksForService('color', blocks, bridge).map((b) => b.id)).toEqual(['tarde'])
    expect(blocksForService('corte', blocks, bridge).map((b) => b.id)).toEqual(['manana', 'tarde'])
  })

  it('CONTRATO D-16: filas con otro business_id se interpretan igual — el helper NO filtra por negocio', () => {
    // el aislamiento ya lo hizo el caller con su .eq('business_id', ...); congelar esto acá evita
    // que alguien agregue un filtro por tenant adentro y crea que el módulo aísla (T-18-07)
    const blocks = [block('manana', '09:00', '13:00')]
    const ajena = [map('manana', 'corte', 'otro-negocio')]
    const propia = [map('manana', 'corte', 'biz')]
    expect(blocksForService('corte', blocks, ajena).map((b) => b.id)).toEqual(
      blocksForService('corte', blocks, propia).map((b) => b.id),
    )
    expect(blocksForService('color', blocks, ajena)).toEqual([])
  })
})

// ── Suite 2: isServiceScheduled (el dato de D-06, computable y legal) ─────────────
describe('isServiceScheduled — servicio sin franja que lo cubra (D-06)', () => {
  it('todas las franjas comodín: TODO servicio está agendado', () => {
    const blocks = [block('manana', '09:00', '13:00'), block('tarde', '14:00', '18:00')]
    expect(isServiceScheduled('corte', blocks, [])).toBe(true)
    expect(isServiceScheduled('ceramica', blocks, [])).toBe(true)
  })

  it('CONTROL NEGATIVO de 5: todas con mapeo explícito y ninguna marca el servicio ⇒ false (legal, sólo computable)', () => {
    const blocks = [block('manana', '09:00', '13:00'), block('tarde', '14:00', '18:00')]
    const bridge = [map('manana', 'corte'), map('tarde', 'color')]
    expect(isServiceScheduled('ceramica', blocks, bridge)).toBe(false)
    // no es un error: corte y color siguen agendados, el negocio opera igual (D-06)
    expect(isServiceScheduled('corte', blocks, bridge)).toBe(true)
    expect(isServiceScheduled('color', blocks, bridge)).toBe(true)
  })

  it('una sola franja comodín entre varias mapeadas vuelve a agendar todo', () => {
    const blocks = [block('manana', '09:00', '13:00'), block('tarde', '14:00', '18:00')]
    const bridge = [map('manana', 'corte')] // "tarde" queda comodín
    expect(isServiceScheduled('ceramica', blocks, bridge)).toBe(true)
    // y es consistente con blocksForService (fuente única)
    expect(isServiceScheduled('ceramica', blocks, bridge)).toBe(
      blocksForService('ceramica', blocks, bridge).length > 0,
    )
  })
})

// ── Suite 3: isServiceAllowedAt (la regla del ACEPTA, D-04) ───────────────────────
describe('isServiceAllowedAt — la regla del ACEPTA (D-04)', () => {
  it('CONTROL ANTI-REGRESIÓN: un horario que NO cae en ninguna franja se acepta (no hay validación general de ventana)', () => {
    // si esto diera false se romperían los días con horario especial que EXTIENDEN la jornada
    // (no están en time_blocks) y el alta fuera de franja — regresión grave de AGENDA-04
    const blocks = [block('manana', '09:00', '13:00')]
    const bridge = [map('manana', 'corte')]
    expect(isServiceAllowedAt('corte', 20 * 60, blocks, bridge)).toBe(true)
    expect(isServiceAllowedAt('ceramica', 20 * 60, blocks, bridge)).toBe(true)
  })

  it('CONTROL NEGATIVO de 8: un horario dentro de una franja que NO da el servicio se rechaza', () => {
    // el caso que cierra el agujero de D-04: cerámica a las 10 en la franja de corte
    const blocks = [block('manana', '09:00:00', '13:00:00')] // 'HH:MM:SS' como lo devuelve Postgres
    const bridge = [map('manana', 'corte')]
    expect(isServiceAllowedAt('ceramica', 10 * 60, blocks, bridge)).toBe(false)
    expect(isServiceAllowedAt('corte', 10 * 60, blocks, bridge)).toBe(true)
  })

  it('con dos franjas solapadas, alcanza con que UNA de las que contienen el horario dé el servicio', () => {
    const blocks = [block('corte-am', '09:00', '13:00'), block('ceramica-am', '09:00', '11:00')]
    const bridge = [map('corte-am', 'corte'), map('ceramica-am', 'ceramica')]
    expect(isServiceAllowedAt('ceramica', 10 * 60, blocks, bridge)).toBe(true)
    // a las 12 ya no solapan: sólo queda la de corte, que no da cerámica
    expect(isServiceAllowedAt('ceramica', 12 * 60, blocks, bridge)).toBe(false)
  })

  it('con la puente vacía cualquier horario dentro de cualquier franja se acepta (comodín)', () => {
    const blocks = [block('manana', '09:00', '13:00')]
    expect(isServiceAllowedAt('ceramica', 10 * 60, blocks, [])).toBe(true)
  })

  it('borde: la apertura está contenida, el cierre NO', () => {
    const blocks = [block('manana', '09:00', '13:00')]
    const bridge = [map('manana', 'corte')]
    // 09:00 cae dentro de la franja de corte → cerámica rechazada
    expect(isServiceAllowedAt('ceramica', 9 * 60, blocks, bridge)).toBe(false)
    // 13:00 es el cierre: ya no está contenido → no hay franja contenedora → se acepta
    expect(isServiceAllowedAt('ceramica', 13 * 60, blocks, bridge)).toBe(true)
  })
})

// ── Suite 4: startTimesNotOffered (qué horarios dejar de ofrecer) ─────────────────
describe('startTimesNotOffered — la resta de conjuntos', () => {
  it('puente vacía: no se oculta nada (día de la migración, D-02)', () => {
    const blocks = [block('manana', '09:00', '13:00'), block('tarde', '14:00', '18:00')]
    expect(startTimesNotOffered('ceramica', blocks, [], 60)).toEqual([])
  })

  it('CONTROL NEGATIVO de 13: con dos franjas mapeadas se ocultan SÓLO los horarios de la que no da el servicio', () => {
    const blocks = [block('manana', '09:00', '11:00'), block('tarde', '14:00', '16:00')]
    const bridge = [map('manana', 'corte'), map('tarde', 'color')]
    expect(startTimesNotOffered('corte', blocks, bridge, 60)).toEqual(['14:00', '15:00'])
    expect(startTimesNotOffered('color', blocks, bridge, 60)).toEqual(['09:00', '10:00'])
  })

  it('CONTROL NEGATIVO de la resta: dos franjas solapadas que arrancan a la misma hora, una que SÍ lo da ⇒ ese horario no se oculta', () => {
    // una implementación que devuelva "los horarios de las franjas que no lo dan" pasa el caso
    // anterior y falla éste: ocultaría las 09:00, que la franja de corte ofrece legítimamente
    const blocks = [block('corte-am', '09:00', '11:00'), block('color-am', '09:00', '10:00')]
    const bridge = [map('corte-am', 'corte'), map('color-am', 'color')]
    expect(startTimesNotOffered('corte', blocks, bridge, 60)).toEqual([])
    // y al revés: para color se ocultan las 10:00 (sólo las genera la de corte), no las 09:00
    expect(startTimesNotOffered('color', blocks, bridge, 60)).toEqual(['10:00'])
  })

  it('la duración cambia la grilla: con el doble de duración sale la mitad de horarios', () => {
    const blocks = [block('manana', '09:00', '13:00')]
    const bridge = [map('manana', 'corte')]
    expect(startTimesNotOffered('ceramica', blocks, bridge, 60)).toEqual([
      '09:00',
      '10:00',
      '11:00',
      '12:00',
    ])
    expect(startTimesNotOffered('ceramica', blocks, bridge, 120)).toEqual(['09:00', '11:00'])
    // entrada degenerada: sin paso no hay grilla que enumerar
    expect(startTimesNotOffered('ceramica', blocks, bridge, 0)).toEqual([])
  })
})

// ── Suite 5: servicesOfBlock (la pregunta INVERSA que necesita el panel) ──────────
// Phase 19: el panel pinta, por franja, QUÉ se da ahí. Congelar estos casos es lo que impide que
// esa lectura se reimplemente con un `.filter(r => r.time_block_id === ...)` inline en el JSX
// (AGENDA-02): dos lecturas de la misma regla es como el panel y el motor terminan diciendo cosas
// distintas sobre la misma franja.
describe('servicesOfBlock — qué declara la franja (D-01)', () => {
  it('franja sin filas ⇒ arreglo vacío (y vacío SIGNIFICA comodín, no "sin servicios")', () => {
    expect(servicesOfBlock('manana', [])).toEqual([])
  })

  it('CONTROL NEGATIVO de 1: franja con dos filas ⇒ exactamente esos dos ids, en el orden de la puente', () => {
    const bridge = [map('manana', 'corte'), map('manana', 'color')]
    expect(servicesOfBlock('manana', bridge)).toEqual(['corte', 'color'])
  })

  it('CONTROL NEGATIVO: las filas de OTRA franja no contaminan el resultado', () => {
    // detecta olvidarse de filtrar por time_block_id: ese bug pasa el caso anterior y falla éste,
    // porque "tarde" no tiene filas propias y tiene que salir comodín
    const bridge = [map('manana', 'corte'), map('tarde', 'color')]
    expect(servicesOfBlock('manana', bridge)).toEqual(['corte'])
    expect(servicesOfBlock('tarde', bridge)).toEqual(['color'])
    expect(servicesOfBlock('noche', bridge)).toEqual([])
  })

  it('CONTRATO D-16: filas con otro business_id se interpretan igual — el helper NO filtra por negocio', () => {
    // mismo motivo que en blocksForService (T-19-02): filtrar por tenant acá adentro daría una
    // falsa sensación de aislamiento en un módulo que no puede validar el origen de las filas
    const ajena = [map('manana', 'corte', 'otro-negocio')]
    const propia = [map('manana', 'corte', 'biz')]
    expect(servicesOfBlock('manana', ajena)).toEqual(servicesOfBlock('manana', propia))
  })
})

// ── Suite 6: isBlockWildcard (¿esta franja sirve para todo?) ──────────────────────
describe('isBlockWildcard — comodín ⟺ cero filas (D-01, D-11)', () => {
  it('franja sin ninguna fila en la puente ⇒ true (comodín)', () => {
    expect(isBlockWildcard('manana', [])).toBe(true)
  })

  it('CONTROL NEGATIVO de 5: franja con una fila ⇒ false', () => {
    expect(isBlockWildcard('manana', [map('manana', 'corte')])).toBe(false)
  })

  it('EL CASO MORDEDOR (D-11): franja cuyo único mapeo es a un servicio DESACTIVADO ⇒ false, porque el motor tampoco la trata como comodín', () => {
    // 'ceramica-vieja' es un servicio que el negocio tiene con active = false. La columna `active`
    // vive en `services`, NO en la puente: la fila sobrevive a la desactivación y la franja SIGUE
    // restringida para el motor. Si esta función aceptara cualquier noción de vigencia, el panel
    // pintaría "Cualquier servicio" sobre una franja que el público ve restringida — el panel
    // mentiría sobre lo que ve el cliente. Lo que congela este caso es que la firma NO tiene por
    // dónde recibir esa noción: sólo filas de la puente.
    const bridge = [map('manana', 'ceramica-vieja')]
    expect(isBlockWildcard('manana', bridge)).toBe(false)
    // y es consistente con servicesOfBlock (fuente única, cero chance de divergir)
    expect(isBlockWildcard('manana', bridge)).toBe(servicesOfBlock('manana', bridge).length === 0)
  })

  it('una franja comodín rodeada de franjas mapeadas sigue siendo comodín', () => {
    const bridge = [map('manana', 'corte'), map('noche', 'color')]
    expect(isBlockWildcard('tarde', bridge)).toBe(true)
    expect(isBlockWildcard('manana', bridge)).toBe(false)
  })
})
