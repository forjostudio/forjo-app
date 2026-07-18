// Espejo invertido de PaletteScript: fuerza el tema Forjo base sobre <html>, antes de pintar.
//   data-palette = 'red'         → default del root layout (app/layout.tsx:59) = "tema Forjo base"
//   delete data-theme/data-font  → los defaults Forjo son la AUSENCIA del atributo
//   removeProperty('--primary')  → limpia el override de acento que un /[slug] (landing) pudo dejar inline
// Script INLINE (no useEffect): React lo ejecuta sincrónicamente en el commit, ANTES del paint del
// nuevo route → sin flash de la paleta del tenant en el soft-nav de logout. Un useEffect correría
// post-paint = se vería un frame con la paleta del negocio.
// Todos los valores son literales estáticos (no interpola input del usuario, la DB ni la URL) → a
// diferencia de PaletteScript no hace falta JSON.stringify: cero superficie de inyección.
// NUNCA toca classList ni la clase .dark: ese eje (claro/oscuro) es de next-themes (ortogonal, D-03).
// Server Component (sin 'use client'), igual que PaletteScript.
export function ResetThemeScript() {
  const js =
    `(()=>{const e=document.documentElement,d=e.dataset;` +
    `d.palette='red';` +
    `delete d.theme;` +
    `delete d.font;` +
    `e.style.removeProperty('--primary');` +
    `})()`
  return <script dangerouslySetInnerHTML={{ __html: js }} />
}
