import { useCallback, useEffect, useRef, useState } from 'react'
import { PANEL_MORE, PANEL_ROOT, applyPanelUnder, consumeOwnedBranchEntry, isForeignOwnedEntry, panelBranchPlan, panelNavMode, panelUnderRoute, writePanelUnder, type PanelBranchPlan } from '@/lib/panel-history'
// Los dos helpers del teclado, PUROS y ya exportados, y el hash base de los overlays. Se IMPORTAN:
// esos dos módulos no se tocan (son intocables de la fase), y reusar sus helpers medidos es lo
// contrario de copiarlos.
import { OVERLAY_HASH_BASE, isSoftKeyboardInset, softKeyboardGuardsBack } from '@/lib/overlay-history'
import { DIRTY_HASH_BASE } from '@/lib/dirty-history'

// ── El toqueteo de la pila de la RAMA DE MÁS, y el hook que lo cablea (D-03 / criterio 2) ────────
//
// POR QUÉ EXISTE ESTE ARCHIVO, Y POR QUÉ NO ES PARTE DE NINGUNO DE LOS DOS QUE YA HABÍA
// Son dos restricciones que se cruzan, y cada una por su lado descarta el lugar obvio:
//   · El candado estático de la Phase 2 exige CERO mutaciones crudas de historial en los tres
//     componentes nuevos (la barra, el header y la pantalla Más). Así que el toqueteo de la pila no
//     puede vivir en la barra: tiene que vivir en un módulo de `lib/`.
//   · `lib/panel-history.ts` evita A PROPÓSITO importar React, para no arrastrarlo al grafo de sus
//     funciones puras —ni al de su suite—. Así que el hook no puede vivir allá.
// De ahí este tercer archivo: la decisión pura sobre rutas se queda en `panel-history`, y acá vive
// lo que necesita React y lo que necesita el evento del retroceso.
//
// LAS TRES LECCIONES MEDIDAS QUE GOBIERNAN EL EJECUTOR (ninguna es teoría: las tres están medidas
// contra la app real, y dos de ellas se pagaron con bugs de producción en este repo)
//   1) La guarda de la marca se RE-VERIFICA EN EL MOMENTO DEL GESTO, no al renderizar ni al decidir.
//      Entre una cosa y la otra pudo haber una escritura ajena que se llevó la marca, y operar sobre
//      una entrada que ya no es nuestra EXPULSA AL DUEÑO DEL SITIO.
//   2) El listener del segundo paso se engancha EN EL GESTO Y CON DISPARO ÚNICO, nunca desde un
//      efecto. El retroceso del consumo es una navegación a la misma ruta y puede hacer que la
//      pantalla vuelva a montar: un listener que dependa de un efecto —y de que una bandera siga
//      encendida cuando ese efecto corre— SE PIERDE EL EVENTO y el gesto queda a medias.
//   3) La navegación NO se ejecuta adentro del evento. Ahí el router de Next está procesando su
//      propio recorrido (su listener corre antes que el nuestro y escribe el reemplazo de la entrada
//      a la que volvimos): una navegación pedida ahí mismo SE LLAMA, NO ESCRIBE NADA y el dueño se
//      queda donde estaba. Se deja pedida en estado y la ejecuta un efecto, o sea desde un commit.
// El molde entero es `components/dashboard/unsaved-changes-guard.tsx:150-220`, que corre en
// producción desde el quick 261006-iey.
//
// QUÉ NO HACE
//   · NO importa el router de Next: el pathname y la navegación ENTRAN COMO PARÁMETROS. Es lo que
//     deja a este módulo vivir en `lib/` sin arrastrar el router a su grafo, y lo que hace que su
//     suite pueda cubrir el ejecutor entero sin montar un componente.
//   · NO declara frontera de cliente, igual que los otros dos módulos de historial: el consumidor ya
//     la declara, y marcarla acá arrastraría estas funciones puras —y su suite— adentro de la
//     frontera.
//   · NO decide la política: la consume de `lib/panel-history.ts`. Un segundo dialecto de la regla
//     es exactamente lo que NAV-05 viene a evitar.
//   · NO agrega ningún affordance visible de la RAMA (D-04): ni ilumina Más estando en su rama, ni
//     pone un volver-a-Más, ni un breadcrumb. La única superficie visible que la fase agrega es el
//     **aviso de salida** de MOB-05, y este módulo tampoco lo dibuja: expone `hintVisible` y lo
//     dibuja el componente (que es lo que mantiene el candado de cero mutaciones crudas de historial
//     en la barra, y lo que hace que el aviso pueda ser HERMANO de la barra — necesario para D-05,
//     porque la barra está oculta por CSS en escritorio).

/** Los dos modos con los que el router puede ejecutar una navegación. */
export type BranchNavMode = 'push' | 'replace'

/**
 * La navegación, recibida como CALLBACK.
 *
 * El modo es la unión de los dos literales y no una cadena genérica a propósito: con una cadena, el
 * call site podría pedir un modo que el router no tiene y nada se pondría rojo.
 */
export type BranchNavigate = (href: string, mode: BranchNavMode) => void

/** Qué hacer cuando llega el evento del primer retroceso del colapso. */
export type BranchSecondStep = 'abort' | 'second-consume' | 'navigate'

/**
 * La decisión del SEGUNDO PASO del colapso, pura y con las reglas en orden.
 *
 * ⚠ **POR QUÉ EL CASO DEGENERADO SE DECIDE ACÁ Y NO EN LA DECISIÓN DE RUTAS.** `panelBranchPlan`
 * recibe el par de rutas y el hecho, y con eso no alcanza: para saber si el destino coincide con la
 * ruta que quedaría debajo hay que **leer la marca de la entrada de Más**, y esa entrada sólo está
 * arriba del stack **después** del primer consumo. O sea que la rama existe recién en este momento,
 * y no un instante antes. Medido en el escenario **E-5** de
 * `.planning/debug/pila-de-dos-niveles-medida.md`, donde leer la marca después del primer retroceso
 * devuelve la ruta correcta.
 *
 * Las reglas:
 *   1. **Si no estamos parados en Más ⇒ abortar.** El evento no es el de nuestro consumo: o el dueño
 *      ya salió por otro camino, o alguien más retrocedió. Navegar ahí lo mandaría a un destino
 *      viejo. Es la misma guarda que el provider del guard de cambios sin guardar pone comparando la
 *      ruta actual contra la que se estaba dejando.
 *   2. **Si la ruta de abajo coincide con el destino ⇒ consumir por segunda vez.** El dueño ya está
 *      volviendo ahí; reemplazar dejaría dos entradas idénticas adyacentes, que es literalmente lo
 *      que el criterio 2 prohíbe (un atrás que no hace nada visible).
 *   3. **Si no coincide —o la marca se perdió— ⇒ navegar.** Sin el hecho no se retrocede: es la
 *      regla 0 repetida en el segundo paso, y la degradación segura de toda la fase.
 */
export function branchSecondStep({
  parado,
  more,
  rutaDebajo,
  to,
}: {
  parado: string
  more: string
  rutaDebajo: string | null
  to: string
}): BranchSecondStep {
  if (parado !== more) return 'abort'
  if (rutaDebajo !== null && rutaDebajo === to) return 'second-consume'
  return 'navigate'
}

// ── El RASTREO del retroceso y el CANAL de propagación: dos datos a nivel de módulo ─────────────
//
// Los dos usan el molde de estado mutable de módulo que el repo ya aplica para el serial y la
// instancia dueña (más abajo) y para los dos rastreadores del teclado: nada nuevo, y nada que haga
// falta un temporizador — el diferimiento de esta fase va por estado y un efecto (lección 3).

/**
 * La ruta en la que aterrizó el último retroceso. **Es LA RUTA y no un booleano**, y el motivo está
 * medido, no supuesto.
 *
 * ⚠ **POR QUÉ UN BOOLEANO ESTÁ PROHIBIDO ACÁ.** Un retroceso que **no cambia** la ruta —el que el
 * sentinel de salida absorbe en Inicio— dejaría la bandera encendida; el efecto de marcado **no
 * vuelve a correr** (sus dependencias no cambiaron) y el **próximo empuje de verdad** quedaría
 * suprimido **en silencio**: la política degradaría a un nivel sin que nada se ponga rojo. Guardando
 * la ruta, la supresión aplica **sólo** si la ruta actual coincide con la del aterrizaje.
 */
let rutaDelUltimoRetroceso: string | null = null

/**
 * Anota el aterrizaje de un retroceso. Lo llama el oyente del `popstate` del hook, con la ruta leída
 * de la **ubicación real** y no del render: cuando el evento llega, el commit todavía no ocurrió.
 *
 * Exportado **sólo** para poder cubrir el rastreo sin montar React, igual que {@link nextBranchId}.
 */
export function recordBackLanding(route: string): void {
  rutaDelUltimoRetroceso = route
}

/**
 * Lee el aterrizaje anotado **y lo descarta**. Se llama en **toda** corrida del efecto de marcado,
 * haya suprimido o no: un dato que sobrevive a una corrida suprimiría un empuje que nadie pidió
 * suprimir.
 */
export function takeBackLanding(): string | null {
  const ruta = rutaDelUltimoRetroceso
  rutaDelUltimoRetroceso = null
  return ruta
}

/** El pedido de propagación: el destino que lo pidió, y la ruta REAL que quedó debajo. */
export type BranchMarkRequest = { destino: string; rutaDebajo: string | null }

/**
 * El canal de propagación. **Es UNO**, y lo consume **sólo** {@link applyBranchMarkRequest} desde el
 * efecto de marcado, que es el único lugar que observa la ruta en todo commit del panel.
 *
 * **Tiene DOS PRODUCTORES (2026-10-28, plan 03-11), y los dos cumplen la MISMA condición**, que es
 * la que de verdad importa y por eso se escribe como invariante:
 *
 *   ⚠ **SÓLO LLENA ESTE CANAL QUIEN *LEYÓ* LA ENTRADA DE ABAJO.**
 *
 *   1. **el segundo paso del colapso** — parado sobre la entrada de Más, lee su marca justo antes de
 *      que el reemplazo la pise; y
 *   2. **el gesto que reemplaza** ({@link branchCarryMark}, llamado desde `handleNavigate`) — lee la
 *      marca de la entrada de arriba antes de que el `<Link>` haga su `replace`, que es el único
 *      momento en que ese valor existe.
 *
 * Los dos producen el mismo dato —*qué quedó debajo*, **leído**— y por eso son un **segundo
 * productor del MISMO canal** y no un mecanismo nuevo: escriben por el **escritor único**, se
 * **descartan siempre** y **no inventan** rutas. Un segundo *dialecto* de la misma regla es lo que
 * NAV-05 viene a evitar; un segundo productor con la **misma** disciplina, no.
 *
 * **Y el consumidor sigue siendo UNO, que es lo que no cambia.** Dos consumidores serían dos lugares
 * donde descartar el pedido —y el día que uno se olvide, una marca rancia cae sobre una entrada
 * ajena—. Agregar un productor no agrega un consumidor: el pedido se sigue drenando en el mismo
 * efecto, en todo commit del panel.
 *
 * ⚠ **Y por eso el provider del guard de cambios sin guardar NO SE TOCA:** ejecuta el MISMO colapso
 * para el caso vivo de `/web` llamando a {@link runBranchNavigation}, así que su propagación sale
 * gratis por este mismo canal. Cablearla allá también serían **dos** consumidores y un segundo
 * dialecto de la misma regla. ⚠ **Su residuo, declarado (2026-10-28):** el `case 'replace'` del
 * guard navega por su cuenta y **no** pasa por `handleNavigate`, así que en una pantalla **sucia** la
 * marca se sigue perdiendo y el gesto siguiente hacia Inicio queda **un escalón más largo** — nunca
 * una expulsión. Se **acepta** con el mismo criterio que el residuo de escritorio del plan 03-09:
 * cablearlo allá exigiría una **segunda** lectura del estado en el mismo gesto (dos verdades que
 * pueden diferir) más un parámetro nuevo en el ejecutor compartido. Queda escrito en los cuatro
 * lugares donde se puede leer: acá, el documento de debug, la precisión de MOB-04 y la entrada 18 de
 * `.planning/WINDOWS.md`.
 */
