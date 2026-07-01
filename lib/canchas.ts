// lib/canchas.ts — capa pura de provisión/reconstrucción/borrado de la cancha (vertical canchas).
//
// Una CANCHA es una entidad reservable unificada. Por debajo se materializa como una TUPLA:
//   - `service`      → precio + duración fija (D-01; cada cancha = 1 fila en services).
//   - `professional` → la AGENDA (el "bucket" que el motor v0.12 reserva), con service_id apuntando
//                      a su service (puntero 1:1 estable, migración 043 / D-06).
//   - `space(s)`     → espacio(s) físico(s); dedicado por defecto o compartidos (F11 → {A,B,C}, D-04).
//   - `agenda_spaces`→ el puente agenda↔espacio que acopla la disponibilidad (motor v0.12).
//
// Esta capa NO tiene React ni DOM: recibe el SupabaseClient por PARÁMETRO (inyección) para ser
// testeable con un mock sin tocar la DB. Cada insert/update/delete SIEMPRE setea/filtra por
// business_id (aislamiento por tenant — la RLS lo valida a nivel DB; acá es defensa en profundidad).
//
// CAVEAT DE ATOMICIDAD: no hay RPC/transacción (no se migra más allá de 043). provisionCancha hace
// ROLLBACK MANUAL: si un paso falla, borra lo creado antes (filtrando por business_id). Mitiga pero no
// garantiza atomicidad — mismo nivel que el resto del dashboard (Pitfall 1 del research). Riesgo
// residual: consistencia intra-tenant (nunca cross-tenant).
//
// LINKEO POR service_id, NUNCA POR NOMBRE (Pitfall 2): canchasFromData empareja
// professional.service_id === service.id. Renombrar el service NO rompe el match.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Service, Professional, AgendaSpace } from '@/lib/types'

// Cliente inyectable: se tipa laxo (any en los métodos encadenados) para aceptar tanto el browser
// client real como el mock de los tests. El contrato usado es el subconjunto from().insert/update/delete.
type Client = SupabaseClient

// Entrada de alta de una cancha. sharedSpaceIds ausente/vacío → se crea un space dedicado.
export interface CanchaInput {
  name: string
  price: number
  duration: number // minutos (duration_minutes en services)
  sharedSpaceIds?: string[]
}

// La tupla reconstruida de una cancha.
export interface Cancha {
  service: Service
  professional: Professional
  spaceIds: string[]
}

// Resultado discriminado (patrón del repo: { ok, ... } | { ok:false, error }).
export type ProvisionResult =
  | { ok: true; service: Service; professional: Professional; spaceIds: string[] }
  | { ok: false; error: string }

export type DeleteResult = { ok: true } | { ok: false; error: string }

// ── provisionCancha ─────────────────────────────────────────────────────────────────────────
// Inserta en secuencia service → professional(service_id) → space(s) → agenda_spaces, con rollback
// manual en cada paso. Todo con business_id explícito.
export async function provisionCancha(
  client: Client,
  businessId: string,
  input: CanchaInput,
): Promise<ProvisionResult> {
  const shared = input.sharedSpaceIds?.filter(Boolean) ?? []

  // 1. service (precio + duración fija).
  const { data: svc, error: svcErr } = await client
    .from('services')
    .insert({ name: input.name, price: input.price, duration_minutes: input.duration, business_id: businessId })
    .select()
    .single()
  if (svcErr || !svc) return { ok: false, error: 'service_insert_failed' }
  const service = svc as Service

  // 2. professional (la agenda) con el puntero 1:1 a su service (D-06).
  const { data: pro, error: proErr } = await client
    .from('professionals')
    .insert({ name: input.name, service_id: service.id, business_id: businessId })
    .select()
    .single()
  if (proErr || !pro) {
    // Rollback: borrar el service ya creado.
    await client.from('services').delete().eq('id', service.id).eq('business_id', businessId)
    return { ok: false, error: 'professional_insert_failed' }
  }
  const professional = pro as Professional

  // 3. space(s): dedicado (crear) o compartidos (usar existentes).
  let spaceIds: string[]
  let dedicatedSpaceId: string | null = null
  if (shared.length === 0) {
    const { data: sp, error: spErr } = await client
      .from('spaces')
      .insert({ name: input.name, business_id: businessId })
      .select()
      .single()
    if (spErr || !sp) {
      // Rollback: professional + service.
      await client.from('professionals').delete().eq('id', professional.id).eq('business_id', businessId)
      await client.from('services').delete().eq('id', service.id).eq('business_id', businessId)
      return { ok: false, error: 'space_insert_failed' }
    }
    dedicatedSpaceId = (sp as { id: string }).id
    spaceIds = [dedicatedSpaceId]
  } else {
    spaceIds = shared
  }

  // 4. agenda_spaces: una fila por espacio (mismo patrón row-a-row que toggleAgendaSpace).
  let asErr: unknown = null
  for (const space_id of spaceIds) {
    const row: AgendaSpace = { business_id: businessId, professional_id: professional.id, space_id }
    const { error } = await client.from('agenda_spaces').insert(row)
    if (error) { asErr = error; break }
  }
  if (asErr) {
    // Rollback en orden inverso: space dedicado (si lo hubo) + professional + service.
    if (dedicatedSpaceId) {
      await client.from('spaces').delete().eq('id', dedicatedSpaceId).eq('business_id', businessId)
    }
    await client.from('professionals').delete().eq('id', professional.id).eq('business_id', businessId)
    await client.from('services').delete().eq('id', service.id).eq('business_id', businessId)
    return { ok: false, error: 'agenda_spaces_insert_failed' }
  }

  return { ok: true, service, professional, spaceIds }
}

