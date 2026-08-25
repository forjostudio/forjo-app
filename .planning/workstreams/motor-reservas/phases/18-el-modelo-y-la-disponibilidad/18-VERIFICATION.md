---
phase: 18-el-modelo-y-la-disponibilidad
verified: 2026-08-25T00:00:00Z
status: human_needed
score: 10/10 must-haves verified
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Escenario OFRECE/ACEPTA completo en el navegador contra el Supabase LOCAL (npm run dev): sembrar a mano una fila en public.time_block_services (una franja de la mañana mapeada a UN solo servicio S1), abrir /[slug], elegir el servicio S2 (NO mapeado) y confirmar que los horarios de esa franja NO aparecen en el picker; volver, elegir S1, confirmar que SÍ aparecen todos; borrar la fila y recargar, confirmar que todo vuelve a aparecer para ambos servicios."
    expected: "El picker público oculta visualmente los horarios de la franja mapeada solo para el servicio no cubierto, los muestra para el cubierto, y todo vuelve al estado de hoy al borrar la fila (comodín)."
    why_human: "Es la confirmación visual del round-trip HTTP real (cliente → GET /api/booking/availability → render del picker), no solo la respuesta JSON del route handler invocado directamente por vitest. El equipo ya tiene un gotcha documentado (`auto_advance saltea la UAT visual`) de que estos checkpoints se auto-aprueban sin que nadie abra el navegador."
  - test: "POST forjado (curl o consola del navegador) a /api/booking/create pidiendo S2 en un horario de la franja mapeada a S1, con la fila de la puente puesta."
    expected: "Respuesta 400 con `service_not_scheduled` y ningún turno creado. El dueño puede seguir cargando a mano una excepción de S2 en esa misma franja desde su panel (alta manual sigue sin validar horario)."
    why_human: "Confirmación end-to-end contra el servidor real corriendo (`npm run dev`), declarada explícitamente como NO ejecutada en 18-03-SUMMARY.md y 18-04-SUMMARY.md (\"UAT pendiente ... queda para el /gsd:verify-work de la fase\"). La cobertura automatizada (16+7+9 tests) invoca el route handler en proceso, no un HTTP real de punta a punta."
---

# Phase 18: El modelo y la disponibilidad Verification Report

