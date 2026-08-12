---
phase: 15-modelo-de-cupo-unificado
verified: 2026-08-12T21:58:22Z
status: human_needed
score: 4/4 must-haves verified
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "En `/servicios` (dev local, con la 068 aplicada): (1) crear un servicio nuevo sin tocar el cupo, (2) abrirlo y elegir Clase grupal, (3) subir el cupo a 10 y guardar, (4) volverlo a Individual y guardar."
    expected: "Los cuatro pasos guardan sin error (nunca el toast genérico \"Error al guardar\"); el paso 1 queda en Individual; el paso 2 muestra el campo de cupo en 2; el 3 persiste 10; el 4 persiste cupo 1."
    why_human: "Es un flujo de UI real (clicks, toasts, persistencia visual) que el plan 15-02 declaró explícitamente en modo `end-of-phase` (checkpoint human-verify diferido) — no corrido en esta ejecución autónoma."
  - test: "UAT de cierre de fase (plan 15-05, Task 3): (1) crear servicio → Individual, (2) editarlo a Clase grupal (cupo 2→10), (3) reservarlo desde `/[slug]` público y confirmar que el mismo horario acepta más de una reserva y recién desaparece de la grilla al llenarse, (4) con un turno futuro vivo intentar volverlo a Individual y confirmar que el panel muestra copy propia (no el texto crudo del error), (5) cancelar el turno y repetir: ahora guarda."
    expected: "Los cinco pasos se comportan como se describe, en particular el paso 3 (que ejercita la grilla pública + book_slot_atomic juntos con datos reales de UI) y el paso 4 (el mapeo de CUPO-08 a copy propia visible en pantalla)."
    why_human: "Flujo visual end-to-end de booking público + panel, declarado `end-of-phase` por el propio plan 15-05 y no ejecutado en esta corrida (modo auto)."
---

# Phase 15: Modelo de cupo unificado — Verification Report

