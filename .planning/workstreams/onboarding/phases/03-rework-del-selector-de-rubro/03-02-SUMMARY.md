---
phase: 03-rework-del-selector-de-rubro
plan: 02
subsystem: ui
tags: [onboarding, settings, select, shadcn, base-ui, verticals]

requires:
  - phase: 03-rework-del-selector-de-rubro (plan 01)
    provides: RUBRO_PLACEHOLDERS, getVerticalLabel, VERTICALS (types vacíos, label belleza)
provides:
  - "Selector unificado de 4 rubros + campo libre siempre visible + leyenda en onboarding y settings"
  - "Onboarding guarda vertical=rubro elegido, type=texto libre; auto-hide canchas por VerticalKey"
  - "Settings sin andamiaje 'Otro'; saveBusiness scoped a .eq('id', business.id) con reload-on-verticalChanged"
affects: [03-03-booking-fallback]

tech-stack:
  added: []
  patterns:
    - "Base UI Select.Value con función child (value→label) para value≠label (idiom finances-client:1110)"

key-files:
  created: []
  modified:
    - app/(onboarding)/onboarding/page.tsx
    - app/(dashboard)/settings/settings-client.tsx

key-decisions:
  - "vertical = estado propio (VerticalKey); type = texto libre (state/bizForm). El rubro resuelve el vertical directo (D-07), no getVerticalKeyByType(type)."
  - "En settings, el estado vertical inicializa desde business.vertical (o getVerticalKeyByType para filas viejas); proLabels re-keyeado a vertical."

patterns-established:
  - "Cuando el value del Select ≠ label visible, mapear en el trigger con SelectValue función child (base-ui muestra value crudo por defecto)."

requirements-completed: [ONB-RUBRO-01, ONB-RUBRO-02]  # onboarding + settings; display en booking lo cierra 03-03

duration: 35 min
completed: 2026-07-04
status: complete
---

# Phase 3 Plan 02: Selector de 4 rubros en onboarding + settings — Summary

**Selector unificado de 4 rubros (VerticalKey) + campo libre "¿A qué se dedica tu negocio?" siempre visible con placeholder por rubro + leyenda, en onboarding y Configuración → Negocio; rubro→vertical, texto libre→type; auto-hide de canchas y gating re-keyeados a la VerticalKey elegida.**

## Performance

- **Duration:** ~35 min
- **Completed:** 2026-07-04
- **Tasks:** 2 auto + 1 checkpoint (human-verify, aprobado tras 1 fix)
- **Files modified:** 2

## Accomplishments
- Onboarding: Select de 4 rubros planos (Salud, Belleza/Estética/Spa, General, Canchas) + Input libre siempre visible con placeholder por rubro (`RUBRO_PLACEHOLDERS[vertical]`) + leyenda; arregla el bug del "Otro" que no aparecía (D-04). Insert guarda `vertical` directo; auto-hide canchas, `canGoNext` y hints re-keyeados a la VerticalKey elegida (D-07).
- Settings: mismo control, sin toggle "Otro" ni dropdown de subtipos; estado único `vertical`; `saveBusiness` guarda `vertical`+`type` scoped a `.eq('id', business.id)` con reload-on-verticalChanged. Removido todo el andamiaje huérfano (OTRO_TYPE, predefinedTypes, typeIsOtro, typeSelectValue, onTypeChange, typeGroup, initTypeGroup).
- Consistencia total onboarding ↔ settings por el UI-SPEC.

## Task Commits

1. **Task 1: Onboarding selector** - `4fc76a3` (feat)
2. **Task 2: Settings selector** - `8dc6f06` (feat)
3. **Fix (checkpoint): Select label mapping** - `c2a606b` (fix)

## Files Created/Modified
- `app/(onboarding)/onboarding/page.tsx` - Select 4 rubros + campo libre + re-key canchas/canGoNext/hints/insert.
- `app/(dashboard)/settings/settings-client.tsx` - Mismo control, sin "Otro"; estado vertical; saveBusiness simplificado.

## Decisions Made
- El rubro (columna `vertical`) es la fuente de resolución; el `type` es texto libre de display (D-07). Ambas superficies comparten el mismo control (UI-SPEC).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Base UI Select.Value mostraba el value crudo (la VerticalKey) en el trigger**
- **Found during:** Task 3 (checkpoint human-verify — el usuario vio "belleza" en vez de "Belleza/Estética/Spa")
- **Issue:** Base UI `Select.Value` renderiza el `value` crudo por defecto cuando `value ≠ label`. El selector viejo no lo sufría porque value===label (el subtipo era el mismo string). Con `value = VerticalKey` y label distinto, el trigger mostraba la key.
- **Fix:** Función child en `SelectValue` que mapea `value → VERTICALS[v].label`, con fallback a "Elegí tu rubro" cuando está vacío (muted vía `data-placeholder`, confirmado en el source de base-ui: `hasSelectedValue=false` para value=''). Mismo idiom ya usado en `finances-client.tsx:1110`. Aplicado en ambas superficies.
- **Files modified:** `app/(onboarding)/onboarding/page.tsx`, `app/(dashboard)/settings/settings-client.tsx`
- **Verification:** tsc 0; el trigger muestra el label; re-verificado por el usuario (aprobado).
- **Committed in:** c2a606b

**2. [Rule 3 - Blocking] Referencia huérfana a `initTypeGroup` en settings (línea 468, fuera del bloque del plan)**
- **Found during:** Task 2 (tsc TS2304)
- **Issue:** `proLabels = PRO_LABELS[initTypeGroup]` usaba el símbolo removido; el plan solo mapeaba el andamiaje del bloque 240-288/1089-1119, no esta línea.
- **Fix:** Re-keyeado a `PRO_LABELS[vertical]` (mismo VerticalKey, ahora reactivo al rubro elegido).
- **Files modified:** `app/(dashboard)/settings/settings-client.tsx`
- **Verification:** tsc 0.
- **Committed in:** 8dc6f06 (Task 2)

---

**Total deviations:** 2 auto-fixed (1 bug de render base-ui, 1 referencia huérfana). Además, `npm run lint` global no pasa por baseline pre-existente (misma situación que 03-01): verificado que ambos archivos no agregan errores nuevos (eslint baseline por archivo idéntico antes/después).
**Impact on plan:** Ninguno en scope. Los dos fixes eran necesarios para correctness; sin scope creep.

## Issues Encountered
None más allá de las desviaciones auto-corregidas.

## User Setup Required
None (ver 03-USER-SETUP.md del plan 01 para la migración a prod).

## Next Phase Readiness
- Selector completo en ambas superficies. El `type` (texto libre) se escribe acá y se consume en 03-03 (fallback de categoría en booking).
- Falta 03-03 para cerrar ONB-RUBRO-02 (display público en booking).

---
*Phase: 03-rework-del-selector-de-rubro*
*Completed: 2026-07-04*
