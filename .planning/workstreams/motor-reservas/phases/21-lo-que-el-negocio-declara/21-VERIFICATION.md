---
phase: 21-lo-que-el-negocio-declara
verified: 2026-09-11T23:59:00Z
status: human_needed
score: 9/9 automatable truths verified (5 UI/visual truths routed to human verification, 0 failed)
covered_files: [".planning/workstreams/motor-reservas/REQUIREMENTS.md", ".planning/workstreams/motor-reservas/phases/21-lo-que-el-negocio-declara/21-01-PLAN.md", ".planning/workstreams/motor-reservas/phases/21-lo-que-el-negocio-declara/21-01-SUMMARY.md", ".planning/workstreams/motor-reservas/phases/21-lo-que-el-negocio-declara/21-02-PLAN.md", ".planning/workstreams/motor-reservas/phases/21-lo-que-el-negocio-declara/21-02-SUMMARY.md", ".planning/workstreams/motor-reservas/phases/21-lo-que-el-negocio-declara/21-REVIEW-FIX.md", ".planning/workstreams/motor-reservas/phases/21-lo-que-el-negocio-declara/21-REVIEW.md", "app/(dashboard)/agenda/agenda-client.tsx", "app/(onboarding)/onboarding/page.tsx", "components/agenda/block-services-line.tsx", "lib/onboarding-agenda.ts", "test/onboarding-agenda-rpc.test.ts", "test/onboarding-agenda.test.ts"]
covered_digest: "v1:sha256:25a38a12911888a2398c18265a6490249e3c0942451b7934053285c47f2da0d4"
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Con el negocio semilla en local, a 375px: paso Horarios con 3 servicios cargados y el toggle apagado no muestra ni chips ni aviso."
    expected: "Ninguna línea de chips ni aviso al pie visible con el toggle en No."
    why_human: "Es render de un client component; el runner corre en environment:'node' y no monta JSX."
  - test: "Prender el toggle, marcar 'Cerámica' sólo en el martes. Mirar el aviso al pie del paso Horarios."
    expected: "'Yoga' y 'Masaje' nombrados en el aviso, en gris (text-muted-foreground), sin ícono ni color de error."
    why_human: "Tono visual y color no verificables por grep; sólo se probó que el texto y el nodo role=\"status\" existen."
  - test: "Con el aviso en pantalla, click en Finalizar."
    expected: "El botón está habilitado y el alta termina (redirect a dashboard)."
    why_human: "El gate estructural (handleFinish no referencia el aviso) está probado por grep/awk; que el click realmente funcione en el navegador no lo prueba ningún test."
  - test: "Cerrar los 7 días del paso Horarios."
    expected: "El aviso desaparece (string vacío) en vez de listar los dos servicios del catálogo."
    why_human: "Cubierto por unit test + prueba de mutación a nivel de función pura; falta la confirmación de que el string vacío efectivamente no deja un hueco visual ni texto residual en el DOM."
  - test: "Crear/editar un negocio de rubro 'canchas' y entrar al paso Horarios."
    expected: "Ni el toggle ni el aviso ni la línea de chips aparecen; el paso Horarios se sigue mostrando igual que siempre."
    why_human: "canMapServicesInVertical() está correctamente cableado en código, pero el render condicional en el navegador no está probado por ningún test (environment:'node')."
  - test: "Comparar visualmente el panel de Agenda (dashboard) antes/después de la extracción del editor de chips: colapso, foco visible, área táctil de 44px, congelado durante el guardado."
    expected: "Cero diferencia de comportamiento o layout frente al estado anterior a la Fase 21."
    why_human: "El diff textual (comment-stripped) del bloque movido a components/agenda/block-services-line.tsx es idéntico salvo imports (confirmado en 21-REVIEW.md punto 1), pero la equivalencia VISUAL en el navegador no la puede afirmar un test en environment:'node'."
  - test: "Abrir el alta en http://192.168.x.x:3000 (LAN, sin HTTPS) desde el celular, paso 2 (Servicios)."
    expected: "La pantalla renderiza con normalidad (no queda en blanco)."
    why_human: "WR-02 (randomUUID ausente en contexto inseguro) se corrigió y se probó por mutación que la rama de fallback SE EJECUTA con un doble de Crypto sin randomUUID, pero la confirmación end-to-end en el dispositivo real sigue siendo UAT, como el propio REVIEW-FIX declara."
  - test: "Con un lector de pantalla (VoiceOver/NVDA), enfocar el switch '¿Cada franja es para un servicio puntual?'."
    expected: "Se anuncia la pregunta completa junto con el estado (encendido/apagado), no sólo 'Sí/No, switch'."
    why_human: "WR-04 se corrigió (aria-labelledby en vez de aria-pressed) y el lint confirma que el único diagnóstico nuevo desapareció, pero el anuncio real de un lector de pantalla no lo prueba ningún test."
  - test: "Vaciar el campo de hora de inicio o fin de un bloque en el paso Horarios y tocar Finalizar (o cambiar de paso)."
    expected: "El error 'Completá la hora de inicio y la de fin.' aparece pegado debajo de los inputs de esa franja, no en otro lugar de la pantalla."
    why_human: "isValidBlockTime está wireado antes de la comparación de orden (confirmado en el código), pero la posición visual del mensaje de error no la prueba ningún test de este repo."