let marcaPedida: BranchMarkRequest | null = null

/** Deja pedida la propagación. Privada a propósito: los productores son los DOS de acá arriba. */
function pedirMarcaPropagada(destino: string, rutaDebajo: string | null): void {
  marcaPedida = { destino, rutaDebajo }
}

/**
 * **EL ÚNICO CONSUMIDOR DEL CANAL.** Devuelve `true` si había un pedido **para esta ruta** —en cuyo
 * caso la decisión de marcado **no se consulta**, porque el dato es más preciso que cualquier
 * derivación: viene de haber **leído** la entrada de abajo— y `false` si no.
 *
 * **El pedido se descarta SIEMPRE**, coincida o no. Un pedido que sobrevive a una navegación que
 * **no ocurrió** escribiría una marca rancia en una entrada **ajena**: el mismo bug, del otro lado.
 *
 * **Y sin ruta de abajo no se deriva ninguna.** Si la marca de la entrada de Más se había perdido, lo
 * que quedó debajo del destino es desconocido, y escribir la ruta de Más sería la mentira que esta
 * función existe para no decir. Quedarse sin marca deja una pila un escalón más larga —la
 * degradación segura de toda la fase—; una marca falsa deja al dueño **fuera del sitio**.
 */
export function applyBranchMarkRequest(current: string): boolean {
  const pedido = marcaPedida
  marcaPedida = null
  if (pedido === null) return false
  if (pedido.destino !== current) return false
  // La escritura va por el ESCRITOR ÚNICO, así que hereda sus dos guardas (la regla 0 y la
  // idempotencia). Este canal no tiene guardas propias a propósito: dos juegos de guardas es cómo se
  // pierde uno de los dos sin que ningún gate lo vea.
  if (pedido.rutaDebajo !== null) writePanelUnder(pedido.rutaDebajo)
  return true
}

/**
 * **EL SEGUNDO PRODUCTOR DEL CANAL: la marca de la rama VIAJA por encima del `replace`** (`G3-1`,
 * plan 03-11, medido en el escenario `E-17`). Devuelve `true` si dejó el pedido y `false` si se
 * abstuvo.
 *
 * **QUÉ RESUELVE.** La marca se escribe **sólo cuando la política dice empujar**
 * ({@link applyPanelUnder}), y el reemplazo de sección a sección deja que el router escriba su propio
 * state encima — la *escritura blanda* que la lista de *quién borra esta marca* ya nombraba—. Así que
 * en una **cadena** de reemplazos (`Inicio → Turnos → Clientes → Agenda`) la marca se escribe una vez
 * y **nadie la vuelve a escribir**: parado en Agenda la entrada no tiene marca, el hecho de la regla
 * `-1c` es **falso** y el gesto hacia Inicio **empuja**. Medido por contraste en el mismo motor y el
 * mismo día: una sola sección **pasa**, cuatro **fallan**, y la única diferencia es **un** reemplazo.
 *
 * **EL ENUNCIADO ES DE LA PILA Y NO DEL SÍNTOMA: un `replace` NO CAMBIA lo que quedó debajo.** Lo que
 * había debajo del origen es, por definición, lo que queda debajo del destino. Por eso la marca no se
 * **deriva** del par de rutas —el par dice `replace` y la derivación daría `null`, que es justo el
 * bug— sino que se **propaga**: viaja el valor que se **leyó**.
 *
 * ⚠ **POR QUÉ EL VALOR ENTRA COMO PARÁMETRO Y NO SE LEE ACÁ.** Es la misma frontera que el resto del
 * módulo ya tiene con los hechos de la pila: la lectura de `window.history.state` ya está hecha **una
 * vez por gesto** en `handleNavigate`. Dos lecturas del estado en el mismo gesto son **dos verdades
 * que pueden diferir** — entre una y otra pudo haber una escritura blanda que se llevó la marca
 * (lección 1). Y acá es el **único** momento en que el valor existe: para cuando el efecto de marcado
 * corre, el `<Link>` ya reemplazó.
 *
 * ⚠ **POR QUÉ RECIBE EL PLAN Y NO EL MODO DE RUTAS.** El plan es el **único** resultado del gesto, así
 * que un miembro nuevo mañana no se puede colar por el costado: los cuatro miembros que no son los dos
 * del `<Link>` tienen su propio camino, y el colapso **ya** produce sobre este canal.
 *
 * ⚠ **LA FRONTERA DEL ARREGLO:** {@link panelNavMode} y {@link panelBranchPlan} **no se tocan**. La
 * regla `-1c` ya era correcta; lo que faltaba era que el hecho que lee **estuviera ahí**.
 *
 * Las reglas, **en orden**, y la del valor leído **va última** para que los dos casos de arriba se
 * resuelvan por **su** propio motivo y no por casualidad de que la marca estuviera ausente:
 *   1. **no es un reemplazo ⇒ no se pide nada.** Un empuje **crea** una entrada y la decisión de
 *      marcado ya sabe qué quedó debajo; pedirlo además sería un segundo camino de escritura para el
 *      mismo hecho. Los otros cuatro miembros tienen su propio camino.
 *   2. **el destino es la MISMA ruta ⇒ no se pide nada.** Ahí el reemplazo cae **sobre la misma
 *      entrada** y el pathname **no cambia**, así que el efecto de marcado **no vuelve a correr** y el
 *      pedido sobreviviría a una navegación que **no es la que lo pidió**: una marca rancia sobre una
 *      entrada ajena, el mismo bug del otro lado.
 *   3. **sin ruta leída NO SE INVENTA NINGUNA.** Con la marca ya perdida antes del reemplazo, lo que
 *      queda debajo del destino es **desconocido**: escribir la ruta de la que venimos sería la
 *      mentira que {@link applyBranchMarkRequest} existe para no decir. Se abstiene, y la pila queda
 *      un escalón más larga — la **degradación segura** de toda la fase, nunca una expulsión.
 */
export function branchCarryMark({
  plan,
  from,
  to,
  rutaDebajo,
}: {
  plan: PanelBranchPlan
  from: string
  to: string
  /** La ruta que se **LEYÓ** de la entrada de arriba, o `null` si esa entrada no llevaba marca. */
  rutaDebajo: string | null
}): boolean {
  if (plan !== 'replace') return false
  if (from === to) return false
  if (rutaDebajo === null) return false
  pedirMarcaPropagada(to, rutaDebajo)
  return true
}

/**
 * Deshace **nuestra** entrada del sentinel de salida. Devuelve `true` si consumió algo, `false` si no
 * tocó nada. Es el primero de los dos pasos de `consume-exit-then-navigate`.
 *
 * ⚠ **POR QUÉ ES UNA TERCERA FUNCIÓN HERMANA** de `consumeOwnedPanelEntry` y
 * {@link consumeOwnedBranchEntry}, y no una extensión de ninguna: cada una pregunta por **su** marca,
 * y ésa es toda la disciplina que hace que cuatro módulos puedan convivir sobre **una** pila. La
 * entrada del sentinel la empujó este módulo con {@link panelExitState}, no el router: preguntada por
 * la marca de subsección o por la de la rama, las dos devolverían `false` siempre.
 *
 * ⚠ **Y LA DIFERENCIA QUE HAY QUE ESCRIBIR: ésta pregunta por la marca de ESTA INSTANCIA**, no sólo
 * por "algún dueño de salida". Es {@link isPanelExitEntry} con nuestro `id`, no `isForeignOwnedEntry`:
 * dos dueños por la misma entrada **descuadran el conteo de retrocesos** y dejan un atrás muerto o uno
 * de más. Es también lo que deja que el **otro** consumidor del ejecutor —el provider del guard de
 * cambios sin guardar, que **no es** dueño del sentinel— pueda negarse en vez de retroceder.
 *
 * ⚠ **LA GUARDA SE REPITE ACÁ, y no se confía en que ya se chequeó arriba** (cicatriz 2, ya sufrida
 * tres veces en este repo): un retroceso sobre una entrada que no empujamos nosotros **expulsa al
 * dueño del sitio**. Es la misma disciplina que los otros tres dueños declaran en **cada** punto de
 * retroceso.
 *
 * ⚠ **`history.back()` es ASÍNCRONO.** El call site tiene que PREVENIR la navegación y pedir la suya
 * **desde el evento** del retroceso, nunca en el mismo tick.
 */
export function consumeOwnedExitSentinel({ id }: { id: number }): boolean {
  if (!isPanelExitEntry(window.history.state, id)) return false
  window.history.back()
  return true
}

/**
 * El ejecutor. Devuelve `true` si **se hizo cargo** del gesto (⇒ el call site tiene que PREVENIR la
 * navegación) y `false` si no (⇒ el call site deja navegar, y la pila queda un escalón más larga:
 * la degradación segura).
 *
 * **De los seis miembros del plan le llegan cuatro**: subir, colapsar, consumir-el-sentinel-y-navegar
 * y nada. Empujar y reemplazar los ejecuta el `<Link>`, con su prefetch y su transición — por eso
 * devuelve `false` para los dos, en vez de reimplementar una navegación peor. *Nada* no toca nada y se
 * hace cargo.
 *
 * ⚠ **El diferimiento de la navegación es responsabilidad del CALL SITE, no de esta función** (ver
 * la lección 3 del encabezado): acá la navegación se recibe como callback y se **llama** desde el
 * evento. Quien la convierte en "pedida en estado y ejecutada por un efecto" es
 * {@link usePanelBranch}. Separarlo así es lo que deja cubrir el ejecutor entero en una suite pura.
 *
 * ⚠ **`exitId` es OPCIONAL, y esa opcionalidad ES el mecanismo de degradación** (T-03-30). Sin él, la
 * rama del sentinel **se niega** y devuelve `false` ⇒ el call site navega con la regla de rutas. Es lo
 * que recibe el provider del guard de cambios sin guardar, que ejecuta el **mismo** plan pero **no es
 * dueño** del sentinel: si retrocediera igual, estaría retrocediendo sobre una entrada **ajena** y
 * dejaría al dueño **fuera del sitio** con cambios sin guardar en pantalla — el peor resultado de todo
 * ese archivo.
 */
