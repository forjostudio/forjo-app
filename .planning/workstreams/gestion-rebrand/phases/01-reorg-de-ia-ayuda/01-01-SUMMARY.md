---
phase: 01-reorg-de-ia-ayuda
plan: 01
subsystem: ui
tags: [sidebar, navigation, nextjs, react, multi-tenant, verticals, a11y]

# Dependency graph
requires:
  - phase: gestion-rebrand milestone (diseño aprobado)
    provides: mock de reorg (sidebar agrupado) + inventario de pantallas
provides:
  - Sidebar del dashboard agrupado en 5 secciones data-driven (PANEL·AGENDA·GESTIÓN·REPORTES·AJUSTES)
  - Filtro por grupo contra resolveVertical(business).menu que preserva el gating por vertical sin tocar verticals.ts
  - a11y en filas del sidebar (aria-current + focus-visible ring)
affects: [01-02 negocio-hub, 01-03 ayuda-faq (agrega link Ayuda en el footer de este mismo archivo)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Nav agrupado data-driven { section, keys[] } filtrado contra v.menu (grupo vacío no renderiza header)"
    - "Sidebar content como elemento JSX const (no función en render) — evita react-hooks/static-components"

key-files:
  created: []
  modified:
    - components/dashboard/sidebar.tsx

key-decisions:
  - "El agrupado vive dentro de sidebar.tsx (D-01): array { section, keys[] } filtrado contra resolveVertical(business).menu; NO se agregó menuGroups a VERTICALS ni se tocó lib/verticals.ts."
  - "Se mantuvo el estado activo bg-primary text-primary-foreground del dashboard (NO el bg-secondary+barra del CRM) por continuidad visual/behavior-frozen (D-02/UI-SPEC §A)."
  - "El link de Ayuda del footer NO se agregó en este plan: lo agrega el Plan 01-03 (que también toca este archivo)."

patterns-established:
  - "Grupos LOCKED como array de módulo { section, keys[] } + buildNavGroups() que resuelve keys→items y filtra por Set(v.menu)"
  - "Fila interactiva con focus-visible:ring-[3px] ring-ring/50 y aria-current='page' en activa"

requirements-completed: [NAV-01]

# Metrics
duration: ~15min
completed: 2026-07-05
status: complete
---

# Phase 01 Plan 01: Sidebar agrupado (NAV-01) Summary

**Sidebar del dashboard reorganizado de lista plana a 5 grupos data-driven (PANEL·AGENDA·GESTIÓN·REPORTES·AJUSTES) filtrados por vertical, behavior-frozen, sin tocar lib/verticals.ts.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-07-05
- **Completed:** 2026-07-05
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Sidebar agrupado en 5 secciones con headers mono (espejando el estilo de crm-sidebar.tsx, sin importarlo).
- Agrupado data-driven `{ section, keys[] }` resuelto por `buildNavGroups()`: cada grupo filtra sus keys contra `resolveVertical(business).menu` (mismo gating que la lista plana original), y un grupo sin items sobrevivientes no renderiza nada (ni su header). En canchas, GESTIÓN omite Equipo (no está en su `menu`).
- Estado activo preservado (`bg-primary text-primary-foreground`) y a11y agregada (`aria-current="page"` + `focus-visible:ring-[3px] ring-ring/50`).
- Footer behavior-frozen intacto: "Ver mi página", "Cerrar sesión", firma "hecho con Forjo Studio".

## Task Commits

1. **Task 1: Agrupar el sidebar en 5 secciones data-driven (NAV-01)** - `60d6f89` (feat)

## Files Created/Modified
- `components/dashboard/sidebar.tsx` - `buildNav` → `buildNavGroups`; array LOCKED `NAV_GROUPS`; `<nav>` renderiza grupos con headers mono; a11y en filas; `SidebarContent` función → elemento JSX const; quita import `toast` sin uso.

## Decisions Made
- Grupos y mapeo LOCKED per D-02/UI-SPEC; MENSAJES excluido (no renderizado ni referenciado por nombre literal en el archivo).
- Estado activo `bg-primary` mantenido (no se copió el tratamiento del CRM).
- Link "Ayuda" en el footer NO agregado aquí — corresponde al Plan 01-03 (evita colisión de dos planes tocando el mismo bloque en esta wave).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `SidebarContent` declarado en render + import `toast` sin uso**
- **Found during:** Task 1 (verificación eslint)
- **Issue:** `npx eslint` (gate del plan) fallaba con 2 errores `react-hooks/static-components` (SidebarContent como función creada en render → resetea estado) + 1 warning `toast` sin uso. Verificado como **pre-existente** (baseline con git stash daba idénticos `3 problems (2 errors, 1 warning)`), pero bloqueaba el gate `npx eslint` requerido por el plan.
- **Fix:** `SidebarContent` pasó de función a elemento JSX const (`sidebarContent`), mismo patrón que ya usa `crm-sidebar.tsx` (analog en repo). Se quitó el import `toast` no usado (dead code en la misma zona editada).
- **Files modified:** components/dashboard/sidebar.tsx
- **Verification:** `npx tsc --noEmit` sin errores en sidebar; `npx eslint components/dashboard/sidebar.tsx` limpio.
- **Committed in:** `60d6f89` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** El fix era necesario para pasar el gate `npx eslint` del plan; usó el patrón analog ya establecido en el repo (crm-sidebar). Sin scope creep — solo el archivo del plan.

## Issues Encountered
- La cadena literal `MENSAJES` aparecía inicialmente en un comentario explicativo, lo que rompía el acceptance criterion "el archivo NO contiene la cadena MENSAJES". Reformulado a "grupo de mensajería" — grep confirma 0 ocurrencias.

## Known Stubs
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Chasis de navegación agrupado listo. El Plan 01-02 (Negocio hub / split Configuración) y el Plan 01-03 (FAQ/Ayuda + link en el footer del sidebar) pueden colgar sobre esta base.
- `lib/verticals.ts` sin cambios (git diff vacío) — el gating por vertical sigue siendo la única fuente de qué ve cada rubro.

## Self-Check: PASSED
- FOUND: components/dashboard/sidebar.tsx
- FOUND: 01-01-SUMMARY.md
- FOUND commit: 60d6f89

---
*Phase: 01-reorg-de-ia-ayuda*
*Completed: 2026-07-05*
