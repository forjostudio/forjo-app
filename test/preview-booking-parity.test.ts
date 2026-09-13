import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { hasSupabaseCreds } from './env'
import {
  seedOneTenant,
  teardownOneTenant,
  seedService,
  seedProfessional,
  seedTimeBlock,
  seedTimeBlockService,
  seedProfessionalService,
  type SeededTenant,
} from './helpers/booking-fixtures'
import { provisionCancha, setCanchaActive } from '@/lib/canchas'
import { previewBookingInputs } from '@/lib/preview-booking'
import { isServiceScheduled } from '@/lib/time-block-services'
import type { Professional, ProfessionalService, PublicCancha, Service, TimeBlockService } from '@/lib/types'

// ── El PIN de la paridad preview ↔ página pública (quick 260913-3tv) ─────────────────────────────
//
// `lib/preview-booking.ts` REPRODUCE los WHERE de las vistas acotadas del público sobre las tablas
// base, porque el dashboard no puede leer esas vistas (son DEFINER, sin security_invoker: leerlas
// desde una superficie autenticada dejaría el aislamiento por tenant colgado de una sola capa). El
// riesgo obvio de reproducir una definición SQL en TypeScript es quedar desfasado en silencio el día
// que la vista cambie su WHERE o su proyección. Este archivo es el que lo impide: compara la
// derivación contra lo que las vistas devuelven DE VERDAD.
//
// POR QUÉ CONTRA LA DB Y CON DOS ROLES DISTINTOS. Los casos puros de la regla ya están en
// `test/preview-booking.test.ts`. Lo que ESTE archivo agrega es la capa de abajo, y la agrega por los
// DOS caminos de lectura reales, que son roles distintos a propósito:
//   · el camino del PÚBLICO → cliente **anon SIN sesión** leyendo las vistas `public_*`.
//   · el camino del PREVIEW → cliente **anon-key AUTENTICADO como el dueño** leyendo las tablas base
//     con RLS activa, igual que `app/(dashboard)/web/page.tsx`.
// Deliberadamente NO se lee con `t.admin` para asertar: el service-role bypassa RLS y haría pasar los
// casos aunque las policies estuvieran mal, que es exactamente el modo de falla que hay que cazar
// (mismo criterio que `test/schedule-coverage-public.test.ts`).
//
// Los 3 casos, y cada uno asserta PRIMERO que la lectura trajo filas: un `[]` inesperado (RLS que
// devuelve 0 filas en silencio, que es lo que hace cuando una policy falta — no tira error) es
// INDISTINGUIBLE de una proyección correcta.
//   1. paridad de CANCHAS: deep-equal de las 5 columnas contra `public_canchas`.
//   2. paridad de SERVICIOS y STAFF: conjuntos de `id` (la tabla base trae columnas que la vista no
//      expone, y eso es correcto), más el assert de que la agenda-cancha NO es staff por ninguno de
//      los dos caminos.
//   3. las dos PUENTES LLEGAN con la sesión del dueño. Es el caso que prueba la decisión de diseño:
//      si la policy de SELECT por tenant no alcanzara, la RLS devolvería 0 filas EN SILENCIO y el
//      preview volvería a ver comodín (todo habilitado) sin que nada se queje.
//
// describe.skipIf(!hasSupabaseCreds): sin las 3 creds de Supabase se skipea (igual que el resto de la suite).

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