export function runBranchNavigation({
  plan,
  to,
  more = PANEL_MORE,
  root = PANEL_ROOT,
  navigate,
  exitId,
}: {
  plan: PanelBranchPlan
  to: string
  more?: string
  root?: string
  navigate: BranchNavigate
  /**
   * El id de la instancia **dueña** del sentinel de salida. **Opcional a propósito:** sin él la rama
   * del sentinel se niega, que es la degradación segura del consumidor que no es su dueño.
   */
  exitId?: number
}): boolean {
  // *Nada*: se hace cargo sin tocar la pila. Lo produce el plan 03-03.
  if (plan === 'none') return true
  // Los dos modos del `<Link>`: no son nuestros.
  if (plan === 'push' || plan === 'replace') return false

  // Subir es un paso solo: un retroceso guardado y listo. La guarda de la marca se re-verifica
  // adentro del consumo (lección 1), así que sin marca esto devuelve `false` y nadie retrocede.
  if (plan === 'up') return consumeOwnedBranchEntry()

  // ── Consumir el sentinel de salida y navegar: dos pasos, mismo molde que el colapso ───────────
  if (plan === 'consume-exit-then-navigate') {
    // Sin identificador de dueño NO se retrocede: es la degradación segura del consumidor que no es
    // dueño del sentinel (ver el ⚠ del docblock). Y va ANTES de enganchar nada, para no dejar un
    // listener vivo que nadie va a desenganchar.
    if (exitId === undefined) return false
    // El modo lo decide LA POLÍTICA DE RUTAS para el tramo raíz → destino (que es un empuje), no un
    // literal: un segundo dialecto de la regla es exactamente lo que NAV-05 viene a evitar.
    const modo = panelNavMode({ from: root, to, root, more })
    const segundoPaso = () => {
      // La navegación se deja PEDIDA desde el evento y la ejecuta un commit (lección 3): acá adentro
      // el router de Next está procesando su propio recorrido y una navegación pedida en este
      // momento SE LLAMA, NO ESCRIBE NADA y el dueño se queda donde estaba.
      navigate(to, modo)
    }
    // ⚠ ENGANCHADO ACÁ, EN EL GESTO, Y CON DISPARO ÚNICO (lección 2), igual que el colapso.
    window.addEventListener('popstate', segundoPaso, { once: true })
    if (consumeOwnedExitSentinel({ id: exitId })) return true
    // El consumo se negó (la entrada de arriba ya no lleva NUESTRA marca): no va a llegar ningún
    // evento, así que el listener hay que sacarlo a mano o queda armado para el próximo retroceso
    // del dueño y dispara una navegación que nadie pidió.
    window.removeEventListener('popstate', segundoPaso)
    return false
  }

  // ── El colapso: dos pasos, y el segundo sale del EVENTO del primero ──────────────────────────
  const segundoPaso = () => {
    // La marca de la entrada de Más, leída recién ahora: es el único momento en que se puede. Y es
    // también el ÚNICO dato fiable de qué queda debajo del destino después del reemplazo, porque el
    // reemplazo PISA la entrada de Más (ver abajo).
    const rutaDebajo = panelUnderRoute(window.history.state)
    const paso = branchSecondStep({
      parado: window.location.pathname,
      more,
      rutaDebajo,
      to,
    })
    if (paso === 'abort') return
    if (paso === 'second-consume') {
      // El segundo consumo SÍ se puede hacer desde adentro del evento: es un retroceso, no una
      // navegación del router (el precedente es la continuación de dos pasos de
      // `lib/dirty-history.ts`, y está medido en E-5). Y pasa igual por las dos guardas: si la marca
      // se perdió en el medio, no se retrocede y se navega, que es la degradación segura.
      if (consumeOwnedBranchEntry()) return
      pedirMarcaPropagada(to, rutaDebajo)
      navigate(to, 'replace')
      return
    }
    // ⚠ LA PROPAGACIÓN, Y POR QUÉ NO PUEDE DERIVARSE DEL PAR DE RUTAS. El reemplazo que viene
    // **pisa** la entrada de Más: lo que queda debajo del destino es **lo que había debajo de Más**,
    // que es justo el valor que se acaba de leer. El efecto de marcado, en cambio, sólo vería el
    // tramo (ruta de Más → destino), que la política declara EMPUJE —`from === more`— y del que
    // derivaría la **ruta de Más**: o sea la entrada que acaba de desaparecer. Es la causa medida de
    // G-3 en la UAT, y está medida como número en el escenario E-11 de la sonda.
    pedirMarcaPropagada(to, rutaDebajo)
    navigate(to, 'replace')
  }

  // ⚠ ENGANCHADO ACÁ, EN EL GESTO, Y CON DISPARO ÚNICO (lección 2). En un efecto se perdería el
  // evento; sin `once` sobreviviría al segundo paso y el próximo atrás del dueño dispararía una
  // navegación que nadie pidió.
  window.addEventListener('popstate', segundoPaso, { once: true })
  if (consumeOwnedBranchEntry()) return true
  // El consumo se negó (sin marca, o entrada de otro dueño): no va a llegar ningún evento, así que
  // el listener hay que sacarlo a mano o queda armado para el próximo retroceso del dueño.
  window.removeEventListener('popstate', segundoPaso)
  return false
}

// ── El SENTINEL DE SALIDA: el primer atrás en Inicio avisa, el segundo sale (MOB-05 / D-01) ─────
//
// EL MECANISMO, Y POR QUÉ ES ÉSTE Y NO OTRO
// El atrás del dueño **no se puede cancelar**: `popstate` llega con `cancelable: false` y su
// `preventDefault()` es un no-op (medido en
// `.planning/debug/interceptar-atras-aviso-sin-guardar.md`). Así que no se cancela: **se absorbe**.
// Se empuja una entrada propia —el sentinel— mientras el dueño está en la raíz del panel, y su atrás
// consume ESA entrada en vez de la de la página. El `popstate` que llega es el aviso de que el gesto
// ocurrió, y ahí se muestra el cartel. Es exactamente el ciclo que `lib/dirty-history.ts` ya corre en
// producción, reducido a *absorber una vez y no re-armar durante la ventana del aviso*.
//
// LA REGLA QUE §13 PIDE Y QUE ACÁ SE CUMPLE POR ESTRUCTURA
// La **duración visible** del aviso y la **ventana lógica** en la que el segundo atrás sale son el
// MISMO valor, desde UN solo lugar ({@link PANEL_EXIT_HINT_MS}), y lo consume UN solo temporizador
// que hace LAS DOS cosas al expirar: ocultar el aviso y re-armar. No hay dos efectos, así que no hay
// dos números que puedan desincronizarse — y los dos síntomas de la desincronización son
// **silenciosos** (ni `tsc` ni la suite los ven).
//
// ⚠ SIN GATE DE VIEWPORT (D-05), y las dos mitades del argumento quedan escritas acá:
//   · el dueño eligió que salir del panel cueste **dos gestos** en celular **y** en escritorio,
//     sabiendo el costo; y
//   · la alternativa —ocultar sólo el aviso y dejar la absorción viva— sería un **botón muerto**: el
//     atrás no hace nada y no dice por qué. El propio módulo del sentinel de cambios sin guardar lo
//     declara **peor que el bug**.
// Y la aclaración que el revisor necesita: esto **NO** contradice el criterio 6 del ROADMAP, que
// habla de **la política de dos niveles** —ésa sigue expresándose sobre rutas y sobre la marca de la
// rama, y cae en las mismas ramas en escritorio por construcción—. Lo que D-05 cambia en escritorio
// es el **mecanismo de MOB-05**, que es otra cosa.
//
// ⚠ LA CONSECUENCIA VISIBLE QUE SE DECLARA EN VEZ DE DESCUBRIRSE: con el sentinel armado, la URL de
// Inicio muestra el hash (`/dashboard#salir`). Es inherente al mecanismo —el hash es la condición de
// existencia de la entrada, cicatriz 1— y es la forma MEDIDA en el escenario **E-6** de
// `.planning/debug/pila-de-dos-niveles-medida.md`. Queda como ítem de la UAT del plan 03-04.
//
// ⚠ Y LA MISMA COSA LEÍDA AL REVÉS ES **EL ÚNICO OBSERVABLE QUE ESTE MECANISMO TIENE**: el hash es la
// **condición de existencia** de la entrada, así que la implicación vale en los dos sentidos —
// **si la URL no muestra el hash, el sentinel NO está armado y el atrás va a salir de una.** Eso
// convierte G-5 y G-6 de un misterio en un chequeo de **un vistazo**, sin herramientas y sin consola:
// el guion de la UAT del plan **03-08** abre **cada ciclo** mirando la barra de direcciones. Sin este
// observable, los dos gaps sólo se pueden verificar por su efecto —el dueño sale o no sale— y un
// falso verde es indistinguible de un verde (T-03-39).
//
// ⚠ CUÁNDO SE ARMA, Y LA IMPRECISIÓN QUE QUEDA — la DECISIÓN (a) del dueño y su límite.
// El sentinel **ya no** se arma estando en la raíz "haya o no haya" historia debajo: eso era la
// imprecisión que este módulo declaraba, la UAT la destapó como el ítem **H** (el aviso se comía el
// atrás que MOB-04 prometía) y el dueño la resolvió con la **decisión (a)** — se arma **sólo si no hay
// nada nuestro debajo—. La regla vive en {@link panelExitArmAction}, va **última** entre las seis, y
// el por qué de cada cosa está en su docblock. Medida en el escenario **E-10** de
// `.planning/debug/pila-de-dos-niveles-medida.md`.
// Lo que **sigue aceptado** es sólo la mitad que el código no puede cerrar: si lo que quedó debajo es
// una entrada **AJENA** (otro sitio), no hay forma confiable de saberlo —`history.length` cuenta
// también las entradas de **adelante**— y el aviso va a aparecer igual. Es la misma razón por la que
// el caso de **entrada directa** está aceptado y documentado desde v0.30 (E-7). El gesto sigue
// haciendo algo visible en los dos casos, que es el invariante que importa.

/**
 * La ventana del aviso de salida, en milisegundos.
 *
 * **Es las DOS cosas a la vez, y por eso es UNA sola:** la duración **visible** del aviso y la
 * ventana **lógica** en la que el segundo atrás sale. El valor lo fija el UI-SPEC §13.
 *
 * ⚠ **POR QUÉ NO PUEDE HABER DOS NÚMEROS.** Con dos, lo que el dueño **ve** y lo que el código
 * **acepta** se desincronizan, y los dos síntomas son silenciosos: o el aviso desaparece y el segundo
 * atrás todavía sale (sale sin avisar), o el aviso sigue en pantalla y el segundo atrás ya no vale
 * (el dueño aprieta y no pasa nada). Ni la comprobación de tipos ni la suite ven ninguno de los dos.
 * Un solo número los hace **imposibles** — y el único temporizador del módulo es lo que lo garantiza
 * por estructura, no por disciplina.
 */
export const PANEL_EXIT_HINT_MS = 2000

/**
 * Hash base del sentinel.
 *
 * **POR QUÉ CON HASH (cicatriz 1):** empujar la MISMA URL hace que el router colapse la entrada. No
 * se crea ninguna, el atrás no tiene nada que deshacer y **saca al dueño de la página** — justo lo
 * contrario de lo que el sentinel viene a hacer. El hash es **la condición de existencia** de la
 * entrada, no decoración.
 *
 * ⚠ **POR QUÉ ESTE TEXTO Y NO OTRO.** Los dos criterios están **medidos**, no supuestos:
 *   (a) no puede ser interpretado por los otros dos módulos que escriben historial ⇒ no empieza con
 *       sus prefijos, y eso se afirma contra sus constantes **importadas**
 *       ({@link exitHashCollidesWithOtherOwners}), no contra literales copiados;
 *   (b) no puede coincidir con el `id` de ningún elemento del panel, o el navegador **scrollearía
 *       hasta él** al armar. Barrido hecho sobre `app/` y `components/` (`.tsx` y `.ts`): **cero**
 *       coincidencias de `salir`.
 * Si alguna vez hiciera falta otro texto, se cambia **esta constante** y se re-corre el barrido: el
 * gate lo **deriva** de acá, así que sigue barriendo el hash real.
 */
export const PANEL_EXIT_HASH = '#salir'

/** El state que se empuja: sólo nuestra marca, con el id de la instancia dueña de la entrada. */
export type PanelExitState = { frjExit: number }

