import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { hasSupabaseCreds } from './env'
import { seedTwoTenants, teardown, type SeededTenants } from './helpers/supabase-fixtures'

// ── Pre-check de borrado de servicio: contra-caso cross-tenant del 5º count (T-19-14) ───────────
//
// El audit de la Phase 19 (`19-SECURITY.md` §2, fila T-19-14, y la deuda #1 de §6) cerró esta
// propiedad POR LECTURA DE CÓDIGO y lo dijo con todas las letras: *"la propiedad cross-tenant NO
// está probada por ningún test"*. Este archivo la cierra con un test que MUERDE.
//
// LA QUERY BAJO PRUEBA es la 5ª del `Promise.all` del pre-check de borrado
// (`app/(dashboard)/settings/settings-client.tsx`): cuenta a cuántas franjas de la agenda está
// mapeado el servicio que el dueño está por borrar. Lleva DOS capas de aislamiento a propósito:
// el filtro explícito por `business_id` Y la RLS de `time_block_services`.
//
// LA TRAMPA (misma que isolation.test.ts / agenda-save-blocks-rpc.test.ts, Pitfall 12): las
// ASERCIONES de aislamiento usan SOLO clientes anon-key AUTENTICADOS como cada dueño — nunca el
// service-role, que bypassa RLS y daría un falso verde. El service-role aparece para (a) sembrar,
// (b) limpiar y (c) el caso 3, que NO es una aserción de aislamiento sino la verificación de la
// segunda capa AISLADA (ver el comentario de ese caso).
//
// POR QUÉ EL CASO 3 EXISTE: el contra-caso "tal cual" —quitarle el `.eq('business_id', …)` a la
// query y ver si el test se pone rojo— NO MUERDE: con la RLS activa el count devuelve 0 igual, así
// que el test quedaría VERDE con el filtro borrado y no probaría nada de lo que dice probar. El
// caso 3 apaga la RLS a propósito para que el filtro explícito sea lo ÚNICO que sostiene la
// propiedad, y ahí sí se puede observar si muerde.
//
// LÍMITE HONESTO DE ESTA SUITE: prueba la propiedad a NIVEL DE QUERY —con las dos capas y con cada
// una aislada—, no ata la línea de `settings-client.tsx`. Esa query vive inline en un componente
// cliente de ~2000 líneas; extraerla a un módulo puro sería un refactor más grande y más riesgoso
// que la propiedad que se quiere fijar. Consecuencia a saber: si alguien le borra el
// `.eq('business_id', …)` a la query REAL del panel, este test NO se entera. Lo que sí garantiza es
// que la propiedad está especificada, medida y que su violación es detectable.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