describe.skipIf(!hasSupabaseCreds)('paridad preview ↔ vistas públicas (quick 260913-3tv)', () => {
  let t: SeededTenant
  // ownerAnon: cliente anon-key AUTENTICADO como el dueño → corre con RLS como el RSC del dashboard.
  let ownerAnon: SupabaseClient
  let canchaOnId: string // agenda de la cancha ACTIVA (sale en public_canchas)
  let canchaOffId: string // agenda de la cancha soft-deleteada (las DOS mitades en active=false)
  let canchaSvcOffId: string // agenda ACTIVA cuyo service está apagado → la mitad `s.active` del JOIN
  let svcOffId: string // servicio extra DESACTIVADO
  let proOffId: string // profesional extra DESACTIVADO
  let svcHuerfanoId: string // servicio activo que NINGUNA franja da
  let blockId: string // la única franja del negocio

  beforeAll(async () => {
    t = await seedOneTenant({ bufferMinutes: 0, serviceDurationMinutes: 30 })
    const run = crypto.randomUUID().slice(0, 8)

    // Dos canchas: una queda activa, la otra se soft-deletea (setCanchaActive apaga service Y
    // professional, que es lo que hace el panel). La segunda ejercita las DOS mitades del WHERE del
    // JOIN de `public_canchas`.
    const on = await provisionCancha(t.admin, t.businessId, { name: `__test_cancha_on_${run}`, price: 8500, duration: 90 })
    if (!on.ok) throw new Error(`seed: provisionCancha (activa) falló: ${on.error}`)
    canchaOnId = on.professional.id

    const off = await provisionCancha(t.admin, t.businessId, { name: `__test_cancha_off_${run}`, price: 7000, duration: 60 })
    if (!off.ok) throw new Error(`seed: provisionCancha (desactivada) falló: ${off.error}`)
    canchaOffId = off.professional.id
    const apagada = await setCanchaActive(
      t.admin,
      t.businessId,
      { service: off.service, professional: off.professional, spaceIds: off.spaceIds },
      false,
    )
    if (!apagada.ok) throw new Error(`seed: setCanchaActive(false) falló: ${apagada.error}`)

    // Una TERCERA cancha ASIMÉTRICA: agenda activa, service apagado. NO es adorno — es lo que hace
    // que este caso pueda FALLAR por la mitad `s.active` del WHERE del JOIN. Con sólo las dos canchas
    // de arriba (una entera activa, la otra con las DOS mitades apagadas) una derivación que se
    // olvidara de chequear `service.active` seguiría dando el mismo resultado, y el pin pasaría sin
    // pinchar nada — verificado mutando `lib/preview-booking.ts` al escribir este archivo. El estado
    // es alcanzable en producción: un soft-delete a medias (setCanchaActive hace DOS updates sin
    // transacción) o un service desactivado desde otra pantalla.
    const medio = await provisionCancha(t.admin, t.businessId, { name: `__test_cancha_svcoff_${run}`, price: 6000, duration: 45 })
    if (!medio.ok) throw new Error(`seed: provisionCancha (service off) falló: ${medio.error}`)
    canchaSvcOffId = medio.professional.id
    const updCanchaSvc = await t.admin.from('services').update({ active: false }).eq('id', medio.service.id)
    if (updCanchaSvc.error) throw new Error(`seed: desactivar service de cancha falló: ${updCanchaSvc.error.message}`)

    // Un servicio y un profesional extra, los dos DESACTIVADOS: el eje `active` de las dos vistas.
    svcOffId = await seedService(t, { name: `__test_svc_off_${run}` })
    const updSvc = await t.admin.from('services').update({ active: false }).eq('id', svcOffId)
    if (updSvc.error) throw new Error(`seed: desactivar service falló: ${updSvc.error.message}`)

    proOffId = await seedProfessional(t, { name: `__test_pro_off_${run}` })
    const updPro = await t.admin.from('professionals').update({ active: false }).eq('id', proOffId)
    if (updPro.error) throw new Error(`seed: desactivar professional falló: ${updPro.error.message}`)

    // Un servicio activo que ninguna franja da: el que el caso 3 usa para ver que la puente MUERDE.
    svcHuerfanoId = await seedService(t, { name: `__test_svc_huerfano_${run}` })

    // La franja + los dos mapeos. Sembrar UNA fila saca a la franja del modo comodín.
    blockId = await seedTimeBlock(t)
    await seedTimeBlockService(t, { timeBlockId: blockId, serviceId: t.serviceId })
    await seedProfessionalService(t, { professionalId: t.professionalId, serviceId: t.serviceId })

    // Sesión anon autenticada como el dueño (molde manual-client.test.ts).
    ownerAnon = createClient(url, anonKey, { auth: { persistSession: false } })
    const sign = await ownerAnon.auth.signInWithPassword({ email: t.email, password: t.password })
    if (sign.error) throw new Error(`signIn dueño falló: ${sign.error.message}`)

    // GUARD anti-falso-verde: la sesión de aserción DEBE ser anon autenticada, nunca service-role.
    const sess = await ownerAnon.auth.getSession()
    if (!sess.data.session?.access_token) {
      throw new Error('GUARD: el cliente del dueño no tiene sesión anon autenticada')
    }
    if (anonKey === process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('GUARD: ANON_KEY == SERVICE_ROLE_KEY — config rota')
    }
  })

  afterAll(async () => {
    if (t) await teardownOneTenant(t)
  })

  // Cliente anon SIN sesión: el rol `anon` puro, el que atiende la página pública de reservas.
  const anonPublic = () => createClient(url, anonKey, { auth: { persistSession: false } })

  /** Lo que el PREVIEW lee: tablas base con la sesión del dueño (RLS + filtro explícito). */
  async function readOwnerCatalog(): Promise<{ services: Service[]; professionals: Professional[] }> {
    const [svcRes, proRes] = await Promise.all([
      ownerAnon.from('services').select('*').eq('business_id', t.businessId),
      ownerAnon.from('professionals').select('*').eq('business_id', t.businessId),
    ])
    expect(svcRes.error).toBeNull()
    expect(proRes.error).toBeNull()
    return {
      services: (svcRes.data || []) as Service[],
      professionals: (proRes.data || []) as Professional[],
    }
  }

  // (1) — Paridad de CANCHAS: la derivación vs. la vista REAL, columna por columna.
  it('(1) la derivación de canchas es byte-igual a lo que devuelve public_canchas', async () => {
    const pub = anonPublic()
    const viewRes = await pub.from('public_canchas').select('*').eq('business_id', t.businessId)
    expect(viewRes.error).toBeNull()
    const fromView = ((viewRes.data || []) as PublicCancha[]).slice().sort((a, b) => a.id.localeCompare(b.id))

    // El dato LLEGÓ: sin esto, dos listas vacías "coincidirían" y el caso pasaría sin probar nada.
    expect(fromView.length).toBe(1)
    expect(fromView[0].id).toBe(canchaOnId)

    const catalog = await readOwnerCatalog()
    expect(catalog.services.length).toBeGreaterThan(0)
    expect(catalog.professionals.length).toBeGreaterThan(0)
    const derived = previewBookingInputs(catalog).canchas.slice().sort((a, b) => a.id.localeCompare(b.id))

    // Deep-equal de las 5 columnas: si mañana la vista cambia su WHERE o su proyección, ESTE assert
    // se cae en vez de dejar al preview mostrando otra cosa que la web pública.
    expect(derived).toEqual(fromView)
    // Y las dos canchas que el JOIN excluye no están por ninguno de los dos caminos: la
    // soft-deleteada (las dos mitades apagadas) y la ASIMÉTRICA (agenda activa, service apagado),
    // que es la que prueba la mitad `s.active` del WHERE.
    expect(derived.map((c) => c.id)).not.toContain(canchaOffId)
    expect(derived.map((c) => c.id)).not.toContain(canchaSvcOffId)
    expect(fromView.map((c) => c.id)).not.toContain(canchaSvcOffId)
  })

  // (2) — Paridad de SERVICIOS y STAFF por conjuntos de `id`.
  it('(2) los sets de servicios y de staff coinciden con public_services / public_professionals', async () => {
    const pub = anonPublic()
    const [svcView, proView] = await Promise.all([
      pub.from('public_services').select('id').eq('business_id', t.businessId),
      pub.from('public_professionals').select('id').eq('business_id', t.businessId),
    ])
    expect(svcView.error).toBeNull()
    expect(proView.error).toBeNull()
    const svcIdsView = ((svcView.data || []) as { id: string }[]).map((r) => r.id).sort()
    const proIdsView = ((proView.data || []) as { id: string }[]).map((r) => r.id).sort()

    // El dato LLEGÓ (y el eje `active` de las dos vistas efectivamente mordió).
    expect(svcIdsView.length).toBeGreaterThan(0)
    expect(proIdsView.length).toBeGreaterThan(0)
    expect(svcIdsView).not.toContain(svcOffId)
    expect(proIdsView).not.toContain(proOffId)

    const derived = previewBookingInputs(await readOwnerCatalog())
    expect(derived.services.map((s) => s.id).sort()).toEqual(svcIdsView)
    expect(derived.professionals.map((p) => p.id).sort()).toEqual(proIdsView)

    // La agenda-cancha ACTIVA no es staff reservable por NINGUNO de los dos caminos (migr. 060): si
    // la derivación se olvidara del `service_id IS NULL`, el preview ofrecería "Cancha 1" como
    // profesional.
    expect(proIdsView).not.toContain(canchaOnId)
    expect(derived.professionals.map((p) => p.id)).not.toContain(canchaOnId)
  })

  // (3) — Las dos PUENTES llegan con la sesión del dueño (tabla base + RLS), no vacías.
  it('(3) las dos puentes llegan por la sesión del dueño y dan la misma respuesta que las vistas', async () => {
    const pub = anonPublic()
    const [psOwner, tbsOwner, blocksOwner, psView, tbsView] = await Promise.all([
      ownerAnon
        .from('professional_services')
        .select('business_id, professional_id, service_id')
        .eq('business_id', t.businessId),
      ownerAnon
        .from('time_block_services')
        .select('business_id, time_block_id, service_id')
        .eq('business_id', t.businessId),
      ownerAnon.from('time_blocks').select('id').eq('business_id', t.businessId),
      pub.from('public_professional_services').select('*').eq('business_id', t.businessId),
      pub.from('public_time_block_services').select('*').eq('business_id', t.businessId),
    ])
    for (const res of [psOwner, tbsOwner, blocksOwner, psView, tbsView]) expect(res.error).toBeNull()

    const bridgeStaffOwner = (psOwner.data || []) as ProfessionalService[]
    const bridgeSchedOwner = (tbsOwner.data || []) as TimeBlockService[]
    const bridgeSchedView = (tbsView.data || []) as TimeBlockService[]
    const blocks = (blocksOwner.data || []) as { id: string }[]

    // LA CANTIDAD, antes de cualquier regla. Si la policy `professional_services tenant select`
    // (migr. 057) o `time_block_services tenant select` (migr. 071) no alcanzaran, acá habría 0 filas
    // SIN error: la puente se vería vacía, la regla del comodín diría "todo habilitado" y el preview
    // volvería a mentir exactamente como antes de este quick.
    expect(bridgeStaffOwner.length).toBe(1)
    expect(bridgeStaffOwner[0].professional_id).toBe(t.professionalId)
    expect(bridgeStaffOwner[0].service_id).toBe(t.serviceId)
    expect(bridgeSchedOwner.length).toBe(1)
    expect(bridgeSchedOwner[0].time_block_id).toBe(blockId)
    expect(bridgeSchedOwner[0].service_id).toBe(t.serviceId)
    expect(blocks.length).toBe(1)

    // Las dos puentes públicas son proyecciones SIN WHERE: base y vista devuelven las MISMAS filas
    // para el mismo tenant. Esa es la premisa que autoriza a leer la base en el dashboard.
    expect(((psView.data || []) as ProfessionalService[]).length).toBe(bridgeStaffOwner.length)
    expect(bridgeSchedView.length).toBe(bridgeSchedOwner.length)

    // Y por lo tanto la MISMA respuesta del mismo helper, leído por los dos caminos: el servicio
    // mapeado está agendado, el huérfano no.
    expect(isServiceScheduled(t.serviceId, blocks, bridgeSchedOwner)).toBe(true)
    expect(isServiceScheduled(svcHuerfanoId, blocks, bridgeSchedOwner)).toBe(false)
    expect(isServiceScheduled(t.serviceId, blocks, bridgeSchedView)).toBe(
      isServiceScheduled(t.serviceId, blocks, bridgeSchedOwner),
    )
    expect(isServiceScheduled(svcHuerfanoId, blocks, bridgeSchedView)).toBe(
      isServiceScheduled(svcHuerfanoId, blocks, bridgeSchedOwner),
    )
  })
})
