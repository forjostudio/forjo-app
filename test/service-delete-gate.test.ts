import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { nowInAR } from '@/lib/appointment-time'
import { hasSupabaseCreds } from './env'
import { seedOneTenant, seedService, teardownOneTenant, type SeededTenant } from './helpers/booking-fixtures'

// ── Tests del gate de borrado de servicio (migr. 065, trigger BEFORE DELETE) ──────────────────
// Cubren HIST-01 (se puede borrar un servicio cuando no hay nada futuro vivo), HIST-02 (no se
// puede si lo hay) y HIST-03 (el historial sobrevive al borrado).
//
// El gate vive en la BASE a propósito (D-10): corre dentro de la MISMA transacción del DELETE, así
// que no hay ventana TOCTOU entre el pre-check del modal (13-03) y el borrado. Eso también quiere
// decir que la única forma de probarlo es borrando de verdad y mirando el error que devuelve
// PostgREST — ningún test unitario lo alcanza.
//
// Sin las creds de Supabase el bloque entero se skipea (mismo molde que booking-core.test.ts).
// Cada caso siembra SU PROPIO servicio con `seedService` para que no se pisen entre sí, y usa un
// horario distinto para no chocar con el índice único 011 ni con la exclusion constraint 013.
//
// Fechas fijas: 2031 está siempre en el futuro y 2020 siempre en el pasado, sin depender del reloj
// del runner ni de la frontera "hoy AR" que evalúa el trigger.
const FUTURE = '2031-03-03'
const PAST = '2020-03-02'
// "Ahora" en hora AR, tomado de `lib/appointment-time.ts::nowInAR` — LA MISMA FUENTE QUE USA LA UI.
// Desde la migración 070 (GATE-03) el gate ya no compara sólo el día: compara fecha Y HORA contra el
// INICIO del turno, replicando en SQL exactamente lo que hace `isPastAppointment`. Calcular acá la
// frontera con otra fórmula sería medir con una regla distinta de la que se está probando.
// El caso que motivó el gap UAT #2 vive justo en esa frontera: un turno de HOY ya prestado
// (`completed`) no es una reserva pendiente y no puede trabar el borrado.
const AR_NOW = nowInAR()
const TODAY_AR = AR_NOW.date
// Los dos lados del corte de GATE-03, con horas FIJAS (un repro no determinista es peor que ninguno):
// una de madrugada que a esta altura del día YA PASÓ, y una de fin de día que TODAVÍA NO LLEGÓ.
// Mismo criterio y mismo motivo que en el archivo hermano `test/capacity-mode-change-gate.test.ts`.
const PAST_TIME_TODAY = '00:00:00'
const FUTURE_TIME_TODAY = '23:59:00'
// Ventana horaria AR fuera de la cual esas dos constantes dejan de ser deterministas.
const GUARD_WINDOW = { from: '01:00:00', to: '23:30:00' }

