---
phase: 04-pipeline-tags-timeline
plan: 06
subsystem: ui
tags: [crm, pipeline, react, rsc, server-actions, next]

# Dependency graph
requires:
  - phase: 04-pipeline-tags-timeline (04-04)
    provides: markWon(input) + markWonSchema en _pipeline-actions.ts; createDeal con reuse-by-email acotado a leads activos
provides:
  - createDeal refresca el tablero al instante (router.refresh + re-sync de estado durante el render)
  - boton "Marcar ganado" en la tarjeta (markWon optimista-revertible)
  - header con "$ ganados" real calculado server-side (agregado de deals status='won')
  - contactName prioriza deal.title sobre lead.name
affects: [05-reportes-de-ventas]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Re-sync de estado local con prop RSC DURANTE el render (sentinel prevInitialDeals), no useEffect — calca AddonToggle / decisión 02-04 para evitar react-hooks/set-state-in-effect"
    - "Agregado server-side (suma) que cruza SOLO el número al cliente, nunca las filas (T-04-10)"

key-files:
  created: []
  modified:
    - app/(crm)/admin/pipeline/page.tsx
    - app/(crm)/admin/pipeline/pipeline-client.tsx

key-decisions:
  - "wonTotal se calcula en el RSC (query agregada status='won') y se pasa como prop; las filas won NO entran al tablero (DECIDIDO POR EL USUARIO)"
  - "contactName usa d.title ?? lead?.name (prioridad al nombre con que se creó el deal, gap 4b)"
  - "createDeal usa router.refresh() + re-sync durante el render en vez de mutar estado local optimista (Opción B del UAT, server-side como fuente de verdad)"
  - "Marcar ganado es acción DIRECTA sin ConfirmDialog (ganar no es destructivo); optimista-revertible espejo del DnD"

patterns-established:
  - "Prop-sync durante render: const [prev,setPrev]=useState(prop); if(prop!==prev){setPrev(prop);setLocal(prop)} — reemplaza useEffect para re-sincronizar tras router.refresh sin cascading renders"

requirements-completed: [PIPE-01, PIPE-02]

# Metrics
duration: 8min
completed: 2026-06-22
status: complete
---

# Phase 4 Plan 06: Cierre de gaps UAT del tablero de pipeline Summary

**createDeal refresca el board al instante, botón "Marcar ganado" (markWon optimista-revertible), header con "$ ganados" real server-side y tarjetas que muestran el nombre del deal (d.title) — todo sin paquetes nuevos.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-06-22T15:35:31Z
- **Completed:** 2026-06-22T15:43:08Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- **Gap test 4a (createDeal no refrescaba):** tras un createDeal exitoso se llama `router.refresh()` y el estado local se re-sincroniza con `initialDeals` durante el render → la tarjeta aparece al instante sin remontar.
- **Gap test 5 (ganados):** botón "Marcar ganado" en la tarjeta (espejo de "Marcar perdido", optimista-revertible vía `markWon`) + header que muestra `wonTotal` calculado server-side sumando los deals `status='won'`.
- **Gap test 4b (nombre):** `contactName` pasa a priorizar `d.title ?? lead?.name`, mostrando el nombre con que se creó el deal.

## Task Commits

Cada tarea fue commiteada atómicamente:

1. **Task 1: page.tsx — wonTotal server-side + contactName prioriza d.title** - `eb35608` (feat)
2. **Task 2: pipeline-client.tsx — sync optimista createDeal + botón Marcar ganado + header wonTotal** - `c15b084` (feat)

**Plan metadata:** SUMMARY.md no commiteado en git (`.planning/` está gitignored en este repo — skip esperado).

