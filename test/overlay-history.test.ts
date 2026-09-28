import { describe, it, expect, vi } from 'vitest'
import {
  HISTORY_BACK_REASON,
  OVERLAY_HASH_BASE,
  createHistoryBackDetails,
  isOverlayHistoryEntry,
  nextOverlayHash,
  nextOverlayId,
  overlayHistoryAction,
  overlayHistoryState,
  overlayUnmountAction,
  popstateAction,
} from '@/lib/overlay-history'
import { guardDraftOnDismiss } from '@/lib/panel-draft'

// ── quick 260928-seo — el "atrás" del celular cierra el overlay, no la página ────────────────────
//
// Suite PURA: sin Supabase, sin fixtures, sin gate de entorno → cae sola en el carril paralelo
// `pure` (test/suite-split.ts clasifica por imports). Molde: lib/landing/lightbox.test.ts, que testea
// exactamente el mismo problema para el visor del landing.
//
// POR QUÉ ESTA SUITE SIMULA EL HISTORIAL EN VEZ DE MONTAR EL COMPONENTE: el entorno de Vitest de este
// repo es `node` (vitest.config.mts) — no hay jsdom ni Testing Library, y el milestone prohíbe
// paquetes nuevos. Por eso `lib/overlay-history.ts` no deja NINGUNA decisión adentro del efecto de
// React: el efecto pregunta (`overlayHistoryAction`, `overlayUnmountAction`, `popstateAction`) y
// ejecuta. Acá se reconstruye ese mismo bucle contra un historial falso, así que los escenarios que
// se afirman son los del navegador de verdad, no una paráfrasis.
//
// LO QUE ESTA SUITE NO CUBRE, a propósito: que los wrappers `components/ui/dialog.tsx` y
// `components/ui/drawer.tsx` llamen al hook (eso lo ven tsc + lint) y el gesto real en el celular
// (UAT del dueño). Lo que sí congela es la mecánica del historial, que es donde viven los bugs que
// expulsan al usuario de la página.

// ── El historial falso ──────────────────────────────────────────────────────────────────────────

type Entrada = { hash: string; state: unknown }

/**
 * Historial mínimo con la semántica que nos importa: `pushState` agrega una entrada arriba y `back()`
 * la saca y avisa. Los listeners se llaman DESPUÉS de mover el puntero, igual que el browser (el
 * `popstate` llega con la entrada ya consumida — de ahí que el handler real nunca llame `back()`).
 */
class HistorialFalso {
  stack: Entrada[]
  private listeners = new Set<(e: PopStateEvent) => void>()

  constructor(hashInicial = '') {
    this.stack = [{ hash: hashInicial, state: { __NA: true } }]
  }

  get top(): Entrada {
    return this.stack[this.stack.length - 1]
  }

  get hash(): string {
    return this.top.hash
  }

  get state(): unknown {
    return this.top.state
  }

  /** Next MUTA el state agregándole `__NA`: se replica para que el fake no sea más limpio que la realidad. */
  pushState(state: object, hash: string) {
    this.stack.push({ hash, state: { ...state, __NA: true } })
  }

  back() {
    if (this.stack.length > 1) this.stack.pop()
    else this.stack = [] // salir del sitio: el caso que NUNCA hay que provocar de más
    for (const l of this.listeners) l({} as PopStateEvent)
  }

  /** Una navegación del router con el overlay abierto: entrada nueva que NO es nuestra. */
  navegar(hash: string) {
    this.stack.push({ hash, state: { __NA: true } })
  }

  escuchar(l: (e: PopStateEvent) => void) {
    this.listeners.add(l)
    return () => this.listeners.delete(l)
  }
}

/**
 * Una instancia del hook, reconstruida con las MISMAS funciones de decisión que usa el efecto real.
 * `render()` = el efecto de empujar/consumir · `desmontar()` = su limpieza · el listener = el `onPop`.
 */
