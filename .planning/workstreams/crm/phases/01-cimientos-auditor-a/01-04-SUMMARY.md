---
phase: 01-cimientos-auditor-a
plan: 04
subsystem: ui
tags: [react, base-ui, dialog, vitest, supabase-admin-api, type-to-confirm, crm]

# Dependency graph
requires:
  - phase: 01-01
    provides: requireAdmin() server-side (la garantía real de autorización; el ConfirmDialog es solo refuerzo UX)
provides:
  - "ConfirmDialog escalonado reutilizable (FND-03): niveles simple / type-word / requireReason"
  - "Helpers puros computeConfirmState / buildSubmitGuard / confirmButtonClass (lógica de gating testeable sin DOM)"
  - "scripts/setup-admin.ts: bootstrap local de app_metadata.is_admin vía Admin API (D2)"
  - "npm script setup:admin (runner tsx)"
affects: [02, 03, suspender, editar-precio, impersonar, pipeline, tags]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Lógica de gating de UI extraída a helpers puros, testeada en environment node (sin Testing Library/DOM)"
    - "Bootstrap de privilegios sensibles vía script local (no self-serve, no endpoint web)"
    - "Carga de .env.local con dotenv en scripts tsx sueltos (igual que vitest.setup.ts, cero deps)"

key-files:
  created:
    - components/crm/confirm-dialog.tsx
    - components/crm/confirm-dialog.test.tsx
    - scripts/setup-admin.ts
  modified:
    - package.json

key-decisions:
  - "El ConfirmDialog NUNCA autoriza — la garantía real vive server-side (requireAdmin, plan 01-01). UI deshabilitada = refuerzo"
  - "Lógica de gating en helpers puros + test en environment node, porque Testing Library/jsdom NO están instalados y el milestone prohíbe paquetes nuevos"
  - "is_admin vive en app_metadata y se setea con la Admin API (updateUserById), NO un UPDATE SQL ni columna en businesses"
  - "Bootstrap de is_admin es script local fuera del runtime web (llaves del reino, §7); no self-serve"
  - "RiskBadge renderizado inline en el dialog (no se importa del plan 03, wave 3) para no acoplar el orden de waves"

patterns-established:
  - "Pattern: helpers puros para la lógica de gating de un componente client, testeados en node sin DOM"
  - "Pattern: type-to-confirm escalonado (palabra exacta case-sensitive + motivo opcional) sobre el Dialog de @base-ui/react"
  - "Pattern: anti doble-submit con guard que ignora el segundo disparo mientras loading y resetea en finally"

requirements-completed: [FND-03]

# Metrics
duration: 4min
completed: 2026-06-18
status: complete
---

# Phase 1 Plan 04: ConfirmDialog escalonado + bootstrap de is_admin Summary

**Patrón de doble confirmación reutilizable (type-to-confirm escalonado sobre el Dialog de @base-ui/react) con lógica de gating en helpers puros testeados, más el script local que otorga is_admin en app_metadata vía la Admin API de Supabase.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-06-18T02:17:18Z
- **Completed:** 2026-06-18T02:21:27Z
- **Tasks:** 2
- **Files modified:** 4 (3 creados, 1 modificado)

## Accomplishments
- `ConfirmDialog` reutilizable (FND-03) con niveles simple / type-word (palabra exacta case-sensitive) / requireReason, y todos los estados del UI-SPEC (typing, word-mismatch con helper rojo, reason-empty, loading anti-doble-submit, error con toast que NO cierra el dialog).
- Botón confirmar destructive con `--crm-danger` (no `--destructive`); compone el Dialog de `@base-ui/react` (focus trap / Escape / portal heredados, sin hand-roll).
- Lógica de gating extraída a helpers puros (`computeConfirmState`, `buildSubmitGuard`, `confirmButtonClass`) y cubierta por 7 tests verdes en environment node.
- `scripts/setup-admin.ts` + npm script `setup:admin`: bootstrap local de `app_metadata.is_admin` vía `supabase.auth.admin.updateUserById` (resuelve por email o user-uuid).

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): test fallido de gating del ConfirmDialog** - `85a7e45` (test)
2. **Task 1 (GREEN): ConfirmDialog escalonado reutilizable** - `b662c4d` (feat)
3. **Task 2: script local de bootstrap de is_admin** - `b10638e` (feat)

_Task 1 siguió el ciclo TDD (test → feat). No hubo commit refactor: el GREEN ya quedó limpio (lint/tsc/test verdes)._

## Files Created/Modified
- `components/crm/confirm-dialog.tsx` - ConfirmDialog client + helpers puros (gating, anti-doble-submit, clase del botón) + RiskBadge inline.
- `components/crm/confirm-dialog.test.tsx` - 7 tests (los 6 comportamientos del plan + un caso extra error→reset) en environment node.
- `scripts/setup-admin.ts` - Bootstrap local de is_admin en app_metadata vía Admin API; carga .env.local con dotenv.
- `package.json` - Agregado `"setup:admin": "tsx scripts/setup-admin.ts"`.

