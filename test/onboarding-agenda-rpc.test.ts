import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { hasSupabaseCreds } from './env'
import { seedTwoTenants, teardown, type SeededTenants } from './helpers/supabase-fixtures'
import { buildOnboardingAgendaPayload } from '@/lib/onboarding-agenda'

// ── El camino del alta, de punta a punta, contra la base local (AGENDA-08, Phase 21) ────────────
//
// QUÉ SE CAE SI ESTE ARCHIVO SE PONE ROJO: el negocio de clases que en el alta declaró "los martes
// de 15 a 16 hago cerámica" sale del onboarding con esa franja abierta para TODO su catálogo — o
// peor, sin ningún horario, porque el RPC de la agenda es todo-o-nada y un mapeo que la base rechaza
// se lleva puestas también las franjas. Ninguna de las dos cosas da un error en pantalla: dan un
// dato plausible y equivocado, que es el modo de falla más caro de esta fase.
//
// LO QUE ESTE ARCHIVO PRUEBA Y NINGÚN TEST PURO PUEDE PROBAR: que `services.id` generado EN EL
// CLIENTE (D-09) es aceptado por la policy de INSERT de `services` bajo la sesión del dueño. Es la
// asunción A2 del RESEARCH y el único patrón sin precedente in-repo de la fase — no hay forma de
// cerrarla sin una base real.
//
// LA TRAMPA (misma que agenda-save-blocks-rpc.test.ts, Pitfall 12): las ASERCIONES usan SOLO el
// cliente anon-key AUTENTICADO como el dueño, nunca el service-role (que bypassa RLS y daría un
// falso verde). `seeded.admin` aparece exclusivamente para sembrar, limpiar y LEER de forma
// independiente el efecto de la escritura.
//
// ⚠ DOS servicios y no uno en el caso (a): con uno solo el test pasaría igual aunque el mapeo
// apuntara al servicio equivocado (Pitfall 1 — correlación por posición en vez de por id).

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

