---
phase: 16-correcciones-del-gate
verified: 2026-08-18T21:01:54Z
status: passed
score: 4/4 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 16: Correcciones del gate — Verification Report

**Phase Goal:** Corregir el predicado de los dos gates de servicio en una sola pasada (migración 070):
(a) GATE-01 — estrecharlo por dirección (`individual` → grupal/simultáneo deja de rechazar; las
direcciones peligrosas siguen bloqueando); (b) GATE-02 — marcar `completed` un turno futuro deja de
abrir el gate; (c) GATE-03 — los dos gates comparan fecha + hora, no solo fecha.

**Verified:** 2026-08-18T21:01:54Z
**Status:** passed
**Re-verification:** No — initial verification

## Método

Esta verificación NO se apoyó en las afirmaciones de los SUMMARY. Para cada truth se corrió una
consulta independiente contra el Postgres local (`supabase_db_forjo-app`), se leyó `pg_get_functiondef`
de las dos funciones instaladas, se leyeron los archivos de test línea por línea (no solo los grep
declarados), y se corrió la suite de gates de forma independiente. El script de repro propio (no el de
`16-BASELINE-070.md`) usó IDs de negocio/servicio distintos a los del baseline documentado, para que la
medición fuera realmente independiente y no una repetición del mismo script.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `individual` → grupal/simultáneo con turnos futuros vivos ya NO se rechaza; las direcciones peligrosas (`group_class`→`individual`, `group_class`→`simultaneous_resource`, `simultaneous_resource`→`group_class`) SIGUEN rechazando con `service_mode_has_future_appointments` (GATE-01) | ✓ VERIFIED | Repro independiente contra el local (ver abajo): `individual→group_class` con turno futuro ⇒ `PASA`, y el turno preexistente quedó con `is_group = false` después del cambio (evidencia de que R-1 no se reabre). Las 3 direcciones peligrosas ⇒ `RECHAZO P0001 / service_mode_has_future_appointments`, medidas en la misma corrida. Coincide con `16-BASELINE-070.md` (casos 1,2,3) y con la matriz completa de `test/capacity-mode-change-gate.test.ts` (casos 8,9,10,11), que corrió en verde de forma independiente (27 passed \| 1 expected fail) |
| 2 | Marcar `completed` un turno futuro NO abre el gate de modo (GATE-02) | ✓ VERIFIED | Repro independiente: servicio `group_class` con único turno futuro `completed` → intento de pasar a `individual` ⇒ `RECHAZO P0001 / service_mode_has_future_appointments`. `pg_get_functiondef` de `services_block_mode_change` confirma la rama `a."status" <> 'cancelled'` (ya no excluye `completed`). Coincide con caso 12 del test y caso 4 del baseline |
| 3 | Un turno de hoy a hora ya pasada deja de bloquear el borrado del servicio Y el cambio de modo — en los DOS gates (GATE-03) | ✓ VERIFIED | Repro independiente: turno de HOY 00:00 → cambio de modo `PASA`; turno de HOY 00:30 → `DELETE` del servicio `PASA` (`serviceExists` implícito: el `DELETE` no lanzó excepción). `pg_get_functiondef` de las dos funciones confirma `v_now_time` y la rama `a."date" > v_today OR (a."date" = v_today AND a."time" >= v_now_time)` en ambas. Frontera conservada (hoy a hora futura) sigue rechazando — verificado en el baseline (caso 7) y en los tests (casos 14 y 13 del archivo de borrado) |
| 4 | Cero regresión de R-1: existe un test POR DIRECCIÓN que demuestra que las peligrosas siguen cerradas, con CONTROL NEGATIVO contra el predicado viejo | ✓ VERIFIED | `test/capacity-mode-change-gate.test.ts` tiene 13 casos (leídos completos, no solo greppeados): casos 1/2/3 re-anclados a la dirección peligrosa `group_class→individual` (mismo assert, dirección movida — no aflojado), casos 10/11 nuevos cubren las dos direcciones peligrosas restantes. El A/B del 16-02-SUMMARY instaló los cuerpos VIEJOS de la 065+068 en un `.sql` desechable, verificó por instalación (`v_now_time` ausente, predicado viejo presente: `f\|t` en las dos), corrió las suites (`5 failed \| 22 passed \| 1 expected fail`, los 5 discriminantes cayeron) y restauró la 070 (`t\|t` de nuevo). La DB local verificada AHORA por este verificador vuelve a dar `t\|t` — el estado quedó restaurado, no colgado en el predicado viejo |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/070_service_gates_direction_and_time_precision.sql` | Las tres correcciones en una sola redefinición, con `BEGIN;`/`COMMIT;` explícito | ✓ VERIFIED | 357 líneas, `BEGIN;`/`COMMIT;` presentes, `NOTIFY pgrst` después del COMMIT. Cuerpo leído completo — coincide exactamente con `pg_get_functiondef` del local |
| `supabase/schema.sql` | Espejo quirúrgico de las dos funciones | ✓ VERIFIED | `grep -cF 'date" >= v_today'` == 1 (solo abonos, fuera de alcance), `v_now_time` == 4, `a."status" <> 'cancelled'` == 1, `NOT IN ('cancelled', 'completed')` == 2. Diff: +28/−5 (chico y localizado) |
| `lib/appointment-time.ts` | Comentario deja de declarar la "DIVERGENCIA CONOCIDA" | ✓ VERIFIED | `grep -c "070"` == 3, `grep -ci "DIVERGENCIA CONOCIDA"` == 0 |
| `lib/types.ts` | Comentario de `capacity_mode` declara la salvedad de dirección | ✓ VERIFIED | `grep -c "070"` == 1 |
| `.planning/.../16-BASELINE-070.md` | Control negativo A/B de los ocho casos, antes y después | ✓ VERIFIED | Leído completo. Script, salida literal de las dos corridas, tabla A/B con flips exactos (1,4,5,6) e inmóviles (2,3,7,8). SQLSTATE y código de dominio literales presentes |
| `.planning/.../16-RUNBOOK-070.md` | Procedimiento manual con criterio de aborto, verificación por instalación, rollback por objeto | ✓ VERIFIED | Leído completo (302 líneas). Pre-flight con 4 controles y tabla de decisión SEGUIR/ABORTAR, verificación post-aplicación por `pg_proc`+`pg_trigger`, rollback por objeto con tabla de "qué se pierde", sección de registro vacía. Declara explícitamente "NO APLICADA" y "decisión del dueño (D-08)" |
| `test/capacity-mode-change-gate.test.ts` | Matriz completa por dirección | ✓ VERIFIED | 13 casos (1,2,3,5,6,7,8,9,10,11,12,13,14 — el 4 absorbido, con el porqué escrito en el archivo). Leído el contenido completo de los casos 1-14, no solo los nombres |
| `test/service-delete-gate.test.ts` | GATE-03 en el gate de borrado + testigo de divergencia | ✓ VERIFIED | Casos 12 y 13 nuevos (GATE-03 fix + frontera), testigo de la divergencia ampliado en el caso 8, con referencia cruzada al caso 12 del archivo hermano |
| `test/helpers/booking-fixtures.ts` | `seedSimultaneousService` acepta `serviceId` | ✓ VERIFIED | Usado por los casos 11 y 4 nuevos; regresión de `concurrency.test.ts` + `booking-cualquiera-public.test.ts` declarada en verde (no re-corrida por este verificador — no forma parte del alcance de la fase, es solo regresión de compatibilidad) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `070...sql` | `supabase/schema.sql` | espejado quirúrgico | ✓ WIRED | El cuerpo `pg_get_functiondef` local coincide con `schema.sql` en las partes de predicado (verificado por grep de patrones exactos) |
| `070...sql` | `lib/appointment-time.ts` | predicado replica `isPastAppointment` (inicio del turno, `>=` inclusivo) | ✓ WIRED | El predicado SQL no suma `duration_minutes` (verificado: `grep -c 'duration_minutes'` == 0 en la migración), igual que `isPastAppointment` |
| `16-BASELINE-070.md` | `070...sql` | cada caso del A/B mide una corrección del archivo | ✓ WIRED | Los 8 casos del baseline mapean 1:1 a GATE-01/02/03, confirmado por lectura cruzada |
| `test/*.ts` | `070...sql` | golpe por PostgREST + assert de código de dominio | ✓ WIRED | Confirmado corriendo la suite de forma independiente contra la DB local con la 070 instalada |
| `16-RUNBOOK-070.md` | `070...sql` | procedimiento de aplicación manual | ✓ WIRED | El runbook referencia el archivo por nombre y describe su aplicación completa |

### Behavioral Spot-Checks (independientes del executor)

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Dirección segura `individual→group_class` pasa y preserva `is_group=false` en fila preexistente | Script SQL propio contra el local (IDs distintos al baseline) | `PASA` + `is_group = false` | ✓ PASS |
| Las 3 direcciones peligrosas rechazan | Script SQL propio | 3× `RECHAZO P0001 / service_mode_has_future_appointments` | ✓ PASS |
| `completed` futuro rechaza el cambio de modo (GATE-02) | Script SQL propio | `RECHAZO P0001 / service_mode_has_future_appointments` | ✓ PASS |
| Turno de hoy ya pasado no bloquea el cambio de modo ni el borrado (GATE-03) | Script SQL propio | 2× `PASA` | ✓ PASS |
| `completed` futuro NO bloquea el borrado (divergencia D-03) | Script SQL propio | `PASA (borrado)` | ✓ PASS |
| Verificación por instalación (`pg_proc.prosrc`) | `select proname, position('v_now_time'...), position('a."date" >= v_today'...)` | `services_block_mode_change\|t\|t`, `services_block_delete\|t\|t` | ✓ PASS |
| Suite de gates completa | `vitest run capacity-mode-change-gate.test.ts service-delete-gate.test.ts --no-file-parallelism` | `27 passed \| 1 expected fail (28)` | ✓ PASS |
| `tsc --noEmit` | `./node_modules/.bin/tsc --noEmit` | exit 0 (ya medido por el orquestador; no re-corrido) | ✓ PASS (heredado) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| GATE-01 | 16-01, 16-02 | Recorte por dirección del gate de modo | ✓ SATISFIED | Verificado en DB real + tests + código |
| GATE-02 | 16-01, 16-02 | `completed` futuro deja de abrir el gate de modo | ✓ SATISFIED | Verificado en DB real + tests + código |
| GATE-03 | 16-01, 16-02 | Fecha + hora en los dos gates | ✓ SATISFIED | Verificado en DB real + tests + código |

REQUIREMENTS.md marca las tres con `[x]` en la sección narrativa. La tabla de trazabilidad al pie del
mismo archivo (líneas 190-192) todavía dice "Pending — migr. 070" para las tres — es un artefacto de
documentación no sincronizado con el checkbox de arriba, NO una evidencia de que el trabajo esté
incompleto (la migración, el código, los tests y la DB local lo contradicen). Se registra como nota, no
como gap, porque no afecta el logro del objetivo de la fase en el código.

No hay requisitos huérfanos: los tres IDs de fase (GATE-01/02/03) están declarados en el frontmatter de
ambos PLANes y en REQUIREMENTS.md, sin IDs adicionales mapeados a Phase 16 que no aparezcan en los planes.

### Anti-Patterns Found

Ninguno. Se escaneó `TBD|FIXME|XXX` en los 8 archivos tocados por la fase (2 migraciones/schema, 2
`lib/`, 3 `test/`, 1 runbook) — cero coincidencias. No hay `console.log` sueltos, ni `return null`
crudo en las funciones SQL (`RETURN NEW`/`RETURN OLD` obligatorios presentes), ni datos hardcodeados
vacíos en superficie de usuario (esta fase no toca `.tsx`, confirmado por `git diff --name-only`).

### Scrutinized Items (per orchestrator's what_to_scrutinize_hardest)

1. **Narrowing no reabrió R-1.** Confirmado por dos vías independientes: (a) repro SQL propio contra
   la DB real mostró las 3 direcciones peligrosas rechazando en la misma corrida en que la dirección
   segura se abrió; (b) la aserción `is_group = false` sobre el turno preexistente después del cambio
   de modo seguro, que es la evidencia de que esas filas siguen bajo el EXCLUDE gist 013.

2. **El control negativo es real.** El estado actual de la DB local (verificado por este verificador,
   no solo citado del SUMMARY) da `t|t` en `pg_proc.prosrc` para las dos funciones — la 070 está
   instalada y no quedó colgada en el predicado viejo tras el A/B de 16-02. Los 5 discriminantes
   listados en el SUMMARY (casos 8, 9, 12, 13 del gate de modo + caso 12 del gate de borrado) son
   exactamente los casos nuevos que la 070 introduce — coherente: son los únicos que pueden distinguir
   el predicado viejo del nuevo. Los invariantes declarados (direcciones peligrosas, frontera de hoy)
   también son coherentes: pasan con los dos predicados porque el fix no los toca.

3. **GATE-03 es permisivo + alta manual exenta de la ventana.** T-16-05 (`accept`) está escrito en el
   header de la migración misma, no solo en el PLAN — el operador de `secure-phase` lo va a encontrar
   donde vive el código. El razonamiento (autolesión del propio dueño, en su propio tenant, sobre un
   horario que ya pasó; ninguna superficie anónima puede crear turnos en el pasado) es correcto dado
   lo que la fase pudo verificar: no se re-auditó independientemente el booking público para confirmar
   que respeta la ventana de reserva (está fuera del scope de esta fase, que no toca `app/`). La
   condición de reapertura está declarada explícitamente.

4. **El conteo de 13 casos.** Verificado leyendo el archivo completo, no solo los `it(` — hay
   exactamente 13 `it(...)` en `capacity-mode-change-gate.test.ts` (falta el número 4, con el
   comentario explicando por qué se absorbió y por qué duplicarlo sería imposible de ejecutar por el
   índice único 011 y el EXCLUDE gist 013).

5. **Ningún test aflojado.** Se leyeron los casos 1, 2 y 3 completos (no solo sus nombres): la
   aserción (`error.code === 'P0001'`, `message.includes(...)`, relectura de la fila) es idéntica a
   la versión anterior — lo único que cambió es el fixture de origen (`group_class` en vez de
   `individual`), documentado con el motivo técnico correcto (el guard de dirección devuelve antes
   del `EXISTS` desde `individual`).

### Human Verification Required

Ninguno. Todos los truths son verificables por comportamiento observable contra la base de datos real
y por lectura completa de código/tests, sin necesidad de UI (esta fase no toca `.tsx`).

### Gaps Summary

Sin gaps. Las cuatro observable truths están verificadas de forma independiente contra la DB local, el
código instalado (`pg_get_functiondef`) y las suites de test corridas por este verificador (no solo
citadas del SUMMARY). La única discrepancia encontrada es cosmética: la tabla de trazabilidad al pie
de REQUIREMENTS.md no se actualizó de "Pending" a "Complete" para GATE-01/02/03, pese a que los
checkboxes narrativos de la misma sección sí están en `[x]`. No bloquea el objetivo de la fase.

---

_Verified: 2026-08-18T21:01:54Z_
_Verifier: Claude (gsd-verifier)_
