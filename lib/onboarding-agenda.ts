// ── El traductor del estado del wizard al payload del RPC de la agenda (AGENDA-08, D-10) ───────
//
// Módulo PURO: sin React, sin Next, sin Supabase. Su único import es el constructor del payload del
// panel, y por eso se puede testear sin navegador y sin base (`test/onboarding-agenda.test.ts`).
// Existe por el mismo motivo que `lib/agenda-hours-payload.ts`: las dos reglas que decide —qué se
// persiste y qué no— vivían adentro del submit del alta, o sea adentro de un client component que
// el runner de este repo no puede renderizar (`environment: 'node'`). Una regla que no se puede
// testear es una regla que se rompe sin que nadie se entere.
//
// Las DOS cosas que este módulo existe para que no se puedan volver a perder:
//
// 1. **Si el toggle quedó APAGADO al finalizar, se persiste comodín** (D-10). Aunque el dueño haya
//    mapeado franjas antes y después lo haya apagado: el principio que sostiene el panel es *lo que
//    veo es lo que queda*, y persistir algo que la última pantalla NO muestra es dato que se pierde
//    sin ruido, al revés. El mapeo sigue vivo en el estado del cliente (D-04), así que volver a
//    prender el toggle lo recupera; lo que no se escribe es lo que la pantalla no estaba diciendo.
//
// 2. **Un servicio borrado en el paso 2 no puede viajar en el payload** (Pitfall 7). Si su id
//    sobrevivió en el estado de un bloque, la FK compuesta `tbs_service_same_tenant` (migr. 073)
//    rebota con `23503` y —como el RPC de la migr. 074 es todo-o-nada— se revierte LA AGENDA
//    ENTERA: el negocio sale del alta sin ningún horario por un chip fantasma. El filtro contra los
//    servicios vigentes es la segunda capa; la primera es la limpieza del estado en `removeService`.
//
// Lo que este módulo NO hace: reimplementar el contrato del payload. La forma de cada bloque, el
// `id ?? null` que lo convierte en INSERT, el dedupe de ids y la traducción de `''` a `null` los
// decide `buildSaveHoursPayload`, que ya tiene suite propia. Acá sólo se adapta el shape del alta
// (que no tiene sedes, ni etiquetas, ni ids de franja) y se aplican las dos reglas de arriba.

import { buildSaveHoursPayload, type AgendaBlockPayload } from '@/lib/agenda-hours-payload'

/**
 * Una franja del paso Horarios del alta, tal como la tiene el wizard mientras el dueño la edita.
 *
 * No tiene `id` —ninguna de estas franjas existe todavía en la base— ni `label` ni `location_id`:
 * el alta no ofrece ni etiquetas ni sedes. `service_ids` vacío = franja COMODÍN (D-01): la ausencia
 * de mapeo ES la regla, no un dato faltante.
 */
export type OnboardingBlockDraft = {
  start_time: string
  end_time: string
  service_ids: string[]
}

/** Un día del paso Horarios: abierto/cerrado y sus franjas. El índice en el arreglo es el día. */
export type OnboardingDayDraft = {
  enabled: boolean
  blocks: OnboardingBlockDraft[]
}

/**
 * El estado deseado COMPLETO de la agenda del negocio recién creado, listo para `save_agenda_blocks`.
 *
 * @param days           Los SIETE días del wizard. El índice en el arreglo es el `day_of_week`, así
 *                       que cerrar un día NO corre la numeración de los que siguen.
 * @param mapServices    Si el mapeo franja↔servicio se persiste. `false` ⇒ TODAS las franjas viajan
 *                       en comodín, aunque el estado local tenga chips marcados (D-10).
 * @param liveServiceIds Los ids de los servicios que esta alta está creando de verdad. Todo id de un
 *                       bloque que no esté acá se descarta (Pitfall 7).
 */
export function buildOnboardingAgendaPayload(
  days: OnboardingDayDraft[],
  { mapServices, liveServiceIds }: { mapServices: boolean; liveServiceIds: string[] },
): AgendaBlockPayload[] {
  const vigentes = new Set(liveServiceIds)
  return buildSaveHoursPayload(
    days.map(day => ({
      enabled: day.enabled,
      blocks: day.blocks.map(block => ({
        start_time: block.start_time,
        end_time: block.end_time,
        // El alta no tiene etiquetas ni sedes: cadenas vacías, que el constructor del payload
        // traduce a `null`. Y sin `id`, así el RPC trata cada franja como INSERT.
        label: '',
        location_id: '',
        service_ids: mapServices ? block.service_ids.filter(id => vigentes.has(id)) : [],
      })),
    })),
    // En el alta nunca hay consultorios cargados, así que ningún bloque se descarta por no tener
    // sede y todos viajan con consultorio nulo — la grilla única de siempre.
    { hasLocations: false },
  )
}
