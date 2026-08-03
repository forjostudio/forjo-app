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
// CAVEAT DE ATOMICIDAD: no hay RPC/transacción (no se migra más allá de 043). provisionCancha y
// deleteCancha hacen ROLLBACK MANUAL: si un paso falla, deshacen lo que hicieron antes (filtrando por
// business_id). Mitiga pero no garantiza atomicidad — mismo nivel que el resto del dashboard (Pitfall 1
// del research). Riesgo residual: consistencia intra-tenant (nunca cross-tenant). En el borrado, además,
// el ORDEN está elegido para que el paso rechazable sea el primero (ver deleteCancha).
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

// ── nonCanchaServices ─────────────────────────────────────────────────────────────────────────
// Servicios que el CRUD GENÉRICO de Ajustes → Servicios puede administrar: todos menos la mitad
// `service` de una cancha.
//
// POR QUÉ (gap 13-05 #2): una cancha es una TUPLA, y su fila en `services` es un detalle de
// implementación. La lista genérica las mostraba igual (solo se conmuta QUÉ UI se renderiza por
// vertical, no QUÉ datos), así que en un negocio que no es de canchas se podía borrar "Cancha de 6"
// desde Servicios: el FK dejaba `professionals.service_id` en NULL y la agenda quedaba huérfana
// (canchasFromData ya no la reconstruye → cancha invisible e inadministrable).
//
// Recibe las canchas YA reconstruidas por canchasFromData — el emparejamiento es por `service_id`,
// NUNCA por nombre (Pitfall 2). Puro: se testea sin DB.
export function nonCanchaServices(services: Service[], canchas: Cancha[]): Service[] {
  const canchaServiceIds = new Set(canchas.map(c => c.service.id))
  return services.filter(s => !canchaServiceIds.has(s.id))
}

// ── dedicatedSpaceIds ─────────────────────────────────────────────────────────────────────────
// Espacios DEDICADOS de una cancha: los mapeados EXCLUSIVAMENTE a su agenda (una sola fila en
// agenda_spaces y para este professional). Los COMPARTIDOS (mapeados a >1 agenda, ej. F11→{A,B,C})
// NO son dedicados. Se usa para renombrar (editCancha) y para borrar el espacio propio (deleteCancha)
// sin tocar los compartidos por otras canchas.
export function dedicatedSpaceIds(cancha: Cancha, agendaSpaces: AgendaSpace[]): string[] {
  return cancha.spaceIds.filter(id => {
    const mappings = agendaSpaces.filter(a => a.space_id === id)
    return mappings.length === 1 && mappings[0].professional_id === cancha.professional.id
  })
}

