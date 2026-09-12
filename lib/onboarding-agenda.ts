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
import { hasScheduleCoverage } from '@/lib/time-block-services'

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

// ── El dato del aviso de D-07: qué servicios no cubre NINGUNA franja del alta ───────────────────
//
// Lo que cambió y hace que esto valga la pena: hasta la Phase 20 un servicio sin franja que lo diera
// era INVISIBLE en la página pública. Desde la Phase 20 aparece deshabilitado con la frase "Sin
// horarios disponibles". O sea que el estado dejó de ser inocuo, y el alta puede anticiparlo.

/**
 * Las franjas ABIERTAS de la grilla del alta, con una identidad estable para cada una.
 *
 * La clave es `${día}-${índice}`, la MISMA que ya usa el estado de colapso de los chips del paso
 * Horarios: ninguna de estas franjas existe todavía en la base, así que la identidad hay que
 * fabricarla, y fabricar una segunda la volvería a inventar en otro lado.
 *
 * Sólo los días con `enabled: true`. Un día cerrado puede conservar bloques en el estado local (el
 * wizard no los borra al cerrarlo), y contarlos diría que un servicio está cubierto por una franja
 * que no se va a persistir.
 */
export function onboardingDraftBlocks(days: OnboardingDayDraft[]): { id: string; service_ids: string[] }[] {
  return days.flatMap((day, dayIndex) =>
    day.enabled
      ? day.blocks.map((block, idx) => ({ id: `${dayIndex}-${idx}`, service_ids: block.service_ids }))
      : [],
  )
}

/**
 * Los servicios del paso 2 que NINGUNA franja abierta cubre (el dato del aviso de D-07).
 *
 * ⚠ 1. Se apoya en `hasScheduleCoverage`, NUNCA en `isServiceScheduled`. La cruda FILTRA las
 * franjas, así que con CERO franjas devuelve `[]` y da `false` para **todo** servicio. En el alta
 * cerrar los siete días es un click, y ahí el aviso pasaría de informar a decirle al dueño que su
 * catálogo ENTERO se quedó sin horario — un aviso que grita cuando no pasa nada es un aviso que se
 * aprende a ignorar. Es literalmente CR-01 del code review de la Phase 20, la misma trampa que ya
 * mordió una vez. (El CONTEXT de esta fase, `21-CONTEXT.md:82` y `:112`, nombra la función
 * equivocada: la corrección queda registrada acá.) Sin franjas la pregunta "¿qué franja da este
 * servicio?" no tiene sujeto, y la ausencia de dato significa "todo vale", nunca "nada vale".
 *
 * ⚠ 2. El `business_id` va en cadena vacía porque el contrato D-16 de `lib/time-block-services`
 * dice que el caller ya filtró por tenant ANTES de llamar — y en el alta se cumple trivialmente:
 * todas estas filas se fabrican desde el estado local del wizard del negocio que se está creando,
 * no salen de ninguna query. Es el mismo molde que ya usa el adaptador de la línea de chips del
 * panel (`components/agenda/block-services-line.tsx`).
 *
 * ⚠ 3. Las filas de servicio sin nombre se ignoran: `handleFinish` ya las descarta al insertar, así
 * que avisar sobre ellas sería avisar sobre un servicio que no va a existir.
 *
 * `false` NO bloquea nada (D-07): un servicio sin franja que lo cubra es un estado LEGAL —el dueño
 * está a mitad de configurar, D-06 de la Phase 18—, sólo que desde la Phase 20 tiene consecuencia
 * pública real. Por eso se informa en vez de impedir.
 */
export function servicesWithoutCoverage<S extends { id: string; name: string }>(
  services: S[],
  days: OnboardingDayDraft[],
): S[] {
  const draftBlocks = onboardingDraftBlocks(days)
  // Las filas sintéticas de la puente: una por cada servicio que declara cada franja. Una franja sin
  // ninguna fila ES el comodín (D-01) — la ausencia es la regla, no un dato faltante.
  const draftBridge = draftBlocks.flatMap(b =>
    b.service_ids.map(serviceId => ({ business_id: '', time_block_id: b.id, service_id: serviceId })),
  )
  return services.filter(s => s.name.trim() !== '' && !hasScheduleCoverage(s.id, draftBlocks, draftBridge))
}
