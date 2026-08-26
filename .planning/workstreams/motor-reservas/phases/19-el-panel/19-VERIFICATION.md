---
phase: 19-el-panel
verified: 2026-08-26T14:26:33Z
status: human_needed
score: 9/9 must-haves verified
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Abrir Agenda en el navegador a 375px y en desktop. Marcar/desmarcar chips de servicio en una franja."
    expected: "El chip 'Cualquier servicio' aparece/desaparece al instante, sin animación, y la línea NO cambia de alto (min-h-11 en ambos casos). El anillo de foco se ve sobre el botón de 44px, no sobre el pill de 28px. Los ocho escenarios listados en 19-05-SUMMARY.md §UAT visual."
    why_human: "19-05-SUMMARY.md declara explícitamente que la UAT visual (Task 1) NO se ejecutó en navegador — es una afirmación 'por código' (min-h-11 en los dos casos) sin confirmación ocular. CSS layout/altura y foco visual no son verificables por grep."
  - test: "Guardar horarios en producción por primera vez desde el deploy y confirmar que la llamada al RPC no devuelve PGRST202."
    expected: "El guardado se completa y persiste (o, si falla con 'función no encontrada', correr NOTIFY pgrst, 'reload schema'; en el editor SQL de producción)."
    why_human: "19-06-SUMMARY.md registra T-19-32 como ABIERTA / no confirmada: el operador no confirmó explícitamente haber corrido NOTIFY pgrst tras aplicar la 074. Sin esa recarga de caché, PostgREST no expone la función y cada guardado de horarios en prod falla con PGRST202 hasta que se corra a mano. No verificable desde el repo."
  - test: "Disparar el toast de 'service_not_scheduled' desde el booking público real (reservar un horario que una franja mapeada ya no cubre para ese servicio)."
    expected: "El cliente ve 'Ese horario ya no se ofrece para este servicio. Recargá la página y elegí otro.' — no un error de red genérico."
    why_human: "El código está presente y tipado correctamente (verificado por lectura + tsc limpio), pero es una rama de error de carrera (reconfiguración concurrente) sin test de integración ni UAT visual reportada; sólo confirmable disparándola de verdad contra el flujo público."
---

# Phase 19: El panel Verification Report

**Phase Goal:** Que el dueño pueda configurar lo que la Phase 18 volvió declarable. En Agenda asigna servicios a cada franja, y la grilla **muestra** qué se da en cada una sin abrir nada. El caso por defecto —una franja sin servicios asignados— tiene que leerse como **"cualquiera"**, que es lo que significa, y no como un estado vacío o a medio configurar: es el estado del 100 % de los negocios el día del deploy.
**Verified:** 2026-08-26T14:26:33Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | AGENDA-05 — el dueño asigna servicios a una franja desde Agenda y la grilla muestra qué se da en cada una sin abrir nada | ✓ VERIFIED | `BlockServicesLine` (`agenda-client.tsx:259-380`) renders inline `<div role="group">` with `ServiceChip` buttons directly under each hour row — no modal/drawer/popover in the diff (grep for dialog/drawer/popover tags returns none). Chips toggle `service_ids` in local state via `toggleBlockService`; saved atomically through the RPC. |
| 2 | AGENDA-06 — una franja sin servicios asignados se ve y se lee como "cualquiera" | ✓ VERIFIED | `isDraftBlockWildcard` (`:194-199`) delegates to the single source of truth `isBlockWildcard` in `lib/time-block-services.ts:234-236` (never reimplements the rule). When wildcard, an informational `role="status"` chip reads "Cualquier servicio" (`:318-324`) — not a button, cannot be mis-read as an unselected option. |
| 3 | El panel decide "es comodín" con la MISMA función que el motor, nunca un filtro inline en el JSX (PLAN 19-01, AGENDA-02/D-16) | ⚠ WARNING (see Anti-Patterns) | The per-block wildcard decision (`isDraftBlockWildcard`) correctly delegates. But `hasChipCatalog` (`agenda-client.tsx:599-600`) still writes `b.service_ids.length > 0` inline — the literal negation of the comodín rule, in the same file the module header calls out by name (WR-06, unresolved). Today it answers a different question (show the services line container at all) and produces no observable divergence, but it is a drift risk the code review flagged and left unresolved without a documented disposition. |
| 4 | El guardado es TODO O NADA — un elemento rechazado no persiste nada de esa llamada (D-04) | ✓ VERIFIED | `test/agenda-save-blocks-rpc.test.ts` test 8 ("ATOMICIDAD") passes; migration 074 relies on PostgREST's per-request transaction wrap (no explicit BEGIN/COMMIT) and raises on any invalid element. 9/9 RPC tests pass. |
| 5 | Cambiarle el horario a una franja que ya tiene servicios NO borra su mapeo (D-01/D-02) | ✓ VERIFIED | `test/agenda-save-blocks-rpc.test.ts` test 2 passes. Migration UPDATEs the same `time_blocks` row (never DELETE+INSERT); `time_block_services` (child, `ON DELETE CASCADE`) is never touched by an UPDATE. |
| 6 | Guardar dos veces seguidas sin recargar no duplica ningún bloque (P-01) | ✓ VERIFIED | `test/agenda-hours-payload.test.ts:164-183` — permanent, committed test exercising the full state→payload→simulated-DB→re-derived-state→payload round trip; asserts the second payload has zero `id: null` elements. Part of the 46/46 passing suite (re-run independently, confirmed). |
| 7 | Guardar una sede no borra los bloques de otras sedes (P-03) | ✓ VERIFIED | `test/agenda-hours-payload.test.ts:63-72` ("CONTROL NEGATIVO de P-03") — `buildSaveHoursPayload` has no location parameter to filter by; both locations' blocks travel in every save. |
| 8 | Un payload con franja o servicio de OTRO negocio es rechazado por la base (aislamiento por tenant en el RPC) | ✓ VERIFIED | `test/agenda-save-blocks-rpc.test.ts` tests 5, 6, 7 (cross-tenant block, cross-tenant service, foreign `p_business_id`) all pass. RPC is `SECURITY INVOKER` (RLS applies inside) plus explicit `business_id` on every WHERE/INSERT (defense in depth per project rule). `location_id` tenancy is the one documented, deferred exception (WR-04, see Deferred Items). |
| 9 | Función no ejecutable por `anon` (P-02) | ✓ VERIFIED | `test/agenda-save-blocks-rpc.test.ts` test 9 passes. Migration REVOKEs from PUBLIC/anon, GRANTs to authenticated, and closes the schema-wide default ACL for FUNCTIONS. **Confirmed against production** (19-06-SUMMARY.md Paso 5): `prosecdef=false`, ACL `postgres/authenticated/service_role`, no `anon`. |