// ── deleteCancha ────────────────────────────────────────────────────────────────────────────
// Soft-delete por defecto (active=false en service Y professional → la agenda sale del booking, D-05).
// Hard-delete solo si { hard:true }: borra professional → service → space(s) DEDICADO(s), filtrando por
// business_id. Los espacios DEDICADOS se borran para que no queden huérfanos en el picker de "compartir
// espacio"; los COMPARTIDOS se conservan (otras canchas los usan) — por eso se necesita `agendaSpaces`.
//
// ORDEN Y ATOMICIDAD (fix CR-01). La cancha solo es reconstruible mientras el service Y el professional
// que lo apunta existan (canchasFromData empareja por professional.service_id): cualquier borrado a
// medias la vuelve INVISIBLE e inadministrable. Sin transacción, el orden se elige para que el paso que
// puede fallar sea el PRIMERO y no haya nada que revertir:
//   1. `agenda_spaces` NO se borra a mano. Su FK a professionals es ON DELETE CASCADE (schema.sql), así
//      que se va solo con la agenda; y si la agenda NO se puede borrar, el mapeo queda INTACTO. Borrarlo
//      primero —como se hacía antes— dejaba la cancha sin sus espacios (y por lo tanto sin el acople de
//      disponibilidad del motor v0.12) justo en el caso MÁS común: `appointments.professional_id` es un
//      FK NO ACTION, así que CUALQUIER turno de la agenda —pasado, cancelado, lo que sea— rechaza el
//      DELETE con 23503.
//   2. Si el DELETE del professional falla, no se tocó NADA: se devuelve el error de dominio y listo.
//   3. Si el DELETE del service falla (gate `services_block_delete_trg` de la migr. 065: turnos futuros
//      o abono activo), la agenda ya no está → ROLLBACK MANUAL, ver abajo.
// Riesgo residual: que falle el propio rollback (se reporta como 'rollback_failed', nunca en silencio).
export async function deleteCancha(
  client: Client,
  businessId: string,
  cancha: Cancha,
  opts: { hard?: boolean; agendaSpaces?: AgendaSpace[] } = {},
): Promise<DeleteResult> {
  if (!opts.hard) {
    // Soft: desactivar service Y professional (para que la agenda salga del booking).
    await client.from('services').update({ active: false }).eq('id', cancha.service.id).eq('business_id', businessId)
    await client.from('professionals').update({ active: false }).eq('id', cancha.professional.id).eq('business_id', businessId)
    return { ok: true }
  }

  // Calcular ANTES de borrar la agenda: los espacios DEDICADOS y el mapeo agenda↔espacio. Después del
  // DELETE el mapeo ya no existe (CASCADE) y ninguno de los dos se puede derivar de la DB.
  const dedicated = dedicatedSpaceIds(cancha, opts.agendaSpaces ?? [])
  const mappings = (opts.agendaSpaces ?? []).filter(a => a.professional_id === cancha.professional.id)

  const { error: proErr } = await client
    .from('professionals').delete().eq('id', cancha.professional.id).eq('business_id', businessId)
  if (proErr) {
    // Todavía no se destruyó nada: el CASCADE de agenda_spaces ni corrió.
    // FK 23503: la agenda tiene turnos → no se puede hard-deletear; sugerir desactivar.
    if ((proErr as { code?: string }).code === '23503') return { ok: false, error: 'has_appointments' }
    return { ok: false, error: 'professional_delete_failed' }
  }

  const { error: svcErr } = await client
    .from('services').delete().eq('id', cancha.service.id).eq('business_id', businessId)
  if (svcErr) {
    // 23503 (FK) queda como fallback defensivo: desde la migración 065 el FK de appointments (y el
    // de abonos) pasó a SET NULL, así que el rechazo ya no llega como FK sino como el RAISE del
    // trigger `services_block_delete_trg` (ERRCODE P0001, message = código de dominio). Los DOS
    // messages se mapean a códigos DISTINTOS: un abono activo no se arregla borrando turnos, y
    // mandar al dueño a buscar turnos que no existen es peor que no decirle nada.
    const e = svcErr as { code?: string; message?: string }
    const reason =
      e.code === 'P0001' && e.message?.includes('service_has_active_abono') ? 'has_active_abono'
        : e.code === 'P0001' && e.message?.includes('service_has_future_appointments') ? 'has_appointments'
          : e.code === '23503' ? 'has_appointments'
            : 'service_delete_failed'

    // ROLLBACK MANUAL (molde de provisionCancha): la agenda y su mapeo ya no están pero el service
    // sobrevivió, así que la tupla quedaría rota. Se re-crea la agenda apuntando al MISMO service y se
    // re-apunta el mapeo — es lo que canchasFromData necesita para volver a mostrar la cancha.
    // El id del professional CAMBIA. Es aceptable acá y solo acá: el DELETE anterior salió bien, y eso
    // solo puede pasar si ninguna fila de `appointments` lo referenciaba (FK NO ACTION). Lo que sí se
    // pierde es el puntero de un abono ya archivado (`abonos.professional_id` es SET NULL) — el abono
    // sobrevive con su snapshot; recuperar la cancha vale más que ese puntero.
    const { data: rePro } = await client.from('professionals')
      .insert({ name: cancha.professional.name, service_id: cancha.service.id, business_id: businessId, active: cancha.professional.active })
      .select().single()
    const reProId = (rePro as { id?: string } | null)?.id
    if (!reProId) return { ok: false, error: 'rollback_failed' }
    for (const m of mappings) {
      await client.from('agenda_spaces').insert({ business_id: businessId, professional_id: reProId, space_id: m.space_id })
    }
    return { ok: false, error: reason }
  }

  // Borrar los espacios DEDICADOS (ya sin agenda_spaces que los referencien) para que no queden
  // huérfanos en el picker de "compartir espacio". Best-effort: si un space aún tiene referencias
  // (FK, ej. appointment_spaces históricos) el error se ignora — la cancha ya se borró y un space
  // huérfano es cosmético, no vale abortar.
  for (const spaceId of dedicated) {
    await client.from('spaces').delete().eq('id', spaceId).eq('business_id', businessId)
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

  // 3. space(s) DEDICADO(s): renombrar solo los mapeados exclusivamente a esta agenda (no los compartidos).
  for (const spaceId of dedicatedSpaceIds(cancha, agendaSpaces)) {
    await client.from('spaces').update({ name })
      .eq('id', spaceId).eq('business_id', businessId)
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
