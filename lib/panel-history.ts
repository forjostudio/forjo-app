// ── Una sola forma de tocar el historial del panel (NAV-05) ──────────────────────────────────────
//
// POR QUÉ EXISTE
// El panel tiene subsecciones que viven en `useState` y por lo tanto NO EXISTEN para el navegador: el
// detalle de cliente, los tabs de `/negocio`, `/settings` y `/finances`. El síntoma que el dueño
// reportó (Bug B de la UAT de v0.24) es que ir a Finanzas → Clientes → abrir un cliente → atrás cae
// en Finanzas, porque abrir el cliente no empujó nada. Arreglarlo pantalla por pantalla produciría un
// dialecto distinto por pantalla, y la próxima subsección que alguien agregue volvería a romper el
// back. Por eso la política —empujar, reemplazar, no hacer nada o consumir— vive acá, en UN módulo,
// y cada call site sólo DECLARA qué pasó.
//
// POR QUÉ LAS DECISIONES VIVEN ACÁ Y NO ADENTRO DEL COMPONENTE
// `vitest.config.mts:48` corre `environment: 'node'`: no hay jsdom ni Testing Library, y el milestone
// prohíbe paquetes nuevos. Lo único cubrible por un test es el "qué se decide" — y por eso se extrae.
// Es el molde que el repo ya aplica en `lib/unsaved-changes.ts` (`decideNavigation`), en
// `lib/landing/lightbox.ts` y en `lib/overlay-history.ts`.
//
// LAS CICATRICES QUE HEREDA (son bugs ya sufridos en producción, no paranoia)
//   1) EMPUJAR LA MISMA URL COLAPSA LA ENTRADA. No se crea ninguna entrada nueva, el "atrás" no tiene
//      nada que deshacer y SACA AL USUARIO DE LA PÁGINA. Por eso `from === to` nunca escribe, y por
//      eso {@link panelViewUrl} nunca deja un `?` colgando: `/clients?` no es `/clients`.
//   2) NUNCA UN `back()` SOBRE UNA ENTRADA AJENA. Consumir una entrada que no empujamos nosotros
//      expulsa al usuario del sitio. Por eso la acción `consume` sólo sale con `holding: true`.
//   3) EL OVERLAY QUE ESTÁ CONSUMIENDO SU ENTRADA GANA SIEMPRE. Es la regla 0 de
//      {@link panelHistoryAction}, y es la que cierra C-1 — está explicada entera ahí.
//
// QUÉ NO HACE
//   - NO escucha `popstate` y NO reescribe historial ajeno (D-01, "historia honesta"): el atrás lo
//     maneja el router de Next y la vista DERIVA de la URL. Acá no hay ninguna entrada falsa.
//   - NO toca `lib/overlay-history.ts`: convive con él mirándole la marca, nada más (NAV-06).
//   - NO decide qué se muestra: eso lo resuelve el componente contra su lista ya filtrada por tenant.
//
// SIN DIRECTIVA DE FRONTERA DE CLIENTE A PROPÓSITO, igual que `lib/overlay-history.ts:45-48`: el
// consumidor (`clients-client.tsx`) ya la declara, y marcar este módulo como frontera arrastraría sus
// funciones puras adentro sin ninguna necesidad — y con ellas su suite.

// ── El contrato ──────────────────────────────────────────────────────────────────────────────────

/** Qué hay que hacerle al historial. `consume` = deshacer NUESTRA entrada (un back guardado). */
export type PanelHistoryAction =
  /** Crear una entrada nueva: el destino es un lugar al que el atrás tiene que poder volver. */
  | 'push'
  /** Cambiar la URL sin crear entrada: la vista cambió, pero no es un destino propio. */
  | 'replace'
  /** No tocar nada. */
  | 'none'
  /** Deshacer la entrada que empujamos nosotros (un `back()` guardado). */
  | 'consume'

/** Por qué cambia la vista. El call site declara la SITUACIÓN; la política la decide este módulo. */
export type PanelViewCause =
  /** El usuario eligió un destino (tocó un cliente de la lista). */
  | 'user-open'
  /** El usuario pidió volver (el "Volver" de mobile). */
  | 'user-close'
  /** La app re-apunta la vista sola (la URL alcanzando al cliente conservado de una fusión). */
  | 'programmatic'
  /** Un filtro, no una subsección (el `activeLoc` de Agenda, T-3). No es un destino: reemplaza. */
  | 'filter'
  /** El valor de la URL no resuelve a nada y hay que sanearla (borrado, id inexistente, id ajeno). */
  | 'stale'
  /** Un overlay está cerrándose en ESTE MISMO commit: su `back()` y nuestra escritura competirían. */
  | 'concurrent'

/**
 * La decisión, con las reglas EN ORDEN.
 *
 * **Por qué la firma lleva `cause` y no un booleano `push`:** el criterio 4 exige que exista una sola
 * forma. Con un booleano, cada call site volvería a decidir la política y la Phase 2 la re-decidiría
 * para los tabs — los dos dialectos que NAV-05 viene a evitar. Con `cause`, el call site declara *qué
 * pasó* y el módulo decide *qué se hace*. Mismo contrato que `decideNavigation`
 * (`lib/unsaved-changes.ts`).
 *
 * @param holding ¿La entrada de arriba del stack la empujamos nosotros? (guarda de la cicatriz 2)
 * @param foreignOwnsTop ¿La entrada de arriba lleva la marca de OTRO dueño? (regla 0, cicatriz 3)
 */
export function panelHistoryAction({
  cause,
  from,
  to,
  holding,
  foreignOwnsTop,
}: {
  cause: PanelViewCause
  from: string | null
  to: string | null
  holding: boolean
  foreignOwnsTop: boolean
}): PanelHistoryAction {
  // ── REGLA 0 — mientras la entrada de arriba tenga OTRO dueño, no se escribe. ───────────────────
  // ⚠ ES LA REGLA QUE CIERRA C-1, Y ES ABSOLUTA A PROPÓSITO. Los otros dos módulos que escriben
  // historial —`lib/overlay-history.ts` y `lib/dirty-history.ts`— marcan su entrada con un hash
  // propio y una clave en el state; escribir encima le borra las dos, así que su dueño ya no
  // reconoce su entrada, no hace su `back()`, y queda basura en la pila más un atrás muerto.
  // Debilitarla "para dejar pasar sólo el replace de la fusión" cambia una regresión por un defecto:
  // el `replaceState` caería justo sobre la entrada del modal de fusión, que es el que la tiene
  // arriba mientras su botón corre.
  // LA ESCRITURA NO SE PIERDE: queda PENDIENTE, y la aplica el efecto de reconciliación del
  // componente en cuanto el otro dueño suelta la entrada.
  if (foreignOwnsTop) return 'none'

  // ── REGLA 1 — el commit concurrente nunca toca el historial. ───────────────────────────────────
  // Es la declaración del call site del borrado, y es un candado INDEPENDIENTE de la regla 0: si
  // mañana el marcador del overlay cambia de nombre y la regla 0 deja de reconocerlo, ésta sigue de
  // pie. Dos candados, no uno.
  if (cause === 'concurrent') return 'none'

  // ── REGLA 2 — sin cambio real no se escribe (cicatriz 1). ──────────────────────────────────────
  // Incluye `null === null`, que es el saneo pedido sobre una URL que ya está limpia.
  if (from === to) return 'none'

  switch (cause) {
    // Un cliente es un destino. Cambiar de A a B también: el atrás tiene que devolver la ficha
    // anterior, igual que en cualquier app nativa (decisión ① del plan).
    case 'user-open':
      return 'push'
    // Si la entrada de arriba es nuestra, el cierre la DESHACE y la pila queda como antes de abrir.
    // Si no lo es —el dueño entró pegando la URL—, un `back()` lo sacaría del sitio: se reemplaza.
    case 'user-close':
      return holding ? 'consume' : 'replace'
    // La app re-apunta la vista sola: no es un destino que el usuario haya elegido, así que no puede
    // crear una entrada. Es el criterio 3 del ROADMAP ("la fusión reemplaza en vez de empujar").
    case 'programmatic':
      return 'replace'
    // Un filtro tampoco es un destino (T-3). Si cada cambio de sucursal empujara historia, salir de
    // Agenda después de editar horarios costaría diez backs.
    case 'filter':
      return 'replace'
    // ⚠ El saneo CONSUME cuando la entrada es nuestra, no reemplaza. Reemplazar dejaría `/clients`
    // encima de `/clients`: dos entradas idénticas, y el dueño tendría que apretar atrás dos veces
    // para que pase algo visible — la "entrada basura" que el criterio 3 prohíbe.
    case 'stale':
      return holding ? 'consume' : 'replace'
    default: {
      // Agregar una causa en la Phase 2 sin decidir su acción NO COMPILA. Es el candado contra el
      // segundo dialecto: una causa nueva obliga a escribir su política acá, no en el call site.
      const _exhaustivo: never = cause
      return _exhaustivo
    }
  }
}

