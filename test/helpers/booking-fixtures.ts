import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// ── Fixtures de un solo tenant para los tests del core (booking-core) ─────────────────
// Siembra UN negocio fixture completo (dueño auth + business + service activo + professional
// activo + location) en el proyecto Supabase DEV, con todo lo que createAppointmentCore necesita
// re-validar por business_id. Molde directo de test/helpers/supabase-fixtures.ts (seedTwoTenants).
//
// ⚠ SERVICE-ROLE SOLO ACÁ (mismo criterio que supabase-fixtures.ts): el cliente service-role
// bypassa RLS y es la herramienta correcta para CREAR/BORRAR fixtures. Para el test del CORE lo
// reusamos también como el `supabase` que recibe createAppointmentCore: el core es rol-agnóstico
// y acá NO estamos asertando RLS (eso ya lo cubre isolation.test.ts) sino la lógica del core
// (anti-tampering, overlap/buffer, traducción de constraint), así que aislar el test del core de
// la cuestión RLS con el admin es lo correcto.
//
// persistSession: false → no escribe sesión a disco (corre en Node, sin browser).

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export interface SeededTenant {
  admin: SupabaseClient
  userId: string
  // Credenciales del dueño: las necesita el alta MANUAL (Plan 02) para firmar un cliente anon+RLS
  // como el dueño y asertar el dedupe con la sesión real (no con el service-role del seed).
  email: string
  password: string
  businessId: string
  bufferMinutes: number
  serviceId: string
  serviceDurationMinutes: number
  professionalId: string
  locationId: string
}

// seedOneTenant: crea 1 usuario auth + 1 business (con buffer_minutes) + 1 service activo +
// 1 professional activo + 1 location. Prefijo único por corrida (`__test_<uuid8>`): el proyecto
// dev es COMPARTIDO; dos runs concurrentes (local + CI) no deben colisionar en el slug UNIQUE de
// businesses ni en el email de auth.
export async function seedOneTenant(opts?: { bufferMinutes?: number; serviceDurationMinutes?: number }): Promise<SeededTenant> {
  const bufferMinutes = opts?.bufferMinutes ?? 0
  const serviceDurationMinutes = opts?.serviceDurationMinutes ?? 30

  const run = crypto.randomUUID().slice(0, 8)
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })

  const email = `__test_${run}@forjo.test`
  const password = `Test_${run}_pw!`

  // email_confirm: true → usuario confirmado al instante (no hace falta para el core, pero
  // mantiene el molde de supabase-fixtures.ts y deja el fixture listo si algún test quisiera firmar).
  const u = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (u.error || !u.data.user) throw new Error(`seed: createUser falló: ${u.error?.message}`)
  const userId = u.data.user.id

  const insBiz = await admin
    .from('businesses')
    .insert({ owner_id: userId, slug: `__test_${run}`, name: `__test ${run}`, buffer_minutes: bufferMinutes })
    .select('id')
    .single()
  if (insBiz.error || !insBiz.data) throw new Error(`seed: insert business falló: ${insBiz.error?.message}`)
  const businessId = insBiz.data.id

  const insLoc = await admin
    .from('locations')
    .insert({ business_id: businessId, name: `__test_loc_${run}` })
    .select('id')
    .single()
  if (insLoc.error || !insLoc.data) throw new Error(`seed: insert location falló: ${insLoc.error?.message}`)
  const locationId = insLoc.data.id

  const insSvc = await admin
    .from('services')
    .insert({ business_id: businessId, name: `__test_svc_${run}`, duration_minutes: serviceDurationMinutes, price: 100, active: true })
    .select('id')
    .single()
  if (insSvc.error || !insSvc.data) throw new Error(`seed: insert service falló: ${insSvc.error?.message}`)
  const serviceId = insSvc.data.id

  const insPro = await admin
    .from('professionals')
    .insert({ business_id: businessId, name: `__test_pro_${run}`, active: true })
    .select('id')
    .single()
  if (insPro.error || !insPro.data) throw new Error(`seed: insert professional falló: ${insPro.error?.message}`)
  const professionalId = insPro.data.id

  return { admin, userId, email, password, businessId, bufferMinutes, serviceId, serviceDurationMinutes, professionalId, locationId }
}

