'use client'

import Image from 'next/image'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'
import {
  LIGHTBOX_HASH,
  LIGHTBOX_GROUP_ATTR,
  LIGHTBOX_SRC_ATTR,
  slideStep,
  scrollLeftForIndex,
  indexFromScroll,
  clampIndex,
  wrapIndex,
  shouldConsumeHistoryEntry,
} from '@/lib/landing/lightbox'

// ── PhotoLightbox — visor de fotos a pantalla completa con carrusel peek ─────────────
//
// POR QUÉ UN CONTROLADOR GLOBAL POR DELEGACIÓN y no un onClick por foto: espejo exacto de
// LandingMotion. Las 3 secciones con fotos ampliables (gallery / rsv-strip / about) siguen
// siendo RSC PURAS — si les pusiéramos onClick habría que marcarlas 'use client' y todo su
// árbol se iría al bundle. Acá se monta UN client component una sola vez dentro de .frj-site,
// que escucha los clicks en `document` y resuelve por `closest([data-frj-lightbox])` sobre el
// markup que ya emitió el server. Las secciones solo emiten atributos.
//
// CAJA NEGRA DEL BOOKING (D-07): el overlay se portalea a document.body con createPortal, así
// que NUNCA es ancestro de <section id="reservar"> ni de ningún nodo del widget. Ningún
// ancestro del booking recibe transform/overflow/filter/perspective → el position:fixed de
// vaul (drawers), sonner (toasts) y react-day-picker (popover) sigue intacto.
//
// LOS DOS BUGS QUE ESTE ARCHIVO EVITA (ya sufridos en PRODUCCIÓN en el CMS hermano
// webs-cms-forjostudio/components/sections/Lightbox.tsx — NO son paranoia, son cicatrices):
//   1) pushState SIN HASH → el router colapsa la entrada → el "atrás" del celular saca al
//      usuario DEL SITIO en vez de cerrar el visor. Ver el efecto de historial.
//   2) El click de la X BURBUJEA al backdrop → cierre doble → dos history.back() seguidos →
//      el usuario sale de la página. Ver stopPropagation + closingRef.

type View = {
  images: string[]
  index: number
  // Id monotónico de APERTURA. Discrimina "se abrió el visor" de "se cambió de foto": los
  // efectos de apertura (posicionar el track, enfocar la X) cuelgan de este id, así que NO
  // vuelven a correr al navegar — si colgaran de `index`, cada flecha le robaría el foco al
  // botón que la disparó.
  openId: number
}