// ── El marcador de nuestras entradas ─────────────────────────────────────────────────────────────

/** El state que se empuja: sólo nuestra marca, con el NOMBRE del parámetro que gobierna la vista. */
export type PanelViewState = { frjView: string | null }

/**
 * El state a escribir. **Objeto literal FRESCO, siempre.**
 *
 * ⚠ **LA TRAMPA QUE FALLA EN SILENCIO.** La forma "cuidadosa" que uno escribiría —propagar el state
 * actual y agregarle la marca— arrastra `__NA`, y el parche de Next toma entonces su rama temprana
 * (`if (data?.__NA || data?._N) return original…`, `next/dist/client/components/app-router.js:253-255`)
 * y **no despacha `ACTION_RESTORE`**: la URL en la barra cambia, `useSearchParams` NO se actualiza, el
 * detalle no abre, y **no hay ni un error en consola**. Molde correcto: `overlayHistoryState`
 * (`lib/overlay-history.ts:93-95`). Next igual COPIA sus internos adentro de este objeto al escribir,
 * que es lo que mantiene la entrada sana — por eso tampoco hay que guardarse una referencia al método
 * original del historial.
 *
 * **Por qué la marca lleva el NOMBRE del parámetro y no el valor:** la propiedad que interesa es
 * "esta entrada la empujamos nosotros *para esta vista*", que no cambia cuando el dueño pasa del
 * cliente A al B, y que la Phase 2 va a poder distinguir de sus tabs sin tocar nada de acá. Un
 * destino nulo deja la marca en `null`: una entrada que no lleva nuestra vista no es nuestra y no se
 * puede consumir.
 */
export function panelViewState(param: string, value: string | null): PanelViewState {
  return { frjView: value === null ? null : param }
}

/**
 * ¿Qué vista marca la entrada de arriba? Devuelve el NOMBRE del param que la gobierna, o `null` si
 * la entrada no es nuestra.
 *
 * Narrowing manual, sin `any` (tsconfig `strict`), copiando la forma de `isOverlayHistoryEntry`
 * (`lib/overlay-history.ts:110-117`): `history.state` es `unknown` de verdad — puede traer el state
 * del router de Next, el de un overlay, el de otra librería, o `null`.
 *
 * **Por qué devuelve el param en vez de un booleano:** hay dos preguntas distintas y una sola
 * propiedad que las contesta. La pantalla pregunta *"¿la entrada de arriba es MÍA?"* (sabe su param);
 * el sidebar, que no sabe nada de `?c=`, pregunta *"¿la entrada de arriba es de ALGUNA subsección del
 * panel?"* (NAV-08). Con el param crudo las dos se derivan de acá y el literal `'frjView'` sigue
 * escrito UNA sola vez — que es la única defensa real contra el segundo dialecto.
 *
 * Un destino nulo deja la marca en `null` ({@link panelViewState}) y por lo tanto NO es nuestra: una
 * entrada que no lleva ninguna vista no se puede consumir.
 */
export function panelViewEntryParam(state: unknown): string | null {
  if (typeof state !== 'object' || state === null || !('frjView' in state)) return null
  const marca: unknown = (state as { frjView?: unknown }).frjView
  return typeof marca === 'string' ? marca : null
}

/**
 * ¿La entrada de arriba del historial es una que empujamos nosotros PARA ESTA VISTA?
 *
 * Es {@link panelViewEntryParam} preguntado por un param concreto. La pantalla que empujó `?c=` lo
 * usa como guarda de la cicatriz 2 antes de consumir.
 */
export function isPanelViewEntry(state: unknown, param: string): boolean {
  return panelViewEntryParam(state) === param
}

// ── La marca de LA RAMA: qué ruta quedó debajo de esta entrada (D-03 / criterio 2) ───────────────

/**
 * El state que se escribe sobre la entrada actual: sólo la RUTA que quedó inmediatamente debajo.
 *
 * ⚠ **CLAVE NUEVA, Y NO SE REUSA NINGUNA DE LAS TRES QUE YA VIVEN EN LA PILA.** Reusar `frjView`,
 * `frjOverlay` o `frjDirty` sería el peor error posible de este plan: el otro módulo reconocería
 * esta entrada como PROPIA, haría su retroceso sobre ella y el dueño terminaría fuera del sitio.
 * Por lo mismo esta marca **NO** entra en {@link isForeignOwnedEntry} — ver su docblock.
 */
export type PanelUnderState = { frjUnder: string }

/**
 * El state a escribir. **Objeto literal FRESCO, siempre**, igual que {@link panelViewState}.
 *
 * ⚠ **LA MISMA TRAMPA QUE FALLA EN SILENCIO.** La forma "cuidadosa" —propagar el state actual y
 * agregarle la marca— arrastra `__NA`, el parche de Next toma entonces su rama temprana
 * (`next/dist/client/components/app-router.js:253-255`) y **no despacha la restauración**: la URL en
 * la barra cambia, el router NO se entera, y **no hay ni un error en consola**. Es el modo de falla
 * más caro de este repo y está documentado arriba, en {@link panelViewState}.
 *
 * ⚠ **POR QUÉ SE DECLARA COMO `const` Y NO COMO `export function`, siendo el único del módulo.** El
 * candado de "un solo lugar arma la marca" se mide contando `panelUnderState(` en el archivo y
 * exigiendo **exactamente uno**. Con `export function panelUnderState(`, la **declaración** entra en
 * ese conteo y el candado no puede dar uno ni con un solo call site: mediría la forma de la
 * declaración en vez del número de escritores. Declarado así, lo único que el conteo ve son los
 * **call sites** — que es lo que el candado dice medir.
 */
export const panelUnderState = (route: string): PanelUnderState => ({ frjUnder: route })

/**
 * ¿Qué ruta quedó debajo de la entrada de arriba? Devuelve la ruta, o `null` si la entrada no lleva
 * nuestra marca de rama.
 *
 * Narrowing manual, sin `any` (tsconfig `strict`), copiando la forma de {@link panelViewEntryParam}:
 * `history.state` es `unknown` de verdad — puede traer el state del router de Next, el de un
 * overlay, el del sentinel de cambios sin guardar, o `null`.
 *
 * ⚠ **POR QUÉ LA MARCA GUARDA LA RUTA Y NO UN BOOLEANO.** Es una decisión MEDIDA, no de gusto: el
 * caso degenerado del criterio 2 —el destino de la barra es justo la ruta que quedaría debajo—
 * necesita saber **cuál** es esa ruta, y leerla **después** del primer retroceso (o sea estando
 * parado sobre la entrada de Más). Con un booleano esa rama no se puede detectar, y reemplazar ahí
 * dejaría dos entradas idénticas adyacentes: un atrás que no hace nada visible, la cicatriz 1.
 * Medido en el escenario **E-5** de `.planning/debug/pila-de-dos-niveles-medida.md`.
 */
export function panelUnderRoute(state: unknown): string | null {
  if (typeof state !== 'object' || state === null || !('frjUnder' in state)) return null
  const marca: unknown = (state as { frjUnder?: unknown }).frjUnder
  return typeof marca === 'string' ? marca : null
}

/**
 * ¿La entrada de arriba pertenece a un overlay de `lib/overlay-history.ts`? Es el predicado de la
 * regla 0.
 *
 * ⚠ **El literal `frjOverlay` se duplica a propósito.** El CONTEXT de la fase prohíbe tocar
 * `lib/overlay-history.ts` (NAV-06: no empeorarlo, no rediseñarlo), así que no se puede exportar de
 * allá una constante para importarla acá. El candado contra la deriva no es la disciplina: es un test
 * que LEE ese archivo y exige que el literal siga siendo el mismo — lo agrega el plan **01-02**, y el
 * gate de código de este plan ya verifica que el marcador siga existiendo allá.
 */
export function isOverlayOwnedEntry(state: unknown): boolean {
  return (
    typeof state === 'object' &&
    state !== null &&
    'frjOverlay' in state &&
    typeof (state as { frjOverlay?: unknown }).frjOverlay === 'number'
  )
}