describe.skipIf(!hasSupabaseCreds)('pre-check de borrado de servicio: aislamiento cross-tenant (T-19-14)', () => {
  let seeded: SeededTenants
  // anonA: el ÚNICO cliente de las aserciones de aislamiento (casos 1, 2 y 4). anon-key + sesión del
  // dueño A ⇒ rol `authenticated` y RLS aplicando exactamente como en producción.
  let anonA: SupabaseClient
  let svcA: string
  let svcB: string
  let blockA: string
  let blockB: string

  beforeAll(async () => {
    seeded = await seedTwoTenants()

    anonA = createClient(url, anonKey, { auth: { persistSession: false } })
    const signA = await anonA.auth.signInWithPassword({ email: seeded.emailA, password: seeded.password })
    if (signA.error) throw new Error(`signIn A falló: ${signA.error.message}`)

    // GUARD anti-falso-verde #1: si el cliente de aserción no tiene sesión anon autenticada,
    // fallamos RUIDOSAMENTE antes de correr una sola aserción — un cliente sin sesión es rol `anon`
    // y mediría otra cosa.
    const sessA = await anonA.auth.getSession()
    if (!sessA.data.session?.access_token) {
      throw new Error(
        'GUARD: el cliente de aserción NO tiene sesión anon autenticada — no debe usarse service-role en las aserciones (Pitfall 12)'
      )
    }
    // GUARD anti-falso-verde #2: la anon key no puede ser la service-role key.
    if (anonKey === process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('GUARD: NEXT_PUBLIC_SUPABASE_ANON_KEY == SUPABASE_SERVICE_ROLE_KEY — config rota, abortar')
    }

    // ── Sembrado (service-role, NO aserción) ──────────────────────────────────────────────────
    // Un servicio + una franja + su fila puente POR NEGOCIO. Cada trío tiene que ser coherente: las
    // FK compuestas `tbs_block_same_tenant` / `tbs_service_same_tenant` (migr. 073) rechazan
    // cualquier mezcla entre tenants.
    const s1 = await seeded.admin
      .from('services')
      .insert({ business_id: seeded.bizA, name: '__test_svc_pre_a', duration_minutes: 30, price: 100, active: true })
      .select('id')
      .single()
    if (s1.error || !s1.data) throw new Error(`seed: service A falló: ${s1.error?.message}`)
    svcA = s1.data.id

    const s2 = await seeded.admin
      .from('services')
      .insert({ business_id: seeded.bizB, name: '__test_svc_pre_b', duration_minutes: 30, price: 100, active: true })
      .select('id')
      .single()
    if (s2.error || !s2.data) throw new Error(`seed: service B falló: ${s2.error?.message}`)
    svcB = s2.data.id

    const b1 = await seeded.admin
      .from('time_blocks')
      .insert({ business_id: seeded.bizA, day_of_week: 1, start_time: '09:00', end_time: '13:00' })
      .select('id')
      .single()
    if (b1.error || !b1.data) throw new Error(`seed: time_block A falló: ${b1.error?.message}`)
    blockA = b1.data.id

    const b2 = await seeded.admin
      .from('time_blocks')
      .insert({ business_id: seeded.bizB, day_of_week: 2, start_time: '09:00', end_time: '13:00' })
      .select('id')
      .single()
    if (b2.error || !b2.data) throw new Error(`seed: time_block B falló: ${b2.error?.message}`)
    blockB = b2.data.id

    const m1 = await seeded.admin
      .from('time_block_services')
      .insert({ business_id: seeded.bizA, time_block_id: blockA, service_id: svcA })
    if (m1.error) throw new Error(`seed: mapeo A falló: ${m1.error.message}`)

    const m2 = await seeded.admin
      .from('time_block_services')
      .insert({ business_id: seeded.bizB, time_block_id: blockB, service_id: svcB })
    if (m2.error) throw new Error(`seed: mapeo B falló: ${m2.error.message}`)
  })

  afterAll(async () => {
    if (seeded) await teardown(seeded)
  })

  // ── Helpers ────────────────────────────────────────────────────────────────────────────────
  // contarFranjasMapeadas: réplica EXACTA de la 5ª query del `Promise.all` del pre-check
  // (`settings-client.tsx`): misma tabla, misma columna, mismo `count: 'exact'` + `head: true`,
  // mismos dos `.eq`. Parametrizada sólo por el cliente para poder correrla con anon+sesión (casos
  // 1, 2 y 4) o con service-role (caso 3).
  async function contarFranjasMapeadas(client: SupabaseClient, businessId: string, serviceId: string) {
    const { count, error } = await client
      .from('time_block_services')
      .select('time_block_id', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .eq('service_id', serviceId)
    if (error) throw new Error(`count del pre-check falló: ${error.message}`)
    return count
  }

  // Control NEGATIVO: idéntica a la de arriba MENOS el `.eq('business_id', …)`. Es la única
  // variable del experimento del caso 3, y existe para que la mordida del filtro explícito sea
  // observable SIN tener que editar el test.
  async function contarFranjasMapeadasSinFiltroDeTenant(client: SupabaseClient, serviceId: string) {
    const { count, error } = await client
      .from('time_block_services')
      .select('time_block_id', { count: 'exact', head: true })
      .eq('service_id', serviceId)
    if (error) throw new Error(`count sin filtro de tenant falló: ${error.message}`)
    return count
  }

  it('1. CONTROL POSITIVO: como A, el count sobre el propio servicio mapeado devuelve 1', async () => {
    // Sin este control un 0 en el caso 2 no prueba NADA: podría venir de una query rota, de un
    // sembrado que no entró o de una tabla vacía. Acá se fija que la query SÍ cuenta cuando debe.
    const count = await contarFranjasMapeadas(anonA, seeded.bizA, svcA)
    expect(count).toBe(1)
  })

  it('2. CROSS-TENANT (el caso de producción): como A, el count con el service_id de B devuelve 0', async () => {
    // El ataque es realizable: los `service_id` de cualquier negocio son públicos (vista
    // `public_services`). Si esto se pone rojo, el pre-check de borrado le está contando a un dueño
    // las franjas de OTRO negocio — filtración cross-tenant en una pantalla del panel.
    const count = await contarFranjasMapeadas(anonA, seeded.bizA, svcB)
    expect(count).toBe(0)
  })

  it('3. LA MORDIDA — con la RLS DESACTIVADA, el filtro explícito por business_id sostiene solo', async () => {
    // ⚠ ESTE CASO USA service-role A PROPÓSITO, y NO es una aserción de aislamiento: las de
    // aislamiento son los casos 1, 2 y 4 (anon-key + sesión). Acá se DESACTIVA la RLS —el
    // service-role la bypassa— para verificar la SEGUNDA CAPA AISLADA: que el `.eq('business_id',…)`
    // escrito a mano en el pre-check sostiene la propiedad POR SÍ SOLO.
    //
    // Sin este caso, borrarle el `.eq('business_id', …)` a la query dejaría la suite entera en VERDE
    // (la RLS taparía el agujero) y el test no probaría lo que dice probar. El par de aserciones de
    // abajo es lo único que hace observable la mordida.
    const conFiltro = await contarFranjasMapeadas(seeded.admin, seeded.bizA, svcB)
    expect(conFiltro).toBe(0)

    // Y la prueba de que ese 0 lo produce EL FILTRO y no la ausencia de datos: sin el filtro, la
    // misma query sobre el mismo servicio de B encuentra la fila.
    const sinFiltro = await contarFranjasMapeadasSinFiltroDeTenant(seeded.admin, svcB)
    expect(sinFiltro).toBe(1)
  })

  it('4. la 6ª query del pre-check (todas las filas de la puente) tampoco trae nada de B', async () => {
    // La 6ª query del mismo `Promise.all` NO filtra por `service_id` —trae la puente entera del
    // negocio para saber qué franjas vuelven a comodín—, así que su única contención explícita es
    // el `business_id`. Si se pone roja, el aviso de D-07 se calcula con franjas ajenas.
    const { data, count, error } = await anonA
      .from('time_block_services')
      .select('time_block_id, service_id', { count: 'exact' })
      .eq('business_id', seeded.bizA)
    expect(error).toBeNull()
    expect(count).toBe(1)

    const filas = data ?? []
    expect(filas).toHaveLength(1)
    expect(filas[0]).toMatchObject({ time_block_id: blockA, service_id: svcA })
    // Explícito, no derivado del length: ni la franja ni el servicio de B aparecen.
    expect(filas.some((r) => r.time_block_id === blockB || r.service_id === svcB)).toBe(false)
  })
})