/**
 * State de la entrada del sentinel.
 *
 * ⚠ **CLAVE NUEVA, Y NO SE REUSA NINGUNA DE LAS TRES QUE YA VIVEN EN LA PILA** (`frjView`,
 * `frjOverlay`, `frjDirty`) **ni la de la rama** (`frjUnder`). Reusar cualquiera es el peor error
 * posible: el otro módulo reconocería ESTA entrada como propia, haría su retroceso sobre ella y el
 * dueño terminaría **fuera del sitio**. Y al revés de la marca de la rama, esta marca **SÍ** entra en
 * `isForeignOwnedEntry` (`lib/panel-history.ts`): es una entrada **absorbente**, y una escritura
 * encima le borraría la marca, su dueño no la reconocería, no la consumiría al expirar la ventana, y
 * quedaría basura en la pila más un atrás muerto.
 *
 * ⚠ **OBJETO LITERAL FRESCO, SIEMPRE**, y nunca propagando `window.history.state`: propagarlo
 * arrastra `__NA`, el parche de `pushState` de Next toma entonces su rama temprana y **no despacha**
 * la sincronización del router — la URL cambia y el router no se entera, sin un error en consola.
 * Next igual COPIA sus internos adentro de este objeto al escribir, que es lo que mantiene la entrada
 * sana (y por eso tampoco hay que guardarse una referencia al método original del historial).
 */
export function panelExitState(id: number): PanelExitState {
  return { frjExit: id }
}

/**
 * ¿La entrada de arriba del historial es el sentinel que empujó ESTA instancia?
 *
 * Es la guarda de la cicatriz 2 y el discriminador de tres situaciones, igual que en el módulo de
 * referencia:
 *   · al decidir si armar: si ya estamos parados sobre el nuestro, un segundo empuje costaría dos
 *     atrás (y estar parado sobre él **cuenta como armado**, medido en E-6);
 *   · en el `popstate`: si después del pop seguimos parados sobre él, el pop se comió una entrada
 *     AJENA de arriba (un overlay del anidado LIFO, o la sección que teníamos encima) y no es asunto
 *     nuestro;
 *   · al desmontar: hace falta saber si queda un sentinel que consumir o si ya lo pisó una escritura
 *     ajena.
 *
 * Narrowing manual, sin `any` (tsconfig `strict`): `history.state` es `unknown` de verdad — puede
 * traer el state del router de Next, el de un overlay, el de otra librería, o `null`.
 */
export function isPanelExitEntry(state: unknown, id: number): boolean {
  return (
    typeof state === 'object' &&
    state !== null &&
    'frjExit' in state &&
    (state as { frjExit?: unknown }).frjExit === id
  )
}

/**
 * El criterio (a) de elección del hash, escrito como **función** y no como comentario: ¿este texto lo
 * interpretaría alguno de los otros dos dueños de la pila?
 *
 * Compara contra las constantes **importadas** de sus módulos, así que el día que uno de ellos cambie
 * su hash base, el candado lo ve. Con un literal copiado acá, no.
 */
export function exitHashCollidesWithOtherOwners(hash: string = PANEL_EXIT_HASH): boolean {
  return hash.startsWith(OVERLAY_HASH_BASE) || hash.startsWith(DIRTY_HASH_BASE)
}

/**
 * El hash a empujar, calculado a partir del que ya está en la URL.
 *
 * **POR QUÉ DEPENDE DEL ACTUAL Y NO ES LA CONSTANTE A SECAS:** dos entradas consecutivas con la MISMA
 * URL son la cicatriz 1. Pasa de verdad si el dueño llega con la URL ya pegada con nuestro hash. Un
 * hash ajeno (`#seccion`, `#modal`) se respeta: se empuja el base y al volver atrás el navegador
 * restaura el de la página. Molde exacto de `nextDirtyHash`.
 */
export function nextPanelExitHash(currentHash: string): string {
  if (currentHash === PANEL_EXIT_HASH) return `${PANEL_EXIT_HASH}-2`
  const prefijo = `${PANEL_EXIT_HASH}-`
  if (currentHash.startsWith(prefijo)) {
    const profundidad = Number(currentHash.slice(prefijo.length))
    // `Number('')` da 0 y `Number('abc')` da NaN: los dos caen al base, nunca a `#salir-NaN`.
    if (Number.isInteger(profundidad) && profundidad >= 2) return `${prefijo}${profundidad + 1}`
  }
  return PANEL_EXIT_HASH
}

/**
 * ¿El hash que ya está en la URL es **uno de los nuestros**?
 *
 * Es el hecho de la **séptima regla** de armado, y existe como función pura —en vez de un
 * `startsWith` en el call site— por un motivo medido: `#salirXYZ` **no** es nuestro, y un
 * `startsWith('#salir')` lo tomaría como propio ⇒ el sentinel **nunca se armaría** en una pantalla
 * con un hash ajeno que empieza igual, otra vez sin que nada se ponga rojo.
 *
 * Reconoce **exactamente** las formas que {@link nextPanelExitHash} puede producir —el base y la
 * profundidad `>= 2`— y nada más: el candado de ida y vuelta está en la suite.
 */
export function urlAlreadyHoldsExitHash(hash: string): boolean {
  if (hash === PANEL_EXIT_HASH) return true
  const prefijo = `${PANEL_EXIT_HASH}-`
  if (!hash.startsWith(prefijo)) return false
  const profundidad = Number(hash.slice(prefijo.length))
  // Mismo criterio que el derivador: `Number('')` da 0 y `Number('abc')` da NaN, y ninguno es
  // nuestro. Así `#salir-` y `#salir-abc` quedan afuera, igual que allá caen al base.
  return Number.isInteger(profundidad) && profundidad >= 2
}

/** Qué hacerle a la pila en un commit dado. */
export type PanelExitArmAction = 'arm' | 'none'

/**
 * Cuándo se arma el sentinel. Pura, con las reglas **EN ORDEN**.
 *
 *   1. `participates` — **nadie va a dibujar el aviso ⇒ no armar.** Va primera porque ninguna otra
 *      condición puede autorizar a absorber sin avisar: un sentinel que se come el atrás y después no
 *      muestra nada convierte el gesto en un botón **MUERTO**, que es peor que el bug. Es la lección
 *      literal de `participates` en `lib/dirty-history.ts`.
 *   2. `atRoot` — **no estamos en la raíz del panel ⇒ no armar.** MOB-05 es de Inicio y sólo de
 *      Inicio: en una sección el atrás tiene a dónde volver.
 *   3. `hintOpen` — **la ventana del aviso está abierta ⇒ NO armar.** Es la mitad lógica de la
 *      constante única, y es lo que hace que el **segundo** atrás salga: si acá se re-armara, el
 *      segundo atrás se comería el sentinel nuevo y el dueño nunca saldría ⇒ dos avisos encadenados,
 *      justo lo que §13 prohíbe.
 *   4. `topIsOurs` — **ya estamos parados sobre nuestro sentinel ⇒ no armar** (E-6). Un segundo
 *      empuje costaría dos atrás.
 *   5. `urlYaLlevaNuestroHash` — **la URL ya lleva nuestro hash ⇒ no armar.** Es la **SÉPTIMA regla**
 *      del módulo (la que agregó el plan `03-07`), y es la **quinta** en el orden de evaluación: el
 *      orden de llegada y el orden de evaluación no son lo mismo. Va acá porque habla de **la entrada
 *      de arriba**, igual que la cuarta y la sexta, y la de política es la única que no.
 *   6. `foreignOwnsTop` — **la entrada de arriba es de otro dueño ⇒ no armar** (regla 0). Un overlay
 *      abierto gana siempre: el atrás lo cierra primero, que es la política vigente e intacta.
 *   7. `algoNuestroDebajo` — **hay una entrada NUESTRA debajo ⇒ no armar.** Es la **decisión (a)** del
 *      dueño, y lo que resuelve está abajo.
 *   8. El resto ⇒ **armar**.
 *
 * ⚠ **QUÉ RESUELVE LA SÉPTIMA REGLA, Y POR QUÉ SUPERA LA IGUALDAD DE SEIS QUE FIJÓ EL PLAN `03-06`.**
 * Se decidió **midiendo** (escenario **E-13**), no de onda. Con la URL llevando nuestro hash pero el
 * estado de la entrada **PISADO** por una escritura ajena —un `replaceState` sin url, que es
 * literalmente lo que hace el router al sincronizar su propio estado— las **cinco** reglas anteriores
 * **no detectan nada**: *ya estoy armado* pregunta por el **estado** y da falso, *la entrada de arriba
 * es de otro dueño* da falso (el state ajeno no lleva ninguna marca conocida) y *hay algo nuestro
 * debajo* da falso. Entonces el armado sigue adelante y, como el hash se **deriva del actual**
 * (cicatriz 1), empuja `#salir-2` y **acumula** una entrada más — cada una con un atrás que no hace
 * **nada visible**. Repetido, eso es el `dashboard#salir-3` que el dueño reportó. La entrada **ya es
 * nuestra** aunque su estado se haya perdido, así que lo correcto es **no armar**.
 *
 * ⚠ **QUÉ RESUELVE LA SEXTA REGLA: la colisión que la UAT destapó (ítem H / G-4).** Parado en la raíz
 * **con historia debajo**, MOB-04 (`Más → Inicio → atrás` vuelve a Más) y MOB-05 (en Inicio el atrás
 * avisa antes de salir) **no pueden ser verdad a la vez**. El dueño eligió la **decisión (a)** —el
 * sentinel se arma **sólo si no hay nada nuestro debajo**— y descartó la alternativa (b), que el
 * sentinel mandara **siempre** en la raíz: era más simple y más predecible, pero **cambiaba lo que
 * MOB-04 prometía** y dejaba el aviso apareciendo cuando el dueño **no** iba a salir. Registrada en
 * `.planning/workstreams/panel-nav/phases/03-la-pol-tica-de-atr-s-de-un-nivel-a-dos/03-DECISION-UAT.md`
 * y medida en el escenario **E-10** de `.planning/debug/pila-de-dos-niveles-medida.md`.
 *
 * ⚠ **POR QUÉ VA ÚLTIMA, y el orden es el argumento.** Las **cinco** anteriores son de **seguridad**
 * (nadie a quien avisar, lugar equivocado, ventana abierta, ya armado, la entrada de arriba es de otro
 * dueño); ésta es de **política**. Seguridad primero, política después. Y además es lo que garantiza
 * que la regla **nunca** lea la marca de la rama estando parados **sobre el sentinel**: ahí la cuarta
 * ya devolvió, y ese dato no significa nada porque el state del sentinel lleva **sólo su propia
 * clave** ({@link panelExitState}). El caso que fija ese orden está en la suite con nombre propio.
 *
 * ⚠ **EL LÍMITE ACEPTADO (reemplaza la imprecisión que este módulo declaraba antes).** (a) cierra el
 * caso en que lo que quedó debajo es una entrada **nuestra** —la app lleva la cuenta de lo que empujó,
 * en la marca de la rama—. **No cierra el caso en que sea una entrada AJENA** (otro sitio): ahí el
 * aviso va a aparecer igual, o no se va a armar cuando correspondía. **No hay API confiable** para
 * preguntarle al navegador "¿hay algo debajo?": `history.length` cuenta **también las entradas de
 * adelante**, así que un largo de 3 puede ser una debajo y una arriba, o dos arriba y ninguna debajo.
 * Es la **misma razón** por la que el caso de **entrada directa** está aceptado y documentado desde
 * v0.30 (**E-7**), y **queda aceptado**, declarado acá en vez de descubierto en la próxima UAT.
 *
 * Referencias cortas, en ASCII a propósito —igual que los ids de la sonda— para que los gates de esta
 * tanda las encuentren recortando por bytes: `decision (a)` · `E-10` · item **H** · gap **G-4**.
 */
