import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { NextRequest } from 'next/server'
import { hasSupabaseCreds } from './env'
import { seedOneTenant, teardownOneTenant, type SeededTenant } from './helpers/booking-fixtures'

// ── Tests a nivel RUTA del LINK DE BAJA on-demand (POLISH-06 / D-08, D-09) ──────────────────────
//
// QUÉ PRUEBA ESTE ARCHIVO: el CONTRATO de `GET /api/abonos/cancel-link/[id]`, la única superficie que
// entrega la credencial de baja de una serie al dueño. En concreto:
//   - Que una serie DADA DE BAJA (`status = 'cancelled'`) ya NO entrega su link (D-09 / T-14-07). El
//     token no rota ni vence: repartir el de una serie muerta deja suelta una llave permanente que no
//     sirve para nada legítimo.
//   - Que ese rechazo es INDISTINGUIBLE del de una serie de otro negocio (T-14-08). Es el invariante
//     estrella del archivo y está asertado CRUZADO (caso 5): cuerpo contra cuerpo y status contra
//     status, no cada uno contra un literal. Si alguien inventa un código propio para la serie muerta
//     (`series_cancelled`, `410 Gone`, …) el endpoint pasa a ser un ORÁCULO DE EXISTENCIA y ese test
//     rompe.
//   - Que el corte NO se pasa de largo: una serie `completed` (ya asignó sus N sesiones) puede tener
//     turnos por delante y su cliente sigue necesitando la vía de baja (T-14-11). Cerrarla de más
//     dejaría a un cliente con turnos vivos sin forma de darse de baja solo.
//   - Que el 401 de sesión ausente sigue siendo el ÚNICO código distinto del handler.
//
// QUÉ **NO** PRUEBA (y dónde vive):
//   - Las dos vías de BAJA propiamente dichas (pública por token y panel) → `abono-cancel-routes.test.ts`.
//   - El efecto de la baja sobre los turnos → `test/abono-cancel.test.ts`.
//   - Que la UI oculte el botón en una serie cancelada (D-08): eso es CORTESÍA, no control. La
//     autoridad es este endpoint y es lo que se testea acá.
//
// CÓMO CORRE. Contra el Supabase LOCAL con fixtures y teardown, igual que el resto de la suite; sin las
// tres credenciales skipea limpio (`describe.skipIf(!hasSupabaseCreds)`).
//
// POR QUÉ SÓLO UN MOCK. A diferencia de `abono-cancel-routes.test.ts`, este handler no despacha
// efectos: no manda mails, no encola nada en `after()` y NO usa el cliente admin (el service-role está
// PROHIBIDO en esta ruta). Alcanza con mockear `@/lib/supabase/server` para entregarle el cliente
// anon+RLS que arma cada caso — sin mock parcial de `next/server`, sin spies de email, sin secrets.

const h = vi.hoisted(() => ({
  // Cliente que devuelve `@/lib/supabase/server`: el logueado como el dueño o el anon SIN sesión.
  session: { current: null as SupabaseClient | null },
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => h.session.current,
}))

import { GET as cancelLink } from '@/app/api/abonos/cancel-link/[id]/route'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Segundo argumento del handler tal como se lo pasa Next 16: `params` es una Promise.
function ctx(id: string) {
  return { params: Promise.resolve({ id }) }
}

function req(): NextRequest {
  return new Request('http://localhost/api/abonos/cancel-link/x', { method: 'GET' }) as unknown as NextRequest
}

async function seedClient(tenant: SeededTenant, email: string): Promise<string> {
  const ins = await tenant.admin
    .from('clients')
    .insert({ business_id: tenant.businessId, name: 'Cliente Abono', phone: '1122334455', email })
    .select('id')
    .single()
  if (ins.error || !ins.data) throw new Error(`seed client: ${ins.error?.message}`)
  return ins.data.id as string
}

// Siembra una serie con su estado EXPLÍCITO: los tres estados del CHECK de la migr. 054 se ejercitan
// acá y el gate del endpoint corta exactamente por uno de ellos.
async function seedAbono(
  tenant: SeededTenant,
  clientId: string,
  startTime: string,
  status: 'active' | 'completed' | 'cancelled',
): Promise<{ id: string; token: string }> {
  const ins = await tenant.admin
    .from('abonos')
    .insert({
      business_id: tenant.businessId,
      client_id: clientId,
      service_id: tenant.serviceId,
      professional_id: tenant.professionalId,
      location_id: tenant.locationId,
      day_of_week: 1,
      start_time: startTime,
      status,
      cancelled_at: status === 'cancelled' ? new Date().toISOString() : null,
    })
    .select('id, cancel_token')
    .single()
  if (ins.error || !ins.data) throw new Error(`seed abono (${status}): ${ins.error?.message}`)
  return { id: ins.data.id as string, token: ins.data.cancel_token as string }
}