**Phase Goal:** Que el cupo tenga una sola fuente de verdad y que los tres modos se puedan declarar en vez de deducirse. `services.capacity_mode` pasa a enum de tres (`individual` default) y `services.capacity` pasa a ser el único lugar donde vive el número; `time_blocks.capacity` deja de decidir. Se cierra el riesgo residual R-1 gateando el cambio de modo.
**Verified:** 2026-08-12T21:58:22Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Un servicio se puede declarar `individual`, es el default, fuerza cupo 1, byte-idéntico a un cupo 1 de hoy (CUPO-06) | ✓ VERIFIED | `services_capacity_mode_chk` (3 valores) y `services_capacity_matches_mode_chk` instalados en Postgres local, confirmados por consulta directa a `pg_constraint`. `column_default` de `capacity_mode` = `'individual'`. Estado real de datos locales: `individual · 1 · 10` (10/10 filas). Editor (`settings-client.tsx`) tiene `individual` como primera opción, default de alta (`capacity_mode: 'individual'` en los 3 `useState`/reset + el fallback `?? 'group_class'` corregido a `individual`), y sube el cupo a 2 al pasar a un modo grupal/simultáneo (`minCapacityFor`). |
| 2 | `book_slot_atomic` decide el cupo leyendo `services.capacity` en los tres modos, ya no consulta `time_blocks.capacity`, cero regresión de los 4 consumidores (CUPO-07) | ✓ VERIFIED | Consulta directa a `pg_proc.prosrc` local: `position('MAX(tb.capacity)' in prosrc) > 0` → `f` (la función instalada ya no contiene la lectura del bloque). `v_capacity := v_svc_cap;` presente en la migración y en `schema.sql`. Las tres lecturas JS restantes (`lib/booking-core.ts`, `app/api/booking/availability/route.ts` con sus 3 consumidores, `app/[slug]/booking-client.tsx`) confirmadas sin queries a `time_blocks.capacity` (`capacityFor()` no existe; `.select('start_time, end_time')` sin `capacity`). `./node_modules/.bin/tsc --noEmit` exit 0 (verificado en esta corrida). `test/concurrency.test.ts` 24/24 (verificado en esta corrida, corrida independiente) — cubre `book_slot_atomic` bajo carrera real. Los 4 consumidores del RPC (booking público, alta manual, abonos, canchas) cubiertos por 65/65 en 15-04 (booking-core, booking-cualquiera-public, booking-public-regression, canchas-booking, manual-booking, abono-generation, staff-assignment) y reconfirmados en el corte de 15-05 (114 passed + 1 expected-fail + 1 skip-por-diseño en 12 suites). |
| 3 | Cambiar `capacity_mode` con turnos futuros vivos se rechaza en la base, código de dominio fijo sin filtrar datos del negocio, mapeado a copy propio en el panel (CUPO-08, cierra R-1) | ✓ VERIFIED | Trigger `services_block_mode_change_trg` (`BEFORE UPDATE OF "capacity_mode"`) confirmado instalado en Postgres local vía `pg_trigger` (`tgenabled = 'O'`). Código de dominio `service_mode_has_future_appointments` (fijo, sin nombres/fechas/conteos) confirmado en el `RAISE EXCEPTION ... USING ERRCODE = 'P0001'`. `settings-client.tsx:734` mapea `error.code === 'P0001' && error.message?.includes('service_mode_has_future_appointments')` a un toast de copy propia, sin interpolar el error crudo. `test/capacity-mode-change-gate.test.ts` — 7/7 casos pasados en corrida independiente de este verificador (incluye rechazo con code+message+estado real de la fila, camino legítimo que persiste de verdad, rama de `status` NULL, frontera "hoy" en hora AR, escrituras legítimas no bloqueadas, aislamiento cross-tenant, y los dos sentidos del CHECK). |
| 4 | Las garantías de concurrencia se prueban con tests de carrera contra Postgres real y con control negativo, no con aserciones de lectura de código | ✓ VERIFIED | Control negativo de CUPO-08 transcrito en 15-05-SUMMARY: trigger dropeado a mano → 3/7 casos fallan exactamente por donde su comentario predice (`expected null not to be null`, `expected undefined to be 'P0001'` ×2); trigger restaurado → 7/7. Control negativo de CUPO-07 transcrito: función mutada para volver a leer `MAX(tb.capacity)` → los 4 casos `CUPO-07 (a)-(d)` fallan con los códigos/valores exactos que predicen sus comentarios (`expected 1 to be 3`, `expected undefined to be '23505'`, `expected true to be false`, `expected error 23505 to be null`); función restaurada → 22-24/24 verde. Ambos controles fueron ejecutados por el propio ejecutor con salida literal (no solo afirmados) y el patrón se re-verificó de forma independiente en esta corrida corriendo `test/concurrency.test.ts` (24/24) y `test/capacity-mode-change-gate.test.ts` (7/7) contra el estado actual del Postgres local. |

