---
quick_id: 260902-h6m
phase: quick-260902-h6m
plan: 01
workstream: motor-reservas
subsystem: seguridad / motor de reservas (privilegios de función)
tags: [security, supabase, rls, privileges, book_slot_atomic, migracion-076, X-16-A, RA-05]
status: complete
requires:
  - "supabase/migrations/069_shared_capacity_agenda_and_space_gates.sql (firma canónica de 14 args)"
  - "supabase/migrations/074_save_agenda_blocks.sql (único precedente de revocar EXECUTE)"
provides:
  - "El rol anon deja de poder ejecutar book_slot_atomic (migración 076, validada en LOCAL)"
  - "Regresión permanente: test/book-slot-atomic-anon-revoke.test.ts"
affects:
  - "supabase/schema.sql (NO tocado — se espeja recién DESPUÉS de aplicar la 076 en prod)"
tech-stack:
  added: []
  patterns:
    - "REVOKE EXECUTE a PUBLIC + al rol anónimo, re-GRANT explícito, todo en una transacción"
    - "Guard de post-estado con has_function_privilege dentro del BEGIN/COMMIT (migración que se verifica a sí misma)"
key-files:
  created:
    - supabase/migrations/076_book_slot_atomic_revoke_anon.sql
    - test/book-slot-atomic-anon-revoke.test.ts
    - .planning/quick/260902-h6m-cerrar-el-bypass-anon-de-book-slot-atomi/deferred-items.md
  modified:
    - .planning/workstreams/motor-reservas/todos/completed/2026-08-18-book-slot-atomic-es-ejecutable-por-anon.md
decisions:
  - "Se revoca la ejecución al rol anónimo en vez de llevar isDateOutOfWindow adentro de la función: revocar cierra los TRES controles (ventana + gate de plan + reCAPTCHA), mover la ventana cierra uno solo y duplica una regla de negocio."
  - "La 076 NO está acoplada a ningún deploy: los cuatro invocadores usan service_role o authenticated, medido uno por uno."
  - "La 076 NO se aplica a producción desde acá. Runbook completo en la cabecera del archivo."
metrics:
  duration: "~35 min"
  completed: 2026-09-02
  tasks: 3
  commits: 3
  tests_baseline: 1080
  tests_final: 1083
---

# Quick 260902-h6m: Cerrar el bypass anónimo de `book_slot_atomic` — Summary

Se revocó la ejecución de `book_slot_atomic` al rol anónimo (migración **076**, validada en local y
**NO aplicada a producción**), después de reproducir el bypass por las dos vías y de medir el rol
real de los cuatro invocadores del RPC.

---

## Los tres gates, con su salida literal

Los tres se midieron **antes** de escribir una línea de la migración. Ninguno vetó el camino.

### G1 — el bypass es real: REPRODUCIDO por las DOS vías

**Vía 1 — superficie real (PostgREST + anon key SIN sesión).** Es la superficie de producción: ese
cliente es literalmente lo que corre en el navegador de cualquiera que abra `/[slug]`.

```
 ❯ |db| test/book-slot-atomic-anon-revoke.test.ts (3 tests | 1 failed) 525ms
     × 1 — `anon` sin sesión NO puede ejecutar el RPC y NO deja ninguna fila 21ms

AssertionError: expected null not to be null
 ❯ test/book-slot-atomic-anon-revoke.test.ts:139:23
    139|     expect(error).not.toBeNull()

 Test Files  1 failed (1)
      Tests  1 failed | 2 passed (3)
EXIT=1
```

`error = null` significa que la llamada anónima **creó el turno**, con un payload que el route
handler público rechazaría **dos veces**: fecha `2031-03-03` contra `max_advance_days = 7`
(⇒ `date_out_of_window`) y `plan_status = 'cancelled'` (⇒ `plan_inactive`).

**Vía 2 — `SET LOCAL ROLE anon` + `ROLLBACK`** (la vía del todo original), vía
`docker exec supabase_db_forjo-app psql`:

```
         chequeo          | anon_puede_ejecutar
--------------------------+---------------------
 privilegio ANTES del fix | t

 rol_efectivo
--------------
 anon

NOTICE:  G1 control negativo OK: INSERT directo BLOQUEADO por RLS (42501)

                 resultado                  |            appointment_id
--------------------------------------------+--------------------------------------
 turno creado por anon via book_slot_atomic | fc8026bb-81c3-4cfe-b90b-1cf6e442b487

 filas_en_appointments
-----------------------
                     1
ROLLBACK
 filas_tras_el_rollback
------------------------
                      0
```

El control negativo es la parte que cierra el argumento: **el mismo rol** que NO puede hacer un
`INSERT` directo (bloqueado por RLS, 42501) **sí** crea el turno pasando por la función
`SECURITY DEFINER`. Nada quedó escrito (`ROLLBACK` → 0 filas).

### G2 — no hay ningún caller anónimo (con los roles REALMENTE medidos)

