---
phase: 06-modelo-del-abono-alta-manual-generaci-n-forward
plan: 04
subsystem: api
tags: [typescript, supabase, next-16, abonos, cron, multi-tenant, motor-generacion, vitest]

# Dependency graph
requires:
  - phase: 06-01-modelo-del-abono
    provides: "tabla abonos (status/generated_until/skipped_occurrences) + appointments.abono_id + businesses.abono_window_weeks"
  - phase: 06-02-motor-generacion-forward
    provides: "generateAbonoOccurrences({supabase,business,abono,fromDate,toDate}) → {created, skipped}; motor PURO (no persiste), toda ocurrencia por createAppointmentCore"
  - phase: 06-03-alta-manual
    provides: "convención de persistencia del estado rolling (generated_until = toDate, skipped_occurrences.slice(-50)) y cómo el alta genera la primera tanda"
provides:
  - "app/api/cron/cancel-expired/route.ts — extendAbonoWindows(supabase): extensión de la ventana rolling de abonos activos como piggyback best-effort en el ÚNICO cron diario (sin cron nuevo, sin tocar vercel.json)"
  - "Idempotencia forward: por abono solo se genera la cola nueva (generated_until+1 → hoy+abono_window_weeks); re-correr el mismo día es no-op"
  - "Acumulación acotada de skipped_occurrences (append + cap a las últimas 50, mismo cap que el alta del Plan 03)"
affects: [07-cancelacion-serie]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Piggyback en el cron diario (espejo de writeMonthlySnapshot): función best-effort en su propio try/catch que corre al final en AMBAS ramas de salida del GET y NO aborta cancel-expired"
    - "try/catch por abono dentro del loop → un abono que falla no frena a los demás (T-06-17)"
    - "Ventana rolling calculada con todayInAR() (hora AR, no new Date() crudo) — misma fuente de verdad de 'hoy' que el alta y la ventana de reserva pública"
    - "Cola nueva = max(hoy, generated_until+1día) → hoy+window; si fromDate > toDate no hay cola (idempotencia del rolling)"

key-files:
  created:
    - test/abono-cron.test.ts
  modified:
    - app/api/cron/cancel-expired/route.ts

key-decisions:
  - "El cap de skipped_occurrences se hace CONCRETO e idéntico al alta (Plan 03): [...existentes, ...result.skipped].slice(-50), con comentario del PORQUÉ (abono active = indefinido → cola acotada); ambos puntos de escritura coinciden (augmentation del orquestador)"
  - "extendAbonoWindows se EXPORTA para poder testear la lógica de generación directo con el admin client; el gate del secreto se prueba invocando el GET real con Bearer incorrecto"
  - "Fechas de test RELATIVAS a hoy (dow = hoy+2 → 1ª ocurrencia futura) porque el cron computa 'hoy' internamente; las ocurrencias esperadas se enumeran con la misma aritmética del motor (avance de a 7 días)"

patterns-established:
  - "Extensión de series recurrentes en el cron diario: leer abonos active (+ business por join) → por abono calcular la cola nueva → motor atómico → persistir generated_until + skipped acotado, todo best-effort y aislado por tenant"

requirements-completed: [ABONO-06, ABONO-02]

# Metrics
duration: 20min
completed: 2026-07-20
status: complete
---

# Phase 6 Plan 04: Extensión de la ventana rolling del abono en el cron diario Summary

**El cron DIARIO existente (`app/api/cron/cancel-expired`) extiende la ventana rolling de cada abono `active` hacia adelante como piggyback best-effort (espejo de `writeMonthlySnapshot`, sin agregar ningún cron ni tocar `vercel.json`): por abono genera SOLO la cola nueva (`generated_until+1` → `hoy+abono_window_weeks`) vía el motor atómico del Plan 02, avanza `generated_until` (idempotente) y acumula `skipped_occurrences` capado a las últimas 50. Mantiene intacto el gate del `CRON_SECRET` (→401) y el aislamiento por tenant lo da el motor (filtro por `business_id` + UPDATE acotado). 5 tests de integración en verde.**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-07-20
- **Tasks:** 2
- **Files modified:** 2 (1 creado, 1 modificado)

## Accomplishments
- `extendAbonoWindows(supabase)` en `cancel-expired/route.ts`: lee todos los abonos `status='active'` (join to-one con `businesses` para `id, buffer_minutes, abono_window_weeks`), y por abono:
  - Calcula `toDate = hoy + abono_window_weeks*7` (default 8) con `todayInAR()` (hora AR, no UTC crudo).
  - `fromDate = max(hoy, generated_until+1día)` (o `hoy` si `generated_until` es null). Si `fromDate > toDate` → sin cola nueva, saltea (idempotencia del rolling).
  - Genera la cola vía `generateAbonoOccurrences` → todo turno por `createAppointmentCore` (núcleo atómico, CERO insert directo).
  - Persiste `generated_until = toDate` y `skipped_occurrences = [...existentes, ...result.skipped].slice(-50)` con UPDATE acotado por `id + business_id`.
