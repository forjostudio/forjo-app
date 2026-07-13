---
phase: 02-cupos-grupales
plan: 02
subsystem: api
tags: [supabase, rpc, postgres, advisory-lock, concurrency, booking-core, slot-full, vitest, types]

# Dependency graph
requires:
  - phase: 02-cupos-grupales (Plan 01)
    provides: "Migración 041 (book_slot_atomic SECURITY DEFINER + advisory lock + seat/is_group/capacity + índice 011 con seat + EXCLUDE 013 condicional); fixtures seedTimeBlock; scaffold concurrency.test.ts"
provides:
  - "createAppointmentCore crea turnos vía supabase.rpc('book_slot_atomic', { p_* }) — INSERT directo eliminado"
  - "Error de dominio slot_full (409) mapeado en el core; slot_taken (409) preservado para cupo 1"
  - "Re-check JS capacity-aware: rechazo temprano slot_taken solo para cupo 1; cupo grupal delega al RPC"
  - "lib/types.ts: capacity en TimeBlock; seat/is_group en Appointment"
  - "Fix de cupo-1 en la migración 041: slot_full gateado a capacity>1 (cero regresión, slot_taken vía 23505)"
  - "Entorno de test de integración apuntado al Supabase LOCAL (.env.test.local override)"
affects: [02-03, 02-04, 02-05, booking-core, availability, agenda-client, concurrency-tests]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Alta de turno vía RPC atómico (advisory lock + count vs capacity + INSERT) en una sola transacción server-side, reemplazando el INSERT autocommit del client JS"
    - "Re-check JS capacity-aware: el JS es solo UX y solo rechaza temprano cupo 1; la autoridad del cupo es el RPC"
    - "Mapeo de error en orden: message contiene 'slot_full' → slot_full; 23505/23P01 → slot_taken; resto → insert_failed"

key-files:
  created: []
  modified:
    - lib/booking-core.ts
    - lib/types.ts
    - supabase/migrations/041_time_blocks_capacity_and_seat.sql
    - supabase/schema.sql
    - test/booking-core.test.ts
    - test/landing-derive.test.ts
    - test/landing-seo.test.ts

key-decisions:
  - "El RAISE 'slot_full' del RPC solo aplica a capacity>1; cupo 1 cae al INSERT con seat=0 fijo → choca con el índice 011 (23505 → slot_taken), cero regresión del anti-doble-booking de v0.9"
  - "El re-check JS de solapamiento es capacity-aware: resuelve la capacity del slot (mismo join que el RPC) y solo rechaza temprano cuando capacity<=1; en grupal delega al RPC (Pitfall 5/A5)"
  - "Tests de integración corren contra el Supabase LOCAL (no contra el proyecto prod al que apunta .env.local) vía .env.test.local + override en vitest.setup.ts"

patterns-established:
  - "RPC book_slot_atomic como única vía de alta del core: ambos callers (público service-role + manual anon/RLS) heredan el anti-sobrecupo sin duplicarlo"
  - "El mapeo genérico result.error→HTTP de los dos route handlers propaga slot_full sin tocarlos"

requirements-completed: [CUPOS-03, CUPOS-05]

# Metrics
duration: ~40min
completed: 2026-06-27
status: complete
---

# Phase 2 Plan 02: Core cableado al RPC atómico (book_slot_atomic + slot_full) Summary

**`createAppointmentCore` ahora crea turnos vía `supabase.rpc('book_slot_atomic')` con anti-sobrecupo atómico, mapea `slot_full` (409) por separado de `slot_taken`, y hace el re-check JS capacity-aware — más un fix de la migración 041 que preserva la cero-regresión de cupo 1.**

## Performance

- **Duration:** ~40 min
- **Started:** 2026-06-27T11:38:00Z
- **Completed:** 2026-06-27T12:00:00Z
- **Tasks:** 2 (del plan) + 1 fix de migración + 1 ajuste de entorno de test
- **Files modified:** 7

