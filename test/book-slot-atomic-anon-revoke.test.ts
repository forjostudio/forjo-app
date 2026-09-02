import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { hasSupabaseCreds } from './env'
import { seedOneTenant, seedTimeBlock, teardownOneTenant, type SeededTenant } from './helpers/booking-fixtures'

// ── book_slot_atomic: el rol anónimo NO puede ejecutar el RPC (X-16-A / RA-05) ──────────────────
//
// EL HALLAZGO QUE ESTE ARCHIVO CIERRA. `book_slot_atomic` es `SECURITY DEFINER` y tuvo
// `GRANT EXECUTE ... TO "anon"` desde la migración 041, re-otorgado hasta la 069. Adentro de una
// función definer la RLS NO corre, así que el bloqueo que sí atrapa a un `INSERT` directo en
// `appointments` no aplica acá: cualquiera con la anon key —que viaja en el bundle del navegador—
// podía llamar la función por PostgREST y crear un turno salteándose LOS TRES controles del booking
// público, que viven SOLO en `app/api/booking/create/route.ts`:
//   1. ventana de reserva (`isDateOutOfWindow`, lib/booking-window.ts),
//   2. gate de plan (`plan_status`),
//   3. reCAPTCHA.
// Los dos únicos parámetros no adivinables (`business_id`, `service_id`) son PÚBLICOS: los publica
// la vista `public_services`. O sea que el ataque es realizable, no teórico.
//
// POR QUÉ EL CLIENTE DE ATAQUE NO TIENE SESIÓN. Lo que se mide acá es el privilegio del rol `anon`,
// no el de un dueño logueado. Un `signInWithPassword` cambiaría el rol efectivo del JWT a
// `authenticated` y el test estaría midiendo OTRA COSA (y pasaría verde por el motivo equivocado
// incluso con el agujero abierto). Por eso hay un guard que aborta si el cliente de ataque llegara a
// tener sesión.
//
// POR QUÉ LAS ASERCIONES DE EFECTO VAN CONTRA LA BASE. El valor de retorno del `.rpc()` no alcanza
// como prueba: un error de PostgREST puede venir por mil motivos (firma que no matchea, payload
// inválido, función inexistente) y ninguno de esos significa "el privilegio está revocado". La
// aserción fuerte es que NO QUEDE FILA en `appointments`, leída con un cliente INDEPENDIENTE
// (service-role) que no participa del ataque. Molde de `test/concurrency.test.ts` (que también
// cuenta con `t.admin` contra la DB real, nunca con los retornos del core).
//
// LOS DOS CONTROLES POSITIVOS NO SON DECORATIVOS. Sin ellos, el caso 1 podría ponerse verde porque
// el payload es inválido en vez de porque falta el privilegio, y el fix parecería funcionar sin
// haber probado nada. Además el caso 3 (`authenticated`) es el que detecta un revoke que se pasa de
// rosca y rompe el alta manual del dueño (`app/api/appointments/create/route.ts`, que llama al core
// con `createClient()` + cookies ⇒ rol `authenticated`).
//
// SUPERFICIE: PostgREST con la anon key, que es EXACTAMENTE lo que corre en el navegador de
// cualquiera que abra `/[slug]`. No se simula con `SET LOCAL ROLE`: se ejerce el borde real.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Fecha fija: 2031-03-03 es LUNES (EXTRACT(dow) = 1), alineada con el `day_of_week` default de
// `seedTimeBlock`. Misma constante que test/concurrency.test.ts.
const DATE = '2031-03-03'