`grep -rn "book_slot_atomic" app/ lib/ components/ scripts/` devuelve **un solo call site de
producción**: `lib/booking-core.ts:499`. El resto de los hits (18) son comentarios en prosa que
nombran la función para explicar el criterio de cupo. `lib/booking-core.ts` recibe el cliente por
parámetro y **nunca lo crea**, así que el rol lo deciden sus invocadores.

Se abrieron los cuatro y se leyó el cliente que pasan:

| Invocador | Cliente | Rol efectivo |
|---|---|---|
| `app/api/booking/create/route.ts:91` (booking público) | `createAdminClient()` | **service_role** |
| `app/api/appointments/create/route.ts:23` (alta manual del dueño) | `await createClient()` (cookies) | **authenticated** |
| `app/api/abonos/create/route.ts:73` → `lib/abono-generation.ts:196` | `await createClient()` (cookies) | **authenticated** |
| `app/api/cron/cancel-expired/route.ts:253` → `lib/abono-generation.ts:196` | `createAdminClient()` | **service_role** |

> **Corrección al plan.** El objetivo del PLAN (~línea 76) y el paso (b) del runbook decían que
> "abonos" llama con **service_role**. Es impreciso: `generateAbonoOccurrences` es **rol-agnóstico**
> (lo dice su propio comentario en `lib/abono-generation.ts:45`) y tiene **dos** invocadores con
> roles **distintos** — el cron con service_role y el alta de abonos del panel con **authenticated**.
> Medido, no copiado. **No cambia la conclusión**: `authenticated` conserva el GRANT en la 076, así
> que los dos siguen funcionando; y G2 sigue en pie, porque ninguno usa la anon key sin sesión. La
> cabecera de la 076 registra los cuatro roles reales, no la simplificación del plan.

### G3 — línea de base de los otros dos roles

Los casos 2 (`service_role`) y 3 (`authenticated`) pasaron **HOY, antes de tocar nada**
(`Tests 1 failed | 2 passed (3)`). Son la línea de base contra la que se mide que el revoke no se
pasó de rosca: sin ellos, el caso 1 podría ponerse verde por un payload inválido en vez de por la
falta de privilegio.

---

## Estado después del fix

```
      rol      | puede_ejecutar
---------------+----------------
 anon          | f
 authenticated | t
 service_role  | t
```

Y el rechazo real que recibe ahora el rol anónimo:

```
 current_user
--------------
 anon
ERROR:  permission denied for function book_slot_atomic
```

Suite de regresión: **3/3 en verde** (el caso 1 pasó de rojo a verde; los dos controles positivos
siguen creando su turno).

---

## Tareas y commits

| # | Tarea | Commit |
|---|---|---|
| 1 | RED — reproducir el bypass y medir los privilegios | `d1a5486` |
| 2 | GREEN — migración 076 (revoke + guard + runbook) | `f5e978c` |
| 3 | Regresión de los tres caminos + cierre del todo | `1fbf48a` |

**Task 1** no tocó `lib/`, `app/` ni `supabase/` (`git diff --stat` vacío): medición pura.

---

## Verificación

| Gate | Resultado |
|---|---|
| `npx supabase db reset` | OK — el log dice **`Applying migration 076_book_slot_atomic_revoke_anon.sql...`** (no `Skipping`), y el guard de post-estado no abortó |
| `vitest run test/book-slot-atomic-anon-revoke.test.ts` | **3/3** verde |
| `vitest run test/suite-split.test.ts` | **6/6** verde (la suite nueva quedó en el proyecto `db`) |
| `npm test` | **1083** tests = baseline **1080** + 3. Sin caída del total |
| `./node_modules/.bin/tsc --noEmit` | exit 0, sin salida (binario local, no `npx`) |
| `./node_modules/.bin/eslint test/book-slot-atomic-anon-revoke.test.ts` | exit 0, **cero hallazgos** |
| `git diff --stat -- supabase/schema.sql supabase/migrations/` | **vacío** — ninguna migración 041–075 ni `schema.sql` tienen una línea de diff |
| `git status --porcelain -- .../motor-reservas/phases/` | **vacío** — no se tocó ningún archivo de fases |
| Firma de 14 args vs `069:489` | `diff` → **IDÉNTICAS** (byte a byte) |
| `grep -cE 'REVOKE EXECUTE ON FUNCTION' 076` | **2** (PUBLIC + `anon`) |

### Los tres caminos de alta siguen creando turnos

Es el riesgo real de este cambio, y se verificó en vez de afirmarse:

- **Booking público** (`service_role`) — caso 2 de la suite nueva + `test/booking-public-regression.test.ts`
- **Alta manual del dueño** (`authenticated`) — caso 3 de la suite nueva + `test/manual-booking.test.ts`
- **Abonos** (`authenticated` en el panel, `service_role` en el cron) — `test/abono-generation.test.ts`,
  `test/abono-cron.test.ts`, `test/abono-create.test.ts`

Más `test/concurrency.test.ts` y `test/booking-core.test.ts`, que ejercen el RPC de verdad contra la
base. Todo verde en la corrida completa.

---

## ⚠ La migración 076 NO está aplicada en producción