describe.skipIf(!hasSupabaseCreds)('065: gate de borrado de servicio (BEFORE DELETE)', () => {
  let t: SeededTenant

  beforeAll(async () => {
    // GUARD DE LA VENTANA DE MEDIANOCHE (GATE-03), copiado del archivo hermano y por el mismo motivo:
    // los dos casos de la frontera de hoy usan horas FIJAS (`PAST_TIME_TODAY` = "ya pasó",
    // `FUTURE_TIME_TODAY` = "todavía no llegó"). Fuera de [01:00:00, 23:30:00] en hora AR esas dos
    // etiquetas dejan de ser ciertas y los casos medirían LO CONTRARIO de lo que dicen medir.
    // TIRA en vez de skipear a propósito: un skip silencioso escondería el agujero de cobertura justo
    // en la franja horaria donde el bug de zona horaria es más probable.
    if (AR_NOW.time < GUARD_WINDOW.from || AR_NOW.time > GUARD_WINDOW.to) {
      throw new Error(
        `GUARD DE MEDIANOCHE: son las ${AR_NOW.time} en hora AR. Los casos de GATE-03 sólo son ` +
          `deterministas entre ${GUARD_WINDOW.from} y ${GUARD_WINDOW.to} (23:30): fuera de esa ventana ` +
          `'${PAST_TIME_TODAY}' ya no es una hora pasada o '${FUTURE_TIME_TODAY}' ya no es una hora futura.`,
      )
    }
    t = await seedOneTenant({ bufferMinutes: 0, serviceDurationMinutes: 30 })
  })

  afterAll(async () => {
    if (t) await teardownOneTenant(t)
  })

  // El DELETE se hace como lo haría el panel: por id + business_id (aislamiento explícito).
  async function deleteService(serviceId: string) {
    return t.admin.from('services').delete().eq('id', serviceId).eq('business_id', t.businessId)
  }

  async function serviceExists(serviceId: string): Promise<boolean> {
    const { data, error } = await t.admin.from('services').select('id').eq('id', serviceId)
    if (error) throw new Error(`select service: ${error.message}`)
    return (data || []).length > 0
  }

  async function seedAppointment(args: {
    serviceId: string
    date: string
    time: string
    status: string | null
  }): Promise<string> {
    const ins = await t.admin
      .from('appointments')
      .insert({
        business_id: t.businessId,
        service_id: args.serviceId,
        professional_id: t.professionalId,
        location_id: t.locationId,
        date: args.date,
        time: args.time,
        duration_minutes: 30,
        client_name: 'Cliente Gate',
        status: args.status,
      })
      .select('id')
      .single()
    if (ins.error || !ins.data) throw new Error(`seed appointment: ${ins.error?.message}`)
    return ins.data.id as string
  }

  // Réplica EXACTA del `future` del pre-check del modal de borrado (settings-client.tsx,
  // `openDeleteService`): dos queries —los días posteriores a hoy, y los de HOY traídos enteros— y el
  // corte de hoy resuelto en JS contra el FIN del turno, porque `date + time + duración` no se puede
  // expresar como filtro de PostgREST. Cambiar una y no la otra es el drift que este caso detecta.
  function horaEnSegundos(raw: string): number {
    const [h = '0', m = '0', s = '0'] = raw.split(':')
    return (Number(h) || 0) * 3600 + (Number(m) || 0) * 60 + (Number(s) || 0)
  }
  async function preCheckFuture(serviceId: string): Promise<number> {
    const { date: today, time: nowTime } = nowInAR()
    const [futDias, futHoy] = await Promise.all([
      t.admin.from('appointments').select('date', { count: 'exact' })
        .eq('business_id', t.businessId).eq('service_id', serviceId)
        .gt('date', today).or('status.is.null,and(status.neq.cancelled,status.neq.completed)')
        .order('date').limit(1),
      t.admin.from('appointments').select('time, duration_minutes', { count: 'exact' })
        .eq('business_id', t.businessId).eq('service_id', serviceId)
        .eq('date', today).or('status.is.null,and(status.neq.cancelled,status.neq.completed)'),
    ])
    if (futDias.error || futHoy.error) throw new Error(`pre-check: ${futDias.error?.message ?? futHoy.error?.message}`)
    const filasDeHoy = (futHoy.data ?? []) as { time: string | null; duration_minutes: number | null }[]
    const countDeHoy = futHoy.count ?? 0
    const vivosDeHoy = countDeHoy > filasDeHoy.length
      ? countDeHoy
      : filasDeHoy.filter(r => (r.time ? horaEnSegundos(r.time) + (r.duration_minutes ?? 30) * 60 : Number.POSITIVE_INFINITY) > horaEnSegundos(nowTime)).length
    return (futDias.count ?? 0) + vivosDeHoy
  }

  async function seedAbono(args: { serviceId: string; startTime: string; status: string }): Promise<string> {
    const ins = await t.admin
      .from('abonos')
      .insert({
        business_id: t.businessId,
        service_id: args.serviceId,
        professional_id: t.professionalId,
        location_id: t.locationId,
        day_of_week: 1,
        start_time: args.startTime,
        status: args.status,
      })
      .select('id')
      .single()
    if (ins.error || !ins.data) throw new Error(`seed abono: ${ins.error?.message}`)
    return ins.data.id as string
  }

  // (1) D-08 / HIST-02: un turno futuro NO cancelado bloquea el borrado. Es el caso que protege al
  // dueño de vaciarse la agenda sin darse cuenta.
  it('1 — un turno futuro confirmado bloquea el borrado (P0001 / service_has_future_appointments)', async () => {
    const svc = await seedService(t, { name: '__test_svc_gate_futuro' })
    await seedAppointment({ serviceId: svc, date: FUTURE, time: '09:00', status: 'confirmed' })

    const del = await deleteService(svc)
    expect(del.error).not.toBeNull()
    expect(del.error?.code).toBe('P0001')
    expect(del.error?.message).toContain('service_has_future_appointments')

    // Y el servicio SIGUE existiendo: la transacción abortó entera, nada quedó a medias.
    expect(await serviceExists(svc)).toBe(true)
  }, 20000)

  // (2) D-08: el mismo turno futuro, pero CANCELADO, no bloquea nada. Contarlo reproduciría
  // exactamente la confusión que esta fase viene a arreglar (cancelar todo y seguir trabado).
  it('2 — un turno futuro CANCELADO no bloquea el borrado (D-08)', async () => {
    const svc = await seedService(t, { name: '__test_svc_gate_cancelado' })
    await seedAppointment({ serviceId: svc, date: FUTURE, time: '09:30', status: 'cancelled' })

    const del = await deleteService(svc)
    expect(del.error).toBeNull()
    expect(await serviceExists(svc)).toBe(false)
  }, 20000)

  // (3) Pitfall 2: `appointments.status` es NULLABLE. Con `NOT IN ('cancelled','completed')` a secas
  // esas filas evalúan a NULL, quedan fuera del EXISTS y ABREN el gate. Si este test falla, el
  // trigger perdió la rama `status IS NULL` y un turno sin estado dejó de contar como reservado.
  it('3 — un turno futuro con status NULL bloquea igual (rama IS NULL explícita)', async () => {
    const svc = await seedService(t, { name: '__test_svc_gate_null' })
    await seedAppointment({ serviceId: svc, date: FUTURE, time: '10:00', status: null })

    const del = await deleteService(svc)
    expect(del.error).not.toBeNull()
    expect(del.error?.code).toBe('P0001')
    expect(del.error?.message).toContain('service_has_future_appointments')
    expect(await serviceExists(svc)).toBe(true)
  }, 20000)

  // (4) HIST-01 + HIST-03 + T-13-06: con solo turnos pasados y cancelados el borrado PASA, el
  // servicio DESAPARECE de verdad (si el trigger devolviera NULL en vez de OLD, el DELETE se
  // cancelaría en silencio y la UI diría "eliminado" sin haber borrado nada) y los dos turnos
  // sobreviven con `service_id` en NULL pero con su snapshot intacto.
  it('4 — con solo turnos pasados/cancelados borra, y el historial sobrevive (HIST-01 + HIST-03)', async () => {
    const svc = await seedService(t, { name: '__test_svc_gate_historial' })
    const pasado = await seedAppointment({ serviceId: svc, date: PAST, time: '11:00', status: 'confirmed' })
    const futuroCancelado = await seedAppointment({
      serviceId: svc,
      date: FUTURE,
      time: '11:00',
      status: 'cancelled',
    })

    const del = await deleteService(svc)
    expect(del.error).toBeNull()

    // (a) El servicio ya no está.
    expect(await serviceExists(svc)).toBe(false)

    // (b) Los dos turnos siguen ahí, desacoplados del servicio pero con la historia completa.
    const { data } = await t.admin
      .from('appointments')
      .select('id, service_id, service_name, service_price')
      .in('id', [pasado, futuroCancelado])
    expect((data || []).length).toBe(2)
    for (const row of data || []) {
      expect(row.service_id).toBeNull()
      expect(row.service_name).toBe('__test_svc_gate_historial')
      expect(Number(row.service_price)).toBe(100)
    }
  }, 20000)

  // (5) D-09: un abono ACTIVO genera turnos hacia adelante, así que cuenta como futuro. Message
  // DISTINTO sobre el mismo P0001, para que el modal (13-03) pueda decir "y un abono activo".
  it('5 — un abono active bloquea el borrado (P0001 / service_has_active_abono)', async () => {
    const svc = await seedService(t, { name: '__test_svc_gate_abono_activo' })
    await seedAbono({ serviceId: svc, startTime: '12:00', status: 'active' })

    const del = await deleteService(svc)
    expect(del.error).not.toBeNull()
    expect(del.error?.code).toBe('P0001')
    expect(del.error?.message).toContain('service_has_active_abono')
    expect(await serviceExists(svc)).toBe(true)
  }, 20000)

  // (6) D-09: el abono archivado ya NO bloquea (su FK pasó a SET NULL) y su nombre sobrevive por el
  // snapshot de la sección 5 de la 065.
  it('6 — un abono cancelled no bloquea y conserva el service_name (D-09)', async () => {
    const svc = await seedService(t, { name: '__test_svc_gate_abono_archivado' })
    const abono = await seedAbono({ serviceId: svc, startTime: '13:00', status: 'cancelled' })

    const del = await deleteService(svc)
    expect(del.error).toBeNull()
    expect(await serviceExists(svc)).toBe(false)

    const { data } = await t.admin.from('abonos').select('id, service_id, service_name').eq('id', abono).single()
    expect(data?.service_id).toBeNull()
    expect(data?.service_name).toBe('__test_svc_gate_abono_archivado')
  }, 20000)

  // (7) GAP UAT #2 — el caso exacto que reportó el dueño: marcó el turno de HOY como `completed` y
  // el modal seguía diciendo "tiene 1 turno reservado a partir del 3/8". Un turno completado YA SE
  // PRESTÓ: es historial, no una reserva pendiente, y no puede trabar el borrado. Que la fecha sea
  // HOY (no el pasado) es parte del test: `date >= hoy` lo mete de lleno en la ventana del gate.
  it('7 — un turno de HOY marcado completed NO bloquea el borrado (gap UAT #2)', async () => {
    const svc = await seedService(t, { name: '__test_svc_gate_completed_hoy' })
    const turno = await seedAppointment({ serviceId: svc, date: TODAY_AR, time: '15:00', status: 'completed' })

    const del = await deleteService(svc)
    expect(del.error).toBeNull()
    expect(await serviceExists(svc)).toBe(false)

    // Y el turno completado sobrevive con su snapshot: se desacopla, no se pierde (HIST-03).
    const { data } = await t.admin
      .from('appointments')
      .select('id, service_id, service_name, service_price')
      .eq('id', turno)
      .single()
    expect(data?.service_id).toBeNull()
    expect(data?.service_name).toBe('__test_svc_gate_completed_hoy')
    expect(Number(data?.service_price)).toBe(100)
  }, 20000)

  // (8) Misma regla, sin frontera de fecha de por medio: `completed` no bloquea NUNCA, tampoco en el
  // futuro. El filtro es por ESTADO, no por fecha — un turno marcado como prestado es historia
  // aunque su fecha todavía no llegó (reprogramaciones, cierres anticipados de la agenda).
  //
  // ⚠⚠ TESTIGO DE LA DIVERGENCIA DELIBERADA (D-03) — LEER ANTES DE "UNIFICAR" NADA.
  // Desde la migración 070 este predicado y el de `services_block_mode_change` YA NO SON
  // INTERCAMBIABLES, y este caso es el testigo de ese lado. Su par es el caso (12) de
  // `test/capacity-mode-change-gate.test.ts`, donde ESTE MISMO ESTADO (`completed` en un turno futuro)
  // SÍ bloquea el cambio de modo. No es una inconsistencia: los dos gates preguntan cosas distintas.
  //   · gate de BORRADO (éste) → "¿queda algo por prestar?" ⇒ un turno completado ya se prestó, es
  //     historia, su nombre sobrevive por el snapshot de la 065 (HIST-01..03, gap UAT #2 de la
  //     Phase 13). NO bloquea.
  //   · gate de MODO           → "¿queda alguna fila cuyo `is_group` quedaría desalineado?" ⇒ marcar
  //     `completed` un turno FUTURO es un botón de un click del panel, o sea un bypass accesible del
  //     gate. Es el residual R-15-A de `15-SECURITY.md`. SÍ bloquea.
  // Igualar los dos conjuntos de estados "por simetría" reabre R-15-A o re-rompe el gap UAT #2 — uno
  // de los dos, seguro. Los dos comentarios existen para que ese cambio falle ruidosamente.
  it('8 — un turno FUTURO completed tampoco bloquea (la regla es por estado, no por fecha)', async () => {
    const svc = await seedService(t, { name: '__test_svc_gate_completed_futuro' })
    await seedAppointment({ serviceId: svc, date: FUTURE, time: '15:30', status: 'completed' })

    const del = await deleteService(svc)
    expect(del.error).toBeNull()
    expect(await serviceExists(svc)).toBe(false)
  }, 20000)

  // (9) El contrapeso de (7)/(8): abrir el gate para `completed` NO puede haber abierto nada más. Los
  // tres estados vivos del dominio (`lib/types.ts`) siguen bloqueando en una fecha futura. Si este
  // test se cae, el predicado se pasó de laxo y el dueño puede vaciarse la agenda sin enterarse.
  it.each(['pending', 'pending_payment', 'confirmed'])(
    '9 — un turno futuro %s sigue bloqueando el borrado',
    async (status) => {
      const svc = await seedService(t, { name: `__test_svc_gate_vivo_${status}` })
      // Una hora distinta por estado: el índice único 011 y la exclusion constraint 013 miran la
      // agenda del profesional, que es la misma para los tres casos.
      const time = { pending: '16:00', pending_payment: '16:30', confirmed: '17:00' }[status] as string
      await seedAppointment({ serviceId: svc, date: FUTURE, time, status })

      const del = await deleteService(svc)
      expect(del.error).not.toBeNull()
      expect(del.error?.code).toBe('P0001')
      expect(del.error?.message).toContain('service_has_future_appointments')
      expect(await serviceExists(svc)).toBe(true)
    },
    20000,
  )

  // (10) T-13-07: guard de cascada. En un `DELETE FROM businesses` el padre se borra ANTES de que
  // corran las acciones referenciales hacia `services`, y esa ausencia identifica la cascada. Sin
  // el guard, cerrar la cuenta de un negocio con turnos futuros sería imposible — y `teardownOneTenant`
  // rompería la suite entera, porque su cleanup borra `businesses` y cascadea a `services`.
  //
  // Este caso usa su propio tenant desechable: el business ya se borra dentro del test, así que solo
  // queda limpiar el usuario de auth (que no cae por el CASCADE).
  it('10 — borrar el negocio entero funciona aunque haya turnos futuros vivos (guard de cascada)', async () => {
    const tmp = await seedOneTenant({ bufferMinutes: 0, serviceDurationMinutes: 30 })
    try {
      const ins = await tmp.admin.from('appointments').insert({
        business_id: tmp.businessId,
        service_id: tmp.serviceId,
        professional_id: tmp.professionalId,
        location_id: tmp.locationId,
        date: FUTURE,
        time: '14:00',
        duration_minutes: 30,
        client_name: 'Cliente Cascada',
        status: 'confirmed',
      })
      expect(ins.error).toBeNull()

      // Sanity: ese mismo servicio NO se puede borrar solo (el gate está activo para este tenant).
      const delSvc = await tmp.admin
        .from('services')
        .delete()
        .eq('id', tmp.serviceId)
        .eq('business_id', tmp.businessId)
      expect(delSvc.error?.code).toBe('P0001')

      // Pero el negocio entero sí: la cascada pasa por el guard.
      const delBiz = await tmp.admin.from('businesses').delete().eq('id', tmp.businessId)
      expect(delBiz.error).toBeNull()

      const { data } = await tmp.admin.from('services').select('id').eq('id', tmp.serviceId)
      expect((data || []).length).toBe(0)
    } finally {
      await tmp.admin.auth.admin.deleteUser(tmp.userId)
    }
  }, 20000)

  // (11) IN-01 — el conteo del historial que promete el modal NO es el que Finanzas muestra.
  //
  // El pre-check `hist` (settings-client.tsx:565-566) cuenta TODOS los turnos del servicio, sin filtro
  // de estado, y el copy del modal (`:605`) dice "Se conservan sus N turnos en el historial (Finanzas y
  // ficha del cliente)". Pero Finanzas (finances-client.tsx:221/250/274), el export CSV
  // (api/export/finances/route.ts:53) y la ficha del cliente aplican todos `.neq('status','cancelled')`.
  // O sea: el N prometido incluye turnos cancelados que el dueño NUNCA va a ver en Finanzas.
  //
  // LIMITACIÓN CONOCIDA DE ESTE CASO: `settings-client.tsx` es un componente client y esta suite no
  // renderiza React (D-01), así que acá se REPLICAN las dos formas de query tal cual las emite la app,
  // no se invoca la app. Consecuencia: arreglar IN-01 en el componente NO rompe este test solo. Cuando
  // se arregle (agregando `.neq('status','cancelled')` al `hist` del modal, o sacando el número del
  // copy), hay que darle el mismo filtro a la réplica `hist` de abajo y devolver el `it.fails` a `it`.
  it.fails('11 — IN-01: el count del modal y el que ve Finanzas deberían coincidir', async () => {
    const svc = await seedService(t, { name: '__test_svc_in01_historial' })
    // Historial mixto, todo PASADO (el gate no entra en juego acá): 2 turnos que Finanzas SÍ muestra
    // y 2 cancelados que Finanzas descarta.
    await seedAppointment({ serviceId: svc, date: PAST, time: '18:00', status: 'confirmed' })
    await seedAppointment({ serviceId: svc, date: PAST, time: '18:30', status: 'completed' })
    await seedAppointment({ serviceId: svc, date: PAST, time: '19:00', status: 'cancelled' })
    await seedAppointment({ serviceId: svc, date: PAST, time: '19:30', status: 'cancelled' })

    // (a) La query del modal, TAL CUAL (sin filtro de estado).
    const hist = await t.admin
      .from('appointments')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', t.businessId)
      .eq('service_id', svc)

    // (b) La query de Finanzas / export CSV / ficha del cliente, TAL CUAL.
    const finanzas = await t.admin
      .from('appointments')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', t.businessId)
      .eq('service_id', svc)
      .neq('status', 'cancelled')

    expect(hist.error).toBeNull()
    expect(finanzas.error).toBeNull()
    // Sanity que vale con y sin el arreglo: se sembraron 4 filas y Finanzas muestra 2 de ellas.
    expect(finanzas.count).toBe(2)

    // La expectativa CORRECTA: el modal no puede prometer un historial que Finanzas no va a mostrar.
    // Hoy da 4 vs 2 → el copy sobredimensiona lo que se conserva.
    expect(hist.count).toBe(finanzas.count)
  }, 20000)

  // (12) GATE-03 — EL FIX (migr. 070). Un turno de HOY a una hora que YA PASÓ no es un compromiso por
  // delante, y no puede trabar el borrado del servicio hasta la medianoche.
  //
  // Es EXACTAMENTE el mismo bug que la Phase 13 arregló en la UI (gap G4, resuelto con
  // `lib/appointment-time.ts::isPastAppointment`) y que NUNCA había cruzado al SQL: la pantalla de
  // turnos mostraba ese turno en "Pasados" mientras la base lo seguía contando como futuro, así que el
  // dueño veía una lista vacía de pendientes y el borrado seguía rebotando. Hasta la 070 el predicado
  // era `a."date" >= v_today` — sólo el día.
  //
  // `serviceExists` no es cosmético acá: es lo ÚNICO que distingue "se borró de verdad" de "el trigger
  // canceló el borrado en silencio" (un `RETURN NULL` desde un BEFORE DELETE responde 204 sin error).
  it('12 — GATE-03: un turno de HOY a hora YA PASADA no bloquea el borrado (gap G4 cruzando al SQL)', async () => {
    const svc = await seedService(t, { name: '__test_svc_gate_hoy_pasado' })
    // ÚNICO turno del servicio: de hoy, VIVO (`confirmed`, no `completed`: acá no interviene el estado)
    // y a una hora que el guard del beforeAll garantiza pasada.
    await seedAppointment({ serviceId: svc, date: TODAY_AR, time: PAST_TIME_TODAY, status: 'confirmed' })

    const del = await deleteService(svc)
    expect(del.error).toBeNull()
    expect(await serviceExists(svc)).toBe(false)
  }, 20000)

  // (13) GATE-03 — LA FRONTERA. El contrapeso obligatorio del (12): un turno de HOY que TODAVÍA NO
  // LLEGÓ sigue siendo un compromiso por delante y sigue bloqueando. Sin este caso, "el turno de hoy
  // dejó de bloquear" sería indistinguible de "el día de hoy dejó de contar" — eso no sería una
  // corrección sino la regresión que vaciaría la agenda del dueño sin que se entere.
  // El `>=` del predicado es INCLUSIVE y se compara contra el INICIO del turno, espejo del `<`
  // estricto de `isPastAppointment`.
  it('13 — GATE-03 frontera: un turno de HOY a hora que NO llegó sigue bloqueando el borrado', async () => {
    const svc = await seedService(t, { name: '__test_svc_gate_hoy_futuro' })
    await seedAppointment({ serviceId: svc, date: TODAY_AR, time: FUTURE_TIME_TODAY, status: 'confirmed' })

    const del = await deleteService(svc)
    expect(del.error).not.toBeNull()
    expect(del.error?.code).toBe('P0001')
    expect(del.error?.message).toContain('service_has_future_appointments')
    expect(await serviceExists(svc)).toBe(true)
  }, 20000)

  // (14) CR-02 — EL PRE-CHECK DEL MODAL Y EL GATE TIENEN QUE DECIR LO MISMO.
  //
  // El gate vive en la base, pero la ÚNICA superficie por la que el dueño borra un servicio es el
  // modal de `settings-client.tsx`, que deshabilita el botón "Eliminar" con un pre-check propio
  // (`delBlocked = delInfo.future > 0 || delInfo.activeAbono`). Mientras ese pre-check comparó SÓLO la
  // fecha, GATE-03 no llegaba a ninguna persona: la base dejaba borrar y el modal seguía bloqueando
  // exactamente el caso que la 070 vino a arreglar (CR-02 del code review de la Phase 16, reproducido).
  //
  // LIMITACIÓN CONOCIDA, la misma del caso (11): esta suite no renderiza React (D-01), así que acá se
  // REPLICAN las queries y la aritmética del componente, no se invoca el componente. Si alguien toca
  // el pre-check de `settings-client.tsx`, tiene que tocar también `preCheckFuture` de abajo — y si no
  // lo hace, este caso deja de estar midiendo el componente. Es el precio de no poder importarlo.
  it('14 — CR-02: el pre-check del modal coincide con el gate en los dos lados del corte de hoy', async () => {
    // (a) HOY a hora YA TERMINADA: el gate deja borrar (caso 12) y el pre-check tiene que decir 0.
    // Horas PROPIAS, que no pisan las de los casos (12)/(13): los turnos de este archivo comparten
    // `t.professionalId` y sobreviven al borrado de su servicio (la FK es ON DELETE SET NULL), así
    // que repetir su horario rebota con 23505 (índice único 011) y solaparlo con 23P01 (EXCLUDE 013).
    // Las dos siguen siendo deterministas dentro de la ventana del guard [01:00, 23:30]:
    //   · 00:30 + 30' termina a las 01:00 ⇒ YA TERMINÓ para cualquier "ahora" de la ventana.
    //   · 23:20 + 30' termina a las 23:50 ⇒ TODAVÍA OCUPA para cualquier "ahora" de la ventana.
    const PRECHECK_PAST = '00:30:00'
    const PRECHECK_FUTURE = '23:20:00'
    const svcPasado = await seedService(t, { name: '__test_svc_precheck_hoy_pasado' })
    await seedAppointment({ serviceId: svcPasado, date: TODAY_AR, time: PRECHECK_PAST, status: 'confirmed' })
    expect(await preCheckFuture(svcPasado)).toBe(0)
    const delPasado = await deleteService(svcPasado)
    expect(delPasado.error).toBeNull()
    expect(await serviceExists(svcPasado)).toBe(false)

    // (b) CONTRAPESO obligatorio: HOY a hora que NO llegó. El gate bloquea (caso 13) y el pre-check
    //     tiene que contar ese turno — si no, el pre-check quedaría "siempre 0" y (a) sería vacío.
    const svcFuturo = await seedService(t, { name: '__test_svc_precheck_hoy_futuro' })
    await seedAppointment({ serviceId: svcFuturo, date: TODAY_AR, time: PRECHECK_FUTURE, status: 'confirmed' })
    expect(await preCheckFuture(svcFuturo)).toBe(1)
    const delFuturo = await deleteService(svcFuturo)
    expect(delFuturo.error?.code).toBe('P0001')
    expect(await serviceExists(svcFuturo)).toBe(true)
  }, 20000)
})
