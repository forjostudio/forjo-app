'use client'

import { useLayoutEffect } from 'react'

// Aplica el estilo visual a <html> cuando se llega por navegación SIN recarga (router.push, Link).
//
// POR QUÉ existe además de PaletteScript / ResetThemeScript: esos son <script> inline y solo corren
// cuando el HTML llega del server (carga en frío). En una navegación del cliente React monta el
// <script> a propósito sin ejecutarlo ("Scripts inside React components are never executed when
// rendering on the client", react-dom-client). Medido en prod: al cerrar sesión desde el panel,
// /login quedaba con la fuente y el tema del negocio porque el reset nunca corría.
//
// useLayoutEffect y no useEffect: corre después de mutar el DOM y ANTES de pintar → sin un frame
// con el tema equivocado. Sin props = tema Forjo base (lo que usa auth).
//
// Al desmontarse vuelve al tema Forjo base: salir del panel o de la vista "ver como" del CRM no deja
// el tema del negocio pegado en la pantalla siguiente. Si la siguiente monta su propio ThemeSync, su
// efecto corre después de este cleanup (mismo commit) y gana.
//
// NO se usa en /[slug]: ahí ThemeOverrideScript (embed) pisa claves después de PaletteScript, y este
// efecto —del layout, que corre DESPUÉS que los de la página— se las volvería a pisar al hidratar.
// NUNCA toca classList / .dark: ese eje es de next-themes.
export function ThemeSync({
  palette,
  theme,
  font,
}: {
  palette?: string | null
  theme?: string | null
  font?: string | null
}) {
  // Misma normalización que PaletteScript: 'forjo' y 'auto' son "sin atributo".
  const pal = palette || 'red'
  const th = theme && theme !== 'forjo' ? theme : ''
  const ft = font && font !== 'auto' ? font : ''

  useLayoutEffect(() => {
    const e = document.documentElement
    const d = e.dataset
    d.palette = pal
    if (th) d.theme = th
    else delete d.theme
    if (ft) d.font = ft
    else delete d.font
    // Override de acento que un /[slug] (landing) pudo dejar inline.
    e.style.removeProperty('--primary')
    return () => {
      d.palette = 'red'
      delete d.theme
      delete d.font
    }
  }, [pal, th, ft])

  return null
}
