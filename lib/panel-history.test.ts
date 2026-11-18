import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  panelHistoryAction,
  panelViewState,
  isPanelViewEntry,
  panelViewEntryParam,
  isOverlayOwnedEntry,
  consumeOwnedPanelEntry,
  panelNavMode,
  PANEL_ROOT,
  panelViewUrl,
  resolveViewParam,
  sanitizeAction,
  reconciledMemo,
  type PanelViewCause,
} from '@/lib/panel-history'
// ⚠ El namespace se importa A PROPÓSITO, además de los nombrados de arriba, y es por el ciclo
// RED-GREEN: `PANEL_MORE` se afirma como VALOR (`PH.PANEL_MORE`) y no como import nombrado porque un
// import nombrado que no existe todavía revienta al CARGAR el módulo — el rojo sería del loader y no
// de la política, y un rojo así no autoriza a implementar nada (no distingue "falta la rama" de
// "el archivo no compila"). Con el namespace, el único rojo posible es el de la aserción.
import * as PH from '@/lib/panel-history'

/** La ruta de la pantalla Más, sin tilde — la misma que usan la barra y `EN_LA_BARRA`. */
const MAS = '/mas'

// Las decisiones de historial del panel viven en una función pura porque el runner corre con
// `environment: 'node'` y sin jsdom: el componente no se puede renderizar en un test, pero el
// "qué se decide" sí se cubre entero acá. Mismo criterio que `lib/unsaved-changes.test.ts` y
// `lib/overlay-history.ts`.

/**
 * Las siete causas, para poder barrer la tabla entera sin escribirlas siete veces a mano. La séptima,
 * `user-switch`, es la de los tabs de la Phase 4 (plan 04-01): entra acá para que la regla 0 y la
 * regla 2 también la barran.
 */
const TODAS_LAS_CAUSAS: PanelViewCause[] = [
  'user-open',
  'user-close',
  'user-switch',
  'programmatic',
  'filter',
  'stale',
  'concurrent',
]

describe('panelHistoryAction — regla 0: mientras un overlay sea dueño de la entrada de arriba, no se escribe', () => {
  // ⚠ ES LA REGLA QUE CIERRA C-1, y es ABSOLUTA a propósito. Si se escribiera historial mientras la
  // entrada de arriba lleva la marca de un overlay, el `replaceState` le borraría su hash y su marca
  // ⇒ al cerrarse, `isOverlayHistoryEntry` daría `false`, el overlay no haría su `back()`, y quedaría
  // una entrada huérfana más un atrás muerto. Cambiaríamos una regresión por un defecto.
  // Un caso por cada causa para que nadie pueda debilitar la regla "sólo para una".
  for (const cause of TODAS_LAS_CAUSAS) {
    it(`con la causa '${cause}' devuelve 'none' aunque el cambio de vista sea real`, () => {
      expect(
        panelHistoryAction({ cause, from: 'a', to: 'b', holding: true, foreignOwnsTop: true }),
      ).toBe('none')
    })
  }

  it('la escritura queda DIFERIDA, no perdida: la misma entrada sin overlay arriba sí se escribe', () => {
    // El contraste es el punto: lo único que cambió es quién tiene la entrada de arriba.
    expect(
      panelHistoryAction({ cause: 'programmatic', from: 'dup', to: 'keep', holding: true, foreignOwnsTop: true }),
    ).toBe('none')
    expect(
      panelHistoryAction({ cause: 'programmatic', from: 'dup', to: 'keep', holding: true, foreignOwnsTop: false }),
    ).toBe('replace')
  })
})

describe('panelHistoryAction — regla 1: el commit concurrente nunca toca el historial', () => {
  it("la causa 'concurrent' devuelve 'none' incluso con la entrada de arriba libre", () => {
    // Es la declaración del call site del borrado. Sobrevive aunque el marcador del overlay cambie
    // de nombre y la regla 0 deje de reconocerlo: dos candados independientes, no uno.
    expect(
      panelHistoryAction({ cause: 'concurrent', from: 'x', to: null, holding: true, foreignOwnsTop: false }),
    ).toBe('none')
  })
})

describe('panelHistoryAction — regla 2: empujar la misma URL colapsa la entrada (cicatriz 1)', () => {
  for (const cause of TODAS_LAS_CAUSAS) {
    it(`con la causa '${cause}' y origen igual a destino devuelve 'none'`, () => {
      expect(
        panelHistoryAction({ cause, from: 'abc', to: 'abc', holding: true, foreignOwnsTop: false }),
      ).toBe('none')
    })
  }

  it('null === null también es "sin cambio real"', () => {
    // El caso del saneo pedido dos veces sobre una URL que ya está limpia: escribir ahí dejaría dos
    // entradas idénticas y el atrás se llevaría la página.
    expect(
      panelHistoryAction({ cause: 'stale', from: null, to: null, holding: false, foreignOwnsTop: false }),
    ).toBe('none')
  })

  // G-04-8 (plan 04-07): con la vista igual pero algo que `drop` va a borrar de la query actual
  // (`cleansQuery`, lo calcula `applyPanelView`), SÍ hay un cambio real —el de la query—. La regla 2 se
  // comía esa limpieza: `/negocio?tab=integraciones&mp=connected` quedaba con `mp` para siempre y los
  // tabs de Negocio, trabados en Integraciones. Una limpieza nunca es un destino ni un consumo: reemplaza.
  // Las reglas 0 y 1 siguen primero. Sin `cleansQuery`, los casos de arriba no cambian.
  for (const cause of TODAS_LAS_CAUSAS) {
    const esperado = cause === 'concurrent' ? 'none' : 'replace'
    it(`con la causa '${cause}', origen igual a destino y una limpieza de la query devuelve '${esperado}'`, () => {
      expect(
        panelHistoryAction({ cause, from: 'abc', to: 'abc', holding: true, foreignOwnsTop: false, cleansQuery: true }),
      ).toBe(esperado)
    })
  }

  it('una limpieza de la query con la entrada de arriba ajena sigue en none (la regla 0 primero)', () => {
    expect(
      panelHistoryAction({ cause: 'programmatic', from: 'abc', to: 'abc', holding: false, foreignOwnsTop: true, cleansQuery: true }),
    ).toBe('none')
  })

  it('una limpieza de la query con null === null reemplaza', () => {
    expect(
      panelHistoryAction({ cause: 'stale', from: null, to: null, holding: false, foreignOwnsTop: false, cleansQuery: true }),
    ).toBe('replace')
  })
})

describe('panelHistoryAction — la tabla de decisiones', () => {
  it('abrir un cliente desde el listado empuja una entrada', () => {
    expect(
      panelHistoryAction({ cause: 'user-open', from: null, to: 'abc', holding: false, foreignOwnsTop: false }),
    ).toBe('push')
  })

  it('cambiar de cliente A→B también empuja: B es un destino propio', () => {
    // Decisión ① del plan. En mobile A→B sin pasar por el listado es imposible (el listado se oculta
    // con el detalle abierto), y en desktop que el atrás vuelva a la ficha anterior es lo honesto.
    expect(
      panelHistoryAction({ cause: 'user-open', from: 'a', to: 'b', holding: true, foreignOwnsTop: false }),
    ).toBe('push')
  })

  it('el "Volver" consume la entrada cuando la entrada de arriba es NUESTRA', () => {
    expect(
      panelHistoryAction({ cause: 'user-close', from: 'a', to: null, holding: true, foreignOwnsTop: false }),
    ).toBe('consume')
  })

  it('el "Volver" REEMPLAZA cuando la entrada no es nuestra: un back ahí saca al dueño del sitio', () => {
    // Cicatriz 2 de `lib/overlay-history.ts:22-24`. Es el caso "el dueño entró pegando la URL":
    // arriba del stack está la página desde la que llegó, no una entrada nuestra.
    expect(
      panelHistoryAction({ cause: 'user-close', from: 'a', to: null, holding: false, foreignOwnsTop: false }),
    ).toBe('replace')
  })

  it('la fusión, ya con el modal cerrado, reemplaza en vez de empujar', () => {
    expect(
      panelHistoryAction({ cause: 'programmatic', from: 'dup', to: 'keep', holding: false, foreignOwnsTop: false }),
    ).toBe('replace')
  })

  it('un FILTRO reemplaza (T-3, el activeLoc de Agenda: expresable aunque esta fase no lo cablee)', () => {
    expect(
      panelHistoryAction({ cause: 'filter', from: 'loc1', to: 'loc2', holding: true, foreignOwnsTop: false }),
    ).toBe('replace')
  })

  it("el saneo CONSUME cuando la entrada es nuestra: reemplazar dejaría el atrás muerto", () => {
    // ⚠ Es el arreglo del back muerto. Un `replace` dejaría `/clients` encima de `/clients`: dos
    // entradas idénticas, y el dueño tendría que apretar atrás dos veces para que pase algo visible
    // — la "entrada basura" que el criterio 3 prohíbe. Consumir BORRA nuestra entrada.
    expect(
      panelHistoryAction({ cause: 'stale', from: 'x', to: null, holding: true, foreignOwnsTop: false }),
    ).toBe('consume')
  })

  it('el saneo REEMPLAZA cuando la entrada no es nuestra (URL pegada con un id que no resuelve)', () => {
    expect(
      panelHistoryAction({ cause: 'stale', from: 'x', to: null, holding: false, foreignOwnsTop: false }),
    ).toBe('replace')
  })
})

describe('resolveViewParam — UNA regla para los tres desajustes entre la URL y lo que se muestra', () => {
  it('sin param en la URL no hay nada seleccionado ni nada que reconciliar', () => {
    expect(resolveViewParam({ param: null, resolvedTo: null })).toMatchObject({
      selected: null,
      reconcile: false,
    })
  })

  it('cuando la URL y la vista coinciden, no se reconcilia', () => {
    expect(resolveViewParam({ param: 'abc', resolvedTo: 'abc' })).toMatchObject({
      selected: 'abc',
      reconcile: false,
    })
  })

  it('un id que no resuelve pide el saneo con destino nulo', () => {
    expect(resolveViewParam({ param: 'abc', resolvedTo: null })).toMatchObject({
      selected: null,
      reconcile: true,
      cause: 'stale',
      to: null,
    })
  })

  it('un id inexistente, uno de OTRO NEGOCIO y uno recién borrado son INDISTINGUIBLES', () => {
    // NAV-02 y el cierre del riesgo (b) del roadmap. La resolución nunca consulta la base: se hace
    // contra `clients`, la lista que ya vino filtrada por `.eq('business_id', business.id)` en el
    // server. Los tres casos son "no está en la lista", así que no hay oracle de existencia.
    const inexistente = resolveViewParam({ param: 'no-existe-en-ningun-lado', resolvedTo: null })
    const deOtroNegocio = resolveViewParam({ param: 'id-real-pero-de-otro-tenant', resolvedTo: null })
    const recienBorrado = resolveViewParam({ param: 'id-que-estaba-hace-un-segundo', resolvedTo: null })
    expect(inexistente).toEqual(deOtroNegocio)
    expect(deOtroNegocio).toEqual(recienBorrado)
  })

  it('cuando la vista muestra OTRO cliente que el de la URL, es la fusión: la URL tiene que alcanzarlo', () => {
    expect(resolveViewParam({ param: 'dup', resolvedTo: 'keep' })).toMatchObject({
      selected: 'keep',
      reconcile: true,
      cause: 'programmatic',
      to: 'keep',
    })
  })

  it('la URL con el param vacío (?c=) también se sanea', () => {
    expect(resolveViewParam({ param: '', resolvedTo: null })).toMatchObject({
      selected: null,
      reconcile: true,
      cause: 'stale',
    })
  })
})

describe('sanitizeAction — la reconciliación pedida dos veces escribe una sola vez', () => {
  it('sin desajuste no hay nada que aplicar', () => {
    expect(sanitizeAction({ reconcile: false, param: 'x', lastApplied: null })).toBe('none')
  })

  it('el primer desajuste se aplica', () => {
    expect(sanitizeAction({ reconcile: true, param: 'x', lastApplied: null })).toBe('apply')
  })

  it('el MISMO desajuste, pedido de nuevo, no se vuelve a escribir', () => {
    expect(sanitizeAction({ reconcile: true, param: 'x', lastApplied: 'x' })).toBe('none')
  })

  it('OTRO desajuste sí se reconcilia', () => {
    expect(sanitizeAction({ reconcile: true, param: 'y', lastApplied: 'x' })).toBe('apply')
  })
})