/**
 * ¿La entrada de arriba es el sentinel de cambios sin guardar de `lib/dirty-history.ts`? Es la
 * segunda mitad del predicado de la regla 0.
 *
 * ⚠ **El literal `frjDirty` se duplica a propósito, por el mismo motivo que `frjOverlay`**: este
 * módulo no declara frontera de cliente (ver su encabezado) y `lib/dirty-history.ts` exporta además
 * un hook de React, así que importar de allá arrastraría React adentro del grafo de este módulo —y
 * de su suite— sin ninguna necesidad. El candado contra la deriva no es la disciplina: es el test
 * que LEE los dos archivos y exige que el literal siga siendo el mismo.
 *
 * ⚠ **POR QUÉ HACE FALTA, Y POR QUÉ AHORA.** `applyPanelView` escribe con `pushState`/`replaceState`
 * y hoy sólo se abstiene ante un overlay, así que escribiría ENCIMA del sentinel: el guard dejaría
 * de reconocer su entrada, no la consumiría al guardar y el atrás quedaría muerto. Hoy no pasa
 * —Agenda no llama a `applyPanelView`— pero la Phase 2 planea cablear su `activeLoc` con la causa
 * `'filter'` (⇒ `replace`), y ese día el reemplazo cae justo sobre el sentinel. Se cierra antes de
 * que exista el call site, no después.
 */
export function isDirtyGuardOwnedEntry(state: unknown): boolean {
  return (
    typeof state === 'object' &&
    state !== null &&
    'frjDirty' in state &&
    typeof (state as { frjDirty?: unknown }).frjDirty === 'number'
  )
}

/**
 * ¿La entrada de arriba es el **sentinel de salida** de `lib/panel-branch.ts` (MOB-05)? Es la
 * tercera parte del predicado de la regla 0.
 *
 * ⚠ **El literal `frjExit` se duplica a propósito, por el mismo motivo que `frjDirty`**: este módulo
 * no declara frontera de cliente (ver su encabezado) y `lib/panel-branch.ts` exporta además un hook
 * de React, así que importar de allá arrastraría React adentro del grafo de este módulo —y de su
 * suite— sin ninguna necesidad. El candado contra la deriva no es la disciplina: es el test que LEE
 * los dos archivos y exige que el literal siga siendo el mismo.
 *
 * ⚠ **POR QUÉ HACE FALTA.** El sentinel es una entrada **absorbente**: existe para comerse el primer
 * atrás en la raíz del panel y que el aviso de salida alcance a mostrarse. {@link applyPanelView}
 * escribiéndole encima le **borra la marca**, su dueño ya no la reconoce, no la consume al expirar la
 * ventana del aviso, y queda **basura en la pila más un atrás muerto**. Es el mismo argumento con el
 * que se agregó {@link isDirtyGuardOwnedEntry}, palabra por palabra — y acá el call site **ya
 * existe**: en Inicio el sentinel está arriba justo cuando el detalle de cliente de `/clients`
 * podría escribir.
 */
export function isExitSentinelOwnedEntry(state: unknown): boolean {
  return (
    typeof state === 'object' &&
    state !== null &&
    'frjExit' in state &&
    typeof (state as { frjExit?: unknown }).frjExit === 'number'
  )
}

/**
 * ¿La entrada de arriba pertenece a ALGÚN otro dueño de historial? Es el predicado completo de la
 * regla 0, y hoy reconoce **TRES** dueños: un overlay, el sentinel de cambios sin guardar y el
 * sentinel de salida del panel.
 *
 * Existe como una sola función para que el OR se escriba una vez: los dos consumidores
 * ({@link applyPanelView} y {@link consumeOwnedPanelEntry}) tienen que hacerse la misma pregunta, y
 * el día que aparezca un cuarto módulo que escriba historial sólo se suma acá.
 *
 * ⚠ **POR QUÉ LA MARCA DE LA RAMA (`panelUnderRoute`) NO ESTÁ ACÁ, Y NO ES UN OLVIDO.** Es una marca
 * NUESTRA, de este mismo módulo: "otro dueño" significa otro módulo que retrocede sobre su propia
 * entrada, y la rama no es eso. Si entrara, la regla 0 haría que {@link applyPanelView} **se
 * abstenga de escribir sobre cualquier entrada marcada** — y como la marca de la rama se escribe en
 * TODA navegación del panel que empuje, el detalle de cliente dejaría de empujar su entrada en
 * `/clients`: una regresión de v0.30 que ningún otro gate ve. Hay un caso de test contrapuesto que
 * lo fija, y un gate de región que cuenta la clave adentro de este predicado y exige **cero**.
 *
 * ⚠ **Y POR QUÉ EL SENTINEL DE SALIDA (`frjExit`) SÍ ESTÁ, siendo también una marca de la fase.** Son
 * dos clases distintas de marca y confundirlas rompe cosas **opuestas**:
 *   · la marca de la **rama** es **propia-informativa**: anota un dato (qué quedó debajo) sobre una
 *     entrada que empujó el router. Nadie retrocede "sobre" ella por tenerla, así que meterla acá
 *     sólo lograría que {@link applyPanelView} se abstenga de escribir en toda entrada marcada ⇒
 *     rompe el **detalle de cliente**;
 *   · el sentinel de salida es **ajeno-absorbente**: es una entrada que su dueño **empujó para
 *     consumirla**, exactamente como la de un overlay o la del guard de cambios sin guardar. Dejarlo
 *     afuera hace que una escritura le borre la marca ⇒ rompe el **sentinel** (basura en la pila más
 *     un atrás muerto).
 * Los dos casos de test están escritos **adyacentes y contrapuestos** para que la diferencia no se
 * pierda en un refactor.
 */
export function isForeignOwnedEntry(state: unknown): boolean {
  return isOverlayOwnedEntry(state) || isDirtyGuardOwnedEntry(state) || isExitSentinelOwnedEntry(state)
}

// ── El armado de URL ─────────────────────────────────────────────────────────────────────────────

/**
 * La URL a escribir. Puro: no toca `window`, recibe el `pathname` y el `search` actuales.
 *
 * Devuelve el `pathname` a secas cuando no queda ningún parámetro: un `/clients?` colgando es una URL
 * DISTINTA de `/clients`, así que empujarla o reemplazarla ahí reintroduce la cicatriz 1. Los params
 * ajenos se preservan — esta pantalla no es dueña de la query entera.
 */
export function panelViewUrl({
  pathname,
  search,
  param,
  value,
}: {
  pathname: string
  search: string
  param: string
  value: string | null
}): string {
  const sp = new URLSearchParams(search)
  if (value === null) sp.delete(param)
  else sp.set(param, value)
  const qs = sp.toString()
  return qs ? `${pathname}?${qs}` : pathname
}

// ── La navegación ENTRE SECCIONES del panel (NAV-07) ─────────────────────────────────────────────

/** La raíz del panel: la única ruta que tiene que quedar SIEMPRE debajo de la sección abierta. */
export const PANEL_ROOT = '/dashboard'

/**
 * La ruta de la pantalla **Más**, SIN tilde: la tilde vive en el label, no en la URL.
 *
 * ⚠ **Por qué es una constante exportada y entra en `panelNavMode` como PARÁMETRO con default, y no
 * como un literal `'/mas'` escondido en el cuerpo de la regla:** es exactamente el motivo por el que
 * `root` ya es un parámetro. Una rama que compara contra un literal no se puede ejercitar sin montar
 * la pantalla, y las dos ramas que la usan son justamente las que redefinen el atrás del celular.
 *
 * Es la MISMA ruta que el quinto destino de `components/dashboard/panel-bottom-nav.tsx` y que el
 * conjunto `EN_LA_BARRA` de `app/(dashboard)/mas/mas-client.tsx`: un valor distinto acá rompería las
 * dos cosas a la vez (el activo de la barra se decide por igualdad literal de pathname).
 */
export const PANEL_MORE = '/mas'

/** Cómo entra en el historial una navegación del menú. */
export type PanelNavMode = 'push' | 'replace'