## Accomplishments
- **Alta vía RPC atómico:** el INSERT autocommit directo (`supabase.from('appointments').insert(...)`) fue reemplazado por `supabase.rpc('book_slot_atomic', { p_* }).single()`. El RPC encapsula advisory-lock + count vs capacity + INSERT con `seat` en una sola transacción server-side → cierra la ventana TOCTOU que permitía sobrecupo bajo concurrencia.
- **Error `slot_full` (409):** agregado al tipo de retorno del core y al mapeo, en orden: `message` contiene `'slot_full'` (RAISE P0001) → `slot_full`; `23505`/`23P01` → `slot_taken`; resto → `insert_failed` (500). Ambos route handlers (público + manual) lo heredan por su mapeo genérico `result.error → HTTP` sin tocarse.
- **Re-check JS capacity-aware:** el rechazo temprano `slot_taken` por solapamiento ahora solo aplica a bloques cupo 1 (donde es el anti-doble-booking de duración variable de v0.9, que el RPC no cubre — solo cuenta el slot exacto). En bloques grupales (`capacity>1`) el core NO rechaza temprano: delega la autoridad del cupo al RPC (Pitfall 5/A5), evitando el falso `slot_taken` al 2º+ inscripto.
- **Tipos:** `TimeBlock` gana `capacity: number` (no opcional, columna NOT NULL DEFAULT 1); `Appointment` gana `seat?: number` e `is_group?: boolean`.
- **`booking-core.test.ts` verde (5/5)** contra Supabase local, incluyendo Test D = `slot_taken` para cupo 1 (confirma el fix de la 041). CUPOS-05 (seña por servicio) sin cambio: `requireDeposit` sigue rigiendo status/expires_at exactamente como antes.

## Task Commits

1. **Fix migración 041 — gate de slot_full a cupo>1 (Rule 1)** - `88dcffb` (fix)
2. **Task 1: core → book_slot_atomic + slot_full + re-check capacity-aware** - `2e096d4` (feat)
3. **Task 2: tipos capacity/seat/is_group** - `7adc86c` (feat)
4. **Adaptar mocks/fixtures al RPC + capacity NOT NULL** - `3d505e7` (test)
5. **Entorno de test → Supabase local (override .env.test.local)** - `cee4a70` (chore, hecho por el coordinador/usuario)

_Nota: `.planning/` está gitignored en este proyecto → el SUMMARY persiste en disco pero no se commitea (comportamiento esperado)._

## Files Created/Modified
- `lib/booking-core.ts` - INSERT directo → RPC `book_slot_atomic`; tipo de retorno +`slot_full`; re-check JS capacity-aware (resuelve la capacity del slot con el mismo join que el RPC y solo rechaza temprano cupo 1)
- `lib/types.ts` - `capacity: number` en `TimeBlock`; `seat?: number` e `is_group?: boolean` en `Appointment`
- `supabase/migrations/041_time_blocks_capacity_and_seat.sql` - RPC: `RAISE 'slot_full'` ahora gateado a `v_capacity > 1`; cupo 1 fuerza `seat=0` → choque 23505
- `supabase/schema.sql` - regenerado (`supabase db dump --local`) reflejando el fix del RPC
- `test/booking-core.test.ts` - el `blindSupabase` de Test D pasa `.rpc()` al cliente real (el alta vive en el RPC, no en `.insert()`); preserva la intención del test
- `test/landing-derive.test.ts`, `test/landing-seo.test.ts` - `capacity: 1` en los literales `TimeBlock` (ahora NOT NULL)