describe('reconciledMemo — cuándo se OLVIDA lo ya reconciliado (W-2)', () => {
  it('cuando la URL y la vista coinciden, la memoria se resetea', () => {
    expect(reconciledMemo({ reconcile: false, applied: false, param: 'x', previous: 'x' })).toBeNull()
  })

  it('si la escritura ocurrió, se recuerda el param que la disparó', () => {
    expect(reconciledMemo({ reconcile: true, applied: true, param: 'x', previous: null })).toBe('x')
  })

  it('si la escritura se SALTEÓ (regla 0), la memoria no se envenena', () => {
    // Éste es el caso que hace falta para que el diferimiento funcione: si la escritura no ocurrió,
    // la próxima vuelta del efecto tiene que poder volver a intentarla.
    expect(reconciledMemo({ reconcile: true, applied: false, param: 'x', previous: 'w' })).toBe('w')
  })

  it('la secuencia del FORWARD del navegador: sin el reset la URL quedaría mintiendo para siempre', () => {
    // 1) `?c=A` no resuelve ⇒ se aplica y la memoria queda en 'A'.
    expect(sanitizeAction({ reconcile: true, param: 'A', lastApplied: null })).toBe('apply')
    const memoria1 = reconciledMemo({ reconcile: true, applied: true, param: 'A', previous: null })
    expect(memoria1).toBe('A')

    // 2) el `consume` dejó `/clients`: URL y vista coinciden ⇒ la memoria se OLVIDA.
    const memoria2 = reconciledMemo({ reconcile: false, applied: false, param: null, previous: memoria1 })
    expect(memoria2).toBeNull()

    // 3) el dueño aprieta FORWARD y vuelve a `?c=A`, que sigue sin resolver ⇒ se reconcilia igual
    //    que la primera vez. Sin el reset del paso 2 esto daría 'none' y la URL no se limpiaría nunca.
    expect(sanitizeAction({ reconcile: true, param: 'A', lastApplied: memoria2 })).toBe('apply')
  })
})

describe('la ACCIÓN EFECTIVA — lo que termina haciendo cada escenario real', () => {
  // No alcanza con testear las dos funciones por separado: lo que importa es la composición, porque
  // es lo que el texto del call site no puede probar. Se encadena `resolveViewParam` →
  // `panelHistoryAction` exactamente como lo hace el efecto de reconciliación.
  function accionEfectiva(input: {
    param: string | null
    resolvedTo: string | null
    holding: boolean
    foreignOwnsTop: boolean
  }) {
    const view = resolveViewParam({ param: input.param, resolvedTo: input.resolvedTo })
    if (!view.reconcile || view.cause === null) return 'none'
    return panelHistoryAction({
      cause: view.cause,
      from: input.param,
      to: view.to,
      holding: input.holding,
      foreignOwnsTop: input.foreignOwnsTop,
    })
  }

  it('fusión con el modal de fusión ABIERTO: no escribe nada — es DIFERIDO, no perdido', () => {
    expect(
      accionEfectiva({ param: 'dup', resolvedTo: 'keep', holding: true, foreignOwnsTop: true }),
    ).toBe('none')
  })

  it('fusión con el modal ya cerrado: REEMPLAZA — es el criterio 3 del ROADMAP, literal', () => {
    expect(
      accionEfectiva({ param: 'dup', resolvedTo: 'keep', holding: true, foreignOwnsTop: false }),
    ).toBe('replace')
  })

  it('post-borrado, con el diálogo todavía consumiendo su entrada: no escribe nada (C-1)', () => {
    expect(
      accionEfectiva({ param: 'X', resolvedTo: null, holding: false, foreignOwnsTop: true }),
    ).toBe('none')
  })

  it('post-borrado ya asentado: CONSUME — es el arreglo del atrás muerto', () => {
    expect(
      accionEfectiva({ param: 'X', resolvedTo: null, holding: true, foreignOwnsTop: false }),
    ).toBe('consume')
  })

  it('URL pegada con un id que no resuelve: REEMPLAZA, nunca consume', () => {
    expect(
      accionEfectiva({ param: 'X', resolvedTo: null, holding: false, foreignOwnsTop: false }),
    ).toBe('replace')
  })
})

describe('panelViewState — la trampa que falla EN SILENCIO', () => {
  it('devuelve un objeto con exactamente UNA clave', () => {
    // ⚠ Si el state que se empuja arrastrara `__NA` (porque alguien lo armó propagando
    // `window.history.state`), el parche de Next tomaría su rama temprana y NO despacharía
    // `ACTION_RESTORE`: la URL cambiaría, `useSearchParams` no se actualizaría, el detalle no
    // abriría, y no habría ni un error en consola.
    const state = panelViewState('c', 'abc')
    expect(state).toEqual({ frjView: 'c' })
    expect(Object.keys(state)).toHaveLength(1)
  })

  it('no trae `__NA` heredado', () => {
    expect('__NA' in panelViewState('c', 'abc')).toBe(false)
  })

  it('una entrada sin vista no lleva nuestra marca: no es nuestra y no se puede consumir', () => {
    expect(panelViewState('c', null)).toEqual({ frjView: null })
  })
})

describe('isPanelViewEntry / isOverlayOwnedEntry — narrowing manual, sin `any`', () => {
  it('un state que no es un objeto nuestro nunca es nuestra entrada', () => {
    // `history.state` es `unknown` de verdad: puede traer el state del router de Next, el de otra
    // librería, o `null`.
    expect(isPanelViewEntry(null, 'c')).toBe(false)
    expect(isPanelViewEntry(undefined, 'c')).toBe(false)
    expect(isPanelViewEntry(42, 'c')).toBe(false)
    expect(isPanelViewEntry({}, 'c')).toBe(false)
  })

  it('reconoce la entrada de ESTA vista', () => {
    expect(isPanelViewEntry({ frjView: 'c' }, 'c')).toBe(true)
  })

  it('NO reconoce la entrada de otra superficie del panel (la Phase 2 marca con otro param)', () => {
    expect(isPanelViewEntry({ frjView: 'tab' }, 'c')).toBe(false)
  })

  it('reconoce una entrada de overlay, y no la confunde con la nuestra', () => {
    expect(isOverlayOwnedEntry({ frjOverlay: 3 })).toBe(true)
    expect(isOverlayOwnedEntry({ frjView: 'c' })).toBe(false)
    expect(isOverlayOwnedEntry(null)).toBe(false)
  })
})

describe('panelViewUrl — el armado de URL, puro', () => {
  it('agrega el param cuando no había query', () => {
    expect(panelViewUrl({ pathname: '/clients', search: '', param: 'c', value: 'abc' })).toBe('/clients?c=abc')
  })

  it('reemplaza el valor cuando ya estaba', () => {
    expect(panelViewUrl({ pathname: '/clients', search: '?c=abc', param: 'c', value: 'xyz' })).toBe('/clients?c=xyz')
  })

  it('al borrar el último parámetro no deja el `?` colgando', () => {
    // Un `/clients?` distinto de `/clients` sería una URL nueva: el back se llevaría la página
    // (cicatriz 1).
    expect(panelViewUrl({ pathname: '/clients', search: '?c=abc', param: 'c', value: null })).toBe('/clients')
  })

  it('preserva los params ajenos', () => {
    expect(panelViewUrl({ pathname: '/clients', search: '?otro=1&c=abc', param: 'c', value: null })).toBe('/clients?otro=1')
  })
})

describe('panelViewUrl con `drop` — el retorno del OAuth limpia SUS params sin pisar los ajenos (plan 04-01)', () => {
  // POR QUÉ EXISTE: el retorno de MercadoPago y de Google aterriza en `/negocio?mp=…` / `?google=…`, y
  // la pantalla tiene que dejar la URL en `/negocio?tab=integraciones` con UNA escritura. Sin `drop`,
  // el armado sólo sabe poner o sacar SU param y preservar el resto: `mp` quedaría colgado. Con `drop`
  // se borran los params que la pantalla declara suyos y los ajenos sobreviven. Lo consume el 04-02.
  it('?mp=connected + tab integraciones + drop [mp, google] ⇒ /negocio?tab=integraciones', () => {
    expect(
      panelViewUrl({ pathname: '/negocio', search: '?mp=connected', param: 'tab', value: 'integraciones', drop: ['mp', 'google'] }),
    ).toBe('/negocio?tab=integraciones')
  })

  it('los params ajenos sobreviven: ?mp=connected&x=1 ⇒ /negocio?x=1&tab=integraciones', () => {
    expect(
      panelViewUrl({ pathname: '/negocio', search: '?mp=connected&x=1', param: 'tab', value: 'integraciones', drop: ['mp', 'google'] }),
    ).toBe('/negocio?x=1&tab=integraciones')
  })

  it('sin params restantes queda el pathname a secas, nunca un `?` colgando', () => {
    expect(
      panelViewUrl({ pathname: '/negocio', search: '?google=error', param: 'tab', value: null, drop: ['mp', 'google'] }),
    ).toBe('/negocio')
  })

  it('sin `drop` (default vacío) todo sigue igual que antes: /clients no cambia', () => {
    expect(panelViewUrl({ pathname: '/clients', search: '?otro=1&c=abc', param: 'c', value: 'xyz' })).toBe('/clients?otro=1&c=xyz')
    expect(panelViewUrl({ pathname: '/clients', search: '?otro=1&c=abc', param: 'c', value: 'xyz', drop: [] })).toBe('/clients?otro=1&c=xyz')
  })
})

describe('applyPanelView — UN REEMPLAZO NO CAMBIA QUIÉN EMPUJÓ LA ENTRADA (Patrón 3, plan 04-01)', () => {
  // EL DEFECTO, paso a paso (04-RESEARCH §Patrón 3): una entrada AJENA —una URL pegada, el retorno del
  // OAuth— recibe un reemplazo nuestro; si ese reemplazo escribe la marca, la entrada pasa a "ser
  // nuestra", y el próximo consumo (volver al tab por defecto, el «Volver» de clientes, tocar la
  // sección activa en el sidebar) hace un retroceso sobre ella: el dueño sale del sitio. Es la
  // cicatriz 2 del módulo. La regla: sólo un EMPUJE crea una entrada nuestra; un reemplazo conserva la
  // propiedad que la entrada ya tenía y nunca la fabrica.

  /** Una pila de UNA entrada cuyo state cambia con cada escritura (el reemplazo lo pisa de verdad). */
  function montarEntrada(state: unknown, search = '') {
    const pila = { state, search, retrocesos: 0 }
    const pushState = vi.fn((s: unknown) => { pila.state = s })
    const replaceState = vi.fn((s: unknown) => { pila.state = s })
    const back = vi.fn(() => { pila.retrocesos++ })
    vi.stubGlobal('window', {
      history: { get state() { return pila.state }, pushState, replaceState, back },
      location: { pathname: '/clients', get search() { return pila.search } },
    })
    return { pila, pushState, replaceState, back }
  }

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('el empuje escribe la marca: la entrada que creamos es nuestra', () => {
    const { pushState } = montarEntrada(null)
    expect(PH.applyPanelView({ cause: 'user-open', param: 'c', from: null, to: 'abc' })).toBe('push')
    expect(pushState).toHaveBeenCalledWith({ frjView: 'c' }, '', '/clients?c=abc')
  })

  it('un reemplazo CON holding conserva la marca (la entrada ya era nuestra)', () => {
    const { replaceState } = montarEntrada({ frjView: 'c' }, '?c=a')
    expect(PH.applyPanelView({ cause: 'programmatic', param: 'c', from: 'a', to: 'b' })).toBe('replace')
    expect(replaceState).toHaveBeenCalledWith({ frjView: 'c' }, '', '/clients?c=b')
  })

  it('un reemplazo SIN holding NO fabrica la marca sobre una entrada ajena', () => {
    const { replaceState } = montarEntrada({ __NA: true }, '?c=dup')
    expect(PH.applyPanelView({ cause: 'programmatic', param: 'c', from: 'dup', to: 'keep' })).toBe('replace')
    expect(replaceState).toHaveBeenCalledWith({ frjView: null }, '', '/clients?c=keep')
  })

  it('CAMBIO DECLARADO en /clients: sobre una ?c= pegada, tras la fusión «Volver» REEMPLAZA en vez de retroceder fuera del sitio', () => {
    // Antes del arreglo, la fusión `programmatic` sobre la `?c=` pegada marcaba la entrada, y el
    // `user-close` del «Volver» consumía: un retroceso sobre una entrada que no empujamos. Ahora la
    // entrada sigue siendo ajena y el cierre la reemplaza a `/clients`.
    const { pila, back, replaceState } = montarEntrada({ __NA: true }, '?c=dup')
    PH.applyPanelView({ cause: 'programmatic', param: 'c', from: 'dup', to: 'keep' })
    pila.search = '?c=keep'
    expect(PH.applyPanelView({ cause: 'user-close', param: 'c', from: 'keep', to: null })).toBe('replace')
    expect(back).not.toHaveBeenCalled()
    expect(pila.retrocesos).toBe(0)
    expect(replaceState).toHaveBeenLastCalledWith({ frjView: null }, '', '/clients')
  })

  it('la séptima causa: user-switch reemplaza con y sin holding', () => {
    for (const holding of [false, true]) {
      expect(panelHistoryAction({ cause: 'user-switch', from: 'a', to: 'b', holding, foreignOwnsTop: false })).toBe('replace')
    }
  })

  it('applyPanelView pasa `drop` al armado de URL', () => {
    const { replaceState } = montarEntrada({ __NA: true }, '?mp=connected')
    expect(PH.applyPanelView({ cause: 'programmatic', param: 'tab', from: null, to: 'integraciones', drop: ['mp', 'google'] })).toBe('replace')
    expect(replaceState).toHaveBeenCalledWith({ frjView: null }, '', '/clients?tab=integraciones')
  })
})

// ── NAV-08 — el menú no sepulta subsecciones ─────────────────────────────────────────────────────