## Decisions Made
- **ConfirmDialog no autoriza nada:** cabecera en español lo deja explícito — la garantía real es `requireAdmin()` server-side (Pitfall 2, plan 01-01). Un request directo que salte el dialog igual choca contra el guard.
- **is_admin en app_metadata vía Admin API:** no UPDATE SQL, no columna en `businesses` (D1/D2). El flag viaja en el JWT y no es editable por el propio usuario.
- **Bootstrap como script local:** otorgar is_admin son las llaves del reino (§7); corre fuera del runtime web con service-role, sin auth web, no self-serve.
- **RiskBadge inline:** el plan 03 (wave 3) crea `risk-badge.tsx`; para no acoplar el orden de waves, el dialog renderiza la insignia inline con las mismas variantes alto/medio/bajo.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Testing Library / DOM environment ausentes — gating testeado vía helpers puros en node**
- **Found during:** Task 1 (ConfirmDialog, fase RED)
- **Issue:** El plan asumía "Vitest + Testing Library, ya disponible en el repo". NO lo está: no hay `@testing-library/*` ni `jsdom`/`happy-dom` en node_modules, el `vitest.config` corre `environment: 'node'`, y el milestone prohíbe paquetes npm nuevos (§7, threat T-01-SC `accept`). Instalar Testing Library + jsdom habría violado la restricción de cero deps.
- **Fix:** La lógica de gating del dialog (qué habilita confirmar, anti doble-submit, qué palabra/motivo se exige, clase destructive) se extrajo a helpers puros exportados del mismo módulo (`computeConfirmState`, `buildSubmitGuard`, `confirmButtonClass`). El componente React los consume. El test cubre los 6 comportamientos del bloque `<behavior>` testeando esos helpers en environment node — sin DOM ni deps nuevas. El render (clases, base-ui Dialog, a11y) queda validado por `tsc` + `lint` + revisión visual en Phases 2-3 que consumen el dialog.
- **Files modified:** components/crm/confirm-dialog.tsx, components/crm/confirm-dialog.test.tsx
- **Verification:** `npx vitest run components/crm/confirm-dialog.test.tsx` → 7/7 verdes; suite completa 29/29.
- **Committed in:** 85a7e45 (test) + b662c4d (feat)

**2. [Rule 1 - Lint/Bug] `react-hooks/refs`: lectura de ref dentro de useMemo**
- **Found during:** Task 1 (GREEN, primer lint)
- **Issue:** El guard de submit se construía en `useMemo` con una closure que leía `loadingRef.current`; ESLint (`react-hooks/refs`) lo marca como acceso a ref durante render.
- **Fix:** Se reemplazó por `useCallback` que arma el guard y lo invoca dentro del handler (event handler, no render), donde leer el ref es correcto.
- **Files modified:** components/crm/confirm-dialog.tsx
- **Verification:** `npx eslint` limpio; test sigue 7/7 verde.
- **Committed in:** b662c4d (Task 1 GREEN)

---

**Total deviations:** 2 auto-fixed (1 blocking de entorno, 1 lint/bug)
**Impact on plan:** El contrato de props del ConfirmDialog y todos los comportamientos del plan se cumplen tal cual; lo único que cambió es la *técnica* de testeo (helpers puros en node en vez de render con Testing Library) por la restricción de cero deps. Sin scope creep.

## Issues Encountered
- `require('./confirm-dialog')` dentro del test fallaba bajo Vitest (resolución CJS de un módulo TS/ESM). Resuelto importando `confirmButtonClass` con el `import` ESM del tope del archivo. No afectó código de producción.

## TDD Gate Compliance
- Task 1 cumplió el ciclo: commit `test(...)` (RED, `85a7e45`) → commit `feat(...)` (GREEN, `b662c4d`). RED falló por módulo inexistente (no por test mal escrito). Sin REFACTOR commit (el GREEN quedó limpio).

## User Setup Required
**TODO operativo (D2):** para que el operador entre al CRM hay que otorgarle `is_admin` corriendo localmente, con `.env.local` cargado:

```
npm run setup:admin -- <email-del-operador>
```

Verificación: en Supabase Auth el usuario queda con `app_metadata.is_admin = true` y puede entrar a `/admin`. Este paso requiere el `SUPABASE_SERVICE_ROLE_KEY` en el entorno y NO se ejecuta desde el runtime web (no self-serve).

## Next Phase Readiness
- ConfirmDialog listo para que Phases 2-3 lo consuman (suspender, editar precio, impersonar). El prop `requireReason` ya está cableado para impersonación.
- Pendiente para wave 3 / Phase 2: cuando exista `risk-badge.tsx` (plan 03), evaluar reemplazar el RiskBadge inline del dialog por el import compartido (refactor opcional, no bloqueante).
- Recordatorio de seguridad: toda acción peligrosa que use este dialog DEBE re-validar `requireAdmin()` server-side — el dialog no autoriza.

## Self-Check: PASSED
- components/crm/confirm-dialog.tsx, confirm-dialog.test.tsx, scripts/setup-admin.ts → existen.
- `setup:admin` presente en package.json.
- Commits 85a7e45 (test), b662c4d (feat), b10638e (feat) → existen en el historial.

---
*Phase: 01-cimientos-auditor-a*
*Completed: 2026-06-18*
