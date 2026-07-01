import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { hasSupabaseCreds } from './env'
import { seedOneTenant, teardownOneTenant, seedTimeBlock, type SeededTenant } from './helpers/booking-fixtures'
import { provisionCancha } from '@/lib/canchas'
import { POST as createPOST } from '@/app/api/booking/create/route'

// ── Tests de integración del BOOKING PÚBLICO de canchas (Phase 3 — ALQUILER-01/03/04 + seguridad) ──
//
// Red de tests Wave 1 (Nyquist): el test existe ANTES del código que verifica. Los casos 1-4 apuntan
// al comportamiento OBJETIVO del Plan 02 (rama canchas del create: el cliente manda `professionalId` y
// NO `serviceId`; el server DERIVA el service desde professionals.service_id, re-validado por
// business_id — D-03). HOY el route handler EXIGE `serviceId` (route.ts:40 → missing_fields), así que
// estos casos quedan en RED DOCUMENTADO hasta que el Plan 02 aterrice la derivación. Cuando el Plan 02
// esté, pasan sin tocar este archivo.
//
// El caso de exclusión por ESPACIO compartido (ALQUILER-02) vive en test/concurrency.test.ts (CONC-03,
// ya presente + el caso secuencial que agrega este plan): reusa el motor v0.12 (book_slot_atomic) y
// pasa YA, sin código nuevo.
//
// describe.skipIf(!hasSupabaseCreds): sin las 3 creds de Supabase se skipean (igual que concurrency /
// booking-core). Corren contra Supabase LOCAL (supabase db reset PG17, con 042/043/044 aplicadas).
// Los fixtures usan service-role (crear/borrar); el route handler resuelve el tenant por slug y corre
// su propio service-role internamente. reCAPTCHA: el negocio fixture no tiene secret configurado →
// verifyRecaptcha devuelve ok/configured:false (permite sin token), igual que el resto de la suite.
//
// Fecha futura fija (lunes) alineada con el day_of_week del time_block (seedTimeBlock default = 1) y
// para no chocar con turnos pasados. Misma DATE que concurrency.test.ts.
const DATE = '2031-03-03' // lunes → EXTRACT(dow) = 1

