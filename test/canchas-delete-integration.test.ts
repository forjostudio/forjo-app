import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { hasSupabaseCreds } from './env'
import { seedOneTenant, seedService, teardownOneTenant, type SeededTenant } from './helpers/booking-fixtures'
import { provisionCancha, deleteCancha, canchasFromData, dedicatedSpaceIds, type Cancha } from '@/lib/canchas'
import type { Service, Professional, AgendaSpace } from '@/lib/types'

// ── deleteCancha contra la BASE REAL (el hueco que dejó el fix de CR-01) ──────────────────────
//
// POR QUÉ EXISTE ESTE ARCHIVO. El fix de CR-01 (`lib/canchas.ts`, deleteCancha) ya está cubierto en
// `test/canchas-provision.test.ts:319-380`, pero ahí el cliente es un MOCK escrito a mano: esos casos
// asertan que deleteCancha REACCIONA bien DADO cierto comportamiento de la DB… y el comportamiento lo
// provee el propio mock. El argumento entero del fix se apoya en tres hechos del esquema real que
// nadie había verificado contra Postgres:
//
//   (a) `agenda_spaces.professional_id` es ON DELETE CASCADE  → el mapeo se va solo con la agenda, por
//       eso el fix pudo ELIMINAR el `from('agenda_spaces').delete()` previo.
//   (b) `appointments.professional_id` es NO ACTION           → CUALQUIER turno (pasado, cancelado, el
//       que sea) rechaza el DELETE del professional con 23503, y ese es el camino MÁS COMÚN.
//   (c) el gate de la 065 rechaza el DELETE del service con P0001 aunque el professional ya se haya
//       borrado → es el único camino donde corre el ROLLBACK MANUAL.
//
// Este archivo los verifica CON LA DB, no con un mock.
//
// SOBRE LA VERIFICACIÓN DE `pg_constraint.confdeltype`: no es alcanzable desde la suite. PostgREST solo
// expone el schema `public`, el repo no tiene un cliente Postgres directo (no hay `pg` ni `postgres` en
// node_modules) y agregar uno sería una dependencia nueva. La verificación acá es CONDUCTUAL, que además
// es más fuerte: los tres valores posibles de `confdeltype` se distinguen por lo que pasa al borrar
// (CASCADE = la fila hija desaparece; NO ACTION = error 23503; SET NULL = la columna queda en NULL, y
// en `agenda_spaces.professional_id` es NOT NULL, así que ni siquiera sería declarable). Medido a mano
// contra la DB local el 2026-08-03, para dejar el dato escrito:
//   agenda_spaces_professional_id_fkey = 'c' (CASCADE) · appointments_professional_id_fkey = 'a'
//   (NO ACTION) · abonos_professional_id_fkey = 'n' (SET NULL) · professionals_service_id_fkey = 'n'.
//
// Sin creds de Supabase el bloque entero se skipea (mismo molde que service-delete-gate.test.ts).
// Cada caso provisiona SU PROPIA cancha (nombre único) para no pisarse con los demás.

const FUTURE = '2031-03-03' // lunes, siempre futuro
const PAST = '2020-03-02' // siempre pasado, fuera de la ventana del gate

