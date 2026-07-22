'use client'

import { useEffect } from 'react'

// Publica el alto real del contenido al documento padre para que un iframe embebido pueda
// auto-ajustarse (la web del cliente escucha y setea iframe.style.height).
//
// Contrato del mensaje:  { type: 'forjo:height', px: number }
//
// Del lado del embebedor:
//   window.addEventListener('message', (e) => {
//     if (e.origin !== 'https://gestion.forjo.studio') return
//     if (e.data?.type === 'forjo:height') iframe.style.height = e.data.px + 'px'
//   })
//
// TRAMPA (por la que este componente va de la mano del modo embed): el wizard monta sobre un
// contenedor `min-h-screen`. Si midiéramos con eso puesto, el contenido SIEMPRE llenaría el alto
// del iframe → la altura reportada nunca bajaría y quedaría un trinquete que solo crece. Por eso
// la página, en modo embed, neutraliza ese min-height antes de medir.
//
// targetOrigin '*': no conocemos el origen del embebedor (es la web de cada cliente) y lo único
// que se publica es un número de píxeles — sin datos sensibles. Quien escucha SÍ debe validar
// e.origin, como muestra el ejemplo de arriba.
export function EmbedHeightReporter() {
  useEffect(() => {
    // Solo tiene sentido dentro de un iframe.
    if (window.parent === window) return

    let last = 0
    let raf = 0

    // Medimos el WRAPPER del embed, no el body ni el documentElement. Motivo (bug real, visto en
    // pruebas): `documentElement.scrollHeight` —y en la práctica también el body— nunca es MENOR
    // al alto del viewport del iframe. Si lo usás para reportar, en cuanto el iframe crece la
    // medición queda anclada a ese alto y ya no puede bajar: trinquete que solo sube. El wrapper
    // (con min-height neutralizado por EMBED_CSS) sí mide contenido puro, así que la altura sube
    // Y baja según el paso del wizard.
    const target = document.querySelector('.forjo-embed')

    const measure = () => {
      const el = target || document.body
      const px = Math.ceil(el.getBoundingClientRect().height)
      if (px > 0 && Math.abs(px - last) > 1) {
        last = px
        window.parent.postMessage({ type: 'forjo:height', px }, '*')
      }
    }

    const schedule = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(measure)
    }

    schedule()

    // Observamos el mismo elemento que medimos: si observáramos el body, su alto queda pegado al
    // viewport del iframe y el observer no dispararía cuando el contenido se achica.
    const ro = new ResizeObserver(schedule)
    ro.observe(target || document.body)

    // Cambios de paso del wizard que no alteran el tamaño observado (imágenes, fuentes, re-render).
    window.addEventListener('load', schedule)
    const mo = new MutationObserver(schedule)
    mo.observe(target || document.body, { childList: true, subtree: true })

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      mo.disconnect()
      window.removeEventListener('load', schedule)
    }
  }, [])

  return null
}