**Score:** 9/9 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `lib/time-block-services.ts` | `servicesOfBlock`/`isBlockWildcard` + prior functions, single source of truth | ✓ VERIFIED | 271 lines. Exports confirmed present and used across `agenda-client.tsx`, `settings-client.tsx`. |
| `lib/agenda-hours-payload.ts` | `buildSaveHoursPayload`/`buildDayStatesFromRows` contract, min 80 lines | ✓ VERIFIED | 220 lines. Both functions exported and consumed by `agenda-client.tsx`. |
| `supabase/migrations/074_save_agenda_blocks.sql` | Transactional `save_agenda_blocks` RPC + minimal privileges, min 120 lines | ✓ VERIFIED | 360 lines. Applied to production (already established, human-verified 2026-08-26). |
| `supabase/schema.sql` | Reflects 074 surgically | ✓ VERIFIED | Confirmed by 19-06-SUMMARY.md's replay validation (190 insertions, 0 deletions, ACL matches prod). |
| `app/(dashboard)/agenda/page.tsx` | Server-rendered `time_block_services` + service catalog reads, tenant-scoped | ✓ VERIFIED | 90 lines. `.eq('business_id', business.id)` on the new query (`:60`). |
| `app/(dashboard)/agenda/agenda-client.tsx` | Chips line per block, dirty state, atomic save via RPC | ✓ VERIFIED | 1828 lines. `disabled={savingHours}` applied to inputs, ×, chips, day toggle, "Agregar bloque", "Copiar a otros días" (CR-01 fixed, `90efd71`). |
| `app/(dashboard)/settings/settings-client.tsx` | 5th delete-precheck count + D-07 warning sentence | ✓ VERIFIED | New query at `:1211-1220`, `.eq('business_id', ...)`; warning sentence now uses `blocksBecomingWildcard` (WR-03 fixed, `eff6260`). |
| `app/[slug]/booking-client.tsx` | `service_not_scheduled` copy branch | ✓ VERIFIED | `:403-414`. Client-owned copy, server error code never interpolated (matches `prohibitions` in 19-03-PLAN). |
| `test/agenda-hours-payload.test.ts` | P-01/P-03 negative controls | ✓ VERIFIED | 215 lines, 8 describe blocks incl. the double-save round trip. |
| `test/agenda-save-blocks-rpc.test.ts` | Cross-tenant + atomicity tests against local Postgres | ✓ VERIFIED | 355 lines, 9 tests, all pass. |
| `test/time-block-services.test.ts` | Wildcard rule tests incl. inactive-service case | ✓ VERIFIED | 279 lines. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `agenda-client.tsx` | `lib/time-block-services.ts` | `isDraftBlockWildcard`→`isBlockWildcard` decides the comodín chip | ✓ WIRED | `:194-199, 275`. |
| `agenda-client.tsx` | `lib/agenda-hours-payload.ts` | `buildSaveHoursPayload`/`buildDayStatesFromRows` | ✓ WIRED | `:798, 813` (payload build) and post-save re-derivation. |
| `agenda-client.tsx` | `public.save_agenda_blocks` | single `supabase.rpc()` call with full 7-day set | ✓ WIRED | `:799-802`. |
| `settings-client.tsx` | `public.time_block_services` | count query for delete precheck, tenant-scoped | ✓ WIRED | `:1211-1220`. |
| `booking-client.tsx` | `lib/booking-core.ts` (server) | `service_not_scheduled` error code round-trips to client-owned copy | ✓ WIRED | `:403-414`. |
| `agenda/page.tsx` | `public.time_block_services` + `services` catalog | server-rendered, passed as props, no client fetch | ✓ WIRED | `:60, :71`. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `agenda/page.tsx` → `agenda-client.tsx` | `time_block_services` bridge rows, service catalog | `supabase.from('time_block_services').select(...).eq('business_id', business.id)` | Yes — real Postgres query, tenant-scoped | ✓ FLOWING |
| `agenda-client.tsx` chips | `service_ids` per block | Derived via `servicesOfBlock`/`buildDayStatesFromRows` from the server-rendered rows above, not a static default | Yes | ✓ FLOWING |
| `settings-client.tsx` delete dialog | `delInfo.blocks`, `delInfo.blocksToWildcard` | Live `count`/select queries against `time_block_services`, filtered by `business_id` + `service_id` | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Pure module tests (wildcard rule + payload contract) | `npx vitest run test/agenda-hours-payload.test.ts test/time-block-services.test.ts` | 2 files, 46/46 tests passed | ✓ PASS |
| RPC integration tests (atomicity, tenant isolation, anon rejection) | `npx vitest run test/agenda-save-blocks-rpc.test.ts` | 1 file, 9/9 tests passed | ✓ PASS |
| Typecheck | `./node_modules/.bin/tsc --noEmit` | exit 0, no output | ✓ PASS |
| Debt markers in touched files | `grep -nE "TBD\|FIXME\|XXX"` across the 8 touched app/lib files | 0 matches | ✓ PASS |
| Full workspace suite (context, not a phase-19 gate) | already run by orchestrator | 1047 passed / 5 failed — the 5 are `abono-*` tests, parallel DB interference, unrelated to phase 19 (re-verified isolated: 34/34 pass) | ℹ INFO (not re-run here, per instructions) |

