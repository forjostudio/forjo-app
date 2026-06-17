import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// ── Fixtures de aislamiento multi-tenant (D-05) ──────────────────────────────────────
// Este helper siembra y limpia 2 negocios fixture (cada uno con su dueño en auth.users)
// en el proyecto Supabase DEV. Lo usa test/isolation.test.ts: en beforeAll siembra,
// en afterAll limpia.
//
// ⚠ SERVICE-ROLE SOLO ACÁ (D-06 / Pitfall 12): el cliente service-role bypassa RLS, así que
// es la herramienta correcta para CREAR/BORRAR fixtures (necesitamos insertar la fila de B
// que la sesión de A intentará leer/escribir). PERO jamás debe usarse en una ASERCIÓN de
// aislamiento — eso daría un falso verde. El test de aislamiento crea sus propios clientes
// anon-key autenticados para asertar; este helper es exclusivamente setup/teardown.
//
// persistSession: false → este cliente no escribe sesión a disco/localStorage (corre en Node,
// sin browser); evita estado compartido entre runs/tests.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Datos que el test necesita para autenticar 2 sesiones anon y asertar cross-read/write/insert.
export interface SeededTenants {
  // service-role admin: SOLO para el teardown y para el check independiente del efecto de un
  // UPDATE (no es la aserción de RLS). NUNCA usarlo como cliente de aserción de aislamiento.
  admin: SupabaseClient
  // credenciales para signInWithPassword (2 sesiones anon distintas en el test):
  emailA: string
  emailB: string
  password: string
  // ids fixture:
  userA: string
  userB: string
  bizA: string
  bizB: string
  // fila hija de B (appointment) para probar cross-read y cross-UPDATE desde la sesión de A:
  apptB: string
  apptBClientName: string
}

// seedTwoTenants: crea 2 usuarios auth + 2 negocios (uno por dueño) + 1 appointment de B.
//
// Prefijo único por corrida (`__test_<uuid8>`): el proyecto dev es COMPARTIDO; dos runs
// concurrentes (ej. local + CI) no deben colisionar en el slug UNIQUE de businesses ni en el
// email de auth. El uuid de 8 chars hace cada corrida independiente (D-05 / Pitfall 5).
export async function seedTwoTenants(): Promise<SeededTenants> {
  const run = crypto.randomUUID().slice(0, 8)
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })

  const emailA = `__test_${run}_a@forjo.test`
  const emailB = `__test_${run}_b@forjo.test`
  const password = `Test_${run}_pw!`

  // email_confirm: true → el usuario queda confirmado al instante, así signInWithPassword
  // funciona de inmediato sin esperar un mail de confirmación (A4 del RESEARCH).
  const a = await admin.auth.admin.createUser({ email: emailA, password, email_confirm: true })
  if (a.error || !a.data.user) throw new Error(`seed: createUser A falló: ${a.error?.message}`)
  const b = await admin.auth.admin.createUser({ email: emailB, password, email_confirm: true })
  if (b.error || !b.data.user) throw new Error(`seed: createUser B falló: ${b.error?.message}`)
  const userA = a.data.user.id
  const userB = b.data.user.id

  // 1 negocio por dueño. slug/name con el prefijo único. owner_id enlaza con el usuario auth
  // (es la columna que las policies RLS leen vía auth.uid()).
  const insA = await admin
    .from('businesses')
    .insert({ owner_id: userA, slug: `__test_${run}_a`, name: `__test ${run} A` })
    .select('id')
    .single()
  if (insA.error || !insA.data) throw new Error(`seed: insert business A falló: ${insA.error?.message}`)
  const insB = await admin
    .from('businesses')
    .insert({ owner_id: userB, slug: `__test_${run}_b`, name: `__test ${run} B` })
    .select('id')
    .single()
  if (insB.error || !insB.data) throw new Error(`seed: insert business B falló: ${insB.error?.message}`)
  const bizA = insA.data.id
  const bizB = insB.data.id

  // Fila hija de B: un appointment con todos los NOT NULL (business_id, client_name, date, time).
  // Fecha futura fija (2030-01-01) para no chocar con lógica de turnos pasados. Esta fila es la
  // que la sesión de A intentará LEER (cross-read) y ACTUALIZAR (cross-write) — RLS debe denegar.
  const apptBClientName = `cliB_${run}`
  const ap = await admin
    .from('appointments')
    .insert({ business_id: bizB, client_name: apptBClientName, date: '2030-01-01', time: '10:00' })
    .select('id')
    .single()
  if (ap.error || !ap.data) throw new Error(`seed: insert appointment B falló: ${ap.error?.message}`)
  const apptB = ap.data.id

  return { admin, emailA, emailB, password, userA, userB, bizA, bizB, apptB, apptBClientName }
}

// teardown: borra TODO lo creado, incluso si un test falló.
//
// try/finally (Pitfall 5): si el delete de un negocio tira, igual intentamos borrar los usuarios
// auth — de lo contrario quedarían huérfanos en auth.users (NO se borran por CASCADE de businesses;
// el CASCADE va de auth.users → businesses, no al revés). Borrar el business CASCADEA a sus hijos
// (services/appointments/clients/business_secrets vía ON DELETE CASCADE en business_id), así que no
// hace falta borrarlos uno por uno. Los 2 usuarios SÍ se borran explícito con auth.admin.deleteUser.
export async function teardown(seeded: SeededTenants): Promise<void> {
  const { admin, bizA, bizB, userA, userB } = seeded
  try {
    if (bizA) await admin.from('businesses').delete().eq('id', bizA) // CASCADE limpia hijos de A
    if (bizB) await admin.from('businesses').delete().eq('id', bizB) // CASCADE limpia hijos de B (incl. apptB)
  } finally {
    // Los usuarios auth no caen por CASCADE de businesses → borrarlos siempre, aunque el delete de
    // arriba haya fallado, para no dejar usuarios fixture acumulándose en el proyecto dev.
    if (userA) await admin.auth.admin.deleteUser(userA)
    if (userB) await admin.auth.admin.deleteUser(userB)
  }
}
