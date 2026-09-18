import { describe, it, expect, vi } from 'vitest'
import {
  MAX_CAPACITY,
  capacityModePatch,
  guardDraftOnDismiss,
  locToPayload,
  locationFormFingerprint,
  minCapacityFor,
  normalizeCapacity,
  proFormFingerprint,
  proToPayload,
  serviceFormFingerprint,
  type DraftDismissDetails,
  type LocationEditForm,
  type ProForm,
  type ServiceEditForm,
} from '@/lib/panel-draft'
import { SIN_CATEGORIA } from '@/lib/catalog-panel'

// ── Phase 23 (code-review WR-09) — tests PUROS de lib/panel-draft.ts ───────────────────────────
// Molde: test/catalog-panel.test.ts (misma fase). describe/it/expect, import desde @/lib/..., sin
// base y sin credenciales: es carril `pure` y tiene que seguir siéndolo.
//
// Lo que estos tests congelan, que hasta el review sólo se podía verificar A OJO porque las funciones
// vivían dentro de un componente cliente de 4.100 líneas:
//
//   1. El round-trip del modo de cupo NO pierde el número (WR-05). Es el test más valioso del
//      archivo: el defecto que el gate de `grep` del plan no podía ver.
//   2. Los cuatro falsos positivos de la huella que el plan de G-23-25 declara cubiertos —normalizar
//      al salir de un campo, prender y apagar una sede, ir y volver de modo de cupo, y un servicio
//      con la categoría borrada—, porque una huella que marca sucio un formulario que nadie tocó
//      ENCIERRA al dueño en un diálogo que ya no cierra con un click afuera.
//   3. La guarda mira EXACTAMENTE dos motivos, y nunca la ✕ (si la alcanzara, un borrador con el
//      nombre vacío —Guardar deshabilitado— no tendría ninguna salida).

const UUID_A = '6f1c2a54-9a1e-4b8e-8f53-2b1d0c7e9a11'
const UUID_B = 'b0a1c2d3-4e5f-4a6b-8c9d-0e1f2a3b4c5d'

function svcForm(over: Partial<ServiceEditForm> = {}): ServiceEditForm {
  return {
    name: 'Clase de yoga',
    duration_minutes: '60',
    price: '5000',
    location_ids: [],
    capacity_mode: 'group_class',
    capacity: 12,
    category: SIN_CATEGORIA,
    description: '',
    ...over,
  }
}

// ── Piso, techo y normalización del cupo ──────────────────────────────────────────────────────
describe('minCapacityFor / normalizeCapacity — el espejo del CHECK de la migr. 068', () => {
  it('individual tiene piso 1 y los dos modos compartidos piso 2', () => {
    expect(minCapacityFor('individual')).toBe(1)
    expect(minCapacityFor('group_class')).toBe(2)
    expect(minCapacityFor('simultaneous_resource')).toBe(2)
  })

  it('satura contra el piso y contra el techo del panel', () => {
    expect(normalizeCapacity(0, 2)).toBe(2)
    expect(normalizeCapacity(40000, 2)).toBe(MAX_CAPACITY)
    expect(normalizeCapacity(12, 2)).toBe(12)
  })

  it('un número no finito cae al piso (NaN e Infinity) y los decimales se truncan', () => {
    // `Number.isFinite` descarta los dos: un campo vaciado da NaN y ninguno de los dos puede viajar
    // a una columna `smallint`.
    expect(normalizeCapacity(Number.NaN, 2)).toBe(2)
    expect(normalizeCapacity(Number.POSITIVE_INFINITY, 2)).toBe(2)
    expect(normalizeCapacity(7.9, 1)).toBe(7)
  })
})

// ── WR-05: el round-trip de modo no puede perder el cupo ──────────────────────────────────────
describe('capacityModePatch — ir a “Individual” y volver conserva el número', () => {
  it('entrar a un modo compartido sube el cupo a su piso legal', () => {
    expect(capacityModePatch('group_class', 1)).toEqual({ capacity_mode: 'group_class', capacity: 2 })
    expect(capacityModePatch('simultaneous_resource', 1)).toEqual({ capacity_mode: 'simultaneous_resource', capacity: 2 })
  })

  it('ir a individual CONSERVA el cupo del borrador (no lo pisa con 1)', () => {
    expect(capacityModePatch('individual', 12)).toEqual({ capacity_mode: 'individual', capacity: 12 })
  })

  it('REGRESIÓN WR-05: grupal → individual → grupal deja los 12 lugares intactos', () => {
    const ida = capacityModePatch('individual', 12)
    const vuelta = capacityModePatch('group_class', ida.capacity)
    expect(vuelta).toEqual({ capacity_mode: 'group_class', capacity: 12 })
  })

  it('el techo se sigue aplicando al entrar a un modo compartido', () => {
    expect(capacityModePatch('group_class', 40000).capacity).toBe(MAX_CAPACITY)
  })
})

