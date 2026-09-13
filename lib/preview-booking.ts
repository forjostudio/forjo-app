// lib/preview-booking.ts — la proyección que le permite al PREVIEW del CMS no mentir.
//
// ── El problema que resuelve ──────────────────────────────────────────────────────────────────────
// El preview de `/web` (editor del dueño) y la página pública `/[slug]` tienen que llegar al MISMO
// widget de reserva con los MISMOS datos. La página pública los recibe de vistas ACOTADAS, que
// además de recortar columnas aplican WHERE. El dashboard lee las TABLAS BASE (con la sesión del
// dueño), así que para mostrar lo que el visitante verá necesita reproducir esos WHERE. Este módulo
// es el ÚNICO lugar del dashboard donde esa reproducción vive.
//
// ── Qué espeja cada lista (verificado contra supabase/schema.sql) ─────────────────────────────────
//   · `services`      → `public_services`      : WHERE active = true.
//   · `professionals` → `public_professionals` : WHERE active = true AND service_id IS NULL. La
//       segunda mitad es el hardening de la migr. 060: una fila de `professionals` con `service_id`
//       NO es staff reservable, es la AGENDA de una cancha (migr. 043, D-06).
//   · `canchas`       → `public_canchas`       : JOIN professionals p × services s ON s.id =
//       p.service_id WHERE p.service_id IS NOT NULL AND p.active AND s.active, proyectando
//       { id, business_id, name, price, duration_minutes } — y NUNCA `service_id`.
//
// ── Por qué DERIVAR y no leer la vista desde el dashboard ─────────────────────────────────────────
// Las vistas `public_*` existen para no abrirle la tabla base a `anon` (D-07 de la migr. 059, §3 de
// la 071) — una restricción que no aplica al dueño autenticado. Y son vistas DEFINER (sin
// `security_invoker`): leerlas desde una superficie autenticada dejaría el aislamiento por tenant
// colgado SÓLO del filtro explícito `.eq('business_id', …)`, justo lo que la regla de defensa en
// profundidad prohíbe (skill supabase-multitenant-rls: "no confiar en una sola capa"). Leyendo la
// tabla base con la sesión del dueño se suman las DOS capas: RLS en la base + filtro en la query.
// Las dos puentes (`professional_services`, `time_block_services`) viajan CRUDAS al widget porque
// sus vistas públicas son proyecciones sin WHERE: base y vista devuelven las mismas filas.
//
// El riesgo obvio de derivar —quedar desfasado de la vista— NO se cubre con disciplina: se cubre con
// `test/preview-booking-parity.test.ts`, que compara esta derivación contra lo que las vistas
// devuelven DE VERDAD, leídas con la anon key por el camino del público.
//
// Módulo PURO: sin React y sin Supabase. El caller filtra por tenant (contrato del repo), este
// módulo sólo proyecta lo que recibe.

import { canchasFromData } from '@/lib/canchas'
import type { Professional, PublicCancha, Service } from '@/lib/types'

export interface PreviewBookingInputs {
  services: Service[]
  professionals: Professional[]
  canchas: PublicCancha[]
}

/**
 * Proyecta el catálogo crudo del tenant a lo que el booking PÚBLICO recibiría de sus vistas.
 *
 * `active` se compara contra `true` explícitamente y no por verdad: la columna es `boolean DEFAULT
 * true` NULLABLE en la DB, y `WHERE active = true` excluye el NULL (NULL = true no es true). Un
 * `!row.active` daría el mismo resultado hoy, pero el `=== true` es el que DICE que está espejando
 * una comparación SQL.
 */
export function previewBookingInputs({
  services,
  professionals,
}: {
  services: Service[]
  professionals: Professional[]
}): PreviewBookingInputs {
  // Eje servicios: WHERE active = true (public_services).
  const visibleServices = services.filter((s) => s.active === true)

  // Eje staff: WHERE active = true AND service_id IS NULL (public_professionals).
  const visibleProfessionals = professionals.filter(
    (p) => p.active === true && (p.service_id ?? null) === null,
  )

  // Eje canchas: el JOIN de public_canchas, derivado sin query nueva.
  //
  // `canchasFromData` es el emparejamiento AUTORITATIVO por `service_id` (D-06) — NUNCA por nombre
  // (Pitfall 2): ignora los professionals sin puntero y descarta el puntero colgado (service que ya
  // no existe) sin lanzar. Se le pasa `[]` de agenda_spaces a propósito: `spaceIds` acopla la
  // DISPONIBILIDAD (motor v0.12) y no participa de esta proyección, que sólo necesita la tupla
  // service↔agenda. Lo que `canchasFromData` NO hace es filtrar por `active` (su caller del panel
  // administra también las canchas desactivadas), así que las dos mitades del WHERE de la vista se
  // aplican acá.
  const canchas: PublicCancha[] = canchasFromData(services, professionals, [])
    .filter((c) => c.professional.active === true && c.service.active === true)
    .map((c) => ({
      // `id` es el professional_id de la agenda-cancha: con eso reserva el cliente, y el server
      // deriva el service (anti-tampering de v0.13).
      id: c.professional.id,
      business_id: c.professional.business_id,
      name: c.professional.name,
      // price y duration salen del service 1:1 de la cancha (D-03).
      price: c.service.price,
      duration_minutes: c.service.duration_minutes,
    }))

  // Las 5 claves de arriba son TODA la proyección: `service_id` no se emite ni como `undefined`.
  // Es puntero interno (regla dura D-01 de la migr. 044) y filtrarlo le permitiría al cliente
  // inferir el service para tampear precio o duración.
  return { services: visibleServices, professionals: visibleProfessionals, canchas }
}