/**
 * La regla de push-vs-replace del menú, pura y sobre RUTAS.
 *
 * **El pedido (NAV-07, julio):** `Dashboard → Finanzas → Clientes → atrás` tiene que caer en el
 * **dashboard**, no en Finanzas. El invariante que lo consigue es: *entre la sección abierta y el
 * dashboard que tiene debajo no hay nunca otra sección*.
 *
 * **El pedido nuevo (MOB-04 / D-02, octubre):** en el celular el atrás tiene **dos niveles hacia
 * abajo**. Desde una sección abierta por **Más** vuelve a **Más**, y desde Más vuelve a **Inicio**.
 * Y Más **apila sobre lo que haya abierto**: `Inicio → Turnos → Más → atrás` cae en **Turnos**,
 * porque el atrás deshace el último movimiento — el único invariante que nadie encuentra sorprendente.
 *
 * ⚠ **NO es `replace` a secas, y por eso la regla vive acá y no en el JSX.** Reemplazar en TODOS los
 * links reemplazaría también la entrada del dashboard, y entonces el primer atrás sacaría al dueño
 * del panel. Hacen falta las seis ramas, en este orden:
 *
 *   1. **misma ruta → `replace`.** Empujar la misma URL es la cicatriz 1 (dos entradas idénticas = un
 *      atrás muerto, la "entrada basura" que el criterio 3 prohíbe). Reemplazar además LIMPIA la
 *      query: es lo que cierra el agujero de NAV-08 cuando la entrada de arriba no es nuestra y por
 *      lo tanto no se puede consumir (el dueño pegó `/clients?c=A`, o hay un overlay arriba).
 *   2. **dashboard → sección → `push`.** El dashboard tiene que quedar DEBAJO: es el destino del
 *      atrás. Es la rama que hace que el invariante exista.
 *   3. **sección → dashboard → `push`.** Decidido así, y no `replace`, porque reemplazar dejaría
 *      `/dashboard` encima de `/dashboard`: dos entradas idénticas otra vez ⇒ atrás muerto. Con
 *      `push`, el atrás desde el dashboard devuelve la sección de la que se venía — un atrás que
 *      SIEMPRE hace algo visible, y coherente con el invariante, que habla de la sección abierta y
 *      del dashboard que tiene inmediatamente debajo, no de la pila entera.
 *   4. **cualquiera → Más → `push`** (D-02). Más apila **sobre lo que haya abierto**, no lo pisa.
 *      El motivo es el criterio con el que el dueño resolvió la decisión: el atrás deshace el último
 *      movimiento. Si abrió Más de un toque reflejo estando en Turnos, el atrás lo devuelve a Turnos.
 *      ⚠ **La consecuencia se declara, no se esconde:** en `Inicio → Turnos → Más` la pila tiene
 *      **TRES** escalones. "Dos niveles" es la profundidad de **Más y sus secciones**, **no** un
 *      techo de la pila. Con `replace` acá, el atrás desde Más saltearía Turnos y caería en Inicio.
 *   5. **Más → sección → `push`** (MOB-04 nivel 1). La sección queda **ENCIMA** de Más, así que el
 *      primer atrás cae en Más y el segundo en Inicio: los dos niveles. Sin esta rama la sección
 *      **PISA** a Más y el atrás saltea un nivel — que es lo que hacía la rama 6 hasta octubre, y
 *      está declarado "correcto en esa fase" en la UAT de la Phase 2 porque ahí Más todavía no tenía
 *      sección propia debajo.
 *      ⚠ **Van en este orden y es a propósito.** Las dos son mutuamente excluyentes salvo
 *      `from === to === more`, que ya atajó la rama 1; escribirlo explícito evita que mañana alguien
 *      meta una tercera rama en el medio y cambie el significado de ese caso.
 *   6. **sección → sección → `replace`.** La sección nueva PISA a la anterior, así que encima del
 *      dashboard hay siempre una sola. Es literalmente el pedido de julio.
 *
 * ⚠ **LO QUE ESTA FUNCIÓN NO HACE, Y NO ES UN OLVIDO:** D-03 pide que tocar Más estando **dentro**
 * de su rama **SUBA** un nivel en vez de apilar (desde Finanzas, tocar Más devuelve a Más). Eso
 * **no se puede decidir sobre rutas**: el par `(from: '/finances', to: '/mas')` es idéntico con la
 * pila `[/dashboard, /mas, /finances]` —donde subir es un retroceso correcto— y con la pila
 * `[/finances]` —entrada directa, donde ese mismo retroceso **saca al dueño del sitio**, la cicatriz 2—.
 * Necesita un HECHO que diga qué quedó debajo, y ese hecho lo aporta la marca de la rama
 * ({@link panelUnderRoute}). Quien decide con el hecho es {@link panelBranchPlan}, que **extiende**
 * esta regla en vez de reemplazarla: sin el hecho devuelve exactamente lo que devuelve ésta.
 * Por eso esta función se queda como está, y su valor sigue siendo la **degradación segura** de toda
 * la fase: sin la marca el gesto **apila** (`[/dashboard, /mas, /finances, /mas]`), o sea una pila un
 * escalón más larga, nunca una expulsión.
 *
 * ⚠ **CASO ACEPTADO Y DOCUMENTADO, no hackeado:** si se entra **directo** a una sección (URL pegada,
 * F5, el rebote del proxy después del login) no hay ningún dashboard debajo, y el atrás sale del
 * panel. Empujar un dashboard falso para tapar eso sería inventar una entrada que el dueño nunca
 * visitó — exactamente la reescritura de historial que D-01 prohíbe. Se declara y se vive con eso.
 *
 * ⚠ **El otro límite conocido:** si un overlay empujó su entrada (`lib/overlay-history.ts`) y el
 * dueño toca el menú sin cerrarlo, el `replace` cae sobre la entrada DEL OVERLAY y no sobre la de la
 * sección ⇒ quedan dos secciones encima del dashboard. Sigue siendo mejor que hoy (hoy esa entrada
 * queda enterrada y suma un atrás muerto), y el overlay no se rompe: su limpieza mira la marca antes
 * de cualquier `back()` y al no encontrarla no toca nada. Pelearlo exigiría interceptar la navegación
 * del router, que es D-01.
 *
 * `from` y `to` son PATHNAMES (`usePathname()` ignora la query a propósito: `/clients?c=A` y
 * `/clients` son la misma sección). La regla se define sobre rutas y no sobre pantallas justamente
 * porque el hub Negocio y Ajustes comparten pantalla pero son rutas distintas.
 */
export function panelNavMode({
  from,
  to,
  root = PANEL_ROOT,
  more = PANEL_MORE,
}: {
  from: string
  to: string
  root?: string
  more?: string
}): PanelNavMode {
  if (from === to) return 'replace'
  if (from === root) return 'push'
  if (to === root) return 'push'
  if (to === more) return 'push'
  if (from === more) return 'push'
  return 'replace'
}

// ── La política CON el hecho: la rama de Más (D-03 / criterio 2) ─────────────────────────────────

/**
 * Qué hacer con la pila cuando la navegación del menú ocurre **dentro de la rama de Más**.
 *
 * **SEIS miembros**, y los dos primeros son literalmente los de {@link PanelNavMode}: esta decisión
 * **extiende** la política de rutas, no la reemplaza.
 *
 *   · `push` / `replace` — lo de siempre, y los ejecuta el `<Link>` con su prefetch y su transición.
 *   · `up` — **subir un nivel** (D-03): un retroceso guardado. Nunca un `replace`, que dejaría la
 *     ruta de Más encima de sí misma ⇒ dos entradas idénticas ⇒ atrás muerto (la cicatriz 1).
 *   · `collapse-then-replace` — **colapsar y reemplazar** (criterio 2): consumir la entrada de la
 *     sección y recién entonces reemplazar, para que `/mas` no quede inmediatamente debajo.
 *   · `consume-exit-then-navigate` — **consumir el sentinel de salida y recién entonces navegar**
 *     (plan 03-06): con el sentinel arriba, parados en la raíz y un destino distinto. Su regla, y el
 *     por qué de su lugar, están abajo en {@link panelBranchPlan}.
 *   · `none` — **no hacer nada**: el sentinel de salida está arriba y el destino es la ruta actual
 *     (plan 03-03). Está en el tipo **a propósito** y se **produce desde esta misma función**: si
 *     *nada* es un resultado posible de la decisión de navegación y vive fuera del tipo, el chequeo
 *     de exhaustividad del plan 03-04 **no lo ve** — que es exactamente la clase de hueco silencioso
 *     que esta fase viene a cerrar. Lo mismo vale, palabra por palabra, para el miembro de arriba.
 */
export type PanelBranchPlan =
  | PanelNavMode
  | 'up'
  | 'collapse-then-replace'
  | 'consume-exit-then-navigate'
  | 'none'

