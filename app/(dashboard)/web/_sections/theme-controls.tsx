'use client'

import { Check } from 'lucide-react'
import type { LandingTheme } from '@/lib/landing/schema'
import {
  THEMES,
  THEME_PALETTES,
  THEME_DEFAULT_PAL,
  FONTS,
  normalizeTheme,
  normalizePalette,
  normalizeFont,
} from '@/lib/theme-config'
import { cn } from '@/lib/utils'

// ── ThemeControls (Phase 14, EDIT-04) ────────────────────────────────────────────────
// Controles de estilo visual de la LANDING (NO del chrome del panel): preset + paleta + color
// principal + nivel de movimiento. Espeja ESTRUCTURALMENTE los grids de swatches de
// settings-client.tsx (líneas 852-999) — mismo markup/active-state — pero cambia el TARGET:
// escribe SIEMPRE a landing_config.theme (preset + overrides.palette + overrides.primary) y a
// config.motion, NUNCA a las columnas de chrome del panel (theme/palette/font del negocio) (D-06).
// Eso mantiene separados el chrome del dashboard y el estilo de la página pública (landing_config).
// El shell
// (web-client.tsx) cablea onChange/onMotionChange a los mutadores puros setTheme/setMotion del
// borrador y recomputa resolveLandingTheme sobre el wrapper del preview → cambio en vivo.

const MOTION_OPTIONS = [
  { key: 'none', label: 'Sin movimiento' },
  { key: 'subtle', label: 'Sutil' },
  { key: 'premium', label: 'Premium' },
] as const

export interface ThemeControlsProps {
  theme: LandingTheme
  // Patch parcial del tema; el shell lo aplica con setTheme(draft, patch).
  // `primary` YA NO se expone (ver nota abajo), pero el patch lo sigue admitiendo porque setTheme
  // es genérico; el editor simplemente no lo emite nunca.
  onChange: (patch: { preset?: string; palette?: string; font?: string }) => void
  motion: 'none' | 'subtle' | 'premium'
  onMotionChange: (level: 'none' | 'subtle' | 'premium') => void
}

// ── Por qué NO hay control de "Color principal" ──────────────────────────────────────
// Lo tuvo y se quitó: un primary custom pisa el acento de CUALQUIER paleta, así que convivía mal
// con el selector de paletas (elegías una y no cambiaba nada visible → los swatches quedaban
// decorativos). La paleta es ahora la única fuente del acento. El schema/resolver siguen
// soportando overrides.primary (fail-safe, configs viejos), pero el editor lo LIMPIA al cargar
// (stripPrimary en editor-draft) para que nadie quede pisado sin forma de revertirlo.

