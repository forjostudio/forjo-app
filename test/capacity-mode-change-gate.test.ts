import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { hasSupabaseCreds } from './env'
import { seedOneTenant, seedService, teardownOneTenant, type SeededTenant } from './helpers/booking-fixtures'

// ── Tests del gate de CAMBIO DE MODO de cupo (migr. 068, trigger BEFORE UPDATE OF capacity_mode) ──
// Cubren CUPO-08, que cierra el riesgo residual R-1 de la Phase 12: cambiar `capacity_mode` con
// turnos ya creados deja esas filas con el `is_group` del momento del INSERT — o sea FUERA del
// EXCLUDE gist 013 (041: `AND NOT is_group`) Y fuera del gate espejo de la 064 — y produce solapes
// PERMANENTES que ningún gate vuelve a detectar.
//
// El gate vive en la BASE a propósito: corre dentro de la MISMA transacción del UPDATE, así que no
// hay ventana entre un pre-check de pantalla y la escritura, y resiste un PATCH directo por
// PostgREST que saltee la UI. Consecuencia para los tests: la única forma de probarlo es escribiendo
// de verdad contra Postgres y mirando el error que vuelve — ningún test unitario lo alcanza.
//
// DOS TRAMPAS QUE ESTA SUITE ESQUIVA EXPLÍCITAMENTE:
//   (a) un UPDATE que no matchea NINGUNA fila sale "Success" sin que el trigger corra, y eso es
//       indistinguible de un gate roto. Por eso cada caso FUERZA la existencia de su fila (siembra su
//       propio servicio) y verifica el estado REAL de la base después, nunca solo el error que volvió.
//   (b) un `RETURN NULL` en un BEFORE UPDATE cancela la escritura SIN error (T-14-16). El caso que lo
//       detecta es el (2), el que SÍ pasa: error nulo + fila sin cambiar sería un verde falso.
//
// En PRODUCCIÓN CUPO-08 se verifica por INSTALACIÓN, no por comportamiento (D-09): hay CERO servicios
// en modo simultáneo y el gate solo dispara con turnos futuros vivos, así que el rechazo no se puede
// provocar desde la UI. Misma situación que el gate de la 067. El COMPORTAMIENTO se prueba acá, contra
// el Postgres LOCAL.
//
// Sin las creds de Supabase el bloque entero se skipea (mismo molde que abono-delete-gate.test.ts).
// Cada caso siembra SU PROPIO servicio para que no se pisen entre sí, y usa un horario distinto para
// no chocar con el índice único 011 ni con el EXCLUDE 013.
//
// Fechas FIJAS: 2031-03-03 (lunes) está siempre en el futuro y 2020-03-02 siempre en el pasado, sin
// depender del reloj del runner.
const FUTURE = '2031-03-03'
const PAST = '2020-03-02'
// "Hoy" en hora AR, calculado igual que el trigger (`(now() AT TIME ZONE 'America/Argentina/...')::date`)
// y que los gates hermanos de la 065/067. Es la frontera INCLUSIVE del gate (`date >= hoy`).
const TODAY_AR = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