- Piggyback como `writeMonthlySnapshot`: se llama en las DOS ramas de salida del GET (sin holds vencidos y final), best-effort en su propio try/catch → un fallo NO aborta `cancel-expired`. Además cada abono en su propio try/catch → un abono que falla no frena al resto (T-06-17).
- Contadores sumados al JSON de respuesta del cron: `{ ..., abonosExtended, abonoOccurrencesGenerated, abonoOccurrencesSkipped }`.
- Gate del `CRON_SECRET` (`authorization === Bearer ${CRON_SECRET}` → 401) intacto; `vercel.json` sin cambios (sigue con el único cron diario).
- `test/abono-cron.test.ts`: 5 casos contra la DB local — extensión (avance de `generated_until` + N turnos), idempotencia (2ª corrida sin duplicados), conflicto (ocurrencia ocupada se saltea + registra sin pisar el turno ajeno, el resto se genera), secreto (401 sin Bearer válido, sin generar), aislamiento (dos abonos de negocios distintos, sin cruce).

## Task Commits

1. **Task 1: Bloque de extensión en cancel-expired (piggyback best-effort)** — `5bcf6e4` (feat)
2. **Task 2: Tests de la extensión del cron** — `322912f` (test)

## Files Created/Modified
- `app/api/cron/cancel-expired/route.ts` — nueva función `extendAbonoWindows` + helpers `toISODate`/`addDaysISO` + `SKIPPED_CAP=50`; llamada en ambas ramas del GET, contadores en el JSON. Import de `generateAbonoOccurrences` y `todayInAR`.
- `test/abono-cron.test.ts` — 5 tests de integración con fechas relativas a hoy contra la DB local.

## Decisions Made
- **Cap de `skipped_occurrences` concreto e idéntico al alta:** `[...existentes, ...result.skipped].slice(-50)` (augmentation del orquestador). Un abono `active` es indefinido; el cron appendea skips cada día que encuentra conflictos → sin techo el JSONB crecería para siempre. Semántica de acumulación preservada, sólo se recorta la cola retenida. Mismo cap (50) que usa el alta del Plan 03: ambos puntos de escritura coinciden.
- **`extendAbonoWindows` exportada** para testear la generación directo con el admin client (service-role, como el cron en prod); el gate del secreto se prueba aparte invocando el `GET` real con un Bearer incorrecto (401).
- **Fechas de test relativas a hoy:** el cron computa "hoy" internamente con `todayInAR()`, así que el test no puede usar fechas fijas como el alta. Se elige `day_of_week = dowOf(hoy)+2` (1ª ocurrencia estrictamente futura) y se enumeran las ocurrencias esperadas con la misma aritmética del motor (avance de a 7 días desde la 1ª fecha que matchea el dow).

## Deviations from Plan

None — el plan se ejecutó tal cual, incorporando la augmentation del orquestador (cap de `skipped_occurrences` a las últimas 50 con `.slice(-50)`, idéntico al alta del Plan 03) como parte del UPDATE de persistencia de la Task 1.

**Total deviations:** 0.

## Threat Mitigations Applied
- **T-06-14 (Spoofing):** el gate `authorization === Bearer ${CRON_SECRET}` → 401 sigue intacto; la extensión no lo relaja — test 4 (401 sin Bearer válido, sin generar).
- **T-06-15 (Tampering):** toda ocurrencia pasa por `generateAbonoOccurrences` → `createAppointmentCore` (atómico); ante conflicto se saltea, nunca pisa — test 3 (turno ajeno intacto, sin `abono_id`).
- **T-06-16 (Info Disclosure / cross-tenant):** el motor filtra toda query por `business_id` del abono; el UPDATE del abono lleva `.eq('business_id', ...)` — test 5 (aislamiento, sin cruce).
- **T-06-17 (DoS):** por abono sólo se genera la COLA (típicamente ~1 semana nueva por corrida); best-effort con try/catch por abono → un abono que falla no frena al resto ni a `cancel-expired`.
- **T-06-18 (Availability):** piggyback en el cron diario existente; `vercel.json` sin cambios (Vercel Hobby = 1/día) — verificado por diff.

## Issues Encountered
- El cron computa "hoy" internamente (`todayInAR()`), a diferencia del alta que recibe `fromDate/toDate`. Los tests debieron usar fechas relativas a hoy y replicar la enumeración de ocurrencias del motor para asertar deterministicamente. Resuelto con helpers `toISODate`/`addDaysISO`/`occurrences` en el test.

## User Setup Required
None. En prod, `CRON_SECRET` ya está seteado (el cron `cancel-expired` ya corría). La extensión no agrega variables ni crons.

## Next Phase Readiness
- Phase 7 (cancelación de serie) puede apoyarse en que los abonos `cancelled` ya NO son extendidos por el cron (el filtro `status='active'` los excluye) — cancelar la serie detiene la generación forward sin más cambios en el cron.

## Self-Check: PASSED
- Archivos verificados: app/api/cron/cancel-expired/route.ts, test/abono-cron.test.ts, 06-04-SUMMARY.md — presentes.
- Commits verificados: 5bcf6e4 (Task 1), 322912f (Task 2) — en git log.
- `npx tsc --noEmit` pasa; `npx vitest run test/abono-cron.test.ts` → 5/5 verde.
- `git diff --name-only HEAD~2 HEAD` = solo route.ts + test; `vercel.json` NO aparece (grep -c = 0).

---
*Phase: 06-modelo-del-abono-alta-manual-generaci-n-forward*
*Completed: 2026-07-20*
