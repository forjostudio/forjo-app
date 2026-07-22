// ── Color de texto legible sobre un color de marca arbitrario (IN-05) ───────────────────────────
//
// `businesses.primary_color` lo edita el DUEÑO desde su panel: puede ser un bordó, pero también un
// amarillo o un pastel. Las superficies públicas venían pintando el texto de los CTA con blanco fijo
// sobre ese color, así que con un primario claro el botón principal de una acción DESTRUCTIVA (dar de
// baja el turno fijo) quedaba por debajo del 4.5:1 que exige WCAG AA para texto normal.
//
// LIMITACIÓN HONESTA: con acentos de luminancia intermedia (grises medios, algunos verdes) NINGUNO de
// los dos candidatos llega a 4.5:1 — no existe un texto legible sobre ese fondo y elegir "el mejor de
// los dos" es lo máximo que se puede hacer sin cambiarle el color de marca al negocio. Por eso el foco
// visible de los CTA NO se deriva del acento: usa los tokens del design system (`--ring` sobre
// `--background`), que sí tienen contraste garantizado.
//
// Los dos candidatos son los que el proyecto ya usa sobre superficies de marca: blanco puro y el
// near-black `#1a1714` (presente en los headers de los mails de admin, en las paletas de globals.css
// y en components/crm/impersonation-banner.tsx). No se inventa ningún color nuevo.

const WHITE = '#ffffff'
const NEAR_BLACK = '#1a1714'

/** Canales 0..255 de un hex de 3 o 6 dígitos, con o sin `#`. `null` si no parsea. */
function parseHex(hex: string): [number, number, number] | null {
  if (typeof hex !== 'string') return null
  const h = hex.trim().replace(/^#/, '')
  if (!/^[0-9a-fA-F]+$/.test(h)) return null
  if (h.length === 3) {
    return [
      parseInt(h[0] + h[0], 16),
      parseInt(h[1] + h[1], 16),
      parseInt(h[2] + h[2], 16),
    ]
  }
  if (h.length === 6) {
    return [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16),
    ]
  }
  return null
}

/** Luminancia relativa WCAG 2.x: canal normalizado a 0..1, linearizado con la curva sRGB. */
function relativeLuminance([r, g, b]: [number, number, number]): number {
  const lin = (channel: number) => {
    const c = channel / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

/** Ratio de contraste WCAG entre dos luminancias: (Lclaro + 0.05) / (Loscuro + 0.05). */
function contrastRatio(a: number, b: number): number {
  const light = Math.max(a, b)
  const dark = Math.min(a, b)
  return (light + 0.05) / (dark + 0.05)
}

/**
 * Devuelve el color de texto con MÁS contraste sobre `hex`: blanco o el near-black del proyecto.
 *
 * Entrada que no parsea (vacía, un nombre de color, basura) → blanco: es el comportamiento que estas
 * pantallas ya tenían, así que el fallback no regresiona nada.
 */
export function onAccentText(hex: string): '#ffffff' | '#1a1714' {
  const rgb = parseHex(hex)
  if (!rgb) return WHITE

  const bg = relativeLuminance(rgb)
  const withWhite = contrastRatio(bg, relativeLuminance([255, 255, 255]))
  const withNearBlack = contrastRatio(bg, relativeLuminance([26, 23, 20]))

  return withNearBlack > withWhite ? NEAR_BLACK : WHITE
}