**Score:** 4/4 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/068_service_capacity_unified_and_mode_gate.sql` | DDL del enum de tres + backfill + CHECKs + DEFAULT + gate + redefinición de `book_slot_atomic` | ✓ VERIFIED | Existe (770 líneas). Contiene los 2 CHECK, el gate `services_block_mode_change` con `BEFORE UPDATE OF "capacity_mode"`, y la sección 7 con `v_capacity := v_svc_cap`, sin `DROP FUNCTION`, con `GRANT EXECUTE`. |
| `supabase/schema.sql` | Espejo quirúrgico: tabla `services`, función del gate, trigger, `book_slot_atomic` sin `time_blocks` | ✓ VERIFIED | Los 3 CONSTRAINT inline confirmados (`:1155-1158`), `services_block_mode_change` + `ALTER FUNCTION` + el trigger en el bloque alfabético (`:1600`), y `book_slot_atomic` sin `FROM time_blocks` (`grep` da 0 en la rama que decide cupo). |
| `lib/types.ts` | Unión de tres literales para `capacity_mode` | ✓ VERIFIED | `capacity_mode: 'individual' \| 'group_class' \| 'simultaneous_resource'` en `:203`. |
| `app/(dashboard)/settings/settings-client.tsx` | Guard mínimo del editor: 3ª opción, defaults en individual, piso de cupo, mapeo del rechazo | ✓ VERIFIED | `key: 'individual'` primera opción; 3 sitios `capacity_mode: 'individual'` + el fallback corregido; `minCapacityFor`; mapeo `P0001` + `service_mode_has_future_appointments`. |
| `test/helpers/booking-fixtures.ts` | `seedGroupClassService` | ✓ VERIFIED | Función presente y usada por `concurrency.test.ts` (9+ ocurrencias). |
| `lib/booking-core.ts` | Re-check JS derivado del servicio | ✓ VERIFIED | `Number(service.capacity) \|\| 1`, sin `.from('time_blocks')` para cupo. |
| `app/api/booking/availability/route.ts` | Cupo resuelto una vez por request desde el servicio | ✓ VERIFIED | `slotCapacity` constante única; `capacityFor()` borrada entera (0 ocurrencias); `.select('start_time, end_time')` sin `capacity`. |
| `app/[slug]/booking-client.tsx` | `serviceId` en el camino específico, no gateado por modo | ✓ VERIFIED | 2 ocurrencias de `params.set('serviceId'`; el gateo por `isSimultaneousResource` ya no existe. |
| `test/capacity-mode-change-gate.test.ts` | Suite de integración del gate CUPO-08 | ✓ VERIFIED | 292 líneas, 7 casos, 2 guards anti-falso-verde, timeouts explícitos de 20000ms. Corrida independiente: 7/7. |
| `test/concurrency.test.ts` | Casos de carrera declarando cupo por servicio + CUPO-07 (c)/(d) | ✓ VERIFIED | 1200 líneas, `seedGroupClassService` en 9+ sitios, `CUPO-07 (c)` y `(d)` presentes con asserts de `is_group`/`seat`. Corrida independiente: 24/24. |
| `.planning/workstreams/motor-reservas/phases/15-modelo-de-cupo-unificado/15-RUNBOOK-068.md` | Pre-flight con criterio de aborto + verificación por instalación | ✓ VERIFIED | Presente, con las 2 queries de pre-flight con criterio ABORTAR, la sección de verificación por instalación contra `pg_constraint`/`pg_trigger`/`pg_proc`/`information_schema`, y el rollback por objeto. **068 confirmada sin aplicar en producción** (contexto de la corrida — no se re-verifica contra prod real por decisión explícita del alcance de esta verificación). |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `068_*.sql` | `supabase/schema.sql` | espejo quirúrgico del gate | ✓ WIRED | `services_block_mode_change` presente en ambos, mismo código de dominio. |
| `068_*.sql` (RPC) | `supabase/schema.sql` (RPC) | espejo del cuerpo de `book_slot_atomic` | ✓ WIRED | `v_capacity := v_svc_cap` en ambos; ninguno consulta `time_blocks` para el cupo. |
| `supabase/schema.sql` | `lib/types.ts` | mismo conjunto de 3 literales | ✓ WIRED | `simultaneous_resource` presente en el CHECK y en el tipo TS. |
| `app/[slug]/booking-client.tsx` | `app/api/booking/availability/route.ts` | `serviceId` en query params → resolución del cupo | ✓ WIRED | El client manda `serviceId` siempre en el camino específico; el endpoint lo re-valida por `business_id` y responde `invalid_service` si no resuelve. |
| `lib/booking-core.ts` | `068_*.sql` (RPC) | el re-check JS espeja al gate autoritativo | ✓ WIRED | `slotCapacity` deriva de la misma columna que `book_slot_atomic`; la autoridad sigue siendo el RPC (no se "mejoró" desde JS). |
| `test/capacity-mode-change-gate.test.ts` | `068_*.sql` (gate) | el test golpea el trigger por PostgREST | ✓ WIRED | Corrida independiente 7/7; el control negativo (trigger dropeado) transcrito en el SUMMARY con 3 fallos exactos, reinstalado → 7/7. |

### Behavioral Spot-Checks / Independent Re-verification (esta corrida)

| Chequeo | Comando | Resultado | Status |
|---------|---------|-----------|--------|
| Migración 068 instalada en local | `pg_constraint` × 2 CHECK sobre `services` | Los 2 CHECK con la definición exacta esperada | ✓ PASS |
| Trigger del gate instalado | `pg_trigger` sobre `services` | `services_block_mode_change_trg`, `tgenabled='O'` | ✓ PASS |
| RPC ya no lee el bloque | `position('MAX(tb.capacity)' in prosrc)` sobre `book_slot_atomic` | `f` | ✓ PASS |
| Datos coherentes en local | `select capacity_mode, capacity, count(*) from services group by 1,2` | `individual · 1 · 10` (única fila) | ✓ PASS |
| Compilador TypeScript | `./node_modules/.bin/tsc --noEmit` | exit 0 | ✓ PASS |
| Suite del gate CUPO-08 | `vitest run test/capacity-mode-change-gate.test.ts --no-file-parallelism` | 7 passed (7) | ✓ PASS |
| Suite de carrera | `vitest run test/concurrency.test.ts --no-file-parallelism --testTimeout=30000` | 24 passed (24) | ✓ PASS |
| Debt markers (TBD/FIXME/XXX) en los 11 archivos tocados por la fase | `grep` por archivo | 0 ocurrencias en todos | ✓ PASS |
| Commits declarados en los 5 SUMMARY | `git log --oneline` sobre los archivos de la fase | Los 12 commits (`d37d45b`..`8b6d0f0`) existen y en el orden declarado | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| CUPO-06 | 15-01, 15-02 | Enum de tres modos, `individual` declarable y default | ✓ SATISFIED | Ver Truth 1 |
| CUPO-07 | 15-01, 15-03, 15-04, 15-05 | `services.capacity` única fuente en el RPC y en las 3 lecturas JS | ✓ SATISFIED | Ver Truth 2 |
| CUPO-08 | 15-01, 15-02, 15-05 | Gate de cambio de modo en la base, cierra R-1 | ✓ SATISFIED | Ver Truth 3 |

Sin requisitos huérfanos: los tres IDs que `REQUIREMENTS.md` mapea a la Phase 15 (CUPO-06/07/08) aparecen todos en el frontmatter `requirements` de al menos un plan.

### Anti-Patterns Found

Ninguno. Sin `TBD`/`FIXME`/`XXX` en los 11 archivos de código tocados por la fase. Sin `return null`/stubs vacíos en las superficies nuevas (el trigger, el `CapacityModeFields`, las lecturas JS). Las desviaciones declaradas en los 5 SUMMARY (validación contra Postgres local en vez de `db reset`, bloques de test que "mienten" a propósito como control negativo, orden código-antes-que-migración en el runbook) están todas justificadas por escrito y no ocultan trabajo faltante.

### Deferred Items (no gaps — confirmados fuera de alcance por D-08/D-09/D-10 y por instrucción explícita de esta corrida)

| # | Item | Addressed In | Evidence |
|---|------|---------------|----------|
| 1 | Editor completo (los 3 modos explicados, badge de modo, copy por eje de conteo) | Phase 16 (CUPO-09) | D-10 del CONTEXT: "Este guard no es la feature: es el mínimo..." |
| 2 | 4ª lectura del cupo — `app/(dashboard)/agenda/agenda-client.tsx` (panel autenticado) | Phase 16 | D-08 del CONTEXT y confirmado en 15-04-SUMMARY §Barrido: no existe una 5ª lectura. |
| 3 | Migración 068 aplicada a producción | Decisión del dueño | `15-RUNBOOK-068.md` completo y sin ejecutar; última en prod = 067 (contexto de la corrida). |
| 4 | Verificación de CUPO-08 en prod por comportamiento (provocar el rechazo desde la UI) | No aplica — D-09 | Cero servicios simultáneos en prod; se verifica por instalación. |
| 5 | 10 errores de ESLint preexistentes en `settings-client.tsx` (React Compiler rules, fuera de las líneas tocadas) | Limpieza propia | `deferred-items.md §1`, probado contra HEAD antes del plan 15-02. |
| 6 | 2 casos de `abono-*.test.ts` sin timeout explícito (Phase 14, no tocan cupo) | Limpieza propia | `deferred-items.md §2`. |

## Human Verification Required

### 1. UAT del editor de servicios (`/servicios`, plan 15-02 Task 1)

**Test:** Crear un servicio nuevo sin tocar el cupo (queda Individual); abrirlo y elegir Clase grupal (aparece cupo 2); subirlo a 10 y guardar; volverlo a Individual y guardar.
**Expected:** Los cuatro pasos guardan sin error — nunca el toast genérico "Error al guardar".
**Why human:** Flujo de UI real (clicks + persistencia visual + toasts) declarado explícitamente `end-of-phase` por el propio plan y no ejecutado en esta corrida autónoma.

### 2. UAT de cierre de fase — booking público + panel (plan 15-05 Task 3)

**Test:** Crear servicio Individual → editarlo a Clase grupal (cupo 2 a 10) → reservarlo desde `/[slug]` público (el mismo horario acepta más de una reserva y desaparece de la grilla recién al llenarse) → con un turno futuro vivo, intentar volverlo a Individual (el panel muestra copy propia, no el texto crudo) → cancelar el turno y repetir (ahora guarda).
**Expected:** Los cinco pasos se comportan tal como se describe.
**Why human:** Ejercita la grilla pública + `book_slot_atomic` + el mapeo de CUPO-08 con datos e interacciones reales de UI; declarado `end-of-phase` por el plan 15-05 y sin correr en modo auto.

## Gaps Summary

Ninguno. Las cuatro verdades del ROADMAP para la Phase 15 están verificadas contra el código y contra el Postgres local de forma independiente (no solo contra lo declarado en los SUMMARY): las dos constraints y el trigger están instalados, `book_slot_atomic` ya no lee `time_blocks.capacity`, las tres lecturas JS restantes están alineadas, el gate de CUPO-08 rechaza con el código de dominio esperado y lo prueban 7 casos con dos guards anti-falso-verde, y los dos controles negativos de la fase (CUPO-08 sin el trigger, CUPO-07 con la fuente del cupo mutada de vuelta al bloque) están transcritos con su fallo literal y fueron reproducidos por este verificador corriendo las dos suites de forma independiente (7/7 y 24/24). Los tres ítems explícitamente fuera de alcance de esta corrida (068 sin aplicar a prod, editor completo de Phase 16, 4ª lectura de `agenda-client.tsx`) están confirmados como tales y no se reportan como gaps, según la instrucción de contexto de esta verificación.

Lo único pendiente para considerar la fase enteramente cerrada es la verificación humana de los dos checklists diferidos a `end-of-phase` (arriba) y el `secure-phase` obligatorio que el propio `ROADMAP.md` marca como "Falta" (`Plans: 5/5 ... Falta el secure-phase (obligatorio) y la UAT de cierre de fase`) — ninguno de los dos es un gap de código: son pasos posteriores del workflow de la fase.

---

*Verified: 2026-08-12T21:58:22Z*
*Verifier: Claude (gsd-verifier)*