describe.skipIf(!hasSupabaseCreds)('book_slot_atomic: el rol anónimo no puede ejecutarlo (X-16-A)', () => {
  let t: SeededTenant
  // Cliente de ATAQUE: anon key, SIN sesión. Rol efectivo `anon`.
  let anonSinSesion: SupabaseClient
  // Control positivo del dueño: anon key CON sesión ⇒ rol efectivo `authenticated`.
  let dueñoAutenticado: SupabaseClient

  beforeAll(async () => {
    t = await seedOneTenant({ bufferMinutes: 0, serviceDurationMinutes: 30 })
    await seedTimeBlock(t)

    // Sembrado con service-role (sembrar NO es asertar). Estos dos valores son el corazón del caso:
    // convierten al payload del caso 1 en uno que el route handler público rechazaría DOS veces —
    // 400 `date_out_of_window` (2031 está a años del corte de 7 días) y 403 `plan_inactive`.
    // Que el RPC igual lo acepte es la demostración de que los controles no viven en la base.
    const upd = await t.admin
      .from('businesses')
      .update({ max_advance_days: 7, plan_status: 'cancelled' })
      .eq('id', t.businessId)
    if (upd.error) throw new Error(`seed: update business falló: ${upd.error.message}`)

    anonSinSesion = createClient(url, anonKey, { auth: { persistSession: false } })
    dueñoAutenticado = createClient(url, anonKey, { auth: { persistSession: false } })

    const sign = await dueñoAutenticado.auth.signInWithPassword({ email: t.email, password: t.password })
    if (sign.error) throw new Error(`signIn del dueño falló: ${sign.error.message}`)

    // GUARD anti-falso-verde #1: la anon key no puede ser la service-role key. Si lo fuera, el
    // "cliente de ataque" tendría privilegios de servicio y el test mediría cualquier cosa.
    if (anonKey === process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('GUARD: NEXT_PUBLIC_SUPABASE_ANON_KEY == SUPABASE_SERVICE_ROLE_KEY — config rota, abortar')
    }
    // GUARD anti-falso-verde #2: el cliente de ataque NO puede tener sesión. Con sesión el rol
    // efectivo sería `authenticated` y el caso 1 pasaría verde sin probar el privilegio de `anon`.
    const sesionAtaque = await anonSinSesion.auth.getSession()
    if (sesionAtaque.data.session) {
      throw new Error('GUARD: el cliente de ataque tiene sesión — el rol efectivo sería authenticated, no anon')
    }
    // GUARD anti-falso-verde #3 (control positivo 3): el dueño SÍ tiene que tener sesión, o el caso
    // de `authenticated` estaría midiendo al rol anónimo por segunda vez.
    const sesionDueño = await dueñoAutenticado.auth.getSession()
    if (!sesionDueño.data.session?.access_token) {
      throw new Error('GUARD: el cliente del dueño NO tiene sesión anon autenticada')
    }
  }, 60_000)

  afterAll(async () => {
    if (t) await teardownOneTenant(t)
  }, 60_000)

  // Los CATORCE parámetros exactos que pasa lib/booking-core.ts:499. PostgREST resuelve la función
  // por el CONJUNTO de argumentos: si faltara uno, el error sería "función no encontrada" y el test
  // daría un falso verde por el motivo equivocado (no por falta de privilegio).
  async function bookAs(client: SupabaseClient, time: string) {
    return client.rpc('book_slot_atomic', {
      p_business_id: t.businessId,
      p_professional_id: t.professionalId,
      p_service_id: t.serviceId,
      p_location_id: t.locationId,
      p_date: DATE,
      p_time: time,
      p_duration: t.serviceDurationMinutes,
      p_client_id: null,
      p_client_name: '__test_bypass_anon',
      p_client_phone: '1122334455',
      p_client_email: null,
      p_notes: null,
      p_status: 'confirmed',
      p_expires_at: null,
    })
  }

  // Lectura INDEPENDIENTE del efecto, con el service-role del fixture. No participa del ataque: es
  // su verificación externa.
  async function countAppointmentsAt(time: string): Promise<number> {
    const { data, error } = await t.admin
      .from('appointments')
      .select('id')
      .eq('business_id', t.businessId)
      .eq('date', DATE)
      .eq('time', time)
    if (error) throw new Error(`countAppointmentsAt falló: ${error.message}`)
    return (data ?? []).length
  }

  it('1 — `anon` sin sesión NO puede ejecutar el RPC y NO deja ninguna fila', async () => {
    const { error } = await bookAs(anonSinSesion, '09:00')

    // La llamada tiene que FALLAR. Antes de la migración 076 esto pasa (crea el turno) y el test
    // queda ROJO: esa falla ES la reproducción del bypass.
    expect(error).not.toBeNull()

    // Y la aserción que de verdad importa: cero filas en la base.
    expect(await countAppointmentsAt('09:00')).toBe(0)
  }, 30_000)

  it('2 — control positivo: `service_role` SIGUE pudiendo crear el turno (booking público / cron de abonos)', async () => {
    const { error } = await bookAs(t.admin, '10:00')
    expect(error).toBeNull()
    expect(await countAppointmentsAt('10:00')).toBe(1)
  }, 30_000)

  it('3 — control positivo: `authenticated` SIGUE pudiendo crear el turno (alta manual del dueño)', async () => {
    const { error } = await bookAs(dueñoAutenticado, '11:00')
    expect(error).toBeNull()
    expect(await countAppointmentsAt('11:00')).toBe(1)
  }, 30_000)
})