// POST al route handler real de create, con el patrón de Request JSON (mirror de cómo concurrency
// invoca availabilityGET con new Request(url)). Devuelve el body parseado + el status HTTP.
async function postCreate(body: Record<string, unknown>): Promise<{ status: number; body: { ok: boolean; error?: string; appointmentId?: string } }> {
  const res = await createPOST(
    new Request('https://test.local/api/booking/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
  const parsed = (await res.json()) as { ok: boolean; error?: string; appointmentId?: string }
  return { status: res.status, body: parsed }
}

describe.skipIf(!hasSupabaseCreds)('booking público de canchas', () => {
  let t: SeededTenant
  let slug: string
  // La cancha bajo prueba: id = professional_id (lo reservable), su service (precio+duración propios).
  let cancha: { professionalId: string; serviceId: string; price: number; durationMinutes: number }
  // Una 2ª cancha con precio/duración DISTINTOS (para el anti-tampering de serviceId).
  let otraCancha: { serviceId: string }

  beforeAll(async () => {
    // buffer 0: turnos consecutivos sin hueco (ALQUILER-03). El service base del fixture no se usa acá
    // (las canchas traen su propio service via provisionCancha).
    t = await seedOneTenant({ bufferMinutes: 0 })
    const { data: bizRow } = await t.admin.from('businesses').select('slug').eq('id', t.businessId).single()
    slug = bizRow?.slug as string

    // Cancha principal: precio 8000, duración FIJA 60' (la que el dueño setea en Phase 2 — el cliente
    // NO la elige, ALQUILER-01). provisionCancha crea service + professional(service_id) + space +
    // agenda_spaces (espacio dedicado → sin exclusión con otras canchas en estos casos).
    const prov = await provisionCancha(t.admin, t.businessId, { name: 'Cancha 1', price: 8000, duration: 60 })
    if (!prov.ok) throw new Error(`seed cancha falló: ${prov.error}`)
    cancha = { professionalId: prov.professional.id, serviceId: prov.service.id, price: 8000, durationMinutes: 60 }

    // 2ª cancha con precio + duración DISTINTOS: su serviceId es el "falso" que el cliente intentará
    // colar en el anti-tampering (caso 2). Debe perder frente al service derivado del professional.
    const prov2 = await provisionCancha(t.admin, t.businessId, { name: 'Cancha 2 (barata)', price: 100, duration: 30 })
    if (!prov2.ok) throw new Error(`seed cancha2 falló: ${prov2.error}`)
    otraCancha = { serviceId: prov2.service.id }

    // time_block del business que cubre el lunes 08:00-20:00 con capacity 1 (canchas = cupo 1; el
    // conflicto es por espacio, no por cupo). Cubre ambas canchas (la ventana es del business).
    await seedTimeBlock(t, { capacity: 1 })
  })

  afterAll(async () => {
    if (t) await teardownOneTenant(t)
  })

  // Cada test limpia los appointments del business para no contaminar al siguiente (mismo slot/fecha).
  // No borramos las canchas ni el time_block (se siembran una vez en beforeAll).
  afterEach(async () => {
    if (t) await t.admin.from('appointments').delete().eq('business_id', t.businessId)
  })

  // Lee el appointment recién creado por su id, con t.admin (verificación independiente del estado real
  // de la DB, no del retorno del route).
  async function apptById(id: string): Promise<{ service_id: string; duration_minutes: number; professional_id: string } | null> {
    const { data } = await t.admin
      .from('appointments')
      .select('service_id, duration_minutes, professional_id')
      .eq('id', id)
      .eq('business_id', t.businessId)
      .single()
    return (data as { service_id: string; duration_minutes: number; professional_id: string } | null) ?? null
  }

  // ── (1) ALQUILER-01/04 — reserva de cancha: precio + duración de la CANCHA, no del cliente ──
  // El cliente manda professionalId (la cancha) y NO serviceId (D-03). El appointment resultante debe
  // referenciar el service DERIVADO de la cancha (su price propio → ALQUILER-04) y su duration_minutes
  // FIJA (→ ALQUILER-01), nunca una duración provista por el cliente.
  // RED hasta el Plan 02: hoy sin serviceId el route devuelve missing_fields (400).
  it('ALQUILER-01/04 — reserva de cancha usa el service (precio+duración) de la cancha, sin serviceId del cliente', async () => {
    const { status, body } = await postCreate({
      slug,
      professionalId: cancha.professionalId, // la cancha ES el bucket reservable
      // SIN serviceId (D-03): el server lo deriva del professional.
      date: DATE,
      time: '09:00',
      clientName: 'Cliente Cancha',
      clientPhone: null,
      clientEmail: null,
    })

    expect(status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.appointmentId).toBeTruthy()

    // Verificación DURA en la DB: el appointment referencia el service de la cancha y su duración fija.
    const appt = await apptById(body.appointmentId!)
    expect(appt).not.toBeNull()
    expect(appt!.service_id).toBe(cancha.serviceId)          // ALQUILER-04: precio propio vía este service
    expect(appt!.duration_minutes).toBe(cancha.durationMinutes) // ALQUILER-01: duración fija de la cancha
    expect(appt!.professional_id).toBe(cancha.professionalId)
  })

  // ── (2) anti-tampering — serviceId falso IGNORADO, gana el service derivado del professional ──
  // El cliente manda professionalId de la cancha 1 MÁS un serviceId FALSO (el de la cancha 2, barata,
  // duración distinta). El appointment debe usar el service DERIVADO del professional (cancha 1), NUNCA
  // el del body → no se puede reservar la cancha cara al precio/duración de la barata (Pitfall 2).
  it('anti-tampering — un serviceId falso en el body se ignora: gana el service derivado del professional', async () => {
    const { status, body } = await postCreate({
      slug,
      professionalId: cancha.professionalId, // cancha 1 (real, la que se reserva)
      serviceId: otraCancha.serviceId,       // FALSO: service de la cancha 2 (barata) — debe ignorarse
      date: DATE,
      time: '10:00',
      clientName: 'Cliente Tamper',
    })

    expect(status).toBe(200)
    expect(body.ok).toBe(true)
    const appt = await apptById(body.appointmentId!)
    // El service del appointment es el de la cancha 1 (derivado del professional), NO el del body.
    expect(appt!.service_id).toBe(cancha.serviceId)
    expect(appt!.service_id).not.toBe(otraCancha.serviceId)
    expect(appt!.duration_minutes).toBe(cancha.durationMinutes) // 60 (cancha 1), no 30 (cancha 2)
  })

  // ── (3) cross-tenant — professionalId de OTRO negocio contra este slug → invalid_service (400) ──
  // El cliente manda un professionalId que pertenece a un tenant DISTINTO. La derivación server-side lee
  // professionals con .eq('business_id', business.id) → no encuentra la cancha ajena → invalid_service.
  // Doble barrera: el core también re-valida el professional por business_id.
  it('cross-tenant — professionalId de otro tenant contra este slug → invalid_service', async () => {
    const other = await seedOneTenant({ bufferMinutes: 0 })
    try {
      const provOther = await provisionCancha(other.admin, other.businessId, { name: 'Ajena', price: 5000, duration: 60 })
      if (!provOther.ok) throw new Error(`seed cancha ajena falló: ${provOther.error}`)

      const { status, body } = await postCreate({
        slug, // slug del tenant #1
        professionalId: provOther.professional.id, // cancha del tenant #2
        date: DATE,
        time: '11:00',
        clientName: 'Cliente CrossTenant',
      })

      expect(body.ok).toBe(false)
      expect(body.error).toBe('invalid_service')
      expect(status).toBe(400)
    } finally {
      await teardownOneTenant(other)
    }
  })

  // ── (4) ALQUILER-03 — dos turnos consecutivos sobre la MISMA cancha (sin lógica nueva, D-06) ──
  // El cliente reserva un slot y luego el slot consecutivo (time + duration) sobre la misma cancha;
  // ambos confirman. No hay picker de duración: más tiempo = dos reservas seguidas.
  it('ALQUILER-03 — dos turnos consecutivos sobre la misma cancha: ambos ok', async () => {
    const first = await postCreate({
      slug, professionalId: cancha.professionalId, date: DATE, time: '12:00', clientName: 'Cliente A',
    })
    expect(first.body.ok).toBe(true)

    // Slot consecutivo: 12:00 + 60' = 13:00 (misma cancha). Sin buffer, no solapa → ambos ok.
    const second = await postCreate({
      slug, professionalId: cancha.professionalId, date: DATE, time: '13:00', clientName: 'Cliente B',
    })
    expect(second.body.ok).toBe(true)

    // Verificación DB: dos appointments distintos, ambos en la cancha, con su duración fija.
    const a = await apptById(first.body.appointmentId!)
    const b = await apptById(second.body.appointmentId!)
    expect(a!.professional_id).toBe(cancha.professionalId)
    expect(b!.professional_id).toBe(cancha.professionalId)
    expect(a!.duration_minutes).toBe(60)
    expect(b!.duration_minutes).toBe(60)
  })
})