/**
 * La decisión de la rama, **pura y sobre rutas**, con el hecho recibido como booleano.
 *
 * **Por qué el hecho entra como parámetro y no se lee acá:** es la misma frontera que
 * {@link panelHistoryAction} ya tiene con `holding` y `foreignOwnsTop`. Esta función no toca
 * `window`; `masDebajo` lo lee **el ejecutor** del estado de la entrada de arriba
 * (`window.history.state` → {@link panelUnderRoute}, comparado contra la ruta de Más) y lo
 * **re-verifica en el momento del click**, no al renderizar: el estado de una entrada sobrevive al
 * retroceso y a nuestras propias escrituras, pero lo **borra** un reemplazo blando sobre la entrada
 * donde vive (ver la lista completa en {@link applyPanelUnder}).
 *
 * **Por qué `masDebajo` es "la marca DICE MÁS" y no "hay marca":** es lo que hace que desktop no se
 * entere **por construcción** (criterio 6). En escritorio nada navega a `/mas`, así que la marca
 * nunca dice Más, `masDebajo` es siempre falso y la decisión cae en las ramas de siempre. Sin ningún
 * chequeo de viewport en el medio.
 *
 * Las reglas, **en orden**:
 *
 *   -1. **El sentinel de salida arriba y el destino es la ruta actual ⇒ NADA** (MOB-05, plan 03-03).
 *      Va **primera**, incluso antes de la regla 0, y es a propósito: en Inicio con el sentinel
 *      armado el hecho de la rama es **falso**, así que la regla 0 devolvería `replace` — y ese
 *      reemplazo caería **sobre el sentinel**, dejando dos entradas idénticas con el sentinel
 *      re-armado encima: un **atrás muerto enterrado**. No navegar, no apilar y no reemplazar es la
 *      única respuesta que no rompe nada: el dueño ya está en la pantalla que tocó.
 *      ⚠ `holdsExitSentinel` lo lee **el ejecutor** del estado de la entrada de arriba
 *      (`window.history.state` → `isPanelExitEntry`, `lib/panel-branch.ts`) y lo **re-verifica en el
 *      momento del click**, igual que `masDebajo`. Con el sentinel arriba y un destino **distinto**
 *      el plan **no cambia**: la navegación empuja y el sentinel queda debajo, que es la forma
 *      medida en **E-6** y la que **no** deja un atrás muerto (estar parado sobre él cuenta como
 *      armado). **Eso cambió en el plan 03-06**: ver la regla siguiente.
 *   -1b. **El sentinel arriba, parados en la RAÍZ, y un destino DISTINTO ⇒ CONSUMIR EL SENTINEL Y
 *      RECIÉN ENTONCES NAVEGAR** (plan 03-06). Son **tres** hechos juntos, y el tercero ya lo atajó
 *      la regla anterior pero se escribe explícito para que una regla metida en el medio no le cambie
 *      el significado.
 *      ⚠ **POR QUÉ EXISTE.** La entrada del sentinel es **absorbente** —se empujó para consumirla—,
 *      así que si el dueño navega con ella arriba queda **ENTERRADA** en el camino del atrás: el
 *      atrás aterriza en una entrada de la raíz **con hash** (`/dashboard#salir`) que en pantalla se
 *      ve **igual que Inicio**, con un atrás siguiente que no hace **nada visible** — el **atrás
 *      muerto** que el criterio 2 prohíbe explícitamente. Es la causa **medida** de **G-1** y **G-2**
 *      (*recarga y vuelve a `dashboard#salir-3`*, *a la primera que toco atrás no hace nada*), y está
 *      medida en los escenarios **E-9** y **E-12** de
 *      `.planning/debug/pila-de-dos-niveles-medida.md`.
 *      ⚠ **POR QUÉ ANTES DE LA REGLA 0.** Ahí el hecho de la rama es **falso**, así que la decisión
 *      caería en **empujar** y el sentinel quedaría enterrado: exactamente el bug. Y **después** de la
 *      regla -1, porque con el destino igual a la ruta actual no hay nada que navegar.
 *      ⚠ **Y por qué sólo en la raíz:** el sentinel es de la raíz y sólo de la raíz. Consumirlo
 *      estando en una sección sería retroceder sobre una entrada que **no es la que creemos**.
 *   -1c. **La marca dice LA RAÍZ, el destino es LA RAÍZ y venimos de otra ruta ⇒ EL RETROCESO
 *      GUARDADO DE UN PASO** (`G2-1`, plan 03-09). Son **tres** hechos juntos, igual que la regla de
 *      arriba, y el tercero (`from !== to`) ya lo atajaría la regla 1 pero se escribe explícito para
 *      que una regla metida en el medio no le cambie el significado.
 *      ⚠ **QUÉ RESUELVE, y son DOS MITADES DE UNA.** Con el empuje de la rama 3 de
 *      {@link panelNavMode}, el ciclo Inicio↔sección hace crecer la pila **dos entradas por ciclo
 *      SIN TECHO** —medido: profundidades `3 → 5 → 7`— y, de paso, cada entrada de Inicio alcanzada
 *      por ese empuje queda marcada con la **sección** que quedó debajo ⇒ la **séptima** regla del
 *      armado (`algoNuestroDebajo`, `lib/panel-branch.ts`) dice *no armar* ⇒ **el aviso de salida
 *      nunca aparece**. Textual del dueño: *"al tocar inicio después de haber hecho otras cosas cae
 *      a /dashboard y la guarda de salir no está"*. Con el retroceso, el dueño aterriza en la
 *      entrada **ORIGINAL** de Inicio, que **no** tiene nada nuestro debajo, y el aviso **se arma
 *      solo** (estar parado sobre el sentinel cuenta como armado). Medido en el escenario `E-14` de
 *      `.planning/debug/pila-de-dos-niveles-medida.md`, con la forma vieja y la nueva en la misma
 *      medición.
 *      ⚠ **POR QUÉ VA ANTES DE LA REGLA 0.** Ahí el hecho de la rama es **falso**, así que la
 *      decisión caería en **empujar** y el sentinel quedaría enterrado otra vez — que es literalmente
 *      el bug de `G2-1`.
 *      ⚠ **POR QUÉ VA DESPUÉS DE LA -1b.** Con el sentinel arriba y un destino distinto el gesto ya
 *      tiene dueño: consumir el sentinel **primero** es lo que evita el atrás muerto enterrado.
 *      ⚠ **POR QUÉ NO HAY UN MIEMBRO NUEVO.** `up` **ya es** el retroceso guardado de un paso, con
 *      sus dos guardas en {@link consumeOwnedBranchEntry}, y los **dos** consumidores de esta
 *      decisión (el hook de la barra y el guard de cambios sin guardar) tienen que quedar en **un**
 *      dialecto: un miembro nuevo para el mismo mecanismo obligaría a tocar el `switch` exhaustivo
 *      del guard y sería el segundo dialecto que NAV-05 viene a evitar.
 *      ⚠ **Y NO COMPITE CON EL COLAPSO, medido en vez de supuesto:** dentro de la rama de Más la
 *      marca dice **Más**, así que este hecho es **falso** por construcción y la decisión sigue
 *      cayendo en la regla 3 — incluido su caso degenerado. Medido en `E-15`.
 *      ⚠ **EL RESIDUO DE ESCRITORIO, ACEPTADO Y DECLARADO ACÁ EL 2026-10-27: es una revisión
 *      ACOTADA del criterio 6, no una renuncia.** Hasta este plan el criterio 6 se sostenía *por
 *      construcción* a través del hecho: `masDebajo` pregunta si la marca **dice Más**, y en
 *      escritorio nada navega a `/mas`. Con este hecho eso **ya no alcanza**: en escritorio la marca
 *      **sí** puede decir la raíz. Lo que sostiene el criterio 6 ahora son **dos hechos del
 *      cableado**: la **barra inferior se oculta a ≥1024px** —sus links no se pueden tocar, así que
 *      su `handleNavigate` **nunca corre**— y el **guard** sólo computa un plan de rama cuando la
 *      pantalla está **sucia**. ⇒ el residuo es **UN SOLO CASO**: salir de una pantalla con cambios
 *      sin guardar hacia Inicio **desde el sidebar**, donde el atrás queda un escalón más corto.
 *      ⚠ **Y lo que NO se hace para taparlo: preguntarle el ancho a la pantalla.** Gatear esta
 *      política por tamaño es exactamente lo que NAV-05 y el criterio 6 existen para prohibir, y lo
 *      que la fase sostuvo *por construcción* hasta hoy. El residuo se **declara** —acá, en el guard
 *      donde se produce y en el documento de debug— y no se esconde detrás de una consulta a la
 *      pantalla.
 *   0. **Sin el hecho NO SE RETROCEDE NUNCA**, y es la regla más importante del plan: devuelve lo
 *      que diga {@link panelNavMode}. Es la cicatriz 2 (entrada directa, F5, el rebote del proxy
 *      después del login) y la degradación segura de toda la fase — el peor caso de una marca
 *      perdida es una pila un escalón más larga, **no** el dueño fuera del sitio.
 *   1. **La misma ruta sigue ganando** (cicatriz 1). Va antes que las dos ramas nuevas y es a
 *      propósito: si la rama de Más se evaluara primero, `/mas → /mas` devolvería `up` y el dueño se
 *      iría un escalón para abajo tocando la pantalla en la que ya está.
 *   2. **Con el hecho y destino Más ⇒ subir** (D-03).
 *   3. **Con el hecho y cualquier otro destino ⇒ colapsar y reemplazar** (criterio 2).
 *
 * ⚠ **EL CASO DEGENERADO NO SE DECIDE ACÁ, y no es un hueco:** si el destino de la barra coincide con
 * la ruta que quedaría debajo, reemplazar dejaría `[…, X, X]` —justo lo que el criterio 2 prohíbe— y
 * hay que retroceder **dos veces sin navegar**. Pero esa ruta **sólo se puede leer estando parado
 * sobre la entrada de Más**, o sea **después** del primer consumo, así que la decide el segundo paso
 * del ejecutor (`branchSecondStep`, `lib/panel-branch.ts`). Medido en el escenario **E-5** de
 * `.planning/debug/pila-de-dos-niveles-medida.md`.
 */