describe('panelViewEntryParam — la marca, leída sin saber de qué vista es', () => {
  // El sidebar no sabe nada de `?c=`: pregunta "¿la entrada de arriba es de ALGUNA subsección del
  // panel?". Que el literal 'frjView' se lea en UN solo lugar es lo que evita el segundo dialecto.
  it('devuelve null para cualquier state que no sea nuestro', () => {
    expect(panelViewEntryParam(null)).toBeNull()
    expect(panelViewEntryParam(undefined)).toBeNull()
    expect(panelViewEntryParam(42)).toBeNull()
    expect(panelViewEntryParam({})).toBeNull()
    expect(panelViewEntryParam({ __NA: true })).toBeNull() // el state del router de Next
    expect(panelViewEntryParam({ frjOverlay: 3 })).toBeNull() // el de un overlay
  })

  it('devuelve el param de CUALQUIER subsección, no sólo la de Clientes', () => {
    // La Phase 2 marca con otro param y hereda el arreglo sin tocar nada de este módulo.
    expect(panelViewEntryParam({ frjView: 'c' })).toBe('c')
    expect(panelViewEntryParam({ frjView: 'tab' })).toBe('tab')
  })

  it('una marca con destino nulo NO es nuestra', () => {
    // `panelViewState(param, null)` deja `frjView: null`: una entrada que no lleva ninguna vista no
    // se puede consumir.
    expect(panelViewEntryParam(panelViewState('c', null))).toBeNull()
  })

  it('isPanelViewEntry sigue derivándose de él (una sola definición de la marca)', () => {
    expect(isPanelViewEntry({ frjView: 'c' }, 'c')).toBe(true)
    expect(isPanelViewEntry({ frjView: 'tab' }, 'c')).toBe(false)
    expect(isPanelViewEntry(panelViewState('c', 'abc'), 'c')).toBe(true)
  })
})

describe('consumeOwnedPanelEntry — tocar la sección en la que ya estás cierra la subsección', () => {
  // El runner corre con environment 'node': no hay `window`. Se stubea uno mínimo con lo único que
  // el ejecutor toca (`history.state` y `history.back`), que además deja CONTAR los back().
  function montarHistorial(state: unknown) {
    const back = vi.fn()
    vi.stubGlobal('window', { history: { state, back } })
    return back
  }

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('con NUESTRA entrada arriba hace exactamente un back() y avisa que consumió', () => {
    const back = montarHistorial(panelViewState('c', 'abc'))
    expect(consumeOwnedPanelEntry()).toBe(true)
    expect(back).toHaveBeenCalledTimes(1)
  })

  it('es genérico: consume también la subsección de otra pantalla (Phase 2)', () => {
    const back = montarHistorial({ frjView: 'tab' })
    expect(consumeOwnedPanelEntry()).toBe(true)
    expect(back).toHaveBeenCalledTimes(1)
  })

  it('CERO back() sobre una entrada ajena — es la cicatriz 2, saca al dueño del sitio', () => {
    for (const ajena of [null, { __NA: true }, {}, panelViewState('c', null)]) {
      const back = montarHistorial(ajena)
      expect(consumeOwnedPanelEntry()).toBe(false)
      expect(back).not.toHaveBeenCalled()
      vi.unstubAllGlobals()
    }
  })

  it('CERO back() cuando la entrada de arriba es de un overlay', () => {
    // La guarda explícita de `lib/overlay-history.ts:362-366`: si el `back()` cayera sobre la entrada
    // del overlay, desharíamos SU entrada creyendo deshacer la nuestra. Hoy las dos formas de state
    // son disjuntas, y justamente por eso la guarda se escribe en vez de darse por supuesta.
    const back = montarHistorial({ frjOverlay: 1 })
    expect(consumeOwnedPanelEntry()).toBe(false)
    expect(back).not.toHaveBeenCalled()
  })

  it('una entrada que lleva las DOS marcas se considera del overlay y no se toca', () => {
    // El candado independiente: aunque alguien empujara un state con las dos, gana el overlay.
    const back = montarHistorial({ frjOverlay: 1, frjView: 'c' })
    expect(consumeOwnedPanelEntry()).toBe(false)
    expect(back).not.toHaveBeenCalled()
  })
})

// ── NAV-07 — el atrás desde una sección cae en el dashboard ──────────────────────────────────────

describe('panelNavMode — la regla de push-vs-replace del menú', () => {
  it('dashboard → sección EMPUJA: el dashboard tiene que quedar debajo', () => {
    expect(panelNavMode({ from: PANEL_ROOT, to: '/clients' })).toBe('push')
    expect(panelNavMode({ from: PANEL_ROOT, to: '/finances' })).toBe('push')
  })

  it('sección → sección REEMPLAZA: encima del dashboard hay SIEMPRE una sola sección', () => {
    // Es literalmente el pedido de julio: Finanzas → Clientes no puede dejar Finanzas debajo.
    expect(panelNavMode({ from: '/finances', to: '/clients' })).toBe('replace')
    expect(panelNavMode({ from: '/negocio', to: '/settings' })).toBe('replace')
  })

  it('NO es `replace` a secas: reemplazar desde el dashboard sacaría del panel', () => {
    // El candado contra la simplificación tentadora. Si alguien pone `replace` en todos los links,
    // este caso se pone rojo: la entrada del dashboard desaparecería y el primer atrás saldría del
    // sitio en vez de volver al panel.
    expect(panelNavMode({ from: PANEL_ROOT, to: '/agenda' })).not.toBe('replace')
  })

  it('la misma ruta REEMPLAZA: empujarla sería un atrás muerto (cicatriz 1)', () => {
    // Es la rama que cierra NAV-08 cuando la entrada de arriba NO es nuestra y por lo tanto no se
    // puede consumir (el dueño pegó `/clients?c=A`): el replace limpia la query sin apilar nada.
    expect(panelNavMode({ from: '/clients', to: '/clients' })).toBe('replace')
    expect(panelNavMode({ from: PANEL_ROOT, to: PANEL_ROOT })).toBe('replace')
  })

  it('sección → dashboard EMPUJA: reemplazar dejaría /dashboard sobre /dashboard', () => {
    // Dos entradas idénticas = un atrás que no hace nada visible, la "entrada basura" que el
    // criterio 3 prohíbe. Con push, el atrás desde el dashboard devuelve la sección de la que se
    // venía: siempre hace algo.
    expect(panelNavMode({ from: '/clients', to: PANEL_ROOT })).toBe('push')
  })

  it('la raíz es un parámetro, no un literal escondido en la regla', () => {
    expect(panelNavMode({ from: '/a', to: '/b', root: '/a' })).toBe('push')
    expect(panelNavMode({ from: '/x', to: '/b', root: '/a' })).toBe('replace')
  })

  // ── MOB-04 nivel 1 y D-02: las dos ramas de la pantalla Más ──────────────────────────────────

  it('Más → sección EMPUJA: la sección queda ENCIMA de Más (MOB-04 nivel 1)', () => {
    // Antes de esta fase devolvía `replace`: la sección PISABA a Más y el atrás salteaba un nivel
    // —comportamiento declarado "correcto en esa fase" en la UAT de la Phase 2 y que acá cambia a
    // propósito—. Con `push`, el primer atrás cae en Más y el segundo en Inicio: los dos niveles.
    expect(panelNavMode({ from: MAS, to: '/finances' })).toBe('push')
    expect(panelNavMode({ from: MAS, to: '/settings' })).toBe('push')
    expect(panelNavMode({ from: MAS, to: '/ayuda' })).toBe('push')
  })

  it('sección → Más EMPUJA: Más apila sobre lo que haya abierto (D-02)', () => {
    // La decisión del dueño: el atrás deshace el último movimiento. Si abrió Más de un toque
    // reflejo estando en Turnos, el atrás lo devuelve a Turnos y no a Inicio.
    expect(panelNavMode({ from: '/appointments', to: MAS })).toBe('push')
    expect(panelNavMode({ from: '/agenda', to: MAS })).toBe('push')
    expect(panelNavMode({ from: '/clients', to: MAS })).toBe('push')
  })

  it('Más → Más REEMPLAZA: la rama 1 sigue ganando sobre las dos nuevas (cicatriz 1)', () => {
    // El candado del ORDEN. Si `to === more` o `from === more` se escribieran ANTES de `from === to`,
    // este caso devolvería `push` y quedarían dos entradas `/mas` idénticas = un atrás muerto.
    expect(panelNavMode({ from: MAS, to: MAS })).toBe('replace')
  })

  it('Inicio ↔ Más: las ramas 2 y 3 siguen ganando, y las dos ya cumplían', () => {
    // No cambian de valor, pero sí de rama: son las que hacen que Inicio quede debajo de Más y que
    // volver a Inicio desde Más no deje `/dashboard` sobre `/dashboard`.
    expect(panelNavMode({ from: PANEL_ROOT, to: MAS })).toBe('push')
    expect(panelNavMode({ from: MAS, to: PANEL_ROOT })).toBe('push')
  })

  it('la ruta de Más es un parámetro, no un literal escondido en la regla', () => {
    // Mismo molde que `root`: sin parámetro, la rama no se puede ejercitar sin montar nada.
    expect(panelNavMode({ from: '/x', to: '/y', more: '/y' })).toBe('push')
    expect(panelNavMode({ from: '/x', to: '/y', more: '/z' })).toBe('replace')
  })

  it('PANEL_MORE está exportado y es la ruta de Más SIN TILDE', () => {
    // La tilde vive en el label, no en la URL (panel-bottom-nav.tsx) — y `EN_LA_BARRA` de
    // mas-client.tsx compara contra esta misma ruta. Un valor distinto acá rompería las dos.
    expect(PH.PANEL_MORE).toBe(MAS)
  })

  it('criterio 6 — ninguno de los 14 destinos del sidebar es PANEL_MORE, así que desktop no se entera', () => {
    // Los 13 `href` de `buildNavGroups` (las dos keys clients/patients van al MISMO href y se
    // enumeran igual, porque lo que se afirma es el inventario de valores que el sidebar puede
    // pasar) más el `/ayuda` del pie. Desktop cae en las ramas de SIEMPRE **por construcción**:
    // ni `from` ni `to` pueden valer `/mas` desde el sidebar, así que no hace falta —ni existe—
    // ningún chequeo de viewport en el medio. Eso es exactamente lo que el criterio 6 pide.
    const DESTINOS_SIDEBAR = [
      '/dashboard', '/appointments', '/agenda', '/abonos', '/negocio', '/web', '/servicios',
      '/equipo', '/consultorios', '/clients', '/clients', '/finances', '/settings', '/ayuda',
    ]
    expect(DESTINOS_SIDEBAR).toHaveLength(14)
    /** La regla TAL CUAL era antes de esta fase: tres ramas y el replace final. */
    const antesDeEstaFase = (from: string, to: string) =>
      from === to ? 'replace' : from === PANEL_ROOT ? 'push' : to === PANEL_ROOT ? 'push' : 'replace'
    for (const from of DESTINOS_SIDEBAR) {
      expect(from).not.toBe(PH.PANEL_MORE)
      for (const to of DESTINOS_SIDEBAR) {
        expect(panelNavMode({ from, to })).toBe(antesDeEstaFase(from, to))
      }
    }
  })
})