### Probe Execution

No `scripts/*/tests/probe-*.sh` conventions apply to this phase and none are declared in the PLAN/SUMMARY files. **Step 7c: SKIPPED (no probes declared or discovered).**

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|--------------|--------|----------|
| AGENDA-05 | 19-01, 19-02, 19-03, 19-04, 19-05, 19-06 | El dueño asigna servicios a una franja desde Agenda y la grilla muestra qué se da sin abrir nada | ✓ SATISFIED | Truths 1, 4-9 above; production migration applied and privileges verified. |
| AGENDA-06 | 19-01, 19-03, 19-04, 19-05 | Una franja sin servicios asignados se ve y se lee como "cualquiera" | ✓ SATISFIED | Truth 2 above; wildcard chip renders via single source of truth, informational not clickable. |

No orphaned requirements: `.planning/workstreams/motor-reservas/REQUIREMENTS.md:74-78,109-110` maps exactly AGENDA-05/06 to Phase 19, and both appear in every relevant PLAN's `requirements` frontmatter field.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `agenda-client.tsx` | 599-600 | `hasChipCatalog` reimplements the comodín rule inline (`b.service_ids.length > 0`) instead of delegating to `isDraftBlockWildcard`/`lib/time-block-services.ts` | ⚠ Warning (WR-06, code review — unresolved, not in the Resolución table, not in `deferred-items.md`) | No current observable defect (the actual per-block decision delegates correctly), but is the exact "second interpretation of the comodín rule" the module's own header warns against. Drift risk for a future edit. |
| `settings-client.tsx` | 1241 | `count === null` fail-closed guard applied only to the new `blocks` count, not to the pre-existing `abo`/`hist` counts that use the identical `head: true` shape | ⚠ Warning (WR-07, code review — unresolved, not in the Resolución table, not in `deferred-items.md`) | `activeAbono` (from `abo.count`) feeds `delBlocked`; a null count on that specific query would silently flip a blocked delete into a confirmable one in the UI (the DB trigger still rejects it, so no data loss — but the modal offers an action it cannot verify). |
| `lib/time-block-services.ts` | 111-117 | `isServiceScheduled` exported with a docblock promising a Phase 19 consumer (D-06 aviso) that was never built; zero production consumers (only its own test) | ℹ Info (WR-08, code review — unresolved, not in `deferred-items.md`) | Dead export whose documentation misleads a future reader into thinking the D-06 warning exists. Low severity — no functional impact. |
| `supabase/migrations/074_save_agenda_blocks.sql` | 190, 219, 236 | `save_agenda_blocks` never validates that `location_id` belongs to `p_business_id` — only a plain FK to `locations(id)` exists, not a composite `(id, business_id)` | ⚠ Warning (WR-04, code review — explicitly deferred to `secure-phase`, requires new migration 075 since 074 is already live in prod) | Bounded: no cross-tenant read/write, only an owner writing a foreign location UUID into their own row (unreachable from their own location tabs). Correctly routed, not re-litigated here. |
| `agenda-client.tsx` | 565, 574 (per review; confirmed at 593-602 in current code) | The `canchas` vertical gate can hide service mappings the booking engine still enforces if a business switches vertical after mapping | ⚠ Warning (WR-05, code review — explicitly deferred to backlog, new scope: vertical is user-editable) | Correctly routed, not re-litigated here. |

