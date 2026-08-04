import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { hasSupabaseCreds } from './env'
import { seedOneTenant, teardownOneTenant, type SeededTenant } from './helpers/booking-fixtures'

// ── Tests del gate de borrado de una serie de abono (migr. 066, trigger BEFORE DELETE) ──────────
// Cubren EXTRA-B: D-18 (solo se borra lo archivado, y la BASE es la autoridad), D-16 (los turnos ya
// generados sobreviven desvinculados) y D-17 DESCARTADO (los turnos futuros NO se tocan).
//
// El gate vive en la BASE a propósito: corre dentro de la MISMA transacción del DELETE, así que no
// hay ventana entre el pre-check de la pantalla (plan 14-06) y el borrado, y resiste un DELETE
// directo por PostgREST que saltee la UI. Consecuencia para los tests: la única forma de probarlo es
// borrando de verdad contra Postgres y mirando el error que vuelve — ningún test unitario lo alcanza.
//
// Sin las creds de Supabase el bloque entero se skipea (mismo molde que service-delete-gate.test.ts).
// Cada caso siembra SU PROPIA serie para que no se pisen entre sí.
//
// Fechas fijas: 2031 está siempre en el futuro y 2020 siempre en el pasado, sin depender del reloj
// del runner.
const FUTURE = '2031-03-03'
const PAST = '2020-03-02'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