function montarOverlay(
  h: HistorialFalso,
  {
    open,
    dismiss,
  }: {
    open: boolean | undefined
    dismiss: ((e: PopStateEvent) => void) | undefined
  },
) {
  const id = nextOverlayId()
  let holding = false
  let abierto = open
  let dismissActual = dismiss
  const participates = open !== undefined && dismiss !== undefined

  const render = () => {
    const action = overlayHistoryAction({ participates, open: abierto, holding })
    if (action === 'push') {
      h.pushState(overlayHistoryState(id), nextOverlayHash(h.hash))
      holding = true
      return
    }
    if (action === 'consume') {
      holding = false
      if (isOverlayHistoryEntry(h.state, id)) h.back()
    }
  }

  const desuscribir = participates
    ? h.escuchar((e) => {
        if (!abierto) return // el efecto del listener sólo vive mientras el overlay está abierto
        if (popstateAction({ topIsOurs: isOverlayHistoryEntry(h.state, id) }) === 'ignore') return
        holding = false
        dismissActual?.(e)
        render() // el `tick`: si el cierre se vetó, la entrada vuelve
      })
    : () => {}

  const api = {
    id,
    get holding() {
      return holding
    },
    /** Cambia el `open` controlado y vuelve a correr el efecto, como haría un re-render. */
    setOpen(next: boolean | undefined) {
      abierto = next
      render()
    },
    setDismiss(next: (e: PopStateEvent) => void) {
      dismissActual = next
    },
    render,
    desmontar() {
      desuscribir()
      if (overlayUnmountAction({ holding }) === 'none') return
      holding = false
      if (isOverlayHistoryEntry(h.state, id)) h.back()
    },
  }

  render()
  return api
}

// ── Los escenarios del celular ──────────────────────────────────────────────────────────────────

describe('el back del celular cierra el overlay', () => {
  it('abrir → back → cierra el overlay y deja el historial como estaba', () => {
    const h = new HistorialFalso()
    let open = true
    const overlay = montarOverlay(h, {
      open: true,
      dismiss: () => {
        open = false
      },
    })
    // Al abrir hay UNA entrada nueva, con hash (sin hash el router la colapsa y el back saca al
    // usuario de la página: cicatriz 1).
    expect(h.stack).toHaveLength(2)
    expect(h.hash).toBe(OVERLAY_HASH_BASE)

    h.back()
    expect(open).toBe(false)

    overlay.setOpen(false)
    // La entrada ya la consumió el browser: NO se hace un segundo back() (ése es el que expulsa).
    expect(h.stack).toHaveLength(1)
    expect(overlay.holding).toBe(false)
  })

  it('abrir → ✕ → no deja entrada huérfana (el back siguiente navega)', () => {
    const h = new HistorialFalso()
    const overlay = montarOverlay(h, { open: true, dismiss: () => {} })
    expect(h.stack).toHaveLength(2)

    overlay.setOpen(false) // la ✕ / Guardar: el caller baja `open`
    expect(h.stack).toHaveLength(1)
    expect(h.hash).toBe('')
    expect(overlay.holding).toBe(false)
  })

  it('un re-render con el overlay abierto NO empuja una segunda entrada', () => {
    const h = new HistorialFalso()
    const overlay = montarOverlay(h, { open: true, dismiss: () => {} })
    overlay.render()
    overlay.render()
    overlay.setOpen(true)
    expect(h.stack).toHaveLength(2)
  })

  it('desmontarse con el overlay abierto consume su entrada (cierre por desmontaje)', () => {
    // Varios overlays del panel se montan condicionalmente (`{sel && <Dialog open …>}`): cerrarlos
    // los DESMONTA, nunca ponen `open` en false.
    const h = new HistorialFalso()
    const overlay = montarOverlay(h, { open: true, dismiss: () => {} })
    expect(h.stack).toHaveLength(2)

    overlay.desmontar()
    expect(h.stack).toHaveLength(1)
  })

  it('desmontarse DESPUÉS de navegar no toca el historial (no deshace la navegación)', () => {
    const h = new HistorialFalso()
    const overlay = montarOverlay(h, { open: true, dismiss: () => {} })
    h.navegar('') // el router empuja la ruta nueva encima de nuestra entrada
    expect(h.stack).toHaveLength(3)

    overlay.desmontar()
    // La entrada queda ENTERRADA a propósito: consumirla acá sería deshacer la navegación del
    // usuario, que es infinitamente peor que un back extra al volver a esta pantalla.
    expect(h.stack).toHaveLength(3)
  })

  it('un overlay NO controlado (sin `open`) no toca el historial', () => {
    const h = new HistorialFalso()
    montarOverlay(h, { open: undefined, dismiss: () => {} })
    expect(h.stack).toHaveLength(1)
  })

  it('un overlay sin `onOpenChange` no toca el historial (el back no puede quedar muerto)', () => {
    // Si empujáramos una entrada sin tener a quién pedirle el cierre, el back no cerraría nada y el
    // re-push lo volvería un gesto MUERTO: el usuario no podría salir de la página.
    const h = new HistorialFalso()
    montarOverlay(h, { open: true, dismiss: undefined })
    expect(h.stack).toHaveLength(1)
  })
})