None of the above are debt markers (TBD/FIXME/XXX) and none block AGENDA-05/AGENDA-06 today — they are process gaps (three code-review WARNING/INFO findings left without a documented fix/defer/accept decision) surfaced for the developer's attention, not functional regressions.

## Human Verification Required

### 1. Visual UAT of the chips line at 375px and desktop

**Test:** Open Agenda in the browser. Toggle service chips on a block; watch the wildcard chip appear/disappear; check focus ring placement; run the 8 scenarios listed in `19-05-SUMMARY.md` §UAT visual (especially #2 — no layout jump when marking the first chip — and #8 — focus ring on the 44px button, not the 28px pill).
**Expected:** No layout shift, informational wildcard chip reads correctly, focus states are visible and correctly sized.
**Why human:** `19-05-SUMMARY.md:138` explicitly states this UAT was **NOT executed in a browser** — the height-match claim is "by code" (both elements are `min-h-11`) but "needs eye confirmation." CSS rendering cannot be verified by static analysis.

### 2. First production hours-save after deploy (PostgREST schema cache)

**Test:** After this phase deploys, save hours once from the live dashboard and confirm it succeeds (or, if it returns "no se pudieron guardar", run `NOTIFY pgrst, 'reload schema';` in the production SQL editor).
**Expected:** The save completes without a `PGRST202`/function-not-found failure.
**Why human:** `19-06-SUMMARY.md:131-137` records T-19-32 as **open/unconfirmed** — the operator confirmed applying migration 074 to production but did not explicitly confirm running the mandatory `NOTIFY pgrst, 'reload schema';`. Without it, every hours save fails until someone runs that one line. Not verifiable from the repo.

### 3. `service_not_scheduled` toast from the real public booking flow

**Test:** Trigger the race condition (map a service to a subset of blocks in the panel, then attempt a public booking for a start time no longer covered by that service).
**Expected:** Toast reads "Ese horario ya no se ofrece para este servicio. Recargá la página y elegí otro."
**Why human:** The branch is code- and type-verified but has no integration test or reported UAT; it is a race-condition path only observable by actually triggering it against the live public flow.

## Gaps Summary

No BLOCKER gaps. Both roadmap Success Criteria (AGENDA-05, AGENDA-06) are implemented, wired to the single source of truth (`lib/time-block-services.ts`), covered by 46 permanent pure-function tests + 9 permanent RPC-integration tests (all passing, independently re-run), and the underlying migration 074 is confirmed live in production with correct privileges.

Three code-review findings (WR-06, WR-07, WR-08) were left unresolved by the phase's own "Resolución" table without being fixed, deferred to a named phase, or explicitly accepted — they should get one of those three dispositions (ideally added to `deferred-items.md` or fixed in a follow-up plan) so the record of what code review found stays honest, per WR-08's own complaint about undocumented state. None of the three currently cause an observable defect in AGENDA-05/AGENDA-06.

WR-04 (location_id tenant validation) and WR-05 (canchas gate hiding live mappings) are correctly routed to `secure-phase` and backlog respectively per the phase's own Resolución table — not re-litigated here, listed above for completeness.

Three items require a human with a browser/production access before this phase can be called fully closed: the visual UAT of the chips line (never done), confirmation that `NOTIFY pgrst` ran in production (unconfirmed), and a live trigger of the `service_not_scheduled` toast (never reported).

---

_Verified: 2026-08-26T14:26:33Z_
_Verifier: Claude (gsd-verifier)_