describe.skipIf(!hasSupabaseCreds)('onboarding → save_agenda_blocks: el mapeo declarado en el alta llega a la puente', () => {
  let seeded: SeededTenants
  // El ÚNICO cliente que escribe en las aserciones: anon-key + sesión del dueño ⇒ rol
  // `authenticated` y RLS aplicando como en producción (igual que el navegador del alta).
  let anonA: SupabaseClient
  // Los dos uuids que el "paso 2" del wizard generó en el cliente, antes de que la fila exista.
  let svcCorte: string
  let svcCeramica: string

  beforeAll(async () => {
    seeded = await seedTwoTenants()

    anonA = createClient(url, anonKey, { auth: { persistSession: false } })
    const signA = await anonA.auth.signInWithPassword({ email: seeded.emailA, password: seeded.password })
    if (signA.error) throw new Error(`signIn A falló: ${signA.error.message}`)

    // GUARD anti-falso-verde #1: si el cliente de aserción no tiene sesión anon autenticada,
    // fallamos RUIDOSAMENTE antes de correr una sola aserción.
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

    // ── El paso 2 del alta, tal cual lo hace el wizard ────────────────────────────────────────
    // Los ids salen del CLIENTE (D-09) y el insert va con la sesión del dueño, sin `.select()`.
    // Esto NO es sembrado: es la mitad del camino que se está probando.
    svcCorte = crypto.randomUUID()
    svcCeramica = crypto.randomUUID()
    const ins = await anonA.from('services').insert([
      { id: svcCorte, name: '__test_corte', duration_minutes: 30, price: 100, business_id: seeded.bizA },
      { id: svcCeramica, name: '__test_ceramica', duration_minutes: 60, price: 200, business_id: seeded.bizA },
    ])
    if (ins.error) throw new Error(`el insert de servicios con id del cliente falló (A2): ${ins.error.message}`)
  })

  afterAll(async () => {
    if (seeded) await teardown(seeded)
  })

  // Lectura INDEPENDIENTE con service-role: verifica el EFECTO de la escritura por fuera del camino
  // que se está probando. No es la aserción de RLS (esa la hace el RPC con anon + sesión).
  /** Las franjas del negocio, para poder probar que un rechazo NO se las lleva puestas. */
  async function readBlocks(businessId: string) {
    const { data, error } = await seeded.admin
      .from('time_blocks')
      .select('id, day_of_week')
      .eq('business_id', businessId)
    if (error) throw new Error(`lectura independiente de las franjas falló: ${error.message}`)
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

  /** El estado del paso 4 del wizard: lunes con cerámica declarada, martes en comodín. */
  function dayStatesDelAlta() {
    return [
      { enabled: false, blocks: [] },
      { enabled: true, blocks: [{ start_time: '15:00', end_time: '16:00', service_ids: [svcCeramica] }] },
      { enabled: true, blocks: [{ start_time: '09:00', end_time: '18:00', service_ids: [] }] },
      { enabled: false, blocks: [] },
      { enabled: false, blocks: [] },
      { enabled: false, blocks: [] },
      { enabled: false, blocks: [] },
    ]
  }

  it('a. el camino entero: lo declarado en el alta queda como fila real en time_block_services', async () => {
    const p_blocks = buildOnboardingAgendaPayload(dayStatesDelAlta(), {
      mapServices: true,
      liveServiceIds: [svcCorte, svcCeramica],
    })

    const { data, error } = await anonA.rpc('save_agenda_blocks', {
      p_business_id: seeded.bizA,
      p_blocks,
    })
    expect(error).toBeNull()
    expect(data).toHaveLength(2)

    const rows = (data ?? []) as { id: string; day_of_week: number; service_ids: string[] }[]
    const lunes = rows.find(r => r.day_of_week === 1)!
    const martes = rows.find(r => r.day_of_week === 2)!
    expect(lunes.service_ids).toEqual([svcCeramica])
    expect(martes.service_ids).toEqual([])

    // Verificación independiente: EXACTAMENTE una fila en la puente, y apunta al servicio que el
    // dueño eligió (no al otro: con un solo servicio este test pasaría cruzado, Pitfall 1).
    const bridge = await readBridge(seeded.bizA)
    expect(bridge).toHaveLength(1)
    expect(bridge[0]).toMatchObject({ time_block_id: lunes.id, service_id: svcCeramica })
    expect(bridge.some(r => r.service_id === svcCorte)).toBe(false)
  })

  it('b. toggle APAGADO al finalizar: las franjas se crean y la puente queda vacía (D-10)', async () => {
    // Mismo estado local, con el mapeo cargado: lo que cambia es sólo lo que la última pantalla le
    // estaba mostrando al dueño. Si esto se pone rojo, el alta persiste algo que nadie vio.
    const p_blocks = buildOnboardingAgendaPayload(dayStatesDelAlta(), {
      mapServices: false,
      liveServiceIds: [svcCorte, svcCeramica],
    })

    const { data, error } = await anonA.rpc('save_agenda_blocks', {
      p_business_id: seeded.bizA,
      p_blocks,
    })
    expect(error).toBeNull()
    expect(data).toHaveLength(2)

    expect(await readBridge(seeded.bizA)).toHaveLength(0)
  })

  it('c. backstop del servicio borrado: un id que ya no está vigente no viaja (Pitfall 7)', async () => {
    // Un servicio que el dueño borró en el paso 2 y cuyo id sobrevivió en el estado del bloque. Sin
    // el filtro, la FK compuesta `tbs_service_same_tenant` rebota con 23503 y el RPC —todo-o-nada—
    // revierte TAMBIÉN las franjas: el negocio sale del alta sin ningún horario.
    const borrado = crypto.randomUUID()
    const days = dayStatesDelAlta()
    days[1].blocks[0].service_ids = [borrado, svcCeramica]

    const p_blocks = buildOnboardingAgendaPayload(days, {
      mapServices: true,
      liveServiceIds: [svcCorte, svcCeramica],
    })
    expect(p_blocks[0].service_ids).toEqual([svcCeramica])

    const { error } = await anonA.rpc('save_agenda_blocks', {
      p_business_id: seeded.bizA,
      p_blocks,
    })
    expect(error).toBeNull()

    const bridge = await readBridge(seeded.bizA)
    expect(bridge).toHaveLength(1)
    expect(bridge[0].service_id).toBe(svcCeramica)
    expect(bridge.some(r => r.service_id === borrado)).toBe(false)
  })

  // ── La mitad NEGATIVA del backstop, que es la única que necesita una base (WR-06) ─────────────
  //
  // El caso (c) de arriba prueba que un payload válido se guarda bien. Eso NO prueba que el filtro
  // haga falta: prueba que lo válido es válido. La afirmación que el comentario de (c) hace —"sin el
  // filtro la FK compuesta rebota con 23503 y el RPC, todo-o-nada, revierte TAMBIÉN las franjas"—
  // no la ejercitaba nadie. Si mañana se cayera `tbs_service_same_tenant` (migr. 073), o el RPC
  // pasara a tragarse el error por fila en vez de abortar, la suite entera seguiría verde mientras
  // el alta escribe mapeos a servicios de otro negocio o de ninguno.
  //
  // Por eso este caso EVADE el filtro a propósito: manda el id fantasma crudo, como si el backstop
  // no existiera. Es el único caso de la fase que no se puede escribir sin base.
  it('c-bis. sin el filtro, el id fantasma rebota con 23503 y NO toca lo que ya estaba guardado', async () => {
    // El estado ANTES: lo que dejó el caso (c). Se lee en vez de asumirse, así que la aserción de
    // atomicidad no depende del orden en que corran los casos de arriba.
    const franjasAntes = await readBlocks(seeded.bizA)
    const puenteAntes = await readBridge(seeded.bizA)
    expect(franjasAntes.length).toBeGreaterThan(0) // si no hay nada guardado, no hay atomicidad que probar

    const fantasma = crypto.randomUUID()
    const days = dayStatesDelAlta()
    days[1].blocks[0].service_ids = [fantasma]
    // Se construye el payload SIN vigentes (el filtro lo vacía) y después se le vuelve a meter el id
    // a mano: así el payload que viaja es exactamente el que el alta mandaría si el backstop no
    // estuviera, y el rechazo que se mide es el de la BASE, no el del módulo puro.
    const crudo = buildOnboardingAgendaPayload(days, { mapServices: true, liveServiceIds: [] })
    expect(crudo[0].service_ids).toEqual([]) // el filtro hizo su trabajo…
    crudo[0].service_ids = [fantasma]        // …y acá lo evadimos a propósito

    const { error } = await anonA.rpc('save_agenda_blocks', {
      p_business_id: seeded.bizA,
      p_blocks: crudo,
    })

    // La FK compuesta rebota: el id no es un servicio de ESTE negocio (ni de ninguno).
    expect(error).not.toBeNull()
    expect(error?.code).toBe('23503')

    // Todo-o-nada: el rechazo no se llevó puestas las franjas que ya estaban. Esto es lo que el
    // backstop del módulo puro existe para evitar que pase en el alta de verdad — ahí no habría
    // nada guardado que salvar y el negocio saldría del wizard sin un solo horario.
    expect(await readBlocks(seeded.bizA)).toHaveLength(franjasAntes.length)
    expect(await readBridge(seeded.bizA)).toHaveLength(puenteAntes.length)
    const puenteDespues = await readBridge(seeded.bizA)
    expect(puenteDespues.some(r => r.service_id === fantasma)).toBe(false)
  })
})