describe('el back con un borrador SUCIO avisa y no cierra (la guarda G-23-25)', () => {
  it('el cierre vetado devuelve la entrada al historial', () => {
    const h = new HistorialFalso()
    const onBlocked = vi.fn()
    const close = vi.fn()
    // El mismo handler que arman los tres diálogos de edición de Ajustes.
    const handler = guardDraftOnDismiss(() => true, close, onBlocked)
    const overlay = montarOverlay(h, {
      open: true,
      dismiss: (e) => handler(false, createHistoryBackDetails(e)),
    })
    expect(h.stack).toHaveLength(2)

    h.back()

    expect(close).not.toHaveBeenCalled()
    expect(onBlocked).toHaveBeenCalledTimes(1)
    // ⚠ LO QUE MÁS IMPORTA: el overlay siguió abierto, así que su entrada VOLVIÓ. Sin este re-push el
    // modal quedaría abierto sin entrada y el back siguiente se llevaría la página.
    expect(h.stack).toHaveLength(2)
    expect(overlay.holding).toBe(true)

    // Y el veto es repetible: el segundo back vuelve a avisar, no se escapa.
    h.back()
    expect(onBlocked).toHaveBeenCalledTimes(2)
    expect(close).not.toHaveBeenCalled()
    expect(h.stack).toHaveLength(2)
  })

  it('con el borrador LIMPIO el back cierra sin fricción', () => {
    const h = new HistorialFalso()
    const onBlocked = vi.fn()
    let open = true
    const handler = guardDraftOnDismiss(
      () => false,
      () => {
        open = false
      },
      onBlocked,
    )
    const overlay = montarOverlay(h, {
      open: true,
      dismiss: (e) => handler(false, createHistoryBackDetails(e)),
    })

    h.back()
    expect(open).toBe(false)
    expect(onBlocked).not.toHaveBeenCalled()

    overlay.setOpen(false)
    expect(h.stack).toHaveLength(1)
  })

  it(`'${HISTORY_BACK_REASON}' está en la lista de motivos accidentales de guardDraftOnDismiss`, () => {
    // Ésta es LA aserción del plan: si alguien saca el motivo de esa lista, un back con un borrador
    // sucio vuelve a descartarlo en silencio — el bug de la Phase 23 por la puerta de atrás.
    const close = vi.fn()
    const onBlocked = vi.fn()
    const cancel = vi.fn()
    guardDraftOnDismiss(() => true, close, onBlocked)(false, { reason: HISTORY_BACK_REASON, cancel })
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(onBlocked).toHaveBeenCalledTimes(1)
    expect(close).not.toHaveBeenCalled()
  })
})