export function ThemeControls({ theme, onChange, motion, onMotionChange }: ThemeControlsProps) {
  // Active-match del preset por normalizeTheme (L8): el DEFAULT sembrado es { preset: 'default' }
  // —valor de AUTORÍA, no un id de theme— y degrada a forjo. Sin esto, un config null-sembrado no
  // resaltaría ningún swatch. Es el MISMO normalize que usa resolveLandingTheme al renderizar.
  const activePreset = normalizeTheme(theme.preset)
  // La paleta activa se acota al set del preset (normalizePalette): un override inexistente cae al
  // default del preset, igual que en el render — así el swatch resaltado coincide con lo que se ve.
  const activePalette = normalizePalette(activePreset, theme.overrides?.palette)
  const paletteList = THEME_PALETTES[activePreset] ?? THEME_PALETTES.forjo
  // Fuente activa: mismo normalize defensivo que el render (un id desconocido cae a 'auto').
  const activeFont = normalizeFont(theme.overrides?.font)

  // El ESTILO VISUAL es la decisión de primer orden: elegir uno RESETEA todo lo que haya debajo.
  //  - palette → la default del preset (la del preset anterior ni siquiera pertenece al set nuevo).
  //  - font → se BORRA el override (font: undefined) para que mande la tipografía de diseño del
  //    theme. Antes no se limpiaba: si tenías una fuente elegida a mano, cambiabas de estilo y la
  //    letra NO cambiaba — el override viejo seguía pisando al theme nuevo (bug reportado).
  // El primary ya no existe como control y el editor lo limpia al cargar (stripPrimary).
  function selectPreset(id: string) {
    onChange({ preset: id, palette: THEME_DEFAULT_PAL[id] ?? 'red', font: undefined })
  }

  return (
    <div className="space-y-6">
      {/* ── Estilo visual (preset) ─────────────────────────────────────────────── */}
      <div className="space-y-3">
        <div>
          <p className="font-semibold text-sm">Estilo visual</p>
          <p className="text-xs text-muted-foreground">
            La personalidad completa de tu página: tipografías, colores y detalles.
          </p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {THEMES.map((t) => {
            const active = activePreset === t.id
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => selectPreset(t.id)}
                aria-pressed={active}
                className={cn(
                  'overflow-hidden rounded-lg border-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  active ? 'border-primary ring-2 ring-primary/20' : 'border-border hover:border-muted-foreground',
                )}
              >
                <span className="relative flex h-[68px] items-end gap-1.5 p-3" style={{ background: t.bg }}>
                  <span className="absolute left-3 top-2.5 text-sm font-extrabold" style={{ color: t.fg }}>Aa</span>
                  {t.chips.map((c, i) => (
                    <span key={i} className="h-6 flex-1 rounded" style={{ background: c, opacity: 1 - i * 0.18, boxShadow: t.glow ? `0 0 10px ${c}` : undefined }} />
                  ))}
                </span>
                <span className="flex items-center gap-2 p-2.5">
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold truncate">{t.name}</span>
                    <span className="block text-[10px] text-muted-foreground truncate">{t.meta}</span>
                  </span>
                  {active && (
                    <span className="ml-auto flex-shrink-0 flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground">
                      <Check className="w-3 h-3" />
                    </span>
                  )}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Paleta de color (depende del preset activo) ─────────────────────────── */}
      <div className="space-y-3">
        <div>
          <p className="font-semibold text-sm">Paleta de color</p>
          <p className="text-xs text-muted-foreground">
            El set de acentos de tu página pública de reservas.
          </p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {paletteList.map((p) => {
            const active = activePalette === p.id
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onChange({ palette: p.id })}
                aria-pressed={active}
                className={cn(
                  'flex flex-col gap-2.5 rounded-lg border-2 p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  active ? 'border-primary ring-2 ring-primary/20' : 'border-border hover:border-muted-foreground',
                )}
              >
                <span className="flex h-10 w-full overflow-hidden rounded-md border border-border/50">
                  {p.swatches.map((c, i) => <span key={i} className="flex-1" style={{ backgroundColor: c, boxShadow: p.glow ? `inset 0 0 8px ${c}` : undefined }} />)}
                </span>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold truncate">{p.name}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{p.meta}</p>
                  </div>
                  {active && (
                    <span className="flex-shrink-0 flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground">
                      <Check className="w-3 h-3" />
                    </span>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Tipografía (overrides.font) ─────────────────────────────────────────
          El renderer YA resolvía overrides.font → data-font (resolveLandingTheme); lo único que
          faltaba era exponerlo. Mismo set de 6 fuentes que usa el panel (lib/theme-config). */}
      <div className="space-y-3">
        <div>
          <p className="font-semibold text-sm">Tipografía</p>
          <p className="text-xs text-muted-foreground">
            &quot;Automática&quot; usa la que trae el estilo visual elegido.
          </p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {FONTS.map((f) => {
            const active = activeFont === f.id
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => onChange({ font: f.id })}
                aria-pressed={active}
                className={cn(
                  'flex items-center gap-2 rounded-lg border-2 p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  active ? 'border-primary ring-2 ring-primary/20' : 'border-border hover:border-muted-foreground',
                )}
              >
                {/* La muestra "Aa" se rinde con la fuente real (css var del FontDef). */}
                <span
                  className="text-lg font-bold leading-none"
                  style={{ fontFamily: f.css }}
                  aria-hidden="true"
                >
                  Aa
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-semibold truncate">{f.name}</span>
                  <span className="block text-[10px] text-muted-foreground truncate">{f.meta}</span>
                </span>
                {active && (
                  <span className="flex-shrink-0 flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground">
                    <Check className="w-3 h-3" />
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Nivel de movimiento (motion, segmented de 3) ───────────────────────── */}
      <div className="space-y-2">
        <p className="font-semibold text-sm">Nivel de movimiento</p>
        <div role="group" aria-label="Nivel de movimiento" className="inline-flex rounded-lg border border-border p-1 bg-secondary/30">
          {MOTION_OPTIONS.map((opt) => {
            const active = motion === opt.key
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => onMotionChange(opt.key)}
                aria-pressed={active}
                className={cn(
                  'min-h-9 px-4 py-1.5 rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {opt.label}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
