// Espejo invertido de PaletteScript: fuerza el tema Forjo base sobre <html>, antes de pintar.
//   data-palette = 'red'         → default del root layout (app/layout.tsx:59) = "tema Forjo base"
//   delete data-theme/data-font  → los defaults Forjo son la AUSENCIA del atributo
//   removeProperty('--primary')  → limpia el override de acento que un /[slug] (landing) pudo dejar inline
// Script INLINE: corre mientras el navegador parsea el HTML del server, antes de pintar → cubre la
// carga en frío de /login. NO cubre el soft-nav del logout: React monta los <script> del cliente
// sin ejecutarlos (se suponía lo contrario y en prod la fuente del negocio quedaba pegada). Ese caso
// lo cubre ThemeSync (components/theme-sync.tsx), al lado de este en app/(auth)/layout.tsx.
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