describe.skipIf(!hasSupabaseCreds)('068: gate de cambio de modo de cupo (services_block_mode_change)', () => {
  // `t` es el tenant principal (el "ajeno" desde el punto de vista de la sesión anon del caso 6).
  let t: SeededTenant
  // `other` es el segundo tenant: su dueño es el que firma la sesión anon del caso 6.
  let other: SeededTenant
  // Cliente anon AUTENTICADO como el dueño de `other`. Es el que corre las aserciones de RLS: con el
  // service-role no se probaría nada (bypassa RLS).
  let otherOwnerSession: SupabaseClient

  beforeAll(async () => {
    t = await seedOneTenant({ bufferMinutes: 0, serviceDurationMinutes: 30 })
    other = await seedOneTenant({ bufferMinutes: 0, serviceDurationMinutes: 30 })

    otherOwnerSession = createClient(url, anonKey, { auth: { persistSession: false } })
    const sign = await otherOwnerSession.auth.signInWithPassword({ email: other.email, password: other.password })
    if (sign.error) throw new Error(`signIn del dueño de other falló: ${sign.error.message}`)

    // GUARD anti-falso-verde (molde de abono-delete-gate.test.ts:44-50): si el cliente de aserción
    // quedara sin sesión, el UPDATE del caso 6 volvería con 0 filas por estar deslogueado y no por la
    // policy de tenant — un verde que no prueba nada.
    const sess = await otherOwnerSession.auth.getSession()
    if (!sess.data.session?.access_token) {
      throw new Error('GUARD: el cliente de aserción NO tiene sesión anon autenticada (no usar service-role)')
    }
    // GUARD anti-falso-verde 2: si la anon key fuera en realidad la service-role, el contrapeso del
    // caso 6 pasaría por bypass de RLS y el intento cross-tenant fallaría por el motivo equivocado.
    // Config rota ⇒ abortar.
    if (anonKey === process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('GUARD: NEXT_PUBLIC_SUPABASE_ANON_KEY == SUPABASE_SERVICE_ROLE_KEY — config rota, abortar')
    }
  })

  afterAll(async () => {
    if (t) await teardownOneTenant(t)
    if (other) await teardownOneTenant(other)
  })

  // El UPDATE replica exactamente lo que emite `saveEditService` (settings-client.tsx): por id, con el
  // filtro explícito por business_id (defensa en profundidad), y con `.select('id')` para poder
  // distinguir "0 filas porque la RLS filtró" de "escritura exitosa" — sin eso, el cliente diría
  // "Servicio actualizado" sin haber actualizado nada.
  async function patchService(
    client: SupabaseClient,
    serviceId: string,
    businessId: string,
    patch: Record<string, unknown>,
  ) {
    return client.from('services').update(patch).eq('id', serviceId).eq('business_id', businessId).select('id')
  }

  // ESTE helper es el que hace honesto a todo el archivo: el ESTADO REAL de la base es la aserción, no
  // el error que volvió. Se lee SIEMPRE con service-role (bypassa RLS) para que la lectura de control
  // nunca quede filtrada por la misma policy que el caso está probando.
  async function modeOf(tenant: SeededTenant, serviceId: string): Promise<{ capacity_mode: string; capacity: number }> {
    const { data, error } = await tenant.admin
      .from('services')
      .select('capacity_mode, capacity')
      .eq('id', serviceId)
      .single()
    if (error || !data) throw new Error(`select service: ${error?.message}`)
    return { capacity_mode: data.capacity_mode as string, capacity: Number(data.capacity) }
  }

  // Siembra un appointment con estado y fecha a elección, DIRECTO por service-role (sin pasar por el
  // RPC): el sujeto del test es el trigger de `services`, no el motor de reservas.
  async function seedAppointment(
    tenant: SeededTenant,
    args: { serviceId: string; date: string; time: string; status: string | null },
  ): Promise<string> {
    const ins = await tenant.admin
      .from('appointments')
      .insert({
        business_id: tenant.businessId,
        service_id: args.serviceId,
        professional_id: tenant.professionalId,
        location_id: tenant.locationId,
        date: args.date,
        time: args.time,
        duration_minutes: 30,
        client_name: 'Cliente Mode Gate',
        status: args.status,
      })
      .select('id')
      .single()
    if (ins.error || !ins.data) throw new Error(`seed appointment: ${ins.error?.message}`)
    return ins.data.id as string
  }

  // (1) EL RECHAZO. Un servicio con un turno FUTURO VIVO no puede cambiar de modo, ni siquiera desde
  // una request que saltea la UI (acá el PATCH sale por PostgREST, sin React de por medio).
  // Si falla: el gate no está instalado, o su predicado dejó de ver los turnos futuros vivos.
  // Se asiertan los TRES, no dos: `code` + `message` (el código de dominio es el CONTRATO que el panel
  // mapea; un assert que solo mirara "hubo error" pasaría con cualquier otro rechazo) + el estado real.
  it('1 — con un turno futuro vivo el cambio de modo se RECHAZA (P0001 / service_mode_has_future_appointments)', async () => {
    const svc = await seedService(t, { name: '__test_svc_mode_gate_1' })
    await seedAppointment(t, { serviceId: svc, date: FUTURE, time: '09:00', status: 'confirmed' })

    const upd = await patchService(t.admin, svc, t.businessId, { capacity_mode: 'group_class', capacity: 2 })
    expect(upd.error).not.toBeNull()
    expect(upd.error?.code).toBe('P0001')
    expect(upd.error?.message).toContain('service_mode_has_future_appointments')

    // Y el servicio SIGUE en el modo anterior: el RAISE abortó la transacción entera, nada a medias.
    expect(await modeOf(t, svc)).toEqual({ capacity_mode: 'individual', capacity: 1 })
  }, 20000)

  // (2) EL CAMINO QUE SÍ PASA — detector de `RETURN NULL` (T-14-16). Mismo escenario pero con el turno
  // futuro CANCELADO y un turno pasado vivo: el cambio tiene que volver sin error Y quedar escrito DE
  // VERDAD. Si falla con `error === null` pero la fila sin cambiar, el trigger está devolviendo NULL y
  // cancelando la escritura en silencio: PostgREST respondería 204 y el panel diría "Servicio
  // actualizado" sin haber actualizado nada.
  it('2 — sin turnos futuros vivos el cambio de modo pasa y QUEDA ESCRITO (detector de RETURN NULL)', async () => {
    const svc = await seedService(t, { name: '__test_svc_mode_gate_2' })
    await seedAppointment(t, { serviceId: svc, date: FUTURE, time: '09:30', status: 'cancelled' })
    await seedAppointment(t, { serviceId: svc, date: PAST, time: '09:30', status: 'confirmed' })

    const upd = await patchService(t.admin, svc, t.businessId, { capacity_mode: 'group_class', capacity: 2 })
    expect(upd.error).toBeNull()
    expect((upd.data || []).length).toBe(1)

    // La aserción REAL: la fila cambió en la base, no solo "no hubo error".
    expect(await modeOf(t, svc)).toEqual({ capacity_mode: 'group_class', capacity: 2 })
  }, 20000)

  // (3) TURNO CON ESTADO NULO. `appointments.status` es NULLABLE y `NOT IN (...)` sobre NULL evalúa a
  // NULL — ni true ni false —, así que sin la rama explícita `status IS NULL` esas filas quedarían
  // FUERA del EXISTS y ABRIRÍAN el gate. Es la trampa que el repo ya pagó dos veces (migr. 065 y el
  // read-path de 13-01). Si falla: alguien "simplificó" el predicado del gate a `status NOT IN (...)`.
  it('3 — un turno futuro con status NULL también bloquea el cambio de modo', async () => {
    const svc = await seedService(t, { name: '__test_svc_mode_gate_3' })
    await seedAppointment(t, { serviceId: svc, date: FUTURE, time: '10:00', status: null })

    const upd = await patchService(t.admin, svc, t.businessId, { capacity_mode: 'group_class', capacity: 2 })
    expect(upd.error?.code).toBe('P0001')
    expect(upd.error?.message).toContain('service_mode_has_future_appointments')
    expect(await modeOf(t, svc)).toEqual({ capacity_mode: 'individual', capacity: 1 })
  }, 20000)

  // (4) FRONTERA "HOY" EN HORA DE ARGENTINA. El gate usa `date >= hoy AR`, INCLUSIVE: un turno de HOY
  // sigue siendo un compromiso por delante. La hora AR no es un detalle: a las 22:00 de Buenos Aires
  // el `now()` en UTC ya es el día siguiente, y con la frontera calculada en UTC un turno de hoy
  // dejaría de contarse como futuro. Si falla cerca de la medianoche, es exactamente ese bug.
  it('4 — un turno de HOY (hora AR) cuenta como futuro y bloquea el cambio de modo', async () => {
    const svc = await seedService(t, { name: '__test_svc_mode_gate_4' })
    await seedAppointment(t, { serviceId: svc, date: TODAY_AR, time: '10:30', status: 'pending_payment' })

    const upd = await patchService(t.admin, svc, t.businessId, { capacity_mode: 'group_class', capacity: 2 })
    expect(upd.error?.code).toBe('P0001')
    expect(upd.error?.message).toContain('service_mode_has_future_appointments')
    expect(await modeOf(t, svc)).toEqual({ capacity_mode: 'individual', capacity: 1 })
  }, 20000)

  // (5) EL GATE NO TOCA LAS ESCRITURAS LEGÍTIMAS. Con un turno futuro VIVO presente, un UPDATE que NO
  // cambia el modo tiene que pasar, y persistir. Éste es el caso que habría detectado el error que el
  // review propuso en la 067 y que habría roto TODAS las bajas de abono en producción:
  //   (a) desactivar el servicio NO manda `capacity_mode` ⇒ el trigger ni siquiera dispara;
  //   (b) renombrarlo SÍ lo manda (así lo emite `saveEditService` en CADA guardado, incluso cuando el
  //       dueño no tocó el modo) ⇒ el trigger DISPARA y lo tiene que dejar pasar por el guard de
  //       no-cambio (`IS NOT DISTINCT FROM`). Sin ese guard, renombrar un servicio con turnos futuros
  //       rebotaría y la pantalla de servicios quedaría rota.
  it('5 — el gate no bloquea escrituras legítimas: desactivar y renombrar con un turno futuro vivo', async () => {
    const svc = await seedService(t, { name: '__test_svc_mode_gate_5' })
    await seedAppointment(t, { serviceId: svc, date: FUTURE, time: '11:00', status: 'confirmed' })

    // (a) sin capacity_mode en el SET → el trigger no dispara.
    const off = await patchService(t.admin, svc, t.businessId, { active: false })
    expect(off.error).toBeNull()
    expect((off.data || []).length).toBe(1)

    // (b) CON capacity_mode en el SET, con el MISMO valor que ya tenía → el trigger dispara y pasa.
    const nuevoNombre = '__test_svc_mode_gate_5_renombrado'
    const rename = await patchService(t.admin, svc, t.businessId, {
      name: nuevoNombre,
      capacity_mode: 'individual',
      capacity: 1,
    })
    expect(rename.error).toBeNull()
    expect((rename.data || []).length).toBe(1)

    // Los DOS efectos persistieron de verdad, y el modo no se movió.
    const { data } = await t.admin.from('services').select('name, active, capacity_mode').eq('id', svc).single()
    expect(data?.name).toBe(nuevoNombre)
    expect(data?.active).toBe(false)
    expect(data?.capacity_mode).toBe('individual')
  }, 20000)

  // (6) AISLAMIENTO POR TENANT + su CONTRAPESO, en el mismo caso. El dueño de OTRO negocio no puede
  // cambiar el modo de un servicio ajeno: la policy por tenant filtra la fila, así que el UPDATE vuelve
  // SIN error y con 0 filas. Por eso el `.select('id')` no es cosmético: es lo único que distingue
  // "la RLS lo filtró" de "se escribió".
  //
  // El contrapeso va en el mismo `it` y no es opcional: sin él, una RLS rota que bloqueara a TODOS
  // dejaría la primera mitad verde. El mismo cliente anon, sobre SU propio servicio, sí escribe.
  it('6 — el dueño de otro negocio NO puede cambiar el modo de un servicio ajeno (0 filas, sin error)', async () => {
    const ajeno = await seedService(t, { name: '__test_svc_mode_gate_6_ajeno' })

    const cross = await patchService(otherOwnerSession, ajeno, t.businessId, {
      capacity_mode: 'group_class',
      capacity: 2,
    })
    expect(cross.error).toBeNull()
    expect((cross.data || []).length).toBe(0)
    // El servicio ajeno quedó INTACTO (leído con el service-role del tenant dueño).
    expect(await modeOf(t, ajeno)).toEqual({ capacity_mode: 'individual', capacity: 1 })

    // CONTRAPESO: sobre su propio servicio, la MISMA sesión anon sí escribe (1 fila) y persiste.
    const propio = await seedService(other, { name: '__test_svc_mode_gate_6_propio' })
    const own = await patchService(otherOwnerSession, propio, other.businessId, {
      capacity_mode: 'group_class',
      capacity: 2,
    })
    expect(own.error).toBeNull()
    expect((own.data || []).length).toBe(1)
    expect(await modeOf(other, propio)).toEqual({ capacity_mode: 'group_class', capacity: 2 })
  }, 20000)

  // (7) LOS DOS SENTIDOS DEL CHECK DE COHERENCIA (D-06, `services_capacity_matches_mode_chk`):
  //   individual ⇒ capacity = 1   ·   group_class / simultaneous_resource ⇒ capacity >= 2
  // Un `group_class` de cupo 1 era indistinguible de un `individual` (mismo is_group = false, mismo
  // EXCLUDE 013): dos representaciones del MISMO estado, que es la ambigüedad que la fase eliminó.
  // Si falla: el CHECK no se creó, o se creó con una sola de las dos ramas.
  // CONSECUENCIA DECLARADA para el editor (D-06/D-10): al pasar de individual a grupal hay que SUBIR
  // el cupo a 2 en el MISMO update, o la escritura rebota con 23514.
  it('7 — el CHECK de coherencia rebota en los dos sentidos (23514) y la fila queda como estaba', async () => {
    const svc = await seedService(t, { name: '__test_svc_mode_gate_7' })
    const antes = await modeOf(t, svc)
    expect(antes).toEqual({ capacity_mode: 'individual', capacity: 1 })

    // (a) grupal con cupo 1 → ilegal.
    const grupalCupo1 = await patchService(t.admin, svc, t.businessId, { capacity_mode: 'group_class', capacity: 1 })
    expect(grupalCupo1.error?.code).toBe('23514')
    expect(`${grupalCupo1.error?.message ?? ''} ${grupalCupo1.error?.details ?? ''}`).toContain(
      'services_capacity_matches_mode_chk',
    )
    expect(await modeOf(t, svc)).toEqual(antes)

    // (b) individual con cupo 2 → también ilegal (el sentido inverso). Acá el modo NO cambia, así que
    //     el gate del trigger deja pasar y el rechazo lo tiene que dar el CHECK.
    const individualCupo2 = await patchService(t.admin, svc, t.businessId, {
      capacity_mode: 'individual',
      capacity: 2,
    })
    expect(individualCupo2.error?.code).toBe('23514')
    expect(`${individualCupo2.error?.message ?? ''} ${individualCupo2.error?.details ?? ''}`).toContain(
      'services_capacity_matches_mode_chk',
    )
    expect(await modeOf(t, svc)).toEqual(antes)
  }, 20000)
})
