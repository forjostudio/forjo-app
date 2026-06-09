// Setea el estilo visual del negocio en <html> antes de pintar (sin flash):
//   data-palette  → siempre (default 'red')
//   data-theme    → solo si NO es 'forjo' (forjo = sin atributo, como el preview)
//   data-font     → solo si NO es 'auto'  (auto  = fuente nativa del theme)
// Las variantes de modo oscuro usan .dark[data-theme=x][data-palette=x] en el MISMO
// <html>; next-themes maneja la clase .dark sobre ese elemento.
export function PaletteScript({
  palette,
  theme,
  font,
}: {
  palette?: string | null
  theme?: string | null
  font?: string | null
}) {
  const pal = palette || 'red'
  const th = theme && theme !== 'forjo' ? theme : ''
  const ft = font && font !== 'auto' ? font : ''
  const js =
    `(()=>{const d=document.documentElement.dataset;` +
    `d.palette=${JSON.stringify(pal)};` +
    (th ? `d.theme=${JSON.stringify(th)};` : `delete d.theme;`) +
    (ft ? `d.font=${JSON.stringify(ft)};` : `delete d.font;`) +
    `})()`
  return <script dangerouslySetInnerHTML={{ __html: js }} />
}