describe('overlays anidados: el back cierra SÓLO el de arriba (LIFO)', () => {
  it('cada instancia reconoce nada más que su propia entrada', () => {
    const h = new HistorialFalso()
    let externoAbierto = true
    let internoAbierto = true
    const externo = montarOverlay(h, {
      open: true,
      dismiss: () => {
        externoAbierto = false
      },
    })
    const interno = montarOverlay(h, {
      open: true,
      dismiss: () => {
        internoAbierto = false
      },
    })
    // Dos entradas con hash DISTINTO: dos entradas con la misma URL vuelven a ser la cicatriz 1.
    expect(h.stack).toHaveLength(3)
    expect(h.hash).toBe(`${OVERLAY_HASH_BASE}-2`)
    expect(externo.id).not.toBe(interno.id)

    h.back()
    expect(internoAbierto).toBe(false)
    expect(externoAbierto).toBe(true)
    expect(externo.holding).toBe(true)

    interno.setOpen(false)
    // El interno NO hace un segundo back(): su entrada ya la consumió el browser y arriba quedó la
    // del externo, que no lleva su marca.
    expect(h.stack).toHaveLength(2)
    expect(h.hash).toBe(OVERLAY_HASH_BASE)

    h.back()
    expect(externoAbierto).toBe(false)
  })

  it('cerrar el de arriba no cierra al de abajo (el popstate de limpieza se ignora)', () => {
    const h = new HistorialFalso()
    let externoAbierto = true
    const externo = montarOverlay(h, {
      open: true,
      dismiss: () => {
        externoAbierto = false
      },
    })
    const interno = montarOverlay(h, { open: true, dismiss: () => {} })

    interno.setOpen(false) // ✕ del de arriba → back() de limpieza → popstate que el externo VE
    expect(externoAbierto).toBe(true)
    expect(externo.holding).toBe(true)
    expect(h.stack).toHaveLength(2)
  })
})

describe('React StrictMode (dev): el doble montaje converge en UNA entrada', () => {
  it('desmontar + volver a montar el efecto no deja entradas de más ni cierra de fantasma', () => {
    // En dev React corre efecto → limpieza → efecto. La limpieza consume la entrada y el segundo
    // efecto empuja de nuevo; el `back()` de la limpieza llega DESPUÉS, sobre la entrada nueva. El
    // handler lo reconoce como propio (`popstateAction` → 'ignore') y no cierra nada.
    const h = new HistorialFalso()
    let abierto = true
    const overlay = montarOverlay(h, {
      open: true,
      dismiss: () => {
        abierto = false
      },
    })
    expect(h.stack).toHaveLength(2)

    // Simulación del doble montaje: se empuja una segunda entrada y después llega el back diferido.
    overlay.render() // no empuja: sigue siendo dueño (candado `holding`)
    h.pushState(overlayHistoryState(overlay.id), nextOverlayHash(h.hash))
    expect(h.stack).toHaveLength(3)

    h.back()
    expect(abierto).toBe(true) // NO hubo cierre fantasma
    expect(h.stack).toHaveLength(2)
    expect(isOverlayHistoryEntry(h.state, overlay.id)).toBe(true)
  })
})

// ── Las funciones puras, una por una ────────────────────────────────────────────────────────────

describe('nextOverlayHash — por qué el hash no puede ser una constante', () => {
  it('sin hash previo (o con uno ajeno) empuja el base', () => {
    expect(nextOverlayHash('')).toBe('#modal')
    expect(nextOverlayHash('#seccion')).toBe('#modal')
  })

  it('anidando, profundiza: cada entrada tiene URL distinta', () => {
    expect(nextOverlayHash('#modal')).toBe('#modal-2')
    expect(nextOverlayHash('#modal-2')).toBe('#modal-3')
    expect(nextOverlayHash('#modal-9')).toBe('#modal-10')
  })

  it('un `#modal-basura` cae al base en vez de producir `#modal-NaN`', () => {
    expect(nextOverlayHash('#modal-')).toBe('#modal')
    expect(nextOverlayHash('#modal-abc')).toBe('#modal')
    expect(nextOverlayHash('#modal-1.5')).toBe('#modal')
    expect(nextOverlayHash('#modal-0')).toBe('#modal')
  })
})

