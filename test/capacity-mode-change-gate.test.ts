import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { nowInAR } from '@/lib/appointment-time'
import { hasSupabaseCreds } from './env'
import {
  seedOneTenant,
  seedService,
  seedGroupClassService,
  seedSimultaneousService,
  teardownOneTenant,
  type SeededTenant,
} from './helpers/booking-fixtures'

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
// ── LA MATRIZ DE DIRECCIONES (migr. 070 — GATE-01) ────────────────────────────────────────────────
// Hasta la 068 este gate rechazaba CUALQUIER cambio de modo con turnos futuros vivos. La 070 lo
// recorta por DIRECCIÓN DE ORIGEN, y la matriz de abajo es la razón por la que esta suite dejó de
// tener "el caso del rechazo" y pasó a tener un caso POR DIRECCIÓN:
//
//   individual → grupal / simultáneo : PASA.    Las filas que ya existen nacieron `is_group = false`
//                                               (un turno nace `is_group = true` sólo si el servicio
//                                               NO era individual al crearse), así que siguen DENTRO
//                                               del EXCLUDE gist 013 y ADEMÁS se cuentan contra el
//                                               cupo nuevo. Nada queda huérfano de guards.
//   grupal / simultáneo → individual : RECHAZA. Esas filas son `is_group = true`: fuera del EXCLUDE y
//                                               fuera del gate espejo de la 064. ACÁ VIVE R-1.
//   grupal ⇄ simultáneo              : RECHAZA. Cambia el EJE DE CONTEO (hora de inicio exacta ⇄
//                                               solape de intervalos): un conjunto hoy legal puede
//                                               volverse ilegal.
//
// ⚠ VARIOS CASOS DE ESTE ARCHIVO CAMBIARON DE ESCENARIO, NO SE ROMPIERON. Los casos 1, 2 y 3 asertaban
// el rechazo desde `individual` → `group_class`, que es EXACTAMENTE la dirección que GATE-01 abre a
// propósito. Se re-anclaron a una dirección PELIGROSA, donde el rechazo sigue siendo la conducta
// correcta: la aserción no se aflojó, se movió a donde vive el riesgo. Cada uno lo dice en su comentario.
//
// ⚠ TRAMPA DE ORDEN AL SEMBRAR. `seedGroupClassService` / `seedSimultaneousService` hacen un UPDATE
// sobre `services`, así que PASAN POR ESTE MISMO GATE. Primero se declara el modo de ORIGEN del
// service, DESPUÉS se siembra el turno futuro. Al revés, el propio fixture rebota contra el gate que
// el caso quiere medir.
//
// Fechas FIJAS: 2031-03-03 (lunes) está siempre en el futuro y 2020-03-02 siempre en el pasado, sin
// depender del reloj del runner.
const FUTURE = '2031-03-03'
const PAST = '2020-03-02'
// "Ahora" en hora AR, tomado de `lib/appointment-time.ts::nowInAR` — LA MISMA FUENTE QUE USA LA UI.
// Que la base y la UI coincidan en dónde está el corte "pasado / próximo" es literalmente lo que
// GATE-03 vino a arreglar (gap G4 de la Phase 13, que se arregló en la UI y nunca cruzó al SQL), así
// que calcular acá la frontera con otra fórmula sería medir con una regla distinta de la que se está
// probando.
const AR_NOW = nowInAR()
const TODAY_AR = AR_NOW.date
// Las dos horas de HOY que fijan cada lado del corte de GATE-03: una de madrugada que a esta altura
// del día YA PASÓ, y una de fin de día que TODAVÍA NO LLEGÓ. Son fijas a propósito (un repro no
// determinista es peor que ninguno); el guard del `beforeAll` es el que garantiza que digan la verdad.
const PAST_TIME_TODAY = '00:00:00'
const FUTURE_TIME_TODAY = '23:59:00'
// Ventana horaria AR fuera de la cual esas dos constantes dejan de ser deterministas.
const GUARD_WINDOW = { from: '01:00:00', to: '23:30:00' }

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
    // GUARD DE LA VENTANA DE MEDIANOCHE (GATE-03). Los dos casos de la frontera de hoy usan horas
    // FIJAS: `PAST_TIME_TODAY = 00:00:00` como "hoy a hora ya pasada" y `FUTURE_TIME_TODAY = 23:59:00`
    // como "hoy a hora que todavía no llegó". Fuera de [01:00:00, 23:30:00] en hora AR esas dos
    // etiquetas dejan de ser ciertas y los casos medirían LO CONTRARIO de lo que dicen medir.
    // TIRA, no skipea, y a propósito: un skip silencioso escondería el agujero de cobertura justo en
    // la franja horaria donde el bug de zona horaria es más probable. Un throw con motivo, no.
    if (AR_NOW.time < GUARD_WINDOW.from || AR_NOW.time > GUARD_WINDOW.to) {
      throw new Error(
        `GUARD DE MEDIANOCHE: son las ${AR_NOW.time} en hora AR. Los casos de GATE-03 sólo son ` +
          `deterministas entre ${GUARD_WINDOW.from} y ${GUARD_WINDOW.to} (23:30): fuera de esa ventana ` +
          `'${PAST_TIME_TODAY}' ya no es una hora pasada o '${FUTURE_TIME_TODAY}' ya no es una hora futura.`,
      )
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

  // Siembra una SERIE de abono (migr. 054) con estado a elección, directo por service-role. No genera
  // turnos: el sujeto del caso 15 es el bloque de abono del gate, no el motor de generación.
  async function seedAbono(
    tenant: SeededTenant,
    args: { serviceId: string; startTime: string; status: string },
  ): Promise<string> {
    const ins = await tenant.admin
      .from('abonos')
      .insert({
        business_id: tenant.businessId,
        service_id: args.serviceId,
        professional_id: tenant.professionalId,
        location_id: tenant.locationId,
        day_of_week: 1,
        start_time: args.startTime,
        status: args.status,
      })
      .select('id')
      .single()
    if (ins.error || !ins.data) throw new Error(`seed abono: ${ins.error?.message}`)
    return ins.data.id as string
  }

  // `is_group` es LA razón por la que una dirección es segura y la otra no: una fila con
  // `is_group = false` sigue DENTRO del EXCLUDE gist 013 (041: `AND NOT is_group`), y una con
  // `is_group = true` queda fuera de él Y fuera del gate espejo de la 064. Se lee con service-role,
  // igual que `modeOf`, para que la lectura de control nunca quede filtrada por una policy.
  async function isGroupOf(tenant: SeededTenant, appointmentId: string): Promise<boolean> {
    const { data, error } = await tenant.admin
      .from('appointments')
      .select('is_group')
      .eq('id', appointmentId)
      .single()
    if (error || !data) throw new Error(`select appointment: ${error?.message}`)
    return data.is_group as boolean
  }

  // (1) EL RECHAZO. Un servicio con un turno FUTURO VIVO no puede cambiar de modo, ni siquiera desde
  // una request que saltea la UI (acá el PATCH sale por PostgREST, sin React de por medio).
  // Si falla: el gate no está instalado, o su predicado dejó de ver los turnos futuros vivos.
  // Se asiertan los TRES, no dos: `code` + `message` (el código de dominio es el CONTRATO que el panel
  // mapea; un assert que solo mirara "hubo error" pasaría con cualquier otro rechazo) + el estado real.
  //
  // ⚠ QUÉ CAMBIÓ EN LA 070 Y POR QUÉ NO ES UNA REGRESIÓN: este caso hacía `individual` → `group_class`,
  // que es justo la dirección que GATE-01 abre a propósito (esa dirección tiene ahora su propio caso,
  // el de "dirección segura A"). La ASERCIÓN es la misma —rechazo con el mismo código de dominio y la
  // fila intacta—, lo que se movió es la DIRECCIÓN: ahora sale de `group_class`, que es donde vive R-1.
  it('1 — con un turno futuro vivo el cambio de modo se RECHAZA (P0001 / service_mode_has_future_appointments)', async () => {
    const svc = await seedService(t, { name: '__test_svc_mode_gate_1' })
    // Orden obligatorio: primero el modo de ORIGEN (este UPDATE también pasa por el gate), después el turno.
    await seedGroupClassService(t, { capacity: 2, serviceId: svc })
    await seedAppointment(t, { serviceId: svc, date: FUTURE, time: '09:00', status: 'confirmed' })

    const upd = await patchService(t.admin, svc, t.businessId, { capacity_mode: 'individual', capacity: 1 })
    expect(upd.error).not.toBeNull()
    expect(upd.error?.code).toBe('P0001')
    expect(upd.error?.message).toContain('service_mode_has_future_appointments')

    // Y el servicio SIGUE en el modo anterior: el RAISE abortó la transacción entera, nada a medias.
    expect(await modeOf(t, svc)).toEqual({ capacity_mode: 'group_class', capacity: 2 })
  }, 20000)

  // (2) EL CAMINO QUE SÍ PASA — detector de `RETURN NULL` (T-14-16). Mismo escenario pero con el turno
  // futuro CANCELADO y un turno pasado vivo: el cambio tiene que volver sin error Y quedar escrito DE
  // VERDAD. Si falla con `error === null` pero la fila sin cambiar, el trigger está devolviendo NULL y
  // cancelando la escritura en silencio: PostgREST respondería 204 y el panel diría "Servicio
  // actualizado" sin haber actualizado nada.
  //
  // ⚠ QUÉ CAMBIÓ EN LA 070: este caso también salía de `individual`, y desde GATE-01 esa dirección
  // pasa por el GUARD DE DIRECCIÓN, que devuelve ANTES de llegar al `EXISTS`. O sea: seguiría verde
  // sin que el `EXISTS` se evaluara nunca, y dejaría de detectar lo que dice detectar. Por eso ahora
  // sale de `group_class` (dirección peligrosa): la única forma de que el cambio pase es que el
  // `EXISTS` corra de verdad y no encuentre ningún turno futuro VIVO.
  it('2 — sin turnos futuros vivos el cambio de modo pasa y QUEDA ESCRITO (detector de RETURN NULL)', async () => {
    const svc = await seedService(t, { name: '__test_svc_mode_gate_2' })
    await seedGroupClassService(t, { capacity: 2, serviceId: svc })
    await seedAppointment(t, { serviceId: svc, date: FUTURE, time: '09:30', status: 'cancelled' })
    await seedAppointment(t, { serviceId: svc, date: PAST, time: '09:30', status: 'confirmed' })

    const upd = await patchService(t.admin, svc, t.businessId, { capacity_mode: 'individual', capacity: 1 })
    expect(upd.error).toBeNull()
    expect((upd.data || []).length).toBe(1)

    // La aserción REAL: la fila cambió en la base, no solo "no hubo error".
    expect(await modeOf(t, svc)).toEqual({ capacity_mode: 'individual', capacity: 1 })
  }, 20000)

  // (3) TURNO CON ESTADO NULO. `appointments.status` es NULLABLE y `NOT IN (...)` sobre NULL evalúa a
  // NULL — ni true ni false —, así que sin la rama explícita `status IS NULL` esas filas quedarían
  // FUERA del EXISTS y ABRIRÍAN el gate. Es la trampa que el repo ya pagó dos veces (migr. 065 y el
  // read-path de 13-01). Si falla: alguien "simplificó" el predicado del gate a `status NOT IN (...)`.
  //
  // ⚠ QUÉ CAMBIÓ EN LA 070: misma aserción, dirección peligrosa (por el mismo motivo que el caso 2 —
  // desde `individual` el guard de dirección devuelve antes del `EXISTS` y la rama `status IS NULL`
  // no llegaría a evaluarse nunca).
  it('3 — un turno futuro con status NULL también bloquea el cambio de modo', async () => {
    const svc = await seedService(t, { name: '__test_svc_mode_gate_3' })
    await seedGroupClassService(t, { capacity: 2, serviceId: svc })
    await seedAppointment(t, { serviceId: svc, date: FUTURE, time: '10:00', status: null })

    const upd = await patchService(t.admin, svc, t.businessId, { capacity_mode: 'individual', capacity: 1 })
    expect(upd.error?.code).toBe('P0001')
    expect(upd.error?.message).toContain('service_mode_has_future_appointments')
    expect(await modeOf(t, svc)).toEqual({ capacity_mode: 'group_class', capacity: 2 })
  }, 20000)

  // (4) — ABSORBIDO POR LOS DOS CASOS DE GATE-03, no borrado por conveniencia.
  // Hasta la 070 este archivo tenía un caso "un turno de HOY cuenta como futuro" con una hora fija de
  // media mañana (10:30), y era una moneda al aire: a las 10:00 AR medía una cosa y a las 11:00 la
  // contraria. Desde GATE-03 la frontera de hoy la fija LA HORA, y los dos lados del corte tienen cada
  // uno su caso propio y determinista más abajo: "GATE-03 — el fix" (hoy a hora ya pasada ⇒ pasa) y
  // "GATE-03 — la frontera" (hoy a hora que no llegó ⇒ rechaza).
  // Duplicarlo además sería IMPOSIBLE DE EJECUTAR: un tercer turno del mismo tenant en `TODAY_AR` a la
  // misma hora choca con el índice único 011 (`23505`) y, separado de minutos, con el EXCLUDE gist 013
  // (`23P01`) — los tres turnos comparten `t.professionalId`.

  // (5) EL GATE NO TOCA LAS ESCRITURAS LEGÍTIMAS. Con un turno futuro VIVO presente, un UPDATE que NO
  // cambia el modo tiene que pasar, y persistir. Éste es el caso que habría detectado el error que el
  // review propuso en la 067 y que habría roto TODAS las bajas de abono en producción:
  //   (a) desactivar el servicio NO manda `capacity_mode` ⇒ el trigger ni siquiera dispara;
  //   (b) renombrarlo SÍ lo manda (así lo emite `saveEditService` en CADA guardado, incluso cuando el
  //       dueño no tocó el modo) ⇒ el trigger DISPARA y lo tiene que dejar pasar por el guard de
  //       no-cambio (`IS NOT DISTINCT FROM`). Sin ese guard, renombrar un servicio con turnos futuros
  //       rebotaría y la pantalla de servicios quedaría rota.
  //
  // ⚠ QUÉ CAMBIÓ EN LA 070 (WR-01 del code review): este caso sembraba el servicio con `seedService`,
  // que nace `individual`. Desde GATE-01 eso lo volvía TAUTOLÓGICO — con el guard de no-cambio borrado,
  // el guard de DIRECCIÓN devolvía igual y el caso seguía verde, o sea que dejó de medir lo único que
  // dice medir. Está MUTATION-TESTED en las dos versiones: mutado el gate (sin `IS NOT DISTINCT FROM`)
  // la versión vieja pasaba y ésta se pone en ROJO con `service_mode_has_future_appointments`.
  // Por eso el servicio se lleva primero a `group_class`: es el mismo re-anclaje que ya tenían los
  // casos 1, 2 y 3, y deja al guard de no-cambio como lo ÚNICO que puede salvar al rename.
  it('5 — el gate no bloquea escrituras legítimas: desactivar y renombrar con un turno futuro vivo', async () => {
    const svc = await seedService(t, { name: '__test_svc_mode_gate_5' })
    // Orden obligatorio: primero el modo de ORIGEN (este UPDATE también pasa por el gate), después el turno.
    await seedGroupClassService(t, { capacity: 2, serviceId: svc })
    await seedAppointment(t, { serviceId: svc, date: FUTURE, time: '11:00', status: 'confirmed' })

    // (a) sin capacity_mode en el SET → el trigger no dispara.
    const off = await patchService(t.admin, svc, t.businessId, { active: false })
    expect(off.error).toBeNull()
    expect((off.data || []).length).toBe(1)

    // (b) CON capacity_mode en el SET, con el MISMO valor que ya tenía → el trigger dispara y sólo el
    // guard de no-cambio lo deja pasar (la dirección de origen NO es `individual`: si el guard
    // desapareciera, el `EXISTS` encontraría el turno futuro vivo y esto rebotaría).
    const nuevoNombre = '__test_svc_mode_gate_5_renombrado'
    const rename = await patchService(t.admin, svc, t.businessId, {
      name: nuevoNombre,
      capacity_mode: 'group_class',
      capacity: 2,
    })
    expect(rename.error).toBeNull()
    expect((rename.data || []).length).toBe(1)

    // Los DOS efectos persistieron de verdad, y el modo no se movió.
    const { data } = await t.admin.from('services').select('name, active, capacity_mode').eq('id', svc).single()
    expect(data?.name).toBe(nuevoNombre)
    expect(data?.active).toBe(false)
    expect(data?.capacity_mode).toBe('group_class')
  }, 20000)

  // (6) AISLAMIENTO POR TENANT + su CONTRAPESO, en el mismo caso. El dueño de OTRO negocio no puede
  // cambiar el modo de un servicio ajeno: la policy por tenant filtra la fila, así que el UPDATE vuelve
  // SIN error y con 0 filas. Por eso el `.select('id')` no es cosmético: es lo único que distingue
  // "la RLS lo filtró" de "se escribió".
  //
  // El contrapeso va en el mismo `it` y no es opcional: sin él, una RLS rota que bloqueara a TODOS
  // dejaría la primera mitad verde. El mismo cliente anon, sobre SU propio servicio, sí escribe.
  //
  // ⚠ NOTA DESDE LA 070: los dos servicios de este caso son `individual` y no tienen turnos, así que
  // la dirección `individual` → `group_class` YA NO rebota por el gate (GATE-01 la abre). Eso MEJORA
  // el caso: antes un rechazo del gate podía enmascarar un fallo de RLS, y ahora lo único que puede
  // dejar el UPDATE cross-tenant en 0 filas es la policy por tenant — que es exactamente lo que este
  // caso tiene que probar.
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

  // ── LOS CASOS DE LA 070 ─────────────────────────────────────────────────────────────────────────
  // De acá para abajo va la matriz completa por dirección (GATE-01), el cierre de R-15-A (GATE-02) y
  // los dos lados del corte de hoy (GATE-03). Cada caso siembra SU PROPIO servicio, lo lleva al modo
  // de ORIGEN ANTES de sembrar el turno (trampa de orden: los helpers de modo también pasan por el
  // gate) y RELEE el estado real de la base — nunca se conforma con el error que volvió.

  // (8) GATE-01 — DIRECCIÓN SEGURA A: `individual` → `group_class`. Es el caso que la UAT de la
  // Phase 15 pidió con las palabras del dueño: pasar un servicio a grupal con un turno futuro vivo
  // rebotaba, y no tenía por qué.
  //
  // Y ACÁ VA LA EVIDENCIA DE POR QUÉ ESTRECHAR EL GATE NO REABRE R-1: el turno preexistente sigue con
  // `is_group = false` después del cambio. Eso significa que sigue DENTRO del EXCLUDE gist 013
  // (041: `AND NOT is_group`) — no queda huérfano de guards — y además pasa a contarse contra el cupo
  // nuevo. Sin esta aserción, "la dirección es segura" sería un argumento; con ella es una medición.
  it('8 — GATE-01 dirección segura A: individual → group_class con un turno futuro vivo PASA', async () => {
    const svc = await seedService(t, { name: '__test_svc_mode_gate_8_seguraA' })
    const turno = await seedAppointment(t, { serviceId: svc, date: FUTURE, time: '10:30', status: 'confirmed' })
    expect(await isGroupOf(t, turno)).toBe(false)

    const upd = await patchService(t.admin, svc, t.businessId, { capacity_mode: 'group_class', capacity: 2 })
    expect(upd.error).toBeNull()
    expect((upd.data || []).length).toBe(1)

    // La fila QUEDÓ ESCRITA (no un RETURN NULL silencioso).
    expect(await modeOf(t, svc)).toEqual({ capacity_mode: 'group_class', capacity: 2 })
    // Y el turno que ya existía NO se movió: `is_group = false` ⇒ sigue cubierto por el EXCLUDE 013.
    expect(await isGroupOf(t, turno)).toBe(false)
  }, 20000)

  // (9) GATE-01 — DIRECCIÓN SEGURA B: `individual` → `simultaneous_resource`. El mismo razonamiento
  // que (8) pero hacia el otro modo de cupo > 1: el criterio de la 070 es NOMINAL sobre el modo de
  // ORIGEN (`OLD.capacity_mode = 'individual'`), así que el destino no cambia la decisión. Si este
  // caso se cayera y el (8) no, alguien escribió el guard mirando el modo de DESTINO.
  it('9 — GATE-01 dirección segura B: individual → simultaneous_resource con un turno futuro vivo PASA', async () => {
    const svc = await seedService(t, { name: '__test_svc_mode_gate_9_seguraB' })
    await seedAppointment(t, { serviceId: svc, date: FUTURE, time: '11:30', status: 'confirmed' })

    const upd = await patchService(t.admin, svc, t.businessId, {
      capacity_mode: 'simultaneous_resource',
      capacity: 2,
    })
    expect(upd.error).toBeNull()
    expect((upd.data || []).length).toBe(1)
    expect(await modeOf(t, svc)).toEqual({ capacity_mode: 'simultaneous_resource', capacity: 2 })
  }, 20000)

  // (10) GATE-01 — DIRECCIÓN PELIGROSA C: `group_class` → `simultaneous_resource`. No baja el cupo ni
  // vuelve a individual: cambia el EJE DE CONTEO (hora de inicio exacta ⇄ solape de intervalos), y un
  // conjunto de turnos hoy legal puede volverse ilegal de un update para el otro. Por eso el recorte
  // de GATE-01 se escribió por NEGACIÓN de una sola dirección de origen y no como "cualquier cambio
  // que no baje el cupo".
  it('10 — GATE-01 dirección peligrosa C: group_class → simultaneous_resource con turno futuro vivo RECHAZA', async () => {
    const svc = await seedService(t, { name: '__test_svc_mode_gate_10_peligrosaC' })
    await seedGroupClassService(t, { capacity: 2, serviceId: svc })
    await seedAppointment(t, { serviceId: svc, date: FUTURE, time: '12:00', status: 'confirmed' })

    const upd = await patchService(t.admin, svc, t.businessId, {
      capacity_mode: 'simultaneous_resource',
      capacity: 2,
    })
    expect(upd.error?.code).toBe('P0001')
    expect(upd.error?.message).toContain('service_mode_has_future_appointments')
    expect(await modeOf(t, svc)).toEqual({ capacity_mode: 'group_class', capacity: 2 })
  }, 20000)

  // (11) GATE-01 — DIRECCIÓN PELIGROSA D: `simultaneous_resource` → `group_class`. El sentido inverso
  // del (10), y hace falta como caso propio: un guard escrito con una sola de las dos comparaciones
  // dejaría pasar exactamente uno de los dos y el otro caso no se enteraría.
  it('11 — GATE-01 dirección peligrosa D: simultaneous_resource → group_class con turno futuro vivo RECHAZA', async () => {
    const svc = await seedService(t, { name: '__test_svc_mode_gate_11_peligrosaD' })
    await seedSimultaneousService(t, { capacity: 2, serviceId: svc })
    await seedAppointment(t, { serviceId: svc, date: FUTURE, time: '12:30', status: 'confirmed' })

    const upd = await patchService(t.admin, svc, t.businessId, { capacity_mode: 'group_class', capacity: 2 })
    expect(upd.error?.code).toBe('P0001')
    expect(upd.error?.message).toContain('service_mode_has_future_appointments')
    expect(await modeOf(t, svc)).toEqual({ capacity_mode: 'simultaneous_resource', capacity: 2 })
  }, 20000)

  // (12) GATE-02 — el residual R-15-A de `15-SECURITY.md`. Hasta la 070 este gate excluía del conteo
  // los turnos `completed`, así que marcar completado un turno FUTURO desde el panel
  // (`appointments-client.tsx`, un solo click) lo sacaba del EXISTS y ABRÍA el gate. No es una salida
  // legítima: el turno sigue estando por delante y su `is_group` quedaría igual de desalineado.
  //
  // ⚠⚠ TESTIGO DE LA DIVERGENCIA DELIBERADA (D-03) — LEER ANTES DE "UNIFICAR" NADA.
  // Este caso es el par del caso (8) de `test/service-delete-gate.test.ts`, donde ESE MISMO ESTADO
  // (`completed` en un turno futuro) sigue SIN bloquear el borrado del servicio. Los dos predicados se
  // parecen a propósito y DIVERGEN a propósito desde la migración 070, porque preguntan cosas
  // distintas:
  //   · gate de BORRADO → "¿queda algo por prestar?"     ⇒ `completed` es historia (gap UAT #2 de la
  //     Phase 13, HIST-01..03: el snapshot conserva el nombre). NO bloquea.
  //   · gate de MODO    → "¿queda alguna fila cuyo `is_group` quedaría desalineado?" ⇒ `completed` es
  //     un bypass de un click. SÍ bloquea.
  // Si algún día alguien iguala los dos conjuntos de estados "por simetría", reabre R-15-A o re-rompe
  // el gap UAT #2 — uno de los dos, seguro. Este comentario y el de su par existen para que ese cambio
  // falle ruidosamente en vez de pasar por prolijidad.
  it('12 — GATE-02: un turno FUTURO marcado completed ya NO abre el gate de modo (cierra R-15-A)', async () => {
    const svc = await seedService(t, { name: '__test_svc_mode_gate_12_completed' })
    await seedGroupClassService(t, { capacity: 2, serviceId: svc })
    // ÚNICO turno del servicio, y está en el futuro: el bypass consistía en marcarlo `completed`.
    await seedAppointment(t, { serviceId: svc, date: FUTURE, time: '13:00', status: 'completed' })

    const upd = await patchService(t.admin, svc, t.businessId, { capacity_mode: 'individual', capacity: 1 })
    expect(upd.error?.code).toBe('P0001')
    expect(upd.error?.message).toContain('service_mode_has_future_appointments')
    expect(await modeOf(t, svc)).toEqual({ capacity_mode: 'group_class', capacity: 2 })
  }, 20000)

  // (13) GATE-03 — EL FIX. Un turno de HOY a una hora que YA PASÓ no es un compromiso por delante.
  // Hasta la 070 el gate comparaba sólo `date >= hoy AR`, así que ese turno trababa el cambio de modo
  // hasta la medianoche mientras la UI ya lo mostraba en "Pasados" — el gap G4 de la Phase 13, que se
  // arregló en `lib/appointment-time.ts` y nunca había cruzado al SQL.
  // La hora de corte se calcula acá con `nowInAR`, la MISMA función que usa la UI: si las dos se
  // separaran, este caso lo detecta.
  it('13 — GATE-03: un turno de HOY a hora YA PASADA no bloquea el cambio de modo (y queda escrito)', async () => {
    const svc = await seedService(t, { name: '__test_svc_mode_gate_13_hoy_pasado' })
    await seedGroupClassService(t, { capacity: 2, serviceId: svc })
    // ÚNICO turno del servicio: de hoy, vivo, y a una hora que el guard del beforeAll garantiza pasada.
    await seedAppointment(t, { serviceId: svc, date: TODAY_AR, time: PAST_TIME_TODAY, status: 'confirmed' })

    const upd = await patchService(t.admin, svc, t.businessId, { capacity_mode: 'individual', capacity: 1 })
    expect(upd.error).toBeNull()
    expect((upd.data || []).length).toBe(1)
    expect(await modeOf(t, svc)).toEqual({ capacity_mode: 'individual', capacity: 1 })
  }, 20000)

  // (14) GATE-03 — LA FRONTERA. El contrapeso obligatorio del (13): un turno de HOY a una hora que
  // TODAVÍA NO LLEGÓ sigue bloqueando. Sin este caso, "el turno de hoy dejó de bloquear" sería
  // indistinguible de "el día de hoy dejó de contar", que no es una corrección sino una regresión —
  // GATE-03 podría haberse pasado de laxo y nadie se enteraría.
  it('14 — GATE-03 frontera: un turno de HOY a hora que NO llegó sigue bloqueando el cambio de modo', async () => {
    const svc = await seedService(t, { name: '__test_svc_mode_gate_14_hoy_futuro' })
    await seedGroupClassService(t, { capacity: 2, serviceId: svc })
    await seedAppointment(t, { serviceId: svc, date: TODAY_AR, time: FUTURE_TIME_TODAY, status: 'confirmed' })

    const upd = await patchService(t.admin, svc, t.businessId, { capacity_mode: 'individual', capacity: 1 })
    expect(upd.error?.code).toBe('P0001')
    expect(upd.error?.message).toContain('service_mode_has_future_appointments')
    expect(await modeOf(t, svc)).toEqual({ capacity_mode: 'group_class', capacity: 2 })
  }, 20000)

  // (15) WR-05 — LA EXCEPCIÓN DE LA DIRECCIÓN SEGURA: un ABONO ACTIVO.
  // "Salir de individual es seguro" vale para los turnos que YA existen; NO para una serie que va a
  // seguir creando turnos. Sobre el modo nuevo cada ocurrencia futura deja de tener el slot para ella
  // sola y compite por cupo con el resto, y `lib/abono-generation.ts` ante `slot_full`/`slot_taken`
  // SALTEA la ocurrencia y sigue: el abonado perdería turnos en silencio. Hasta la 069 esa protección
  // existía de rebote (una serie viva casi siempre tiene turnos futuros materializados y el predicado
  // de turnos frenaba el cambio); GATE-01 la sacaba justo en la dirección más usada, y por eso el
  // guard de dirección lleva adentro el mismo bloque de abono activo que el gate de BORRADO tiene
  // desde la 065.
  //
  // El CONTRAPESO no es opcional: sin él, un gate que rechazara SIEMPRE la dirección segura (o sea,
  // GATE-01 revertido de hecho) dejaría la primera mitad verde. Con la serie archivada la MISMA
  // dirección tiene que pasar.
  it('15 — WR-05: un abono ACTIVO bloquea la dirección segura individual → group_class', async () => {
    const svc = await seedService(t, { name: '__test_svc_mode_gate_15_abono' })
    const abono = await seedAbono(t, { serviceId: svc, startTime: '18:00', status: 'active' })

    const upd = await patchService(t.admin, svc, t.businessId, { capacity_mode: 'group_class', capacity: 2 })
    expect(upd.error?.code).toBe('P0001')
    expect(upd.error?.message).toContain('service_mode_has_future_appointments')
    expect(await modeOf(t, svc)).toEqual({ capacity_mode: 'individual', capacity: 1 })

    // CONTRAPESO: archivar la serie es la salida documentada (la baja del panel), y con eso la misma
    // dirección pasa y QUEDA ESCRITA.
    const arch = await t.admin
      .from('abonos')
      .update({ status: 'cancelled' })
      .eq('id', abono)
      .eq('business_id', t.businessId)
      .select('id')
    expect(arch.error).toBeNull()
    expect((arch.data || []).length).toBe(1)

    const upd2 = await patchService(t.admin, svc, t.businessId, { capacity_mode: 'group_class', capacity: 2 })
    expect(upd2.error).toBeNull()
    expect(await modeOf(t, svc)).toEqual({ capacity_mode: 'group_class', capacity: 2 })
  }, 20000)
})
