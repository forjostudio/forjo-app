// Setea el estilo visual del negocio en <html> antes de pintar (sin flash):
//   data-palette  → siempre (default 'red')
//   data-theme    → solo si NO es 'forjo' (forjo = sin atributo, como el preview)
//   data-font     → solo si NO es 'auto'  (auto  = fuente nativa del theme)
//   --primary     → solo si llega `primary` (override del landing, Phase 8 / THEME-03)
// Las variantes de modo oscuro usan .dark[data-theme=x][data-palette=x] en el MISMO
// <html>; next-themes maneja la clase .dark sobre ese elemento.
export function PaletteScript({
  palette,
  theme,
  font,
  primary,
}: {
  palette?: string | null
  theme?: string | null
  font?: string | null
  // Override opcional del color de acento del landing (solo /[slug]). YA viene validado por
  // isSafeColor (allowlist hex, lib/landing/theme.ts) — el dashboard lo llama sin esta prop.
  // MVP: pisamos SOLO --primary (no --accent/--ring/--primary-foreground); la legibilidad del
  // texto sobre primary se verifica en el checkpoint humano (Task 3). El JSON.stringify es
  // defensa en profundidad anti-injection aunque el valor ya esté validado upstream.
  primary?: string | null
}) {
  const pal = palette || 'red'
  const th = theme && theme !== 'forjo' ? theme : ''
  const ft = font && font !== 'auto' ? font : ''
  const js =
    `(()=>{const d=document.documentElement.dataset;` +
    `d.palette=${JSON.stringify(pal)};` +
    (th ? `d.theme=${JSON.stringify(th)};` : `delete d.theme;`) +
    (ft ? `d.font=${JSON.stringify(ft)};` : `delete d.font;`) +
    (primary
      ? `document.documentElement.style.setProperty('--primary',${JSON.stringify(primary)});`
      : '') +
    `})()`
  return <script dangerouslySetInnerHTML={{ __html: js }} />
}