export function panelExitArmAction({
  participates,
  atRoot,
  hintOpen,
  topIsOurs,
  /**
   * ¿La URL **ya lleva uno de nuestros hashes**? Va **sin valor por omisión**, igual que los otros
   * hechos de la pila: un call site que lo olvide **no compila**.
   *
   * Lo contesta {@link urlAlreadyHoldsExitHash} sobre el hash **real** de `location` en el momento de
   * decidir, y **no** sobre el estado: el punto entero de la regla es que el estado puede haberse
   * perdido mientras la URL sigue siendo nuestra (medido en **E-13**, mitad B).
   */
  urlYaLlevaNuestroHash,
  foreignOwnsTop,
  /**
   * ¿Hay una entrada **nuestra** debajo de la actual? Va **sin valor por omisión**, igual que
   * `masDebajo`, `holdsExitSentinel` y `vieneDeUnRetroceso`: es un **hecho de la pila**, no una
   * configuración, y un call site que lo olvide **no compila**.
   *
   * Lo contesta {@link panelUnderRoute} sobre el estado **real** de la entrada de arriba —no una
   * clave nueva—: la marca de la rama guarda **la ruta** que quedó debajo (no un booleano),
   * justamente para el caso degenerado, así que estando en la raíz la pregunta ya tiene respuesta.
   * Una cuarta clave en la pila sería un **cuarto dueño** sin necesidad, y la regla 0 tiene **tres** a
   * propósito.
   */
  algoNuestroDebajo,
}: {
  participates: boolean
  atRoot: boolean
  hintOpen: boolean
  topIsOurs: boolean
  urlYaLlevaNuestroHash: boolean
  foreignOwnsTop: boolean
  algoNuestroDebajo: boolean
}): PanelExitArmAction {
  if (!participates) return 'none'
  if (!atRoot) return 'none'
  if (hintOpen) return 'none'
  if (topIsOurs) return 'none'
  // ── LA SÉPTIMA — la URL ya es nuestra, aunque su estado lo haya pisado una escritura ajena. ────
  // Va DESPUÉS de *ya estoy armado* (que es la misma pregunta hecha al estado, más precisa cuando el
  // estado está sano) y ANTES de las dos que siguen. Sin ella el hash ESCALA y las entradas de salida
  // se ACUMULAN: medido en E-13, mitad B.
  if (urlYaLlevaNuestroHash) return 'none'
  if (foreignOwnsTop) return 'none'
  // ── LA SEXTA — la decisión (a): con algo nuestro debajo, el atrás tiene a dónde volver. ───────
  // Última a propósito (ver el ⚠ de arriba): las cinco de antes son de seguridad y ésta es de
  // política, y así nunca se lee la marca de la rama parados sobre el sentinel.
  if (algoNuestroDebajo) return 'none'
  return 'arm'
}

/** Qué significa un `popstate` para el sentinel de salida. */
export type PanelExitPopAction = 'hint' | 'rearm' | 'ignore'

/**
 * La decisión al recibir un `popstate`. Pura, con las reglas **EN ORDEN** y el molde de
 * `dirtyPopstateAction`.
 *
 *   1. `topIsOurs` — **seguimos parados sobre nuestro sentinel ⇒ ignorar.** El navegador consumió una
 *      entrada AJENA de arriba: el overlay del anidado LIFO, o la sección que teníamos encima (E-6).
 *      El atrás hizo algo visible y no es nuestro. Va primera porque mientras eso sea cierto ninguna
 *      otra regla puede reinterpretar el evento.
 *   2. `participates` — **nadie va a dibujar el aviso ⇒ ignorar.**
 *   3. `atRoot` — **el retroceso nos dejó fuera de la raíz ⇒ ignorar:** no es nuestro asunto.
 *   4. `holding` — **no éramos dueños de un sentinel vivo ⇒ ignorar.** Nos pisó una escritura ajena,
 *      o nunca armamos; un aviso ahí sería sobre un gesto que no es nuestro.
 *   5. `keyboardGuards` — **el atrás en realidad bajaba el teclado ⇒ RE-ARMAR** sin gastar el aviso
 *      (C-7). Si el aviso se gastara acá, el segundo atrás sacaría del sitio a un dueño que sólo
 *      quiso cerrar el teclado. Inicio no tiene campos de texto (barrido medido: cero), así que es
 *      **improbable, no imposible**: el teclado puede venir de otra pantalla y la gracia es de 300ms.
 *   6. El resto ⇒ **avisar**.
 */
export function panelExitPopAction({
  topIsOurs,
  participates,
  atRoot,
  holding,
  keyboardGuards,
}: {
  topIsOurs: boolean
  participates: boolean
  atRoot: boolean
  holding: boolean
  keyboardGuards: boolean
}): PanelExitPopAction {
  if (topIsOurs) return 'ignore'
  if (!participates) return 'ignore'
  if (!atRoot) return 'ignore'
  if (!holding) return 'ignore'
  if (keyboardGuards) return 'rearm'
  return 'hint'
}

// ── El rastreador del teclado: UNO por documento ─────────────────────────────────────────────────
//
// Reusa los DOS helpers puros y ya medidos de `lib/overlay-history.ts` (el umbral de inset y la
// ventana de gracia) y sólo aporta lo que no es puro: el listener del viewport visual. Lo que se
// guarda es la TRANSICIÓN DE BAJADA y no cada resize con teclado, y eso es un bug ya medido: el
// teclado abierto NO emite resizes mientras está quieto, así que un timestamp tomado en cada resize
// con inset se queda con el momento en que se ABRIÓ, y la gracia estaría vencida antes del atrás.
//
// ⚠ Por qué el rastreador se repite acá en vez de importarse: el de `lib/overlay-history.ts` es
// estado privado del módulo (no está exportado) y ese módulo es **intocable** en esta fase. Lo que sí
// se reusa es lo que importa: los dos umbrales y la decisión, que son los que están medidos.
let tecladoArriba = false
let tecladoBajoEn: number | null = null
let rastreadorInstalado = false

/**
 * Engancha una sola vez el listener que anota el momento en que el teclado BAJA.
 *
 * SIN TEARDOWN a propósito, igual que el de los overlays: es un único listener por documento que
 * escribe un timestamp y sale. Refcontarlo para poder desengancharlo agregaría un camino de falla
 * —desenganchar de más y perder la ventana de gracia— a cambio de nada medible. Idempotente por la
 * bandera.
 */
function instalarRastreadorDeTeclado(): void {
  if (rastreadorInstalado) return
  const vv = typeof window !== 'undefined' ? window.visualViewport : null
  if (!vv) return
  rastreadorInstalado = true
  vv.addEventListener('resize', () => {
    if (isSoftKeyboardInset({ viewportHeight: vv.height, innerHeight: window.innerHeight })) {
      tecladoArriba = true
      return
    }
    // Primer resize sin teclado después de haberlo tenido: ACÁ empieza la ventana de gracia.
    if (tecladoArriba) {
      tecladoArriba = false
      tecladoBajoEn = Date.now()
    }
  })
}

/**
 * ¿El atrás que acaba de llegar se lo tiene que comer el teclado?
 *
 * Lee el viewport EN EL INSTANTE del `popstate` (no un estado cacheado): si el teclado todavía está
 * arriba la respuesta sale de ahí. El rastreador sólo aporta la ventana de gracia, para el caso en que
 * el resize del cierre del teclado le ganó la carrera al `popstate`.
 */
function elTecladoSeComeElAtras(): boolean {
  const vv = typeof window !== 'undefined' ? window.visualViewport : null
  if (!vv) return false
  const inset = isSoftKeyboardInset({ viewportHeight: vv.height, innerHeight: window.innerHeight })
  if (inset) tecladoArriba = true
  return softKeyboardGuardsBack({ inset, leftInsetAt: tecladoBajoEn, now: Date.now() })
}

// ── El CANAL DE DIAGNÓSTICO del sentinel de salida (plan 03-12): inerte salvo que lo abran ──────
//
// POR QUÉ EXISTE, en una línea: sin él, una sonda ve *el hash está y el atrás no se absorbe* (la firma
// que comparten `G3-2` y `G3-3`) pero **no puede nombrar** cuál de las siete reglas declinó ni qué
// valía *seguimos absorbiendo* en ese momento — que es exactamente la pregunta que hay que contestar
// con números antes de escribir un arreglo.
//
// LAS CUATRO COSAS QUE LO VUELVEN ACEPTABLE EN PRODUCCIÓN:
//   · **INERTE.** Escribe sólo si `globalThis.__forjoPanelDiag` **ya es un arreglo**, y nadie en la
//     app lo crea. Lo abre algo EXTERNO: la sonda de la app real, con
//     `Page.addScriptToEvaluateOnNewDocument`, **antes** del JS de la app — así sobrevive a las
//     recargas y a las navegaciones. Sin eso, la función se abstiene y no hace nada.
//   · **TOTAL.** Ninguna excepción sale: el segundo call site vive adentro del oyente del `popstate`,
//     donde una excepción dejaría el gesto a medias. Un canal hostil no puede romper el panel.
//   · **ACOTADO.** El arreglo nunca pasa de {@link PANEL_EXIT_DIAG_MAX}: el dueño deja el panel
//     abierto todo el día.
//   · **GRABA LA DECISIÓN, NO LOS DATOS.** Ruta, hash, las marcas de la entrada, el `id` de la
//     instancia, los hechos booleanos de la decisión y la acción. **Cero** datos de negocio, cero
//     identificadores de tenant, cero contenido de pantalla: el panel es multi-tenant, y el invariante
//     en riesgo en esta fase es la integridad de la sesión y del trabajo del dueño, no el aislamiento.
// Y NO CAMBIA NINGUNA DECISIÓN: se llama **después** de que la acción está computada, y nunca adentro
// de las dos decisiones puras.

/**
 * Un registro del canal. Campos **planos y serializables**: nada de referencias a nodos ni a funciones.
 *
 * `vivoAntes` / `vivoDespues` son el valor de *seguimos absorbiendo* (la referencia del sentinel vivo)
 * antes y después de la rama. En el armado se graba **después** de la rama, así que los dos son
 * reales; en el retroceso se graba **antes** de la rama y los dos valen lo mismo (la rama que sigue es
 * determinista: *avisar* y *re-armar* la apagan, *ignorar* re-arma y deja su propio registro).
 */
export type PanelExitDiagRecord = {
  tipo: 'armado' | 'retroceso'
  /** El instante del registro (`Date.now()`), para ordenar y medir ventanas desde afuera. */
  ts: number
  ruta: string
  hash: string
  /** Las marcas de la entrada (claves `frj*`) más la lista de claves, ya pasadas a texto. */
  estado: string
  /** El `id` de ESTA instancia: el dato que la sonda no puede derivar desde afuera. */
  id: number
  duenaFigurando: number | null
  instanciasVivas: number
  /** Los siete hechos del armado, o los cinco del retroceso. */
  hechos: Record<string, boolean>
  accion: string
  vivoAntes: boolean
  vivoDespues: boolean
}

/** Lo que entrega un call site: el estado va CRUDO y lo pasa a texto el instrumento, adentro del `try`. */
export type PanelExitDiagInput = Omit<PanelExitDiagRecord, 'ts' | 'estado'> & { estado: unknown }

/** La cota del canal. El dueño deja el panel abierto: un arreglo sin techo es una fuga. */
export const PANEL_EXIT_DIAG_MAX = 200

/**
 * Pasa el estado de la entrada a texto quedándose **sólo con lo nuestro**: las marcas `frj*` y la lista
 * de claves. El estado del router de Next (`__PRIVATE_NEXTJS_INTERNALS_TREE`) se nombra pero no se
 * copia: es grande y no aporta a la decisión. Total por su cuenta: un valor que no se puede pasar a
 * texto no tira, deja una marca.
 */
