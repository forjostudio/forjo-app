---
phase: 21-lo-que-el-negocio-declara
verified: 2026-09-12T19:03:04Z
status: passed
score: 9/9 automatable truths verified (13/14 total truths closed by code+UAT; truth 12's screen-reader half blocked by a missing environment prerequisite, 0 failed)
covered_files: [".planning/workstreams/motor-reservas/REQUIREMENTS.md", ".planning/workstreams/motor-reservas/phases/21-lo-que-el-negocio-declara/21-01-PLAN.md", ".planning/workstreams/motor-reservas/phases/21-lo-que-el-negocio-declara/21-01-SUMMARY.md", ".planning/workstreams/motor-reservas/phases/21-lo-que-el-negocio-declara/21-02-PLAN.md", ".planning/workstreams/motor-reservas/phases/21-lo-que-el-negocio-declara/21-02-SUMMARY.md", ".planning/workstreams/motor-reservas/phases/21-lo-que-el-negocio-declara/21-REVIEW-FIX.md", ".planning/workstreams/motor-reservas/phases/21-lo-que-el-negocio-declara/21-REVIEW.md", "app/(dashboard)/agenda/agenda-client.tsx", "app/(onboarding)/onboarding/page.tsx", "components/agenda/block-services-line.tsx", "lib/onboarding-agenda.ts", "test/onboarding-agenda-rpc.test.ts", "test/onboarding-agenda.test.ts"]
covered_digest: "v1:sha256:c04450cbbd2fc0a1703be1c40b42532631c51947f03c5790c369f52db1c53f22"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 9/9 automatable truths verified (5 UI/visual truths routed to human verification)
  reason: "Source changed after the previous report was written (670f7b2), and the human verification checkpoint completed (21-UAT.md). The previous covered_digest (v1:sha256:25a38a12...) no longer matched the tree."
  gaps_closed:
    - "Human verification items 1-7 and 9 — all confirmed PASS in the UAT session (21-UAT.md), including the real-phone insecure-origin check over http://192.168.0.7:3000"
    - "Truth 10 (canchas vertical hides toggle/chips/guide line) — UAT test 5 PASS"
    - "Truth 11 (panel visually/behaviorally identical after the chips extraction) — UAT test 6 PASS"
    - "Truth 13 (empty-hour error pinned to its inputs) — UAT test 9 PASS"
    - "Truth 14 (newServiceId degrades on an insecure origin) — UAT test 7 PASS on a real phone"
    - "UAT gaps G-21-10, G-21-12, G-21-13 (three cosmetic mobile findings) — closed by 670f7b2"
  gaps_remaining: []
  regressions: []
advisory:
  - finding: "G-21-11 — los campos numéricos del paso 2 (Precio y Min.) no se pueden vaciar con el teclado: el estado numérico controlado coerciona el campo vacío de vuelta al fallback (0 / 30) en cada backspace. Falta además el aviso cuando Min. queda en 0."
    category: other
    reason: "Hallazgo incidental de la UAT (test 11), fuera de las truths declaradas de la fase y fuera de AGENDA-08. Verificado como PRE-EXISTENTE, no una regresión de la fase: antes de la Phase 21 el mismo onChange usaba parseInt/parseFloat, que al vaciar el campo producía NaN — tampoco permitía vaciarlo, sólo fallaba distinto. El fix WR-03 (toNumberOr) cambió el síntoma (NaN → fallback), no lo introdujo. Se cierra con el patrón ya usado en components/dashboard/canchas-manager.tsx (guardar el valor crudo como string y coercionar al armar el payload). No hay fase posterior en el ROADMAP donde diferirlo: es trabajo abierto para /gsd-quick."
    evidence_status: "evidenced — UAT test 11 reproducible; registrado como G-21-11 (status: failed, severity: major) en 21-UAT.md"
human_verification:
  - test: "Con el negocio semilla en local, a 375px: paso Horarios con 3 servicios cargados y el toggle apagado no muestra ni chips ni aviso."
    expected: "Ninguna línea de chips ni aviso al pie visible con el toggle en No."
    why_human: "Es render de un client component; el runner corre en environment:'node' y no monta JSX."
    uat_outcome: pass
  - test: "Prender el toggle, marcar 'Cerámica' sólo en el martes. Mirar el aviso al pie del paso Horarios."
    expected: "'Yoga' y 'Masaje' nombrados en el aviso, en gris (text-muted-foreground), sin ícono ni color de error."
    why_human: "Tono visual y color no verificables por grep; sólo se probó que el texto y el nodo role=\"status\" existen."
    uat_outcome: pass
  - test: "Con el aviso en pantalla, click en Finalizar."
    expected: "El botón está habilitado y el alta termina (redirect a dashboard)."
    why_human: "El gate estructural (handleFinish no referencia el aviso) está probado por grep/awk; que el click realmente funcione en el navegador no lo prueba ningún test."
    uat_outcome: pass
  - test: "Cerrar los 7 días del paso Horarios."
    expected: "El aviso desaparece (string vacío) en vez de listar los dos servicios del catálogo."
    why_human: "Cubierto por unit test + prueba de mutación a nivel de función pura; falta la confirmación de que el string vacío efectivamente no deja un hueco visual ni texto residual en el DOM."
    uat_outcome: pass
  - test: "Crear/editar un negocio de rubro 'canchas' y entrar al paso Horarios."
    expected: "Ni el toggle ni el aviso ni la línea de chips aparecen; el paso Horarios se sigue mostrando igual que siempre."
    why_human: "canMapServicesInVertical() está correctamente cableado en código, pero el render condicional en el navegador no está probado por ningún test (environment:'node')."
    uat_outcome: pass
  - test: "Comparar visualmente el panel de Agenda (dashboard) antes/después de la extracción del editor de chips: colapso, foco visible, área táctil de 44px, congelado durante el guardado."
    expected: "Cero diferencia de comportamiento o layout frente al estado anterior a la Fase 21."
    why_human: "El diff textual (comment-stripped) del bloque movido a components/agenda/block-services-line.tsx es idéntico salvo imports (confirmado en 21-REVIEW.md punto 1), pero la equivalencia VISUAL en el navegador no la puede afirmar un test en environment:'node'."
    uat_outcome: pass
  - test: "Abrir el alta en http://192.168.x.x:3000 (LAN, sin HTTPS) desde el celular, paso 2 (Servicios)."
    expected: "La pantalla renderiza con normalidad (no queda en blanco)."
    why_human: "WR-02 (randomUUID ausente en contexto inseguro) se corrigió y se probó por mutación que la rama de fallback SE EJECUTA con un doble de Crypto sin randomUUID, pero la confirmación end-to-end en el dispositivo real sigue siendo UAT, como el propio REVIEW-FIX declara."
    uat_outcome: pass
    uat_note: "Probado en celular real sobre http://192.168.0.7:3000 (contexto inseguro). El bloqueo inicial ('no funcionan los botones') era allowedDevOrigins de next dev, no código de la fase."
  - test: "Con un lector de pantalla (VoiceOver/NVDA), enfocar el switch '¿Cada franja es para un servicio puntual?'."
    expected: "Se anuncia la pregunta completa junto con el estado (encendido/apagado), no sólo 'Sí/No, switch'."
    why_human: "WR-04 se corrigió (aria-labelledby en vez de aria-pressed) y el lint confirma que el único diagnóstico nuevo desapareció, pero el anuncio real de un lector de pantalla no lo prueba ningún test."
    uat_outcome: blocked
    uat_blocked_by: other
    uat_note: "Sin lector de pantalla disponible en el entorno de prueba (NVDA/VoiceOver). Prerequisito de entorno, no un defecto de código. Per verify-work.md: los tests bloqueados NO son gaps — son puertas de prerequisito. Queda formalmente sin verificar."
  - test: "Vaciar el campo de hora de inicio o fin de un bloque en el paso Horarios y tocar Finalizar (o cambiar de paso)."
    expected: "El error 'Completá la hora de inicio y la de fin.' aparece pegado debajo de los inputs de esa franja, no en otro lugar de la pantalla."
    why_human: "isValidBlockTime está wireado antes de la comparación de orden (confirmado en el código), pero la posición visual del mensaje de error no la prueba ningún test de este repo."
    uat_outcome: pass
---

# Phase 21: Lo que el negocio declara — Verification Report

**Phase Goal:** Que un negocio de clases pueda declarar su agenda real **desde el alta**, en vez de que
se le pida un horario genérico que no describe su negocio y tenga que corregirlo después en el panel.

**Verified:** 2026-09-12T19:03:04Z
**Status:** passed
**Re-verification:** Yes — the previous report (2026-09-11T23:59:00Z, `human_needed`) went stale when
`670f7b2` touched a covered file and the UAT checkpoint completed. Every automatable truth was re-run
against the CURRENT tree, not carried forward.

## Goal Achievement

The goal is achieved on both halves. The functional/data half was already independently confirmed
against real code and a real local database; this re-verification re-ran it from scratch on the
current tree. The visual/UX half — which no test in this repo (`vitest` `environment: 'node'`) can
exercise — was closed by the UAT session recorded in `21-UAT.md`: 8 of 9 items PASS, 1 blocked by a
missing environment prerequisite (no screen reader installed), which `verify-work.md` classifies
explicitly as a prerequisite gate and not a gap.

### What changed since the stale report — `670f7b2` audited line by line

`670f7b2` is the only commit that touched a covered source file after the previous report. It touches
exactly one file, `app/(onboarding)/onboarding/page.tsx` (+31/−16, and 15 of those insertions are
comment lines). **Confirmed behavior-neutral** by reading the full diff, not by trusting the commit
message:

| Hunk | Change | Behavioral surface |
|------|--------|--------------------|
| Logout button (~line 685) | The `<Button>` is wrapped in a new `<div className="mb-1 flex justify-end sm:absolute sm:right-0 sm:top-0 sm:mb-0">`; the `absolute right-0 top-0` moves from the Button to the wrapper | None. `variant`, `size`, `onClick={handleLogout}` and the children are byte-identical. Layout-only: mobile puts it in its own flow row, `sm+` restores the previous absolute corner |
| `SelectContent` of Rubro (~line 816) | `className="w-auto min-w-(--anchor-width) max-w-[calc(100vw-2rem)]"` added | None. No change to `SelectItem` generation, to `VERTICALS`, to the `value`/`onValueChange` binding. Pure width CSS, scoped to this one select |
| Two time `<Input>`s (~lines 1114/1133) | `className="w-24 …"` → `className="w-auto min-w-24 …"` | None. `type`, `value`, `onChange={e => updateBlock(...)}` and `aria-invalid` unchanged |

No logic, no control flow, no data path, no state, no handler, no prop-passing changed. Independently
corroborated: the full suite, `tsc --noEmit` and the eslint diagnostic set on the four touched files
are identical to the pre-commit baseline, and `git status` shows a clean working tree for all four
implementation files.

### Observable Truths

| # | Truth | Status | Evidence (re-run on the CURRENT tree) |
|---|-------|--------|--------------------------------------|
| 1 | A franja declared in the alta (toggle on + service marked) ends up as a real row in `time_block_services`, pointing at the correct service | ✓ VERIFIED | `npx vitest run test/onboarding-agenda-rpc.test.ts` case (a) ran **live against the local Supabase in this session**, tagged `\|db\|`, not skipped: `4 passed (4)`. Confirms the client-generated `services.id` PK is accepted by the RLS INSERT policy under the owner's own session |
| 2 | The onboarding no longer hand-writes `time_blocks`; the only write is `supabase.rpc('save_agenda_blocks', ...)`, so franjas+mapping land in one PostgREST transaction | ✓ VERIFIED | `grep -nF save_agenda_blocks` → 3 hits, the only executable one at `page.tsx:550` with `p_business_id: business.id` (tenant from session, not form). `timeBlocksToInsert` = 0 occurrences; `capacity: 1` = 0 occurrences (D-12: the RPC omits the column, the DB default applies) |
| 3 | A business that never touches the toggle ships exactly as before — wildcard everywhere, bridge empty | ✓ VERIFIED | RPC test case (b) *"toggle APAGADO al finalizar: las franjas se crean y la puente queda vacía (D-10)"* + the pure D-10 case, both green live |
| 4 | Toggle off at finish persists wildcard on ALL franjas even if local state still has a mapping loaded, and that mapping stays alive in memory | ✓ VERIFIED | Pure case *"con el toggle APAGADO todas las franjas viajan en comodín, aunque el estado tenga mapeo (D-10)"* green; the handler at `page.tsx:1076` is `onClick={() => setPerFranja(v => !v)}` — it never touches `dayStates` |
| 5 | Each step-2 service is born with a stable client-generated id that is the same `services.id` inserted — renaming preserves the mapping, no positional correlation | ✓ VERIFIED | `newServiceId()` used at `page.tsx:138` (lazy initializer) and `:219`; the insert at `page.tsx:486-495` sends `id: s.id` explicitly and has **no `.select()`** — read in full this session. RPC test proves the client PK survives a real INSERT under the owner's session |
| 6 | CR-01: the chips line, the D-07 notice and the persisted payload can no longer disagree about the same franja when a mapped service's name is cleared | ✓ VERIFIED | `esServicioVigente`/`franjaServiceIdsVigentes` exported once from `lib/onboarding-agenda.ts:52,63` and consumed at all three boundaries (payload, notice, and the `BlockServicesLine` prop at `page.tsx:1160` — `serviceIds={franjaServiceIdsVigentes(b.service_ids, chipCatalogIds)}`, filtered ids, not raw). The three CR-01 regression cases ran green by name this session |
| 7 | The chips editor exists exactly once in the repo, shared by panel and onboarding | ✓ VERIFIED | `components/agenda/block-services-line.tsx` = 243 lines, exports `ServiceCatalogItem` (:28) and `BlockServicesLine` (:129). Panel imports it at `agenda-client.tsx:34` and calls it at `:1304`; `grep -c "function BlockServicesLine"` in the panel = **0** (no local definition survives). Onboarding imports it at `page.tsx:19` |
| 8 | The gate that decides whether the mapping is persisted (`vertical`, `perFranja`, `servicesFailed`) is a single, testable, non-invertible rule (WR-05) | ✓ VERIFIED | `shouldMapServices()` at `lib/onboarding-agenda.ts:94`, used verbatim in `handleFinish` (`page.tsx:547`). Its full 8-row truth table ran green by name this session, plus *"el gate y el payload son la MISMA decisión"* and the `canMapServicesInVertical` case |
| 9 | D-07's zero-franjas guard uses `hasScheduleCoverage` (with the guard), never the raw `isServiceScheduled` | ✓ VERIFIED | `grep -vE "^\s*(\*\|//\|/\*)" lib/onboarding-agenda.ts \| grep -c isServiceScheduled` = **0**. Named case *"con los SIETE días cerrados no avisa de nada (la guarda del negocio sin franjas, CR-01)"* green |
| 10 | The toggle, chips line and guide line hide correctly for the `canchas` vertical (control hidden, not step) | ✓ VERIFIED (code + UAT) | `canMapServicesInVertical(vertical)` gates the three render sites (`page.tsx:617` → `canMapServices`, `:631` → `showServicesToggle`, `:1091` guide line, `:1158` chips line). **UAT test 5: PASS** — confirmed on screen with a `canchas` business |
| 11 | The panel (`agenda-client.tsx`) behaves and looks identical after the chips editor was extracted | ✓ VERIFIED (code + UAT) | Call site unchanged at `agenda-client.tsx:1304`, same props; `tsc` exit 0; eslint diagnostics unchanged. **UAT test 6: PASS** — collapse, visible focus, 44px touch area and the frozen-while-saving state compared side by side |
| 12 | The toggle and chips read correctly and are usable on mobile (375px), and the switch announces correctly to assistive tech | ⚠️ PARTIALLY CLOSED — mobile VERIFIED, screen-reader BLOCKED | Mobile half: **UAT tests 1 and 2 PASS at 375px**. AT half: markup is the canonical WAI-ARIA switch pattern — `role="switch"` + `aria-checked={perFranja}` + `aria-labelledby="per-franja-label"` pointing at the span that carries the full question (`page.tsx:1066-1076`); the stray `aria-pressed` is gone from the switch (the one remaining `aria-pressed` at `:1104` is on the day `<button>`, a plain button role, pre-existing and valid). `jsx-a11y/role-supports-aria-props` no longer fires. **UAT test 8: BLOCKED** — no NVDA/VoiceOver in the test environment. Prerequisite gate, not a defect; the real announcement remains formally unverified |
| 13 | The empty-hour validation error renders pinned to the inputs that caused it | ✓ VERIFIED (code + UAT) | `validateHours()` at `page.tsx:391-406` runs `isValidBlockTime(start) \|\| isValidBlockTime(end)` **before** the `end <= start` comparison, and writes `error` onto the block itself. **UAT test 9: PASS** — the message renders under the offending franja's inputs |
| 14 | `newServiceId()` degrades correctly (no blank screen) on an insecure origin (`http://` LAN) | ✓ VERIFIED (code + UAT) | Three named cases green this session: with `randomUUID`, **without** `randomUUID` (returns a valid v4), and with no `crypto` at all. **UAT test 7: PASS on a real phone** over `http://192.168.0.7:3000`; the initial "buttons don't work" turned out to be `next dev`'s `allowedDevOrigins`, not phase code |

**Score:** 9/9 automatable truths verified, 0 failed. Of the 5 truths the previous report could only
code-verify, 4 are now fully closed by UAT and 1 (truth 12) is closed on its mobile half with its
screen-reader half blocked by a missing environment prerequisite. **13/14 total truths closed.**

### Prohibitions (judgment tier — resolved by the UAT session, not by presence alone)

| Prohibition | Source | Disposition | Evidence |
|-------------|--------|-------------|----------|
| The chips extraction must not degrade what the panel already had approved (44px touch area, visible focus, live region outside the flex flow, collapse threshold) | 21-01 | ✓ HELD | UAT test 6 PASS — compared on screen, not by grep |
| The alta must not persist a mapping the last screen didn't show, nor silently discard one it did | 21-01 | ✓ HELD | D-10 case green + CR-01 three-boundary case green |
| The toggle must not touch the data model: turning it off reveals less, never deletes the local mapping | 21-01 | ✓ HELD | `setPerFranja(v => !v)` is the whole handler; `dayStates` untouched (code read, `page.tsx:1076`) |
| The coverage notice must not block finishing the alta | 21-02 | ✓ HELD | `handleFinish` body contains zero references to `sinCobertura`/`avisoSinCobertura` (awk over the function body). UAT test 3 PASS — the button was enabled and the alta completed |
| The notice must not present itself as a form error | 21-02 | ✓ HELD | `<p role="status" className="text-xs text-muted-foreground">` at `page.tsx:1201` — no icon, no destructive color. UAT test 2 PASS on tone |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `components/agenda/block-services-line.tsx` | Shared chips editor, exports `BlockServicesLine`/`ServiceCatalogItem` | ✓ VERIFIED | 243 lines; both exports present; consumed by panel **and** onboarding |
| `lib/onboarding-agenda.ts` | Pure translator | ✓ VERIFIED | 12 exports incl. `buildOnboardingAgendaPayload`, `servicesWithoutCoverage`, `onboardingDraftBlocks`, `shouldMapServices`, `canMapServicesInVertical`, `esServicioVigente`, `franjaServiceIdsVigentes`, `newServiceId`, `toNumberOr`, `MIN_SERVICE_MINUTES`. No React/Supabase imports |
| `app/(onboarding)/onboarding/page.tsx` | Per-service id, `service_ids` per franja, toggle, chips line, D-07 notice, RPC submit | ✓ VERIFIED | All symbols wired and re-located after `670f7b2`'s +14-line shift (`newServiceId` :138/:219, `perFranja` :152, `canMapServices` :617, `showServicesToggle` :631, `sinCobertura` :647, `BlockServicesLine` :1159, notice :1201, RPC :550) |
| `app/(dashboard)/agenda/agenda-client.tsx` | Imports extracted component instead of defining it | ✓ VERIFIED | Import at :34, call site at :1304, zero local definitions |
| `test/onboarding-agenda-rpc.test.ts` | End-to-end tracer against local Supabase | ✓ VERIFIED, RE-RUN LIVE | 4 `\|db\|` tests passed against the real local DB this session |
| `test/onboarding-agenda.test.ts` | Pure translator suite | ✓ VERIFIED, RE-RUN LIVE | 33 `\|pure\|` tests passed, enumerated by name with `--reporter=verbose` |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `page.tsx` submit | `lib/onboarding-agenda.ts` | `buildOnboardingAgendaPayload(dayStates, { mapServices: shouldMapServices(...), liveServiceIds })` | ✓ WIRED | `page.tsx:542-549` |
| `lib/onboarding-agenda.ts` | `lib/agenda-hours-payload.ts` | delegates to `buildSaveHoursPayload(days, { hasLocations: false })` | ✓ WIRED | No reimplementation of the payload shape |
| `page.tsx` | `components/agenda/block-services-line.tsx` | `<BlockServicesLine serviceIds={franjaServiceIdsVigentes(...)} …>` | ✓ WIRED | `page.tsx:1159-1160` (CR-01 filtered ids, not raw) |
| `agenda-client.tsx` | `components/agenda/block-services-line.tsx` | import, unchanged call site | ✓ WIRED | `:34`, `:1304` |
| `page.tsx` | `save_agenda_blocks` RPC (migr. 074) | `supabase.rpc('save_agenda_blocks', { p_business_id: business.id, p_blocks })` | ✓ WIRED, DB-VERIFIED | `page.tsx:550`; confirmed by the live RPC test run |
| `lib/onboarding-agenda.ts` | `lib/time-block-services.ts` (`hasScheduleCoverage`) | direct import, guarded function only | ✓ WIRED | `isServiceScheduled` outside comments = 0 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `p_blocks` sent to RPC | `dayStates` | Local `useState`, mutated by user interaction (`toggleBlockService`, `updateBlock`) | Yes — translated by a pure, tested function; no static fallback | ✓ FLOWING |
| `time_block_services` rows post-submit | RPC result | `save_agenda_blocks` (migr. 074) | Yes — the bridge table was read back with an independent admin client in the live run | ✓ FLOWING |
| D-07 notice text | `sinCobertura` | `servicesWithoutCoverage(services, dayStates)` at `page.tsx:647` — real wizard state, not mocked | Yes | ✓ FLOWING |
| `filasDeServicios` sent to `services` insert | `services` | Step-2 state, filtered by `esServicioVigente`, ids from `newServiceId()` | Yes — `id` is the client PK, no `.select()` round trip | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Whole workspace suite (run ONCE, not filtered per truth) | `npx vitest run` | `Test Files 87 passed (87)`, `Tests 1126 passed \| 4 expected fail \| 1 skipped (1131)`, exit 0 | ✓ PASS |
| Phase-21 tests exist and pass, enumerated by name | `npx vitest run test/onboarding-agenda-rpc.test.ts test/onboarding-agenda.test.ts --reporter=verbose` | `2 passed (2)` / `37 passed (37)`; the 4 `\|db\|` cases ran live, none skipped | ✓ PASS |
| No TypeScript regression (binary invoked directly — `npx tsc` always exits 0 in this repo) | `./node_modules/.bin/tsc --noEmit` | exit 0, no output | ✓ PASS |
| Lint diagnostics on the 4 touched files unchanged after `670f7b2` | `npx eslint -f json <4 files>` | Exactly 3, all pre-existing: `agenda-client.tsx:853 react-hooks/purity`, `page.tsx:13 no-unused-vars` (`Badge`), `page.tsx:195 react-hooks/set-state-in-effect`. `jsx-a11y/role-supports-aria-props` absent | ✓ PASS |
| No new migration, no new dependency | `ls supabase/migrations \| grep -c "^077"`; `git status --porcelain -- package.json package-lock.json` | `0`; empty | ✓ PASS |
| Working tree matches what was verified | `git status --porcelain` on the 4 implementation files | empty | ✓ PASS |

Note on the previous report's caveat: the `npm test` failures it attributed to a pre-existing
wall-clock canary no longer appear — the full suite is green end to end in this session.

### Probe Execution

Not applicable — this phase has no `scripts/*/tests/probe-*.sh` and none were declared in the plans.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|--------------|--------|----------|
| AGENDA-08 | 21-01, 21-02 | El onboarding deja declarar la agenda real de un negocio de clases desde el alta | ✓ SATISFIED | Data path proven live against the local DB (a declared franja reaches `time_block_services` with the correct service); UI path confirmed by the completed UAT (8/9 PASS). `REQUIREMENTS.md:112` already marks it Complete |

No orphaned requirements: `REQUIREMENTS.md` maps only AGENDA-08 to Phase 21, and Phase 21 is the last
phase of the workstream roadmap.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `app/(onboarding)/onboarding/page.tsx` | 13 | `Badge` imported, never used | ℹ️ Info | Pre-existing (IN-01 in `21-REVIEW.md`), deliberately out of fix scope |
| `app/(onboarding)/onboarding/page.tsx` | 195 | `react-hooks/set-state-in-effect` (slug derivation) | ℹ️ Info | Pre-existing, untouched by this phase |
| `app/(dashboard)/agenda/agenda-client.tsx` | 853 | `react-hooks/purity` (`Date.now`) | ℹ️ Info | Pre-existing, in the unrelated panel |

No `TBD`/`FIXME`/`XXX` debt markers in any file modified by this phase (`grep -nE "TBD\|FIXME\|XXX"`
over the four implementation files: no hits). No new placeholders, no empty handlers, no hardcoded
empty data feeding the render. `IN-02`…`IN-05` from `21-REVIEW.md` remain documented as deliberately
deferred in `21-REVIEW-FIX.md`, not silently dropped.

### Human Verification — RESOLVED

The checkpoint completed. `21-UAT.md` is `status: complete`, 13 entries, `passed: 8`, `blocked: 1`,
`issues: 4`, `pending: 0`.

| # | Item | Outcome |
|---|------|---------|
| 1 | Toggle off at 375px shows neither chips nor notice | ✓ pass |
| 2 | Notice names the uncovered services, in muted grey, no error styling | ✓ pass |
| 3 | Finalizar stays enabled with the notice on screen | ✓ pass |
| 4 | Seven days closed ⇒ notice says nothing | ✓ pass |
| 5 | `canchas` vertical hides toggle/chips/guide line | ✓ pass |
| 6 | Panel visually identical after the chips extraction | ✓ pass |
| 7 | Insecure-origin (`http://` LAN) step 2 renders on a real phone | ✓ pass |
| 8 | Screen reader announces the switch question + state | ⛔ blocked (`blocked_by: other`) — no NVDA/VoiceOver available. Environment prerequisite, not a defect. Per `verify-work.md`, blocked tests are prerequisite gates and do NOT become gaps |
| 9 | Empty-hour error pinned under its own inputs | ✓ pass |

The blocked item is reported, not absorbed: truth 12's screen-reader half stays formally unverified in
this report. The markup is the canonical WAI-ARIA switch pattern and lint agrees, but no test and no
human has heard the announcement.

### Incidental UAT Findings (outside the phase's declared truths)

Four findings were logged during the UAT that are not among this phase's must-haves:

| Gap | Severity | State | Detail |
|-----|----------|-------|--------|
| G-21-10 | cosmetic | ✓ resolved | Logout button overlapping the centred lockup at ~390px — closed by `670f7b2` |
| G-21-12 | cosmetic | ✓ resolved | Rubro select popup cramping "Belleza/Estética/Spa" and overflowing the viewport — closed by `670f7b2` |
| G-21-13 | cosmetic | ✓ resolved | Time inputs clipping the AM/PM suffix in a 12-hour locale — closed by `670f7b2` |
| G-21-11 | major | ⚠️ **OPEN** | Step-2 numeric fields (Precio / Min.) can't be cleared with the keyboard; no warning when Min. hits 0 |

**G-21-11 is open work, not a phase truth failure — and it is *not* a Phase 21 regression.** I checked
the pre-phase source rather than accepting the framing: at `a2efd35` the same handlers were
`parseInt(e.target.value)` / `parseFloat(e.target.value)`, so clearing the field already failed
(it produced `NaN`). The WR-03 fix (`toNumberOr`) changed the failure *mode* — `NaN` became a snap back
to the fallback — it did not introduce the inability to clear. The defect predates the phase, sits
outside AGENDA-08 and outside every declared truth, and there is no later phase in this workstream's
ROADMAP to defer it into. It is tracked as `G-21-11` in `21-UAT.md` and is a `/gsd-quick` candidate;
the fix pattern already exists in `components/dashboard/canchas-manager.tsx` (hold the raw string,
coerce only when building the payload).

### Gaps Summary

No gaps blocking the phase goal. Every automatable truth was re-verified against the current tree with
freshly executed commands — the full suite (87 files, 1126 passed), the two phase test files enumerated
by name (37 passed, including 4 live DB cases), `tsc --noEmit` via the binary directly (exit 0), and
eslint on the four touched files (3 diagnostics, all pre-existing). `670f7b2` was audited hunk by hunk
and is confirmed CSS/markup only: a wrapper `<div>`, a `SelectContent` width class and two `Input`
width classes, with every prop, handler and binding byte-identical.

Two items are reported open rather than papered over: UAT item 8 (screen-reader announcement) is
blocked on a missing environment prerequisite and its truth is *not* counted as verified, and G-21-11
is an open, pre-existing, out-of-scope UX defect recorded in `21-UAT.md`.

---

_Verified: 2026-09-12T19:03:04Z_
_Verifier: Claude (gsd-verifier)_
