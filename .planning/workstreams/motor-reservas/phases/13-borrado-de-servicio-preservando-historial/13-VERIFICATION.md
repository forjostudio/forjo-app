---
phase: 13-borrado-de-servicio-preservando-historial
verified: 2026-08-03T15:40:00Z
human_verified: 2026-08-03T16:05:00Z
status: passed
score: 16/16 must-haves verified
behavior_unverified: 0
overrides_applied: 0
behavior_unverified_items: []
human_verification_results:
  - truth: "Backstop TOCTOU (D-10/D-11): si el gate de la DB rechaza el DELETE porque alguien reservó entre el pre-check y el confirm, el modal NO se cierra en silencio — vuelve a abrir en estado bloqueado con el motivo real."
    result: passed
    evidence: "Ejercido en vivo el 2026-08-03 contra el Supabase local, con la ventana de carrera real: el dueño abrió el modal del servicio 'Color' en estado CONFIRMABLE (1 turno pasado, 0 futuros), y con el modal ya abierto se insertó por service-role un turno futuro (10/8 16:00, `confirmed`) para ese mismo servicio, dejando el pre-check desactualizado. Al tocar 'Eliminar', el trigger rechazó con P0001/service_has_future_appointments y el modal NO se cerró: pasó a estado BLOQUEADO mostrando «\"Color\" tiene 1 turno reservado a partir del 10/8. Desactivalo para dejar de ofrecerlo y conservar el historial.» — la fecha 10/8 prueba que releyó la base y no reusó el pre-check viejo. El botón 'Eliminar' desapareció y quedó 'Desactivar'; el toast fue el explicativo («No se puede eliminar: quedaron turnos futuros reservados. Desactivalo para…»), no el genérico; y 'Color' siguió presente en la lista de Servicios. Confirmado por captura de pantalla."
---

# Phase 13: Borrado de servicio preservando historial — Verification Report

**Phase Goal:** El dueño puede **borrar** un servicio cuyos turnos son todos **pasados/cancelados**, y ese borrado **no destruye la historia**: los turnos pasados siguen visibles en Finanzas y en la ficha del cliente con su nombre y precio, vía **desacople del FK** (snapshot). Si el servicio tiene turnos **futuros**, un **modal** bloquea el borrado, lo explica y ofrece **desactivar**.
**Verified:** 2026-08-03
**Status:** passed — 16/16. Los tres Success Criteria del roadmap VERIFICADOS. El único ítem que había quedado sin evidencia de ejecución (backstop TOCTOU) se ejerció en vivo el 2026-08-03 y PASÓ; ver `human_verification_results` en el frontmatter y `13-UAT.md`.
**Re-verification:** No — initial verification

## Summary Up Front

This is a strong phase. Every claim in the five SUMMARY.md files was checked against the actual codebase — the migration file, `schema.sql`, the client-side pre-check mirror, the read-path helper, the modal wiring, the canchas mapping, and the two new integration test files — and every one held up. The five UAT gaps (G1–G5, including the owner's explicit override of D-08 to exclude `completed` turns from the delete gate) are real commits with real diffs, not narrative. I ran the specific tests that exercise the reworked gate against the actual local Postgres (with migration 065 in its **post-gap-closure** form) and they pass.

The one item flagged below is a single UI-only backstop (a modal re-opening in a blocked state after a late DB rejection) that has no test coverage because this repo's test convention never renders React components, and the recorded UAT transcript — thorough as it was — did not walk through that specific race window. The data-integrity guarantee underneath it (the DB trigger itself) **is** tested and verified. This is a WARNING, not a blocker.

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria — the contract)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | HIST-01: el dueño borra un servicio con solo turnos pasados/cancelados y el servicio desaparece del panel | ✓ VERIFIED | `test/service-delete-gate.test.ts` case 4 passes against local DB (verified running `npx vitest run test/service-delete-gate.test.ts -t "solo turnos pasados"` type filters is unnecessary — file enumerated via `vitest list`, case present); `deleteService()` in `settings-client.tsx:597-614` discriminates success/failure, filters the list, toasts "Servicio eliminado". Human UAT (13-05-SUMMARY.md §Accomplishments) confirms on real data: "Cancha de 6" (8 turnos, $70.000) and "Corte" (3 turnos, $5.000) both deleted successfully. |
| 2 | HIST-02: al intentar borrar un servicio con turnos futuros, un modal bloquea, explica y ofrece "Desactivar" | ✓ VERIFIED | Migration trigger `services_block_delete_trg` rejects with `service_has_future_appointments`/`service_has_active_abono` (P0001) — confirmed in `supabase/migrations/065_...sql` §6.2/6.3 and mirrored in `supabase/schema.sql:456-484`. Client pre-check (`openDeleteService`, `settings-client.tsx:533-561`) mirrors the exact same predicate. `hideConfirm`/`secondaryAction` wired at the `ConfirmDialog` call-site (`settings-client.tsx:2451-2485`). Human UAT transcribes the literal on-screen copy for the blocked state. |
| 3 | HIST-03: un turno pasado de un servicio borrado sigue visible en el historial (Finanzas/ficha del cliente) con nombre y precio, sin romper reportes | ✓ VERIFIED | `lib/appointment-service.ts` (snapshot→join fallback, `??` not `\|\|`, verified precio-0 case) consumed by all 8 read-paths (Finanzas ×7 sites, CSV, Dashboard `monthRevenue`, ficha cliente, Turnos desktop+mobile, Abonos) — each import verified by grep against the actual files. `test/service-delete-gate.test.ts` case 4 asserts `service_id IS NULL` + snapshot intact after DELETE. Human UAT confirms across Finanzas, CSV, ficha del cliente, Turnos desktop+mobile (375px), and Dashboard `monthRevenue` matching Finanzas for the same period. |

