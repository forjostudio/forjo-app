import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { hasSupabaseCreds } from './env'
import {
  seedOneTenant,
  teardownOneTenant,
  seedService,
  seedTimeBlock,
  seedTimeBlockService,
  type SeededTenant,
} from './helpers/booking-fixtures'
import { isServiceScheduled } from '@/lib/time-block-services'
import type { TimeBlockService } from '@/lib/types'

// ── Cobertura de FRANJAS en la reserva pública — Phase 20 (AGENDA-07, eje franja) ────────────────
//
// El espejo de `test/service-coverage-public.test.ts`, que cubre el eje STAFF. Acá se cubre el otro
// eje del mismo selector: un servicio que NINGUNA franja horaria da no tiene horarios que ofrecer, y
// el público tiene que enterarse en el paso 1 (D-02) en vez de recorrer pasos para chocarse con una
// grilla vacía.
//
// QUÉ VERIFICA Y POR QUÉ CONTRA LA DB. La regla del comodín ya está testeada como función pura
// (`test/time-block-services.test.ts`). Lo que ESTE archivo agrega es la capa de abajo: que el dato
// LLEGUE, por la MISMA ruta que usa `app/[slug]/page.tsx` — la vista acotada
// `public_time_block_services` (migr. 071 §3) leída con la **anon key y SIN sesión**. Por eso no se
// usa `t.admin` para leer: el service-role bypassa RLS y haría pasar el test aunque la vista tuviera
// los permisos mal aplicados, que es exactamente el modo de falla que hay que cazar.
//
// Los permisos en sí (que anon NO pueda escribir la vista ni la tabla base, y SÍ pueda leerla) ya se
// asertan en `test/isolation.test.ts` (describe 'agenda por servicio'). Acá se da por hecho eso y se
// prueba lo de encima: aplicar `isServiceScheduled` sobre lo que devuelve esa lectura.
//
// Los 2 casos:
//   (a) con la franja mapeada a svc1 → svc1 agendado; svc2 (huérfano, ninguna franja lo da) NO.
//   (b) puente VACÍA (comodín) → los DOS agendados. Es el control de no-regresión del D-02 del
//       milestone: el día de la migración nadie tiene filas, así que nada puede cambiar de
//       comportamiento. Sin este caso, un bug que devolviera `false` para todo pasaría el caso (a)
//       a medias y apagaría el catálogo entero de todos los negocios que no configuraron nada.
//
// ⚠ El caso (a) es el que de verdad muerde: si por error se leyera la tabla base
// `time_block_services` en vez de la vista con el cliente anon, la RLS devolvería 0 filas EN SILENCIO
// (no un error), la puente se vería vacía y todo parecería comodín. Por eso el caso asierta la
// CANTIDAD de filas leídas antes de mirar la regla — un `[]` inesperado se denuncia solo.
//
// describe.skipIf(!hasSupabaseCreds): sin las 3 creds de Supabase se skipea (igual que el resto de la suite).

describe.skipIf(!hasSupabaseCreds)('cobertura de franjas en la reserva pública (AGENDA-07, eje franja)', () => {
  let t: SeededTenant
  let svc2: string // 2º servicio del negocio: el HUÉRFANO, sin ninguna franja que lo dé
  let blockId: string // la única franja del negocio

  beforeAll(async () => {
    // El seed deja 1 servicio (t.serviceId) + 1 profesional; el staff no juega en este archivo.
    t = await seedOneTenant({ bufferMinutes: 0, serviceDurationMinutes: 30 })
    svc2 = await seedService(t, { name: `__test_svc_huerfano_${crypto.randomUUID().slice(0, 8)}` })
    // Los defaults alcanzan (lunes 08:00-20:00): a este archivo no le importa CUÁNDO abre la franja,
    // sino QUÉ servicios declara. La ventana horaria la ejercitan los tests de disponibilidad.
    blockId = await seedTimeBlock(t)
  })

  afterAll(async () => {
    if (t) await teardownOneTenant(t)
  })

  // Estado inicial reproducible entre casos: puente vacía = todas las franjas comodín.
  afterEach(async () => {
    if (!t) return
    await t.admin.from('time_block_services').delete().eq('business_id', t.businessId)
  })

  // Cliente anon SIN sesión: el rol `anon` puro, el que atiende la página pública de reservas. Mismo
  // patrón que `anonPublic()` en test/isolation.test.ts. Deliberadamente NO es `t.admin`.
  const anonPublic = () =>
    createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false },
    })

  // Lee lo MISMO que el RSC público, por la MISMA ruta y con el MISMO rol: `time_blocks` (tabla base,
  // tiene policy `public read`) y `public_time_block_services` (la vista acotada). Las dos acotadas
  // por tenant con `.eq('business_id', ...)`, como manda el contrato D-16 (el caller filtra, no el
  // módulo puro). Los `error` se asertan acá: un fallo de permisos que devolviera `[]` en silencio
  // haría pasar el caso (b) por el motivo equivocado.
  async function readPublicSchedule(): Promise<{ blocks: { id: string }[]; bridge: TimeBlockService[] }> {
    const pub = anonPublic()
    const [blocksRes, bridgeRes] = await Promise.all([
      pub.from('time_blocks').select('id, start_time, end_time').eq('business_id', t.businessId),
      pub.from('public_time_block_services').select('*').eq('business_id', t.businessId),
    ])
    expect(blocksRes.error).toBeNull()
    expect(bridgeRes.error).toBeNull()
    return {
      blocks: (blocksRes.data || []) as { id: string }[],
      bridge: (bridgeRes.data || []) as TimeBlockService[],
    }
  }

  // (a) — con la franja mapeada, el servicio huérfano deja de estar agendado.
  // La única franja queda mapeada SOLO a svc1 (t.serviceId) → deja de ser comodín; svc2 se queda sin
  // ninguna franja que lo dé, que es el estado que el paso 1 tiene que explicar en vez de esconder.
  it('(a) un servicio que ninguna franja da NO está agendado (leído por la vista con anon key)', async () => {
    await seedTimeBlockService(t, { timeBlockId: blockId, serviceId: t.serviceId })

    const { blocks, bridge } = await readPublicSchedule()
    // El dato LLEGÓ por la ruta pública: sin esto, un 0-filas silencioso (RLS de la tabla base) se
    // vería igual que el comodín y el caso pasaría sin probar nada.
    expect(blocks.length).toBe(1)
    expect(bridge.length).toBe(1)
    expect(bridge[0].service_id).toBe(t.serviceId)

    expect(isServiceScheduled(t.serviceId, blocks, bridge)).toBe(true) // mapeado → se ofrece
    expect(isServiceScheduled(svc2, blocks, bridge)).toBe(false) // huérfano → sin horarios
  })

  // (b) — modo comodín (puente vacía): TODOS los servicios agendados. Control de no-regresión (D-02).
  it('(b) con la puente vacía (comodín) todos los servicios están agendados', async () => {
    const { blocks, bridge } = await readPublicSchedule()
    expect(blocks.length).toBe(1)
    expect(bridge.length).toBe(0) // el afterEach dejó el estado comodín

    expect(isServiceScheduled(t.serviceId, blocks, bridge)).toBe(true)
    expect(isServiceScheduled(svc2, blocks, bridge)).toBe(true)
  })
})
