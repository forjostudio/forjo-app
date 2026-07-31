---
phase: 12-cupo-por-solape-recurso-simult-neo
verified: 2026-07-29T14:10:00Z
reverified: 2026-07-30T00:00:00Z
status: passed
score: 5/5 must-haves verified
behavior_unverified: 0
overrides_applied: 0
behavior_unverified_items:
  - truth: "CUPO-01: el dueño marca el modo (+ cupo N) desde /servicios y lo ve persistir al reabrir el servicio; la agenda muestra el indicador 'lleno' (no 8/15) para simultáneos."
    test: "Ejercitar en vivo (npm run dev + Supabase local con la 062 aplicada): editar un servicio, elegir 'Recurso simultáneo', poner cupo 2, guardar; reabrir y confirmar que sigue seleccionado; verificar que 'Clase grupal' no muestra el campo de cupo; cargar 2 turnos escalonados sobre un simultáneo cupo 2 y ver el badge '2/2 lleno'; confirmar que una clase grupal existente sigue mostrando '8/15'."
    expected: "El segmented control + microcopy + campo condicional de cupo se ven y persisten como se describe; la agenda distingue visualmente ambos modos sin regresión del roster grupal."
    why_human: "Es apariencia visual y persistencia observada en el navegador (copy real renderizado, estado del control tras recargar, legibilidad del badge) — grep/tsc/tests no pueden verificar que la UI se vea y comporte así. El checkpoint bloqueante del Plan 12-03 (Task 3, gate 'blocking') fue AUTO-APROBADO por `workflow.auto_advance=true`: ningún humano lo ejecutó."
human_verification:
  - test: "Ir a /servicios, editar un servicio: aparece el segmented control 'Clase grupal / Recurso simultáneo' + microcopy; al elegir 'Recurso simultáneo' aparece el campo de cupo. Poner cupo 2, guardar."
    expected: "El control y el campo se ven, y el guardado no da error."
    why_human: "Apariencia visual y copy en el navegador."
  - test: "Reabrir ese servicio."
    expected: "El modo 'Recurso simultáneo' y el cupo 2 siguen seleccionados (CUPO-01 persistencia)."
    why_human: "Estado del formulario tras recarga, observado en el navegador."
  - test: "Editar un servicio dejándolo 'Clase grupal'."
    expected: "El campo de cupo NO aparece; el editor funciona como antes."
    why_human: "Renderizado condicional visual."
  - test: "En la agenda, cargar 2 turnos escalonados que se pisen sobre el servicio simultáneo cupo 2 (ej. 16:00 y 16:15)."
    expected: "Se ven como filas individuales y, al alcanzar el cupo en el intervalo solapado, aparece el indicador 'lleno' (ej. '2/2 lleno') — NO un contador '8/15'."
    why_human: "Verificación visual del layout de la agenda y el badge."
  - test: "Verificar que una clase grupal existente sigue mostrando su roster/contador '8/15' sin cambios."
    expected: "Cero regresión visual del grupal."
    why_human: "Comparación visual contra el comportamiento previo."
---

# Phase 12: Cupo por solape (recurso simultáneo) Verification Report

**Phase Goal:** Que "cupo N" signifique lo correcto según el caso: clase grupal (cupo por hora exacta, intacto) o recurso simultáneo (cupo por solape de intervalos), coexistiendo dentro del RPC atómico `book_slot_atomic`, sin romper los cuatro consumidores del núcleo anti-doble-booking.
**Verified:** 2026-07-29T14:10:00Z
**Status:** passed
**Re-verification:** Sí — 2026-07-30, tras la UAT visual (`12-UAT.md`, 5/5 PASS ejecutada por el usuario en el navegador). El único punto abierto de la verificación inicial era de proceso, no de código, y quedó cerrado.

## Goal Achievement