## Files Created/Modified
- `app/(crm)/admin/pipeline/page.tsx` - Query agregada `deals status='won'` en el `Promise.all`; `wonTotal` (reduce de `value_ars`) pasado como prop a `PipelineClient`; `contactName: d.title ?? lead?.name`. El service-role NUNCA cruza filas won al cliente (solo el total).
- `app/(crm)/admin/pipeline/pipeline-client.tsx` - Acepta prop `wonTotal: number` (header lo usa en vez de `summary.wonTotal`); re-sync de `deals` con `initialDeals` durante el render (sentinel `prevInitialDeals`); `router.refresh()` en `handleCreateDeal`; `handleMarkWon` optimista-revertible que invoca `markWon({ dealId })`; botón "Marcar ganado" en `DealCard` con hover `var(--crm-success)`.

## Decisions Made
- **wonTotal server-side, no cliente:** el cliente no recibe las filas won (T-04-10 Information Disclosure); solo el número agregado cruza. `summary` (cliente) sigue dando `openTotal`.
- **Re-sync durante el render en lugar de useEffect:** ver Deviations (Rule 3). Patrón ya establecido en el repo (AddonToggle / decisión 02-04).
- **Marcar ganado sin ConfirmDialog:** ganar no es destructivo; el UAT lo pide como acción directa espejo de `markLost` pero sin la fricción del motivo. `markWon` solo toca `status` (D-04: no acopla stage↔status).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Re-sync de estado con `useEffect` rompía el lint `react-hooks/set-state-in-effect`**
- **Found during:** Task 2 (sync optimista del createDeal)
- **Issue:** El plan especificaba `useEffect(() => { setDeals(initialDeals) }, [initialDeals])` para re-sincronizar. ESLint (`react-hooks/set-state-in-effect`) lo marca como error (cascading renders) → bloquea el build limpio. Es exactamente el lint que la decisión 02-04 del repo ya resolvió.
- **Fix:** Reemplazado el `useEffect` por el patrón "adjusting state when a prop changes" de React, ya usado por `components/crm/addon-toggle.tsx`: `const [prevInitialDeals, setPrevInitialDeals] = useState(initialDeals); if (initialDeals !== prevInitialDeals) { setPrevInitialDeals(initialDeals); setDeals(initialDeals) }`. Removido el import de `useEffect`. Comportamiento idéntico (tras `router.refresh()` el prop cambia de identidad → se re-sincroniza el estado local), sin cascading renders.
- **Files modified:** app/(crm)/admin/pipeline/pipeline-client.tsx
- **Verification:** `npx eslint` sobre los 2 archivos → exit 0 (sin errores ni warnings); `npx tsc --noEmit` → exit 0.
- **Committed in:** c15b084 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** El fix mantiene el comportamiento pedido por el plan (re-sync tras refresh) usando el patrón canónico del repo en vez del `useEffect` que el linter rechaza. Sin scope creep, mismos 2 archivos.

## Issues Encountered
- **Build estático falla en `/login` por falta de env vars:** `npm run build` reporta `✓ Compiled successfully in 10.7s` y luego falla en el prerender de `/login` con `@supabase/ssr: Your project's URL and API key are required`. Causa: el worktree no tiene `.env.local` (gitignored, vive solo en el repo principal), no un defecto del código. El paso de export aborta en `/login` antes de llegar a `/admin/pipeline`. Señales load-bearing usadas para verificar: `tsc` limpio + `✓ Compiled successfully` + `eslint` exit 0. Fuera de alcance (condición de entorno preexistente del worktree).

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Gaps de UAT del tablero (4a, 4b, 5 UI) cerrados. PIPE-01/PIPE-02 completos en la superficie del board.
- Listo para Phase 5 (Reportes de Ventas): `wonTotal` server-side establece el patrón de agregados sobre deals won que RPT-01/02 puede reutilizar.

## Self-Check: PASSED
- `app/(crm)/admin/pipeline/page.tsx` modificado y commiteado en eb35608 (FOUND).
- `app/(crm)/admin/pipeline/pipeline-client.tsx` modificado y commiteado en c15b084 (FOUND).
- Commits eb35608 y c15b084 presentes en `git log` (FOUND).

---
*Phase: 04-pipeline-tags-timeline*
*Completed: 2026-06-22*
