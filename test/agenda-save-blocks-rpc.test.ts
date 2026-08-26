import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { hasSupabaseCreds } from './env'
import { seedTwoTenants, teardown, type SeededTenants } from './helpers/supabase-fixtures'

// ── save_agenda_blocks (migr. 074): aislamiento cross-tenant + atomicidad del write path ────────
//
// La Phase 18 cerró con el warning WR-05: "cero test de aislamiento cross-tenant para la tabla
// nueva". Este archivo lo cierra para el WRITE PATH — la función que borra y reescribe la agenda
// entera de un negocio, que es la superficie de escritura más peligrosa que agrega la Phase 19.
//
// LA TRAMPA (misma que isolation.test.ts, Pitfall 12): las ASERCIONES de aislamiento usan SOLO
// clientes anon-key AUTENTICADOS como cada dueño — nunca el service-role, que bypassa RLS y daría
// un falso verde. El service-role del helper de fixtures aparece exclusivamente para (a) sembrar,
// (b) limpiar y (c) LEER de forma independiente el efecto de una escritura, que no es la aserción
// de aislamiento sino su verificación externa.
//
// EL DATO QUE SUBE EL RIESGO: `time_blocks` tiene la policy `public read time_blocks` con
// `USING (true)` — o sea que los ids de las franjas de CUALQUIER negocio son públicos. Un payload
// forjado con el `time_block_id` de otro tenant no es un ataque teórico: es realizable con la anon
// key que está en el bundle del navegador. Lo mismo con los `service_id` (vista `public_services`).
// Los casos 5 y 6 son exactamente esos dos ataques.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

type BlockPayload = {
  id: string | null
  day_of_week: number
  start_time: string
  end_time: string
  label: string | null
  location_id: string | null
  service_ids: string[]
}

