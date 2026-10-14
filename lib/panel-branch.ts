import { useEffect, useRef, useState } from 'react'
import { PANEL_MORE, PANEL_ROOT, applyPanelUnder, consumeOwnedBranchEntry, panelBranchPlan, panelNavMode, panelUnderRoute, type PanelBranchPlan } from '@/lib/panel-history'

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
//   · NO agrega nada visible (D-04): ni ilumina Más estando en su rama, ni pone un volver-a-Más, ni
//     un breadcrumb.

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

/**
 * El ejecutor. Devuelve `true` si **se hizo cargo** del gesto (⇒ el call site tiene que PREVENIR la
 * navegación) y `false` si no (⇒ el call site deja navegar, y la pila queda un escalón más larga:
 * la degradación segura).
 *
 * **De los cinco miembros del plan le llegan tres**: subir, colapsar y nada. Empujar y reemplazar los
 * ejecuta el `<Link>`, con su prefetch y su transición — por eso devuelve `false` para los dos, en
 * vez de reimplementar una navegación peor. *Nada* no toca nada y se hace cargo; hoy todavía no lo
 * produce nadie, lo produce el plan 03-03.
 *
 * ⚠ **El diferimiento de la navegación es responsabilidad del CALL SITE, no de esta función** (ver
 * la lección 3 del encabezado): acá la navegación se recibe como callback y se **llama** desde el
 * evento. Quien la convierte en "pedida en estado y ejecutada por un efecto" es
 * {@link usePanelBranch}. Separarlo así es lo que deja cubrir el ejecutor entero en una suite pura.
 */
export function runBranchNavigation({
  plan,
  to,
  more = PANEL_MORE,
  navigate,
}: {
  plan: PanelBranchPlan
  to: string
  more?: string
  navigate: BranchNavigate
}): boolean {
  // *Nada*: se hace cargo sin tocar la pila. Lo produce el plan 03-03.
  if (plan === 'none') return true
  // Los dos modos del `<Link>`: no son nuestros.
  if (plan === 'push' || plan === 'replace') return false

  // Subir es un paso solo: un retroceso guardado y listo. La guarda de la marca se re-verifica
  // adentro del consumo (lección 1), así que sin marca esto devuelve `false` y nadie retrocede.
  if (plan === 'up') return consumeOwnedBranchEntry()

  // ── El colapso: dos pasos, y el segundo sale del EVENTO del primero ──────────────────────────
  const segundoPaso = () => {
    const paso = branchSecondStep({
      parado: window.location.pathname,
      more,
      // La marca de la entrada de Más, leída recién ahora: es el único momento en que se puede.
      rutaDebajo: panelUnderRoute(window.history.state),
      to,
    })
    if (paso === 'abort') return
    if (paso === 'second-consume') {
      // El segundo consumo SÍ se puede hacer desde adentro del evento: es un retroceso, no una
      // navegación del router (el precedente es la continuación de dos pasos de
      // `lib/dirty-history.ts`, y está medido en E-5). Y pasa igual por las dos guardas: si la marca
      // se perdió en el medio, no se retrocede y se navega, que es la degradación segura.
      if (consumeOwnedBranchEntry()) return
      navigate(to, 'replace')
      return
    }
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
 * Cuándo hay que marcar la entrada actual, y con qué ruta. Pura.
 *
 * Devuelve la ruta que quedó debajo, o `null` si no hay nada que anotar. Las cuatro ramas:
 *   · sin ruta anterior (primer commit de la instancia) ⇒ no marcar: no sabemos qué quedó debajo;
 *   · ruta anterior igual a la actual ⇒ no marcar: no hubo navegación;
 *   · la política dice **reemplazar** ⇒ no marcar: la entrada de abajo es la misma de antes;
 *   · la política dice **empujar** ⇒ marcar con la ruta **anterior**, que es la que quedó debajo.
 */
export function branchMarkDecision({
  previous,
  current,
  root = PANEL_ROOT,
  more = PANEL_MORE,
}: {
  previous: string | null
  current: string
  root?: string
  more?: string
}): string | null {
  if (previous === null) return null
  if (previous === current) return null
  if (panelNavMode({ from: previous, to: current, root, more }) !== 'push') return null
  return previous
}

/**
 * Cablea la rama de Más a un menú: marca cada entrada con lo que quedó debajo, y resuelve los gestos
 * que la política de rutas sola no puede resolver.
 *
 * @param pathname La ruta actual, que ENTRA como parámetro (este módulo no importa el router).
 * @param navigate Cómo navegar, también como parámetro. El call site la arma con el router.
 *
 * Devuelve `handleNavigate(href)`: `true` si se hizo cargo del gesto (⇒ prevenir la navegación) y
 * `false` si no (⇒ dejar que el `<Link>` navegue como siempre).
 */
export function usePanelBranch({
  pathname,
  navigate,
  more = PANEL_MORE,
}: {
  pathname: string
  navigate: BranchNavigate
  more?: string
}): { handleNavigate: (href: string) => boolean } {
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
  const [pedida, setPedida] = useState<{ href: string; mode: BranchNavMode } | null>(null)

  // ── Quién es la dueña ─────────────────────────────────────────────────────────────────────────
  // Declarado ANTES del efecto de marcado a propósito: React corre los efectos de un commit en orden
  // de declaración, así que en el primer montaje la dueña ya está tomada cuando el marcado corre.
  useEffect(() => {
    if (instanciaDuena === null) instanciaDuena = id
    return () => {
      if (instanciaDuena === id) instanciaDuena = null
    }
  }, [id])

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
    if (instanciaDuena !== null && instanciaDuena !== id) return
    const debajo = branchMarkDecision({ previous: anterior, current: pathname, more })
    if (debajo === null) return
    // La regla 0 y la política las vuelve a chequear la escritura, con el estado REAL de la entrada.
    applyPanelUnder({ from: debajo, to: pathname, more })
  }, [pathname, id, more])

  // ── El segundo paso, ejecutado desde un COMMIT ────────────────────────────────────────────────
  // No hace falta limpiar `pedida`: con las mismas deps el efecto no vuelve a correr, y un gesto
  // nuevo trae un objeto nuevo.
  useEffect(() => {
    if (!pedida) return
    navigate(pedida.href, pedida.mode)
  }, [pedida, navigate])

  function handleNavigate(href: string): boolean {
    const plan = panelBranchPlan({
      from: pathname,
      to: href,
      more,
      // ⚠ EL HECHO SE COMPUTA COMPARANDO LA MARCA CONTRA LA RUTA DE MÁS, y no preguntando "¿hay
      // marca?". Es lo que hace que desktop no se entere POR CONSTRUCCIÓN (criterio 6): en escritorio
      // nada navega a Más ⇒ la marca nunca dice Más ⇒ el hecho es siempre falso ⇒ la decisión cae en
      // las ramas de siempre. Sin un chequeo de viewport en el medio.
      masDebajo: panelUnderRoute(window.history.state) === more,
    })
    if (plan === 'push' || plan === 'replace') return false
    return runBranchNavigation({
      plan,
      to: href,
      more,
      navigate: (destino, modo) => setPedida({ href: destino, mode: modo }),
    })
  }

  return { handleNavigate }
}
