import type { Professional, Service, ProfessionalService } from '@/lib/types'

// ── Regla del comodín staff↔servicios (STAFF, D-01/D-12) ────────────────────────────────────
// Fuente ÚNICA de verdad de "quién hace qué" en el modelo multi-staff (v0.25). Encierra la regla
// del comodín una sola vez para que las TRES capas que la necesitan la interpreten idéntico:
//   - la UI de esta fase (D-08 cobertura en /servicios, D-10 aviso al desmarcar en /equipo),
//   - el RPC atómico de asignación de la Phase 9 (candidatos por servicio dentro de book_slot_atomic),
//   - la grilla pública de la Phase 10 (qué servicios ofrece cada agenda).
// Definirla y testearla acá evita que tres implementaciones deriven en la interpretación de D-01.
//
// Funciones PURAS: sin React ni Supabase → reutilizables en client y server, testeables sin DB.
// Los inputs son filas planas (Professional[], Service[], ProfessionalService[]), nunca clientes de
// datos. El caller resuelve el filtrado por tenant y por `active` ANTES de llamar (D-16).
//
// Regla del comodín (D-01): un profesional SIN filas en la puente se considera capaz de TODOS los
// servicios (default sensato, cero backfill, no obliga a configurar). Un profesional con ≥1 fila es
// capaz de EXACTAMENTE los servicios mapeados.

/**
 * Los servicios que hace `professionalId`.
 *
 * Comodín (D-01): si el profesional no tiene ninguna fila en `bridge` devuelve TODOS los `services`;
 * si tiene ≥1, devuelve solo los servicios efectivamente mapeados (preservando el orden de `services`).
 */
export function servicesForProfessional(
  professionalId: string,
  services: Service[],
  bridge: ProfessionalService[],
): Service[] {
  const rows = bridge.filter((r) => r.professional_id === professionalId)
  if (rows.length === 0) return [...services] // comodín: capaz de todo
  const mapped = new Set(rows.map((r) => r.service_id))
  return services.filter((s) => mapped.has(s.id))
}

/**
 * Los profesionales activos que ofrecen `serviceId`.
 *
 * `activeProfessionals` YA viene filtrado a activos por el caller (D-16): la cobertura cuenta solo
 * agendas activas, espejando el `WHERE active = true` de `public_professionals`. Un profesional
 * entra si es comodín (0 filas → capaz de todo) O tiene una fila para ese `serviceId`.
 */
export function professionalsForService(
  serviceId: string,
  activeProfessionals: Professional[],
  bridge: ProfessionalService[],
): Professional[] {
  return activeProfessionals.filter((p) => {
    const rows = bridge.filter((r) => r.professional_id === p.id)
    if (rows.length === 0) return true // comodín: ofrece todo
    return rows.some((r) => r.service_id === serviceId)
  })
}

/**
 * ¿El servicio `serviceId` tiene cobertura entre los profesionales activos?
 *
 * `true` salvo que TODOS los activos tengan mapeo explícito (≥1 fila) y NINGUNO haya marcado ese
 * servicio. Si queda al menos un comodín (0 filas) entre los activos, todo servicio está cubierto.
 * Por construcción es consistente con `professionalsForService(...).length > 0` (fuente única).
 */
export function isServiceCovered(
  serviceId: string,
  activeProfessionals: Professional[],
  bridge: ProfessionalService[],
): boolean {
  return professionalsForService(serviceId, activeProfessionals, bridge).length > 0
}

/**
 * ¿`serviceId` es RESERVABLE por el eje staff? La pregunta por SERVICIO.
 *
 * Es la versión por-servicio del guard que hasta ahora sólo existía EMBEBIDO dentro del filtro de
 * `bookableServices`: dos condiciones, en este orden.
 *   1. Modo sentinel (`activeProfessionals.length === 0`): sin ningún profesional nombrado el negocio
 *      reserva contra el UUID mágico ("Sin preferencia") y TODO servicio sigue reservable. Sin esta
 *      guarda `isServiceCovered` daría false para todo y apagaría el catálogo entero de un negocio
 *      sin staff nombrado (regresión grave).
 *   2. Con staff nombrado, delega en `isServiceCovered` (fuente única de la regla del comodín): con
 *      la puente vacía da true para todo; sólo da false cuando HAY mapeos y NINGUNO cubre el servicio.
 *
 * La necesita `booking-client.tsx` (Plan 20-02) para decidir, servicio por servicio, si deshabilitar
 * la tarjeta del paso 1 con el motivo a la vista ("Sin profesional disponible") en vez de OCULTARLO
 * del array — el comportamiento viejo, el gap UAT de la Phase 10. Por qué el cambio: un estado mal
 * configurado no puede verse igual que uno correcto (D-05 del CONTEXT de la Phase 20). Se exporta
 * como función y no se reimplementa el `length === 0` inline en el componente porque ésta ES la
 * definición de "cubierto por staff" — dos interpretaciones es cómo la pantalla y el motor terminan
 * diciendo cosas distintas sobre el mismo servicio.
 */
export function isServiceStaffed(
  serviceId: string,
  activeProfessionals: Professional[],
  bridge: ProfessionalService[],
): boolean {
  if (activeProfessionals.length === 0) return true // modo sentinel: sin staff nombrado, todo reservable
  return isServiceCovered(serviceId, activeProfessionals, bridge)
}

/**
 * Los servicios RESERVABLES en la grilla pública con staff nombrado.
 *
 * Filtro PURO y reutilizable, sinónimo por-array de `isServiceStaffed` (delega en ella: una sola
 * fuente, cero chance de que las dos respuestas diverjan — incluida la guarda de modo sentinel, que
 * dejó de vivir acá adentro).
 *
 * ⚠ `app/[slug]/page.tsx` YA NO la llama para armar el array del selector público (Plan 20-01 Task 1,
 * D-05): el RSC pasa el catálogo COMPLETO y el consumidor por-servicio pasó a ser `isServiceStaffed`,
 * usado directo dentro de `booking-client.tsx` (Plan 20-02) para deshabilitar-con-motivo en vez de
 * ocultar. La función se conserva porque su contrato sigue siendo correcto y sigue siendo la respuesta
 * a "¿qué servicios tienen cobertura?" — la pregunta que se hace por lista, no por tarjeta.
 */
export function bookableServices(
  services: Service[],
  activeProfessionals: Professional[],
  bridge: ProfessionalService[],
): Service[] {
  return services.filter((s) => isServiceStaffed(s.id, activeProfessionals, bridge))
}