function estadoComoTexto(estado: unknown): string {
  try {
    if (estado === null || typeof estado !== 'object') return String(JSON.stringify(estado) ?? estado)
    const claves = Object.keys(estado).sort()
    const marcas: Record<string, unknown> = {}
    for (const k of claves) if (k.startsWith('frj')) marcas[k] = (estado as Record<string, unknown>)[k]
    return JSON.stringify({ claves, ...marcas })
  } catch {
    return '[estado no serializable]'
  }
}

/**
 * Graba un registro en el canal de diagnóstico **si y sólo si** algo externo lo abrió. Devuelve si
 * grabó. **Total:** ninguna excepción sale, ni de un canal hostil ni de un estado raro.
 */
export function recordExitDiag(entrada: PanelExitDiagInput): boolean {
  try {
    const canal = (globalThis as { __forjoPanelDiag?: unknown }).__forjoPanelDiag
    if (!Array.isArray(canal)) return false
    const registro: PanelExitDiagRecord = {
      ...entrada,
      ts: Date.now(),
      estado: estadoComoTexto(entrada.estado),
      hechos: { ...entrada.hechos },
    }
    canal.push(registro)
    // Se descarta lo MÁS VIEJO: lo que importa es lo último que pasó.
    if (canal.length > PANEL_EXIT_DIAG_MAX) canal.splice(0, canal.length - PANEL_EXIT_DIAG_MAX)
    return true
  } catch {
    return false
  }
}

// ── La mecánica de React ─────────────────────────────────────────────────────────────────────────

// Id monotónico por instancia, molde de `lib/dirty-history.ts` y `lib/overlay-history.ts`. Acá es lo
// que vuelve EXIGIBLE —y no solamente esperable— el invariante de T-03-06: UN solo dueño por entrada.
let branchSerial = 0

/** Id único de instancia. Exportado sólo para poder afirmar en el test que no se repite. */
export function nextBranchId(): number {
  branchSerial += 1
  return branchSerial
}

// Qué instancia escribe la marca. El hook se consume UNA sola vez (en la barra, que vive en el
// layout del route group y no se re-monta), así que en la práctica nunca hay dos; el candado existe
// porque dos dueños por la misma entrada DESCUADRAN el conteo de retrocesos y dejan un atrás muerto
// o uno de más. Y cae del lado seguro: una instancia que no es la dueña simplemente **no marca** ⇒
// sin marca la política empuja o reemplaza, nunca retrocede.
let instanciaDuena: number | null = null

/**
 * Cuántas instancias del hook están **VIVAS**. Sube en el efecto que toma el dominio y baja en su
 * limpieza, en el mismo molde que el serial de arriba.
 *
 * ⚠ **PARA QUÉ EXISTE, y es el modo de falla más caro de este módulo.** El candado de arriba es una
 * variable de módulo que se libera en la **limpieza** del efecto. Si esa limpieza **no corre** —un
 * árbol descartado, un doble montaje de desarrollo, un desmontaje que no pasó por React—, la variable
 * queda apuntando a una instancia **MUERTA**, y entonces toda instancia nueva **se abstiene de armar
 * EN SILENCIO**: no lo ve `tsc`, ni la suite, ni el build, y lo único que el dueño nota es que el
 * atrás lo saca del panel **sin aviso**. Eso es literalmente **G-5**.
 *
 * Con el conteo, el candado puede **SANAR**: si no hay **ninguna** instancia viva, quien figura como
 * dueña **no puede** ser una instancia viva, así que la que pregunta **toma** el dominio.
 */
let instanciasVivas = 0

/** Si esta instancia puede operar sobre la pila, o se abstiene. */
export type BranchOwnerDecision = 'operar' | 'abstenerse'

/**
 * **¿Puede ESTA instancia operar sobre la pila?** Pura, con las reglas **EN ORDEN**.
 *
 * ⚠ **POR QUÉ DEJA DE SER UN RETORNO TEMPRANO.** Esta pregunta vivía repetida tres veces en el hook
 * como `if (instanciaDuena !== null && instanciaDuena !== id) return`, y era **el camino de falla más
 * silencioso de todo el módulo**: tres copias de la misma condición que pueden divergir, en un `if`
 * sin un solo caso de test, cuyo efecto —cuando se equivoca— es que **nadie arma nada** y el atrás
 * saca del panel sin avisar. Nada de eso lo ve `tsc`, ni la suite, ni el build. Extraída, la decisión
 * tiene casos y las tres guardas tienen **un** dialecto.
 *
 * Las reglas:
 *   1. **Nadie figura como dueña ⇒ operar.** Nadie reclamó la pila: tomarla es lo correcto.
 *   2. **La dueña es ésta ⇒ operar.**
 *   3. **Figura otra, pero no hay NINGUNA instancia viva ⇒ operar.** Es la que **SANA**: con cero
 *      vivas, quien figura **no puede** estar vivo, así que el candado está colgado de una instancia
 *      muerta y mantenerlo sólo garantiza que nadie arme nunca. Y es segura por construcción: sin
 *      competidor vivo, el invariante de **un dueño por entrada** no puede romperse.
 *   4. **Figura otra y hay alguna viva ⇒ abstenerse.** Es el comportamiento de hoy, y es el seguro:
 *      dos dueños por la misma entrada descuadran el conteo de retrocesos.
 */
export function branchOwnerDecision({
  duenaFigurando,
  preguntaId,
  instanciasVivas: vivas,
}: {
  /** Qué id figura hoy como dueño en el estado del módulo, o `null` si ninguno. */
  duenaFigurando: number | null
  /** El id de la instancia que pregunta. */
  preguntaId: number
  /** Cuántas instancias están **vivas** en este momento. Es el dato que permite sanar. */
  instanciasVivas: number
}): BranchOwnerDecision {
  if (duenaFigurando === null) return 'operar'
  if (duenaFigurando === preguntaId) return 'operar'
  if (vivas === 0) return 'operar'
  return 'abstenerse'
}

/**
 * Cuándo hay que marcar la entrada actual, y con qué ruta. Pura.
 *
 * Devuelve la ruta que quedó debajo, o `null` si no hay nada que anotar.
 *
 * ⚠ **LA REGLA DE DIRECCIÓN VA PRIMERA, Y NO ES OPCIONAL.** Un retroceso **no CREA** una entrada:
 * **revela** una que ya existe y que ya trae **su propia** marca. Escribir ahí hace las dos cosas
 * malas a la vez:
 *   (a) **miente** — la ruta de la que venimos estaba **ARRIBA**, no debajo; y
 *   (b) **destruye la verdad** que esa entrada ya tenía, que es justo la que el caso degenerado del
 *       criterio 2 necesita leer.
 * Y los **tres** retrocesos del sistema caen acá —el atrás del dueño, el *subir un nivel* de D-03 y
 * los dos pasos del colapso—, que es **por qué el síntoma de la UAT apareció en tres gaps distintos**
 * (G-1, G-2 y G-3). El par de rutas no puede distinguirlos: con un retroceso dice `push` igual.
 *
 * Después, y **sin el hecho del retroceso**, las cuatro ramas de siempre, idénticas:
 *   · sin ruta anterior (primer commit de la instancia) ⇒ no marcar: no sabemos qué quedó debajo;
 *   · ruta anterior igual a la actual ⇒ no marcar: no hubo navegación;
 *   · la política dice **reemplazar** ⇒ no marcar: la entrada de abajo es la misma de antes;
 *   · la política dice **empujar** ⇒ marcar con la ruta **anterior**, que es la que quedó debajo.
 */
export function branchMarkDecision({
  previous,
  current,
  /**
   * ¿Este commit viene de un **retroceso**? Va **sin valor por omisión**, igual que `masDebajo` y
   * `holdsExitSentinel` de `panelBranchPlan`: es un **hecho de la pila**, no una configuración, y un
   * call site que lo olvide **no compila** — que es justo la disciplina que esta fase vino a
   * instalar. Lo aporta el rastreo de {@link takeBackLanding}, comparando la ruta del aterrizaje
   * contra la ruta actual.
   */
  vieneDeUnRetroceso,
  root = PANEL_ROOT,
  more = PANEL_MORE,
}: {
  previous: string | null
  current: string
  vieneDeUnRetroceso: boolean
  root?: string
  more?: string
}): string | null {
  // ── LA REGLA DE DIRECCIÓN — ningún retroceso escribe la marca. ────────────────────────────────
  // Va primera porque ninguna otra condición puede autorizar a escribir sobre una entrada que YA
  // EXISTÍA y que ya sabe qué tiene debajo.
  if (vieneDeUnRetroceso) return null
  if (previous === null) return null
  if (previous === current) return null
  if (panelNavMode({ from: previous, to: current, root, more }) !== 'push') return null
  return previous
}

/** El pedido de navegación diferida: lo deja el ejecutor y lo ejecuta un commit. */
export type PendingNav = { href: string; mode: BranchNavMode }

/**
 * **Qué pedido de navegación diferida hay que ejecutar en esta corrida del efecto.** Devuelve el
 * pedido a ejecutar, o `null` si no hay nada que hacer. Pura.
 *
 * ⚠ **POR QUÉ ESTA DECISIÓN ES UNA FUNCIÓN Y NO DOS `if` ADENTRO DEL EFECTO: porque los dos `if`
 * ya estuvieron, y COSTARON UN BUG DE PANTALLA** (ronda 2 de la UAT, Android). El efecto decía, en un
 * comentario: *"no hace falta limpiar `pedida`: con las mismas deps el efecto no vuelve a correr"*.
 * Es **falso en cuanto el call site pasa una `navigate` que no es estable**, y la barra la pasaba como
 * flecha **inline** ⇒ identidad nueva en CADA render ⇒ con un pedido vivo el efecto **re-navegaba en
 * cada commit**. Síntoma medido: el dueño tocaba Turnos una vez y quedaba **clavado** ahí; cualquier
 * otro destino de la barra lo devolvía a Turnos. Lo vieron **cero** gates — ni `tsc`, ni el lint, ni la
 * suite, ni el build, ni la sonda CDP (que maneja una página estática, no la app).
 *
 * ⚠ **Y POR QUÉ SE EXTRAE EN VEZ DE CUBRIR EL HOOK: el hook NO TIENE COBERTURA Y SE DECIDIÓ QUE NO LA
 * TENGA ACÁ.** Montarlo pediría un renderer de React y un DOM simulado, y el historial de `jsdom` es
 * una **aproximación** de justo lo que esta fase mide contra el navegador real (`history.back()`
 * asíncrono, el parche de `pushState` de Next, el router pisando el state de la entrada). Un test
 * verde ahí mientras el teléfono falla es **exactamente** el patrón *verde midiendo cero* que ya
 * apareció cinco veces en esta fase: una segunda fuente de verdad más débil que la primera es un
 * pasivo. Extraída, la decisión entra en la suite **pura** sin una dependencia nueva, que es el mismo
 * molde que `lib/dirty-history.ts` y `lib/overlay-history.ts` ya aplican.
 *
 * Las reglas, **en orden**:
 *   1. **Sin pedido ⇒ `null`.**
 *   2. **El pedido ya se ejecutó ⇒ `null`.** Es lo que lo vuelve de **un solo disparo**, y lo vuelve
 *      así **por construcción**: no depende de qué identidad de `navigate` pase el consumidor, ni de
 *      por qué motivo se re-corrió el efecto.
 *   3. **El resto ⇒ ejecutarlo.**
 *
 * ⚠ **LA COMPARACIÓN DE LA REGLA 2 ES POR IDENTIDAD, NO POR VALOR, Y ESO ES CARGA ESTRUCTURAL.** Dos
 * gestos al **mismo** destino son **dos pedidos distintos** y los dos tienen que correr (tocar Turnos,
 * volver a Inicio, tocar Turnos otra vez). Comparando los **campos** —`href` y `mode`— el segundo
 * quedaría suprimido: el mismo bug del otro lado, y **igual de silencioso**. El caso está en la suite
 * con nombre propio, justamente para que nadie "simplifique" esto a una comparación de campos.
 *
 * ⚠ **Y POR QUÉ NO SE LIMPIA EL ESTADO:** `setPedida(null)` adentro del efecto es lo que la regla
 * `react-hooks/set-state-in-effect` prohíbe —renders en cascada—, y la prohíbe con razón. El dato del
 * *ya ejecutado* vive en una **referencia**, que desde un efecto sí se puede escribir; lo que está
 * prohibido es tocarla **en el render**.
 */
