---
phase: 11-cierre-de-backlog
plan: 01
subsystem: ui
tags: [react, shadcn, badge, react-hooks, key-remount, impeccable, eslint]

# Dependency graph
requires:
  - phase: 10-*
    provides: "gate D-02 del selector 'Cualquiera' (contexto de POLISH-01/status de abonos)"
provides:
  - "Chip semántico de estado (Cancelado/Completado) en el tab Archivados de Abonos"
  - "Panel de detalle de Clientes extraído a subcomponente <ClientDetail> con reset por key-remount (sin set-state-in-effect)"
  - "Aceptación reviewable del finding side-tab de impeccable acotada a las 2 pantallas de cancelación"
affects: [abonos, clientes, cancelacion-publica]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "key-remount (key={selected.id}) para resetear estado editable al cambiar de entidad, en vez de useEffect(setState)"
    - "Aceptación de findings de impeccable vía .impeccable/config.json (hook.ignoreValues) acotada por archivo, no eslint-disable inline"

key-files:
  created:
    - .impeccable/config.json
    - .planning/workstreams/motor-reservas/phases/11-cierre-de-backlog/11-01-SUMMARY.md
  modified:
    - app/(dashboard)/abonos/abonos-client.tsx
    - app/(dashboard)/clients/clients-client.tsx

key-decisions:
  - "POLISH-01: chip solo en Archivados (donde viven cancelled+completed); 'cancelled'->destructive, 'completed'->secondary, sin hex"
  - "POLISH-02: patrón key-remount (no derivar-en-render) porque notes/editForm son estado editable"
  - "POLISH-03: verify-only; los 2 bordes ya coincidían byte a byte; NO se editó diseño ni endurecimiento público"
  - "La aceptación del finding side-tab se persistió en .impeccable/config.json (gitignored) — mecanismo reviewable local, no git-committed (el repo gitignorea .impeccable/ por decisión del mantenedor)"

patterns-established:
  - "key-remount para reset de sub-form al cambiar de entidad seleccionada"
  - "impeccable ignoreValues por archivo (rule=side-tab, value='*', files=[path]) como aceptación reviewable acotada"

requirements-completed: [POLISH-01, POLISH-02, POLISH-03]

# Metrics
duration: 65min
completed: 2026-07-27
status: complete
---

# Phase 11 Plan 01: Cierre de backlog (POLISH-01/02/03) Summary

**Chip semántico de estado en Archivados de Abonos, refactor key-remount de Clientes que elimina el error react-hooks/set-state-in-effect, y aceptación reviewable del finding side-tab en las 2 pantallas de cancelación sin tocar diseño ni endurecimiento.**

## Performance

- **Duration:** ~65 min
- **Started:** 2026-07-27T18:57Z
- **Completed:** 2026-07-27T19:02Z
- **Tasks:** 3
- **Files modified:** 2 (+ 1 config local creada)

## Accomplishments
- **POLISH-01 (D-01):** en el tab Archivados de Abonos, cada serie muestra un chip por `status` — "Cancelado" (Badge `destructive`) o "Completado" (Badge `secondary`), tokens semánticos, cero hex. Aditivo: no re-interpreta `isAbonoActivo`. Solo en Archivados.
- **POLISH-02:** el panel de detalle/edición de Clientes se extrajo a un subcomponente co-ubicado `<ClientDetail>` montado con `key={selected.id}`. El remount reinicia `editMode/editForm/notes/historyExpanded` desde `client`, reemplazando el `useEffect(setState)` de `clients-client.tsx:497` que disparaba `react-hooks/set-state-in-effect`. Se borró el efecto + su `eslint-disable-line`, se sacó el import `TrendingUp` sin usar y se movieron `APPT_STATUS_*` a módulo. `npx eslint` del archivo: limpio.
- **POLISH-03 (D-03):** verificado que el borde acentuado (`border-l-4 p-4 space-y-1 text-sm mb-5` + `borderLeftColor: accent`) es byte-idéntico en las 2 pantallas de cancelación. Se aceptó el finding `side-tab` como intencional vía `.impeccable/config.json` (`hook.ignoreValues`, `rule=side-tab`, `value="*"`) acotado exactamente a los 2 paths. Validado con el propio `hook-lib.filterFindings`: suprime side-tab solo en esos 2 archivos y deja el resto intacto.

## Task Commits

1. **Task 1: POLISH-01 chip de estado en Archivados** - `9732cf3` (feat)
2. **Task 2: POLISH-02 key-remount en Clientes** - `b069f91` (refactor)
3. **Task 3: POLISH-03 verify-only + aceptación side-tab** - sin commit de código (verify-only; aceptación en `.impeccable/config.json`, dir gitignored)