describe.skipIf(!hasSupabaseCreds)('save_agenda_blocks (074): aislamiento y atomicidad', () => {
  let seeded: SeededTenants
  // anonA / anonB: los ÚNICOS clientes que invocan el RPC en las aserciones. anon-key + sesión del
  // dueño ⇒ rol `authenticated` y RLS aplicando como en producción.
  let anonA: SupabaseClient
  let anonB: SupabaseClient
  // Catálogo mínimo por tenant. seedTwoTenants no siembra servicios, así que se crean acá con el
  // service-role (sembrado, no aserción).
  let svcA1: string
  let svcA2: string
  let svcB: string
  // Franja de B con su mapeo: el objetivo del ataque del caso 5.
  let blockB: string

  beforeAll(async () => {
    seeded = await seedTwoTenants()

    anonA = createClient(url, anonKey, { auth: { persistSession: false } })
    anonB = createClient(url, anonKey, { auth: { persistSession: false } })

    const signA = await anonA.auth.signInWithPassword({ email: seeded.emailA, password: seeded.password })
    if (signA.error) throw new Error(`signIn A falló: ${signA.error.message}`)
    const signB = await anonB.auth.signInWithPassword({ email: seeded.emailB, password: seeded.password })
    if (signB.error) throw new Error(`signIn B falló: ${signB.error.message}`)

    // GUARD anti-falso-verde #1: si el cliente de aserción no tiene sesión anon autenticada,
    // fallamos RUIDOSAMENTE antes de correr una sola aserción.
    const sessA = await anonA.auth.getSession()
    const sessB = await anonB.auth.getSession()
    if (!sessA.data.session?.access_token || !sessB.data.session?.access_token) {
      throw new Error(
        'GUARD: el cliente de aserción NO tiene sesión anon autenticada — no debe usarse service-role en las aserciones (Pitfall 12)'
      )
    }
    // GUARD anti-falso-verde #2: la anon key no puede ser la service-role key.
    if (anonKey === process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('GUARD: NEXT_PUBLIC_SUPABASE_ANON_KEY == SUPABASE_SERVICE_ROLE_KEY — config rota, abortar')
    }

    // ── Sembrado (service-role, NO aserción) ──────────────────────────────────────────────────
    const s1 = await seeded.admin
      .from('services')
      .insert({ business_id: seeded.bizA, name: '__test_svc_a1', duration_minutes: 30, price: 100, active: true })
      .select('id')
      .single()
    if (s1.error || !s1.data) throw new Error(`seed: service A1 falló: ${s1.error?.message}`)
    svcA1 = s1.data.id

    const s2 = await seeded.admin
      .from('services')
      .insert({ business_id: seeded.bizA, name: '__test_svc_a2', duration_minutes: 45, price: 200, active: true })
      .select('id')
      .single()
    if (s2.error || !s2.data) throw new Error(`seed: service A2 falló: ${s2.error?.message}`)
    svcA2 = s2.data.id

    const s3 = await seeded.admin
      .from('services')
      .insert({ business_id: seeded.bizB, name: '__test_svc_b', duration_minutes: 30, price: 100, active: true })
      .select('id')
      .single()
    if (s3.error || !s3.data) throw new Error(`seed: service B falló: ${s3.error?.message}`)
    svcB = s3.data.id

    // Franja de B + su mapeo: el estado que los ataques de A NO deben poder mover.
    const b1 = await seeded.admin
      .from('time_blocks')
      .insert({ business_id: seeded.bizB, day_of_week: 3, start_time: '08:00', end_time: '12:00' })
      .select('id')
      .single()
    if (b1.error || !b1.data) throw new Error(`seed: time_block B falló: ${b1.error?.message}`)
    blockB = b1.data.id

    const m1 = await seeded.admin
      .from('time_block_services')
      .insert({ business_id: seeded.bizB, time_block_id: blockB, service_id: svcB })
    if (m1.error) throw new Error(`seed: mapeo B falló: ${m1.error.message}`)
  })

  afterAll(async () => {
    if (seeded) await teardown(seeded)
  })

  // ── Helpers ────────────────────────────────────────────────────────────────────────────────
  // saveAs: la ÚNICA forma en que este archivo invoca la función. Siempre con un cliente
  // anon-key autenticado (nunca con el admin), porque el rol es parte de lo que se está probando.
  async function saveAs(client: SupabaseClient, businessId: string, blocks: BlockPayload[]) {
    return client.rpc('save_agenda_blocks', { p_business_id: businessId, p_blocks: blocks })
  }

  // Lecturas INDEPENDIENTES con service-role: verifican el EFECTO de la escritura por fuera del
  // camino que se está probando. No son aserciones de RLS (esas las hace saveAs con anon+sesión).
  async function readBlocks(businessId: string) {
    const { data, error } = await seeded.admin
      .from('time_blocks')
      .select('id, day_of_week, start_time, end_time, label, location_id')
      .eq('business_id', businessId)
      .order('start_time')
    if (error) throw new Error(`lectura independiente de time_blocks falló: ${error.message}`)
    return data ?? []
  }

  async function readBridge(businessId: string) {
    const { data, error } = await seeded.admin
      .from('time_block_services')
      .select('time_block_id, service_id')
      .eq('business_id', businessId)
    if (error) throw new Error(`lectura independiente de la puente falló: ${error.message}`)
    return data ?? []
  }

  // Estado que la cadena de casos 1→4 va arrastrando.
  let idConServicios = ''
  let idComodin = ''

  it('1. camino feliz: guarda dos franjas, una mapeada a dos servicios y otra comodín', async () => {
    // Si esto se pone rojo, la función directamente no escribe: AGENDA-05 no existe.
    const { data, error } = await saveAs(anonA, seeded.bizA, [
      { id: null, day_of_week: 1, start_time: '09:00', end_time: '13:00', label: 'Mañana', location_id: null, service_ids: [svcA1, svcA2] },
      { id: null, day_of_week: 1, start_time: '14:00', end_time: '18:00', label: null, location_id: null, service_ids: [] },
    ])
    expect(error).toBeNull()
    expect(data).toHaveLength(2)

    const rows = (data ?? []) as { id: string; start_time: string; service_ids: string[] }[]
    const conServicios = rows.find((r) => r.start_time.startsWith('09:00'))!
    const comodin = rows.find((r) => r.start_time.startsWith('14:00'))!

    expect(conServicios.id).toBeTruthy()
    expect(comodin.id).toBeTruthy()
    // La franja comodín vuelve con arreglo VACÍO, no con null: es lo que `SavedAgendaBlock` espera
    // y lo que hace que `buildDayStatesFromRows` no tenga que defenderse de un null.
    expect(comodin.service_ids).toEqual([])
    expect([...conServicios.service_ids].sort()).toEqual([svcA1, svcA2].sort())

    idConServicios = conServicios.id
    idComodin = comodin.id

    // Verificación independiente: la puente tiene exactamente 2 filas para A.
    const bridge = await readBridge(seeded.bizA)
    expect(bridge).toHaveLength(2)
    expect(bridge.every((r) => r.time_block_id === idConServicios)).toBe(true)
  })

  it('2. el mapeo SOBREVIVE al cambio de horario de la franja (D-01/D-02)', async () => {
    // ES EL CASO QUE JUSTIFICA LA FASE ENTERA. Si se pone rojo, volvimos al borrar-todo-e-insertar:
    // el dueño mueve una franja media hora y pierde en silencio los servicios que le había asignado,
    // y el estado al que cae (comodín) es visualmente idéntico a "todavía no lo configuré".
    const { data, error } = await saveAs(anonA, seeded.bizA, [
      { id: idConServicios, day_of_week: 1, start_time: '10:00', end_time: '13:30', label: 'Mañana', location_id: null, service_ids: [svcA1, svcA2] },
      { id: idComodin, day_of_week: 1, start_time: '14:00', end_time: '18:00', label: null, location_id: null, service_ids: [] },
    ])
    expect(error).toBeNull()

    const blocks = await readBlocks(seeded.bizA)
    const movida = blocks.find((b) => b.id === idConServicios)!
    // MISMO id (UPDATE, no DELETE+INSERT) y horas nuevas.
    expect(movida).toBeTruthy()
    expect(movida.start_time).toBe('10:00:00')
    expect(movida.end_time).toBe('13:30:00')

    // Y las MISMAS 2 filas de mapeo, intactas.
    const bridge = await readBridge(seeded.bizA)
    const suyas = bridge.filter((r) => r.time_block_id === idConServicios)
    expect(suyas).toHaveLength(2)
    expect(suyas.map((r) => r.service_id).sort()).toEqual([svcA1, svcA2].sort())

    // Y el retorno también lo refleja (el cliente re-deriva su estado de acá, P-01).
    const rows = (data ?? []) as { id: string; service_ids: string[] }[]
    expect([...rows.find((r) => r.id === idConServicios)!.service_ids].sort()).toEqual([svcA1, svcA2].sort())
  })

  it('3. volver a "cualquier servicio" BORRA las filas del mapeo (D-16/D-17)', async () => {
    // Si se pone rojo, apagar todos los chips deja la franja restringida a lo último que tuvo: el
    // dueño ve "Cualquier servicio" en pantalla y el público sigue viendo una franja acotada.
    const { data, error } = await saveAs(anonA, seeded.bizA, [
      { id: idConServicios, day_of_week: 1, start_time: '10:00', end_time: '13:30', label: 'Mañana', location_id: null, service_ids: [] },
      { id: idComodin, day_of_week: 1, start_time: '14:00', end_time: '18:00', label: null, location_id: null, service_ids: [] },
    ])
    expect(error).toBeNull()

    const bridge = await readBridge(seeded.bizA)
    expect(bridge.filter((r) => r.time_block_id === idConServicios)).toHaveLength(0)

    const rows = (data ?? []) as { id: string; service_ids: string[] }[]
    expect(rows.find((r) => r.id === idConServicios)!.service_ids).toEqual([])
  })

  it('4. el diff borra SOLO las franjas que salieron del payload, y su mapeo con ellas', async () => {
    // Si se pone rojo, o bien el guardado dejó de ser un diff (borra de más) o dejó de borrar
    // (el dueño elimina una franja de la grilla y reaparece al recargar).
    // Se le devuelven los servicios a la franja que queda para probar que su mapeo NO es daño
    // colateral del borrado de la otra.
    const restore = await saveAs(anonA, seeded.bizA, [
      { id: idConServicios, day_of_week: 1, start_time: '10:00', end_time: '13:30', label: 'Mañana', location_id: null, service_ids: [svcA1] },
      { id: idComodin, day_of_week: 1, start_time: '14:00', end_time: '18:00', label: null, location_id: null, service_ids: [svcA2] },
    ])
    expect(restore.error).toBeNull()
    expect(await readBridge(seeded.bizA)).toHaveLength(2)

    // Ahora se va la franja comodín: sólo viaja la otra.
    const { error } = await saveAs(anonA, seeded.bizA, [
      { id: idConServicios, day_of_week: 1, start_time: '10:00', end_time: '13:30', label: 'Mañana', location_id: null, service_ids: [svcA1] },
    ])
    expect(error).toBeNull()

    const blocks = await readBlocks(seeded.bizA)
    expect(blocks).toHaveLength(1)
    expect(blocks[0].id).toBe(idConServicios)

    // El mapeo de la franja borrada se fue por CASCADE; el de la que quedó sigue ahí.
    const bridge = await readBridge(seeded.bizA)
    expect(bridge).toHaveLength(1)
    expect(bridge[0]).toMatchObject({ time_block_id: idConServicios, service_id: svcA1 })
  })

  it('5. CROSS-TENANT por FRANJA AJENA: el payload con un time_block de B es rechazado', async () => {
    // Si se pone rojo, un dueño puede reescribir (o borrar, por el diff) los horarios de otro
    // negocio con sólo poner su id en el payload — y esos ids son PÚBLICOS (`public read
    // time_blocks` con USING(true)), así que el ataque es realizable desde el navegador.
    const antesA = await readBlocks(seeded.bizA)

    const { error } = await saveAs(anonA, seeded.bizA, [
      { id: idConServicios, day_of_week: 1, start_time: '10:00', end_time: '13:30', label: 'Mañana', location_id: null, service_ids: [svcA1] },
      { id: blockB, day_of_week: 3, start_time: '07:00', end_time: '23:00', label: 'secuestrada', location_id: null, service_ids: [] },
    ])
    expect(error).not.toBeNull()

    // La franja de B sigue intacta: mismas horas, misma etiqueta ausente, mismo mapeo.
    const blocksB = await readBlocks(seeded.bizB)
    expect(blocksB).toHaveLength(1)
    expect(blocksB[0]).toMatchObject({ id: blockB, day_of_week: 3, start_time: '08:00:00', end_time: '12:00:00' })
    const bridgeB = await readBridge(seeded.bizB)
    expect(bridgeB).toHaveLength(1)
    expect(bridgeB[0]).toMatchObject({ time_block_id: blockB, service_id: svcB })

    // Y A quedó exactamente como estaba (la llamada entera revirtió).
    expect(await readBlocks(seeded.bizA)).toEqual(antesA)
  })

  it('6. CROSS-TENANT por SERVICIO AJENO: mapear una franja propia a un service de B es rechazado', async () => {
    // La variante NO inerte: si se pone rojo, una franja propia queda "mapeada a un servicio que no
    // está en mi catálogo" y por la regla del comodín DEJA de ofrecer los míos — el negocio se queda
    // sin turnos en esa franja y no hay nada en pantalla que lo explique.
    // Lo rechaza la FK compuesta `tbs_service_same_tenant` (migr. 073), no la función.
    const { error } = await saveAs(anonA, seeded.bizA, [
      { id: idConServicios, day_of_week: 1, start_time: '10:00', end_time: '13:30', label: 'Mañana', location_id: null, service_ids: [svcB] },
    ])
    expect(error).not.toBeNull()

    // La franja de A no quedó mapeada al servicio ajeno: conserva SU mapeo previo, sin contaminar.
    const bridge = await readBridge(seeded.bizA)
    expect(bridge.some((r) => r.service_id === svcB)).toBe(false)
    expect(bridge).toHaveLength(1)
    expect(bridge[0]).toMatchObject({ time_block_id: idConServicios, service_id: svcA1 })
  })

  it('7. NEGOCIO AJENO: invocar la función con el p_business_id de B falla con not_your_business', async () => {
    // Si se pone rojo, el guard de autoría desapareció y el aislamiento depende de una sola capa.
    const { error } = await saveAs(anonA, seeded.bizB, [
      { id: null, day_of_week: 5, start_time: '09:00', end_time: '10:00', label: 'intruso', location_id: null, service_ids: [] },
    ])
    expect(error).not.toBeNull()
    expect(error?.message).toContain('not_your_business')

    // Nada de B cambió: ni una franja de más, ni el mapeo tocado.
    const blocksB = await readBlocks(seeded.bizB)
    expect(blocksB).toHaveLength(1)
    expect(blocksB[0].id).toBe(blockB)
    expect(await readBridge(seeded.bizB)).toHaveLength(1)
  })

  it('8. ATOMICIDAD (D-04): un elemento inválido al final revierte TODA la llamada', async () => {
    // Si se pone rojo, existe el guardado a medias: horarios nuevos con mapeo viejo, o el borrado
    // del diff aplicado sin la reinserción. Y ese estado intermedio lo VE el público por
    // /api/booking/availability. La aserción es sobre AUSENCIA de filas, no sobre el error.
    const antesBlocks = await readBlocks(seeded.bizA)
    const antesBridge = await readBridge(seeded.bizA)
    expect(antesBlocks).toHaveLength(1)
    expect(antesBridge).toHaveLength(1)

    const { error } = await saveAs(anonA, seeded.bizA, [
      { id: null, day_of_week: 2, start_time: '09:00', end_time: '12:00', label: 'valida 1', location_id: null, service_ids: [svcA1] },
      { id: null, day_of_week: 4, start_time: '15:00', end_time: '19:00', label: 'valida 2', location_id: null, service_ids: [svcA2] },
      { id: null, day_of_week: 6, start_time: '20:00', end_time: '20:00', label: 'invalida', location_id: null, service_ids: [] },
    ])
    expect(error).not.toBeNull()
    expect(error?.message).toContain('invalid_block')

    // NADA de esa llamada quedó: ni las dos franjas válidas ni sus mapeos. Y —lo más importante— el
    // DELETE del diff también revirtió: la franja preexistente, que NO venía en el payload y por lo
    // tanto estaba condenada, sigue ahí.
    const despuesBlocks = await readBlocks(seeded.bizA)
    expect(despuesBlocks).toEqual(antesBlocks)
    expect(despuesBlocks.some((b) => b.label === 'valida 1' || b.label === 'valida 2')).toBe(false)
    expect(await readBridge(seeded.bizA)).toEqual(antesBridge)
  })

  it('9. ROL ANÓNIMO: un cliente sin autenticar NO puede ejecutar la función (P-02 / T-19-05)', async () => {
    // Si se pone rojo, la anon key del bundle del navegador alcanza para reescribir la agenda de
    // cualquier negocio: sería una segunda RA-05, esta vez sobre la configuración del negocio.
    // El MENSAJE exacto depende de la versión de PostgREST —puede ser `permission denied for
    // function` (42501) o `Could not find the function` (PGRST202), según si el schema cache la
    // expone o no para ese rol— así que NO se compara textual: la aserción es que NO tiene éxito.
    const anonSinSesion = createClient(url, anonKey, { auth: { persistSession: false } })
    const sess = await anonSinSesion.auth.getSession()
    expect(sess.data.session).toBeNull() // guard: de verdad está sin autenticar

    const { data, error } = await saveAs(anonSinSesion, seeded.bizA, [
      { id: null, day_of_week: 0, start_time: '09:00', end_time: '10:00', label: 'anon', location_id: null, service_ids: [] },
    ])
    expect(error).not.toBeNull()
    expect(data).toBeNull()

    // Y no escribió nada, obviamente.
    const blocks = await readBlocks(seeded.bizA)
    expect(blocks.some((b) => b.label === 'anon')).toBe(false)
  })
})