export function branchPendingNav({
  pedida,
  yaEjecutada,
}: {
  /** El pedido vigente, tal como lo dejó el ejecutor. */
  pedida: PendingNav | null
  /** El pedido que **esta instancia ya ejecutó**, o `null` si todavía no ejecutó ninguno. */
  yaEjecutada: PendingNav | null
}): PendingNav | null {
  if (pedida === null) return null
  if (yaEjecutada === pedida) return null
  return pedida
}

/**
 * Cablea la rama de Más a un menú: marca cada entrada con lo que quedó debajo, y resuelve los gestos
 * que la política de rutas sola no puede resolver.
 *
 * Y cablea también el **sentinel de salida** de MOB-05: en la raíz del panel absorbe el primer atrás,
 * expone que hay que mostrar el aviso, y re-arma cuando la ventana expira.
 *
 * @param pathname La ruta actual, que ENTRA como parámetro (este módulo no importa el router).
 * @param navigate Cómo navegar, también como parámetro. El call site la arma con el router.
 * @param drawsExitHint **¿Este consumidor DIBUJA el aviso de salida?** Va sin default y es
 *   obligatorio a propósito: es la declaración de "hay alguien a quien pedirle el aviso", el molde
 *   exacto de `participates` en `lib/dirty-history.ts`. Con `false` no se arma **nada** — porque un
 *   sentinel que absorbe el atrás y después no muestra el cartel convierte el gesto en un botón
 *   MUERTO, que es peor que el bug. Hoy se cumple además **por construcción**: el único consumidor es
 *   la barra, que tiene este hook y dibuja el aviso en el mismo componente.
 *
 * Devuelve `handleNavigate(href)` —`true` si se hizo cargo del gesto (⇒ prevenir la navegación) y
 * `false` si no (⇒ dejar que el `<Link>` navegue como siempre)— y `hintVisible`, que es lo que el
 * componente usa para dibujar el aviso.
 */