// ── La huella del servicio: los cuatro falsos positivos declarados ─────────────────────────────
describe('serviceFormFingerprint — cuándo un borrador está REALMENTE sucio', () => {
  it('el mismo borrador da la misma huella', () => {
    expect(serviceFormFingerprint(svcForm(), [])).toBe(serviceFormFingerprint(svcForm(), []))
  })

  it('falso positivo 1: normalizar al salir de un campo no ensucia', () => {
    // El onBlur del precio reescribe "5000" como "5000" y el de la duración "60" como "60": los dos
    // lados corren el MISMO normalizador, así que el texto crudo y el normalizado colapsan igual.
    const base = serviceFormFingerprint(svcForm({ price: '5000', duration_minutes: '60' }), [])
    expect(serviceFormFingerprint(svcForm({ price: '5000.0', duration_minutes: '60' }), [])).toBe(base)
    expect(serviceFormFingerprint(svcForm({ name: '  Clase de yoga  ' }), [])).toBe(base)
  })

  it('falso positivo 2: prender y apagar una sede no ensucia (el conjunto se ordena)', () => {
    const base = serviceFormFingerprint(svcForm({ location_ids: [UUID_A, UUID_B] }), [])
    expect(serviceFormFingerprint(svcForm({ location_ids: [UUID_B, UUID_A] }), [])).toBe(base)
  })

  it('falso positivo 3 (WR-05): ir y volver de modo de cupo no ensucia', () => {
    const partida = svcForm({ capacity_mode: 'group_class', capacity: 12 })
    const base = serviceFormFingerprint(partida, [])
    const individual = { ...partida, ...capacityModePatch('individual', partida.capacity) }
    const vuelta = { ...individual, ...capacityModePatch('group_class', individual.capacity) }
    expect(serviceFormFingerprint(vuelta, [])).toBe(base)
    // Y el paso intermedio SÍ es un cambio real: el modo es otro.
    expect(serviceFormFingerprint(individual, [])).not.toBe(base)
  })

  it('falso positivo 4: un servicio con la categoría borrada no ensucia (se sanea contra las vivas)', () => {
    // El borrador guarda el uuid que el dueño eligió; si esa categoría se borró desde el organizador,
    // el Select pinta "Sin categoría". Los dos lados colapsan el uuid muerto al centinela.
    const conUuidMuerto = serviceFormFingerprint(svcForm({ category: UUID_A }), [])
    const conCentinela = serviceFormFingerprint(svcForm({ category: SIN_CATEGORIA }), [])
    expect(conUuidMuerto).toBe(conCentinela)
    // Con la categoría VIVA, elegirla sí es un cambio.
    expect(serviceFormFingerprint(svcForm({ category: UUID_A }), [UUID_A])).not.toBe(conCentinela)
  })

  it('con cupo individual el número no participa de la huella (el guardado escribe 1 igual)', () => {
    const a = serviceFormFingerprint(svcForm({ capacity_mode: 'individual', capacity: 12 }), [])
    const b = serviceFormFingerprint(svcForm({ capacity_mode: 'individual', capacity: 1 }), [])
    expect(a).toBe(b)
  })

  it('un cambio de verdad SÍ ensucia: nombre, precio, duración, cupo, descripción y sedes', () => {
    const base = serviceFormFingerprint(svcForm(), [])
    expect(serviceFormFingerprint(svcForm({ name: 'Otra clase' }), [])).not.toBe(base)
    expect(serviceFormFingerprint(svcForm({ price: '6000' }), [])).not.toBe(base)
    expect(serviceFormFingerprint(svcForm({ duration_minutes: '90' }), [])).not.toBe(base)
    expect(serviceFormFingerprint(svcForm({ capacity: 9 }), [])).not.toBe(base)
    expect(serviceFormFingerprint(svcForm({ description: 'Incluye mat' }), [])).not.toBe(base)
    expect(serviceFormFingerprint(svcForm({ location_ids: [UUID_A] }), [])).not.toBe(base)
  })

  it('vacío y sólo-espacios colapsan igual en la descripción (el guardado hace trim() || null)', () => {
    const vacia = serviceFormFingerprint(svcForm({ description: '' }), [])
    expect(serviceFormFingerprint(svcForm({ description: '   ' }), [])).toBe(vacia)
  })
})

