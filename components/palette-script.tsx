// Setea data-palette en <html> antes de pintar, para que las variantes de paleta
// (incluidas las de modo oscuro, que usan .dark[data-palette=x] en el MISMO elemento)
// apliquen sin flash. next-themes maneja la clase .dark sobre el mismo <html>.
export function PaletteScript({ palette }: { palette?: string | null }) {
  const value = palette || 'red'
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `document.documentElement.dataset.palette=${JSON.stringify(value)}`,
      }}
    />
  )
}