export function panelBranchPlan({
  from,
  to,
  root = PANEL_ROOT,
  more = PANEL_MORE,
  raizDebajo,
  masDebajo,
  holdsExitSentinel,
}: {
  from: string
  to: string
  root?: string
  more?: string
  /**
   * ¿La marca de la entrada de arriba **DICE que la ruta que quedó inmediatamente debajo es la
   * RAÍZ**? (`G2-1`, plan 03-09.) Va **sin default**, igual que los otros dos hechos de la pila, y
   * las tres cosas que lo justifican:
   *
   *   1. es un **HECHO DE LA PILA y no una configuración**: un call site que lo olvide **no
   *      compila**, que es la disciplina que esta fase instaló con `masDebajo`, `holdsExitSentinel`,
   *      `vieneDeUnRetroceso` y `algoNuestroDebajo`;
   *   2. lo contesta **el ejecutor** leyendo el estado real de la entrada de arriba
   *      (`window.history.state` → {@link panelUnderRoute}, comparado contra `root`) y lo
   *      **re-verifica en el momento del click**, no al renderizar: entre un render y el gesto pudo
   *      haber una escritura blanda que se llevó la marca (la lista completa está en
   *      {@link applyPanelUnder});
   *   3. se computa como *la marca **DICE** la raíz* y **no** como *hay marca* — es la misma forma
   *      con la que `masDebajo` evita dispararse donde no corresponde.
   *
   * ⚠ **Su límite, medido y declarado:** si la raíz **no** es la entrada inmediatamente de abajo (la
   * pila de tres escalones que D-02 acepta a propósito), este hecho es **falso** y el gesto sigue
   * empujando — un retroceso de un paso aterrizaría en la sección del medio y no en Inicio. Medido
   * en `E-16` mitad B.
   */
  raizDebajo: boolean
  masDebajo: boolean
  /**
   * ¿La entrada de arriba es el sentinel de salida de MOB-05? Va **sin default**, igual que
   * `masDebajo`: es un HECHO de la pila, no una configuración, y un call site que lo olvide no
   * compila — que es justo la disciplina que esta fase viene a instalar.
   */
  holdsExitSentinel: boolean
}): PanelBranchPlan {
  const modo = panelNavMode({ from, to, root, more })

  // ── REGLA -1 — el sentinel arriba y el destino es la ruta actual: NADA. ────────────────────────
  // Antes de la regla 0 a propósito: ahí el hecho de la rama es falso y la decisión caería en
  // reemplazar, justo SOBRE el sentinel ⇒ dos entradas idénticas con el sentinel re-armado encima,
  // o sea un atrás muerto enterrado.
  if (holdsExitSentinel && from === to) return 'none'

  // ── REGLA -1b — el sentinel arriba, en la RAÍZ, y un destino DISTINTO: consumirlo y navegar. ───
  // Los TRES hechos juntos. El tercero (`to !== from`) ya lo atajó la regla de arriba, pero se
  // escribe explícito para que mañana nadie meta una regla en el medio y le cambie el significado.
  if (holdsExitSentinel && from === root && to !== from) return 'consume-exit-then-navigate'

  // ── REGLA -1c — G2-1: la marca dice la RAÍZ y el destino es la RAÍZ: RETROCEDER, no empujar. ───
  // Los TRES hechos juntos. Va ANTES de la regla de abajo a propósito: ahí el hecho de la rama es
  // falso y la decisión caería en EMPUJAR, que es literalmente el bug — el ciclo Inicio↔sección
  // creciendo dos entradas por vuelta sin techo (3 → 5 → 7) y el aviso de salida que nunca se arma
  // porque la entrada de Inicio apilada queda marcada con la sección. Y DESPUÉS de la -1b, porque
  // con el sentinel arriba y un destino distinto el gesto ya tiene dueño.
  // El tercer hecho (`from !== to`) ya lo atajaría la regla 1, pero se escribe explícito para que
  // mañana nadie meta una regla en el medio y le cambie el significado.
  if (raizDebajo && to === root && from !== to) return 'up'

  // ── REGLA 0 — sin el hecho, jamás un retroceso. ────────────────────────────────────────────────
  if (!masDebajo) return modo

  // ── REGLA 1 — la misma ruta: la cicatriz 1 gana sobre las dos ramas nuevas. ────────────────────
  if (from === to) return modo

  // ── REGLA 2 — con el hecho y destino Más: SUBIR (D-03). ───────────────────────────────────────
  if (to === more) return 'up'

  // ── REGLA 3 — con el hecho y cualquier otro destino: COLAPSAR Y REEMPLAZAR (criterio 2). ──────
  return 'collapse-then-replace'
}

// ── La reconciliación entre la URL y lo que se está mostrando ────────────────────────────────────

/** Lo que resuelve la URL: qué mostrar, y si hay que hacer converger la URL hacia eso. */
export type PanelViewResolution = {
  selected: string | null
  reconcile: boolean
  cause: PanelViewCause | null
  to: string | null
}

/**
 * UNA regla que cubre los tres desajustes entre la URL y la vista.
 *
 * `param` es lo que dice la URL; `resolvedTo` es **lo que la pantalla está mostrando de verdad**,
 * resuelto por el componente contra su lista. La regla es: *reconciliar cuando no coinciden.*
 *
 * **(i) La frase que cierra NAV-02.** El estado "la URL dice un id que no se está mostrando" es
 * EXACTAMENTE el mismo para un id recién borrado, uno inexistente y uno **de otro negocio**: los tres
 * son "no está en la lista". La resolución nunca consulta la base — se hace contra `clients`, que ya
 * vino filtrada por `.eq('business_id', business.id)` en el server —, así que el resultado observable
 * es idéntico y no hay oracle de existencia cross-tenant. Es el riesgo (b) del roadmap CERRADO por
 * D-03, no mitigado.
 *
 * **(ii) La frase que unifica el saneo y la fusión.** Reconciliar es siempre lo mismo —*la URL tiene
 * que alcanzar a lo que se está mostrando*— y lo único que cambia es si el destino es un id (la
 * fusión: `programmatic`) o es nada (el saneo: `stale`). Por eso devuelve también la CAUSA: el call
 * site no vuelve a decidir política.
 */
export function resolveViewParam({
  param,
  resolvedTo,
}: {
  param: string | null
  resolvedTo: string | null
}): PanelViewResolution {
  // `?c=` vacío es "hay param pero no hay valor": el navegador lo entrega como string vacío y hay que
  // limpiarlo igual que un id que no resuelve.
  const pedido = param === null || param === '' ? null : param

  if (pedido === resolvedTo) {
    if (param !== null && pedido === null) {
      return { selected: null, reconcile: true, cause: 'stale', to: null }
    }
    return { selected: resolvedTo, reconcile: false, cause: null, to: resolvedTo }
  }

  return {
    selected: resolvedTo,
    reconcile: true,
    cause: resolvedTo === null ? 'stale' : 'programmatic',
    to: resolvedTo,
  }
}