export function PhotoLightbox() {
  const [view, setView] = useState<View | null>(null)

  // Cierre IDEMPOTENTE (bug 2): una vez que el cierre arrancó, cualquier segundo disparo
  // (el burbujeo, un popstate que llega tarde, un doble tap) es un no-op. Sin esto, dos
  // cierres = dos history.back() = el usuario fuera de la página.
  const closingRef = useRef(false)
  // El <button> que abrió el visor: al cerrar le devolvemos el foco (a11y).
  const triggerRef = useRef<HTMLElement | null>(null)
  const trackRef = useRef<HTMLDivElement | null>(null)
  const overlayRef = useRef<HTMLDivElement | null>(null)
  const closeBtnRef = useRef<HTMLButtonElement | null>(null)
  // Índice con el que se ABRIÓ (lo lee el efecto de posicionamiento inicial sin depender de
  // `view`, que cambia en cada navegación).
  const openIndexRef = useRef(0)
  const openIdRef = useRef(0)

  const isOpen = view !== null
  const openId = view?.openId

  // ── Apertura por DELEGACIÓN de clicks ──────────────────────────────────────────────
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const target = e.target
      if (!(target instanceof Element)) return
      const el = target.closest<HTMLElement>(`[${LIGHTBOX_GROUP_ATTR}]`)
      if (!el) return

      const group = el.getAttribute(LIGHTBOX_GROUP_ATTR)
      if (!group) return

      // Scope: las fotos del MISMO grupo dentro del MISMO .frj-site (si algún día conviven dos
      // landings en una página — p. ej. el preview del editor — no se mezclan los carruseles).
      const root: ParentNode = el.closest('.frj-site') ?? document
      const nodes = Array.from(
        root.querySelectorAll<HTMLElement>(`[${LIGHTBOX_GROUP_ATTR}="${group}"]`),
      )
      // Orden de DOM = orden visual de la grilla → el carrusel respeta lo que ve el usuario.
      const images = nodes
        .map((n) => n.getAttribute(LIGHTBOX_SRC_ATTR))
        .filter((src): src is string => Boolean(src))
      if (images.length === 0) return

      const index = Math.max(0, nodes.indexOf(el))

      triggerRef.current = el
      closingRef.current = false
      openIndexRef.current = index
      openIdRef.current += 1
      setView({ images, index, openId: openIdRef.current })
    }

    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [])

  // ── Cierre desde la UI (X / backdrop / Esc) — IDEMPOTENTE ───────────────────────────
  const closeFromUi = useCallback(() => {
    // BUG 2, la guarda: si ya estamos cerrando, ni setState ni —sobre todo— un segundo
    // history.back(). Dos back() seguidos expulsan al usuario del sitio.
    if (closingRef.current) return
    closingRef.current = true
    setView(null)

    // Consumimos la entrada que empujamos al abrir, PERO solo si arriba del stack está
    // NUESTRA marca (shouldConsumeHistoryEntry, testeado). Si el state no es nuestro, el
    // back() se comería una entrada ajena → adiós página.
    if (shouldConsumeHistoryEntry(window.history.state)) {
      window.history.back()
    }

    // Foco de vuelta a la foto que abrió el visor (a11y: el foco no se pierde en el <body>).
    triggerRef.current?.focus()
  }, [])

  // ── Historial: que el "atrás" del celular CIERRE el visor ───────────────────────────
  useEffect(() => {
    if (!isOpen) return

    // EL HASH ES LO QUE HACE QUE ESTO FUNCIONE (bug 1). Pushear la MISMA URL sin hash hace que
    // el router COLAPSE la entrada: no se crea ninguna entrada nueva, así que el "atrás" del
    // celular no tiene nada que deshacer y NAVEGA FUERA DEL SITIO. Con el hash la entrada
    // existe de verdad, y el "atrás" la consume cerrando el visor.
    window.history.pushState({ frjLightbox: true }, '', LIGHTBOX_HASH)

    const onPop = () => {
      // El usuario apretó "atrás": la entrada YA la consumió el browser. Acá SOLO cerramos.
      // Llamar history.back() de nuevo desde acá sería el doble back() que expulsa al usuario.
      closingRef.current = true
      setView(null)
      triggerRef.current?.focus()
    }

    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [isOpen])

  // ── Mecánica del carrusel: EL SCROLL MANDA, el índice lo sigue ──────────────────────
  //
  // Modelo copiado de dongiovanni-web (probado en producción). El índice NO ordena el scroll:
  // se DERIVA de él. Consecuencias, todas buenas:
  //   · el atenuado/peek de las vecinas sigue al dedo EN VIVO durante el swipe;
  //   · las flechas leen el scroll REAL y piden scrollTo smooth → nunca hay dos fuentes de verdad
  //     que se desincronicen, y el snap del navegador no tiene contra qué pelear.
  // El modelo anterior (estado → `scrollLeft = x`) causaba el bug de iPhone: Safari revierte el
  // scroll programático en un track con `scroll-snap-type: mandatory` → las flechas morían.

  /** Paso entre slides, medido del DOM real (ancho + gap). */
  const stepOf = useCallback((track: HTMLElement): number => {
    const a = track.children[0]
    const b = track.children[1]
    return slideStep({
      firstOffsetLeft: a instanceof HTMLElement ? a.offsetLeft : 0,
      secondOffsetLeft: b instanceof HTMLElement ? b.offsetLeft : null,
      fallbackWidth: track.clientWidth,
    })
  }, [])

  // Flechas y teclado: leen el scroll VIGENTE, suman ±1 y piden un scroll suave. CLAMPEADO (no da
  // la vuelta): en los extremos la flecha se deshabilita, como en la referencia.
  const go = useCallback(
    (dir: number) => {
      const track = trackRef.current
      if (!track) return
      const count = track.children.length
      if (count === 0) return
      const step = stepOf(track)
      const target = clampIndex(Math.round(track.scrollLeft / step) + dir, count)
      track.scrollTo({ left: scrollLeftForIndex(target, step), behavior: 'smooth' })
    },
    [stepOf],
  )

  // El índice activo (resaltado + contador) se recalcula del scroll real. Es lo que hace que el
  // peek acompañe al dedo en vez de saltar recién al soltar.
  const onTrackScroll = useCallback(() => {
    const track = trackRef.current
    if (!track) return
    const count = track.children.length
    const next = indexFromScroll({
      scrollLeft: track.scrollLeft,
      step: stepOf(track),
      count,
    })
    setView((v) => (v && v.index !== next ? { ...v, index: next } : v))
  }, [stepOf])

  // ── Apertura: centrar YA en la foto tocada + foco en la X ───────────────────────────
  useEffect(() => {
    if (openId === undefined) return
    const track = trackRef.current
    if (!track) return
    // Salto INSTANTÁNEO (scrollLeft directo, sin smooth): al abrir, la foto tocada tiene que estar
    // centrada de una, no scrollear desde el borde. Acá el snap no molesta porque no hay animación
    // que revertir. openIndexRef = el índice con el que se abrió.
    track.scrollLeft = scrollLeftForIndex(openIndexRef.current, stepOf(track))
    // Foco al abrir → la X (a11y: el foco entra al diálogo, no queda atrás en la página).
    closeBtnRef.current?.focus()
  }, [openId, stepOf])

  // NOTA: ya no hay IntersectionObserver para marcar el slide activo. El índice se deriva del
  // scroll (onTrackScroll) y de ahí sale tanto el resaltado como el contador — una sola fuente de
  // verdad, y el peek acompaña al dedo en vivo.

  // ── Teclado: Esc cierra, ←/→ navegan, Tab cicla dentro del overlay ──────────────────
  useEffect(() => {
    if (!isOpen) return

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeFromUi()
        return
      }
      if (e.key === 'ArrowRight') {
        go(1)
        return
      }
      if (e.key === 'ArrowLeft') {
        go(-1)
        return
      }
      // Trampa de foco mínima: el Tab cicla entre los botones del overlay y no se escapa al
      // contenido de atrás (que para el lector de pantalla ya no existe: aria-modal).
      if (e.key === 'Tab') {
        const focusables = overlayRef.current?.querySelectorAll('button')
        if (!focusables || focusables.length === 0) return
        const list = Array.from(focusables)
        const i = list.indexOf(document.activeElement as HTMLButtonElement)
        const next = wrapIndex(e.shiftKey ? i - 1 : i + 1, list.length)
        e.preventDefault()
        list[next].focus()
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, go, closeFromUi])

  // ── Scroll lock del fondo ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return
    // `overflow` en <body> NO crea containing block (a diferencia de `transform`): el
    // position:fixed de vaul/sonner/react-day-picker sigue funcionando. Por eso el lock se
    // hace así y no con un wrapper transformado.
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [isOpen])

  if (!view) return null

  const multiple = view.images.length > 1

  // createPortal a document.body: fuera de .frj-site, fuera de cualquier ancestro con
  // transform/overflow, y JAMÁS ancestro del widget de reserva (caja negra, D-07).
  return createPortal(
    <div
      ref={overlayRef}
      className="frj-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label="Visor de fotos"
      // El backdrop cierra al click. Todo lo que está ADENTRO frena el burbujeo (abajo): si no,
      // el click en la X llegaría hasta acá y cerraría DOS veces (bug 2).
      onClick={closeFromUi}
    >
      <button
        ref={closeBtnRef}
        type="button"
        className="frj-lb-btn absolute right-[16px] top-[16px]"
        aria-label="Cerrar"
        onClick={(e) => {
          // BUG 2: sin este stopPropagation el click sube al backdrop → cierre doble → dos
          // history.back() → el usuario SALE de la página. Bug real, no una precaución teórica.
          e.stopPropagation()
          closeFromUi()
        }}
      >
        <X className="size-5" aria-hidden="true" />
      </button>

      {/* Flechas: CLAMPEADAS (no dan la vuelta) → se deshabilitan en los extremos, como la
          referencia. En CELULAR no se muestran (frj-lb-nav las oculta ≤768px): ahí se navega con
          swipe nativo, que es más natural que apuntarle a un botón chico con el pulgar. */}
      {multiple && (
        <>
          <button
            type="button"
            className="frj-lb-btn frj-lb-nav absolute left-[12px] top-1/2 -translate-y-1/2"
            aria-label="Anterior"
            disabled={view.index === 0}
            onClick={(e) => {
              e.stopPropagation() // navegar NO es cerrar (bug 2)
              go(-1)
            }}
          >
            <ChevronLeft className="size-6" aria-hidden="true" />
          </button>
          <button
            type="button"
            className="frj-lb-btn frj-lb-nav absolute right-[12px] top-1/2 -translate-y-1/2"
            aria-label="Siguiente"
            disabled={view.index >= view.images.length - 1}
            onClick={(e) => {
              e.stopPropagation() // navegar NO es cerrar (bug 2)
              go(1)
            }}
          >
            <ChevronRight className="size-6" aria-hidden="true" />
          </button>
        </>
      )}

      {/* Track: scroll-snap NATIVO. El swipe del celular sale gratis — PROHIBIDO agregar
          touch/drag handlers (D-01). El stopPropagation evita que tocar el carrusel cierre.
          onScroll: de acá sale el índice activo (el scroll manda) → el resaltado sigue al dedo. */}
      <div
        ref={trackRef}
        className="frj-lb-track"
        onScroll={onTrackScroll}
        onClick={(e) => e.stopPropagation()}
      >
        {view.images.map((src, i) => (
          <figure
            key={`${src}-${i}`}
            // is-active sale del índice DERIVADO del scroll (ya no de un IntersectionObserver):
            // una sola fuente de verdad para el resaltado y el contador.
            className={i === view.index ? 'frj-lb-slide is-active' : 'frj-lb-slide'}
            // El click en la FIGURA tampoco cierra (bug 2): tocar la foto no es tocar el fondo.
            onClick={(e) => e.stopPropagation()}
          >
            <div className="frj-lb-frame">
              <Image
                src={src}
                alt=""
                fill
                sizes="(min-width: 768px) 58vw, 80vw"
                // La foto que se abre carga ya; las vecinas lazy (el peek las trae igual).
                loading={i === view.index ? undefined : 'lazy'}
                className="object-contain"
              />
            </div>
          </figure>
        ))}
      </div>

      {/* Contador n/total: en celular es la ÚNICA señal de posición (no hay flechas). */}
      {multiple && (
        <div className="frj-lb-counter" aria-live="polite">
          {view.index + 1} / {view.images.length}
        </div>
      )}
    </div>,
    document.body,
  )
}
