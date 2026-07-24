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
