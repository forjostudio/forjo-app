'use client'

// ── ServiceDescription ──────────────────────────────────────────────────────────────────────────
//
// POR QUÉ EXISTE (G-23-6): el panel deja escribir una descripción de hasta 120 caracteres (CAT-11)
// con la promesa de que lo que el dueño escribe es lo que el cliente lee. La tarjeta pública nunca
// lo cumplió: la descripción compartía fila con el precio y a 375px le quedaban 181-229px, donde en
// dos renglones entran 59-84 caracteres (medido en Chrome, 5 tipografías × 3 precios). El tope de
// 120 se mantiene (decisión del usuario del 2026-09-17); lo que cambia es cómo se muestra, portando
// el patrón de `forjo-tiendas` (`CatalogoLista.tsx`, `FilaDeProducto`): recorte a pocos renglones y
// un "Ver más"/"Ver menos" que aparece SÓLO si el texto desborda medido en pantalla.
//
// QUÉ HACE: pinta la descripción como texto (auto-escape de React, nunca HTML) recortada a tres
// renglones, mide si desborda con un ResizeObserver (y otra vez cuando termina de cargar la
// tipografía) y, sólo entonces, ofrece el botón que la abre y la vuelve a cerrar.
//
// QUÉ NO HACE: no decide ancho ni tipografía —eso es del call site, por `className`— y nunca cuenta
// caracteres. Contar letras no sabe cuánto mide un renglón en cada teléfono, con cada tipografía y
// con el tamaño de letra del sistema: el resultado sería un "Ver más" debajo de un texto que ya se
// lee entero, o un texto cortado sin salida.

import { useEffect, useId, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

/**
 * ¿El texto necesita más alto del que le deja el recorte?
 *
 * El `+ 1` absorbe el redondeo subpíxel: con zoom o densidades fraccionarias `scrollHeight` puede
 * dar un píxel más que `clientHeight` aunque el último renglón entre entero, y eso pintaría un
 * "Ver más" que no abre nada.
 */
export function descriptionOverflows(scrollHeight: number, clientHeight: number): boolean {
  return scrollHeight > clientHeight + 1
}

/**
 * ¿Se muestra el botón? Si desborda, para abrirla; y si está abierta, siempre: es la única forma de
 * volver a cerrarla (abierta ya no desborda, así que la medición sola lo escondería).
 */
export function showDescriptionToggle(overflows: boolean, expanded: boolean): boolean {
  return overflows || expanded
}

export function ServiceDescription({
  text,
  name,
  id,
  className,
  toggleClassName,
}: {
  text: string
  /** Nombre del servicio: contexto del botón para lectores de pantalla. */
  name: string
  /** Id del párrafo (para `aria-describedby`/`aria-controls`). Si no llega, se genera uno. */
  id?: string
  className?: string
  toggleClassName?: string
}) {
  const generatedId = useId()
  const paragraphId = id ?? generatedId
  const paragraphRef = useRef<HTMLParagraphElement>(null)
  const [expanded, setExpanded] = useState(false)
  // Arranca en `false`: en el servidor no hay pantalla que medir. Así el HTML del servidor y el
  // primer render del cliente coinciden (sin botón) y el "Ver más" aparece recién al medir.
  const [overflows, setOverflows] = useState(false)

  useEffect(() => {
    const el = paragraphRef.current
    // Abierta no se mide: sin recorte nunca desborda, y el botón ya se muestra por `expanded`.
    if (!el || expanded) return

    let cancelled = false
    const measure = () => setOverflows(descriptionOverflows(el.scrollHeight, el.clientHeight))

    // No se mide en el cuerpo del efecto: el observador entrega su primera notificación apenas
    // empieza a observar, y un setState sincrónico acá lo marca `react-hooks/set-state-in-effect`.
    // Vuelve a medir cuando cambia el ancho (girar el teléfono, la grilla de desktop).
    const observer = new ResizeObserver(measure)
    observer.observe(el)

    // Y una vez más cuando termina de cargar la tipografía: el cambio de fuente puede pasar el texto
    // de 3 a 4 renglones sin cambiar el alto de la caja recortada, y ahí el observador no dispara.
    document.fonts?.ready.then(() => {
      if (!cancelled) measure()
    })

    return () => {
      cancelled = true
      observer.disconnect()
    }
  }, [expanded, text])

  return (
    <>
      <p
        id={paragraphId}
        ref={paragraphRef}
        // Tres renglones, no dos (medido en la sesión de debug de G-23-6): a ancho completo de la
        // tarjeta (293px útiles a 375px) con dos renglones entran 89-107 caracteres y 120 no entra;
        // con tres entran 131-163 a 375px y 131-150 a 360px, así el caso de diseño (mobile) se lee
        // entero sin botón. `break-words`: una palabra larga sin espacios parte en renglones en vez
        // de quedar recortada en uno solo.
        className={cn('break-words', !expanded && 'line-clamp-3', className)}
      >
        {text}
      </p>
      {showDescriptionToggle(overflows, expanded) && (
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={paragraphId}
          onClick={() => setExpanded(e => !e)}
          // Área táctil de 44px (`min-h-11`) sin romper el ritmo de la tarjeta: los márgenes
          // negativos (8 arriba, 12 abajo, múltiplos de 4) le devuelven al flujo 20 de esos píxeles,
          // así la tarjeta no gana un renglón vacío. Es la medida de `forjo-tiendas` llevada a la
          // grilla de 4.
          className={cn(
            '-mt-2 -mb-3 flex min-h-11 w-fit cursor-pointer items-center rounded-sm underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            toggleClassName
          )}
        >
          {expanded ? 'Ver menos' : 'Ver más'}
          {/* En una lista de N tarjetas un lector de pantalla oiría N veces "Ver más" sin contexto.
              El texto visible queda al principio del nombre accesible (WCAG 2.5.3). */}
          <span className="sr-only"> sobre “{name}”</span>
        </button>
      )}
    </>
  )
}