describe.skipIf(!hasSupabaseCreds)('canchas: deleteCancha contra la DB real (CR-01)', () => {
  let t: SeededTenant
  let other: SeededTenant

  beforeAll(async () => {
    t = await seedOneTenant({ bufferMinutes: 0, serviceDurationMinutes: 30 })
    // Segundo tenant: SOLO para el caso 5 (IN-05, referencia cruzada entre negocios).
    other = await seedOneTenant({ bufferMinutes: 0, serviceDurationMinutes: 30 })
  }, 30000)

  afterAll(async () => {
    if (t) await teardownOneTenant(t)
    if (other) await teardownOneTenant(other)
  })

  // Provisiona una cancha REAL (service + professional con service_id + space dedicado + agenda_spaces)
  // por el mismo camino que usa el panel.
  async function newCancha(name: string): Promise<Cancha> {
    const res = await provisionCancha(t.admin, t.businessId, { name, price: 8000, duration: 60 })
    if (!res.ok) throw new Error(`provisionCancha falló: ${res.error}`)
    return { service: res.service, professional: res.professional, spaceIds: res.spaceIds }
  }

  // Lee del tenant lo que `canchasFromData` necesita para reconstruir la tupla.
  async function tenantData(): Promise<{ services: Service[]; professionals: Professional[]; agendaSpaces: AgendaSpace[] }> {
    const [svc, pro, ags] = await Promise.all([
      t.admin.from('services').select('*').eq('business_id', t.businessId),
      t.admin.from('professionals').select('*').eq('business_id', t.businessId),
      t.admin.from('agenda_spaces').select('*').eq('business_id', t.businessId),
    ])
    if (svc.error || pro.error || ags.error) {
      throw new Error(`tenantData: ${svc.error?.message ?? pro.error?.message ?? ags.error?.message}`)
    }
    return {
      services: (svc.data ?? []) as Service[],
      professionals: (pro.data ?? []) as Professional[],
      agendaSpaces: (ags.data ?? []) as AgendaSpace[],
    }
  }

  async function rowExists(table: 'services' | 'professionals' | 'spaces', id: string): Promise<boolean> {
    const { data, error } = await t.admin.from(table).select('id').eq('id', id)
    if (error) throw new Error(`select ${table}: ${error.message}`)
    return (data ?? []).length > 0
  }

  async function mappingsFor(professionalId: string): Promise<AgendaSpace[]> {
    const { data, error } = await t.admin
      .from('agenda_spaces')
      .select('*')
      .eq('business_id', t.businessId)
      .eq('professional_id', professionalId)
    if (error) throw new Error(`select agenda_spaces: ${error.message}`)
    return (data ?? []) as AgendaSpace[]
  }

  async function seedAppointment(args: {
    serviceId: string
    professionalId: string
    date: string
    time: string
    status: string | null
  }): Promise<string> {
    const ins = await t.admin
      .from('appointments')
      .insert({
        business_id: t.businessId,
        service_id: args.serviceId,
        professional_id: args.professionalId,
        location_id: t.locationId,
        date: args.date,
        time: args.time,
        duration_minutes: 60,
        client_name: 'Cliente Cancha',
        status: args.status,
      })
      .select('id')
      .single()
    if (ins.error || !ins.data) throw new Error(`seed appointment: ${ins.error?.message}`)
    return ins.data.id as string
  }

  // (1) HECHO (a): el CASCADE de `agenda_spaces.professional_id` es REAL. Es lo que autoriza al fix a
  // NO borrar el mapeo a mano: si el DELETE de la agenda pasa, el mapeo se va con ella; y si NO pasa,
  // el mapeo queda intacto (que es todo el punto del cambio de orden).
  it('1 — borrar el professional se lleva su agenda_spaces por CASCADE (sin delete explícito)', async () => {
    const cancha = await newCancha('__test_cancha_cascade')

    // Antes: existe exactamente 1 mapeo agenda↔espacio dedicado.
    expect(await mappingsFor(cancha.professional.id)).toHaveLength(1)

    const del = await t.admin
      .from('professionals')
      .delete()
      .eq('id', cancha.professional.id)
      .eq('business_id', t.businessId)
    expect(del.error).toBeNull()

    // Después: el mapeo desapareció SIN que nadie lo borrara → CASCADE confirmado.
    expect(await mappingsFor(cancha.professional.id)).toHaveLength(0)
    // Y el CASCADE se detiene ahí: ni el espacio ni el service se van con la agenda.
    expect(await rowExists('spaces', cancha.spaceIds[0])).toBe(true)
    expect(await rowExists('services', cancha.service.id)).toBe(true)

    // Limpieza: el service quedó huérfano (sin agenda que lo apunte), como describe nonCanchaServices.
    await t.admin.from('spaces').delete().eq('id', cancha.spaceIds[0]).eq('business_id', t.businessId)
    await t.admin.from('services').delete().eq('id', cancha.service.id).eq('business_id', t.businessId)
  }, 30000)

  // (2) HECHO (b) + el caso MÁS VALIOSO del archivo. `appointments.professional_id` es NO ACTION, así
  // que un turno PASADO y NO cancelado —historial puro, que el gate de la 065 deja pasar— igual rechaza
  // el DELETE de la agenda con 23503. El fix tiene que devolver el error SIN haber destruido nada.
  //
  // Este es exactamente el camino que el código VIEJO corrompía en CADA intento fallido: borraba
  // `agenda_spaces` primero, el DELETE del professional fallaba, y la cancha quedaba viva pero SIN sus
  // espacios (o sea, sin el acople de disponibilidad del motor v0.12), en silencio.
  it('2 — con un turno pasado, el DELETE del professional es rechazado y NO se destruye NADA', async () => {
    const cancha = await newCancha('__test_cancha_con_historial')
    await seedAppointment({
      serviceId: cancha.service.id,
      professionalId: cancha.professional.id,
      date: PAST,
      time: '09:00',
      status: 'confirmed',
    })

    const { agendaSpaces } = await tenantData()
    const res = await deleteCancha(t.admin, t.businessId, cancha, { hard: true, agendaSpaces })

    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.error).toBe('has_appointments')

    // CERO filas destruidas: la tupla entera sigue en pie y la cancha se sigue pudiendo administrar.
    expect(await mappingsFor(cancha.professional.id)).toHaveLength(1)
    expect(await rowExists('professionals', cancha.professional.id)).toBe(true)
    expect(await rowExists('services', cancha.service.id)).toBe(true)
    expect(await rowExists('spaces', cancha.spaceIds[0])).toBe(true)

    // Y `canchasFromData` la sigue reconstruyendo con el MISMO professional (id sin cambiar).
    const data = await tenantData()
    const reconstruida = canchasFromData(data.services, data.professionals, data.agendaSpaces)
      .find(c => c.service.id === cancha.service.id)
    expect(reconstruida).toBeDefined()
    expect(reconstruida?.professional.id).toBe(cancha.professional.id)
    expect(reconstruida?.spaceIds).toEqual(cancha.spaceIds)
  }, 30000)

  // (3) EL ESCENARIO EXACTO DE CR-01. Sin turnos (el DELETE de la agenda pasa) pero con un abono ACTIVO
  // (el gate de la 065 rechaza el DELETE del service con P0001). Es el ÚNICO camino donde el service
  // sobrevive a su agenda, y por lo tanto el único donde corre el rollback manual.
  it('3 — abono activo sin turnos: el service sobrevive y el rollback re-crea la agenda (CR-01)', async () => {
    const cancha = await newCancha('__test_cancha_abono_activo')
    const abono = await t.admin
      .from('abonos')
      .insert({
        business_id: t.businessId,
        service_id: cancha.service.id,
        professional_id: cancha.professional.id,
        location_id: t.locationId,
        day_of_week: 1,
        start_time: '20:00',
        status: 'active',
      })
      .select('id')
      .single()
    expect(abono.error).toBeNull()

    const { agendaSpaces } = await tenantData()
    const res = await deleteCancha(t.admin, t.businessId, cancha, { hard: true, agendaSpaces })

    // (a) El motivo llega distinguido: un abono activo NO se arregla borrando turnos.
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.error).toBe('has_active_abono')

    // (b) El professional viejo ya no está (su DELETE sí pasó)…
    expect(await rowExists('professionals', cancha.professional.id)).toBe(false)
    // …pero el rollback re-creó UNA agenda apuntando al MISMO service_id, con OTRO id.
    const data = await tenantData()
    const reAgendas = data.professionals.filter(p => p.service_id === cancha.service.id)
    expect(reAgendas).toHaveLength(1)
    expect(reAgendas[0].id).not.toBe(cancha.professional.id)
    expect(reAgendas[0].name).toBe(cancha.professional.name)

    // (c) El mapeo agenda↔espacio quedó re-apuntado a la agenda NUEVA, sobre el MISMO espacio.
    const reMappings = await mappingsFor(reAgendas[0].id)
    expect(reMappings).toHaveLength(1)
    expect(reMappings[0].space_id).toBe(cancha.spaceIds[0])
    // Y el espacio dedicado NO se borró (el rollback corta antes del borrado de spaces).
    expect(await rowExists('spaces', cancha.spaceIds[0])).toBe(true)
    expect(await rowExists('services', cancha.service.id)).toBe(true)

    // (d) La prueba que importa de verdad: la cancha vuelve a ser administrable. `canchasFromData`
    // rearma la tupla desde los datos POST-rollback, con el espacio dedicado reconocido como tal.
    const reconstruida = canchasFromData(data.services, data.professionals, data.agendaSpaces)
      .find(c => c.service.id === cancha.service.id)
    expect(reconstruida).toBeDefined()
    expect(reconstruida?.professional.id).toBe(reAgendas[0].id)
    expect(reconstruida?.spaceIds).toEqual(cancha.spaceIds)
    expect(dedicatedSpaceIds(reconstruida!, data.agendaSpaces)).toEqual(cancha.spaceIds)

    // (e) La pérdida ACEPTADA y documentada en el comentario del rollback: el puntero del abono a la
    // agenda se fue en NULL (`abonos.professional_id` es SET NULL). El abono sobrevive.
    const { data: abo } = await t.admin
      .from('abonos')
      .select('id, professional_id, service_id')
      .eq('id', abono.data!.id)
      .single()
    expect(abo?.professional_id).toBeNull()
    expect(abo?.service_id).toBe(cancha.service.id)

    // Limpieza para no dejarle un abono activo al tenant compartido.
    await t.admin.from('abonos').delete().eq('id', abono.data!.id)
  }, 30000)

  // (4) Camino feliz: sin turnos y sin abono, la tupla ENTERA desaparece (incluido el espacio dedicado,
  // que si no quedaría huérfano en el picker de "compartir espacio").
  it('4 — sin turnos ni abono, el borrado se lleva la tupla completa', async () => {
    const cancha = await newCancha('__test_cancha_feliz')
    const { agendaSpaces } = await tenantData()

    const res = await deleteCancha(t.admin, t.businessId, cancha, { hard: true, agendaSpaces })
    expect(res.ok).toBe(true)

    expect(await rowExists('professionals', cancha.professional.id)).toBe(false)
    expect(await rowExists('services', cancha.service.id)).toBe(false)
    expect(await rowExists('spaces', cancha.spaceIds[0])).toBe(false)
    expect(await mappingsFor(cancha.professional.id)).toHaveLength(0)

    const data = await tenantData()
    expect(canchasFromData(data.services, data.professionals, data.agendaSpaces)
      .find(c => c.service.id === cancha.service.id)).toBeUndefined()
  }, 30000)

  // (5) IN-05 — referencia CRUZADA entre negocios. El gate de la 065 (§6.2) cuenta los turnos futuros
  // con `(OLD.business_id IS NULL OR a.business_id = OLD.business_id)`, así que un turno futuro de OTRO
  // tenant que apunte a este `service_id` NO se cuenta. La review sostiene que el borrado igual procede
  // y esa fila pierde el service_id Y el snapshot (que ya nació NULL por el filtro por tenant del
  // trigger de INSERT).
  //
  // Este caso NO asume que la review tenga razón: MIDE lo que pasa y asierta lo observado.
  it('5 — un turno futuro de OTRO tenant no cuenta para el gate (IN-05): se mide qué le pasa', async () => {
    const svc = await seedService(t, { name: '__test_svc_in05_cross_tenant' })

    // Turno del tenant B que referencia el service del tenant A. No debería existir; el punto es qué
    // hace el sistema si existe.
    const ins = await other.admin
      .from('appointments')
      .insert({
        business_id: other.businessId, // tenant B
        service_id: svc, // service del tenant A
        professional_id: other.professionalId,
        location_id: other.locationId,
        date: FUTURE,
        time: '08:00',
        duration_minutes: 30,
        client_name: 'Cliente Cross-Tenant',
        status: 'confirmed',
      })
      .select('id')
      .single()
    expect(ins.error).toBeNull()
    const apptId = ins.data!.id as string

    // Antes del borrado: el snapshot ya nació NULL (el trigger de INSERT filtra por tenant, T-13-01).
    const antes = await other.admin
      .from('appointments')
      .select('service_id, service_name, service_price')
      .eq('id', apptId)
      .single()
    expect(antes.data?.service_id).toBe(svc)
    expect(antes.data?.service_name).toBeNull()
    expect(antes.data?.service_price).toBeNull()

    // El tenant A borra su servicio, como lo haría el panel.
    const del = await t.admin.from('services').delete().eq('id', svc).eq('business_id', t.businessId)

    // MEDIDO: el gate NO ve el turno del tenant B, así que el borrado PROCEDE. Coincide con lo que
    // afirma IN-05 (la rama del filtro por tenant descarta la fila ajena en vez de contarla).
    expect(del.error).toBeNull()
    const { data: sigue } = await t.admin.from('services').select('id').eq('id', svc)
    expect((sigue ?? []).length).toBe(0)

    // MEDIDO: la fila ajena queda con el puntero en NULL (FK SET NULL de la 065) y SIN snapshot que la
    // rescate — o sea, pierde nombre y precio del servicio de forma irrecuperable. También coincide con
    // IN-05. No es cross-tenant leak (nada del tenant A se filtró al B): es pérdida de dato en el B.
    const despues = await other.admin
      .from('appointments')
      .select('service_id, service_name, service_price')
      .eq('id', apptId)
      .single()
    expect(despues.data?.service_id).toBeNull()
    expect(despues.data?.service_name).toBeNull()
    expect(despues.data?.service_price).toBeNull()

    await other.admin.from('appointments').delete().eq('id', apptId)
  }, 30000)
})