// ── canchasFromData ─────────────────────────────────────────────────────────────────────────
// Reconstruye la lista de canchas emparejando professional.service_id === service.id (D-06,
// puntero estable — NUNCA por nombre). Ignora professionals sin service_id (no son canchas).
export function canchasFromData(
  services: Service[],
  professionals: Professional[],
  agendaSpaces: AgendaSpace[],
): Cancha[] {
  const svcById = new Map(services.map(s => [s.id, s]))
  const canchas: Cancha[] = []
  for (const pro of professionals) {
    if (!pro.service_id) continue // sin puntero → no es cancha
    const service = svcById.get(pro.service_id)
    if (!service) continue // puntero colgado (service borrado): no reconstruye tupla
    const spaceIds = agendaSpaces
      .filter(a => a.professional_id === pro.id)
      .map(a => a.space_id)
    canchas.push({ service, professional: pro, spaceIds })
  }
  return canchas
}

// ── deleteCancha ────────────────────────────────────────────────────────────────────────────
// Soft-delete por defecto (active=false en service Y professional → la agenda sale del booking, D-05).
// Hard-delete solo si { hard:true }: borra agenda_spaces → space dedicado → professional → service,
// filtrando por business_id. Un FK 23503 (turnos asociados) → error de dominio 'has_appointments'.
export async function deleteCancha(
  client: Client,
  businessId: string,
  cancha: Cancha,
  opts: { hard?: boolean } = {},
): Promise<DeleteResult> {
  if (!opts.hard) {
    // Soft: desactivar service Y professional (para que la agenda salga del booking).
    await client.from('services').update({ active: false }).eq('id', cancha.service.id).eq('business_id', businessId)
    await client.from('professionals').update({ active: false }).eq('id', cancha.professional.id).eq('business_id', businessId)
    return { ok: true }
  }

  // Hard: borrar el mapeo primero, luego el resto en orden.
  await client.from('agenda_spaces').delete().eq('professional_id', cancha.professional.id).eq('business_id', businessId)

  const { error: proErr } = await client
    .from('professionals').delete().eq('id', cancha.professional.id).eq('business_id', businessId)
  if (proErr) {
    // FK 23503: la agenda tiene turnos → no se puede hard-deletear; sugerir desactivar.
    if ((proErr as { code?: string }).code === '23503') return { ok: false, error: 'has_appointments' }
    return { ok: false, error: 'professional_delete_failed' }
  }

  const { error: svcErr } = await client
    .from('services').delete().eq('id', cancha.service.id).eq('business_id', businessId)
  if (svcErr) {
    if ((svcErr as { code?: string }).code === '23503') return { ok: false, error: 'has_appointments' }
    return { ok: false, error: 'service_delete_failed' }
  }

  return { ok: true }
}

// ── editCancha ──────────────────────────────────────────────────────────────────────────────
// Edita una cancha propagando el nombre a TODAS las filas que lo muestran (fix del bug de rename):
// service (name + price + duration), professional (name = la agenda) y el/los space(s) DEDICADO(s).
// Un space es DEDICADO si en agendaSpaces está mapeado SOLO a esta agenda; los COMPARTIDOS (mapeados
// a >1 agenda, ej. F11→{A,B,C}) NO se renombran — renombrar una cancha no debe pisar el nombre de un
// espacio que otras canchas comparten. Todo filtra por business_id (aislamiento).
export async function editCancha(
  client: Client,
  businessId: string,
  cancha: Cancha,
  patch: { name: string; price: number; duration: number },
  agendaSpaces: AgendaSpace[],
): Promise<DeleteResult> {
  const name = patch.name
  // 1. service: nombre + precio + duración fija propia (cada cancha edita SOLO su service → D-01).
  const { error: svcErr } = await client.from('services')
    .update({ name, price: patch.price, duration_minutes: patch.duration })
    .eq('id', cancha.service.id).eq('business_id', businessId)
  if (svcErr) return { ok: false, error: 'service_update_failed' }

  // 2. professional (la agenda visible lleva el mismo nombre que la cancha).
  await client.from('professionals').update({ name })
    .eq('id', cancha.professional.id).eq('business_id', businessId)

  // 3. space(s) DEDICADO(s): renombrar solo los mapeados exclusivamente a esta agenda.
  for (const spaceId of cancha.spaceIds) {
    const mappings = agendaSpaces.filter(a => a.space_id === spaceId)
    const isDedicated = mappings.length === 1 && mappings[0].professional_id === cancha.professional.id
    if (isDedicated) {
      await client.from('spaces').update({ name })
        .eq('id', spaceId).eq('business_id', businessId)
    }
  }
  return { ok: true }
}

// ── setCanchaActive ─────────────────────────────────────────────────────────────────────────
// Activa/desactiva una cancha (REVERSIBLE): active en service Y professional. Desactivar la saca del
// booking (D-05); activar la reincorpora. NO destructivo — la tupla y las reservas se conservan.
export async function setCanchaActive(
  client: Client,
  businessId: string,
  cancha: Cancha,
  active: boolean,
): Promise<DeleteResult> {
  const { error: e1 } = await client.from('services').update({ active })
    .eq('id', cancha.service.id).eq('business_id', businessId)
  if (e1) return { ok: false, error: 'service_update_failed' }
  const { error: e2 } = await client.from('professionals').update({ active })
    .eq('id', cancha.professional.id).eq('business_id', businessId)
  if (e2) return { ok: false, error: 'professional_update_failed' }
  return { ok: true }
}