## Files Created/Modified
- `app/(dashboard)/abonos/abonos-client.tsx` - Chip Cancelado/Completado por `status` en el contenedor de badges de cada serie de Archivados.
- `app/(dashboard)/clients/clients-client.tsx` - Subcomponente `<ClientDetail>` (remount por key); se eliminó el `useEffect` de reset, el import `TrendingUp` y se movieron `APPT_STATUS_*`/`ClientStats` a módulo. Búsqueda/filtros/alta siguen en el padre, sin cambios.
- `.impeccable/config.json` - **(gitignored)** Aceptación reviewable del finding `side-tab` acotada a las 2 pantallas de cancelación, con justificación de marca.

## Decisions Made
- Chip de estado gateado a `tab === 'archivados'`: en Activos una serie `completed` con turnos por delante no lleva chip (evita el "ya terminó" engañoso).
- `key-remount` en vez de derivar-en-render: `notes`/`editForm` son estado editable (el usuario tipea encima), así que derivar rompería la edición. El remount reproduce EXACTO el reset previo.
- POLISH-03 verify-only: los bordes ya coincidían; se acepta el finding, no se edita el patrón de marca app-wide (D-03).

## Deviations from Plan

### Auto-fixed / mechanism adjustments

**1. [Rule 3 - Mecanismo] Aceptación de impeccable en `config.json`, no en `hook.cache.json`**
- **Found during:** Task 3 (POLISH-03)
- **Issue:** El plan lista `.impeccable/hook.cache.json` como archivo a tocar, pero ese archivo es una **cache de dedup**, no un mecanismo de supresión. La vía reviewable real de impeccable (según su propio hook-lib y guidance) es `hook.ignoreValues` en `.impeccable/config.json`.
- **Fix:** Se creó `.impeccable/config.json` con 2 entradas `{rule: side-tab, value: "*", files:[<path>]}`, exactamente lo que produciría `impeccable hooks ignore-value side-tab "*" --file <target>`. Validado con `hook-lib.filterFindings` (suprime solo esos 2 archivos).
- **Verification:** Node harness con `readConfig`+`filterFindings`: `KEPT count: 1` (solo `lib/email.ts`; los 2 cancel-clients suprimidos).
- **Committed in:** N/A — `.impeccable/` está **gitignored** en este repo (decisión del mantenedor; incluye `config.json` y `hook.cache.json`). La aceptación persiste local y funciona; NO se forzó `git add -f` sobre un dir gitignored (respeta el gitignore del proyecto).

---

**Total deviations:** 1 (ajuste de mecanismo; misma intención reviewable, archivo correcto).
**Impact on plan:** Ninguno sobre el resultado funcional. La aceptación del finding queda persistida y verificada localmente. Si el equipo quiere versionar la aceptación, tendría que des-gitignorar `.impeccable/config.json` (decisión de mantenedor, fuera de scope).

## Issues Encountered

- **`npm run lint` repo-wide con 456 errores pre-existentes.** Son `react-hooks/preserve-manual-memoization` (React Compiler) y unused-vars en archivos que NO toqué (`components/dashboard/upcoming-appointments.tsx`, `design_handoff/`, `lib/clients-import.ts`, `test/*`). Fuera de scope (SCOPE BOUNDARY). Mis 2 archivos tocados: `npx eslint` = **limpio** (EXIT 0, sin `set-state-in-effect`, sin warning `TrendingUp`).
- **`npm test`: fallos en suites de integración con la DB local de Supabase** (abono-*, booking-*, isolation, concurrency, manual-*, staff-assignment). Son dependientes del estado de la DB local (p.ej. idempotencia "expected 6 to be 5" = filas remanentes de una corrida previa; DB local corriendo con storage/studio off, config normal del proyecto). **Ningún test importa `clients-client`/`abonos-client`** (no hay infra de component-testing, per RESEARCH) y mis cambios son UI-only (React) — no tocan lib/route/migración. Pre-existentes/ambientales, fuera de scope; registrados como deferred.

## User Setup Required
None.

## Deferred Issues
- Fallos de `npm test` en suites de integración DB (dirty local DB): correr `npx supabase db reset` local para dejar la DB limpia antes de re-verificar. No causados por este plan.
- Errores pre-existentes de `react-hooks/preserve-manual-memoization` (React Compiler) en archivos no tocados por este plan.

## Next Phase Readiness
- POLISH-01/02/03 cerrados. Quedan los plans 11-02/03/04 del cierre de backlog (EXTRA-A copy de borrado + `deleteProfessional`, EXTRA-B setting del selector con migr. 061).

## Self-Check: PASSED
- FOUND: `app/(dashboard)/abonos/abonos-client.tsx`
- FOUND: `app/(dashboard)/clients/clients-client.tsx`
- FOUND: `.impeccable/config.json`
- FOUND commit: `9732cf3` (POLISH-01)
- FOUND commit: `b069f91` (POLISH-02)

---
*Phase: 11-cierre-de-backlog*
*Completed: 2026-07-27*