## Decisions Made
- **`slot_full` solo para cupo>1:** la migración 041 (Plan 01) hacía `RAISE 'slot_full'` por count también para cupo 1, lo que devolvía `slot_full` donde el contrato histórico (y CONC-02 / Test D) exige `slot_taken`. Se gateó el RAISE a `v_capacity > 1`; para cupo 1 se fuerza `v_seat := 0` → la 2ª reserva reusa el seat 0 del ocupante y choca con el índice único 011 (`23505` → `slot_taken`), byte-idéntico al anti-doble-booking de v0.9.
- **Re-check JS capacity-aware por query de capacity:** el core resuelve la capacity del slot leyendo `time_blocks` con el mismo join que el RPC (`day_of_week` + ventana, `MAX(capacity)` default 1, dow vía `getUTCDay()` que coincide con `EXTRACT(dow)`). Solo rechaza temprano `slot_taken` si `capacity<=1`. Esto preserva el anti-solape de duración variable (Tests B/E) sin bloquear inscriptos grupales válidos.
- **Tests contra Supabase local:** decisión del usuario (commit `cee4a70`): los tests de integración apuntan al Supabase LOCAL vía `.env.test.local` (gitignored) + `config({ path: '.env.test.local', override: true })` en `vitest.setup.ts`. No se aplicó la 041 a prod.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] El RPC `book_slot_atomic` devolvía `slot_full` para cupo 1 (regresión del anti-doble-booking)**
- **Found during:** Task 1 (cablear el core al RPC) — al razonar la consistencia entre el RPC ya mergeado (Plan 01) y los criterios de éxito de los Planes 02/05.
- **Issue:** El RPC hacía `IF v_occupied >= v_capacity THEN RAISE 'slot_full'` ANTES del INSERT. Para cupo 1 con 1 ocupante (`v_occupied=1 >= v_capacity=1`) eso daba SIEMPRE `slot_full`, cuando el contrato cero-regresión (core value LOCKED del milestone, CONC-02, `booking-core.test.ts` Test D) exige `slot_taken`. Además, gatear solo el RAISE no bastaba: con `v_seat := v_occupied` el seat sería 1≠0 y no colisionaría → sobrecupo en cupo 1.
- **Fix:** El RAISE `slot_full` se gatea a `v_capacity > 1`. Para cupo 1 se fuerza `v_seat := 0`, de modo que la 2ª reserva colisione con el índice único 011 (`23505` → `slot_taken`). Para cupo N: si lleno → `slot_full`; si hay lugar → `v_seat := v_occupied`.
- **Files modified:** `supabase/migrations/041_time_blocks_capacity_and_seat.sql`, `supabase/schema.sql`
- **Verification:** `supabase db reset` local (PG17) aplica 040+041 sin error; `booking-core.test.ts` Test D pasa con `slot_taken` para cupo 1. Consultado con `forjo-advisor`: decisión técnica que aplica el invariante LOCKED "cero regresión cupo 1"; migración aún no aplicada a prod → fix pre-deploy, cero riesgo productivo.
- **Committed in:** `88dcffb`

**2. [Rule 3 - Blocking] El `blindSupabase` de Test D no exponía `.rpc()`**
- **Found during:** Task 1 (verificación de tests tras el refactor).
- **Issue:** El mock "ciego" de Test D (que oculta el ocupante al re-check JS para forzar la carrera) solo envolvía `from('appointments')`; tras el refactor el core llama `supabase.rpc(...)`, inexistente en el mock → `TypeError`.
- **Fix:** Se agregó passthrough de `.rpc()` al cliente real (`t.admin.rpc(...)`). El re-check JS sigue viendo `[]` y el respaldo atómico de la DB (RPC/`23505`) se ejerce igual → la intención del test (probar el backstop atómico, no el re-check) se preserva.
- **Files modified:** `test/booking-core.test.ts`
- **Verification:** Test D verde con `slot_taken`.
- **Committed in:** `3d505e7`

**3. [Rule 3 - Blocking] Literales `TimeBlock` en tests rompían tsc al volver `capacity` no opcional**
- **Found during:** Task 2 (tipos).
- **Issue:** `capacity: number` (no opcional, según el plan) hizo fallar `tsc` en 3 fixtures de `landing-derive.test.ts` / `landing-seo.test.ts` que construían `TimeBlock` sin `capacity`.
- **Fix:** Se agregó `capacity: 1` a esos literales (sin debilitar el tipo, que el plan exige no opcional).
- **Files modified:** `test/landing-derive.test.ts`, `test/landing-seo.test.ts`
- **Verification:** `npx tsc --noEmit` limpio en todo el repo.
- **Committed in:** `3d505e7`