// seedTimeBlock: siembra UN time_block (plantilla semanal recurrente) con `capacity` configurable
// usando el service-role del seed. El RPC book_slot_atomic y el endpoint availability resuelven la
// capacity de un slot leyendo time_blocks por (business_id, day_of_week, ventana start_time/end_time):
// sin un time_block sembrado, el RPC cae al default capacity=1. Por eso los tests de cupo (CONC-01,
// CUPOS-03) DEBEN sembrar el bloque con la capacity que quieren probar.
//
// `day_of_week` default = 1 (lunes, convención Postgres EXTRACT(dow): 0=domingo..6=sábado) porque la
// fecha de test fija de la suite es '2031-03-03', que es un LUNES. La ventana default '08:00'..'20:00'
// envuelve los horarios de test (09:00, 10:00, etc.). Mantener firma de seedOneTenant intacta: este es
// un helper aparte. El teardown por CASCADE de business ya borra los time_blocks (sin cambio).
export async function seedTimeBlock(
  seeded: SeededTenant,
  opts?: { capacity?: number; dayOfWeek?: number; startTime?: string; endTime?: string }
): Promise<string> {
  const capacity = opts?.capacity ?? 1
  const dayOfWeek = opts?.dayOfWeek ?? 1 // 2031-03-03 = lunes
  const startTime = opts?.startTime ?? '08:00'
  const endTime = opts?.endTime ?? '20:00'

  const ins = await seeded.admin
    .from('time_blocks')
    .insert({
      business_id: seeded.businessId,
      day_of_week: dayOfWeek,
      start_time: startTime,
      end_time: endTime,
      location_id: seeded.locationId,
      capacity,
    })
    .select('id')
    .single()
  if (ins.error || !ins.data) throw new Error(`seed: insert time_block falló: ${ins.error?.message}`)
  return ins.data.id
}

// seedProfessional: siembra UN professional activo adicional sobre un tenant ya sembrado y devuelve
// su id. Molde directo del insert de professional de seedOneTenant (líneas 79-85). Lo necesita CONC-03:
// una 2ª agenda HERMANA (segundo professional_id REAL, nunca null/sentinela — Pitfall 1) que comparta
// un espacio físico con la 1ª (t.professionalId). Helper aparte para NO tocar la firma de seedOneTenant
// que usan CONC-01/02/CUPOS. El teardown por CASCADE de business ya borra el professional extra.
export async function seedProfessional(seeded: SeededTenant, opts?: { name?: string }): Promise<string> {
  const ins = await seeded.admin
    .from('professionals')
    .insert({ business_id: seeded.businessId, name: opts?.name ?? `__test_pro_extra_${crypto.randomUUID().slice(0, 8)}`, active: true })
    .select('id')
    .single()
  if (ins.error || !ins.data) throw new Error(`seed: insert professional extra falló: ${ins.error?.message}`)
  return ins.data.id
}

// seedSpace: siembra UN espacio físico (cancha A/B/C) en `spaces` por service-role y devuelve el
// space_id. Molde de seedTimeBlock (service-role insert + throw en error). El RPC book_slot_atomic
// (migración 042) lee los espacios que ocupa una agenda vía agenda_spaces y toma un advisory lock por
// cada uno → la exclusión por espacio compartido. El teardown por CASCADE de business borra spaces.
export async function seedSpace(seeded: SeededTenant, opts?: { name?: string }): Promise<string> {
  const ins = await seeded.admin
    .from('spaces')
    .insert({ business_id: seeded.businessId, name: opts?.name ?? '__test_space' })
    .select('id')
    .single()
  if (ins.error || !ins.data) throw new Error(`seed: insert space falló: ${ins.error?.message}`)
  return ins.data.id
}

// seedAgendaSpace: mapea una agenda (professional) a un espacio en `agenda_spaces` (puente NOT NULL,
// PK (professional_id, space_id)). Molde de seedTimeBlock. Mapear DOS agendas distintas al MISMO
// space_id es lo que hace que sus reservas solapadas colisionen por espacio (CONC-03). Sin retorno
// (la PK no es un id sintético). El teardown por CASCADE de business borra agenda_spaces.
export async function seedAgendaSpace(seeded: SeededTenant, args: { professionalId: string; spaceId: string }): Promise<void> {
  const ins = await seeded.admin
    .from('agenda_spaces')
    .insert({ business_id: seeded.businessId, professional_id: args.professionalId, space_id: args.spaceId })
  if (ins.error) throw new Error(`seed: insert agenda_space falló: ${ins.error?.message}`)
}

// teardownOneTenant: borra TODO lo creado, incluso si un test falló (try/finally como
// supabase-fixtures.ts). Borrar el business CASCADEA a sus hijos (service/professional/location/
// appointments vía ON DELETE CASCADE en business_id). El usuario auth NO cae por ese CASCADE →
// se borra explícito en el finally con auth.admin.deleteUser.
export async function teardownOneTenant(seeded: SeededTenant): Promise<void> {
  const { admin, businessId, userId } = seeded
  try {
    if (businessId) await admin.from('businesses').delete().eq('id', businessId)
  } finally {
    if (userId) await admin.auth.admin.deleteUser(userId)
  }
}