// ── Sede y profesional ────────────────────────────────────────────────────────────────────────
describe('locToPayload / locationFormFingerprint — una sola normalización para la sede', () => {
  const loc = (over: Partial<LocationEditForm> = {}): LocationEditForm => ({ name: 'Centro', address: '', phone: '', ...over })

  it('los opcionales vacíos van como null y el nombre va con trim', () => {
    expect(locToPayload(loc({ name: '  Centro  ', address: '   ' }))).toEqual({ name: 'Centro', address: null, phone: null })
  })

  it('la huella es el payload: espaciar de más no ensucia, cambiar el texto sí', () => {
    const base = locationFormFingerprint(loc())
    expect(locationFormFingerprint(loc({ name: ' Centro ' }))).toBe(base)
    expect(locationFormFingerprint(loc({ address: 'San Martín 100' }))).not.toBe(base)
  })
})

describe('proToPayload / proFormFingerprint — el profesional', () => {
  const pro = (over: Partial<ProForm> = {}): ProForm => ({
    name: 'Ana', last_name: '', specialty: '', license_number: '', phone: '', email: '', ...over,
  })

  it('los opcionales vacíos van como null', () => {
    expect(proToPayload(pro())).toEqual({ name: 'Ana', last_name: null, specialty: null, license_number: null, phone: null, email: null })
  })

  it('la huella no se mueve por espacios de borde y sí por un dato nuevo', () => {
    const base = proFormFingerprint(pro())
    expect(proFormFingerprint(pro({ name: '  Ana  ', phone: '  ' }))).toBe(base)
    expect(proFormFingerprint(pro({ phone: '+54 9 11' }))).not.toBe(base)
  })
})

// ── La guarda del descarte accidental ─────────────────────────────────────────────────────────
describe('guardDraftOnDismiss — qué cierra, qué se cancela y qué avisa', () => {
  function run(reason: DraftDismissDetails['reason'], dirty: boolean) {
    const close = vi.fn()
    const onBlocked = vi.fn()
    const cancel = vi.fn()
    const isDirty = vi.fn(() => dirty)
    guardDraftOnDismiss(isDirty, close, onBlocked)(false, { reason, cancel })
    return { close, onBlocked, cancel, isDirty }
  }

  it('sin cambios, los dos motivos accidentales cierran sin aviso', () => {
    for (const reason of ['outside-press', 'escape-key'] as const) {
      const { close, onBlocked, cancel } = run(reason, false)
      expect(close).toHaveBeenCalledTimes(1)
      expect(cancel).not.toHaveBeenCalled()
      expect(onBlocked).not.toHaveBeenCalled()
    }
  })

  it('con cambios, el click afuera y el Escape se CANCELAN y avisan', () => {
    for (const reason of ['outside-press', 'escape-key'] as const) {
      const { close, onBlocked, cancel } = run(reason, true)
      expect(cancel).toHaveBeenCalledTimes(1)
      expect(onBlocked).toHaveBeenCalledTimes(1)
      expect(close).not.toHaveBeenCalled()
    }
  })

  it('la ✕ cierra SIEMPRE, aunque el borrador esté sucio (es la única salida del nombre vacío)', () => {
    const { close, onBlocked, cancel } = run('close-press', true)
    expect(close).toHaveBeenCalledTimes(1)
    expect(cancel).not.toHaveBeenCalled()
    expect(onBlocked).not.toHaveBeenCalled()
  })

  it('los otros motivos tampoco se bloquean (focus-out, imperative-action, none)', () => {
    for (const reason of ['focus-out', 'imperative-action', 'none'] as const) {
      const { close, cancel } = run(reason, true)
      expect(close).toHaveBeenCalledTimes(1)
      expect(cancel).not.toHaveBeenCalled()
    }
  })

  it('abrir no hace nada, y la huella NO se calcula en un cierre que igual va a pasar', () => {
    const close = vi.fn()
    const onBlocked = vi.fn()
    const isDirty = vi.fn(() => true)
    const handler = guardDraftOnDismiss(isDirty, close, onBlocked)
    handler(true, { reason: 'trigger-press', cancel: vi.fn() })
    expect(close).not.toHaveBeenCalled()
    expect(isDirty).not.toHaveBeenCalled()
    handler(false, { reason: 'close-press', cancel: vi.fn() })
    expect(close).toHaveBeenCalledTimes(1)
    expect(isDirty).not.toHaveBeenCalled()
  })
})
