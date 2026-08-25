import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { hasSupabaseCreds } from './env'
import {
  seedOneTenant,
  teardownOneTenant,
  seedTimeBlock,
  seedService,
  seedTimeBlockService,
  type SeededTenant,
} from './helpers/booking-fixtures'
import { createAppointmentCore } from '@/lib/booking-core'
import { POST as createPOST } from '@/app/api/booking/create/route'

// ── La agenda por servicio en el WRITE-PATH: el backstop del `create` — Phase 18 (D-04 / AGENDA-04) ──
//
// Agujero que cierra: desde el Plan 18-03 la disponibilidad ya no OFRECE los horarios de una franja
// que declaró no dar el servicio pedido. Pero el selector público es UX, no un control: un `POST` a
// `/api/booking/create` con el `serviceId` y la hora forjados se saltea la grilla entera y reserva
// cerámica en el horario de corte — y el dueño se entera cuando llega el cliente. La disponibilidad
// decide qué se OFRECE; el `create` decide qué se ACEPTA, y hasta este plan no decidía nada.
//
// ⚠ POR QUÉ EL CONTROL VIVE EN EL CORE Y NO EN EL ROUTE HANDLER: `createAppointmentCore` es el único
// lugar donde el `serviceId` ya está RE-VALIDADO por `business_id` (anti-tampering de tenant). Poner
// la regla en el handler la dejaría razonando sobre un id crudo del cliente, que es exactamente lo
// que este repo prohíbe. Además el handler público no es la única puerta: el core es la cadena de
// validación compartida.
//
// ⚠ POR QUÉ ESTÁ GATEADO POR UN FLAG (y no aplica siempre): el core tiene TRES llamadores y la regla
// aplica a UNO.
//   · `app/api/booking/create/route.ts`      → público, NO confiable      ⇒ la regla SÍ aplica.
//   · `app/api/appointments/create/route.ts` → alta manual del dueño      ⇒ exención deliberada: el
//     dueño cargando una excepción fuera de franja en SU agenda es legítimo, y es justo lo que hace.
//   · `lib/abono-generation.ts`              → generación de abonos       ⇒ su propio D-06′, razonado
//     en la cabecera de ese archivo: gatear por franjas volvía al abono MÁS restrictivo que poner el
//     mismo turno a mano.
// Meter el backstop sin gatearlo rompe DOS exenciones de una. El mecanismo ya existe en el propio
// core (`requireDeposit` / `autoAssign`): un flag opcional con default APAGADO, encendido sólo por el
// caller que lo pide. Default apagado = si mañana aparece un caller nuevo y nadie se acuerda del
// flag, hereda el comportamiento de hoy en vez de romperse.
//
// Escenario compartido (buffer 0, servicios de 30'):
//   - franja A 09:00-12:00 → se mapea a **svc1** ⇒ pasa a MAPEO EXPLÍCITO: da svc1 y sólo svc1.
//   - franja B 12:00-15:00 → nunca se mapea ⇒ queda COMODÍN (control).
//   - las 20:00 no caen en NINGUNA franja: es el caso 5.
//
// Los 5 casos:
//   1. POST forjado (svc2 @ 10:00, dentro de A)      → 400 `service_not_scheduled` + CERO filas.
//   2. MISMO pedido por el core SIN el flag           → se crea. Prueba que el rechazo del caso 1 lo
//      produce el flag y no otra cosa, y congela la exención del alta manual.
//   3. POST del servicio que la franja SÍ da (svc1)   → se crea.
//   4. Puente vaciada (comodín) + el pedido del 1     → se crea. CERO REGRESIÓN (D-02).
//   5. Horario fuera de TODA franja (svc2 @ 20:00)    → se crea. AGENDA-04: la fase NO introduce
//      validación general de ventana.
//
// Corre contra la DB LOCAL (PG17, migr. 071 aplicada) invocando el route handler REAL con
// service-role, igual que `booking-cualquiera-public.test.ts`. Sin las 3 creds se skipea.

const DATE = '2031-03-03' // lunes → EXTRACT(dow) = 1, alineado con el default de seedTimeBlock