**Phase Goal:** Que una franja horaria pueda declarar QUÉ servicios se dan en ella, y que la disponibilidad pública lo respete — vía tabla puente con la regla del comodín, un helper puro con tests, y `/api/booking/availability` + el backstop del `create` consumiéndolo.
**Verified:** 2026-08-25
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | AGENDA-01 — Una franja puede declarar qué servicios se dan en ella; 0 filas = "cualquiera" (D-01) | ✓ VERIFIED | `supabase/migrations/071_time_block_services.sql` crea `time_block_services` (PK compuesta, 3 FK CASCADE) + índice inverso. Verificado por instalación contra Postgres local: 4 policies, RLS activa, 2 índices, 1 vista, `count(*) = 0` fuera de transacción (cero backfill) |
| 2 | AGENDA-02 — La regla del comodín vive en UN helper puro, testeado, sin reimplementación | ✓ VERIFIED | `lib/time-block-services.ts` (4 funciones, 1 solo `import type`). `grep -vE '^\s*//' lib/booking-core.ts \| grep -cE "isServiceAllowedAt\("` = **1** (medido). `npx vitest run test/time-block-services.test.ts` = **16/16 passed** (corrido en esta verificación, no solo leído del SUMMARY) |
| 3 | AGENDA-03 — Pedir disponibilidad para un servicio devuelve solo las franjas donde se da, más las de comodín, en las 3 ramas | ✓ VERIFIED | `app/api/booking/availability/route.ts` importa `startTimesNotOffered` y concatena `notOffered` en los 3 `return Response.json({ ok: true, ...})` (grep = 3 concat, 3 returns). `npx vitest run test/availability-service-window.test.ts` = **7/7 passed** (corrido en esta verificación) |
| 4 | AGENDA-04 — Cero regresión para franjas genéricas, canchas, abonos, cupos, multi-staff, espacio compartido | ✓ VERIFIED | Corrido en esta verificación: `test/booking-core.test.ts test/manual-booking.test.ts test/appointment-service.test.ts test/booking-window-exemption.test.ts test/booking-cualquiera-public.test.ts test/booking-public-regression.test.ts test/canchas-booking.test.ts test/concurrency.test.ts` = **76/76 passed**; `test/abono-generation.test.ts` = 11/11; `test/abono-create.test.ts` = 13/13 (de a una, por la flakiness conocida) |
| 5 | Aislamiento de tenant: el dueño solo escribe filas de SU negocio; `anon` no escribe ninguna | ✓ VERIFIED | RLS + 4 policies (medido por catálogo). **Nota crítica:** esto FALLABA originalmente (CR-01: la vista `public_time_block_services` era escribible por `anon`, bypass total de RLS). **Cerrado por migr. 072** — verificado de forma independiente en esta sesión: `INSERT` como `anon` contra la vista → `permission denied for view public_time_block_services` (ver sección Anti-Patterns / evidencia abajo) |
| 6 | `anon` SÍ puede leer el mapeo vía la vista acotada (D-05) | ✓ VERIFIED | Confirmado por instalación en esta sesión: `SET LOCAL ROLE anon; SELECT count(*) FROM public.public_time_block_services` no falla (devuelve 0, consistente con la puente vacía — cero backfill) |
| 7 | D-04 — Un POST forjado no puede reservar un servicio en una franja que no lo da | ✓ VERIFIED | `lib/booking-core.ts` — flag `enforceServiceWindow` (default `false`) + backstop con `isServiceAllowedAt`. **Nota crítica:** esto FALLABA originalmente (CR-02: fallaba ABIERTO ante `date`/`time` mal formados). **Cerrado por guard de forma + fail-closed en el core.** `npx vitest run test/booking-service-window-backstop.test.ts` = **9/9 passed** (corrido en esta verificación, incluidos los 4 casos nuevos de CR-02) |
| 8 | Las dos exenciones deliberadas (alta manual, abonos) quedan intactas | ✓ VERIFIED | `git diff -- app/api/appointments/create/route.ts lib/abono-generation.ts` = vacío (medido en esta sesión) |
| 9 | Un horario fuera de toda franja se sigue aceptando (sin validación general de ventana) | ✓ VERIFIED | Caso de test 5 del backstop, verde |
| 10 | Con la puente vacía, el camino público es byte-idéntico al de hoy (D-02) | ✓ VERIFIED | Caso 3 de `availability-service-window` + caso 4 de `booking-service-window-backstop` + caso 7 (sin `serviceId`), todos verdes |