/**
 * La guarda de idempotencia del saneo: la misma reconciliación pedida dos veces escribe una sola vez.
 *
 * El efecto puede correr varias veces con el mismo desajuste (un re-render, el reintento cuando un
 * overlay suelta su entrada). Sin esta guarda, cada vuelta escribiría de nuevo.
 */
export function sanitizeAction({
  reconcile,
  param,
  lastApplied,
}: {
  reconcile: boolean
  param: string | null
  lastApplied: string | null
}): 'apply' | 'none' {
  if (!reconcile) return 'none'
  if (param === lastApplied) return 'none'
  return 'apply'
}

/**
 * Cuándo se OLVIDA lo ya reconciliado (W-2). Existe para que la guarda de idempotencia no suprima una
 * reconciliación **legítima**.
 *
 * Reglas: si la URL y la vista coinciden (`reconcile: false`) la memoria se resetea a `null`; si la
 * escritura ocurrió, se recuerda el param que la disparó; si se salteó (regla 0), se conserva la
 * anterior — así el diferimiento puede reintentar y la memoria no se envenena.
 *
 * **El caso que arregla:** después de un `consume` sobre `?c=A` la memoria queda en `'A'`. Si el dueño
 * usa el **forward** del navegador y vuelve a caer en `?c=A` —que sigue sin resolver—, sin el reset
 * {@link sanitizeAction} devolvería `'none'` y **la URL quedaría mintiendo para siempre**. Con el
 * reset, entre medio hubo un commit en `/clients` donde coincidían, la memoria volvió a `null`, y el
 * forward se reconcilia igual que la primera vez.
 */
export function reconciledMemo({
  reconcile,
  applied,
  param,
  previous,
}: {
  reconcile: boolean
  applied: boolean
  param: string | null
  previous: string | null
}): string | null {
  if (!reconcile) return null
  if (applied) return param
  return previous
}

// ── El ejecutor ──────────────────────────────────────────────────────────────────────────────────

/**
 * **La única función de este módulo que toca `window`, y el único lugar de la superficie del panel
 * donde se escribe historial.**
 *
 * Lee del `history.state` las dos señales que la decisión necesita (¿la entrada de arriba es nuestra?
 * ¿es de un overlay?), le pregunta a {@link panelHistoryAction}, y ejecuta. Devuelve la acción que
 * ejecutó de verdad, para que el call site del saneo sepa si la escritura ocurrió o quedó diferida
 * por la regla 0.
 *
 * **Por qué la mecánica vive acá y no en el componente:** el criterio 4 exige que un barrido sobre
 * `app/(dashboard)/clients/` dé CERO mutaciones crudas de historial, y la Phase 2 va a consumir este
 * mismo ejecutor en vez de escribir el suyo. Una segunda copia es el segundo dialecto.
 *
 * **Por qué NUNCA se guarda una referencia al método original del historial:** el parche de Next es el
 * que mantiene la entrada sana copiándole `__NA` adentro; escribiendo con el método original la
 * entrada nace sin él y el siguiente atrás recarga la página entera.
 *
 * ⚠ Las dos escrituras van como **dos llamadas literales y separadas**, nunca por índice dinámico: el
 * gate de código audita el primer argumento en el punto de escritura, y una indirección lo volvería
 * inauditable — que es justo por donde se cuela un state con internos heredados.
 */
export function applyPanelView({
  cause,
  param,
  from,
  to,
}: {
  cause: PanelViewCause
  param: string
  from: string | null
  to: string | null
}): PanelHistoryAction {
  const actual: unknown = window.history.state
  const action = panelHistoryAction({
    cause,
    from,
    to,
    holding: isPanelViewEntry(actual, param),
    foreignOwnsTop: isForeignOwnedEntry(actual),
  })

  if (action === 'none') return action

  // La guarda de la cicatriz 2 ya está adentro de la decisión: `consume` sólo sale con `holding`.
  if (action === 'consume') {
    window.history.back()
    return action
  }

  const url = panelViewUrl({
    pathname: window.location.pathname,
    search: window.location.search,
    param,
    value: to,
  })
  const next = panelViewState(param, to)
  if (action === 'push') window.history.pushState(next, '', url)
  else window.history.replaceState(next, '', url)
  return action
}

/**
 * **EL ÚNICO ESCRITOR DE LA MARCA DE LA RAMA.** Recibe la **ruta a anotar** y nada más. Devuelve
 * `true` si escribió y `false` si se abstuvo.
 *
 * **Tres pasos EN ORDEN, y el orden es su razón de ser y no un detalle de implementación:**
 *
 *   1. **La regla 0 primero.** Si la entrada de arriba es de otro dueño de historial, no se escribe:
 *      escribirle encima le borra su marca, su dueño deja de reconocer su entrada, no la consume
 *      cuando corresponde, y queda **basura en la pila más un atrás muerto**. Se consulta el
 *      predicado completo ({@link isForeignOwnedEntry}); no se duplica el OR ni se copia ningún
 *      literal de clave, así que el día que aparezca un cuarto dueño se suma **en un solo lugar**.
 *   2. **La idempotencia después.** Si la entrada de arriba **ya lleva** nuestra marca, no se
 *      escribe. ⚠ **No es una optimización: es un discriminador**, y la asimetría que lo hace posible
 *      es ésta — la entrada que el router **empuja** nace **sin** nuestra clave, y una entrada a la
 *      que **volvemos** ya la trae. O sea que "ya hay marca" significa, en la práctica, *estamos
 *      parados sobre una entrada que ya existía y que ya sabe qué tiene debajo*, y escribirle encima
 *      hace las dos cosas malas a la vez: **miente** (la ruta de la que venimos estaba ARRIBA, no
 *      debajo) **y destruye** la verdad que esa entrada ya tenía, que es la que el caso degenerado
 *      necesita. Es la causa medida de **G-3** en la UAT de la fase. Y es la **segunda red**: aun si
 *      la regla de dirección de `lib/panel-branch.ts` se perdiera en un refactor, la verdad vieja no
 *      se sobrescribe.
 *   3. **La escritura**, con el estado armado por {@link panelUnderState} —**objeto literal fresco**,
 *      nunca propagando el estado actual— y con **dos** argumentos y sin el tercero (la URL). Las dos
 *      cosas son la misma trampa que el módulo ya documenta dos veces: propagar el state arrastra
 *      `__NA` y el parche de Next toma su rama temprana y **no despacha** la sincronización (la URL
 *      cambia, el router no se entera, y no hay ni un error en consola).
 *
 * **Por qué recibe la RUTA y no un par de rutas:** así puede anotar una ruta que se **leyó** de la
 * pila —la que el segundo paso del colapso encuentra en la entrada de Más— y no sólo una **derivada**
 * del par. El par de rutas no sabe qué pasó de verdad: con un retroceso y con el reemplazo del
 * colapso dice `push` igual, y eso es justamente lo que la UAT midió como marca rancia.
 */
export function writePanelUnder(route: string): boolean {
  const actual: unknown = window.history.state
  // 1) Regla 0: la entrada de arriba no puede tener otro dueño.
  if (isForeignOwnedEntry(actual)) return false
  // 2) Idempotencia: una entrada que ya lleva la marca ya sabe qué tiene debajo.
  if (panelUnderRoute(actual) !== null) return false
  // 3) La escritura.
  window.history.replaceState(panelUnderState(route), '')
  return true
}