export function usePanelBranch({
  pathname,
  navigate,
  more = PANEL_MORE,
  root = PANEL_ROOT,
  drawsExitHint,
}: {
  pathname: string
  navigate: BranchNavigate
  more?: string
  root?: string
  drawsExitHint: boolean
}): { handleNavigate: (href: string) => boolean; hintVisible: boolean } {
  // El id va en `useState` con inicializador LAZY —no en una ref escrita durante el render— porque
  // `react-hooks/refs` prohíbe tocar `ref.current` en el render, y tiene razón: un render descartado
  // dejaría la ref escrita. `useState(fn)` corre `fn` una sola vez por instancia.
  const [id] = useState(nextBranchId)

  // La ruta anterior. Va en una REFERENCIA y no en estado porque no pinta nada: sólo la lee el efecto
  // de marcado. Y sobrevive a los cambios de sección porque la barra vive en el layout del route
  // group y los layouts NO se re-montan entre navegaciones del grupo — es el único lugar del panel
  // donde esta memoria existe gratis.
  const anteriorRef = useRef<string | null>(null)

  // La navegación PEDIDA. Es la lección 3: adentro del evento del retroceso el router está
  // procesando su propio recorrido, así que se deja pedida y la ejecuta el efecto de abajo, desde un
  // commit de React.
  const [pedida, setPedida] = useState<PendingNav | null>(null)

  // El pedido YA EJECUTADO. Es el segundo hecho de {@link branchPendingNav}, y lo que vuelve la
  // ejecución de un solo disparo POR CONSTRUCCIÓN. En una referencia y no en estado: limpiarlo con
  // `setPedida(null)` desde el efecto es lo que `react-hooks/set-state-in-effect` prohíbe.
  const pedidaEjecutadaRef = useRef<PendingNav | null>(null)

  // ── El sentinel de salida (MOB-05) ────────────────────────────────────────────────────────────
  // `hintVisible` va en ESTADO porque pinta; las otras tres van en REFERENCIAS porque las lee el
  // handler del `popstate`, que necesita el valor FRESCO del tick anterior y no el del render.
  const [hintVisible, setHintVisible] = useState(false)
  const avisoAbiertoRef = useRef(false)
  const sentinelVivoRef = useRef(false)
  const temporizadorRef = useRef<number | null>(null)

  // ── Quién es la dueña ─────────────────────────────────────────────────────────────────────────
  // Declarado ANTES del efecto de marcado a propósito: React corre los efectos de un commit en orden
  // de declaración, así que en el primer montaje la dueña ya está tomada cuando el marcado corre.
  // ⚠ EL CONTEO DE VIVAS SE PREGUNTA **ANTES** DE SUMAR LA PROPIA, y el orden es el mecanismo: en ese
  // instante el conteo es el de las **otras** instancias, así que un cero significa literalmente
  // *nadie vivo podía tener el dominio* — y es el único momento en que la decisión puede sanar. Sube
  // acá y baja en la limpieza: uno sin el otro deja el candado mintiendo.
  useEffect(() => {
    if (branchOwnerDecision({ duenaFigurando: instanciaDuena, preguntaId: id, instanciasVivas }) === 'operar') {
      instanciaDuena = id
    }
    instanciasVivas += 1
    return () => {
      // Con piso en cero a propósito: un conteo NEGATIVO haría que la rama que sana **nunca** se
      // active, y volveríamos al silencio por otro camino.
      instanciasVivas = Math.max(0, instanciasVivas - 1)
      if (instanciaDuena === id) instanciaDuena = null
    }
  }, [id])

  // ── El RASTREO del retroceso ──────────────────────────────────────────────────────────────────
  // ⚠ INDEPENDIENTE DE `drawsExitHint` A PROPÓSITO, al revés del efecto del sentinel: la supresión
  // de la marca tiene que valer igual en un consumidor que no dibuje el aviso de salida. El aviso es
  // de MOB-05; la dirección es de la POLÍTICA, y la política no se negocia por consumidor.
  //
  // Lo único que hace es anotar **la ruta** del aterrizaje (nunca una bandera: ver
  // {@link rutaDelUltimoRetroceso}), leída de la ubicación REAL y no del render — cuando el evento
  // llega, el commit todavía no ocurrió. Se desengancha en la limpieza, como los dos que ya hay.
  useEffect(() => {
    const anotarElAterrizaje = () => {
      recordBackLanding(window.location.pathname)
    }
    window.addEventListener('popstate', anotarElAterrizaje)
    return () => window.removeEventListener('popstate', anotarElAterrizaje)
  }, [])

  // ── La marca, escrita DESPUÉS del commit del router ───────────────────────────────────────────
  // ⚠ EL ÚNICO SUPUESTO ABIERTO QUE QUEDA EN TODA LA FASE, y está declarado en vez de escondido: este
  // efecto tiene que correr DESPUÉS de la escritura del router de Next, o el router pisa la marca. El
  // camino de código está verificado (un reemplazo de estado SIN url no despacha ningún commit); el
  // ORDEN no, porque es semántica de React y del router y no de la pila del navegador — la sonda CDP
  // del plan 03-01 no puede observarlo (supuesto A1). Si estuviera mal, la marca no se escribe y D-03
  // y el criterio 2 degradan A EMPUJAR EN SILENCIO. Por eso es un ítem de la UAT del plan 03-04 y no
  // una nota al pie: el modo de falla de esta fase no lo ve `tsc`, ni la suite, ni el build.
  useEffect(() => {
    const anterior = anteriorRef.current
    anteriorRef.current = pathname
    // El candado de un solo dueño por entrada va ANTES de tocar cualquiera de los dos canales: una
    // instancia que no es la dueña no escribe NI se come el dato de la que sí lo es.
    if (instanciaDuena !== null && instanciaDuena !== id) return
    // ⚠ LOS DOS DATOS DEL MÓDULO SE LEEN Y SE DESCARTAN EN ESTA CORRIDA, haya suprimido o escrito o
    // no: un dato que sobrevive a una corrida suprimiría —o escribiría— en una entrada que no es la
    // que lo pidió.
    const aterrizajeDelRetroceso = takeBackLanding()
    // El canal de propagación del colapso, PRIMERO y sin consultar la decisión: el dato es más
    // preciso que cualquier derivación, porque viene de haber LEÍDO la entrada de abajo.
    if (applyBranchMarkRequest(pathname)) return
    const debajo = branchMarkDecision({
      previous: anterior,
      current: pathname,
      // La supresión aplica SÓLO si el aterrizaje del retroceso es la ruta en la que estamos: por
      // eso el rastreo guarda la ruta y no una bandera.
      vieneDeUnRetroceso: aterrizajeDelRetroceso !== null && aterrizajeDelRetroceso === pathname,
      more,
    })
    if (debajo === null) return
    // La regla 0, la idempotencia y la política las vuelve a chequear la escritura, con el estado
    // REAL de la entrada.
    applyPanelUnder({ from: debajo, to: pathname, more })
  }, [pathname, id, more])

  // ── El segundo paso, ejecutado desde un COMMIT ────────────────────────────────────────────────
  // La decisión NO vive acá: vive en {@link branchPendingNav}, con sus reglas en orden, su docblock y
  // sus casos. Lo que vive acá es sólo lo que no es puro — leer la referencia, escribirla y navegar.
  // El motivo de esa extracción es el bug que este efecto tuvo, y está escrito allá.
  useEffect(() => {
    const aEjecutar = branchPendingNav({ pedida, yaEjecutada: pedidaEjecutadaRef.current })
    if (aEjecutar === null) return
    pedidaEjecutadaRef.current = aEjecutar
    navigate(aEjecutar.href, aEjecutar.mode)
  }, [pedida, navigate])

  // ── Armar el sentinel cuando corresponde ──────────────────────────────────────────────────────
  // ⚠ EL ESTADO DE "TENGO UN SENTINEL VIVO" SE RE-DERIVA DEL ESTADO DE LA ENTRADA DE ARRIBA, acá y en
  // el handler del retroceso, en vez de confiar en la referencia: es la lección de E-6 —al volver de
  // una sección estamos PARADOS SOBRE el sentinel, y eso cuenta como armado— y es lo que deja la
  // referencia honesta aunque algo la haya desincronizado. La referencia sigue existiendo porque en
  // el `popstate` la entrada YA FUE CONSUMIDA y no hay nada de donde derivar.
  const armarSentinel = useCallback(() => {
    // El candado de UN SOLO DUEÑO POR ENTRADA, mecánico y fuera de la decisión, igual que en el
    // efecto de marcado: dos empujes costarían dos atrás y dos consumos se comerían una entrada
    // ajena. Cae del lado seguro: la instancia que no es la dueña simplemente no arma.
    if (branchOwnerDecision({ duenaFigurando: instanciaDuena, preguntaId: id, instanciasVivas }) === 'abstenerse') return
    const estado: unknown = window.history.state
    const paradoSobreElNuestro = isPanelExitEntry(estado, id)
    // ⚠ LOS HECHOS SE IZAN A CONSTANTES (plan 03-12) para que la decisión y el canal de diagnóstico
    // lean el MISMO valor: dos lecturas del mismo dato en el mismo gesto son dos verdades que pueden
    // diferir (lección 1 del encabezado). El izado no cambia ningún valor ni ningún orden.
    // ⚠ EL HECHO DE LA SÉPTIMA REGLA, leído del hash REAL de `location` y no del estado: el punto
    // entero de la regla es que el estado puede estar pisado mientras la URL sigue siendo nuestra
    // (E-13, mitad B). Con un `startsWith` a secas, `#salirXYZ` contaría como nuestro.
    const urlNuestra = urlAlreadyHoldsExitHash(window.location.hash)
    const ajenaArriba = isForeignOwnedEntry(estado)
    // ⚠ EL HECHO DE LA DECISIÓN (a), LEÍDO DEL ESTADO REAL DE LA ENTRADA DE ARRIBA EN EL MOMENTO
    // DE DECIDIR, nunca de un valor de render: entre un render y el gesto pudo haber una escritura
    // ajena que se llevó la marca. Es el mismo criterio con el que la ruta se re-lee de `location`.
    // Y se contesta con la marca de la rama —que YA guarda la ruta que quedó debajo— en vez de con
    // una clave nueva: la regla 0 tiene TRES dueños a propósito.
    const marcaDebajo = panelUnderRoute(estado)
    const hechos = {
      participates: drawsExitHint,
      // La ruta se re-lee de `location` y no del render: la decisión se toma con el estado REAL.
      atRoot: window.location.pathname === root,
      hintOpen: avisoAbiertoRef.current,
      topIsOurs: paradoSobreElNuestro,
      urlYaLlevaNuestroHash: urlNuestra,
      foreignOwnsTop: ajenaArriba,
      algoNuestroDebajo: marcaDebajo !== null,
    }
    const accion = panelExitArmAction(hechos)
    const vivoAntes = sentinelVivoRef.current
    if (accion === 'none') {
      // E-6: si estamos parados sobre el nuestro, seguimos siendo dueños de un sentinel vivo.
      if (paradoSobreElNuestro) sentinelVivoRef.current = true
    } else {
      window.history.pushState(panelExitState(id), '', nextPanelExitHash(window.location.hash))
      sentinelVivoRef.current = true
    }
    // El canal de diagnóstico, DESPUÉS de la decisión y de la rama: graba el valor de *seguimos
    // absorbiendo* de antes y de después, que es lo que la medición del plan 03-12 pregunta.
    recordExitDiag({
      tipo: 'armado',
      ruta: window.location.pathname,
      hash: window.location.hash,
      estado,
      id,
      duenaFigurando: instanciaDuena,
      instanciasVivas,
      hechos,
      accion,
      vivoAntes,
      vivoDespues: sentinelVivoRef.current,
    })
  }, [drawsExitHint, id, root])

  useEffect(() => {
    armarSentinel()
  }, [armarSentinel, pathname])

  // ── El atrás del dueño en la raíz: absorber UNA vez, avisar, y re-armar al expirar ────────────
  useEffect(() => {
    if (!drawsExitHint) return
    instalarRastreadorDeTeclado()

    const alRetroceder = () => {
      if (branchOwnerDecision({ duenaFigurando: instanciaDuena, preguntaId: id, instanciasVivas }) === 'abstenerse') return
      const estado: unknown = window.history.state
      // Los cinco hechos, izados para que la decisión y el canal de diagnóstico lean el MISMO valor
      // (el del teclado, además, escribe estado del rastreador: leerlo dos veces no es inocuo).
      const vivoAntes = sentinelVivoRef.current
      const hechos = {
        topIsOurs: isPanelExitEntry(estado, id),
        participates: drawsExitHint,
        atRoot: window.location.pathname === root,
        holding: vivoAntes,
        keyboardGuards: elTecladoSeComeElAtras(),
      }
      const accion = panelExitPopAction(hechos)
      // El canal de diagnóstico, DESPUÉS de la decisión y ANTES de las ramas, que son deterministas.
      recordExitDiag({
        tipo: 'retroceso',
        ruta: window.location.pathname,
        hash: window.location.hash,
        estado,
        id,
        duenaFigurando: instanciaDuena,
        instanciasVivas,
        hechos,
        accion,
        vivoAntes,
        vivoDespues: vivoAntes,
      })
      if (accion === 'ignore') {
        // ⚠ EL CUARTO MOMENTO DE REINTENTO, y el único que cubre los gestos que NO CAMBIAN LA RUTA.
        // Un retroceso ignorado significa que el atrás hizo algo que **no era nuestro** —cerrar un
        // overlay, consumir una sección que teníamos encima— y después de eso podemos estar parados
        // en la raíz **sin sentinel**, con la ruta **sin cambiar**: el efecto del armado tiene deps
        // `[armarSentinel, pathname]`, así que **no vuelve a correr**, y el atrás siguiente sale del
        // panel sin avisar. Es el ítem **20** de la UAT visto desde el otro lado, y es la mitad que
        // nunca se midió en Android (*"no tengo overlays en inicio como para probar eso"*).
        // Molde exacto de la rama del teclado de abajo: un `pushState` desde adentro del `popstate`
        // es lo que este módulo ya hace en producción (lo que NO se puede pedir desde el evento es
        // una navegación del router — lección 3 del encabezado).
        // Y es inofensivo en los otros cuatro motivos de *ignorar*: parados sobre el nuestro la
        // cuarta regla devuelve `none` (y re-deriva que seguimos teniendo un sentinel vivo, E-6),
        // fuera de la raíz devuelve la segunda, y sin nadie que dibuje el aviso la primera.
        armarSentinel()
        return
      }

      if (accion === 'rearm') {
        // C-7: el atrás en realidad bajaba el teclado. Se re-arma EN EL ACTO y el aviso NO se gasta.
        sentinelVivoRef.current = false
        armarSentinel()
        return
      }

      // 'hint': el navegador YA consumió nuestro sentinel. Dejamos de ser dueños ANTES de mostrar el
      // aviso, para que ningún otro camino intente un retroceso sobre una entrada que ya no es
      // nuestra. Y NO se re-arma hasta que la ventana expire: eso es lo que hace que el segundo
      // atrás salga.
      sentinelVivoRef.current = false
      avisoAbiertoRef.current = true
      setHintVisible(true)
      // ⚠ EL ÚNICO TEMPORIZADOR DEL MÓDULO, Y HACE LAS DOS COSAS: oculta el aviso y re-arma. No hay
      // un segundo efecto, así que no hay dos números que puedan desincronizarse (§13).
      temporizadorRef.current = window.setTimeout(() => {
        temporizadorRef.current = null
        avisoAbiertoRef.current = false
        setHintVisible(false)
        armarSentinel()
      }, PANEL_EXIT_HINT_MS)
    }

    window.addEventListener('popstate', alRetroceder)
    return () => window.removeEventListener('popstate', alRetroceder)
  }, [drawsExitHint, id, root, armarSentinel])

  // ── El desmontaje, con la guarda REPETIDA ─────────────────────────────────────────────────────
  // La barra vive en el layout del route group y no se re-monta, así que en la práctica esto corre
  // una sola vez (al salir del panel). Existe igual porque un sentinel huérfano deja un atrás que no
  // hace nada visible. Las deps son `[id]` y no `[]` porque el id se lee adentro; al ser constante
  // por instancia, la limpieza corre SÓLO al desmontar.
  useEffect(() => {
    return () => {
      if (temporizadorRef.current !== null) window.clearTimeout(temporizadorRef.current)
      if (!sentinelVivoRef.current) return
      sentinelVivoRef.current = false
      // La guarda de la cicatriz 2, otra vez y no "ya la chequeé arriba": si el desmontaje fue por
      // una navegación, arriba está la entrada del router y este retroceso la desharía.
      if (isPanelExitEntry(window.history.state, id)) window.history.back()
    }
  }, [id])

  function handleNavigate(href: string): boolean {
    const estado: unknown = window.history.state
    const plan = panelBranchPlan({
      from: pathname,
      to: href,
      more,
      // El segundo hecho, leído del MISMO estado y re-verificado en el momento del click, igual que
      // el de la rama: tocar el destino actual con el sentinel arriba no tiene que hacer NADA.
      holdsExitSentinel: isPanelExitEntry(estado, id),
      // ⚠ EL HECHO SE COMPUTA COMPARANDO LA MARCA CONTRA LA RUTA DE MÁS, y no preguntando "¿hay
      // marca?". Es lo que hace que desktop no se entere POR CONSTRUCCIÓN (criterio 6): en escritorio
      // nada navega a Más ⇒ la marca nunca dice Más ⇒ el hecho es siempre falso ⇒ la decisión cae en
      // las ramas de siempre. Sin un chequeo de viewport en el medio.
      masDebajo: panelUnderRoute(estado) === more,
      // ⚠ EL TERCER HECHO (G2-1), Y SE RE-VERIFICA EN EL MOMENTO DEL CLICK, sobre el MISMO `estado`
      // que ya se leyó para los otros dos. Dos lecturas del estado en el mismo gesto serían dos
      // verdades que pueden diferir: entre un render y el click pudo haber una escritura blanda que
      // se llevó la marca (la lección 1 del encabezado de este módulo).
      // Y se computa con la forma *la marca DICE la raíz* —no *¿hay marca?*—, que es exactamente la
      // misma forma que usa `masDebajo` justo arriba y por el mismo motivo: así el hecho no se
      // dispara donde no corresponde, y la política no necesita preguntarle nada a la pantalla.
      raizDebajo: panelUnderRoute(estado) === root,
    })
    // ⚠ LA PROPAGACIÓN (G3-1, plan 03-11), Y VA ACÁ PORQUE ACÁ ES EL ÚNICO MOMENTO EN QUE EL VALOR
    // EXISTE. El `<Link>` reemplaza con su prefetch y su transición, y el router escribe su propio
    // state encima: para cuando el efecto de marcado corre, la marca de esta entrada ya no está. El
    // valor sale del MISMO `estado` que se leyó arriba para los tres hechos —una sola lectura por
    // gesto, nunca dos verdades que puedan diferir— y la decisión de propagarlo o no vive en el
    // productor, con sus reglas en orden.
    branchCarryMark({ plan, from: pathname, to: href, rutaDebajo: panelUnderRoute(estado) })
    if (plan === 'push' || plan === 'replace') return false
    // ⚠ EL DOMINIO SE SUELTA ANTES DE DELEGAR, y es obligatorio (T-03-29). El retroceso que viene
    // es DELIBERADO —lo pedimos nosotros—, así que si llega a `panelExitPopAction` con el hecho de
    // *éramos dueños de un sentinel vivo* encendido, se lee como el atrás del dueño y devuelve
    // *avisar*: APARECERÍA EL AVISO DE SALIDA al tocar un destino de la barra. Un bug nuevo
    // fabricado por el arreglo.
    // Y cae del lado seguro: sin el hecho, el peor caso es que el aviso NO aparezca sobre una
    // entrada que ya no es nuestra —nunca un retroceso sobre entrada ajena—, y el efecto de armado
    // RE-DERIVA el hecho del estado de la entrada de arriba en el commit siguiente, que es la
    // lección de E-6.
    if (plan === 'consume-exit-then-navigate') sentinelVivoRef.current = false
    return runBranchNavigation({
      plan,
      to: href,
      more,
      root,
      navigate: (destino, modo) => setPedida({ href: destino, mode: modo }),
      // El identificador de dueño: esta instancia SÍ es la dueña del sentinel (lo empujó con este
      // mismo id en `armarSentinel`), así que la rama del consumo puede correr.
      exitId: id,
    })
  }

  return { handleNavigate, hintVisible }
}