describe('panelNavMode — el invariante, simulado sobre la pila del navegador', () => {
  /** La pila que produciría el `<Link>` del sidebar aplicando la regla. El último es el actual. */
  function navegar(pila: string[], to: string): string[] {
    const from = pila[pila.length - 1]
    return panelNavMode({ from, to }) === 'push' ? [...pila, to] : [...pila.slice(0, -1), to]
  }
  /** El atrás del navegador: devuelve dónde aterriza, o `null` si se salió del panel. */
  function atras(pila: string[]): string | null {
    return pila.length > 1 ? pila[pila.length - 2] : null
  }

  it('Dashboard → Finanzas → Clientes → atrás aterriza en el DASHBOARD (el pedido de julio)', () => {
    let pila = [PANEL_ROOT]
    pila = navegar(pila, '/finances')
    pila = navegar(pila, '/clients')
    expect(pila).toEqual([PANEL_ROOT, '/clients'])
    expect(atras(pila)).toBe(PANEL_ROOT)
  })

  it('desde CUALQUIER sección del menú, después de cualquier recorrido, el atrás cae en el dashboard', () => {
    // Las 13 rutas reales del sidebar (los ~14 items del menú + la Ayuda del footer). La regla se
    // define sobre RUTAS y no sobre pantallas a propósito: Negocio y Ajustes comparten pantalla pero
    // son rutas distintas.
    const RUTAS = [
      '/appointments', '/agenda', '/abonos', '/negocio', '/web', '/servicios',
      '/equipo', '/consultorios', '/clients', '/finances', '/settings', '/ayuda',
    ]
    for (const primera of RUTAS) {
      for (const segunda of RUTAS) {
        const pila = navegar(navegar([PANEL_ROOT], primera), segunda)
        // Incluye el caso primera === segunda (tocar la sección en la que ya estás): tampoco apila.
        expect(pila).toEqual([PANEL_ROOT, segunda])
        expect(atras(pila)).toBe(PANEL_ROOT)
      }
    }
  })

  it('entrar DIRECTO a una sección deja el atrás fuera del panel — caso declarado, no hackeado', () => {
    // URL pegada o F5: no hay ningún dashboard debajo. Empujar uno falso sería inventar una entrada
    // que el dueño nunca visitó (D-01, historia honesta). Se declara y se vive con eso.
    expect(atras(['/clients'])).toBeNull()
  })

  // ── Los dos niveles, recorrido por recorrido ──────────────────────────────────────────────────

  it('Inicio → Más → Finanzas: el primer atrás cae en MÁS y el segundo en INICIO (criterio 1)', () => {
    let pila = [PANEL_ROOT]
    pila = navegar(pila, MAS)
    pila = navegar(pila, '/finances')
    expect(pila).toEqual([PANEL_ROOT, MAS, '/finances'])
    expect(atras(pila)).toBe(MAS)
    // Y desde Más, un atrás más cae en Inicio: el segundo nivel.
    expect(atras(pila.slice(0, -1))).toBe(PANEL_ROOT)
  })

  it('Inicio → Turnos → Más: el atrás cae en TURNOS, con TRES escalones (D-02)', () => {
    // ⚠ La consecuencia que el CONTEXT ordena NO esconder: "dos niveles" es la profundidad de Más y
    // sus secciones, NO un techo de la pila. Acá la pila tiene tres escalones a propósito.
    let pila = [PANEL_ROOT]
    pila = navegar(pila, '/appointments')
    pila = navegar(pila, MAS)
    expect(pila).toEqual([PANEL_ROOT, '/appointments', MAS])
    expect(atras(pila)).toBe('/appointments')
  })

  it('las 9 secciones que en mobile SÓLO se alcanzan por Más: atrás → Más, atrás → Inicio', () => {
    // El inventario de la rama de Más en mobile = los ítems del menú que no están en la barra.
    const SOLO_POR_MAS = [
      '/abonos', '/negocio', '/web', '/servicios', '/equipo', '/consultorios',
      '/finances', '/settings', '/ayuda',
    ]
    expect(SOLO_POR_MAS).toHaveLength(9)
    for (const seccion of SOLO_POR_MAS) {
      const pila = navegar(navegar([PANEL_ROOT], MAS), seccion)
      expect(pila).toEqual([PANEL_ROOT, MAS, seccion])
      expect(atras(pila)).toBe(MAS)
      expect(atras(pila.slice(0, -1))).toBe(PANEL_ROOT)
    }
  })

  it('los 4 destinos de la barra → Más: el atrás devuelve el destino (D-02)', () => {
    // Los cuatro destinos de la barra que no son Más. El de Inicio se trata aparte y no por descuido:
    // `Inicio → Inicio` es la MISMA ruta (rama 1, `replace`), así que ahí la pila queda en dos
    // escalones y el atrás cae igual en Inicio — que es MOB-04 nivel 2, el que ya cumplía.
    const DESTINOS_BARRA = [PANEL_ROOT, '/appointments', '/agenda', '/clients']
    expect(DESTINOS_BARRA).toHaveLength(4)
    for (const destino of DESTINOS_BARRA) {
      const pila = navegar(navegar([PANEL_ROOT], destino), MAS)
      if (destino === PANEL_ROOT) {
        expect(pila).toEqual([PANEL_ROOT, MAS])
      } else {
        expect(pila).toEqual([PANEL_ROOT, destino, MAS])
      }
      expect(atras(pila)).toBe(destino)
    }
  })

  it('entrada directa + tocar Más EMPUJA: nunca un retroceso (cicatriz 2)', () => {
    // Con la pila `['/finances']` no hay Inicio debajo. Si la política resolviera esto con un
    // `back()`, el dueño quedaría FUERA del sitio. Las dos ramas nuevas devuelven `push`, que es la
    // degradación segura: el peor caso es una pila un escalón más larga.
    expect(panelNavMode({ from: '/finances', to: MAS })).toBe('push')
    const pila = navegar(['/finances'], MAS)
    expect(pila).toEqual(['/finances', MAS])
    expect(atras(pila)).toBe('/finances')
  })

  it('tocar Más estando DENTRO de su rama todavía APILA — declarado acá, lo arregla 03-02', () => {
    // ⚠ NO es un olvido ni una regresión de este plan: con sólo las dos ramas de ruta, el gesto de
    // D-03 ("subir un nivel") todavía no existe, porque subir necesita la marca de la rama y un
    // retroceso guardado, que son trabajo del plan 03-02. Mientras tanto la pila queda un escalón
    // más larga —no peligrosa—. Este caso lo deja escrito para que la UAT no lo lea como un defecto
    // nuevo, y es el caso que 03-02 tiene que venir a cambiar.
    let pila = [PANEL_ROOT]
    pila = navegar(pila, MAS)
    pila = navegar(pila, '/finances')
    pila = navegar(pila, MAS)
    expect(pila).toEqual([PANEL_ROOT, MAS, '/finances', MAS])
  })
})

// ── Plan 03-02 — la marca de la rama, la decisión con el hecho y el retroceso guardado ───────────
//
// ⚠ TODO LO NUEVO SE AFIRMA POR NAMESPACE (`PH.algo`) Y NO POR IMPORT NOMBRADO, por el mismo motivo
// que `PH.PANEL_MORE` en el plan 03-01: un import nombrado que todavía no existe revienta al CARGAR
// el módulo, y ese rojo es del loader —no de la política—, así que no distingue "falta la rama" de
// "el archivo no compila". Con el namespace, el único rojo posible es el de la aserción.

/** Las 9 secciones que en mobile SÓLO se alcanzan por Más (el inventario de su rama). */
const RAMA_DE_MAS = [
  '/abonos', '/negocio', '/web', '/servicios', '/equipo', '/consultorios',
  '/finances', '/settings', '/ayuda',
]

/** Los 5 destinos de la barra, Más incluido. */
const DESTINOS_BARRA_5 = [PANEL_ROOT, '/appointments', '/agenda', '/clients', MAS]

/** Los 4 destinos de la barra que NO son Más. */
const DESTINOS_BARRA_4 = [PANEL_ROOT, '/appointments', '/agenda', '/clients']

describe('la marca de la rama — una clave NUEVA, que guarda la RUTA que quedó debajo', () => {
  it('devuelve un objeto con exactamente una clave, y es la ruta de abajo', () => {
    const marca = PH.panelUnderState(MAS)
    expect(Object.keys(marca)).toEqual(['frjUnder'])
    expect(marca).toEqual({ frjUnder: MAS })
  })

  it('un objeto LITERAL FRESCO cada vez: dos llamadas no comparten referencia', () => {
    // La trampa que falla en silencio: propagar el state actual arrastra los internos del router, el
    // parche de Next toma su rama temprana y la URL cambia sin que el router se entere.
    expect(PH.panelUnderState(MAS)).not.toBe(PH.panelUnderState(MAS))
    expect(PH.panelUnderState(MAS)).not.toHaveProperty('__NA')
  })

  it('el lector devuelve la ruta, y null para todo lo que no sea nuestra marca', () => {
    expect(PH.panelUnderRoute({ frjUnder: MAS })).toBe(MAS)
    expect(PH.panelUnderRoute({ frjUnder: PANEL_ROOT })).toBe(PANEL_ROOT)
    for (const ajeno of [null, undefined, {}, { frjUnder: 7 }, { frjUnder: null }, 'cualquier cosa', 42]) {
      expect(PH.panelUnderRoute(ajeno)).toBeNull()
    }
  })

  it('isForeignOwnedEntry NO la reconoce — si lo hiciera, el detalle de cliente dejaría de empujar', () => {
    // EL CASO CONTRAPUESTO, y el más grave de todo el plan: con la marca de la rama adentro del
    // predicado de la regla 0, `applyPanelView` se abstendría de escribir sobre CUALQUIER entrada
    // marcada y `/clients` perdería su entrada de subsección — una regresión silenciosa de v0.30.
    expect(PH.isForeignOwnedEntry({ frjUnder: MAS })).toBe(false)
    // Y las dos ajenas de verdad siguen reconocidas.
    expect(PH.isForeignOwnedEntry({ frjOverlay: 1 })).toBe(true)
    expect(PH.isForeignOwnedEntry({ frjDirty: 1 })).toBe(true)
  })

  it('la marca de la rama NO es una marca de subsección: NAV-08 no la toca', () => {
    // Son dos preguntas distintas que conviven en el mismo onNavigate. Si la de subsección
    // reconociera la de la rama, tocar la sección en la que ya estás retrocedería de más.
    expect(panelViewEntryParam({ frjUnder: MAS })).toBeNull()
    const back = vi.fn()
    vi.stubGlobal('window', { history: { state: { frjUnder: MAS }, back } })
    expect(consumeOwnedPanelEntry()).toBe(false)
    expect(back).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})

describe('el sentinel de salida — la CUARTA marca de la pila, y la ÚNICA nueva que es absorbente', () => {
  // ⚠ LAS DOS DIRECCIONES ROMPEN COSAS OPUESTAS, y por eso los casos de este bloque viven PEGADOS a
  // los de la marca de la rama (el bloque de arriba):
  //   · la marca de la RAMA adentro de la regla 0 ⇒ `applyPanelView` se abstiene sobre cualquier
  //     entrada marcada y el detalle de cliente deja de empujar su entrada en `/clients`;
  //   · el SENTINEL fuera de la regla 0 ⇒ `applyPanelView` le escribe encima, le borra la marca, su
  //     dueño no la reconoce, no la consume al expirar la ventana, y queda basura en la pila más un
  //     atrás muerto.
  // Una es ajena-absorbente y la otra es propia-informativa. Confundirlas es el error más fácil de
  // cometer en toda la fase.

  function montarPila(state: unknown) {
    const replaceState = vi.fn()
    const pushState = vi.fn()
    const back = vi.fn()
    vi.stubGlobal('window', {
      history: { state, replaceState, pushState, back },
      location: { pathname: '/clients', search: '' },
    })
    return { replaceState, pushState, back }
  }

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('el predicado reconoce la marca del sentinel, y SÓLO con el tipo que corresponde', () => {
    // El molde de los otros dos predicados: narrowing manual, sin `any`. `history.state` es
    // `unknown` de verdad — puede traer el state del router de Next, el de un overlay, el del
    // sentinel de cambios sin guardar, o `null`.
    expect(PH.isExitSentinelOwnedEntry({ frjExit: 1 })).toBe(true)
    expect(PH.isExitSentinelOwnedEntry({ frjExit: 7 })).toBe(true)
    for (const ajeno of [null, undefined, {}, 42, 'cualquier cosa', { frjExit: 'uno' }, { frjExit: null }]) {
      expect(PH.isExitSentinelOwnedEntry(ajeno)).toBe(false)
    }
  })

  it('las CUATRO formas de state siguen siendo disjuntas', () => {
    // Si el sentinel reusara cualquiera de las tres marcas que ya viven en la pila, el otro módulo
    // reconocería ESTA entrada como propia, haría su retroceso sobre ella y el dueño terminaría
    // fuera del sitio. Es el peor error posible del plan, y se niega acá en los cuatro sentidos.
    expect(PH.isExitSentinelOwnedEntry({ frjOverlay: 1 })).toBe(false)
    expect(PH.isExitSentinelOwnedEntry({ frjDirty: 1 })).toBe(false)
    expect(PH.isExitSentinelOwnedEntry({ frjView: 'c' })).toBe(false)
    expect(PH.isExitSentinelOwnedEntry({ frjUnder: MAS })).toBe(false)
    expect(isOverlayOwnedEntry({ frjExit: 1 })).toBe(false)
    expect(panelViewEntryParam({ frjExit: 1 })).toBeNull()
    expect(PH.panelUnderRoute({ frjExit: 1 })).toBeNull()
  })

  it('isForeignOwnedEntry SÍ reconoce el sentinel — y sigue NO reconociendo la marca de la rama', () => {
    // EL CASO CONTRAPUESTO, escrito en una sola aserción doble a propósito: la diferencia entre las
    // dos marcas tiene que quedar explícita y no perderse en un refactor.
    expect(PH.isForeignOwnedEntry({ frjExit: 1 })).toBe(true)
    expect(PH.isForeignOwnedEntry({ frjUnder: MAS })).toBe(false)
    // Y los dos dueños de siempre siguen reconocidos: se SUMÓ un dueño, no se reescribió el predicado.
    expect(PH.isForeignOwnedEntry({ frjOverlay: 1 })).toBe(true)
    expect(PH.isForeignOwnedEntry({ frjDirty: 1 })).toBe(true)
  })

  it('applyPanelView con el sentinel arriba NO HACE NADA (regla 0) y no escribe', () => {
    // Es lo que impide que la escritura del detalle de cliente le borre la marca al sentinel. La
    // escritura no se pierde: queda PENDIENTE y la aplica el efecto de reconciliación del
    // componente en cuanto el otro dueño suelta la entrada.
    const { pushState, replaceState, back } = montarPila({ frjExit: 1 })
    expect(PH.applyPanelView({ cause: 'user-open', param: 'c', from: null, to: 'abc' })).toBe('none')
    expect(pushState).not.toHaveBeenCalled()
    expect(replaceState).not.toHaveBeenCalled()
    expect(back).not.toHaveBeenCalled()
  })

  it('applyPanelUnder con el sentinel arriba tampoco escribe (la misma regla 0, repetida)', () => {
    const { replaceState } = montarPila({ frjExit: 1 })
    expect(PH.applyPanelUnder({ from: MAS, to: '/finances' })).toBe(false)
    expect(replaceState).not.toHaveBeenCalled()
  })

  it('los DOS retrocesos guardados se niegan SIN retroceder con el sentinel arriba', () => {
    // La guarda se repite en CADA punto de retroceso y no se confía en que ya se chequeó arriba
    // (cicatriz 2, ya sufrida tres veces en este repo): un retroceso sobre una entrada que no
    // empujamos nosotros expulsa al dueño del sitio.
    const { back } = montarPila({ frjExit: 1 })
    expect(consumeOwnedPanelEntry()).toBe(false)
    expect(PH.consumeOwnedBranchEntry()).toBe(false)
    expect(back).not.toHaveBeenCalled()
  })
})

describe('writePanelUnder — EL ÚNICO ESCRITOR de la marca, con la regla 0 y la idempotencia EN ORDEN', () => {
  // ⚠ POR QUÉ EXISTE UN ESCRITOR ÚNICO Y NO DOS CAMINOS DE ESCRITURA. Dos escritores con dos juegos
  // de guardas es cómo se pierde una de las dos sin que ningún gate lo vea: el día que aparezca un
  // cuarto dueño de historial se suma en uno y no en el otro, y el síntoma no es un error sino
  // BASURA EN LA PILA MÁS UN ATRÁS MUERTO. La UAT de la fase midió la otra mitad del mismo problema:
  // una marca escrita encima de una entrada que ya sabía la verdad (G-3).
  function montarPila(state: unknown) {
    const replaceState = vi.fn()
    const pushState = vi.fn()
    const back = vi.fn()
    vi.stubGlobal('window', { history: { state, replaceState, pushState, back } })
    return { replaceState, pushState, back }
  }

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sobre una entrada FRESCA escribe UNA vez, con DOS argumentos y objeto literal fresco', () => {
    // El caso del empuje del router: la entrada que el router acaba de crear nace SIN nuestra clave.
    // Sin el tercer argumento (la URL): con la URL, el parche de Next despacha la restauración y cada
    // navegación cuesta un commit extra.
    const { replaceState, pushState, back } = montarPila({ __NA: true })
    expect(PH.writePanelUnder(MAS)).toBe(true)
    expect(replaceState).toHaveBeenCalledTimes(1)
    expect(replaceState).toHaveBeenCalledWith({ frjUnder: MAS }, '')
    expect(replaceState.mock.calls[0]).toHaveLength(2)
    expect(pushState).not.toHaveBeenCalled()
    expect(back).not.toHaveBeenCalled()
  })

  it('con el state nulo también escribe: una entrada puede no tener state propio', () => {
    const { replaceState } = montarPila(null)
    expect(PH.writePanelUnder(PANEL_ROOT)).toBe(true)
    expect(replaceState).toHaveBeenCalledWith({ frjUnder: PANEL_ROOT }, '')
  })

  it('IDEMPOTENCIA — sobre una entrada que YA LLEVA la marca no escribe, y devuelve false', () => {
    // ⚠ LA ASIMETRÍA QUE HACE DE ESTO UN DISCRIMINADOR Y NO UNA OPTIMIZACIÓN: la entrada que el
    // router EMPUJA nace SIN nuestra clave, y una entrada a la que VOLVEMOS ya la trae. O sea que
    // "ya hay marca" significa, en la práctica, *estamos parados sobre una entrada que ya existía y
    // que ya sabe qué tiene debajo* — y escribirle encima es exactamente cómo se perdió la verdad que
    // el caso degenerado necesita (G-3 de la UAT).
    const { replaceState } = montarPila({ frjUnder: PANEL_ROOT })
    expect(PH.writePanelUnder(MAS)).toBe(false)
    expect(replaceState).not.toHaveBeenCalled()
  })

  it('la idempotencia es "ya hay marca", no "la misma marca": con OTRA ruta tampoco escribe', () => {
    // Si la guarda comparara rutas, un retroceso que revela una entrada marcada con una ruta DISTINTA
    // seguiría sobrescribiéndola — que es el bug entero, apenas más difícil de reproducir.
    const { replaceState } = montarPila({ frjUnder: '/appointments' })
    expect(PH.writePanelUnder('/agenda')).toBe(false)
    expect(replaceState).not.toHaveBeenCalled()
  })

  it('REGLA 0 — con una entrada de cada uno de los TRES otros dueños arriba no escribe', () => {
    for (const ajena of [{ frjOverlay: 1 }, { frjDirty: 1 }, { frjExit: 1 }]) {
      const { replaceState } = montarPila(ajena)
      expect(PH.writePanelUnder(MAS)).toBe(false)
      expect(replaceState).not.toHaveBeenCalled()
      vi.unstubAllGlobals()
    }
  })

  it('EL ORDEN — una entrada ajena que ADEMÁS lleva marca se niega igual (la regla 0 va primera)', () => {
    // El par contrapuesto de los dos casos de arriba, escrito adyacente a propósito: las dos guardas
    // devuelven lo mismo por motivos DISTINTOS, y un refactor que pierda una de las dos no puede
    // esconderse detrás de la otra.
    const { replaceState } = montarPila({ frjExit: 1, frjUnder: PANEL_ROOT })
    expect(PH.writePanelUnder(MAS)).toBe(false)
    expect(replaceState).not.toHaveBeenCalled()
  })

  it('escribe con la ruta QUE SE LE PASÓ, y no con ninguna derivada de nada', () => {
    // No recibe un par de rutas ni consulta la política: recibe LA RUTA A ANOTAR. Es lo que permite
    // que el colapso le pase la ruta que LEYÓ en la entrada de Más en vez de una derivación.
    const { replaceState } = montarPila({ __NA: true })
    expect(PH.writePanelUnder('/appointments')).toBe(true)
    expect(replaceState).toHaveBeenCalledWith({ frjUnder: '/appointments' }, '')
    expect(replaceState).not.toHaveBeenCalledWith({ frjUnder: MAS }, '')
  })
})