describe.skipIf(!hasSupabaseCreds)('066: gate de borrado de serie de abono (BEFORE DELETE)', () => {
  // `t` es el tenant principal (el "ajeno" desde el punto de vista de la sesión anon del caso 6).
  let t: SeededTenant
  // `other` es el segundo tenant: su dueño es el que firma la sesión anon de los casos 6 y 7.
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

    // GUARD anti-falso-verde (molde de abono-cancel-routes.test.ts:412-420 / isolation.test.ts): si el
    // cliente de aserción quedara sin sesión, el DELETE del caso 6 volvería con 0 filas por estar
    // deslogueado y no por la policy de tenant — un verde que no prueba nada.
    const sess = await otherOwnerSession.auth.getSession()
    if (!sess.data.session?.access_token) {
      throw new Error('GUARD: el cliente de aserción NO tiene sesión anon autenticada (no usar service-role)')
    }
    // GUARD anti-falso-verde 2: si la anon key fuera en realidad la service-role, el caso 7 pasaría
    // por bypass de RLS y el 6 fallaría por el motivo equivocado. Config rota ⇒ abortar.
    if (anonKey === process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('GUARD: NEXT_PUBLIC_SUPABASE_ANON_KEY == SUPABASE_SERVICE_ROLE_KEY — config rota, abortar')
    }
  })

  afterAll(async () => {
    if (t) await teardownOneTenant(t)
    if (other) await teardownOneTenant(other)
  })

  // El DELETE replica exactamente lo que emite el panel: por id, con el filtro explícito por
  // business_id (defensa en profundidad), y con `.select('id')` para poder distinguir "0 filas porque
  // la RLS filtró" de "borrado exitoso" — sin eso, el cliente diría "eliminado" sin haber borrado nada.
  async function deleteAbono(client: SupabaseClient, abonoId: string, businessId: string) {
    return client.from('abonos').delete().eq('id', abonoId).eq('business_id', businessId).select('id')
  }

  async function abonoExists(tenant: SeededTenant, abonoId: string): Promise<boolean> {
    const { data, error } = await tenant.admin.from('abonos').select('id').eq('id', abonoId)
    if (error) throw new Error(`select abono: ${error.message}`)
    return (data || []).length > 0
  }

  async function seedAbono(
    tenant: SeededTenant,
    args: { status: string; startTime: string; totalOccurrences?: number | null },
  ): Promise<string> {
    const ins = await tenant.admin
      .from('abonos')
      .insert({
        business_id: tenant.businessId,
        service_id: tenant.serviceId,
        professional_id: tenant.professionalId,
        location_id: tenant.locationId,
        day_of_week: 1,
        start_time: args.startTime,
        status: args.status,
        total_occurrences: args.totalOccurrences ?? null,
      })
      .select('id')
      .single()
    if (ins.error || !ins.data) throw new Error(`seed abono: ${ins.error?.message}`)
    return ins.data.id as string
  }

  async function seedAppointment(
    tenant: SeededTenant,
    args: { abonoId: string; date: string; time: string; status: string },
  ): Promise<string> {
    const ins = await tenant.admin
      .from('appointments')
      .insert({
        business_id: tenant.businessId,
        service_id: tenant.serviceId,
        professional_id: tenant.professionalId,
        location_id: tenant.locationId,
        abono_id: args.abonoId,
        date: args.date,
        time: args.time,
        duration_minutes: 30,
        client_name: 'Cliente Abono Gate',
        status: args.status,
      })
      .select('id')
      .single()
    if (ins.error || !ins.data) throw new Error(`seed appointment: ${ins.error?.message}`)
    return ins.data.id as string
  }

  // (1) D-18 / T-14-12: una serie ACTIVA no se borra, ni siquiera desde una request que saltea la UI
  // (acá el DELETE sale por PostgREST, sin React de por medio). Se asierta el `code` Y el `message`:
  // el código de dominio es el CONTRATO que el plan 14-06 mapea en el cliente, y un assert que solo
  // mirara "hubo error" pasaría igual con un rechazo por cualquier otro motivo.
  it('1 — una serie activa NO se puede borrar (P0001 / abono_is_active)', async () => {
    const abono = await seedAbono(t, { status: 'active', startTime: '09:00' })

    const del = await deleteAbono(t.admin, abono, t.businessId)
    expect(del.error).not.toBeNull()
    expect(del.error?.code).toBe('P0001')
    expect(del.error?.message).toContain('abono_is_active')

    // Y la serie SIGUE existiendo: el RAISE abortó la transacción entera, nada quedó a medias.
    expect(await abonoExists(t, abono)).toBe(true)
  }, 20000)

  // (2) D-18 + T-14-16: la serie dada de baja SÍ se borra, y desaparece DE VERDAD. Este caso es el
  // que detecta un `return null` en el trigger: si el borrado se cancelara en silencio, el error
  // sería nulo (verde falso) pero la fila seguiría ahí.
  it('2 — una serie cancelled se borra y desaparece de verdad (T-14-16)', async () => {
    const abono = await seedAbono(t, { status: 'cancelled', startTime: '09:30' })

    const del = await deleteAbono(t.admin, abono, t.businessId)
    expect(del.error).toBeNull()
    expect((del.data || []).length).toBe(1)
    expect(await abonoExists(t, abono)).toBe(false)
  }, 20000)

  // (3) El otro estado que la pantalla muestra como archivado: la serie finita que ya juntó sus N
  // sesiones. El gate mira el ESTADO, no cuántos turnos quedan por delante.
  it('3 — una serie completed (todas las sesiones asignadas) se borra', async () => {
    const abono = await seedAbono(t, { status: 'completed', startTime: '10:00', totalOccurrences: 4 })

    const del = await deleteAbono(t.admin, abono, t.businessId)
    expect(del.error).toBeNull()
    expect(await abonoExists(t, abono)).toBe(false)
  }, 20000)

  // (4) D-16 + D-17 DESCARTADO: borrar la serie NO destruye su historial. Los dos turnos siguen
  // existiendo con el vínculo a la serie en NULL (por el `on delete set null` que la 054 ya dejó
  // puesto) y con su snapshot de nombre y precio de servicio intacto (migr. 065), así que Finanzas y
  // la ficha del cliente los siguen mostrando.
  //
  // El turno FUTURO no cancelado es, además, la prueba de que D-17 está descartado: sobrevive vivo y
  // con su estado ORIGINAL. Borrar la serie no cancela ni borra nada de la agenda.
  it('4 — los turnos de la serie borrada sobreviven desvinculados y con su snapshot (D-16 / D-17)', async () => {
    const abono = await seedAbono(t, { status: 'completed', startTime: '11:00', totalOccurrences: 2 })
    const pasado = await seedAppointment(t, { abonoId: abono, date: PAST, time: '11:00', status: 'completed' })
    const futuro = await seedAppointment(t, { abonoId: abono, date: FUTURE, time: '11:00', status: 'confirmed' })

    const del = await deleteAbono(t.admin, abono, t.businessId)
    expect(del.error).toBeNull()
    expect(await abonoExists(t, abono)).toBe(false)

    const { data } = await t.admin
      .from('appointments')
      .select('id, abono_id, status, service_name, service_price')
      .in('id', [pasado, futuro])
    expect((data || []).length).toBe(2)
    for (const row of data || []) {
      expect(row.abono_id).toBeNull()
      expect(row.service_name).not.toBeNull()
      expect(Number(row.service_price)).toBe(100)
    }

    // El futuro conserva su estado original: no quedó cancelado ni tocado (D-17 descartado).
    const futuroRow = (data || []).find(r => r.id === futuro)
    expect(futuroRow?.status).toBe('confirmed')
    const pasadoRow = (data || []).find(r => r.id === pasado)
    expect(pasadoRow?.status).toBe('completed')
  }, 20000)

  // (5) T-14-15 — GUARD DE CASCADA. Al cerrar la cuenta de un negocio, la fila de `businesses` se
  // borra ANTES de que corran las acciones referenciales hacia `abonos`; esa ausencia es lo que el
  // trigger usa para identificar la cascada y dejarla pasar. Sin el guard, un negocio con una serie
  // activa sería imposible de cerrar — y `teardownOneTenant` rompería TODA la suite de integración,
  // porque su cleanup borra el negocio y cascadea a `abonos`.
  //
  // Tenant desechable propio: el negocio se borra dentro del test, así que solo queda limpiar el
  // usuario de auth (que no cae por el CASCADE), igual que el caso 10 del molde de servicios.
  it('5 — cerrar la cuenta del negocio funciona aunque tenga una serie activa (guard de cascada)', async () => {
    const tmp = await seedOneTenant({ bufferMinutes: 0, serviceDurationMinutes: 30 })
    try {
      const abono = await seedAbono(tmp, { status: 'active', startTime: '12:00' })

      // Sanity: esa misma serie NO se puede borrar sola (el gate está activo para este tenant).
      const delAbono = await deleteAbono(tmp.admin, abono, tmp.businessId)
      expect(delAbono.error?.code).toBe('P0001')
      expect(delAbono.error?.message).toContain('abono_is_active')

      // Pero el negocio entero sí: la cascada pasa por el guard.
      const delBiz = await tmp.admin.from('businesses').delete().eq('id', tmp.businessId)
      expect(delBiz.error).toBeNull()

      const { data } = await tmp.admin.from('abonos').select('id').eq('id', abono)
      expect((data || []).length).toBe(0)
    } finally {
      await tmp.admin.auth.admin.deleteUser(tmp.userId)
    }
  }, 20000)

  // (6) T-14-17 — aislamiento por tenant. El dueño de OTRO negocio no puede borrar una serie ajena,
  // ni siquiera archivada: la policy de borrado por tenant (migr. 054, ya existente) filtra la fila,
  // así que el DELETE vuelve SIN error y con 0 filas. Por eso el `.select('id')` no es cosmético: es
  // lo único que distingue "la RLS lo filtró" de "se borró".
  it('6 — el dueño de otro negocio NO puede borrar una serie archivada ajena (0 filas, sin error)', async () => {
    const ajeno = await seedAbono(t, { status: 'cancelled', startTime: '13:00' })

    const del = await deleteAbono(otherOwnerSession, ajeno, t.businessId)
    expect(del.error).toBeNull()
    expect((del.data || []).length).toBe(0)
    expect(await abonoExists(t, ajeno)).toBe(true)
  }, 20000)

  // (7) Contrapeso del caso 6: sin este, una RLS rota que bloqueara a TODOS dejaría el caso 6 verde.
  // El mismo cliente anon autenticado, sobre una serie archivada SUYA, sí borra: 1 fila afectada y la
  // serie desaparece. Es exactamente el camino que va a recorrer el botón del plan 14-06 (browser
  // client + RLS, nunca service-role).
  it('7 — el propio dueño SÍ borra su serie archivada con la sesión anon (1 fila)', async () => {
    const propio = await seedAbono(other, { status: 'cancelled', startTime: '13:30' })

    const del = await deleteAbono(otherOwnerSession, propio, other.businessId)
    expect(del.error).toBeNull()
    expect((del.data || []).length).toBe(1)
    expect(await abonoExists(other, propio)).toBe(false)
  }, 20000)
})
