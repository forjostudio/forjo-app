import { describe, it, expect } from 'vitest'
import { previewBookingInputs } from '@/lib/preview-booking'
import type { Professional, Service } from '@/lib/types'

// ── previewBookingInputs: la proyección que el preview del CMS usa para NO mentir ─────────────────
//
// Qué se prueba acá y por qué importa. El preview de /web y la página pública /[slug] tienen que
// llegar al MISMO widget de reserva con los MISMOS datos. La página pública los recibe de las vistas
// acotadas (`public_services`, `public_professionals`, `public_canchas`); el dashboard NO puede leer
// esas vistas (son DEFINER, sin security_invoker: leerlas desde una superficie autenticada dejaría el
// aislamiento colgado sólo del filtro explícito), así que REPRODUCE sus WHERE sobre las tablas base
// leídas con la sesión del dueño. Este archivo fija esa reproducción, caso por caso.
//
// Es el carril PURO: sin DB, sin marcador `hasSupabaseCreds`. La otra mitad —que la reproducción
// coincida con lo que las vistas devuelven DE VERDAD— vive en test/preview-booking-parity.test.ts,
// que sí pega contra el Supabase local. Los dos juntos son el pin: acá la regla, allá la paridad.

// ── Fixtures mínimos ─────────────────────────────────────────────────────────────────────────────
// Se construyen a mano (no hay DB en este carril) con TODAS las columnas NOT NULL del tipo, para que
// el cast no mienta sobre la forma de la fila.
const BIZ = '11111111-1111-1111-1111-111111111111'

function svc(id: string, over: Partial<Service> = {}): Service {
  return {
    id,
    business_id: BIZ,
    name: `svc-${id}`,
    duration_minutes: 30,
    price: 100,
    description: null,
    active: true,
    capacity_mode: 'individual',
    capacity: 1,
    created_at: '2026-01-01T00:00:00Z',
    ...over,
  }
}

function pro(id: string, over: Partial<Professional> = {}): Professional {
  return {
    id,
    business_id: BIZ,
    name: `pro-${id}`,
    last_name: null,
    specialty: null,
    license_number: null,
    phone: null,
    email: null,
    photo_url: null,
    active: true,
    service_id: null,
    created_at: '2026-01-01T00:00:00Z',
    ...over,
  }
}

describe('previewBookingInputs (la proyección del preview espeja las vistas del público)', () => {
  // (1) Eje SERVICIOS: espeja `public_services` = WHERE active = true.
  it('devuelve sólo los servicios activos (espeja el WHERE de public_services)', () => {
    const activo = svc('s-activo')
    const inactivo = svc('s-inactivo', { active: false })

    const out = previewBookingInputs({ services: [activo, inactivo], professionals: [] })

    expect(out.services.map((s) => s.id)).toEqual(['s-activo'])
  })

  // (2) Eje STAFF: espeja `public_professionals` = WHERE active = true AND service_id IS NULL.
  // Las DOS mitades del WHERE en un solo caso: el inactivo queda afuera por `active`, y la
  // agenda-cancha (activa, pero con puntero a service) queda afuera por `service_id` — que es
  // exactamente el hardening de la migr. 060 (una cancha no es un profesional reservable).
  it('excluye al profesional inactivo Y a la agenda-cancha (active + service_id IS NULL)', () => {
    const staff = pro('p-staff')
    const inactivo = pro('p-inactivo', { active: false })
    const agendaCancha = pro('p-cancha', { service_id: 's-cancha' })

    const out = previewBookingInputs({
      services: [svc('s-cancha')],
      professionals: [staff, inactivo, agendaCancha],
    })

    expect(out.professionals.map((p) => p.id)).toEqual(['p-staff'])
  })

  // (3) Eje CANCHAS: el JOIN de `public_canchas` derivado, y la regla dura D-01 de la migr. 044 —
  // la proyección NUNCA emite `service_id`. El assert es sobre las CLAVES del objeto, no sobre el
  // valor: un `service_id: undefined` serializaría igual de mal en el payload RSC.
  it('proyecta la cancha válida con las 5 columnas de PublicCancha y SIN service_id', () => {
    const service = svc('s-cancha', { price: 8500, duration_minutes: 90 })
    const agenda = pro('p-cancha', { name: 'Cancha 1', service_id: 's-cancha' })

    const out = previewBookingInputs({ services: [service], professionals: [agenda] })

    expect(out.canchas).toEqual([
      { id: 'p-cancha', business_id: BIZ, name: 'Cancha 1', price: 8500, duration_minutes: 90 },
    ])
    // La clave NO existe (no "existe con undefined"): es puntero interno, y filtrarlo le permitiría
    // al cliente inferir el service para tampear precio/duración.
    expect(Object.keys(out.canchas[0]).sort()).toEqual([
      'business_id',
      'duration_minutes',
      'id',
      'name',
      'price',
    ])
    expect('service_id' in out.canchas[0]).toBe(false)
  })

  // (4) Soft-delete de una cancha: deleteCancha apaga las DOS mitades (service + professional). La
  // vista exige `p.active AND s.active`, así que con el service apagado la cancha no sale ni aunque
  // la agenda siguiera activa (estado alcanzable si un update quedó a medias).
  it('no emite la cancha cuyo service está desactivado (aunque su agenda siga activa)', () => {
    const service = svc('s-cancha', { active: false })
    const agenda = pro('p-cancha', { service_id: 's-cancha' })

    const out = previewBookingInputs({ services: [service], professionals: [agenda] })

    expect(out.canchas).toEqual([])
  })

  // (5) Puntero colgado: un `service_id` que no existe en `services` (service borrado, o fuera del
  // set leído). El JOIN de la vista no produce fila; la derivación tampoco — y sobre todo NO tira.
  it('un service_id colgado no produce fila ni lanza', () => {
    const agenda = pro('p-cancha', { service_id: 's-que-no-existe' })

    expect(() => previewBookingInputs({ services: [], professionals: [agenda] })).not.toThrow()
    expect(previewBookingInputs({ services: [], professionals: [agenda] }).canchas).toEqual([])
  })

  // (6) El 99% de los tenants (salud/belleza/general) no tiene canchas: la derivación no puede
  // ensuciarles nada. Control de no-regresión del gateo por vertical.
  it('un negocio sin canchas devuelve canchas vacío y el catálogo intacto', () => {
    const out = previewBookingInputs({
      services: [svc('s1'), svc('s2')],
      professionals: [pro('p1'), pro('p2')],
    })

    expect(out.canchas).toEqual([])
    expect(out.services.map((s) => s.id)).toEqual(['s1', 's2'])
    expect(out.professionals.map((p) => p.id)).toEqual(['p1', 'p2'])
  })
})
