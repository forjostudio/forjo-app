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
 * @param overlayOwnsTop ¿La entrada de arriba lleva la marca de un overlay? (regla 0, cicatriz 3)
 */
export function panelHistoryAction({
  cause,
  from,
  to,
  holding,
  overlayOwnsTop,
}: {
  cause: PanelViewCause
  from: string | null
  to: string | null
  holding: boolean
  overlayOwnsTop: boolean
}): PanelHistoryAction {
  // ── REGLA 0 — mientras un overlay sea dueño de la entrada de arriba, no se escribe. ────────────
  // ⚠ ES LA REGLA QUE CIERRA C-1, Y ES ABSOLUTA A PROPÓSITO. `lib/overlay-history.ts` marca su
  // entrada con un hash propio y una clave en el state; escribir encima le borra las dos, así que al
  // cerrarse el overlay ya no reconoce su entrada, no hace su `back()`, y queda basura en la pila
  // más un atrás muerto. Debilitarla "para dejar pasar sólo el replace de la fusión" cambia una
  // regresión por un defecto: el `replaceState` caería justo sobre la entrada del modal de fusión,
  // que es el que la tiene arriba mientras su botón corre.
  // LA ESCRITURA NO SE PIERDE: queda PENDIENTE, y la aplica el efecto de reconciliación del
  // componente en cuanto el overlay suelta la entrada.
  if (overlayOwnsTop) return 'none'

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
 * ¿La entrada de arriba del historial es una que empujamos nosotros PARA ESTA VISTA?
 *
 * Narrowing manual, sin `any` (tsconfig `strict`), copiando la forma de `isOverlayHistoryEntry`
 * (`lib/overlay-history.ts:110-117`): `history.state` es `unknown` de verdad — puede traer el state
 * del router de Next, el de un overlay, el de otra librería, o `null`.
 */
export function isPanelViewEntry(state: unknown, param: string): boolean {
  return (
    typeof state === 'object' &&
    state !== null &&
    'frjView' in state &&
    (state as { frjView?: unknown }).frjView === param
  )
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
    overlayOwnsTop: isOverlayOwnedEntry(actual),
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