---

**Total deviations:** 3 auto-fixed (1 bug Rule 1, 2 blocking Rule 3)
**Impact on plan:** El fix Rule 1 es esencial para la integridad anti-doble-booking (invariante LOCKED del milestone) y corrige una migración aún no deployada. Los Rule 3 son ajustes mínimos de tests para alinear con el nuevo path RPC y el tipo no-opcional. Sin scope creep — no se tocaron los route handlers ni la lógica de seña (CUPOS-05 intacto).

## Issues Encountered
- **El entorno de test apuntaba a producción.** Durante la verificación se descubrió que `.env.local` apunta al proyecto Supabase de **producción** (`forjo-app`, ref `tpvbjwqzskzkevepcwyb`), donde la 041 no estaba aplicada → `supabase.rpc('book_slot_atomic')` daba `PGRST202` (función inexistente). Se surfaceó como checkpoint human-action (no se ejecutó `db push` a prod). **Resuelto por el usuario** (commit `cee4a70`): los tests de integración ahora corren contra el Supabase LOCAL vía `.env.test.local` + override en `vitest.setup.ts`. La 041 se aplica a prod a mano en el deploy, fuera de esta fase.

## User Setup Required
None de este plan. **PENDIENTE operativo (heredado de 02-01, NO de este plan):** aplicar la migración 041 (ya con el fix de cupo-1 de `88dcffb`) al proyecto Supabase de producción a mano, coordinado con el deploy, y recargar el schema cache de PostgREST (`NOTIFY pgrst, 'reload schema';`). Hasta entonces el RPC solo existe en local.

## Next Phase Readiness
- El core ya crea turnos vía el RPC atómico y distingue `slot_full`/`slot_taken`. Listo para:
  - **Plan 02-03/04:** availability capacity-aware (full por slot, D-06) + campo capacity en agenda-client + roster/contador. El shape del objeto pasado al RPC queda registrado abajo.
  - **Plan 02-05:** llenar `concurrency.test.ts` (CONC-01/CONC-02/CUPOS-03) — el RPC ya devuelve `slot_full` para cupo>1 lleno y `slot_taken` para la 2ª de cupo 1; correr contra el Supabase local con la 041 aplicada.
- **Blocker para `/gsd:verify-work`:** ninguno en local; recordar la aplicación manual de 041 (con el fix) a prod antes de shippear la fase.

## Shape del objeto pasado a supabase.rpc (para Planes 03/05)

```ts
supabase.rpc('book_slot_atomic', {
  p_business_id: business.id,
  p_professional_id: proId,          // string | null (null → bucket SENTINEL en el RPC)
  p_service_id: service.id,
  p_location_id: validLocationId,    // string | null
  p_date: date,                      // 'yyyy-MM-dd'
  p_time: time,                      // 'HH:mm'
  p_duration: Number(service.duration_minutes || 30),
  p_client_id: clientId,             // string | null
  p_client_name: clientName,
  p_client_phone: clientPhone,       // string | null
  p_client_email: clientEmail,       // string | null
  p_notes: notes,                    // string | null
  p_status: initialStatus,           // 'confirmed' | 'pending_payment'
  p_expires_at: expiresAt,           // ISO string | null
}).single()  // → { id: uuid, cancel_token: uuid }
```

## Self-Check: PASSED

- Files: 4/4 found (lib/booking-core.ts, lib/types.ts, migración 041, test/booking-core.test.ts)
- Commits: 5/5 found (88dcffb, 2e096d4, 7adc86c, 3d505e7, cee4a70)
- Verificación: `booking-core.test.ts` 5/5 verde contra Supabase local; `npx tsc --noEmit` limpio; `book_slot_atomic` aparece 3× y `slot_full` 5× en el core; INSERT directo eliminado del path de alta.

---
*Phase: 02-cupos-grupales*
*Completed: 2026-06-27*