describe('applyPanelUnder — la escritura de la marca, después del commit y sin cambiar la URL', () => {
  function montarPila(state: unknown) {
    const replaceState = vi.fn()
    const pushState = vi.fn()
    const back = vi.fn()
    vi.stubGlobal('window', { history: { state, replaceState, pushState, back } })
    return { replaceState, pushState, back }
  }

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('saliendo de Más hacia una sección: escribe UNA vez, con DOS argumentos y sin retroceder', () => {
    const { replaceState, pushState, back } = montarPila({ __NA: true })
    expect(PH.applyPanelUnder({ from: MAS, to: '/finances' })).toBe(true)
    expect(replaceState).toHaveBeenCalledTimes(1)
    expect(replaceState).toHaveBeenCalledWith({ frjUnder: MAS }, '')
    // Sin el tercer argumento: con la URL, el parche de Next despacha la restauración y cada
    // navegación cuesta un commit.
    expect(replaceState.mock.calls[0]).toHaveLength(2)
    expect(pushState).not.toHaveBeenCalled()
    expect(back).not.toHaveBeenCalled()
  })

  it('cuando la política dice REEMPLAZAR no escribe nada: no hay nada nuevo debajo', () => {
    const { replaceState } = montarPila({ __NA: true })
    expect(PH.applyPanelUnder({ from: '/finances', to: '/clients' })).toBe(false)
    expect(replaceState).not.toHaveBeenCalled()
  })

  it('con una entrada de OTRO DUEÑO arriba no escribe nada (regla 0)', () => {
    for (const ajena of [{ frjOverlay: 1 }, { frjDirty: 1 }]) {
      const { replaceState } = montarPila(ajena)
      expect(PH.applyPanelUnder({ from: MAS, to: '/finances' })).toBe(false)
      expect(replaceState).not.toHaveBeenCalled()
      vi.unstubAllGlobals()
    }
  })

  it('la marca se escribe en TODA navegación que empuje, no sólo en las que salen de Más', () => {
    // El caso degenerado necesita la marca de la entrada de Más, y ésa se escribe cuando Más se
    // empuja DESDE una sección de la barra (o desde Inicio).
    const { replaceState } = montarPila({ __NA: true })
    expect(PH.applyPanelUnder({ from: PANEL_ROOT, to: '/clients' })).toBe(true)
    expect(replaceState).toHaveBeenCalledWith({ frjUnder: PANEL_ROOT }, '')
  })

  it('TAMPOCO escribe sobre una entrada que ya lleva marca: la idempotencia llega por DELEGACIÓN', () => {
    // No se repite la guarda acá: `applyPanelUnder` se queda con lo único que es suyo —preguntarle a
    // la política si la navegación EMPUJA— y delega la escritura y sus dos guardas en el escritor
    // único. Este caso es lo que fija que la delegación llegue hasta el final.
    const { replaceState } = montarPila({ frjUnder: PANEL_ROOT })
    expect(PH.applyPanelUnder({ from: MAS, to: '/finances' })).toBe(false)
    expect(replaceState).not.toHaveBeenCalled()
  })

  it('la política sigue siendo SUYA: con reemplazo no llama al escritor ni siquiera con entrada libre', () => {
    // El contrapuesto de la delegación: si `applyPanelUnder` delegara TODO y perdiera la pregunta de
    // política, una navegación que reemplaza anotaría una ruta de abajo que no cambió.
    const { replaceState } = montarPila(null)
    expect(PH.applyPanelUnder({ from: '/finances', to: '/clients' })).toBe(false)
    expect(replaceState).not.toHaveBeenCalled()
    // Y el mismo par de rutas, pero con la política diciendo empujar, SÍ escribe.
    expect(PH.applyPanelUnder({ from: PANEL_ROOT, to: '/clients' })).toBe(true)
  })

  it('CONTRAPUESTO v0.30 — la marca de la rama NO es "entrada ajena", así que el detalle de cliente sigue empujando', () => {
    // El error más fácil de cometer en toda la fase: meter la clave de la rama adentro del predicado
    // de la regla 0. Si entrara, `applyPanelView` se abstendría de escribir sobre CUALQUIER entrada
    // marcada — y como la marca se escribe en toda navegación del panel que empuje, el detalle de
    // cliente dejaría de empujar su entrada en `/clients`: una regresión de v0.30 que ningún otro
    // gate ve.
    expect(PH.isForeignOwnedEntry({ frjUnder: MAS })).toBe(false)
    // `applyPanelView` arma la URL, así que este caso necesita `location` además de `history`.
    const pushState = vi.fn()
    vi.stubGlobal('window', {
      history: { state: { frjUnder: MAS }, replaceState: vi.fn(), pushState, back: vi.fn() },
      location: { pathname: '/clients', search: '' },
    })
    expect(PH.applyPanelView({ cause: 'user-open', param: 'c', from: null, to: 'abc' })).toBe('push')
    expect(pushState).toHaveBeenCalledTimes(1)
  })
})

