// Aplica SOLO los overrides de tema que llegan por query param en la reserva pública
// (caso EMBED: la web anfitriona manda su look para que el wizard matchee el sitio).
//
// Por qué existe además de PaletteScript: aquél SIEMPRE setea las tres claves (palette con
// default 'red', y borra data-theme/data-font cuando no se las pasa). Si lo reusáramos para
// pisar una sola clave, clobbearía las otras dos que el layout ya resolvió bien. Éste, en
// cambio, escribe únicamente lo que recibe y deja el resto intacto.
//
// Se renderiza DESPUÉS del PaletteScript del layout (layout → children), así que gana por orden
// de ejecución. Sigue siendo pre-paint: es un <script> inline en el server component, no un efecto.
//
// Los valores llegan ya validados por allowlist (parseThemeOverrides / isSafeColor). El
// JSON.stringify es defensa en profundidad anti-inyección, igual que en palette-script.tsx.
export function ThemeOverrideScript({
  palette,
  theme,
  font,
  primary,
}: {
  palette?: string
  theme?: string
  font?: string
  primary?: string
}) {
  const sets: string[] = []
  if (palette) sets.push(`d.palette=${JSON.stringify(palette)};`)
  // 'forjo' y 'auto' son "sin atributo" (mismo criterio que PaletteScript).
  if (theme) sets.push(theme === 'forjo' ? `delete d.theme;` : `d.theme=${JSON.stringify(theme)};`)
  if (font) sets.push(font === 'auto' ? `delete d.font;` : `d.font=${JSON.stringify(font)};`)
  if (primary) {
    sets.push(`document.documentElement.style.setProperty('--primary',${JSON.stringify(primary)});`)
  }

  if (sets.length === 0) return null

  const js = `(()=>{const d=document.documentElement.dataset;${sets.join('')}})()`
  return <script dangerouslySetInnerHTML={{ __html: js }} />
}