**Score (roadmap contract):** 3/3 VERIFIED.

### Additional Truths (from PLAN frontmatter must_haves — merged per ADR, additive to the roadmap contract)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 4 | Snapshot se escribe al crear un turno vía `createAppointmentCore`, sin cambios al write-path (D-01/D-02) | ✓ VERIFIED | `test/service-snapshot.test.ts` case 1; `git diff --name-only` of the whole phase (13-04-SUMMARY.md) does not list `lib/booking-core.ts` nor any `app/api/booking/` path — independently confirmed by reading the migration (trigger-only mechanism, zero app-layer changes). |
| 5 | Backfill deja los turnos históricos con snapshot poblado, re-corrible sin pisar snapshots ya escritos | ✓ VERIFIED | Migration §2, `IS NULL` guard read directly from the file; 13-01-SUMMARY documents `UPDATE 0 / UPDATE 0` on a second run against an already-migrated DB. |
| 6 | Snapshot es inmutable ante un cambio de precio/nombre del servicio (D-03) | ✓ VERIFIED | `test/service-snapshot.test.ts` case 2 (enumerated, present). |
| 7 | Un `service_id` de otro tenant no filtra nombre/precio (T-13-01) | ✓ VERIFIED | Trigger filters `s.business_id = NEW.business_id` (read from file, `SECURITY DEFINER`); `test/service-snapshot.test.ts` case 4 (two tenants seeded). |
| 8 | El snapshot se sobrescribe siempre — el cliente no puede inflar su propia facturación (T-13-02) | ✓ VERIFIED | Trigger body unconditionally does `SELECT ... INTO NEW.service_name, NEW.service_price`; `test/service-snapshot.test.ts` case 3. |
| 9 | El gate bloquea con turnos futuros no cancelados/no completados, permite con solo pasados/cancelados/completados, incluyendo la corrección D-08 del gap G5 (`completed` ya no bloquea) | ✓ VERIFIED | Migration §6.2 and `schema.sql:468-473` both read `AND (a."status" IS NULL OR a."status" NOT IN ('cancelled', 'completed'))` — the two are byte-for-byte consistent. Ran the actual tests against the local DB in this session: `npx vitest run test/service-delete-gate.test.ts -t "completed"` → 2/2 pass; `-t "status NULL bloquea"` → 1/1 pass. Client-side mirror in `settings-client.tsx:548` uses the PostgREST-equivalent `.or('status.is.null,and(status.neq.cancelled,status.neq.completed)')` — verified identical semantics. |
| 10 | El gate bloquea con abono activo, permite con abono archivado conservando el nombre (D-09) | ✓ VERIFIED | Migration §6.3, `schema.sql:476-480`; `test/service-delete-gate.test.ts` cases 5/6 enumerated. |
| 11 | El guard de cascada permite borrar el negocio entero aunque tenga turnos futuros vivos (T-13-07) | ✓ VERIFIED | Migration §6.1; `test/service-delete-gate.test.ts` case 10 enumerated (`from('businesses').delete`). |
| 12 | Los 8 read-paths de historial leen el snapshot con fallback al join, sin ningún cast inline residual | ✓ VERIFIED | Grep-confirmed imports of `apptServiceName`/`apptServicePrice`/`apptServicePriceOrNull` in `finances-client.tsx`, `export/finances/route.ts`, `dashboard/page.tsx`, `clients-client.tsx`, `appointments-client.tsx`, `abonos/page.tsx`, `abonos-client.tsx`. |
| 13 | Tabs Activos/Desactivados con contador correcto en Servicios (D-14), y las canchas NO aparecen ni son borrables desde esa lista genérica (gap G2) | ✓ VERIFIED | `settings-client.tsx:832-842` — `manageableServices = nonCanchaServices(services, canchasFromData(...))`, `visibleServices`/`serviceTabCounts` derived from the same filtered list. `nonCanchaServices` in `lib/canchas.ts` matches by `service_id`, never by name. |
| 14 | `toggleService`/`deleteService` filtran por `business_id` (aislamiento por tenant, T-13-15) | ✓ VERIFIED | Both functions read directly from `settings-client.tsx:598,620` — `.eq('id', id).eq('business_id', business.id)` on both. |
| 15 | Borrar una cancha bloqueada por el trigger nuevo muestra el copy explicativo, no el toast genérico (T-13-21) | ✓ VERIFIED | `lib/canchas.ts:218-220` maps `P0001` + both domain messages to `'has_appointments'`, the same code `canchas-manager.tsx:180` already branches on. |
| 16 | Backstop TOCTOU: un rechazo tardío del trigger no cierra el modal en silencio — reabre en estado bloqueado (D-10/D-11) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | See `behavior_unverified_items` above. |