describe('panelBranchPlan — la decisión con el hecho, pura y sobre rutas', () => {
  it('REGLA 0 — sin el hecho devuelve lo de siempre y NUNCA un retroceso (la cicatriz 2)', () => {
    // El barrido que cierra T-03-05: 9 secciones de la rama de Más × los 5 destinos de la barra.
    for (const from of RAMA_DE_MAS) {
      for (const to of DESTINOS_BARRA_5) {
        const plan = PH.panelBranchPlan({ from, to, raizDebajo: false, masDebajo: false, vistaArriba: false, holdsExitSentinel: false })
        expect(plan).toBe(panelNavMode({ from, to }))
        expect(plan).not.toBe('up')
        expect(plan).not.toBe('collapse-then-replace')
      }
    }
  })

  it('con el hecho y destino MÁS ⇒ SUBIR un nivel (D-03), nunca reemplazar', () => {
    for (const from of RAMA_DE_MAS) {
      expect(PH.panelBranchPlan({ from, to: MAS, raizDebajo: false, masDebajo: true, vistaArriba: false, holdsExitSentinel: false })).toBe('up')
    }
  })

  it('con el hecho y un destino de la barra ⇒ COLAPSAR Y REEMPLAZAR (criterio 2)', () => {
    for (const from of RAMA_DE_MAS) {
      for (const to of DESTINOS_BARRA_4) {
        expect(PH.panelBranchPlan({ from, to, raizDebajo: false, masDebajo: true, vistaArriba: false, holdsExitSentinel: false })).toBe('collapse-then-replace')
      }
    }
  })

  it('from === to REEMPLAZA siempre, con marca y sin marca: la rama 1 sigue ganando', () => {
    // La cicatriz 1. Con el hecho, si la rama de Más se evaluara primero, `/mas → /mas` devolvería
    // SUBIR y el dueño se iría un escalón para abajo tocando la pantalla en la que ya está.
    for (const masDebajo of [true, false]) {
      expect(PH.panelBranchPlan({ from: MAS, to: MAS, raizDebajo: false, masDebajo, vistaArriba: false, holdsExitSentinel: false })).toBe('replace')
      expect(PH.panelBranchPlan({ from: '/finances', to: '/finances', raizDebajo: false, masDebajo, vistaArriba: false, holdsExitSentinel: false })).toBe('replace')
    }
  })

  it('ENTRADA DIRECTA — sin marca, /finances → /mas EMPUJA: es el candado de la cicatriz 2', () => {
    // El par de rutas es IDÉNTICO al de la pila `[Inicio, Más, Finanzas]`, donde subir es correcto.
    // Es el caso exacto que la marca existe para distinguir: sin ella, el retroceso expulsaría al
    // dueño del sitio (entró pegando la URL, F5, o el rebote del proxy después del login).
    expect(PH.panelBranchPlan({ from: '/finances', to: MAS, raizDebajo: false, masDebajo: false, vistaArriba: false, holdsExitSentinel: false })).toBe('push')
  })

  it('la ruta de Más y la raíz siguen siendo PARÁMETROS en la firma nueva', () => {
    expect(PH.panelBranchPlan({ from: '/x', to: '/y', more: '/y', raizDebajo: false, masDebajo: true, vistaArriba: false, holdsExitSentinel: false })).toBe('up')
    expect(PH.panelBranchPlan({ from: '/x', to: '/y', more: '/z', raizDebajo: false, masDebajo: true, vistaArriba: false, holdsExitSentinel: false })).toBe('collapse-then-replace')
    expect(PH.panelBranchPlan({ from: '/x', to: '/y', root: '/x', raizDebajo: false, masDebajo: false, vistaArriba: false, holdsExitSentinel: false })).toBe('push')
  })

  it('el tipo del plan tiene SIETE miembros: el quinto lo produce 03-03, el sexto 03-06 y el séptimo el 04-04', () => {
    // *Nada* se declara en el tipo aunque esta función todavía no lo devuelva: si un resultado
    // posible de la decisión de navegación viviera fuera del tipo, el chequeo de exhaustividad del
    // plan 03-04 no lo vería — la clase de hueco silencioso que esta fase cierra. Lo mismo vale para
    // el sexto, `consume-exit-then-navigate`, que el plan 03-06 agregó.
    // ⚠ 2026-11-17 (plan 04-04, decisión B1 del dueño): SEIS → SIETE A PROPÓSITO. El séptimo,
    // `consume-view-then-navigate`, consume NUESTRA subsección de arriba (un tab o la ficha `?c=`) y
    // recién entonces decide con la pila real: es el hueco de composición medido en el 04-03 (§(e) de
    // `.planning/debug/tabs-en-la-url-medida.md`), no un segundo dialecto de un mecanismo existente.
    const MIEMBROS: PH.PanelBranchPlan[] = [
      'push',
      'replace',
      'up',
      'collapse-then-replace',
      'consume-exit-then-navigate',
      'consume-view-then-navigate',
      'none',
    ]
    expect(new Set(MIEMBROS).size).toBe(7)
    // Y los dos primeros son, literalmente, los de `PanelNavMode`: la decisión EXTIENDE la política
    // en vez de reemplazarla.
    expect(MIEMBROS.slice(0, 2).sort()).toEqual(
      [panelNavMode({ from: PANEL_ROOT, to: '/clients' }), panelNavMode({ from: '/finances', to: '/clients' })].sort()
    )
  })
})

describe('panelBranchPlan — el invariante, simulado sobre la pila del navegador', () => {
  /**
   * La pila que produce la política CON la marca. El último es el actual.
   *
   * Los DOS hechos salen de comparar la entrada inmediatamente inferior contra la ruta de Más y
   * contra la raíz, que es
   * exactamente lo que la marca guarda (el `from` de la navegación que empujó esta entrada).
   *
   * Los dos modos nuevos: SUBIR quita la entrada de arriba; COLAPSAR quita la de arriba y después
   * decide el segundo paso contra lo que quedó debajo de Más — si coincide con el destino, retrocede
   * una segunda vez SIN navegar (el degenerado, medido en E-5); si no, reemplaza.
   */
  function navegarRama(pila: string[], to: string): string[] {
    const from = pila[pila.length - 1]
    const debajo = pila.length > 1 ? pila[pila.length - 2] : null
    // ⚠ Los DOS hechos salen de la MISMA entrada inmediatamente inferior, que es exactamente lo que
    // la marca guarda. El nuevo se computa como *la marca DICE la raíz*, igual que el de la rama se
    // computa como *la marca DICE Más*: la misma forma, por el mismo motivo.
    const plan = PH.panelBranchPlan({
      from,
      to,
      raizDebajo: debajo === PANEL_ROOT,
      masDebajo: debajo === MAS,
      vistaArriba: false,
      holdsExitSentinel: false,
    })
    if (plan === 'push') return [...pila, to]
    if (plan === 'replace') return [...pila.slice(0, -1), to]
    if (plan === 'none') return pila
    if (plan === 'up') return pila.slice(0, -1)
    const sobreMas = pila.slice(0, -1)
    const debajoDeMas = sobreMas.length > 1 ? sobreMas[sobreMas.length - 2] : null
    if (debajoDeMas === to) return sobreMas.slice(0, -1)
    return [...sobreMas.slice(0, -1), to]
  }

  /**
   * La pila que producía la política **ANTES** de la regla de G2-1: el hecho nuevo siempre en falso.
   * Existe para que el **número del bug** quede en la suite y nadie lo "simplifique" de vuelta.
   */
  function navegarRamaVieja(pila: string[], to: string): string[] {
    const from = pila[pila.length - 1]
    const debajo = pila.length > 1 ? pila[pila.length - 2] : null
    const plan = PH.panelBranchPlan({
      from,
      to,
      raizDebajo: false,
      masDebajo: debajo === MAS,
      vistaArriba: false,
      holdsExitSentinel: false,
    })
    if (plan === 'push') return [...pila, to]
    if (plan === 'replace') return [...pila.slice(0, -1), to]
    if (plan === 'none') return pila
    if (plan === 'up') return pila.slice(0, -1)
    const sobreMas = pila.slice(0, -1)
    const debajoDeMas = sobreMas.length > 1 ? sobreMas[sobreMas.length - 2] : null
    if (debajoDeMas === to) return sobreMas.slice(0, -1)
    return [...sobreMas.slice(0, -1), to]
  }

  function atras(pila: string[]): string | null {
    return pila.length > 1 ? pila[pila.length - 2] : null
  }

  /** ¿Hay dos entradas idénticas pegadas? Eso es un atrás que no hace nada visible (cicatriz 1). */
  function hayIdenticasAdyacentes(pila: string[]): boolean {
    return pila.some((ruta, i) => i > 0 && pila[i - 1] === ruta)
  }

  it('Inicio → Más → Finanzas → Más deja la pila en [Inicio, Más] (D-03)', () => {
    let pila = navegarRama(navegarRama([PANEL_ROOT], MAS), '/finances')
    expect(pila).toEqual([PANEL_ROOT, MAS, '/finances'])
    pila = navegarRama(pila, MAS)
    expect(pila).toEqual([PANEL_ROOT, MAS])
    expect(hayIdenticasAdyacentes(pila)).toBe(false)
    expect(atras(pila)).toBe(PANEL_ROOT)
  })

  it('Inicio → Más → Finanzas → Clientes: la pila queda [Inicio, Clientes] y el atrás cae en Inicio', () => {
    let pila = navegarRama(navegarRama([PANEL_ROOT], MAS), '/finances')
    pila = navegarRama(pila, '/clients')
    expect(pila).toEqual([PANEL_ROOT, '/clients'])
    expect(atras(pila)).toBe(PANEL_ROOT)
  })

  it('Inicio → Turnos → Más → Finanzas → Clientes: /mas NO queda debajo y el atrás cae en Turnos', () => {
    // El invariante REFORMULADO que D-02 permite: en la pila de tres escalones el atrás devuelve la
    // sección de la barra desde la que se abrió Más, que es el mismo principio con el que el dueño
    // resolvió D-02 (el atrás deshace el último movimiento).
    let pila = navegarRama(navegarRama([PANEL_ROOT], '/appointments'), MAS)
    pila = navegarRama(pila, '/finances')
    expect(pila).toEqual([PANEL_ROOT, '/appointments', MAS, '/finances'])
    pila = navegarRama(pila, '/clients')
    expect(pila).toEqual([PANEL_ROOT, '/appointments', '/clients'])
    expect(atras(pila)).toBe('/appointments')
    expect(atras(pila)).not.toBe(MAS)
  })

  it('EL DEGENERADO — Inicio → Turnos → Más → Finanzas → Turnos no deja dos entradas idénticas', () => {
    // Reemplazar acá dejaría `[…, Turnos, Turnos]`, que es literalmente lo que el criterio 2
    // prohíbe. Se consume DOS VECES y no se navega (medido en E-5).
    let pila = navegarRama(navegarRama([PANEL_ROOT], '/appointments'), MAS)
    pila = navegarRama(pila, '/finances')
    pila = navegarRama(pila, '/appointments')
    expect(hayIdenticasAdyacentes(pila)).toBe(false)
    expect(pila[pila.length - 1]).toBe('/appointments')
    expect(pila).toEqual([PANEL_ROOT, '/appointments'])
  })

  it('INVARIANTE BARRIDO — 9 secciones × 4 destinos, en las pilas de dos y de tres escalones', () => {
    for (const seccion of RAMA_DE_MAS) {
      const pilas = [
        navegarRama(navegarRama([PANEL_ROOT], MAS), seccion),
        navegarRama(navegarRama(navegarRama([PANEL_ROOT], '/appointments'), MAS), seccion),
      ]
      for (const inicial of pilas) {
        for (const destino of DESTINOS_BARRA_4) {
          const pila = navegarRama(inicial, destino)
          // (a) `/mas` NO queda inmediatamente debajo del destino.
          expect(atras(pila)).not.toBe(MAS)
          // (b) y nunca hay dos entradas idénticas adyacentes.
          expect(hayIdenticasAdyacentes(pila)).toBe(false)
        }
      }
    }
  })

  it('G2-1 — el ciclo Inicio↔sección repetido TRES veces deja la MISMA profundidad', () => {
    // El caso con el nombre propio del gap. Lo que el dueño midió en el teléfono: el ciclo hacía
    // crecer la pila y, de paso, cada entrada de Inicio alcanzada por el empuje quedaba marcada con
    // la sección que quedó debajo ⇒ la séptima regla del armado decía *no armar* ⇒ el aviso de
    // salida nunca aparecía. Medido como número en E-14.
    let pila = [PANEL_ROOT]
    const profundidades: number[] = []
    for (let vuelta = 1; vuelta <= 3; vuelta++) {
      pila = navegarRama(pila, '/clients')
      expect(pila).toEqual([PANEL_ROOT, '/clients'])
      pila = navegarRama(pila, PANEL_ROOT)
      profundidades.push(pila.length)
    }
    // La corrección: tocar Inicio CONSUME la entrada de la sección, así que el dueño vuelve a la
    // entrada ORIGINAL de Inicio y la pila se queda en UN escalón, las tres vueltas.
    expect(profundidades).toEqual([1, 1, 1])
    expect(pila).toEqual([PANEL_ROOT])
    expect(hayIdenticasAdyacentes(pila)).toBe(false)
  })

  it('G2-1 — su GEMELO: con la regla vieja la pila crecía DOS entradas por vuelta, SIN TECHO', () => {
    // El número del bug, en la suite, para que nadie "simplifique" esto de vuelta. Con el hecho
    // nuevo en falso el gesto EMPUJA, y el ciclo suma dos entradas por vuelta: 3 → 5 → 7.
    let pila = [PANEL_ROOT]
    const profundidades: number[] = []
    for (let vuelta = 1; vuelta <= 3; vuelta++) {
      pila = navegarRamaVieja(pila, '/clients')
      pila = navegarRamaVieja(pila, PANEL_ROOT)
      profundidades.push(pila.length)
    }
    expect(profundidades).toEqual([3, 5, 7])
    expect(profundidades[1] - profundidades[0]).toBe(2)
    expect(profundidades[2] - profundidades[1]).toBe(2)
  })

  it('Más → Inicio deja la pila en UN escalón (la consecuencia DECLARADA de G2-1)', () => {
    // ⚠ LA CONSECUENCIA BUSCADA, y hay que declararla porque ningún gate la puede avisar: tocar
    // Inicio desde Más es ahora el retroceso que CONSUME la entrada de Más, así que el dueño queda
    // en Inicio sin nada nuestro debajo ⇒ el sentinel se arma y el atrás AVISA en vez de volver a
    // Más. Es lo que el dueño pidió en G2-1 y decidió el 2026-10-27 (`03-DECISION-UAT-2.md`): no
    // contradice la decisión (a) —sigue siendo *armar sólo si no hay nada nuestro debajo*—, lo que
    // cambió es la PILA que esa regla lee.
    const pila = navegarRama(navegarRama([PANEL_ROOT], MAS), PANEL_ROOT)
    expect(pila).toEqual([PANEL_ROOT])
    expect(atras(pila)).toBeNull()
  })

  it('EL LÍMITE DECLARADO — en la pila de TRES escalones de D-02 tocar Inicio SIGUE empujando', () => {
    // Si la raíz NO es la entrada inmediatamente de abajo (la pila de tres escalones que D-02 acepta
    // a propósito), un retroceso de un paso aterrizaría en TURNOS y no en Inicio ⇒ la regla no se
    // dispara y el gesto sigue empujando. El atrás desde ahí hace algo VISIBLE (vuelve a Más), que
    // es el invariante del criterio 2. Medido en E-16 mitad B.
    let pila = navegarRama(navegarRama([PANEL_ROOT], '/appointments'), MAS)
    expect(pila).toEqual([PANEL_ROOT, '/appointments', MAS])
    pila = navegarRama(pila, PANEL_ROOT)
    expect(pila).toEqual([PANEL_ROOT, '/appointments', MAS, PANEL_ROOT])
    expect(atras(pila)).toBe(MAS)
    expect(hayIdenticasAdyacentes(pila)).toBe(false)
  })

  it('criterio 6 — con los 14 destinos del sidebar la decisión devuelve lo MISMO que panelNavMode', () => {
    // Desktop no se entera POR CONSTRUCCIÓN: `masDebajo` se computa comparando la marca contra la
    // ruta de Más, y en desktop nada navega a Más ⇒ la marca nunca dice Más ⇒ `masDebajo` es
    // siempre falso. Sin un chequeo de viewport en el medio.
    const DESTINOS_SIDEBAR = [
      '/dashboard', '/appointments', '/agenda', '/abonos', '/negocio', '/web', '/servicios',
      '/equipo', '/consultorios', '/clients', '/clients', '/finances', '/settings', '/ayuda',
    ]
    expect(DESTINOS_SIDEBAR).toHaveLength(14)
    for (const from of DESTINOS_SIDEBAR) {
      expect(from).not.toBe(PH.PANEL_MORE)
      for (const to of DESTINOS_SIDEBAR) {
        expect(PH.panelBranchPlan({ from, to, raizDebajo: false, masDebajo: false, vistaArriba: false, holdsExitSentinel: false })).toBe(panelNavMode({ from, to }))
      }
    }
  })

  it('criterio 6 ENMENDADO (2026-10-27) — con el hecho nuevo el ÚNICO par que difiere es el de la raíz', () => {
    // ⚠ EL RESIDUO DE ESCRITORIO, DECLARADO ACÁ EN VEZ DE DESCUBIERTO EN LA PRÓXIMA UAT. Es una
    // revisión ACOTADA del criterio 6 con fecha 2026-10-27, no una renuncia. El criterio 6 ya no se
    // sostiene *por construcción* a través del hecho —en escritorio la marca SÍ puede decir la
    // raíz—: se sostiene porque la barra inferior se oculta a ≥1024px (sus links no se pueden tocar,
    // así que su `handleNavigate` nunca corre) y porque el guard sólo computa un plan cuando la
    // pantalla está SUCIA. ⇒ el residuo es UN SOLO CASO: salir de una pantalla con cambios sin
    // guardar hacia Inicio desde el sidebar, donde el atrás queda un escalón más corto.
    // Y la frase que cierra la puerta: eso NO se tapa preguntándole el ancho a la pantalla, porque
    // gatear esta política por tamaño es exactamente lo que NAV-05 y el criterio 6 prohíben.
    const DESTINOS_SIDEBAR = [
      '/dashboard', '/appointments', '/agenda', '/abonos', '/negocio', '/web', '/servicios',
      '/equipo', '/consultorios', '/clients', '/clients', '/finances', '/settings', '/ayuda',
    ]
    let difieren = 0
    for (const from of DESTINOS_SIDEBAR) {
      for (const to of DESTINOS_SIDEBAR) {
        const conElHecho = PH.panelBranchPlan({ from, to, raizDebajo: true, masDebajo: false, vistaArriba: false, holdsExitSentinel: false })
        const deLaPolitica = panelNavMode({ from, to })
        if (to === PANEL_ROOT && from !== to) {
          expect(conElHecho).toBe('up')
          expect(conElHecho).not.toBe(deLaPolitica)
          difieren++
        } else {
          expect(conElHecho).toBe(deLaPolitica)
        }
      }
    }
    // 13 pares: los 13 `from` distintos de la raíz (con `/clients` contado dos veces, porque son dos
    // entradas del sidebar que apuntan a la misma ruta en salud y en el resto).
    expect(difieren).toBe(13)
  })
})