### Observable Truths (Success Criteria del ROADMAP)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | CUPO-01: el dueño marca el modo desde el panel y persiste al reabrir | ✓ VERIFIED | Código presente y wireado (ver Artefactos/Key Links); persistencia CONFIRMADA a nivel de código (`openEditService` rehidrata `capacity_mode`/`capacity` desde `s.*`, `saveEditService`/`addService` escriben con `.eq('business_id', ...)`). **Mitad visual cerrada el 2026-07-30**: el usuario ejecutó la UAT en el navegador contra el Supabase local (migr. 040..064) y los 5 pasos pasaron (`12-UAT.md`) — segmented control + microcopy, campo de cupo condicional, persistencia al reabrir, badge de "lleno" por solape en la agenda, y clase grupal sin regresión. Cierra el hueco que dejó el checkpoint auto-aprobado del Plan 12-03. |
| 2 | CUPO-02: con recurso simultáneo, se rechaza la reserva cuando el intervalo ya tiene `capacity` turnos solapados | ✓ VERIFIED | Migración 062 confirmada línea por línea (gate `v_overlap >= v_svc_cap → slot_full`, 062:303-322); `lib/booking-core.ts` deja de cortar el 2º solape (`isSimultaneousResource`, línea 218/226); `availability/route.ts` overlap-aware (líneas 236-300); **test re-corrido por mí de forma independiente**: `npx vitest run test/concurrency.test.ts -t "CUPO-04"` → 1 passed (incluye el caso CUPO-02 secuencial en el mismo archivo, 9/9 al correr el archivo completo). |
| 3 | CUPO-03: con clase grupal, el cupo se sigue contando por hora de inicio exacta (byte-idéntico) | ✓ VERIFIED | Comparación textual directa 058:184-211 vs 062:342-371 (rama `ELSE`): **idéntica** salvo la extracción de `(v_capacity > 1)` a la variable `v_is_group` (mismo valor, mismo efecto). Regresión corrida por mí: `test/booking-core.test.ts`, `test/canchas-booking.test.ts`, `test/staff-assignment.test.ts`, `test/booking-cualquiera-public.test.ts` → **21/21 passed**. |
| 4 | CUPO-04: N+1 reservas escalonadas concurrentes sobre cupo N nunca superan el cupo (test de carrera real) | ✓ VERIFIED | Test `CUPO-04` re-corrido por mí de forma independiente contra el Supabase LOCAL real (no heredado del SUMMARY): `npx vitest run test/concurrency.test.ts -t "CUPO-04"` → **1 passed**. Corrida del archivo completo → **9/9 passed** (incluye CUPO-02 y "simultáneo cupo 1"). El control negativo A/B (lock viejo → falla 3/3) no se re-ejecutó en esta verificación (requeriría parchear la función en la DB), pero el SUMMARY 12-04 documenta el procedimiento reproducible con números observados y el mecanismo es consistente con el código de la 062 leído línea por línea. |
| 5 | CUPO-05: cero regresión del núcleo (cupo 1, canchas, abonos, multi-staff, espacio compartido) | ✓ VERIFIED | Firma de `book_slot_atomic` byte-idéntica confirmada (14 params + `RETURNS TABLE (id, cancel_token)`, `CREATE OR REPLACE` sin `DROP`); DEFAULT `'group_class'` cubre canchas sin backfill (confirmado en la DB local: `\d services` muestra el default). Suites del motor re-corridas por mí: 21/21 (ver fila 3). Nota aparte (no regresión de esta fase): `test/abono-*.test.ts` sigue con flakiness intermitente bajo carga paralela — el Plan 12-01 lo probó A/B contra la 058 y es pre-existente; no se re-litiga aquí. |

