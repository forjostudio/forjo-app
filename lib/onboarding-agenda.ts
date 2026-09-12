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
 * ¿El rubro admite declarar "qué se da en esta franja"? (D-03)
 *
 * En 'canchas' un "servicio" ES una cancha con su propia agenda (v0.13), así que el mapeo duplicaría
 * ese eje con otro que no lo decide. Es un CONTROL oculto, no un paso oculto: canchas necesita
 * horarios igual, así que el paso Horarios se sigue mostrando. Vive acá y no como literal suelto en
 * el componente para que el gate de la UI y el del submit no se puedan separar.
 */
export function canMapServicesInVertical(vertical: string): boolean {
  return vertical !== 'canchas'
}

/**
 * ¿Se persiste el mapeo franja↔servicio? Las TRES condiciones, en un solo lugar que se puede testear.
 *
 * Vivía como una expresión suelta adentro del submit (`canMapServices && perFranja && !falloServicios`),
 * o sea adentro de un client component que el runner de este repo no puede renderizar
 * (`environment: 'node'`): se le podía invertir cualquiera de los tres términos y la suite entera
 * seguía verde. Y lo que decide es lo PEOR que puede salir mal de la fase — con `servicesFailed` mal
 * leído el payload referencia ids que nunca se insertaron, la FK compuesta `tbs_service_same_tenant`
 * (migr. 073) rebota con 23503 y el RPC todo-o-nada se lleva puestas TAMBIÉN las franjas: el negocio
 * sale del alta sin ningún horario.
 *
 * @param vertical       El rubro elegido en el paso 1 (estado local: el negocio todavía no existe).
 * @param perFranja      El toggle del paso Horarios, tal como quedó al finalizar (D-10).
 * @param servicesFailed Si el INSERT de servicios falló. `true` ⇒ jamás se mapea: los ids no existen.
 */
export function shouldMapServices(
  { vertical, perFranja, servicesFailed }: { vertical: string; perFranja: boolean; servicesFailed: boolean },
): boolean {
  return canMapServicesInVertical(vertical) && perFranja && !servicesFailed
}

/**
 * El uuid con el que una fila de servicio del paso 2 nace, vive y se inserta (D-08/D-09).
 *
 * Es UNA sola clave para dos trabajos: el mapeo franja↔servicio del paso 4 se arma ANTES de que los
 * servicios existan en la base —así que necesita identidad estable desde que la fila nace— y a la vez
 * tiene que coincidir con el id real de la fila insertada. El mismo uuid viaja en el INSERT a
 * `services` y en el payload del RPC. Lo que NO se hace es correlacionar por posición lo insertado
 * con lo devuelto: PostgreSQL no garantiza el orden de un `INSERT … RETURNING` de varias filas, y por
 * eso el insert de servicios tampoco lleva `.select()`.
 *
 * ⚠ `Crypto.randomUUID` es `[SecureContext]`: en un origen que NO es https el método no existe —no es
 * que falle, no está—, así que llamarlo directo tira `TypeError`. Y esto corre en el inicializador
 * lazy de un `useState`, o sea durante el primer render y sin error boundary arriba: la pantalla del
 * alta quedaba EN BLANCO. `https://` en producción está bien; `http://192.168.x.x:3000` —que es como
 * se hace la UAT desde el celular en este proyecto— no lo estaba, y es justo el dispositivo donde la
 * UAT encuentra los bugs. Por eso degrada en vez de tirar (WR-02).
 *
 * `getRandomValues` NO es secure-context, así que la rama del medio es la que corre de verdad en la
 * LAN. La de `Math.random` es la última red: un entorno sin `crypto` tampoco puede dejar la pantalla
 * en blanco, y la unicidad que hace falta acá es dentro de UNA sesión del wizard — la real la
 * garantiza la PK de `services`.
 *
 * Vive en este módulo puro y no en el componente por el mismo motivo que todo lo demás de acá: en un
 * client component que el runner no renderiza, la rama del fallback no se puede ejercitar, y un
 * fallback que nunca se corrió es una suposición, no una red.
 */
export function newServiceId(): string {
  const c = globalThis.crypto
  if (typeof c?.randomUUID === 'function') return c.randomUUID()
  const bytes = new Uint8Array(16)
  if (typeof c?.getRandomValues === 'function') c.getRandomValues(bytes)
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256)
  // Versión 4 y variante RFC 4122, igual que lo que devuelve randomUUID: la columna es `uuid` y el id
  // viaja en el payload del RPC, así que la FORMA tiene que ser la misma por las tres ramas.
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** La duración mínima de un servicio. Menos que esto es entrada degenerada para la grilla horaria. */
export const MIN_SERVICE_MINUTES = 5

/**
 * El valor de un `<input type="number">` → número, sin dejar pasar JAMÁS un no-finito (WR-03).
 *
 * `parseInt('')` y `parseFloat('')` dan `NaN`; `JSON.stringify({ duration_minutes: NaN })` serializa
 * `null`; y `services.duration_minutes` / `services.price` son NOT NULL ⇒ 23502. Como el insert de
 * servicios es UNA sola sentencia multi-fila, un campo vaciado no pierde esa fila: pierde el catálogo
 * ENTERO. Y desde esta fase se lleva además el mapeo franja↔servicio, porque `falloServicios` degrada
 * la agenda a comodín. O sea: un backspace de más en "Min." costaba el catálogo y la agenda.
 *
 * Nada de esto lo atajaba la validación existente: `validateServicePrice` sólo mira `< 0` y
 * `NaN < 0` es `false`, y `validateServiceName` lee `NaN !== 30` como `true`.
 *
 * ⚠ La cadena vacía se chequea ANTES y aparte, y no es un detalle: `Number('')` es `0`, no `NaN`, así
 * que la versión "obvia" (`Number.isFinite(Number(value)) ? … : fallback`) no tira el campo vaciado
 * al default — lo convierte en CERO. Cambiaría reventar el insert por persistir un servicio de 0
 * minutos, que es entrada degenerada para la grilla horaria: el mismo bug con otro disfraz. Lo mismo
 * con `'   '`, que también da `0`.
 */
