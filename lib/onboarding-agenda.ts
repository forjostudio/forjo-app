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

// ── "Vigente" es UNA sola regla, aplicada en TODOS los bordes (CR-01 del code review) ───────────
//
// La fila de servicio del paso 2 que se queda SIN NOMBRE no existe para el alta: `handleFinish` no
// la inserta. Pero su id puede seguir vivo adentro de un bloque del paso 4, porque el estado sólo se
// limpia cuando el servicio se BORRA (`removeService`), nunca cuando se le vacía el nombre — y
// vaciarlo está a una navegación hacia atrás y un select-all + delete.
//
// Cuando cada borde aplicaba su propio criterio, esa franja decía TRES cosas distintas a la vez:
//   - la línea de chips no pintaba el comodín (el id no estaba vacío) ni ningún chip marcado (el id
//     no estaba en el catálogo) ⇒ una franja que no decía nada;
//   - el aviso de D-07 la contaba como RESTRINGIDA ⇒ decía que el resto del catálogo se quedaba sin
//     horario;
//   - el payload la mandaba en COMODÍN (el id se caía contra `liveServiceIds`) ⇒ la base la guardaba
//     abierta a TODO el catálogo, que es la configuración más permisiva posible.
//
// O sea: el dato que se persistía era el opuesto del que el aviso afirmaba, y ninguno de los dos era
// el que la pantalla mostraba. Por eso el criterio se declara UNA vez acá y los tres bordes lo
// consumen; una segunda definición de "vigente" es exactamente cómo vuelven a divergir.

/** El criterio ÚNICO de "servicio vigente" del alta: la fila tiene nombre. */
export function esServicioVigente(service: { name: string }): boolean {
  return service.name.trim() !== ''
}

/**
 * Los ids que una franja declara DE VERDAD: los suyos, menos los que ya no están vigentes.
 *
 * Devolver `[]` NO es "perdimos el dato": es la franja diciendo comodín (D-01), que es exactamente
 * lo que se va a persistir. El mapeo original sigue intacto en el estado del wizard, así que volver
 * a escribir el nombre del servicio lo recupera entero.
 */
export function franjaServiceIdsVigentes(serviceIds: string[], vigentes: ReadonlySet<string>): string[] {
  return serviceIds.filter(id => vigentes.has(id))
}

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
        service_ids: mapServices ? franjaServiceIdsVigentes(block.service_ids, vigentes) : [],
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
 * ⚠ 3. Las filas de servicio sin nombre se ignoran DE LOS DOS LADOS, y eso es CR-01 del code review
 * de esta fase: no alcanza con no nombrarlas en la salida, hay que sacarles el id de las franjas
 * ANTES de razonar. Mientras el aviso miraba los `service_ids` CRUDOS, una franja cuyo único
 * servicio declarado se había quedado sin nombre contaba como restringida-a-nada y el aviso denunciaba
 * al resto del catálogo — mientras el payload, que sí filtraba, la persistía como COMODÍN, o sea
 * abierta a ese mismo catálogo. El aviso afirmaba lo contrario de lo que se guardaba. Por eso la
 * vigencia se aplica con `esServicioVigente`/`franjaServiceIdsVigentes`, las mismas dos funciones que
 * usan el payload y la línea de chips.
 *
 * `false` NO bloquea nada (D-07): un servicio sin franja que lo cubra es un estado LEGAL —el dueño
 * está a mitad de configurar, D-06 de la Phase 18—, sólo que desde la Phase 20 tiene consecuencia
 * pública real. Por eso se informa en vez de impedir.
 */
export function servicesWithoutCoverage<S extends { id: string; name: string }>(
  services: S[],
  days: OnboardingDayDraft[],
): S[] {
  const vigentes = new Set(services.filter(esServicioVigente).map(s => s.id))
  // El MISMO criterio que aplica el payload. Si el aviso razonara sobre ids que el payload descarta,
  // diría algo distinto de lo que se guarda — que es exactamente el bug que esto cierra.
  const draftBlocks = onboardingDraftBlocks(days).map(b => ({
    ...b,
    service_ids: franjaServiceIdsVigentes(b.service_ids, vigentes),
  }))
  // Las filas sintéticas de la puente: una por cada servicio que declara cada franja. Una franja sin
  // ninguna fila ES el comodín (D-01) — la ausencia es la regla, no un dato faltante.
  const draftBridge = draftBlocks.flatMap(b =>
    b.service_ids.map(serviceId => ({ business_id: '', time_block_id: b.id, service_id: serviceId })),
  )
  return services.filter(s => esServicioVigente(s) && !hasScheduleCoverage(s.id, draftBlocks, draftBridge))
}