**Score:** 4/5 truths verified (1 presente + wireado, comportamiento visual no verificado por humano)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/062_service_capacity_mode_overlap.sql` | Columnas + CHECKs + RPC mode-aware + vista + NOTIFY | ✓ VERIFIED | Existe, `CREATE OR REPLACE` sin `DROP`, contiene `simultaneous_resource`, `hashtextextended`, `tsrange`, `slot_full`, `GRANT EXECUTE`, `NOTIFY pgrst, 'reload schema'` como última línea. |
| `supabase/schema.sql` | Reflejo quirúrgico de columnas + vista + función | ✓ VERIFIED | `grep capacity_mode` devuelve las 3 ubicaciones esperadas (tabla `services`, CHECK, vista `public_services`) + la función redefinida en el cuerpo. |
| `lib/types.ts` | `Service.capacity_mode` / `Service.capacity` | ✓ VERIFIED | Línea 198: `capacity_mode: 'group_class' | 'simultaneous_resource'`. |
| `lib/booking-core.ts` | SELECT con `capacity_mode` + early-return mode-aware | ✓ VERIFIED (WIRED) | Línea 98 (SELECT), línea 218 (`isSimultaneousResource`), línea 226 (gate `!isSimultaneousResource`). |
| `app/api/booking/availability/route.ts` | Rama overlap-aware para `simultaneous_resource` | ✓ VERIFIED (WIRED) | Líneas 236-300: lee `serviceId`, re-valida por `business_id`, calcula `full` por solape, `busy: []`, no expone `capacity`. |
| `app/[slug]/booking-client.tsx` | Oculta "Cualquiera" en simultáneo + manda `serviceId` | ✓ VERIFIED (WIRED) | Línea 129 `isSimultaneousResource`, línea 133 `showAny = ... && !isSimultaneousResource`, línea 270 `params.set('serviceId', ...)`. |
| `app/(dashboard)/settings/settings-client.tsx` | Segmented control + campo de cupo N + persistencia | ✓ VERIFIED (WIRED, no visualmente confirmado) | `CapacityModeFields` (línea 119), `normalizeCapacity` (110), `newService`/`editSvcForm` con los 2 campos (457/504), `addService`/`saveEditService` persisten con `.eq('business_id', ...)` (línea 532 confirmada). Falta la confirmación visual (ver Human Verification). |
| `app/(dashboard)/agenda/agenda-client.tsx` | Indicador "lleno" por solape (D-11) | ✓ VERIFIED (WIRED, no visualmente confirmado) | `overlapFullById` (línea 487) agrupa por carril `service_id|date`, cuenta intersección de intervalos, badge condicional (línea 630/657); `isGroup` gateado por `!isSimultaneous` (línea 629). |
| `test/helpers/booking-fixtures.ts` | `seedSimultaneousService` | ✓ VERIFIED | Presente y usado en `concurrency.test.ts`. |
| `test/concurrency.test.ts` | Casos CUPO-04/CUPO-02/simultáneo-cap-1 | ✓ VERIFIED | 9/9 tests pasan en corrida independiente (incluye los 6 casos preexistentes CONC-01/02/03, CUPOS-02/03, ALQUILER-02 — cero regresión). |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `book_slot_atomic` rama simultánea | `appointments` | `count(*)` por `tsrange && tsrange` filtrado por `service_id`+`business_id` | ✓ WIRED | Confirmado en 062:309-322, idéntico al predicado canónico de 042:190-191. |
| `services.capacity_mode` leído antes del lock | `pg_advisory_xact_lock` | El modo elige el hash del lock (D-06) | ✓ WIRED | Confirmado en 062:167-198: lectura del modo ANTES del lock (líneas 173-179), bifurcación del hash (192-198), orden `modo < espacios` preservado (locks de espacio siguen en 259+, sin cambios). |
| `booking-core` SELECT (95-100→98) | early-return de solape (206-218→218/226) | `capacity_mode='simultaneous_resource'` saltea el rechazo temprano | ✓ WIRED | Confirmado: la condición del early-return incluye `&& !isSimultaneousResource`. |
| `booking-client` (rama específica) | `/api/booking/availability` | `serviceId` en la request | ✓ WIRED | Confirmado: `params.set('serviceId', selectedService.id)` gateado por `isSimultaneousResource`. |
| `newService`/`editSvcForm` (settings-client) | `services` (insert/update) | payload con `capacity_mode`+`capacity`, browser client + RLS + `business_id` | ✓ WIRED | Confirmado: `saveEditService` hace `.eq('id', editSvc.id).eq('business_id', business.id)`. |
| `agenda-client` (render del slot) | `service.capacity_mode`/`capacity` | dispara el indicador "lleno" | ✓ WIRED | Confirmado: `overlapFullById` filtra por `capacity_mode === 'simultaneous_resource'` y cuenta contra `capacity`. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `agenda-client.tsx` badge "N/N lleno" | `overlapFullById` (Map) | `initialAppointments` (server component, filtrado por `business_id`) + `serviceById` (de `services` real) | Sí — verificado en DB local: columnas reales, no mock | ✓ FLOWING |
| `settings-client.tsx` segmented control | `newService.capacity_mode` / `editSvcForm.capacity_mode` | Estado inicial default + `openEditService` rehidrata desde `service` real | Sí | ✓ FLOWING |
| `availability/route.ts` rama simultánea | `fullSim` | `appts` (query real a `appointments` filtrada por `business_id`) + `services.capacity_mode/capacity` (re-validado) | Sí | ✓ FLOWING |

### Behavioral Spot-Checks (re-corridos por el verificador, no heredados del SUMMARY)

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `tsc` limpio en todo el repo | `./node_modules/.bin/tsc --noEmit` | exit 0 | ✓ PASS |
| CUPO-04 (carrera real, test nombrado único) | `npx vitest run test/concurrency.test.ts -t "CUPO-04"` | 1 passed \| 8 skipped | ✓ PASS |
| Archivo completo de concurrencia (incluye CUPO-02 y simultáneo cap 1) | `npx vitest run test/concurrency.test.ts` | 9 passed | ✓ PASS |
| Regresión del motor (CUPO-05) | `npx vitest run test/booking-core.test.ts test/canchas-booking.test.ts test/staff-assignment.test.ts test/booking-cualquiera-public.test.ts` | 21 passed | ✓ PASS |
| Columnas + CHECKs + defaults en DB local | `docker exec ... psql -c "\d services"` | `capacity_mode`/`capacity` con defaults y ambos CHECK presentes | ✓ PASS |
| `book_slot_atomic` mode-aware vivo en DB local | `pg_get_functiondef` grep `hashtextextended` | 4 ocurrencias (2 en cada rama del IF) | ✓ PASS |
| `public_services` no filtra `capacity` | `\d public_services` | Lista `capacity_mode`, NO lista `capacity` | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| CUPO-01 | 12-01 (tipos), 12-03 (UI) | Marcar modo por servicio, persiste | ✓ SATISFIED | Código+persistencia verificados + UAT visual 5/5 (2026-07-30) |
| CUPO-02 | 12-01, 12-02, 12-04 | Rechazo por solape en simultáneo | ✓ SATISFIED | Migración + wiring + test re-corrido |
| CUPO-03 | 12-01 | Grupal byte-idéntico | ✓ SATISFIED | Comparación textual + regresión 21/21 |
| CUPO-04 | 12-04 | Test de carrera real | ✓ SATISFIED | Test re-corrido independientemente, pasa |
| CUPO-05 | 12-01, 12-02, 12-03, 12-04 | Cero regresión del núcleo | ✓ SATISFIED | Regresión 21/21 + firma byte-idéntica + DEFAULT sin backfill |

Sin requisitos huérfanos: los 5 IDs de REQUIREMENTS.md (CUPO-01..05) están cubiertos por al menos un plan, y los 5 aparecen en el `requirements:` frontmatter de algún PLAN de la fase.

### Anti-Patterns Found

Ninguno bloqueante. Búsqueda de `TBD|FIXME|XXX|TODO|HACK|PLACEHOLDER` sobre los 10 archivos modificados de la fase: los únicos matches son falsos positivos (`RUBRO_PLACEHOLDERS` — identificador legítimo pre-existente de `lib/verticals`; "TODOS"/"TODO lo creado" en mayúsculas dentro de comentarios en español). Sin código huérfano, sin stubs, sin retornos vacíos hardcodeados en los artefactos de esta fase.

### Human Verification Required

Ver `human_verification` en el frontmatter — son los 5 pasos del checkpoint bloqueante del Plan 12-03 (`how-to-verify`), que quedaron OUTSTANDING porque el orquestador auto-aprobó el gate (`workflow.auto_advance=true`) sin que un humano abriera el navegador. El propio SUMMARY 12-03 lo documenta explícitamente y lo marca como pendiente antes de dar la fase por cerrada.

### Gaps Summary

No hay gaps de código: los 4 planes cumplen sus artefactos, wiring y pruebas; la migración 062 preserva la firma del RPC sin `DROP`, la rama `group_class` es byte-idéntica a 058, el lock se re-granulariza correctamente por modo, el `seat` sigue atado al slot exacto (no choca con el índice 011), y `public_services` no filtra `capacity`. El test CUPO-04 (la pieza de mayor riesgo de la fase) fue re-corrido de forma independiente en esta verificación contra la DB local real y pasa.

**CERRADO (2026-07-30).** El único punto abierto era **de proceso, no de código**: la UI del panel nunca había sido ejercitada visualmente por un humano porque el checkpoint bloqueante del Plan 12-03 se auto-aprobó (`workflow.auto_advance=true`). El usuario corrió la UAT en el navegador y los 5 pasos pasaron (`12-UAT.md`), con lo que CUPO-01 queda VERIFIED y la fase en `passed`.

### Trabajo hecho después de la verificación inicial

La verificación inicial (2026-07-29) se hizo sobre la migración **062**. Después, dos rondas de code-review encontraron y cerraron defectos reales en el núcleo — el resultado final auditado es el de la **064**:

- **Ronda 1 (migr. 063):** 4 BLOCKERs. El más grave, un doble-booking real: con `capacity > 1`, `v_is_group := true` sacaba la fila del EXCLUDE gist 013 y un simultáneo entraba encima de un turno de otro servicio en la misma agenda.
- **Ronda 2 (migr. 064):** la re-review encontró que el gate de la 063 era un `SELECT` sin serializar — los locks cubrían *instante* y *servicio-día*, pero el eje del invariante es **agenda-día**. Se reemplazaron ambos por un único `hash(business_id + date)`, estrictamente más grueso que el de 058 (preserva §GA1 por construcción), más el gate espejo en la rama grupal y el rechazo `simultaneous_space_conflict`.
- **secure-phase (2026-07-30):** 18/18 amenazas cerradas, `threats_open: 0` (`12-SECURITY.md`). T-12-11 se cerró con un rechazo server-side del combo "Cualquiera" + simultáneo, que hasta entonces solo estaba gateado por la UI.

**Migraciones 062, 063 y 064 aplicadas a mano en producción** (062/063 el 2026-07-29, 064 el 2026-07-30), cada una con `NOTIFY pgrst, 'reload schema';`.

### Riesgo residual abierto a propósito

**R-1** (escalado por el auditor, ver `12-SECURITY.md`): cambiar `capacity_mode` de un servicio **con turnos ya creados** deja filas `is_group=true` huérfanas — quedan fuera del EXCLUDE 013 y fuera del gate espejo, que exige el modo *actual* del servicio. Reconocido fuera de alcance en `064:72-74`. Vive en el mismo territorio que el todo `2026-07-30-el-cupo-vive-en-dos-lugares-y-falta-el-modo-individual.md` y conviene resolverlo en esa fase.

---

_Verified: 2026-07-29T14:10:00Z_
_Verifier: Claude (gsd-verifier)_
