// Puente cliente entre la reserva pública embebida y la web anfitriona que la mete en un iframe.
// Mensaje que sale de acá (el alto pasivo lo publica embed-height-reporter.tsx aparte):
//   { type: 'forjo:scrollto', top, height }  → "traé a la vista este punto de mi contenido"
//     `top`    = offset Y (px) del elemento objetivo DENTRO del documento del iframe.
//     `height` = alto total del contenido del embed (px), para que el host agrande el iframe
//                ANTES de scrollear.
//
// Por qué existe: en modo embed inline el iframe NO tiene scroll interno (crece a lo alto), así que
// el scrollIntoView del wizard scrollea "dentro" del iframe y no hace nada útil. El scroll que
// importa es el de la PÁGINA anfitriona, que el iframe no controla por ser cross-origin. Y el host
// tampoco puede leer dónde está el calendario dentro del iframe: por eso el wizard le manda el
// offset ya calculado.
//
// Por qué el `height` va en el MISMO mensaje (bug real, visto en pruebas): el alto pasivo del
// reporter y el scroll son mensajes distintos que corren una carrera. Si el host scrollea cuando el
// iframe todavía está BAJO, la página no es lo bastante alta y el scroll se clampea corto. Mandando
// el alto acá, el host lo aplica primero y después scrollea sobre un destino ya válido.
//
// targetOrigin '*': no conocemos el origen del embebedor (la web de cada cliente). El payload no
// lleva datos sensibles — solo coordenadas de reposición. Quien escucha DEBE validar e.origin.

export function isEmbedded(): boolean {
  try {
    return typeof window !== 'undefined' && window.parent !== window
  } catch {
    // Acceso a window.parent puede tirar en contextos exóticos; ante la duda, no somos embed.
    return false
  }
}

// Mide el offset del target y el alto total del embed, y los publica. `el` es el elemento que el
// wizard quiere traer a la vista. `getBoundingClientRect().top + scrollY` da su posición absoluta
// aunque el iframe tenga scroll interno transitorio. El alto se mide del wrapper `.forjo-embed`
// (con min-height neutralizado por EMBED_CSS) — el body/documentElement no sirven porque su alto
// queda pegado al viewport del iframe (el trinquete de embed-height-reporter).
export function notifyEmbedScroll(el: HTMLElement): void {
  if (!isEmbedded()) return
  try {
    const top = Math.max(0, Math.round(el.getBoundingClientRect().top + window.scrollY))
    const wrap = document.querySelector('.forjo-embed') as HTMLElement | null
    const height = wrap ? Math.ceil(wrap.getBoundingClientRect().height) : undefined
    window.parent.postMessage({ type: 'forjo:scrollto', top, height }, '*')
  } catch {
    /* no-op: si el padre rechaza el mensaje, el embed simplemente no reposiciona */
  }
}
