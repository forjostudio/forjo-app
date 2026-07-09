'use client'

import { useState } from 'react'
import { Check } from 'lucide-react'
import type { LandingTheme } from '@/lib/landing/schema'
import {
  THEMES,
  THEME_PALETTES,
  THEME_DEFAULT_PAL,
  normalizeTheme,
  normalizePalette,
} from '@/lib/theme-config'
import { isSafeColor } from '@/lib/landing/theme'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
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
  // Patch parcial del tema; el shell lo aplica con setTheme(draft, patch). primary undefined = quitar.
  onChange: (patch: { preset?: string; palette?: string; primary?: string | undefined }) => void
  motion: 'none' | 'subtle' | 'premium'
  onMotionChange: (level: 'none' | 'subtle' | 'premium') => void
}

export function ThemeControls({ theme, onChange, motion, onMotionChange }: ThemeControlsProps) {
  // Active-match del preset por normalizeTheme (L8): el DEFAULT sembrado es { preset: 'default' }
  // —valor de AUTORÍA, no un id de theme— y degrada a forjo. Sin esto, un config null-sembrado no
  // resaltaría ningún swatch. Es el MISMO normalize que usa resolveLandingTheme al renderizar.
  const activePreset = normalizeTheme(theme.preset)
  // La paleta activa se acota al set del preset (normalizePalette): un override inexistente cae al
  // default del preset, igual que en el render — así el swatch resaltado coincide con lo que se ve.
  const activePalette = normalizePalette(activePreset, theme.overrides?.palette)
  const paletteList = THEME_PALETTES[activePreset] ?? THEME_PALETTES.forjo

  const currentPrimary = theme.overrides?.primary
  // Estado local del hex de texto: dejamos tipear libre (incluso estados intermedios inválidos) sin
  // escribir al borrador hasta que valide. Se siembra del override actual.
  const [hexInput, setHexInput] = useState(currentPrimary ?? '')
  const [hexError, setHexError] = useState(false)

  // El <input type="color"> nativo solo entiende #rrggbb; si el primary no es un hex de 6 dígitos
  // (vacío, #fff corto, o inválido) mostramos un fallback visual sin escribirlo.
  const colorValue = /^#[0-9a-fA-F]{6}$/.test(currentPrimary ?? '') ? currentPrimary! : '#d94a2b'

  // POR QUÉ isSafeColor: overrides.primary cruza al preview como CSS var inline; validamos por
  // ALLOWLIST de hex (anti CSS-injection, T-14-13/T-08-01). Un hex inválido NO se persiste (el
  // render igual lo dropea, pero no ensuciamos el borrador). Vacío = quitar el primary custom.
  function applyHex(raw: string) {
    setHexInput(raw)
    const v = raw.trim()
    if (v === '') {
      setHexError(false)
      onChange({ primary: undefined })
      return
    }
    if (isSafeColor(v)) {
      setHexError(false)
      onChange({ primary: v })
    } else {
      setHexError(true)
      // No escribimos: el primary inválido no llega al borrador.
    }
  }

  // Seleccionar un preset resetea la paleta a la default del preset (mismo comportamiento que
  // selectTheme en settings): la paleta del preset anterior no aplica al nuevo set.
  function selectPreset(id: string) {
    onChange({ preset: id, palette: THEME_DEFAULT_PAL[id] ?? 'red' })
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

      {/* ── Color principal (override.primary, validado por allowlist) ──────────── */}
      <div className="space-y-2">
        <Label htmlFor="landing-primary">Color principal</Label>
        <div className="flex items-center gap-2">
          <input
            id="landing-primary"
            type="color"
            value={colorValue}
            onChange={(e) => applyHex(e.target.value)}
            aria-label="Color principal"
            className="h-11 w-14 flex-shrink-0 cursor-pointer rounded-md border border-border bg-background p-1"
          />
          <Input
            value={hexInput}
            onChange={(e) => applyHex(e.target.value)}
            placeholder="#d94a2b"
            spellCheck={false}
            aria-invalid={hexError}
            aria-describedby={hexError ? 'landing-primary-error' : undefined}
            className="max-w-[160px] font-mono"
          />
        </div>
        {hexError && (
          <p id="landing-primary-error" className="text-xs text-destructive">
            Ingresá un color válido (ej. #d94a2b)
          </p>
        )}
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
