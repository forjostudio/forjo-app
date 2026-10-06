import { describe, it, expect, vi } from 'vitest'
import {
  HISTORY_BACK_REASON,
  OVERLAY_HASH_BASE,
  SOFT_KEYBOARD_GRACE_MS,
  SOFT_KEYBOARD_MIN_INSET,
  createHistoryBackDetails,
  isOverlayHistoryEntry,
  isSoftKeyboardInset,
  nextOverlayHash,
  nextOverlayId,
  overlayHistoryAction,
  overlayHistoryState,
  overlayUnmountAction,
  popstateAction,
  softKeyboardGuardsBack,
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
 * El viewport falso: el teclado de software, por donde el código lo lee.
 *
 * ⚠ EL LÍMITE, declarado: el teclado de Android NO se puede emular. Lo que sí se puede reproducir es
 * el modelo que ve el código —`visualViewport.height` encoge y `window.innerHeight` NO (es el
 * `interactive-widget=resizes-visual` que rige en la app, medido en la sesión de debug)— y es
 * exactamente lo que hace esta clase. Los altos de teclado son los MEDIDOS en la sonda sobre
 * 823px: 320 el QWERTY, 240 el keypad numérico.
 *
 * `guarda()` espeja al `softKeyboardIsGuarding()` del módulo y `cerrarTeclado()` al listener del
 * rastreador: el timestamp se anota en la TRANSICIÓN de bajada, no en cada resize con teclado (es la
 * corrección que forzó la sonda 18; ver el ⚠ de `softKeyboardGuardsBack`). El reloj es manual
 * (`avanzar`) para poder afirmar los bordes de la ventana de gracia sin temporizadores.
 */
class ViewportFalso {
  innerHeight = 823
  height = 823
  leftInsetAt: number | null = null
  private wasInset = false
  now = 100_000

  abrirTeclado(alto = 320) {
    this.height = this.innerHeight - alto
    this.wasInset = true
  }

  cerrarTeclado() {
    this.height = this.innerHeight
    if (this.wasInset) {
      this.wasInset = false
      this.leftInsetAt = this.now
    }
  }

  avanzar(ms: number) {
    this.now += ms
  }

  guarda(): boolean {
    const inset = isSoftKeyboardInset({ viewportHeight: this.height, innerHeight: this.innerHeight })
    if (inset) this.wasInset = true
    return softKeyboardGuardsBack({ inset, leftInsetAt: this.leftInsetAt, now: this.now })
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
    vp,
  }: {
    open: boolean | undefined
    dismiss: ((e: PopStateEvent) => void) | undefined
    /** Sin viewport no hay guarda de teclado: es el caso desktop (y el de los tests que no lo miran). */
    vp?: ViewportFalso
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
        const action = popstateAction({
          topIsOurs: isOverlayHistoryEntry(h.state, id),
          keyboardGuard: vp ? vp.guarda() : false,
        })
        if (action === 'ignore') return
        holding = false
        // 'absorb' = el back se lo comió el teclado: no se pide cierre, sólo vuelve la entrada.
        if (action === 'dismiss') dismissActual?.(e)
        render() // el `tick`: si el cierre se vetó o se absorbió, la entrada vuelve
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

describe('el back con el teclado ARRIBA cierra el teclado, no el overlay (quick 261005-x91)', () => {
  // EL REPORTE DEL DUEÑO: escribiendo el nombre del cliente en el alta de turno, apretó atrás para
  // bajar el teclado —gesto habitual en Android, donde el primer atrás se lo come el teclado— y se
  // le cerró el drawer. MEDIDO en la sonda: bajar el teclado por sí solo NO cierra ni desplaza el
  // drawer; el único camino que reproduce el cierre es un `popstate`. Lo que NO se pudo medir es si
  // el atrás del celular real lo emite (el teclado de Android no se emula): si no lo emitiera, esto
  // es un no-op y el cierre viene de otro lado.
  it('teclado abierto ⇒ NO cierra, y la entrada vuelve al historial', () => {
    const h = new HistorialFalso()
    const vp = new ViewportFalso()
    const dismiss = vi.fn()
    const overlay = montarOverlay(h, { open: true, dismiss, vp })
    expect(h.stack).toHaveLength(2)

    vp.abrirTeclado() // el usuario tocó el buscador de cliente: QWERTY de 320px
    h.back()

    expect(dismiss).not.toHaveBeenCalled()
    // ⚠ LO QUE MÁS IMPORTA: el browser ya consumió la entrada, así que si no volviera, el overlay
    // quedaría abierto sin entrada y el back SIGUIENTE se llevaría la página.
    expect(h.stack).toHaveLength(2)
    expect(overlay.holding).toBe(true)
  })

  it('el SEGUNDO back, ya con el teclado abajo, cierra como siempre', () => {
    const h = new HistorialFalso()
    const vp = new ViewportFalso()
    let open = true
    const overlay = montarOverlay(h, { open: true, dismiss: () => { open = false }, vp })

    vp.abrirTeclado()
    h.back() // primero: se lo come el teclado
    expect(open).toBe(true)

    vp.cerrarTeclado()
    vp.avanzar(SOFT_KEYBOARD_GRACE_MS + 1)
    h.back() // segundo: ahora sí
    expect(open).toBe(false)

    overlay.setOpen(false)
    expect(h.stack).toHaveLength(1)
  })

  it('con el teclado arriba NO avisa del borrador sucio (el back no fue un intento de cierre)', () => {
    // Avisar acá sería ruido: el usuario no quiso cerrar nada, quiso bajar el teclado.
    const h = new HistorialFalso()
    const vp = new ViewportFalso()
    const onBlocked = vi.fn()
    const close = vi.fn()
    const handler = guardDraftOnDismiss(() => true, close, onBlocked)
    const overlay = montarOverlay(h, {
      open: true,
      dismiss: (e) => handler(false, createHistoryBackDetails(e)),
      vp,
    })

    vp.abrirTeclado(240) // keypad numérico del campo Hora
    h.back()

    expect(onBlocked).not.toHaveBeenCalled()
    expect(close).not.toHaveBeenCalled()
    expect(h.stack).toHaveLength(2)
    expect(overlay.holding).toBe(true)
  })

  it('la ventana de gracia: el back apenas bajó el teclado sigue siendo "del teclado"', () => {
    // El atrás y el teclado bajando son el MISMO gesto y el orden de los eventos no está garantizado:
    // si el resize del cierre le gana al `popstate`, sin gracia cerraríamos el overlay.
    const h = new HistorialFalso()
    const vp = new ViewportFalso()
    const dismiss = vi.fn()
    montarOverlay(h, { open: true, dismiss, vp })

    vp.abrirTeclado()
    // ⚠ LOS 5 SEGUNDOS SON LA ASERCIÓN: el usuario estuvo tipeando. El teclado quieto NO emite
    // resizes, así que una gracia contada desde "la última vez que se lo vio arriba" ya estaría
    // vencida acá. MEDIDO en la sonda 18 con sólo 350ms: cerraba el drawer igual.
    vp.avanzar(5000)
    vp.cerrarTeclado()
    vp.avanzar(SOFT_KEYBOARD_GRACE_MS - 100)
    h.back()
    expect(dismiss).not.toHaveBeenCalled()

    // Pasada la gracia, el mismo gesto vuelve a cerrar: la absorción no se queda pegada.
    vp.avanzar(SOFT_KEYBOARD_GRACE_MS + 1)
    h.back()
    expect(dismiss).toHaveBeenCalledTimes(1)
  })

  it('NO rompe el caso bueno: sin teclado en toda la vida del overlay, el back cierra', () => {
    // Es el arreglo de Bug A (quick 260928-seo), verificado en celular. Que no se caiga por esto.
    const h = new HistorialFalso()
    const vp = new ViewportFalso()
    let open = true
    montarOverlay(h, { open: true, dismiss: () => { open = false }, vp })

    h.back()
    expect(open).toBe(false)
  })
})

describe('el umbral y la gracia del teclado, uno por uno', () => {
  it('el inset cuenta como teclado recién a partir del umbral', () => {
    const innerHeight = 823
    // Los dos teclados MEDIDOS en la sonda sobre 823px: QWERTY 320, keypad numérico 240.
    expect(isSoftKeyboardInset({ viewportHeight: 823 - 320, innerHeight })).toBe(true)
    expect(isSoftKeyboardInset({ viewportHeight: 823 - 240, innerHeight })).toBe(true)
    // La barra de URL de Chrome (~56-72px) NO es un teclado: si contara, el back dejaría de cerrar
    // el overlay después de scrollear.
    expect(isSoftKeyboardInset({ viewportHeight: 823 - 72, innerHeight })).toBe(false)
    // Desktop: el inset es 0.
    expect(isSoftKeyboardInset({ viewportHeight: 823, innerHeight })).toBe(false)
    // El borde exacto, para que mover el umbral rompa un test y no una pantalla.
    expect(isSoftKeyboardInset({ viewportHeight: innerHeight - SOFT_KEYBOARD_MIN_INSET, innerHeight })).toBe(true)
    expect(isSoftKeyboardInset({ viewportHeight: innerHeight - SOFT_KEYBOARD_MIN_INSET + 1, innerHeight })).toBe(false)
  })

  it('la gracia corre sólo con el teclado abajo y sólo si estuvo arriba alguna vez', () => {
    // Con el teclado arriba no hace falta mirar el reloj.
    expect(softKeyboardGuardsBack({ inset: true, leftInsetAt: null, now: 1000 })).toBe(true)
    // Nunca hubo teclado (desktop, o un overlay que nadie enfocó): el back cierra, sin gracia.
    expect(softKeyboardGuardsBack({ inset: false, leftInsetAt: null, now: 1000 })).toBe(false)
    // Los dos bordes de la ventana.
    expect(softKeyboardGuardsBack({ inset: false, leftInsetAt: 1000, now: 1000 + SOFT_KEYBOARD_GRACE_MS })).toBe(true)
    expect(softKeyboardGuardsBack({ inset: false, leftInsetAt: 1000, now: 1000 + SOFT_KEYBOARD_GRACE_MS + 1 })).toBe(false)
  })

  it('popstateAction: la entrada propia gana sobre el teclado (un pop de limpieza es un no-op)', () => {
    expect(popstateAction({ topIsOurs: true, keyboardGuard: true })).toBe('ignore')
    expect(popstateAction({ topIsOurs: false, keyboardGuard: true })).toBe('absorb')
    expect(popstateAction({ topIsOurs: false, keyboardGuard: false })).toBe('dismiss')
    // Sin el parámetro, el comportamiento es el de antes del quick: cierra.
    expect(popstateAction({ topIsOurs: false })).toBe('dismiss')
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

// ── El SELECTOR también participa (quick 261006-dzr) ────────────────────────────────────────────
//
// EL PEDIDO DEL DUEÑO EN LA UAT: "el gesto hacia atrás para los selectores de servicio y
// profesional. Es un gesto común el atrás para cerrar cosas." Con un `Select` abierto el atrás se
// SALTABA el selector y actuaba sobre el drawer de abajo: el mismo hueco que Bug A cerró para
// diálogos y drawers, con el `Select` afuera.
//
// ⚠ LA DIFERENCIA QUE DEFINE EL ARREGLO, Y POR ESO ESTOS TESTS EXISTEN: los 23 `<Select>` de la app
// son NO CONTROLADOS (medido: 0 de 23 pasa `open`; todos usan `value` + `onValueChange`), y
// `useOverlayHistory` sólo participa si el overlay es controlado. Enganchar el hook tal cual no
// habría hecho NADA. Por eso `components/ui/select.tsx` dejó de ser `const Select =
// SelectPrimitive.Root` y pasó a ser un wrapper que mantiene ÉL el estado de apertura y le pasa al
// primitivo un `open` siempre definido — con la API externa intacta.
//
// {@link montarSelect} reconstruye ese wrapper con las mismas decisiones que el archivo real
// (estado propio + el orden `onOpenChange` → `isCanceled` → estado que espeja a `SelectRoot.setOpen`)
// y lo enchufa al mismo {@link montarOverlay} que ya modela el hook. Lo que NO cubre, declarado: que
// `select.tsx` llame al hook (eso lo ven tsc + lint) y el gesto real en el celular (UAT del dueño).

/** Detalle de cierre al estilo Base UI: lo mínimo que mira el wrapper, con un `cancel()` que asienta. */
type DetalleFalso = { reason: string; isCanceled: boolean; cancel: () => void }

function detalleBaseUi(reason: string): DetalleFalso {
  const detalle: DetalleFalso = {
    reason,
    isCanceled: false,
    cancel: () => {
      detalle.isCanceled = true
    },
  }
  return detalle
}

/**
 * El wrapper `Select` de `components/ui/select.tsx`, con su estado de apertura propio.
 *
 * `abrir()` / `elegirOpcion()` / `escape()` / `tocarAfuera()` son los cuatro caminos por los que el
 * primitivo llama al `onOpenChange` del wrapper (`trigger-press`, `item-press`, `escape-key`,
 * `outside-press`). El atrás entra por `dismiss`, igual que en el archivo real.
 */
function montarSelect(
  h: HistorialFalso,
  {
    open: openProp,
    defaultOpen = false,
    onOpenChange,
    vp,
  }: {
    /** El `open` del caller. `undefined` = los 23 de la app: el wrapper se hace cargo. */
    open?: boolean
    defaultOpen?: boolean
    onOpenChange?: (next: boolean, details: DetalleFalso) => void
    vp?: ViewportFalso
  } = {},
) {
  let selfOpen = defaultOpen
  const controlled = openProp !== undefined
  const abierto = () => (controlled ? openProp === true : selfOpen)

  // El re-render del wrapper, que es lo que hace correr el efecto del hook. Se asigna después de
  // montar porque el `dismiss` que recibe el hook ya tiene que existir en el montaje.
  let aplicarRender: ((next: boolean) => void) | null = null

  const handleOpenChange = (next: boolean, details: DetalleFalso) => {
    // ⚠ ESTE ORDEN ES LA ASERCIÓN: `SelectRoot.setOpen` llama al handler, DESPUÉS mira `isCanceled`
    // y sólo entonces mueve el estado. Invertirlo haría que un `cancel()` del caller se pierda.
    onOpenChange?.(next, details)
    if (details.isCanceled) return
    if (!controlled) {
      selfOpen = next
      aplicarRender?.(next)
    }
  }

  const overlay = montarOverlay(h, {
    // SIEMPRE definido: es exactamente lo que hace que el hook participe con los 23 sin tocar nada.
    open: abierto(),
    dismiss: (e) => handleOpenChange(false, createHistoryBackDetails(e)),
    vp,
  })
  aplicarRender = overlay.setOpen

  return {
    get abierto() {
      return abierto()
    },
    get holding() {
      return overlay.holding
    },
    abrir: () => handleOpenChange(true, detalleBaseUi('trigger-press')),
    elegirOpcion: () => handleOpenChange(false, detalleBaseUi('item-press')),
    escape: () => handleOpenChange(false, detalleBaseUi('escape-key')),
    tocarAfuera: () => handleOpenChange(false, detalleBaseUi('outside-press')),
    desmontar: () => overlay.desmontar(),
  }
}

describe('el atrás cierra el SELECTOR abierto (quick 261006-dzr)', () => {
  it('un selector cuyo caller NO pasa `open` igual participa del historial', () => {
    // ÉSTA es la aserción del quick. Antes el `Select` era un re-export del primitivo: sin `open`,
    // `participates` daba false y el atrás se saltaba el selector.
    const h = new HistorialFalso()
    const sel = montarSelect(h) // ningún `open` del caller, como los 23 de la app

    sel.abrir()
    expect(h.stack).toHaveLength(2)
    expect(h.hash).toBe(OVERLAY_HASH_BASE)

    h.back()
    expect(sel.abierto).toBe(false)
    // La entrada ya la consumió el browser: NO se hace un segundo back() (ése es el que expulsa).
    expect(h.stack).toHaveLength(1)
    expect(sel.holding).toBe(false)

    // La contraprueba del "antes": con el `open` sin definir, el historial no se tocaba nunca.
    const h2 = new HistorialFalso()
    montarOverlay(h2, { open: undefined, dismiss: () => {} })
    expect(h2.stack).toHaveLength(1)
  })

  it('un selector DENTRO de un drawer: se cierra él y el drawer QUEDA', () => {
    // El caso del reporte: "Nuevo turno" → abrir Servicio → atrás. El LIFO lo da el id por
    // instancia; acá se verifica, no se supone.
    const h = new HistorialFalso()
    let drawerAbierto = true
    const drawer = montarOverlay(h, {
      open: true,
      dismiss: () => {
        drawerAbierto = false
      },
    })
    const sel = montarSelect(h)
    expect(h.stack).toHaveLength(2) // sólo la entrada del drawer: el selector está cerrado

    sel.abrir()
    // Dos entradas con hash DISTINTO: dos entradas con la misma URL son la cicatriz 1.
    expect(h.stack).toHaveLength(3)
    expect(h.hash).toBe(`${OVERLAY_HASH_BASE}-2`)

    h.back()
    expect(sel.abierto).toBe(false)
    expect(drawerAbierto).toBe(true) // ⚠ lo que pedía el dueño
    expect(drawer.holding).toBe(true)
    expect(h.stack).toHaveLength(2)
    expect(h.hash).toBe(OVERLAY_HASH_BASE)

    // Y el atrás SIGUIENTE, con el selector ya cerrado, cierra el drawer.
    h.back()
    expect(drawerAbierto).toBe(false)
  })

  it('cerrar el selector eligiendo una opción no deja entrada huérfana ni cierra el drawer', () => {
    // UAT 4: abrir un selector, elegir, y que el atrás siguiente cierre el drawer DE UNA — sin un
    // atrás muerto en el medio.
    const h = new HistorialFalso()
    let drawerAbierto = true
    montarOverlay(h, {
      open: true,
      dismiss: () => {
        drawerAbierto = false
      },
    })
    const sel = montarSelect(h)

    sel.abrir()
    expect(h.stack).toHaveLength(3)

    sel.elegirOpcion()
    expect(sel.abierto).toBe(false)
    expect(h.stack).toHaveLength(2) // consumió SU entrada
    // El back() de limpieza dispara un popstate que el drawer VE: su propia entrada quedó arriba, así
    // que lo reconoce como de limpieza y no se cierra de fantasma.
    expect(drawerAbierto).toBe(true)

    h.back()
    expect(drawerAbierto).toBe(false)
  })

  it('Escape y tocar afuera cierran igual que antes y consumen su entrada', () => {
    const h = new HistorialFalso()
    const sel = montarSelect(h)

    sel.abrir()
    sel.escape()
    expect(sel.abierto).toBe(false)
    expect(h.stack).toHaveLength(1)
    expect(h.hash).toBe('')

    sel.abrir()
    sel.tocarAfuera()
    expect(sel.abierto).toBe(false)
    expect(h.stack).toHaveLength(1)
    expect(h.hash).toBe('')
  })

  it('los selectores CERRADOS no tocan el historial (montar los 23 no empuja nada)', () => {
    // La defensa de "no se degrada nada en el resto de la app": un `Select` cerrado es inerte, y
    // abrir/cerrar uno deja el historial y la URL exactamente como estaban.
    const h = new HistorialFalso()
    const sels = Array.from({ length: 23 }, () => montarSelect(h))
    expect(h.stack).toHaveLength(1)
    expect(h.hash).toBe('')

    sels[0].abrir()
    sels[0].elegirOpcion()
    expect(h.stack).toHaveLength(1)
    expect(h.hash).toBe('')

    // Desmontar los 23 (cambio de pantalla) tampoco deja nada atrás.
    for (const s of sels) s.desmontar()
    expect(h.stack).toHaveLength(1)
  })

  it('`defaultOpen` sigue funcionando: empuja su entrada en el montaje', () => {
    const h = new HistorialFalso()
    const sel = montarSelect(h, { defaultOpen: true })
    expect(sel.abierto).toBe(true)
    expect(h.stack).toHaveLength(2)

    h.back()
    expect(sel.abierto).toBe(false)
    expect(h.stack).toHaveLength(1)
  })

  it('si el caller SÍ pasa `open`, manda el caller (el estado interno queda dormido)', () => {
    // Hoy ninguno de los 23 lo pasa, pero el tipo lo permite y el wrapper no tiene que pisarlo.
    const h = new HistorialFalso()
    const onOpenChange = vi.fn()
    const sel = montarSelect(h, { open: true, onOpenChange })
    expect(h.stack).toHaveLength(2)

    h.back()
    expect(onOpenChange).toHaveBeenCalledTimes(1)
    expect(onOpenChange.mock.calls[0][0]).toBe(false)
    expect(onOpenChange.mock.calls[0][1].reason).toBe(HISTORY_BACK_REASON)
    // El caller no bajó su `open`, así que el selector sigue abierto… y su entrada VUELVE: sin ese
    // re-push quedaría abierto sin entrada y el atrás siguiente se llevaría la página.
    expect(sel.abierto).toBe(true)
    expect(h.stack).toHaveLength(2)
    expect(sel.holding).toBe(true)
  })

  it('un `cancel()` del caller veta el cierre y la entrada vuelve (el orden de SelectRoot.setOpen)', () => {
    // El primitivo mira `isCanceled` DESPUÉS de llamar al handler. Si el wrapper moviera su estado
    // antes, el veto se perdería: un comportamiento que en no-controlado SÍ funcionaba.
    const h = new HistorialFalso()
    const sel = montarSelect(h, {
      onOpenChange: (next, details) => {
        if (!next) details.cancel()
      },
    })

    sel.abrir()
    expect(sel.abierto).toBe(true)
    expect(h.stack).toHaveLength(2)

    sel.escape()
    expect(sel.abierto).toBe(true) // vetado, como en el primitivo

    h.back()
    expect(sel.abierto).toBe(true)
    expect(h.stack).toHaveLength(2) // y la entrada volvió
    expect(sel.holding).toBe(true)
  })

  it('⚠ MEDIDO: abrir un selector dentro de la gracia del teclado absorbe el PRIMER atrás', () => {
    // El riesgo que el plan pidió medir. Tocar el trigger del selector desenfoca el input y BAJA el
    // teclado, lo que arranca la ventana de gracia de 300ms del quick 261005-x91. Un atrás que caiga
    // dentro de esa ventana se ABSORBE: no cierra el selector. El costo máximo es un atrás muerto —
    // nunca perder la página, porque la entrada vuelve. No se toca el módulo compartido por 300ms:
    // un segundo apretón deliberado no baja de ~400ms (ver `SOFT_KEYBOARD_GRACE_MS`).
    const h = new HistorialFalso()
    const vp = new ViewportFalso()
    const sel = montarSelect(h, { vp })

    vp.abrirTeclado() // el dueño estaba tipeando el nombre del cliente
    vp.avanzar(2000)
    vp.cerrarTeclado() // tocó el trigger del selector: el input se desenfoca y el teclado baja
    vp.avanzar(100) // dentro de la gracia
    sel.abrir()

    h.back()
    expect(sel.abierto).toBe(true)
    expect(h.stack).toHaveLength(2)
    expect(sel.holding).toBe(true)

    // Pasada la gracia, el mismo gesto cierra el selector: la absorción no se queda pegada.
    vp.avanzar(SOFT_KEYBOARD_GRACE_MS)
    h.back()
    expect(sel.abierto).toBe(false)
    expect(h.stack).toHaveLength(1)
  })

  it('sin teclado en toda la vida del selector (desktop), el atrás cierra de una', () => {
    const h = new HistorialFalso()
    const vp = new ViewportFalso() // viewport presente, teclado nunca arriba
    const sel = montarSelect(h, { vp })

    sel.abrir()
    h.back()
    expect(sel.abierto).toBe(false)
    expect(h.stack).toHaveLength(1)
  })

  it('abrir y cerrar el mismo selector varias veces no acumula entradas', () => {
    // Los selectores se abren MUCHO más seguido que los diálogos (filtros de listados): que el
    // push/consume quede balanceado es lo que evita que la pila se llene de basura.
    const h = new HistorialFalso()
    const sel = montarSelect(h)
    for (let i = 0; i < 5; i += 1) {
      sel.abrir()
      expect(h.stack).toHaveLength(2)
      sel.elegirOpcion()
      expect(h.stack).toHaveLength(1)
    }
    expect(h.hash).toBe('')
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