Validada **sólo en local**. El **runbook completo** vive en la cabecera de
`supabase/migrations/076_book_slot_atomic_revoke_anon.sql`:

- **(a) Pre-flight** — query de `has_function_privilege` para los tres roles. Esperado antes de
  aplicar: `anon = t`, `authenticated = t`, `service_role = t`. Si `anon` ya viniera en `f`, es un
  no-op y no hace falta aplicarla.
- **(b) Chequeo de consumidores** — re-verificar en el momento de aplicar que no apareció ninguna
  integración externa que llame al RPC con la anon key. Si apareció: **no aplicar** y reabrir la
  decisión.
- **(c)** Pegar el archivo **completo, de una sola vez** — nunca statement por statement (partirlo
  rompe la atomicidad y puede dejar al dueño sin GRANT).
- **(d) Verificación posterior** — la misma query (esperado `f/t/t`) **más** una prueba de humo
  funcional: crear un turno desde el link público y otro desde el alta manual del panel.
- **(e) Recién DESPUÉS de aplicarla**, espejar `supabase/schema.sql` a mano y de forma quirúrgica:
  borrar la línea `GRANT ALL ... TO "anon";` (~`schema.sql:2884`, la de `anon` únicamente) y
  actualizar la nota de `~schema.sql:4449`, que hoy afirma que RA-05 sigue abierto.
- **(f) Orden** — producción tiene aplicada hasta la **075 inclusive** (verificada el 2026-08-31 con
  `pg_constraint` crudo). La 076 es la siguiente y no tiene nada delante.

**La 076 no está acoplada a ningún deploy** y se puede aplicar sola: ninguno de los cuatro
invocadores usa la anon key. Hasta que se aplique, **el bypass sigue abierto en producción**.

---

## Desviaciones del plan

**1. [Corrección de dato] El rol de los invocadores de abonos.** El plan decía "service_role" para
abonos; la medición (G2) muestra que son **dos** invocadores con roles distintos —`authenticated`
(panel) y `service_role` (cron)—. Se registró el dato real en la cabecera de la 076, en la resolución
del todo y en este summary, en vez de repetir la simplificación. No cambia la conclusión ni el fix.

**2. [Fuera de alcance] `test/shell-scope.test.ts` flakea en la corrida completa.** Falla con
`Test timed out in 5000ms` dentro de `npm test` (10479 ms en el baseline, 9331 ms después del fix) y
pasa **13/13 en 611 ms** aislado. **Es preexistente**: falló exactamente igual en el baseline tomado
*antes* de crear un solo archivo de este quick task. Es un test **puro** que escanea `app/` con `fs`
buscando dónde se monta un provider — no toca la base, ni `book_slot_atomic`, ni privilegios. Por la
regla de alcance NO se arregló: quedó registrado en `deferred-items.md` con el arreglo sugerido
(darle un timeout explícito al caso, como ya hacen las suites DB-backed del repo).

Ninguna desviación requirió permiso (Reglas 1–3). No se activó la Regla 4.

---

## Threat model — disposición final

| Threat ID | Estado | Evidencia |
|---|---|---|
| T-h6m-01 (EoP: `anon` ejecuta el RPC) | **cerrado en local** | `has_function_privilege('anon', ...) = f`; `permission denied for function book_slot_atomic` |
| T-h6m-02 (ventana de reserva salteable) | cerrado por T-h6m-01 | El caso 1 usa `2031-03-03` con `max_advance_days = 7` |
| T-h6m-03 (reCAPTCHA salteable) | cerrado por T-h6m-01 | Sin ejecución anónima, la única entrada pública es `/api/booking/create` |
| T-h6m-04 (gate de plan salteable) | cerrado por T-h6m-01 | El caso 1 siembra `plan_status = 'cancelled'` |
| T-h6m-05 (revoke de más rompe el alta manual) | mitigado | Guard de post-estado en la transacción + casos 2 y 3 verdes + prueba de humo en el runbook |
| T-h6m-06 (regresión futura: re-conceder a `anon`) | mitigado | El caso 1 se pone rojo. Refuerzo: la 074 revocó el default de FUNCTIONS para `anon` |
| T-h6m-07 (`business_id`/`service_id` públicos) | **accept** | Datos que la página pública necesita; dejan de ser aprovechables sin el privilegio |

**Nota de estado:** todos los "cerrado" son **en local**. En producción siguen abiertos hasta que se
aplique la 076 a mano.

Sin flags de superficie nueva: esta migración no agrega endpoints, ni tablas, ni policies, ni vistas.

---

## Known Stubs

Ninguno. No se agregó código de aplicación: el cambio es una migración de privilegios más una suite
de regresión.

---

## Self-Check: PASSED

Archivos verificados en disco: los 5 (migración 076, suite de regresión, todo en `completed/`,
`deferred-items.md`, este summary). El todo ya **no** está en `todos/pending/`.
Commits verificados en `git log`: `d1a5486`, `f5e978c`, `1fbf48a`, `90f0e6a`.
Sin borrados de archivos trackeados en ningún commit del quick task (más allá del `git mv` del todo,
que es intencional y preserva el historial).
