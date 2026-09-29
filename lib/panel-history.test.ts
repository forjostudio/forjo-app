import { describe, it, expect } from 'vitest'
import {
  panelHistoryAction,
  panelViewState,
  isPanelViewEntry,
  isOverlayOwnedEntry,
  panelViewUrl,
  resolveViewParam,
  sanitizeAction,
  reconciledMemo,
  type PanelViewCause,
} from '@/lib/panel-history'

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
        panelHistoryAction({ cause, from: 'a', to: 'b', holding: true, overlayOwnsTop: true }),
      ).toBe('none')
    })
  }

  it('la escritura queda DIFERIDA, no perdida: la misma entrada sin overlay arriba sí se escribe', () => {
    // El contraste es el punto: lo único que cambió es quién tiene la entrada de arriba.
    expect(
      panelHistoryAction({ cause: 'programmatic', from: 'dup', to: 'keep', holding: true, overlayOwnsTop: true }),
    ).toBe('none')
    expect(
      panelHistoryAction({ cause: 'programmatic', from: 'dup', to: 'keep', holding: true, overlayOwnsTop: false }),
    ).toBe('replace')
  })
})

describe('panelHistoryAction — regla 1: el commit concurrente nunca toca el historial', () => {
  it("la causa 'concurrent' devuelve 'none' incluso con la entrada de arriba libre", () => {
    // Es la declaración del call site del borrado. Sobrevive aunque el marcador del overlay cambie
    // de nombre y la regla 0 deje de reconocerlo: dos candados independientes, no uno.
    expect(
      panelHistoryAction({ cause: 'concurrent', from: 'x', to: null, holding: true, overlayOwnsTop: false }),
    ).toBe('none')
  })
})

describe('panelHistoryAction — regla 2: empujar la misma URL colapsa la entrada (cicatriz 1)', () => {
  for (const cause of TODAS_LAS_CAUSAS) {
    it(`con la causa '${cause}' y origen igual a destino devuelve 'none'`, () => {
      expect(
        panelHistoryAction({ cause, from: 'abc', to: 'abc', holding: true, overlayOwnsTop: false }),
      ).toBe('none')
    })
  }

  it('null === null también es "sin cambio real"', () => {
    // El caso del saneo pedido dos veces sobre una URL que ya está limpia: escribir ahí dejaría dos
    // entradas idénticas y el atrás se llevaría la página.
    expect(
      panelHistoryAction({ cause: 'stale', from: null, to: null, holding: false, overlayOwnsTop: false }),
    ).toBe('none')
  })
})

describe('panelHistoryAction — la tabla de decisiones', () => {
  it('abrir un cliente desde el listado empuja una entrada', () => {
    expect(
      panelHistoryAction({ cause: 'user-open', from: null, to: 'abc', holding: false, overlayOwnsTop: false }),
    ).toBe('push')
  })

  it('cambiar de cliente A→B también empuja: B es un destino propio', () => {
    // Decisión ① del plan. En mobile A→B sin pasar por el listado es imposible (el listado se oculta
    // con el detalle abierto), y en desktop que el atrás vuelva a la ficha anterior es lo honesto.
    expect(
      panelHistoryAction({ cause: 'user-open', from: 'a', to: 'b', holding: true, overlayOwnsTop: false }),
    ).toBe('push')
  })

  it('el "Volver" consume la entrada cuando la entrada de arriba es NUESTRA', () => {
    expect(
      panelHistoryAction({ cause: 'user-close', from: 'a', to: null, holding: true, overlayOwnsTop: false }),
    ).toBe('consume')
  })

  it('el "Volver" REEMPLAZA cuando la entrada no es nuestra: un back ahí saca al dueño del sitio', () => {
    // Cicatriz 2 de `lib/overlay-history.ts:22-24`. Es el caso "el dueño entró pegando la URL":
    // arriba del stack está la página desde la que llegó, no una entrada nuestra.
    expect(
      panelHistoryAction({ cause: 'user-close', from: 'a', to: null, holding: false, overlayOwnsTop: false }),
    ).toBe('replace')
  })

  it('la fusión, ya con el modal cerrado, reemplaza en vez de empujar', () => {
    expect(
      panelHistoryAction({ cause: 'programmatic', from: 'dup', to: 'keep', holding: false, overlayOwnsTop: false }),
    ).toBe('replace')
  })

  it('un FILTRO reemplaza (T-3, el activeLoc de Agenda: expresable aunque esta fase no lo cablee)', () => {
    expect(
      panelHistoryAction({ cause: 'filter', from: 'loc1', to: 'loc2', holding: true, overlayOwnsTop: false }),
    ).toBe('replace')
  })

  it("el saneo CONSUME cuando la entrada es nuestra: reemplazar dejaría el atrás muerto", () => {
    // ⚠ Es el arreglo del back muerto. Un `replace` dejaría `/clients` encima de `/clients`: dos
    // entradas idénticas, y el dueño tendría que apretar atrás dos veces para que pase algo visible
    // — la "entrada basura" que el criterio 3 prohíbe. Consumir BORRA nuestra entrada.
    expect(
      panelHistoryAction({ cause: 'stale', from: 'x', to: null, holding: true, overlayOwnsTop: false }),
    ).toBe('consume')
  })

  it('el saneo REEMPLAZA cuando la entrada no es nuestra (URL pegada con un id que no resuelve)', () => {
    expect(
      panelHistoryAction({ cause: 'stale', from: 'x', to: null, holding: false, overlayOwnsTop: false }),
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
    overlayOwnsTop: boolean
  }) {
    const view = resolveViewParam({ param: input.param, resolvedTo: input.resolvedTo })
    if (!view.reconcile || view.cause === null) return 'none'
    return panelHistoryAction({
      cause: view.cause,
      from: input.param,
      to: view.to,
      holding: input.holding,
      overlayOwnsTop: input.overlayOwnsTop,
    })
  }

  it('fusión con el modal de fusión ABIERTO: no escribe nada — es DIFERIDO, no perdido', () => {
    expect(
      accionEfectiva({ param: 'dup', resolvedTo: 'keep', holding: true, overlayOwnsTop: true }),
    ).toBe('none')
  })

  it('fusión con el modal ya cerrado: REEMPLAZA — es el criterio 3 del ROADMAP, literal', () => {
    expect(
      accionEfectiva({ param: 'dup', resolvedTo: 'keep', holding: true, overlayOwnsTop: false }),
    ).toBe('replace')
  })

  it('post-borrado, con el diálogo todavía consumiendo su entrada: no escribe nada (C-1)', () => {
    expect(
      accionEfectiva({ param: 'X', resolvedTo: null, holding: false, overlayOwnsTop: true }),
    ).toBe('none')
  })

  it('post-borrado ya asentado: CONSUME — es el arreglo del atrás muerto', () => {
    expect(
      accionEfectiva({ param: 'X', resolvedTo: null, holding: true, overlayOwnsTop: false }),
    ).toBe('consume')
  })

  it('URL pegada con un id que no resuelve: REEMPLAZA, nunca consume', () => {
    expect(
      accionEfectiva({ param: 'X', resolvedTo: null, holding: false, overlayOwnsTop: false }),
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
