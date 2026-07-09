---
phase: 14-cms-editor-ui
plan: 04
subsystem: ui
tags: [cms, landing, theme, palette, motion, swatches, isSafeColor, next16, react19]

# Dependency graph
requires:
  - phase: 14-01
    provides: "shell del editor CMS (web-client.tsx) que monta ThemeControls con el contrato de props { theme, onChange, motion, onMotionChange } y aplica resolveLandingTheme al wrapper del preview"
  - phase: 08 (landing v0.10)
    provides: "resolveLandingTheme / isSafeColor / normalizeMotion (lib/landing/theme.ts) y THEMES/THEME_PALETTES/THEME_DEFAULT_PAL/normalizeTheme (lib/theme-config.ts)"
provides:
  - "ThemeControls: implementación real de los controles de estilo visual de la landing (preset + paleta + color primario + nivel de movimiento) del editor CMS"
  - "Grids de preset/paleta espejando settings-client.tsx pero apuntados a landing_config.theme (no a las columnas de chrome del panel)"
  - "Input de color primario validado por allowlist (isSafeColor): inválido → error inline y no persiste"
  - "Segmented de motion (none/subtle/premium) escribiendo config.motion"
affects: [14-05, secure-phase-14, web-builder-cms]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Reuse-first: espejar el markup/active-state de settings-client (border-primary ring-2 ring-primary/20 + Check) retargeteando el write a landing_config.theme"
    - "Barrera de validación en el borde de UI (isSafeColor) antes de escribir un color crudo al borrador — defensa en profundidad con resolveLandingTheme"
    - "Active-match del swatch via normalizeTheme/normalizePalette: el resaltado coincide con lo que resuelve el render (default → forjo)"

key-files:
  created: []
  modified:
    - "app/(dashboard)/web/_sections/theme-controls.tsx (stub → implementación completa, 232 líneas)"
    - "test/landing-theme.test.ts (extendido: normalizeTheme como active-match del editor, +5 casos)"

key-decisions:
  - "El write target SIEMPRE es landing_config.theme (preset + overrides.palette/primary) y config.motion — nunca las columnas theme/palette/font del negocio (D-06). grep de 'businesses' en el archivo == 0."
  - "El hex del primary usa estado local para permitir tipeo libre; solo se propaga al borrador cuando isSafeColor lo valida. Vacío = quitar el primary custom (onChange primary undefined)."
  - "El <input type=color> nativo solo entiende #rrggbb: si el primary no es hex de 6 dígitos se muestra un fallback visual (#d94a2b) sin escribirlo; el picker siempre emite 6-hex válido."
  - "Seleccionar preset resetea la paleta al default del preset (THEME_DEFAULT_PAL), igual que selectTheme en settings."

patterns-established:
  - "Segmented de motion reutiliza el patrón light/dark de settings (inline-flex + aria-pressed + active accent fill) con role=group + group label accesible"
  - "Active-preset por normalizeTheme cierra el landmine L8 (config null-sembrado { preset: 'default' } resalta Forjo)"

requirements-completed: [EDIT-04]

# Metrics
duration: 8min
completed: 2026-07-09
status: complete
---

# Phase 14 Plan 04: Theme / Palette / Primary / Motion Controls Summary

**Controles de estilo visual del editor CMS (preset + paleta + color primario validado por allowlist + segmented de motion) que escriben a landing_config.theme/config.motion y se ven en vivo en el preview, reemplazando el stub de 14-01.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-07-09T21:01:09Z
- **Completed:** 2026-07-09T21:09:30Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- `ThemeControls` implementado por completo: grid de preset (THEMES), grid de paleta (THEME_PALETTES[preset]), input de color primario validado, y segmented de motion de 3 opciones.
- Todas las escrituras van por los callbacks a `landing_config.theme`/`config.motion` — grep de `businesses` en el archivo == 0 (T-14-14 mitigado).
- Color primario validado por `isSafeColor` (allowlist de hex): un hex inválido muestra error inline y NO se persiste (T-14-13 mitigado, anti CSS-injection).
- Active-match del preset por `normalizeTheme` (config null-sembrado `{ preset: 'default' }` resalta Forjo) — landmine L8 cubierto por unit test.
- Contrato de props FINAL respetado sin tocar `web-client.tsx` / `page.tsx`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Extender el test de theme con la normalización del active-preset (L8)** - `0b4881c` (test)
2. **Task 2: Controles de tema/paleta/primary/motion apuntados a landing_config.theme** - `a783332` (feat)

**Plan metadata:** (final docs commit — ver abajo)

## Files Created/Modified
- `app/(dashboard)/web/_sections/theme-controls.tsx` - Implementación real de ThemeControls (preset/paleta/primary/motion → landing_config.theme/config.motion), reemplaza el stub de 14-01.
- `test/landing-theme.test.ts` - +1 describe (5 casos): normalizeTheme como active-match del editor (default/undefined/desconocido → forjo; conocido preservado; paleta default del default-match = red).

## Decisions Made
- Estado local del hex del primary para tipeo libre; propagación solo con `isSafeColor` OK; vacío = quitar override (`primary: undefined`).
- `<input type=color>` con fallback visual `#d94a2b` cuando el primary no es 6-hex; el picker siempre emite 6-hex válido.
- Reset de paleta al default del preset al cambiar de preset (paridad con `selectTheme` de settings).
- Reword de los comentarios para eliminar la cadena literal `businesses.*` del archivo (el criterio de aceptación pide grep == 0); el sentido —no escribir a las columnas de chrome del panel— se mantiene.

## Deviations from Plan

None - plan executed exactly as written. (Los cambios menores de wording en comentarios fueron para satisfacer el criterio de aceptación literal `grep businesses == 0`, no un cambio de comportamiento.)

## Issues Encountered
- Suite completa (`npx vitest run`): 8 archivos de integración con Supabase (booking-core, booking-public-regression, canchas-booking, clients-import, concurrency, isolation, manual-booking, manual-client) fallan en `beforeAll` con timeout de conexión (10s). Causa: son suites `describe.skipIf(!hasSupabaseCreds)` con creds presentes en `.env` pero el Supabase LOCAL no está levantado (`supabase start`). Condición de entorno pre-existente, NO regresión — mi cambio es puro frontend/lógica de tema y no toca DB. Los tests entregables (`landing-theme.test.ts`, 32 casos incl. isSafeColor rechazando primarios inválidos) pasan verdes, y `npx tsc --noEmit` exit 0.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- EDIT-04 completo: el editor CMS ya expone estilo visual (preset/paleta/primary/motion) escribiendo a landing_config y reflejándose en el preview.
- Pendiente de wave/close: UAT visual (cambiar preset/paleta/primary/motion actualiza el preview al instante; hex inválido no aplica; config null-sembrado resalta Forjo) y `/gsd:secure-phase 14` (T-14-13/14/15).

## Self-Check: PASSED

- FOUND: app/(dashboard)/web/_sections/theme-controls.tsx
- FOUND: test/landing-theme.test.ts
- FOUND: .planning/workstreams/web-builder/phases/14-cms-editor-ui/14-04-SUMMARY.md
- FOUND commit: 0b4881c (test)
- FOUND commit: a783332 (feat)

---
*Phase: 14-cms-editor-ui*
*Completed: 2026-07-09*