describe('isOverlayHistoryEntry — la guarda de NUNCA back() sobre una entrada ajena', () => {
  it('true sólo con nuestra marca y el id exacto', () => {
    expect(isOverlayHistoryEntry({ frjOverlay: 7 }, 7)).toBe(true)
    // Con el state ya mutado por Next (`__NA` + el árbol interno) sigue reconociéndose.
    expect(isOverlayHistoryEntry({ frjOverlay: 7, __NA: true }, 7)).toBe(true)
  })

  it('false con el id de otra instancia (es lo que hace LIFO a los anidados)', () => {
    expect(isOverlayHistoryEntry({ frjOverlay: 8 }, 7)).toBe(false)
  })

  it('false con null / undefined / {} / no-objetos / marcas de otro tipo', () => {
    expect(isOverlayHistoryEntry(null, 1)).toBe(false)
    expect(isOverlayHistoryEntry(undefined, 1)).toBe(false)
    expect(isOverlayHistoryEntry({}, 1)).toBe(false)
    expect(isOverlayHistoryEntry({ __NA: true }, 1)).toBe(false)
    expect(isOverlayHistoryEntry('frjOverlay', 1)).toBe(false)
    expect(isOverlayHistoryEntry(1, 1)).toBe(false)
    expect(isOverlayHistoryEntry({ frjOverlay: '1' }, 1)).toBe(false)
    expect(isOverlayHistoryEntry({ frjOverlay: true }, 1)).toBe(false)
  })
})

describe('overlayHistoryAction / overlayUnmountAction / popstateAction', () => {
  it('abierto y sin entrada ⇒ push · abierto y con entrada ⇒ none (candado del doble push)', () => {
    expect(overlayHistoryAction({ participates: true, open: true, holding: false })).toBe('push')
    expect(overlayHistoryAction({ participates: true, open: true, holding: true })).toBe('none')
  })

  it('cerrado y con entrada ⇒ consume · cerrado y sin entrada ⇒ none (candado del doble back)', () => {
    expect(overlayHistoryAction({ participates: true, open: false, holding: true })).toBe('consume')
    expect(overlayHistoryAction({ participates: true, open: false, holding: false })).toBe('none')
  })

  it('sin participar, nunca se toca el historial', () => {
    expect(overlayHistoryAction({ participates: false, open: true, holding: false })).toBe('none')
    expect(overlayHistoryAction({ participates: false, open: undefined, holding: true })).toBe('none')
  })

  it('al desmontar se consume sólo si somos dueños de la entrada', () => {
    expect(overlayUnmountAction({ holding: true })).toBe('consume')
    expect(overlayUnmountAction({ holding: false })).toBe('none')
  })

  it('el popstate cierra sólo si la entrada de arriba ya no es nuestra', () => {
    expect(popstateAction({ topIsOurs: false })).toBe('dismiss')
    expect(popstateAction({ topIsOurs: true })).toBe('ignore')
  })
})

describe('createHistoryBackDetails — el detalle que viaja al onOpenChange', () => {
  it('lleva el motivo propio, el PopStateEvent real y un cancel() que asienta el veto', () => {
    const event = {} as PopStateEvent
    const details = createHistoryBackDetails(event)
    expect(details.reason).toBe(HISTORY_BACK_REASON)
    expect(details.event).toBe(event)
    expect(details.isCanceled).toBe(false)
    details.cancel()
    expect(details.isCanceled).toBe(true)
  })

  it('completa la forma del detalle de Base UI (ningún consumidor se queda sin campo)', () => {
    const details = createHistoryBackDetails({} as PopStateEvent)
    expect(details.trigger).toBeUndefined()
    expect(details.isPropagationAllowed).toBe(false)
    expect(() => {
      details.allowPropagation()
      details.preventUnmountOnClose()
    }).not.toThrow()
  })
})

describe('nextOverlayId — los ids no se repiten', () => {
  it('cada instancia recibe uno propio (sin esto los anidados se pisarían)', () => {
    const a = nextOverlayId()
    const b = nextOverlayId()
    expect(a).not.toBe(b)
    expect(Number.isInteger(a) && a > 0).toBe(true)
  })
})