export function toNumberOr(value: string, fallback: number): number {
  if (value.trim() === '') return fallback
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

// ── El borde donde el texto de un formulario se vuelve el número que se persiste (G-21-11) ──────
//
// Estas tres piezas las consumen las TRES superficies que escriben `services`: el paso 2 del alta,
// el panel de canchas y el panel de servicios de Ajustes. Viven ACÁ, y no adentro de cada
// componente, por el mismo motivo que todo lo demás de este módulo: el runner corre con
// `environment: 'node'` y no puede renderizar un client component, así que la rama del fallback
// quedaría sin ejercitar — y un fallback que nunca corrió es una suposición, no una red.
//
// La otra mitad del motivo es que la regla se escribía distinta en cada pantalla, y cada variante
// fallaba distinto: `parseInt(x)` sin fallback daba `NaN` (⇒ `null` ⇒ 23502 contra una columna NOT
// NULL, y en el alta eso se lleva el catálogo ENTERO porque el insert es UNA sentencia multi-fila),
// y `parseInt(x) || 0` daba **0**, que sí se guarda y produce un desajuste silencioso: el dueño cree
// que el servicio dura X y el motor reserva 30. Una sola definición no puede divergir de sí misma.

/** El default de duración del paso 2 y de los dos formularios de Ajustes, con un solo nombre. */
export const DEFAULT_SERVICE_MINUTES = 30

/**
 * El texto del campo "Min." → los minutos que se van a guardar, más el aviso si hubo corrección.
 *
 * Las dos entradas degeneradas NO son la misma cosa y por eso no reciben el mismo trato:
 *
 * - **Vaciar el campo** (`''`, `'   '`, o basura que no es número) es volver al default. No avisa:
 *   el dueño está a mitad de escribir, y el 30 que la pantalla vuelve a mostrar al salir del campo
 *   ya dice todo lo que hay que decir.
 * - **Tipear `0` o un negativo** es una duración imposible para la grilla horaria. Se corrige al
 *   mínimo Y avisa, porque acá el valor guardado NO es el que el dueño escribió.
 *
 * Se redondea antes de comparar contra el mínimo porque `services.duration_minutes` es `integer`:
 * mandar `7.5` a una columna entera es otra forma de que el insert rebote lejos del formulario.
 * El texto del aviso es el que ya usaba la validación inline del alta, movido tal cual: una segunda
 * redacción de la misma regla es una segunda regla esperando divergir.
 */
export function normalizeServiceDuration(raw: string): { value: number; warning?: string } {
  const n = Math.round(toNumberOr(raw, DEFAULT_SERVICE_MINUTES))
  if (n >= MIN_SERVICE_MINUTES) return { value: n }
  return {
    value: MIN_SERVICE_MINUTES,
    warning: `La duración mínima es de ${MIN_SERVICE_MINUTES} minutos: la ajustamos a ${MIN_SERVICE_MINUTES}. Escribí cuántos minutos dura el servicio.`,
  }
}

/**
 * El texto del campo "Precio" → el número que se va a guardar, más el error si es negativo.
 *
 * Precio 0 es VÁLIDO (servicio gratuito, D-09), así que el campo vaciado cae a 0 sin error. El
 * negativo avisa pero **conserva lo tipeado**: es el comportamiento que ya tenía
 * `validateServicePrice` y este plan no vino a cambiarlo — corregirle el signo al dueño sin
 * preguntarle es adivinarle la intención.
 */
export function normalizeServicePrice(raw: string): { value: number; error?: string } {
  const value = toNumberOr(raw, 0)
  return value < 0 ? { value, error: 'El precio no puede ser negativo' } : { value }
}

/**
 * Las filas de `services` que un formulario manda al insert, con los números ya normalizados.
 *
 * Es el ÚNICO punto donde el texto del formulario se vuelve el número que viaja a la base, y por eso
 * es una capa aparte de la normalización onBlur de la pantalla: si alguien confiara sólo en el blur,
 * un submit que no lo dispare (Enter, click directo en Finalizar desde el campo enfocado) volvería a
 * mandar una cadena vacía contra una columna NOT NULL.
 *
 * Filtra por `esServicioVigente` —el mismo criterio único que usan el payload de la agenda y la
 * línea de chips— y conserva el `id` de entrada: el mapeo franja↔servicio del paso 4 lo referencia,
 * y correlacionar por posición lo insertado con lo devuelto es el Pitfall 1 de esta superficie.
 *
 * El `business_id` sale SIEMPRE del argumento (derivado de la sesión), nunca de la fila: ningún
 * campo de formulario puede influirlo.
 */
export function buildServiceRows<S extends { id: string; name: string; duration_minutes: string; price: string }>(
  services: S[],
  businessId: string,
): { id: string; name: string; duration_minutes: number; price: number; business_id: string }[] {
  return services.filter(esServicioVigente).map(s => ({
    id: s.id,
    name: s.name,
    duration_minutes: normalizeServiceDuration(s.duration_minutes).value,
    price: normalizeServicePrice(s.price).value,
    business_id: businessId,
  }))
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
