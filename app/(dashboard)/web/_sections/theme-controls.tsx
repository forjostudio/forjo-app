'use client'

import type { LandingTheme } from '@/lib/landing/schema'

// ── STUB: ThemeControls (Phase 14) — contrato de props FINAL ────────────────────────────
// Controles de estilo visual de la LANDING (NO del chrome del panel): preset + paleta + color
// principal + nivel de movimiento. Escribe a landing_config.theme (preset + overrides.palette +
// overrides.primary) y a config.motion — NUNCA a businesses.theme/palette/font (D-06). El shell
// cablea onChange/onMotionChange a lib/landing/editor-draft.ts (setTheme/setMotion) y aplica el
// resultado en vivo al wrapper del preview vía resolveLandingTheme. Implementación real (grillas de
// swatches espejando settings-client.tsx, input de color validado por isSafeColor, segmented de
// motion) → Plan 14-04.

export interface ThemeControlsProps {
  theme: LandingTheme
  // Patch parcial del tema; el shell lo aplica con setTheme(draft, patch). primary undefined = quitar.
  onChange: (patch: { preset?: string; palette?: string; primary?: string | undefined }) => void
  motion: 'none' | 'subtle' | 'premium'
  onMotionChange: (level: 'none' | 'subtle' | 'premium') => void
}

export function ThemeControls(props: ThemeControlsProps) {
  // Stub mínimo real: muestra el preset y el motion actuales. Las grillas de swatches + input de
  // color + segmented de motion llegan en 14-04.
  return (
    <div className="space-y-1">
      <p className="text-sm font-semibold">Estilo visual</p>
      <p className="text-xs text-muted-foreground">
        Estilo: {props.theme.preset} · Movimiento: {props.motion}
      </p>
    </div>
  )
}