// POST al route handler real de create (mismo patrón que booking-cualquiera-public.test.ts).
// reCAPTCHA: el negocio fixture no tiene secret → verifyRecaptcha permite sin token.
async function postCreate(
  body: Record<string, unknown>,
): Promise<{ status: number; body: { ok: boolean; error?: string; appointmentId?: string } }> {
  const res = await createPOST(
    new Request('https://test.local/api/booking/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
  return { status: res.status, body: (await res.json()) as { ok: boolean; error?: string; appointmentId?: string } }
}

describe.skipIf(!hasSupabaseCreds)('backstop del create: la franja que no da el servicio tampoco lo ACEPTA (D-04/AGENDA-04)', () => {
  let t: SeededTenant
  let slug: string
  let svc1: string // el service del seed: el ÚNICO que la franja A declara dar
  let svc2: string // 2º service del mismo negocio: el que A NO da
  let blockA: string // 09:00-12:00 → se mapea a svc1

  beforeAll(async () => {
    t = await seedOneTenant({ bufferMinutes: 0, serviceDurationMinutes: 30 })
    svc1 = t.serviceId
    svc2 = await seedService(t, { durationMinutes: 30 })
    blockA = await seedTimeBlock(t, { dayOfWeek: 1, startTime: '09:00', endTime: '12:00' })
    // Franja B: comodín de control (nunca se mapea). Su id no se usa en ninguna aserción — lo que
    // aporta es EXISTIR, para que "hay franjas mapeadas en este día" no sea lo mismo que "hay una
    // sola franja".
    await seedTimeBlock(t, { dayOfWeek: 1, startTime: '12:00', endTime: '15:00' })
    // Quitar la ventana de reserva (migr. 052, default max_advance_days=30): la DATE sentinela está
    // 5 años en el futuro; sin esto el create cortaría con date_out_of_window ANTES del core y los
    // casos medirían otra cosa. Mismo ajuste que booking-cualquiera-public / canchas-booking.
    await t.admin.from('businesses').update({ max_advance_days: null, max_advance_date: null }).eq('id', t.businessId)
    const { data: bizRow } = await t.admin.from('businesses').select('slug').eq('id', t.businessId).single()
    slug = bizRow?.slug as string
  })

  afterAll(async () => {
    if (t) await teardownOneTenant(t)
  })

  // Estado inicial reproducible entre casos: sin turnos y con la puente VACÍA (todas las franjas
  // comodín). El tenant se comparte, así que un turno o una fila de mapeo de un caso previo
  // contaminaría al siguiente.
  afterEach(async () => {
    if (!t) return
    await t.admin.from('appointments').delete().eq('business_id', t.businessId)
    await t.admin.from('time_block_services').delete().eq('business_id', t.businessId)
  })

  // Cuántos turnos hay en ese horario para ESTE negocio. La aserción del caso 1 va contra la BASE y
  // no sólo contra el status: un 400 con la fila igualmente insertada sería el peor de los mundos.
  async function countAppointmentsAt(time: string): Promise<number> {
    const { data } = await t.admin
      .from('appointments')
      .select('id')
      .eq('business_id', t.businessId)
      .eq('date', DATE)
      .eq('time', time)
    return (data || []).length
  }

  // La franja A pasa a MAPEO EXPLÍCITO: da svc1 y SÓLO svc1. B se deja sin filas → comodín.
  async function mapBlockAToSvc1() {
    await seedTimeBlockService(t, { timeBlockId: blockA, serviceId: svc1 })
  }

  it('1. POST forjado: el servicio que la franja NO da se rechaza con 400 service_not_scheduled y no deja fila', async () => {
    await mapBlockAToSvc1()

    const res = await postCreate({
      slug,
      serviceId: svc2, // la franja A (09:00-12:00) declara dar svc1 y sólo svc1
      date: DATE,
      time: '10:00', // dentro de A
      clientName: '__test_forjado',
    })

    expect(res.status).toBe(400)
    expect(res.body.ok).toBe(false)
    expect(res.body.error).toBe('service_not_scheduled')
    // Lo que de verdad importa: el turno NO existe. Un rechazo que igual escribe es peor que ninguno.
    expect(await countAppointmentsAt('10:00')).toBe(0)
  })

  it('2. CONTROL NEGATIVO: el MISMO pedido por el core SIN el flag entra — es el camino del alta manual del dueño', async () => {
    await mapBlockAToSvc1()

    // Llamada DIRECTA al core sin pasar el flag: literalmente lo que hace `appointments/create`
    // (alta manual) y lo que hace `abono-generation`. Si esto fallara, el backstop se habría
    // filtrado a las dos exenciones deliberadas — la regresión que D-04 existe para evitar.
    const result = await createAppointmentCore({
      supabase: t.admin,
      business: { id: t.businessId, buffer_minutes: 0 },
      serviceId: svc2,
      professionalId: null,
      locationId: null,
      date: DATE,
      time: '10:00',
      clientId: null,
      clientName: '__test_manual',
      clientPhone: null,
      clientEmail: null,
      notes: null,
    })

    expect(result.ok).toBe(true)
    expect(await countAppointmentsAt('10:00')).toBe(1)
    // El turno creado lo limpia el afterEach (borra los appointments del tenant).
  })

  it('3. La franja que SÍ da el servicio lo acepta: mismo horario, servicio mapeado', async () => {
    await mapBlockAToSvc1()

    const res = await postCreate({
      slug,
      serviceId: svc1, // el servicio que A declara dar
      date: DATE,
      time: '10:00',
      clientName: '__test_ok',
    })

    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(await countAppointmentsAt('10:00')).toBe(1)
  })

  it('4. COMODÍN (puente vaciada): el pedido del caso 1 entra — cero regresión (D-02). ⚠ Por sí solo NO prueba nada: vale sólo emparejado con el caso 1', async () => {
    // Se siembra y se BORRA a propósito: además de dejar el estado comodín, mide que quitar el mapeo
    // devuelve la franja al comportamiento de hoy. Y "hoy" es el estado de TODOS los negocios el día
    // del deploy: 0 filas ⇒ toda franja sirve para todo servicio.
    await mapBlockAToSvc1()
    await t.admin.from('time_block_services').delete().eq('business_id', t.businessId)

    const res = await postCreate({
      slug,
      serviceId: svc2,
      date: DATE,
      time: '10:00',
      clientName: '__test_comodin',
    })

    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(await countAppointmentsAt('10:00')).toBe(1)
  })

  it('5. FUERA DE TODA FRANJA: con las filas puestas, un horario que no cae en ninguna franja se sigue aceptando (AGENDA-04)', async () => {
    await mapBlockAToSvc1()

    // 20:00 no está ni en A (09:00-12:00) ni en B (12:00-15:00). La fase agrega UN SOLO eje de
    // rechazo —el del mapeo franja↔servicio—, no una validación general de ventana: los días con
    // horario ESPECIAL que EXTIENDEN la jornada viven en `schedule_exceptions`, no en `time_blocks`,
    // y rechazarlos acá sería una regresión grave que ningún requisito pidió. El anti-regresión duro.
    const res = await postCreate({
      slug,
      serviceId: svc2,
      date: DATE,
      time: '20:00',
      clientName: '__test_fuera_de_franja',
    })

    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(await countAppointmentsAt('20:00')).toBe(1)
  })

  // ── CR-02 (code review de la Phase 18): el backstop fallaba ABIERTO ─────────────────────────────
  //
  // Los casos 1-5 miden el backstop con un body BIEN FORMADO. El agujero estaba en el mal formado:
  // Postgres parsea más cosas que JavaScript, y de esa asimetría salía el bypass. `'2031-3-3'` es
  // una fecha válida para `::date` pero `new Date('2031-3-3T00:00:00Z')` es Invalid ⇒ el `dow`
  // quedaba NaN ⇒ `.eq('day_of_week', NaN)` hacía que PostgREST devolviera `22P02` ⇒ ese error se
  // descartaba (sólo se desestructuraba `data`) ⇒ `dayBlocks` vacío ⇒ ninguna franja contenía el
  // horario ⇒ la regla angosta ACEPTABA. Idéntico con `'10:00 AM'`, válido para `::time` y NaN para
  // `timeToMinutes`. O sea: el caso 1 pasaba de 400 a 200 cambiando dos caracteres del body, y el
  // turno se materializaba igual con la fecha/hora correctas.
  //
  // Los casos 6-8 miden el guard de FORMA del route handler (400 `bad_request`, antes del insert de
  // `clients` ⇒ sin filas huérfanas). El caso 9 mide el fail-closed del CORE por separado, sin pasar
  // por el handler: los dos controles son redundantes a propósito y cada uno se prueba solo, porque
  // si sólo se midiera el del handler, borrar el del core no rompería ningún test.

  // Cuántos clientes dejó un nombre de test. El guard corre ANTES del insert de `clients`, así que
  // un body forjado no puede dejar la fila huérfana (Pitfall 3, ya conocido en este repo).
  async function countClientsNamed(name: string): Promise<number> {
    const { data } = await t.admin.from('clients').select('id').eq('business_id', t.businessId).eq('name', name)
    return (data || []).length
  }

  it('6. CR-02: la fecha sin zero-pad (que Postgres SÍ acepta) se rechaza con 400 bad_request y no deja fila ni cliente', async () => {
    await mapBlockAToSvc1()

    const res = await postCreate({
      slug,
      serviceId: svc2, // el mismo pedido del caso 1, que DEBE seguir rechazándose
      date: '2031-3-3', // el mismo día que DATE, sin zero-pad: `'2031-3-3'::date` es válido en PG
      time: '10:00',
      clientName: '__test_cr02_fecha',
    })

    expect(res.status).toBe(400)
    expect(res.body.ok).toBe(false)
    expect(res.body.error).toBe('bad_request')
    expect(await countAppointmentsAt('10:00')).toBe(0)
    expect(await countClientsNamed('__test_cr02_fecha')).toBe(0)
  })

  it('7. CR-02: la hora en formato 12h (que Postgres SÍ acepta) se rechaza con 400 bad_request y no deja fila ni cliente', async () => {
    await mapBlockAToSvc1()

    const res = await postCreate({
      slug,
      serviceId: svc2,
      date: DATE,
      time: '10:00 AM', // `'10:00 AM'::time` es válido en PG; `timeToMinutes` da NaN
      clientName: '__test_cr02_hora',
    })

    expect(res.status).toBe(400)
    expect(res.body.ok).toBe(false)
    expect(res.body.error).toBe('bad_request')
    expect(await countAppointmentsAt('10:00')).toBe(0)
    expect(await countClientsNamed('__test_cr02_hora')).toBe(0)
  })

  it('8. CR-02: la fecha bien formada pero INEXISTENTE se rechaza — JavaScript la rueda al mes siguiente en silencio', async () => {
    await mapBlockAToSvc1()

    // `2031-02-31` pasa el regex de forma: es la razón por la que el guard además hace round-trip
    // contra `toISOString()`. `new Date('2031-02-31T00:00:00Z')` NO es Invalid: rueda a marzo, así
    // que el `dow` derivado sería el de OTRO día — el backstop mediría la franja equivocada.
    const res = await postCreate({
      slug,
      serviceId: svc2,
      date: '2031-02-31',
      time: '10:00',
      clientName: '__test_cr02_inexistente',
    })

    expect(res.status).toBe(400)
    expect(res.body.ok).toBe(false)
    expect(res.body.error).toBe('bad_request')
    expect(await countClientsNamed('__test_cr02_inexistente')).toBe(0)
  })

  it('9. CR-02: el CORE falla cerrado por su cuenta — con el flag encendido y un date/time no parseable rechaza sin depender del handler', async () => {
    await mapBlockAToSvc1()

    // Se salta el route handler A PROPÓSITO: si el fail-closed viviera sólo en el borde, cualquier
    // caller futuro que encienda el flag heredaría el bypass. Este caso es el que muere si alguien
    // borra el guard de NaN del core creyéndolo redundante con el del handler.
    const result = await createAppointmentCore({
      supabase: t.admin,
      business: { id: t.businessId, buffer_minutes: 0 },
      serviceId: svc2,
      professionalId: null,
      locationId: null,
      date: '2031-3-3',
      time: '10:00',
      clientId: null,
      clientName: '__test_cr02_core',
      clientPhone: null,
      clientEmail: null,
      notes: null,
      enforceServiceWindow: true,
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBe('service_not_scheduled')
    expect(result.status).toBe(400)
    expect(await countAppointmentsAt('10:00')).toBe(0)
  })
})