---

# Phase 21: Lo que el negocio declara — Verification Report

**Phase Goal:** Que un negocio de clases pueda declarar su agenda real **desde el alta**, en vez de que
se le pida un horario genérico que no describe su negocio y tenga que corregirlo después en el panel.

**Verified:** 2026-09-11T23:59:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

The functional/data-integrity half of the goal is achieved and independently confirmed against
real code and a real local database, not just against the SUMMARYs' claims. What remains open is
exclusively the visual/UX half, which no test in this repo (`vitest` `environment: 'node'`) can
exercise, and which both plans and both code-review artifacts explicitly flag as pending UAT under
this project's `end-of-phase` human-verify mode.

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A franja declared in the alta (toggle on + service marked) ends up as a real row in `time_block_services`, pointing at the correct service | ✓ VERIFIED | `test/onboarding-agenda-rpc.test.ts` case (a) run live against the local Supabase in this session: **4 passed (4)**, not skipped — confirms `services.id` client-generated PK is accepted by the RLS INSERT policy under the owner's own session (closes RESEARCH assumption A2) |
| 2 | The onboarding no longer hand-writes `time_blocks`; the only write is `supabase.rpc('save_agenda_blocks', ...)`, so franjas+mapping land in one PostgREST transaction | ✓ VERIFIED | `grep -cF "save_agenda_blocks"` = 3; `timeBlocksToInsert` = 0; `capacity: 1` = 0; code read at `page.tsx:526-560` confirms single RPC call, `p_business_id: business.id` (tenant from session, not form) |
| 3 | A business that never touches the toggle ships exactly as before — wildcard everywhere, bridge empty | ✓ VERIFIED | `test/onboarding-agenda-rpc.test.ts` case (b) + `test/onboarding-agenda.test.ts` D-10 case, both green against real translator/RPC |
| 4 | Toggle off at finish persists wildcard on ALL franjas even if local state still has a mapping loaded, and that mapping stays alive in memory | ✓ VERIFIED | `buildOnboardingAgendaPayload({ mapServices: false, ... })` returns `service_ids: []` for every block (unit-tested); `dayStates` is never mutated by the toggle handler (code read, `setPerFranja(v => !v)` only) |
| 5 | Each step-2 service is born with a stable client-generated id that is the same `services.id` inserted — renaming preserves the mapping, no positional correlation | ✓ VERIFIED | `newServiceId()` in `lib/onboarding-agenda.ts`; insert omits `.select()`; RPC test proves the client PK is accepted by a real INSERT under the owner's session |
| 6 | CR-01 (critical finding): the chips line, the D-07 coverage notice and the persisted payload can no longer disagree about the same franja when a mapped service's name is cleared | ✓ VERIFIED | `esServicioVigente`/`franjaServiceIdsVigentes` declared once in `lib/onboarding-agenda.ts` and consumed at all three boundaries (payload, notice, `BlockServicesLine` prop at `page.tsx:1145`); regression test in `21-REVIEW-FIX.md` shown red before (`2 failed`) and green after (`18 passed`) the fix, commit `304611d` |
| 7 | The chips editor exists exactly once in the repo, shared by panel and onboarding | ✓ VERIFIED | `grep -cE` symbol count on `block-services-line.tsx` = 6 (matches the six symbols the plan says move); panel imports it (`agenda-client.tsx:34`), no local `function BlockServicesLine` remains in the panel; 21-REVIEW.md independently confirms via comment-stripped textual diff that it's a true move, not a rewrite |
| 8 | The gate that decides whether the mapping is persisted (`vertical`, `perFranja`, `servicesFailed`) is a single, testable, non-invertible rule (WR-05 from code review) | ✓ VERIFIED | `shouldMapServices()` extracted to the pure module; mutation-tested in `21-REVIEW-FIX.md` (4 mutants applied, all 4 die: `3 failed`, `7 failed`, `1 failed`, `1 failed`); used verbatim in `handleFinish` (`page.tsx:547`) |
| 9 | D-07's zero-franjas guard uses `hasScheduleCoverage` (with the guard), never the raw `isServiceScheduled` — a business that closes all 7 days does not get its whole catalogue falsely flagged | ✓ VERIFIED | `grep -vE "^\s*(\*|//|/\*)"` count of `isServiceScheduled` outside comments = 0; mutation test (swap to raw function) turns exactly the zero-franjas case red (`1 failed`), reverted → green |
| 10 | The toggle, chips line and guide line hide correctly for the `canchas` vertical (control, not step, hidden) | ⚠️ code verified / visual UNCERTAIN | `canMapServicesInVertical(vertical)` gates all three render sites in code (`page.tsx:617, 656, 1041`); actual on-screen behavior for a `canchas` business is not exercised by any test — routed to human verification |
| 11 | The panel (`agenda-client.tsx`) behaves and looks identical after the chips editor was extracted into a shared module | ⚠️ code verified / visual UNCERTAIN | Call site unchanged (`agenda-client.tsx:1304-1312`, same props); `tsc`/tests green; visual/behavioral equivalence in the browser is explicitly still open (both SUMMARYs, and independently confirmed by `21-REVIEW.md`'s own textual diff, which only proves source equivalence, not rendered equivalence) |
| 12 | The toggle and chips read correctly and are usable on mobile (375px), and the switch announces correctly to assistive tech | ⚠️ code verified / visual UNCERTAIN | WR-04 fix removes the invalid `aria-pressed`, adds `aria-labelledby` — confirmed by lint diff (the one new diagnostic this phase introduced is gone); actual screen-reader / mobile rendering is unverifiable by this repo's `node`-environment test runner |
| 13 | The empty-hour validation error renders pinned to the inputs that caused it | ⚠️ code verified / visual UNCERTAIN | `isValidBlockTime` wired ahead of the order comparison in `validateHours()` (code read); visual placement of the `<p>` error relative to its inputs is UI, not testable here |
| 14 | `newServiceId()` degrades correctly (no blank screen) on an insecure origin (`http://` LAN, the way this project does mobile UAT) | ⚠️ code verified / device UNCERTAIN | Mutation test in `21-REVIEW-FIX.md` proves the fallback branch actually executes against a `Crypto` double lacking `randomUUID` (old implementation throws, new one returns a valid v4 uuid); end-to-end confirmation on a real phone over LAN is still open |

**Score:** 9/9 automatable truths verified, 0 failed. 5 additional truths are code-verified but
inherently require a browser/device to close (routed to human verification, not counted as
verified and not counted as failed).

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `components/agenda/block-services-line.tsx` | Shared chips editor, exports `BlockServicesLine`/`ServiceCatalogItem` | ✓ VERIFIED | 243 lines; symbol count = 6 (matches plan); `min-h-11 min-w-11`, `role="status"`, `gap-x-2 gap-y-0`, `Cualquier servicio`×2 all present |
| `lib/onboarding-agenda.ts` | Pure translator: `buildOnboardingAgendaPayload`, D-10, phantom-service backstop, `shouldMapServices`, `servicesWithoutCoverage`, `newServiceId`, `toNumberOr` | ✓ VERIFIED | Read in full; only imports `@/lib/agenda-hours-payload` and `@/lib/time-block-services`; no React/Supabase |
| `app/(onboarding)/onboarding/page.tsx` | Per-service id, `service_ids` per franja, toggle, chips line, D-07 notice, RPC submit | ✓ VERIFIED | All symbols wired: `newServiceId`, `perFranja`, `canMapServices`, `chipCatalog`, `showServicesToggle`, `sinCobertura`, `avisoSinCobertura`, `save_agenda_blocks` call |
| `app/(dashboard)/agenda/agenda-client.tsx` | Imports extracted component instead of defining it | ✓ VERIFIED | `import { BlockServicesLine, ... }` at line 34; call site unchanged; no local `function BlockServicesLine` remains |
| `test/onboarding-agenda-rpc.test.ts` | End-to-end tracer against local Supabase | ✓ VERIFIED, RE-RUN LIVE | `Test Files 1 passed (1)`, `Tests 4 passed (4)` — ran for real against local DB in this verification session, not skipped |
| `test/onboarding-agenda.test.ts` | Pure translator suite | ✓ VERIFIED, RE-RUN LIVE | Re-run in this session together with 3 other files: `Test Files 4 passed (4)`, `Tests 62 passed (62)` |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `page.tsx` submit | `lib/onboarding-agenda.ts` | `buildOnboardingAgendaPayload(dayStates, { mapServices: shouldMapServices(...), liveServiceIds })` | ✓ WIRED | Confirmed at `page.tsx:542-549` |
| `lib/onboarding-agenda.ts` | `lib/agenda-hours-payload.ts` | delegates to `buildSaveHoursPayload(days, { hasLocations: false })` | ✓ WIRED | Confirmed, no reimplementation of payload shape |
| `page.tsx` | `components/agenda/block-services-line.tsx` | `<BlockServicesLine serviceIds={franjaServiceIdsVigentes(...)} ... />` | ✓ WIRED | Confirmed at `page.tsx:1145`, includes the CR-01 fix (filtered ids, not raw) |
| `agenda-client.tsx` | `components/agenda/block-services-line.tsx` | import, unchanged call site | ✓ WIRED | Confirmed at `agenda-client.tsx:34, 1304` |
| `page.tsx` | `save_agenda_blocks` RPC (migr. 074) | `supabase.rpc('save_agenda_blocks', { p_business_id: business.id, p_blocks })` | ✓ WIRED, DB-VERIFIED | Confirmed by live re-run of `onboarding-agenda-rpc.test.ts` against local Supabase |
| `lib/onboarding-agenda.ts` (`servicesWithoutCoverage`) | `lib/time-block-services.ts` (`hasScheduleCoverage`) | direct import, guarded function only | ✓ WIRED | `isServiceScheduled` outside comments = 0 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `p_blocks` sent to RPC | `dayStates` (wizard state) | Local `useState`, mutated by user interaction (`toggleBlockService`, `updateBlock`) | Yes — translated by pure, tested function, no static fallback | ✓ FLOWING |
| `time_block_services` rows post-submit | RPC result | `save_agenda_blocks` PostgreSQL function (migr. 074) | Yes — confirmed by reading the bridge table with an independent admin client in the live test run | ✓ FLOWING |
| D-07 notice text | `sinCobertura` | `servicesWithoutCoverage(services, dayStates)` — real wizard state, not mocked | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Real-DB tracer for a franja declared in the alta reaching `time_block_services` | `npx vitest run test/onboarding-agenda-rpc.test.ts` | `Test Files 1 passed (1)`, `Tests 4 passed (4)` | ✓ PASS |
| Pure translator + CR-01 regression + `shouldMapServices` truth table + zero-franjas guard | `npx vitest run test/onboarding-agenda.test.ts test/onboarding-agenda-rpc.test.ts test/agenda-save-blocks-rpc.test.ts test/agenda-hours-payload.test.ts` | `Test Files 4 passed (4)`, `Tests 62 passed (62)` | ✓ PASS |
| No TypeScript regression | `./node_modules/.bin/tsc --noEmit` | exit 0 | ✓ PASS |
| No new lint diagnostics on the 4 touched files | `npx eslint <4 files>` | 3 problems, all pre-existing (`Badge` unused, `set-state-in-effect`, `Date.now` purity in the unrelated panel) — `jsx-a11y/role-supports-aria-props` (the only new diagnostic the phase introduced) is gone | ✓ PASS |
| No new migration, no new dependency | `ls supabase/migrations \| grep -c "^077"`; `git status --porcelain -- package.json package-lock.json` | `0`; empty | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|--------------|--------|----------|
| AGENDA-08 | 21-01, 21-02 | El onboarding deja declarar la agenda real de un negocio de clases desde el alta | ✓ SATISFIED (functional/data path) — visual half open | Live DB test (case a) proves a declared franja reaches `time_block_services` with the correct service; CR-01 fix proves the three UI-facing surfaces (chips/notice/payload) can no longer disagree; the only remaining open items are UI rendering checks a `node`-environment test cannot perform |

No orphaned requirements: `REQUIREMENTS.md` maps only AGENDA-08 to Phase 21.

### Anti-Patterns Found

None new to this phase's scope. `IN-01` through `IN-05` from `21-REVIEW.md` (unused `Badge` import,
positional block identity, generic `console.error(err)` in one catch, mixed state-update styles,
`addBlock` edge case at day's end) were explicitly left out of the fix scope by instruction and are
info-level, non-blocking to the phase goal. `21-REVIEW-FIX.md` documents them as deliberately
deferred, not silently dropped.

### Probe Execution

Not applicable — this phase has no `scripts/*/tests/probe-*.sh` and none were declared in the plans.

### Human Verification Required

See the `human_verification` list in the frontmatter (10 items). Summary: all 10 items are visual,
mobile, screen-reader, or device-specific checks — none of them touch the data-integrity or
tenant-isolation guarantees, all of which were verified against real code and a real local database
in this session. This matches exactly what both `21-01-SUMMARY.md` and `21-02-SUMMARY.md` themselves
register as pending under this project's `end-of-phase` human-verify mode, plus the device/AT-specific
items `21-REVIEW-FIX.md` flagged after the WR-02/WR-04 fixes.

### Gaps Summary

No gaps. The single Critical finding from code review (CR-01 — the three-way "vigencia" disagreement)
is fixed in the code with a single rule (`esServicioVigente`/`franjaServiceIdsVigentes`) applied at all
three boundaries, and is backed by a regression test shown red before the fix and green after
(`304611d`), re-confirmed live in this verification session. All 7 Warning-level findings (WR-01
through WR-07) are also fixed and independently re-verified: `shouldMapServices` and the zero-franjas
guard are mutation-tested (not just present), the RPC backstop test (WR-06) now actually forces a
`23503` and checks atomicity instead of asserting a tautology, and the accessibility/insecure-origin
fixes (WR-02, WR-04) removed the one new lint diagnostic the phase had introduced. The `npm test`
failures the orchestrator reported are a pre-existing, deliberately-designed wall-clock canary in two
files this phase never touched (confirmed: `git diff --name-only a2efd35..HEAD` does not include
`test/service-delete-gate.test.ts` or `test/capacity-mode-change-gate.test.ts`).

What remains is exclusively the visual/device layer that this repo's test runner cannot exercise
(`environment: 'node'`), and the project's own workflow (`human_verify_mode: end-of-phase`) routes that
to a human checkpoint rather than blocking automated completion. Nothing here contradicts the
functional/security claims made in the SUMMARYs — this verification independently re-ran the DB
integration test, the full pure suite, `tsc`, and lint on the touched files rather than trusting the
SUMMARY narrative.

---

_Verified: 2026-09-11T23:59:00Z_
_Verifier: Claude (gsd-verifier)_