**Score:** 10/10 truths verified (0 present-but-behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/071_time_block_services.sql` | tabla puente + RLS + 4 policies + índice inverso + vista acotada | ✓ VERIFIED | Existe, aplicado en local, verificado por catálogo (`select ... = t`) |
| `supabase/migrations/072_public_views_read_only.sql` | hotfix CR-01: `REVOKE ALL` + `GRANT SELECT` en 6 vistas `public_*` | ✓ VERIFIED | Existe, aplicado en local; grants confirmados = SELECT únicamente para `anon`/`authenticated` en las 6 vistas |
| `supabase/schema.sql` | reflejo quirúrgico | ✓ VERIFIED | `grep -cF "public_time_block_services"` ≥ 1 |
| `lib/types.ts` → `TimeBlockService` | tipo espejo de la migración | ✓ VERIFIED | presente |
| `lib/time-block-services.ts` | 4 funciones puras | ✓ VERIFIED | `blocksForService`, `isServiceScheduled`, `isServiceAllowedAt`, `startTimesNotOffered`; 1 solo `import type` |
| `test/time-block-services.test.ts` | tests puros con control negativo | ✓ VERIFIED | 16/16 passed (corrido) |
| `test/helpers/booking-fixtures.ts` → `seedTimeBlockService` | fixture de siembra | ✓ VERIFIED | presente y usado |
| `test/availability-service-window.test.ts` | integración read-path | ✓ VERIFIED | 7/7 passed (corrido) |
| `app/api/booking/availability/route.ts` | endpoint respeta la regla en 3 ramas | ✓ VERIFIED | grep + tests confirman |
| `lib/booking-core.ts` | flag + backstop + error `service_not_scheduled` | ✓ VERIFIED | grep confirma 5 apariciones de `enforceServiceWindow`, 5 de `service_not_scheduled` |
| `app/api/booking/create/route.ts` | único caller que enciende el flag + guard de forma (CR-02) | ✓ VERIFIED | `enforceServiceWindow: true` presente + regex `DATE_RE`/`TIME_RE` equivalente confirmado en código |
| `test/booking-service-window-backstop.test.ts` | rechazo + control negativo + no-regresión + CR-02 | ✓ VERIFIED | 9/9 passed (corrido) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `time_block_services.time_block_id` | `time_blocks.id` | FK `ON DELETE CASCADE` | ✓ WIRED | 3 FK con `confdeltype = 'c'` medido por catálogo |
| `public_time_block_services` | `time_block_services` | vista DEFINER owner postgres | ✓ WIRED | `reloptions IS NULL` medido; lectura anon devuelve filas reales (medido con seed) |
| `app/api/booking/availability/route.ts` | `lib/time-block-services.ts` | `import { startTimesNotOffered }` | ✓ WIRED | 1 import, 1 invocación, 3 concats |
| `lib/booking-core.ts` | `lib/time-block-services.ts` | `import { isServiceAllowedAt }` | ✓ WIRED | 1 invocación fuera de comentarios (medido) |
| `app/api/booking/create/route.ts` | `createAppointmentCore` | flag `enforceServiceWindow: true` | ✓ WIRED | único caller que lo enciende; los otros dos (`appointments/create`, `abono-generation`) heredan `false` (diff vacío, medido) |

### Behavioral Spot-Checks (re-ejecutadas en esta verificación, no solo leídas del SUMMARY)

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Regla del comodín pura (16 casos, incl. control negativo de resta de conjuntos) | `npx vitest run --no-file-parallelism test/time-block-services.test.ts` | 16 passed | ✓ PASS |
| Disponibilidad oculta horarios no cubiertos en 3 ramas | `npx vitest run --no-file-parallelism test/availability-service-window.test.ts` | 7 passed | ✓ PASS |
| Backstop rechaza POST forjado + CR-02 (formato malformado) | `npx vitest run --no-file-parallelism test/booking-service-window-backstop.test.ts` | 9 passed | ✓ PASS |
| No-regresión (core, manual, público, canchas, concurrencia) | `npx vitest run --no-file-parallelism` (8 archivos nombrados) | 76 passed | ✓ PASS |
| No-regresión abonos (de a una, flaky en paralelo) | `npx vitest run --no-file-parallelism test/abono-generation.test.ts` luego `test/abono-create.test.ts` | 11 + 13 passed | ✓ PASS |
| `tsc --noEmit` | `./node_modules/.bin/tsc --noEmit` | exit 0 | ✓ PASS |
| `npm run build` | `npm run build` | exit 0 | ✓ PASS |
| CR-01 cerrado: `anon` NO puede escribir la vista | `SET LOCAL ROLE anon; INSERT INTO public.public_time_block_services ...` (psql directo, en esta sesión) | `permission denied for view public_time_block_services` | ✓ PASS |
| CR-01 no rompió la lectura: `anon` SÍ lee `public_businesses` y la vista nueva | `SET LOCAL ROLE anon; SELECT count(*) FROM public.public_businesses / public_time_block_services` | 3 filas / 0 filas (esperado, puente vacía) | ✓ PASS |
| Migración 071 — catálogo compuesto (4 policies · RLS · 2 índices · 1 vista · 0 invoker) | consulta SQL compuesta contra Postgres local | `t` | ✓ PASS |
| Grants de las 6 vistas `public_*` tras la 072 | `information_schema.role_table_grants` | SELECT únicamente para anon/authenticated en las 6 | ✓ PASS |

### Probe Execution

SKIPPED — no hay probes declarados ni convencionales (`scripts/*/tests/probe-*.sh`) para este workstream.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|--------------|--------|----------|
| AGENDA-01 | 18-01 | Tabla puente + regla del comodín | ✓ SATISFIED | migr. 071 verificada por instalación |
| AGENDA-02 | 18-02 | Regla en helper puro, único lugar | ✓ SATISFIED | `lib/time-block-services.ts`, 1 sola invocación fuera del helper (grep) |
| AGENDA-03 | 18-03 | Disponibilidad respeta la regla, 3 ramas | ✓ SATISFIED | tests + grep de wiring |
| AGENDA-04 | 18-03, 18-04 | Cero regresión | ✓ SATISFIED | suites de no-regresión 76+11+13 passed |

Ningún requirement declarado en los planes queda huérfano; los 4 IDs de `REQUIREMENTS.md` (`.planning/workstreams/motor-reservas/REQUIREMENTS.md:105-108`) están marcados `Complete` y coinciden con la evidencia de código.

### Anti-Patterns Found

Ninguno bloqueante. Escaneados los 11 archivos tocados por la fase (071, 072, `lib/time-block-services.ts`, `lib/types.ts`, `lib/booking-core.ts`, `app/api/booking/availability/route.ts`, `app/api/booking/create/route.ts`, y los 3 archivos de test + fixtures): sin `TBD`/`FIXME`/`XXX`, sin `TODO`/`HACK`/`PLACEHOLDER` reales (las coincidencias de "TODO" son la palabra española "todo/todos", no marcadores de deuda), sin retornos vacíos ni handlers stub.

**Dos hallazgos CRITICAL del code review (`18-REVIEW.md`) existieron y ya están cerrados, verificados de forma independiente en esta sesión (no solo leídos del REVIEW):**

- **CR-01** (vista escribible por `anon`, bypass total de RLS) — cerrado por migr. `072_public_views_read_only.sql` (commit `b42cbc6`). Re-verificado por instalación en esta sesión: el `INSERT` anónimo contra `public_time_block_services` rebota con `permission denied`; la lectura anónima sigue funcionando.
- **CR-02** (backstop fallaba abierto con `date`/`time` mal formados) — cerrado por guard de forma en el route handler + fail-closed en el core (commit `04ad10b`). Re-verificado corriendo la suite completa del backstop en esta sesión (9/9 passed, incluidos los 4 casos nuevos que congelan los dos payloads del ataque).

**7 warnings + 3 info siguen ABIERTOS** (documentados en `18-REVIEW.md`, asignados explícitamente a `/gsd:secure-phase 18`, que el propio ROADMAP marca como **"ALTA — secure-phase obligatorio"** para esta fase). Ninguno de ellos contradice los 4 Success Criteria de la fase ni las truths verificadas arriba, pero son gaps reales de robustez/cobertura que la fase deja pendientes a propósito para el siguiente paso del workflow:

| ID | Severidad | Resumen | Por qué no bloquea el goal de esta fase |
|----|-----------|---------|------------------------------------------|
| WR-01 | warning | read-path descarta errores de query y apaga la feature en silencio (sin log) si PostgREST no recargó el schema | Degradación es aceptable por diseño (fail-safe = comodín); lo que falta es el log, no la corrección funcional |
| WR-02 | warning | RLS no exige que las 3 FK de una fila sean del MISMO tenant (falta FK compuesta) | Los consumidores actuales ya filtran por `business_id` propio; el hueco es de defensa en profundidad para cuando la Phase 19 lea/renderice la tabla directo |
| WR-03 | warning | el rechazo `service_not_scheduled` deja filas `clients` huérfanas (Pitfall 3 reintroducido) | Es higiene de datos, no afecta el aislamiento ni el resultado del booking |
| WR-04 | warning | la regla es ciega a `location_id` en negocios multi-sede | Multi-sede no está en el alcance explícito de D-01 a D-06 de esta fase (`18-CONTEXT.md`); es un caveat real para la Phase 19 |
| WR-05 | warning | cero cobertura de aislamiento cross-tenant para la tabla/vista nuevas en `test/isolation.test.ts` | Confirmado: `grep -n "time_block_services" test/isolation.test.ts` = 0 coincidencias. Es exactamente el test que habría atrapado CR-01 antes del review — gap de cobertura real, no de comportamiento (el comportamiento ya se verificó manualmente arriba) |
| WR-06 | warning | fórmula de grilla y `toMinutes` duplicadas en vez de exportadas del helper | Riesgo de divergencia futura, no una divergencia actual (tests lo confirman) |
| WR-07 | warning | en días con horario especial, oferta y backstop pueden discrepar sin copy en el cliente | Alcanzable solo con la Phase 19 configurando mapeos + Phase 20 (copy) sin shippear; el error 400 ya existe pero sin traducción al usuario |
| IN-01..03 | info | dead code temporal (`isServiceScheduled`), contención solo por inicio, orden de cálculo no-óptimo | No funcionales |

### Human Verification Required

### 1. Escenario OFRECE/ACEPTA en el navegador contra Supabase LOCAL

**Test:** Sembrar a mano una fila en `public.time_block_services` (una franja de la mañana mapeada a un solo servicio S1, vía `docker exec ... psql` — no hay UI todavía, la trae la Phase 19). Abrir `/[slug]`, elegir S2 (no mapeado) y una fecha de esa franja.
**Expected:** Los horarios de la franja mapeada NO aparecen en el picker para S2; SÍ aparecen para S1; y todo vuelve a aparecer para ambos al borrar la fila.
**Why human:** Confirmación visual del round-trip HTTP real (cliente → `GET /api/booking/availability` → render). Los 32 tests automatizados invocan el route handler en proceso, que es evidencia fuerte pero no reemplaza abrir el navegador. El equipo ya tiene documentado el gotcha `auto_advance salteando la UAT visual`.

### 2. POST forjado contra el servidor real corriendo

**Test:** Con la fila del paso 1 puesta, un `POST` a `/api/booking/create` (curl o consola) pidiendo S2 en un horario de esa franja.
**Expected:** 400 `service_not_scheduled`, ningún turno creado; el alta manual del dueño sigue pudiendo cargar esa misma excepción desde el panel.
**Why human:** Explícitamente declarado como NO ejecutado en `18-03-SUMMARY.md` y `18-04-SUMMARY.md` ("UAT pendiente ... queda para el `/gsd:verify-work` de la fase"). Es la confirmación de punta a punta contra `npm run dev`, distinta de invocar el handler en proceso desde vitest.

### Gaps Summary

No hay gaps que bloqueen el goal de la fase: las 4 Success Criteria del ROADMAP (AGENDA-01 a AGENDA-04) están verificadas con evidencia de código re-ejecutada en esta sesión, no solo leída de los SUMMARY. Los 2 hallazgos CRITICAL del code review (CR-01: bypass de escritura anónima; CR-02: backstop fallando abierto) existieron, fueron corregidos, y **ambos se re-verificaron de forma independiente en esta verificación** (ataque real contra Postgres local para CR-01; suite completa del backstop para CR-02).

Lo que queda abierto y no se resuelve acá:

1. **7 warnings + 3 info del code review**, asignados a `/gsd:secure-phase 18` — el propio ROADMAP marca esta fase como "ALTA — secure-phase obligatorio". Ninguno contradice las truths verificadas, pero WR-05 (cero test de aislamiento cross-tenant para la tabla nueva) es notable: es exactamente el tipo de test que habría detectado CR-01 antes del review humano.
2. **UAT visual de navegador no ejecutada** (dos escenarios harvesteados arriba) — declarada pendiente por el propio ejecutor en los SUMMARY de 18-03 y 18-04.
3. **Pendiente operativo, no de código:** las migraciones 071 y 072 NO están aplicadas a producción (prod sigue en la 070). Documentado explícitamente en los SUMMARY y en la cabecera de la 072 ("APLICAR A PRODUCCIÓN CUANTO ANTES, independientemente del deploy de la Phase 18").

---

_Verified: 2026-08-25_
_Verifier: Claude (gsd-verifier)_
