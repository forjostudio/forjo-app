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

/** Las seis causas, para poder barrer la tabla entera sin escribirlas seis veces a mano. */
const TODAS_LAS_CAUSAS: PanelViewCause[] = [
  'user-open',
  'user-close',
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
})

describe('panelBranchPlan — la decisión con el hecho, pura y sobre rutas', () => {
  it('REGLA 0 — sin el hecho devuelve lo de siempre y NUNCA un retroceso (la cicatriz 2)', () => {
    // El barrido que cierra T-03-05: 9 secciones de la rama de Más × los 5 destinos de la barra.
    for (const from of RAMA_DE_MAS) {
      for (const to of DESTINOS_BARRA_5) {
        const plan = PH.panelBranchPlan({ from, to, masDebajo: false })
        expect(plan).toBe(panelNavMode({ from, to }))
        expect(plan).not.toBe('up')
        expect(plan).not.toBe('collapse-then-replace')
      }
    }
  })

  it('con el hecho y destino MÁS ⇒ SUBIR un nivel (D-03), nunca reemplazar', () => {
    for (const from of RAMA_DE_MAS) {
      expect(PH.panelBranchPlan({ from, to: MAS, masDebajo: true })).toBe('up')
    }
  })

  it('con el hecho y un destino de la barra ⇒ COLAPSAR Y REEMPLAZAR (criterio 2)', () => {
    for (const from of RAMA_DE_MAS) {
      for (const to of DESTINOS_BARRA_4) {
        expect(PH.panelBranchPlan({ from, to, masDebajo: true })).toBe('collapse-then-replace')
      }
    }
  })

  it('from === to REEMPLAZA siempre, con marca y sin marca: la rama 1 sigue ganando', () => {
    // La cicatriz 1. Con el hecho, si la rama de Más se evaluara primero, `/mas → /mas` devolvería
    // SUBIR y el dueño se iría un escalón para abajo tocando la pantalla en la que ya está.
    for (const masDebajo of [true, false]) {
      expect(PH.panelBranchPlan({ from: MAS, to: MAS, masDebajo })).toBe('replace')
      expect(PH.panelBranchPlan({ from: '/finances', to: '/finances', masDebajo })).toBe('replace')
    }
  })

  it('ENTRADA DIRECTA — sin marca, /finances → /mas EMPUJA: es el candado de la cicatriz 2', () => {
    // El par de rutas es IDÉNTICO al de la pila `[Inicio, Más, Finanzas]`, donde subir es correcto.
    // Es el caso exacto que la marca existe para distinguir: sin ella, el retroceso expulsaría al
    // dueño del sitio (entró pegando la URL, F5, o el rebote del proxy después del login).
    expect(PH.panelBranchPlan({ from: '/finances', to: MAS, masDebajo: false })).toBe('push')
  })

  it('la ruta de Más y la raíz siguen siendo PARÁMETROS en la firma nueva', () => {
    expect(PH.panelBranchPlan({ from: '/x', to: '/y', more: '/y', masDebajo: true })).toBe('up')
    expect(PH.panelBranchPlan({ from: '/x', to: '/y', more: '/z', masDebajo: true })).toBe('collapse-then-replace')
    expect(PH.panelBranchPlan({ from: '/x', to: '/y', root: '/x', masDebajo: false })).toBe('push')
  })

  it('el tipo del plan tiene CINCO miembros, y el quinto lo produce el plan 03-03', () => {
    // *Nada* se declara en el tipo aunque esta función todavía no lo devuelva: si un resultado
    // posible de la decisión de navegación viviera fuera del tipo, el chequeo de exhaustividad del
    // plan 03-04 no lo vería — la clase de hueco silencioso que esta fase cierra.
    const MIEMBROS: PH.PanelBranchPlan[] = ['push', 'replace', 'up', 'collapse-then-replace', 'none']
    expect(new Set(MIEMBROS).size).toBe(5)
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
   * `masDebajo` sale de comparar la entrada inmediatamente inferior contra la ruta de Más, que es
   * exactamente lo que la marca guarda (el `from` de la navegación que empujó esta entrada).
   *
   * Los dos modos nuevos: SUBIR quita la entrada de arriba; COLAPSAR quita la de arriba y después
   * decide el segundo paso contra lo que quedó debajo de Más — si coincide con el destino, retrocede
   * una segunda vez SIN navegar (el degenerado, medido en E-5); si no, reemplaza.
   */
  function navegarRama(pila: string[], to: string): string[] {
    const from = pila[pila.length - 1]
    const debajo = pila.length > 1 ? pila[pila.length - 2] : null
    const plan = PH.panelBranchPlan({ from, to, masDebajo: debajo === MAS })
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
        expect(PH.panelBranchPlan({ from, to, masDebajo: false })).toBe(panelNavMode({ from, to }))
      }
    }
  })
})