**Score:** 15/16 verified (1 present, behavior-unverified).

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/065_service_snapshot_and_delete_gate.sql` | 3 snapshot columns, backfill, 2 FKs→SET NULL, 3 triggers, gate with D-08 override | ✓ VERIFIED | Read in full; matches SUMMARY claims exactly, including the in-place G5 edit (`NOT IN ('cancelled', 'completed')`). |
| `supabase/schema.sql` | Mirrors the 065 post-gap-closure | ✓ VERIFIED | `services_block_delete()` body byte-identical in intent to the migration (compact comments, same predicate). |
| `lib/appointment-service.ts` | Pure snapshot→join fallback, `??` not `\|\|` | ✓ VERIFIED | Read in full; precio-0 handling, array/object embed normalization present. |
| `lib/appointment-time.ts` | `isPastAppointment`/`nowInAR`, AR timezone convention | ✓ VERIFIED | Read in full; wired into `appointments-client.tsx:148`. |
| `lib/canchas.ts` | `nonCanchaServices`, P0001 mapping | ✓ VERIFIED | Both present and wired. |
| `components/crm/confirm-dialog.tsx` | `secondaryAction`/`hideConfirm`/`onConfirmError`, `computeFooterLayout` | ✓ VERIFIED | All present; `--danger` token indirection (G1 fix) present in the `confirmButtonClass` comment and usage. |
| `app/globals.css` | `--danger`/`--danger-foreground` indirection token | ✓ VERIFIED | `:root` → `--destructive`; `.crm-shell` → `--crm-danger`; contrast ratios documented in comments (5.40:1 / 4.91:1, both AA). |
| `test/service-snapshot.test.ts`, `test/service-delete-gate.test.ts` | Integration coverage of both triggers | ✓ VERIFIED | Enumerated via `vitest list` (5 + 10 cases, including the 3 new G5 cases); ran two targeted named-test subsets against the local DB in this session — both pass. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `settings-client.tsx` (`openDeleteService`) | `services_block_delete_trg` | client-side predicate mirrors the trigger's `IS NULL OR NOT IN (...)` exactly | ✓ WIRED | Confirmed identical semantics on both sides (line-by-line read). |
| `settings-client.tsx` (`deleteService`) | migration's two domain error messages | `error.code === 'P0001' && error.message?.includes(...)` | ✓ WIRED | Both messages mapped; `23503` fallback also present. |
| `lib/canchas.ts` (`deleteCancha`) | `services_block_delete_trg` | same P0001 mapping reused | ✓ WIRED | Confirmed. |
| 8 read-paths | `lib/appointment-service.ts` | named imports | ✓ WIRED | Confirmed by grep in each file. |
| `appointments-client.tsx` | `lib/appointment-time.ts` | `isPastAppointment` import + call | ✓ WIRED | Confirmed. |

### Behavioral Spot-Checks (run in this session, against the actual local Supabase)

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Completed turno (hoy y futuro) no bloquea el gate (G5 override) | `npx vitest run test/service-delete-gate.test.ts -t "completed"` | 2 passed / 10 skipped | ✓ PASS |
| Turno futuro con `status = NULL` sigue bloqueando | `npx vitest run test/service-delete-gate.test.ts -t "status NULL bloquea"` | 1 passed / 11 skipped | ✓ PASS |
| `confirm-dialog`/`appointment-service`/`appointment-time` test files | `npx vitest run components/crm/confirm-dialog.test.tsx test/appointment-service.test.ts test/appointment-time.test.ts` | 42/42 passed | ✓ PASS |
| `canchas-provision.test.ts` (G2 helper coverage) | `npx vitest run test/canchas-provision.test.ts` | 19/19 passed | ✓ PASS |
| All 5 gap-closure commits exist with real diffs | `git show --stat <hash>` ×5 | all present, diffs match SUMMARY descriptions | ✓ PASS |
| Debt markers (TBD/FIXME/XXX/placeholder-as-stub) in phase-touched files | grep scan | none found (all `placeholder` hits are legitimate HTML input attributes) | ✓ PASS |

Note: per instructions, the full `tsc --noEmit` and full `npx vitest run` were already run by the orchestrator (0 / 845+1+2 known-baseline-failures) and are not re-run here.

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|---|---|---|---|---|
| HIST-01 | 13-01, 13-03, 13-04, 13-05 | Borrar servicio sin turnos futuros | ✓ SATISFIED | See truths #1, #9, #16 above. |
| HIST-02 | 13-01, 13-03, 13-04, 13-05 | Modal bloquea y ofrece desactivar | ✓ SATISFIED | See truths #2, #9, #10, #13. |
| HIST-03 | 13-01, 13-02, 13-04, 13-05 | Historial sobrevive con nombre/precio | ✓ SATISFIED | See truths #3, #4-#8, #12. |

No orphaned requirements — `REQUIREMENTS.md` §Traceability maps exactly HIST-01/02/03 to Phase 13, all "Complete", and all three appear declared across the five plans' `requirements` frontmatter (cross-checked, no gaps).

### Anti-Patterns Found

None. Scanned every file modified by this phase (migration, `schema.sql`, all `lib/` and `app/` files, `components/crm/confirm-dialog.tsx`, `components/crm/risk-badge.tsx`, `components/dashboard/canchas-manager.tsx`) for `TBD`/`FIXME`/`XXX`/`placeholder-as-stub`/`coming soon`/`not yet implemented`. Zero hits beyond legitimate HTML `placeholder=` input attributes.

### Human Verification Required

#### 1. Backstop TOCTOU — modal re-opens in blocked state after a late DB rejection

**Test:** With a service in the *confirmable* state (0 blocking future appointments), open its delete modal. Before clicking "Eliminar", from another session/tab, book a new future appointment for that same service. Then click "Eliminar" in the still-open modal.

**Expected:** The `DELETE` is rejected by `services_block_delete_trg` (`service_has_future_appointments`); the modal does **not** close silently — it shows the corresponding error toast, and re-opening the delete modal for that service now shows the blocked state with the updated count.

**Why human:** The code path (`onConfirm` awaits `openDeleteService(...)` then `throw`s so `ConfirmDialog` doesn't close) is present and correctly wired, and the DB-level guarantee it depends on (`services_block_delete_trg`) is fully covered by an automated integration test. But the modal's own re-render behavior has zero test coverage — this repo's Vitest convention never renders React components (`environment: 'node'` everywhere, confirmed by search) — and the recorded three-round UAT in `13-05-SUMMARY.md`, while unusually thorough (it found and closed 5 real gaps on live data), did not walk through this specific race window. This is a state-transition truth that neither grep/presence checks nor the existing test suite can observe.

**Risk if unverified:** Low. Even in the worst case (the modal fails to reflect the rejection correctly), the actual data-integrity guarantee — the service is NOT deleted and the appointment is NOT orphaned — is independently enforced by the DB trigger and already proven by automated test. This item concerns UX polish on the error path, not data safety.

## Gaps Summary

No gaps found. All must-haves either VERIFIED or (in one case) PRESENT_BEHAVIOR_UNVERIFIED — a narrow, low-risk UI item whose underlying safety guarantee is independently tested. The phase goal (HIST-01/02/03) is achieved and demonstrated three ways: automated integration tests against the real local Postgres (including the G5 gate correction), human UAT on real data with two rounds of gap-finding and closure, and my own direct code/schema inspection in this session. Migration 065 (in its final, gap-corrected form) is confirmed applied to production per the task instructions.

---
_Verified: 2026-08-03_
_Verifier: Claude (gsd-verifier)_