// ── Plan 03-06 / Task 3 — EL SEXTO MIEMBRO: consumir el sentinel y recién entonces navegar ───────
//
// ⚠ POR QUÉ ESTE MIEMBRO EXISTE, y es la causa MEDIDA de G-1 y G-2. La entrada del sentinel de
// salida es **absorbente**: se empujó para consumirla. Si el dueño navega con ella arriba —la forma
// vieja, que empuja el destino encima— queda **ENTERRADA** en el camino del atrás, y entonces el
// atrás aterriza en una entrada de la raíz **con hash** (`/dashboard#salir`) que en pantalla se ve
// **igual que Inicio**, con un atrás siguiente que no hace **nada visible**: el atrás muerto que el
// criterio 2 prohíbe explícitamente. La UAT lo midió literalmente —*recarga y vuelve a
// `dashboard#salir-3`*, *a la primera que toco atrás no hace nada*— y está medido en los escenarios
// **E-9** y **E-12** de `.planning/debug/pila-de-dos-niveles-medida.md`.
//
// ⚠ Y POR QUÉ VA ANTES DE LA REGLA 0: ahí el hecho de la rama es **falso**, así que la decisión
// caería en **empujar** y el sentinel quedaría enterrado — que es justo el bug.

describe('panelBranchPlan — el SEXTO miembro: consumir el sentinel y navegar (G-1 / G-2)', () => {
  it('LOS TRES HECHOS JUNTOS — sentinel arriba, en la RAÍZ, y un destino DISTINTO ⇒ consumir y navegar', () => {
    for (const to of DESTINOS_BARRA_4.filter((r) => r !== PANEL_ROOT).concat([MAS])) {
      expect(
        PH.panelBranchPlan({ from: PANEL_ROOT, to, raizDebajo: false, masDebajo: false, vistaArriba: false, holdsExitSentinel: true })
      ).toBe('consume-exit-then-navigate')
    }
  })

  it('VA ANTES DE LA REGLA 0: se produce con el hecho de la rama en falso Y en verdadero', () => {
    // Si viviera DESPUÉS de la regla 0, con el hecho de la rama falso la decisión caería en empujar
    // y el sentinel quedaría enterrado: el bug exacto.
    for (const masDebajo of [false, true]) {
      expect(
        PH.panelBranchPlan({ from: PANEL_ROOT, to: '/clients', raizDebajo: false, masDebajo, vistaArriba: false, holdsExitSentinel: true })
      ).toBe('consume-exit-then-navigate')
    }
  })

  it('NEGATIVO 1 — sin el sentinel arriba NO se produce, para ningún par', () => {
    for (const from of [...RAMA_DE_MAS, PANEL_ROOT]) {
      for (const to of DESTINOS_BARRA_5) {
        for (const masDebajo of [false, true]) {
          expect(
            PH.panelBranchPlan({ from, to, raizDebajo: false, masDebajo, vistaArriba: false, holdsExitSentinel: false })
          ).not.toBe('consume-exit-then-navigate')
        }
      }
    }
  })

  it('NEGATIVO 2 — FUERA de la raíz no se produce, aunque el sentinel esté arriba', () => {
    // Consumir el sentinel estando en una sección sería retroceder sobre una entrada que no es la
    // que creemos: el sentinel es de la raíz y sólo de la raíz.
    for (const from of RAMA_DE_MAS) {
      for (const to of DESTINOS_BARRA_5) {
        for (const masDebajo of [false, true]) {
          expect(
            PH.panelBranchPlan({ from, to, raizDebajo: false, masDebajo, vistaArriba: false, holdsExitSentinel: true })
          ).not.toBe('consume-exit-then-navigate')
        }
      }
    }
  })

  it('NEGATIVO 3 — destino IGUAL a la ruta actual sigue dando NADA: la regla -1 gana', () => {
    // La regla que ya existía va primero y no cambia: el dueño ya está en la pantalla que tocó.
    for (const masDebajo of [false, true]) {
      expect(
        PH.panelBranchPlan({ from: PANEL_ROOT, to: PANEL_ROOT, raizDebajo: false, masDebajo, vistaArriba: false, holdsExitSentinel: true })
      ).toBe('none')
    }
  })

  it('NO REGRESIÓN — sin el sentinel arriba, o fuera de la raíz, cada par da EXACTAMENTE lo de antes', () => {
    // El barrido que fija que el miembro nuevo no se cuela en ninguna rama vieja.
    for (const from of [...RAMA_DE_MAS, PANEL_ROOT]) {
      for (const to of DESTINOS_BARRA_5) {
        for (const masDebajo of [false, true]) {
          const sinSentinel = PH.panelBranchPlan({ from, to, raizDebajo: false, masDebajo, vistaArriba: false, holdsExitSentinel: false })
          const conSentinel = PH.panelBranchPlan({ from, to, raizDebajo: false, masDebajo, vistaArriba: false, holdsExitSentinel: true })
          if (from === to) {
            expect(conSentinel).toBe('none')
          } else if (from === PANEL_ROOT) {
            expect(conSentinel).toBe('consume-exit-then-navigate')
          } else {
            expect(conSentinel).toBe(sinSentinel)
          }
        }
      }
    }
  })

  it('la RAÍZ sigue siendo un PARÁMETRO: la regla nueva se mide contra `root`, no contra un literal', () => {
    expect(
      PH.panelBranchPlan({ from: '/x', to: '/y', root: '/x', raizDebajo: false, masDebajo: false, vistaArriba: false, holdsExitSentinel: true })
    ).toBe('consume-exit-then-navigate')
    expect(
      PH.panelBranchPlan({ from: '/x', to: '/y', root: '/z', raizDebajo: false, masDebajo: false, vistaArriba: false, holdsExitSentinel: true })
    ).not.toBe('consume-exit-then-navigate')
  })

  it('el sexto miembro ENTRA EN EL TIPO y NO es un modo de rutas: la decisión EXTIENDE la política', () => {
    // Entra EN EL TIPO, no al lado: si viviera afuera, el chequeo de exhaustividad del provider del
    // guard de cambios sin guardar NO LO VERÍA y la salida caería por un camino por defecto que
    // nadie eligió — exactamente la clase de hueco silencioso que esta fase vino a cerrar.
    const sexto: PH.PanelBranchPlan = 'consume-exit-then-navigate'
    // Y no es uno de los dos modos de rutas: ningún par de rutas lo puede producir, sólo la decisión
    // de la rama con sus tres hechos.
    for (const from of [...RAMA_DE_MAS, PANEL_ROOT]) {
      for (const to of DESTINOS_BARRA_5) {
        expect(panelNavMode({ from, to })).not.toBe(sexto)
      }
    }
    expect(['push', 'replace', 'up', 'collapse-then-replace', 'none']).not.toContain(sexto)
  })
})

// ── Plan 03-09 — LA REGLA DE G2-1: sección → raíz es un RETROCESO, no un empuje ──────────────────
//
// ⚠ POR QUÉ ESTA REGLA EXISTE, y es la cadena MEDIDA de cuatro pasos de `03-UAT-2.md`. Con el
// empuje de hoy (`panelNavMode` dice `to === root ⇒ push`) el ciclo Inicio↔sección hace crecer la
// pila DOS entradas por ciclo SIN TECHO, y cada entrada de Inicio alcanzada así queda marcada con la
// sección que quedó debajo ⇒ la SÉPTIMA regla del armado (`algoNuestroDebajo`) dice *no armar* ⇒ el
// aviso de salida NUNCA aparece. Textual del dueño: *"al tocar inicio después de haber hecho otras
// cosas cae a /dashboard y la guarda de salir no está"*. Medido en E-14.
//
// ⚠ Y POR QUÉ CIERRA LAS DOS MITADES DE UNA: con el retroceso el dueño aterriza en la entrada
// ORIGINAL de Inicio, que no tiene nada nuestro debajo, así que el aviso SE ARMA SOLO — sin tocar
// ninguna de las siete reglas del armado. Lo que cambió es la PILA que esas reglas leen.