/**
 * Escribe la marca de la rama sobre la entrada actual: **qué ruta quedó inmediatamente debajo**.
 * Devuelve `true` si escribió, `false` si se abstuvo. Hermana de {@link applyPanelView}.
 *
 * **Cuándo la llama su consumidor:** desde un efecto que observa el pathname, o sea **DESPUÉS del
 * commit** del router (`usePanelBranch`, `lib/panel-branch.ts`). `from` es la ruta de la que se
 * venía y `to` la ruta en la que estamos ahora.
 *
 * **Por qué el reemplazo de estado va con DOS argumentos y SIN el tercero** (la URL). Con la URL, el
 * parche de Next despacha la restauración y la navegación cuesta un commit extra; sin ella, el parche
 * no despacha nada, la URL **no cambia**, el router no se desincroniza — y el parche **igual** copia
 * sus internos adentro del objeto nuevo, que es lo que mantiene la entrada sana y evita que el
 * próximo retroceso recargue la página entera (por eso tampoco hay que guardarse una referencia al
 * método original del historial).
 *
 * **Lo único que es SUYO: la pregunta de política.** La navegación tiene que **empujar** — si
 * reemplaza, la entrada de abajo es la misma de antes y no hay nada nuevo que anotar. La escritura y
 * sus dos guardas las hace {@link writePanelUnder}.
 *
 * ⚠ **LAS GUARDAS NO SE REPITEN ACÁ, Y NO ES UN OLVIDO.** La regla 0 y la idempotencia viven en
 * **un** solo lugar, adentro del escritor único. Duplicarlas sería tener dos escritores con dos
 * juegos de guardas, que es exactamente cómo se pierde una de las dos **sin que ningún gate lo vea**:
 * el día que aparezca un cuarto dueño de historial se suma en uno y no en el otro, y el síntoma no es
 * un error sino **basura en la pila más un atrás muerto**.
 *
 * ⚠ **LA DEGRADACIÓN SE DECLARA, NO SE DESCUBRE. Quién borra esta marca:** un reemplazo blando sobre
 * la entrada donde vive, o sea (i) el `replace` de los tres menús cuando la política lo dice,
 * (ii) {@link applyPanelView} con las causas `programmatic`, `filter` y `stale` sin tener la entrada,
 * (iii) el reemplazo crudo con el que Agenda limpia su query de retorno de Google, y **(iv) —la
 * entrada que la UAT de la fase 3 destapó— NOSOTROS MISMOS**, cuando el efecto de marcado escribía
 * sobre una entrada que **ya sabía la verdad**: la derivaba del par de rutas, el par dice `push`
 * también en un retroceso y en el reemplazo del colapso, y la marca verdadera se perdía. Esa cuarta
 * causa es la que la guarda de idempotencia de {@link writePanelUnder} cierra, y queda listada acá
 * como cicatriz en vez de borrada de la historia.
 * **Las tres primeras se aceptan en esta fase**: sin la marca, {@link panelBranchPlan} cae en
 * `push`/`replace` y **nunca** en un retroceso. Preservar la clave en `applyPanelView` sería una
 * línea, pero toca el ejecutor que v0.30 dejó auditado con un gate de código y abre la pregunta de si
 * un estado propio conservado reintroduce la trampa de la rama temprana del parche; si la Phase 4 lo
 * necesita para los tabs, entra ahí con su propia medición.
 */
export function applyPanelUnder({
  from,
  to,
  root = PANEL_ROOT,
  more = PANEL_MORE,
}: {
  from: string
  to: string
  root?: string
  more?: string
}): boolean {
  // La política, que es lo único que esta función decide: sólo un EMPUJE deja algo nuevo debajo.
  if (panelNavMode({ from, to, root, more }) !== 'push') return false
  // Y la escritura, con sus dos guardas, en el escritor único.
  return writePanelUnder(from)
}

/**
 * Deshace la entrada de subsección que tengamos arriba, **sea cual sea la subsección** (NAV-08).
 * Devuelve `true` si consumió algo, `false` si no tocó nada.
 *
 * **Para qué existe:** el menú del panel no sabe nada de `?c=`. Cuando el dueño toca "Clientes"
 * TENIENDO UNA FICHA ABIERTA, el `<Link>` empuja una entrada de ruta `/clients` ENCIMA de
 * `/clients?c=A`, y esa entrada de ficha queda sepultada para siempre: este módulo sólo consume la
 * de arriba y, por D-01, no escucha `popstate` ni reescribe historial ajeno. Al volver atrás hasta
 * esa profundidad la ficha RE-APARECE — el bug medido con CDP en
 * `.planning/debug/atras-en-clients-aterriza-en-ficha.md`. Consumiendo nuestra entrada ANTES de
 * navegar, tocar la sección en la que ya estás CIERRA la subsección en vez de apilarse.
 *
 * ⚠ **Es genérico a propósito.** No recibe el param: pregunta "¿la entrada de arriba es de alguna
 * subsección del panel?". El agujero no es exclusivo de Clientes — los tabs de Negocio/Ajustes que
 * llegan en la Phase 2 lo heredan igual, y van a heredar también este arreglo sin tocar nada de acá.
 *
 * ⚠ **NUNCA un `back()` sobre una entrada ajena** (cicatriz 2): consumir lo que no empujamos expulsa
 * al dueño del sitio. Por eso son DOS guardas independientes y no una:
 *   · la marca propia tiene que estar arriba ({@link panelViewEntryParam} con valor no nulo), y
 *   · la entrada no puede ser de otro dueño de historial ({@link isForeignOwnedEntry}: un overlay o
 *     el sentinel de cambios sin guardar) — hoy las tres formas de state son disjuntas y la segunda
 *     guarda es redundante, pero es justo la cicatriz que `lib/overlay-history.ts` documenta ("si el
 *     desmontaje fue por una navegación… llamar `back()` DESHARÍA la navegación del usuario"), así
 *     que se escribe explícita en vez de depender de que las formas de state nunca se solapen.
 *
 * ⚠ **`history.back()` es ASÍNCRONO.** El call site tiene que PREVENIR la navegación (`true` ⇒
 * `e.preventDefault()`), nunca encadenarla: si dejara navegar, el router empujaría su entrada antes
 * de que el browser procese el pop y volveríamos a enterrar la ficha, que es el bug entero.
 *
 * **Trade-off aceptado:** con dos fichas apiladas (A → B), un toque consume UNA sola y deja la ficha
 * A a la vista. Es exactamente el mismo modelo que el botón "Volver" de mobile, así que el gesto es
 * coherente: el menú, estando ya en la sección, se comporta como un "Volver".
 */
export function consumeOwnedPanelEntry(): boolean {
  const actual: unknown = window.history.state
  if (isForeignOwnedEntry(actual)) return false
  if (panelViewEntryParam(actual) === null) return false
  window.history.back()
  return true
}

/**
 * Deshace la entrada de **sección de la rama de Más** que tengamos arriba. Devuelve `true` si
 * consumió algo, `false` si no tocó nada. Es el retroceso guardado de `up` y del colapso.
 *
 * ⚠ **POR QUÉ ES UNA FUNCIÓN HERMANA Y NO UNA EXTENSIÓN DE {@link consumeOwnedPanelEntry}.** Dos
 * motivos, y el primero es un candado:
 *   (a) el candado estático de la Phase 2 exige el literal `consumeOwnedPanelEntry` adentro del
 *       `onNavigate` de los **tres** menús y en ese orden, así que cambiarle la semántica cambiaría
 *       NAV-08 en los tres a la vez **sin que ningún gate lo vea**; y
 *   (b) las dos preguntas son distintas y conviven en el mismo `onNavigate`: NAV-08 pregunta por una
 *       **subsección** propia arriba (`?c=`, un tab) y esto pregunta por una **sección de la rama**.
 *       Son mutuamente excluyentes —NAV-08 pide `from === to` y la rama pide `from ≠ to`—, así que no
 *       compiten.
 *
 * **Y por qué la función vieja no sirve tal cual:** su segunda guarda exige la marca de subsección
 * como cadena, y la entrada de una **sección** la empujó el **router** de Next con su propio estado,
 * sobre el que después escribimos la marca de la rama. Preguntada por la de subsección devolvería
 * `false` siempre.
 *
 * ⚠ **LAS DOS GUARDAS SE REPITEN ACÁ, y no se confía en que ya se chequearon arriba** (cicatriz 2,
 * ya sufrida tres veces en este repo): entrada de otro dueño primero, marca propia después. Es la
 * misma disciplina que los otros dos módulos de historial declaran en **cada** punto de retroceso,
 * porque un retroceso sobre una entrada que no empujamos nosotros **expulsa al dueño del sitio** — y
 * en una pantalla con cambios sin guardar, es pérdida de trabajo silenciosa.
 *
 * ⚠ **`history.back()` es ASÍNCRONO.** El call site tiene que PREVENIR la navegación, nunca
 * encadenarla; y el segundo paso del colapso sale del evento del retroceso, nunca del mismo tick.
 */
export function consumeOwnedBranchEntry(): boolean {
  const actual: unknown = window.history.state
  if (isForeignOwnedEntry(actual)) return false
  if (panelUnderRoute(actual) === null) return false
  window.history.back()
  return true
}