describe.skipIf(!hasSupabaseCreds)('GET /api/abonos/cancel-link/[id] — link de baja on-demand (POLISH-06)', () => {
  let own: SeededTenant
  let other: SeededTenant
  let activo: { id: string; token: string }
  let completada: { id: string; token: string }
  let cancelada: { id: string; token: string }
  let ajena: { id: string; token: string }
  // Cliente anon autenticado como el dueño de `own`: el que corre todas las aserciones.
  let ownedSession: SupabaseClient
  // Cliente anon SIN login: el caso 401.
  let noSession: SupabaseClient

  beforeAll(async () => {
    own = await seedOneTenant({ bufferMinutes: 0, serviceDurationMinutes: 30 })
    other = await seedOneTenant({ bufferMinutes: 0, serviceDurationMinutes: 30 })

    const ownClient = await seedClient(own, 'link-own@test.com')
    activo = await seedAbono(own, ownClient, '10:00', 'active')
    completada = await seedAbono(own, ownClient, '11:00', 'completed')
    cancelada = await seedAbono(own, ownClient, '12:00', 'cancelled')
    ajena = await seedAbono(other, await seedClient(other, 'link-other@test.com'), '10:00', 'active')

    ownedSession = createClient(url, anonKey, { auth: { persistSession: false } })
    noSession = createClient(url, anonKey, { auth: { persistSession: false } })

    const sign = await ownedSession.auth.signInWithPassword({ email: own.email, password: own.password })
    if (sign.error) throw new Error(`signIn dueño falló: ${sign.error.message}`)

    // GUARD anti-falso-verde (patrón de test/isolation.test.ts): si el cliente de aserción quedara sin
    // sesión, el handler devolvería 401 en TODOS los casos y los 404 del gate serían un falso verde.
    const sess = await ownedSession.auth.getSession()
    if (!sess.data.session?.access_token) {
      throw new Error('GUARD: el cliente del endpoint NO tiene sesión anon autenticada (no usar service-role)')
    }
    // GUARD de config: si la anon key fuera la service-role, estaríamos testeando un bypass de RLS y
    // el aislamiento del caso ajeno no probaría nada.
    if (anonKey === process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('GUARD: NEXT_PUBLIC_SUPABASE_ANON_KEY == SUPABASE_SERVICE_ROLE_KEY — config rota, abortar')
    }
  })

  afterAll(async () => {
    if (own) await teardownOneTenant(own)
    if (other) await teardownOneTenant(other)
  })

  beforeEach(() => {
    h.session.current = ownedSession
  })

  // (1) Camino feliz: la serie viva entrega su link. Es el contrapeso de todo lo demás — si esto
  // fallara, los 404 de abajo podrían venir de cualquier lado y no del gate.
  it('1 — una serie activa del propio negocio devuelve 200 con la url del link de baja', async () => {
    const res = await cancelLink(req(), ctx(activo.id))
    const body = (await res.json()) as { ok: boolean; url?: string }

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.url).toContain(`/abono/cancelar/${activo.token}`)
  })

  // (2) CONTRAPESO DE D-09: el gate corta SOLO por 'cancelled'. Una serie 'completed' ya asignó sus N
  // sesiones, pero esos turnos pueden estar todos por delante: su cliente sigue necesitando la vía de
  // baja y el dueño sigue necesitando poder mandársela (T-14-11). Cerrar de más sería peor que no
  // cerrar nada.
  it('2 — una serie completed del propio negocio SIGUE entregando su link (T-14-11)', async () => {
    const res = await cancelLink(req(), ctx(completada.id))
    const body = (await res.json()) as { ok: boolean; url?: string }

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.url).toContain(`/abono/cancelar/${completada.token}`)
  })

  // (3) EL GATE (D-09 / T-14-07). La credencial no rota ni vence: una serie terminal no tiene ningún
  // uso legítimo para ella. El `.neq` vive dentro de la query, así que la fila ni siquiera se lee.
  it('3 — una serie dada de baja NO entrega su link: 404 genérico (D-09)', async () => {
    const res = await cancelLink(req(), ctx(cancelada.id))
    const body = (await res.json()) as { ok: boolean; error?: string; url?: string }

    expect(res.status).toBe(404)
    expect(body).toEqual({ ok: false, error: 'not_found' })
    // Nada del token puede haberse filtrado por otra vía en el cuerpo.
    expect(JSON.stringify(body)).not.toContain(cancelada.token)
  })

  // (4) Aislamiento por tenant: el id ajeno es válido y existe, pero el negocio se resuelve por
  // owner_id del actor y la query está doblemente scopeada (D-22/D-23, T-14-09).
  it('4 — el id de una serie de OTRO negocio devuelve 404 genérico', async () => {
    const res = await cancelLink(req(), ctx(ajena.id))
    const body = (await res.json()) as { ok: boolean; error?: string }

    expect(res.status).toBe(404)
    expect(body).toEqual({ ok: false, error: 'not_found' })
    expect(JSON.stringify(body)).not.toContain(ajena.token)
  })

  // (5) EL TEST QUE IMPORTA (T-14-08). No alcanza con que los dos den 404 contra un literal: se comparan
  // CRUZADOS, cuerpo contra cuerpo y status contra status. Si mañana alguien agrega un código propio
  // para la serie muerta, el endpoint pasa a revelar que esa serie EXISTE y es del negocio del actor
  // —un oráculo de existencia— y este test rompe.
  it('5 — la respuesta de la serie dada de baja es INDISTINGUIBLE de la del negocio ajeno (T-14-08)', async () => {
    const resCancelada = await cancelLink(req(), ctx(cancelada.id))
    const resAjena = await cancelLink(req(), ctx(ajena.id))

    const bodyCancelada = await resCancelada.json()
    const bodyAjena = await resAjena.json()

    expect(resCancelada.status).toBe(resAjena.status)
    expect(bodyCancelada).toEqual(bodyAjena)
  })

  // (6) El 401 de sesión ausente es el ÚNICO código distinto del handler: queda asentado acá para que
  // se note si alguien lo mueve o lo mezcla con el 404 genérico.
  it('6 — sin sesión devuelve 401 unauthorized (el único código distinto del handler)', async () => {
    h.session.current = noSession

    const res = await cancelLink(req(), ctx(activo.id))

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ ok: false, error: 'unauthorized' })
  })
})