describe('panelBranchPlan — LA REGLA DE G2-1: sección → raíz es un RETROCESO', () => {
  /** Las cuatro secciones de la barra que no son Más, más las nueve de la rama. */
  const DESDE = [...RAMA_DE_MAS, '/appointments', '/agenda', '/clients']

  it('CON EL HECHO y destino la RAÍZ viniendo de otra ruta ⇒ el RETROCESO guardado de un paso', () => {
    // La corrección de G2-1. Devuelve el miembro que YA existe (`up` es el retroceso guardado de un
    // paso, con sus dos guardas en `consumeOwnedBranchEntry`): NO hay miembro nuevo.
    for (const from of DESDE) {
      expect(
        PH.panelBranchPlan({ from, to: PANEL_ROOT, raizDebajo: true, masDebajo: false, vistaArriba: false, holdsExitSentinel: false })
      ).toBe('up')
    }
  })

  it('SIN EL HECHO ⇒ exactamente lo de hoy, destino por destino, y JAMÁS un retroceso', () => {
    // La cicatriz 2 y la degradación segura de toda la fase: sin la marca no se sabe qué hay debajo,
    // y un retroceso sobre una entrada que no empujamos nosotros EXPULSA AL DUEÑO DEL SITIO. El peor
    // caso de una marca perdida es una pila un escalón más larga. Medido en E-16 mitad A.
    for (const from of [...DESDE, PANEL_ROOT]) {
      for (const to of DESTINOS_BARRA_5) {
        const plan = PH.panelBranchPlan({ from, to, raizDebajo: false, masDebajo: false, vistaArriba: false, holdsExitSentinel: false })
        expect(plan).toBe(panelNavMode({ from, to }))
        expect(plan).not.toBe('up')
      }
    }
  })

  it('CON EL HECHO pero el destino NO es la raíz ⇒ lo de hoy, intacto', () => {
    for (const from of DESDE) {
      for (const to of DESTINOS_BARRA_5.filter((r) => r !== PANEL_ROOT)) {
        expect(
          PH.panelBranchPlan({ from, to, raizDebajo: true, masDebajo: false, vistaArriba: false, holdsExitSentinel: false })
        ).toBe(panelNavMode({ from, to }))
      }
    }
  })

  it('CON EL HECHO pero VINIENDO de la raíz (destino = la ruta actual) ⇒ lo de hoy: la cicatriz 1 gana', () => {
    // La regla se escribe con `from !== to` EXPLÍCITO aunque la regla 1 ya lo ataje, igual que la del
    // sentinel en la raíz, para que una regla metida en el medio no le cambie el significado.
    for (const masDebajo of [true, false]) {
      expect(
        PH.panelBranchPlan({ from: PANEL_ROOT, to: PANEL_ROOT, raizDebajo: true, masDebajo, vistaArriba: false, holdsExitSentinel: false })
      ).toBe('replace')
    }
  })

  it('CONTRAPUESTO — la marca que dice MÁS no dispara la regla nueva: el COLAPSO sigue ganando', () => {
    // Dentro de la rama de Más el hecho nuevo es falso POR CONSTRUCCIÓN (la marca dice Más, no la
    // raíz), así que el cruce lo sigue resolviendo el colapso — incluido su caso degenerado, que lo
    // decide el segundo paso del ejecutor. Medido en E-15 mitad B.
    for (const from of RAMA_DE_MAS) {
      expect(
        PH.panelBranchPlan({ from, to: PANEL_ROOT, raizDebajo: false, masDebajo: true, vistaArriba: false, holdsExitSentinel: false })
      ).toBe('collapse-then-replace')
      // Y el par contrapuesto, ADYACENTE para que un refactor no pierda la diferencia.
      expect(
        PH.panelBranchPlan({ from, to: PANEL_ROOT, raizDebajo: true, masDebajo: false, vistaArriba: false, holdsExitSentinel: false })
      ).toBe('up')
    }
  })

  it('CONTRAPUESTO — el SENTINEL sigue mandando primero, aunque el hecho nuevo sea verdadero', () => {
    // Con el sentinel arriba y un destino distinto el gesto YA tiene dueño: consumir el sentinel y
    // recién entonces navegar. Por eso la regla nueva va DESPUÉS de la -1b.
    expect(
      PH.panelBranchPlan({ from: PANEL_ROOT, to: '/clients', raizDebajo: true, masDebajo: false, vistaArriba: false, holdsExitSentinel: true })
    ).toBe('consume-exit-then-navigate')
    // Y con el destino igual a la ruta actual sigue siendo NADA (la regla -1).
    expect(
      PH.panelBranchPlan({ from: PANEL_ROOT, to: PANEL_ROOT, raizDebajo: true, masDebajo: false, vistaArriba: false, holdsExitSentinel: true })
    ).toBe('none')
    // El par contrapuesto, adyacente: sin el sentinel arriba, el mismo gesto es el retroceso.
    expect(
      PH.panelBranchPlan({ from: '/clients', to: PANEL_ROOT, raizDebajo: true, masDebajo: false, vistaArriba: false, holdsExitSentinel: false })
    ).toBe('up')
  })

  it('EL ORDEN — la regla va ANTES de la que dice *sin el hecho de la rama no se retrocede*', () => {
    // El caso que SÓLO puede pasar si el orden es ése: hecho de la rama FALSO, hecho nuevo
    // VERDADERO, destino la raíz. Con el orden invertido la decisión caería en la regla 0 y
    // devolvería EMPUJAR — que es literalmente el bug de G2-1.
    const plan = PH.panelBranchPlan({ from: '/clients', to: PANEL_ROOT, raizDebajo: true, masDebajo: false, vistaArriba: false, holdsExitSentinel: false })
    expect(plan).toBe('up')
    expect(plan).not.toBe(panelNavMode({ from: '/clients', to: PANEL_ROOT }))
    expect(panelNavMode({ from: '/clients', to: PANEL_ROOT })).toBe('push')
  })

  it('la RAÍZ sigue siendo un PARÁMETRO: la regla se mide contra `root`, no contra un literal', () => {
    expect(
      PH.panelBranchPlan({ from: '/x', to: '/y', root: '/y', raizDebajo: true, masDebajo: false, vistaArriba: false, holdsExitSentinel: false })
    ).toBe('up')
    expect(
      PH.panelBranchPlan({ from: '/x', to: '/y', root: '/z', raizDebajo: true, masDebajo: false, vistaArriba: false, holdsExitSentinel: false })
    ).not.toBe('up')
  })

  it('NO REGRESIÓN — barrido 13 × 5 × 2: con el hecho nuevo cambia SÓLO el destino raíz', () => {
    for (const from of [...DESDE, PANEL_ROOT]) {
      for (const to of DESTINOS_BARRA_5) {
        for (const masDebajo of [false, true]) {
          const sinElHecho = PH.panelBranchPlan({ from, to, raizDebajo: false, masDebajo, vistaArriba: false, holdsExitSentinel: false })
          const conElHecho = PH.panelBranchPlan({ from, to, raizDebajo: true, masDebajo, vistaArriba: false, holdsExitSentinel: false })
          if (to === PANEL_ROOT && from !== to) {
            expect(conElHecho).toBe('up')
          } else {
            expect(conElHecho).toBe(sinElHecho)
          }
        }
      }
    }
  })

  it('G2-1 NO agregó miembro: el conjunto del plan de rama es de SIETE desde el 04-04, no por esta regla', () => {
    // `up` YA ES el retroceso guardado de un paso, con sus dos guardas. Un séptimo miembro para el
    // mismo mecanismo obligaría a tocar el `switch` exhaustivo del guard y dejaría a los DOS
    // consumidores en dos dialectos del mismo mecanismo — el segundo dialecto que NAV-05 evita.
    // ⚠ 2026-11-17 (plan 04-04, decisión B1 del dueño): la cuenta pasa de SEIS a SIETE A PROPÓSITO, y
    // no por esta regla: el séptimo (`consume-view-then-navigate`) es un mecanismo DISTINTO —consumir
    // una subsección propia y re-decidir—, y esta regla sigue produciendo `up`, como afirma abajo.
    const MIEMBROS: PH.PanelBranchPlan[] = [
      'push',
      'replace',
      'up',
      'collapse-then-replace',
      'consume-exit-then-navigate',
      'consume-view-then-navigate',
      'none',
    ]
    expect(new Set(MIEMBROS).size).toBe(7)
    expect(MIEMBROS).toContain(
      PH.panelBranchPlan({ from: '/clients', to: PANEL_ROOT, raizDebajo: true, masDebajo: false, vistaArriba: false, holdsExitSentinel: false })
    )
  })
})

// ── Plan 04-04 — B1: con una subsección NUESTRA arriba, el gesto la CONSUME y recién después decide ──
//
// ⚠ POR QUÉ EXISTE, y está MEDIDO, no derivado: el 04-03 midió en la app real que con un tab o una ficha
// `?c=` arriba la entrada de arriba lleva `{ frjView }` SIN `frjUnder`, así que `masDebajo` y `raizDebajo`
// dan falso POR CONSTRUCCIÓN y la regla 0 devuelve lo de `panelNavMode`: Inicio se apila sobre el tab y el
// aviso de salida no se arma (el síntoma de G2-1 por otro camino), Turnos deja dos escalones de más y Más
// se apila en vez de subir (§(e) de `.planning/debug/tabs-en-la-url-medida.md`). La decisión del dueño
// (B1, 2026-11-17) es que el gesto termine IGUAL que sin la subsección: consumirla primero y re-decidir.

describe('panelBranchPlan — el SÉPTIMO miembro: consumir la subsección y re-decidir (B1, plan 04-04)', () => {
  /** Las secciones con subsección propia (tabs) y la de la ficha, más el resto de la rama. */
  const DESDE = [...RAMA_DE_MAS, '/appointments', '/agenda', '/clients']

  it('CON la subsección arriba y un destino DISTINTO ⇒ consumirla, para los cinco destinos de la barra', () => {
    for (const from of DESDE) {
      for (const to of DESTINOS_BARRA_5) {
        if (from === to) continue
        expect(
          PH.panelBranchPlan({ from, to, raizDebajo: false, masDebajo: false, vistaArriba: true, holdsExitSentinel: false })
        ).toBe('consume-view-then-navigate')
      }
    }
  })

  it('CON la subsección arriba y el destino IGUAL a la ruta actual ⇒ lo de la regla de rutas (es de NAV-08)', () => {
    // Tocar la sección en la que ya estás con un tab abierto lo resuelve NAV-08 ANTES, en el
    // `onNavigate` del menú (`consumeOwnedPanelEntry`). Si llegara acá, lo de siempre: la cicatriz 1.
    for (const from of [...DESDE, PANEL_ROOT]) {
      expect(
        PH.panelBranchPlan({ from, to: from, raizDebajo: false, masDebajo: false, vistaArriba: true, holdsExitSentinel: false })
      ).toBe(panelNavMode({ from, to: from }))
    }
  })

  it('SIN la subsección arriba ⇒ el barrido de la regla 0 SIN CAMBIOS, y jamás el miembro nuevo', () => {
    for (const from of [...DESDE, PANEL_ROOT]) {
      for (const to of DESTINOS_BARRA_5) {
        for (const masDebajo of [false, true]) {
          for (const raizDebajo of [false, true]) {
            const plan = PH.panelBranchPlan({ from, to, raizDebajo, masDebajo, vistaArriba: false, holdsExitSentinel: false })
            expect(plan).not.toBe('consume-view-then-navigate')
          }
        }
        expect(
          PH.panelBranchPlan({ from, to, raizDebajo: false, masDebajo: false, vistaArriba: false, holdsExitSentinel: false })
        ).toBe(panelNavMode({ from, to }))
      }
    }
  })

  it('EL ORDEN — gana a la -1c y a la regla 0 cuando el hecho es verdadero', () => {
    // Con la subsección arriba los otros hechos son falsos por construcción; se los pone en verdadero
    // A PROPÓSITO para fijar el orden: la regla nueva va ANTES de la -1c (que daría `up`) y de la regla
    // 0/la rama (que darían el modo de rutas o el colapso).
    expect(
      PH.panelBranchPlan({ from: '/clients', to: PANEL_ROOT, raizDebajo: true, masDebajo: false, vistaArriba: true, holdsExitSentinel: false })
    ).toBe('consume-view-then-navigate')
    expect(
      PH.panelBranchPlan({ from: '/negocio', to: '/appointments', raizDebajo: false, masDebajo: true, vistaArriba: true, holdsExitSentinel: false })
    ).toBe('consume-view-then-navigate')
    expect(
      PH.panelBranchPlan({ from: '/negocio', to: MAS, raizDebajo: false, masDebajo: true, vistaArriba: true, holdsExitSentinel: false })
    ).toBe('consume-view-then-navigate')
    // Y el par contrapuesto, adyacente: el MISMO gesto sin la subsección es el de la Phase 3.
    expect(
      PH.panelBranchPlan({ from: '/clients', to: PANEL_ROOT, raizDebajo: true, masDebajo: false, vistaArriba: false, holdsExitSentinel: false })
    ).toBe('up')
    expect(
      PH.panelBranchPlan({ from: '/negocio', to: MAS, raizDebajo: false, masDebajo: true, vistaArriba: false, holdsExitSentinel: false })
    ).toBe('up')
  })

  it('EL ORDEN, del otro lado — las dos reglas del sentinel de salida siguen yendo PRIMERO', () => {
    // Imposible por construcción (el sentinel y la subsección no comparten entrada), pero se fija igual:
    // la regla nueva va DESPUÉS de la -1b, así que nunca le cambia el significado a las del sentinel.
    expect(
      PH.panelBranchPlan({ from: PANEL_ROOT, to: PANEL_ROOT, raizDebajo: false, masDebajo: false, vistaArriba: true, holdsExitSentinel: true })
    ).toBe('none')
    expect(
      PH.panelBranchPlan({ from: PANEL_ROOT, to: '/clients', raizDebajo: false, masDebajo: false, vistaArriba: true, holdsExitSentinel: true })
    ).toBe('consume-exit-then-navigate')
  })

  it('el séptimo miembro ENTRA EN EL TIPO y NO es un modo de rutas', () => {
    const septimo: PH.PanelBranchPlan = 'consume-view-then-navigate'
    for (const from of [...RAMA_DE_MAS, PANEL_ROOT]) {
      for (const to of DESTINOS_BARRA_5) {
        expect(panelNavMode({ from, to })).not.toBe(septimo)
      }
    }
    expect(['push', 'replace', 'up', 'collapse-then-replace', 'consume-exit-then-navigate', 'none']).not.toContain(septimo)
  })
})
