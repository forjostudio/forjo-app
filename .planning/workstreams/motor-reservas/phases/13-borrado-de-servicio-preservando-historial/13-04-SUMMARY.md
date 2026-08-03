---
phase: 13-borrado-de-servicio-preservando-historial
plan: 04
subsystem: testing
tags: [vitest, integracion, postgres, trigger, multi-tenant, snapshot, regresion]
status: complete

dependency_graph:
  requires:
    - "13-01 (migr. 065: los dos triggers y los dos codigos de dominio)"
    - "13-02 (read-paths sobre el snapshot)"
    - "13-03 (mapeo P0001 en el modal)"
  provides:
    - "test/service-snapshot.test.ts (5 casos del trigger BEFORE INSERT)"
    - "test/service-delete-gate.test.ts (7 casos del trigger BEFORE DELETE)"
    - "Evidencia automatizada de HIST-01, HIST-02 y HIST-03"
    - "Evidencia de D-02: cero archivos del write-path en el diff de la fase"
    - "Verificacion empirica de A2 (forma del error del trigger via PostgREST)"
  affects:
    - "13-05 (aplicacion de la 065 a prod: estos tests son el gate previo)"

tech_stack:
  added: []
  patterns:
    - "Testear un mecanismo que vive 100% en la base insertando/borrando de verdad y releyendo la fila: no hay funcion de TS que interceptar"
    - "Un servicio propio por caso (seedService) para que los casos del gate no se pisen entre si"
    - "Horario distinto por caso sobre la misma agenda, para no chocar con el indice unico 011 ni con la exclusion constraint 013"
    - "Fechas fijas 2031 (futuro) / 2020 (pasado): la frontera 'hoy AR' del trigger se ejerce sin depender del reloj del runner"
    - "Tenant desechable con teardown manual del usuario auth cuando el propio test borra el business (caso de cascada)"

key_files:
  created:
    - test/service-snapshot.test.ts
    - test/service-delete-gate.test.ts
  modified: []

decisions:
  - "Cada caso del snapshot crea SU turno en vez de encadenarse al caso anterior: el plan encadenaba el caso 2 al 1, pero los tests independientes no se rompen si vitest reordena o si un caso previo falla"
  - "Timeout explicito de 20000 ms por caso: la suite corre contra la DB local compartida y el default de 5000 ms es exactamente la causa de los flakes preexistentes del baseline"
  - "Fechas fijas 2031/2020 en vez de 'manana' calculado: el gate se prueba igual y el test no depende del reloj ni del huso del runner"
  - "El caso de cascada suma un sanity check (el servicio solo NO se puede borrar) antes de borrar el negocio: sin eso, el test pasaria aunque el gate estuviera apagado para ese tenant"

metrics:
  duration: "~15 min"
  completed: 2026-08-03
  tasks: 3
  commits: 2
  files_created: 2
  files_modified: 0
---

# Phase 13 Plan 04: Tests de integracion del snapshot y del gate de borrado — Summary

Doce casos de integracion nuevos contra el Supabase LOCAL que prueban los dos triggers de la migracion 065 (snapshot inmutable y gate de borrado) y dejan evidencia de que el write-path del motor de reservas no se toco en toda la fase.

## Que se construyo

Dos archivos de test, cero lineas de produccion. La fase entera descansa en comportamiento de base que ni `tsc` ni el build pueden ver: si alguien cambia `IS DISTINCT FROM` por `<>`, o borra el filtro por `business_id` de una funcion `SECURITY DEFINER`, todo compila igual y el agujero se va a prod. Estos son los tests que fallan en ese caso.

| Archivo | Casos | Que cubre |
|---------|-------|-----------|
| `test/service-snapshot.test.ts` | 5 | `appointments_service_snapshot_trg` + `abonos_service_snapshot_trg` (D-02, D-03, D-09, T-13-01, T-13-02) |
| `test/service-delete-gate.test.ts` | 7 | `services_block_delete_trg` (D-08, D-09, D-10) + HIST-01/HIST-03 + guard de cascada (T-13-06, T-13-07) |

### `test/service-snapshot.test.ts`

| # | Caso | Que prueba |
|---|------|------------|
| 1 | `createAppointmentCore` deja el snapshot escrito sin pedirlo | **D-02**: el write-path no cambio y el snapshot igual aparece |
| 2 | Cambiar precio y nombre del servicio no altera el snapshot ya escrito | **D-03**: foto, no espejo — editar un precio no reescribe la facturacion historica |
| 3 | Un insert directo con `service_name`/`service_price` inventados es sobrescrito | **T-13-02**: el cliente no dicta su propia facturacion |
| 4 | Un `service_id` de OTRO tenant deja el snapshot en NULL | **T-13-01**: dentro de `SECURITY DEFINER` no hay RLS; el filtro explicito por `business_id` es lo unico que evita la fuga |
| 5 | Un abono nuevo queda con el `service_name` del servicio | **D-09**: el detalle del abono archivado sobrevive al servicio |

El caso 2 restaura el servicio en un `finally`: los demas casos (y el resto de la suite) esperan los valores del seed.

### `test/service-delete-gate.test.ts`

| # | Caso | Resultado esperado |
|---|------|--------------------|
| 1 | Turno futuro `confirmed` | Rechaza con `P0001` / `service_has_future_appointments`; el servicio sigue existiendo |
| 2 | Turno futuro `cancelled` | Borra (esta es la confusion que la fase viene a arreglar) |
| 3 | Turno futuro con `status = NULL` | Rechaza — regresion del `IS DISTINCT FROM` |
| 4 | Solo turnos pasados + futuros cancelados | Borra, el servicio **desaparece** y los dos turnos sobreviven con `service_id = null` y snapshot intacto |
| 5 | Abono `active` | Rechaza con `P0001` / `service_has_active_abono` |
| 6 | Abono `cancelled` | Borra; el abono sobrevive con `service_id = null` y su `service_name` intacto |
| 7 | `DELETE FROM businesses` con turno futuro vivo | Borra el negocio entero y el servicio desaparece (guard de cascada) |

El caso 4 es la verificacion empirica de **T-13-06**: asierta que el `select` del servicio devuelve 0 filas. Si el trigger devolviera `NULL` en vez de `RETURN OLD`, el DELETE se cancelaria en silencio, PostgREST responderia 204 y la UI diria "eliminado" sin haber borrado nada.

El caso 7 suma un sanity check que el plan no pedia: antes de borrar el negocio, intenta borrar el servicio solo y exige `P0001`. Sin eso, el test pasaria igual con el gate apagado para ese tenant y no probaria nada.

## Tareas completadas

| Tarea | Nombre | Commit | Archivos |
|-------|--------|--------|----------|
| 1 | `test/service-snapshot.test.ts` — trigger BEFORE INSERT | `409cb13` | `test/service-snapshot.test.ts` |
| 2 | `test/service-delete-gate.test.ts` — trigger BEFORE DELETE | `bd1335c` | `test/service-delete-gate.test.ts` |
| 3 | Verificar cero regresion del write-path y el copy de sede/cancha | (sin cambios en disco) | — |

La Tarea 3 no produce commit propio: es verificacion pura y por diseno no edita nada (mismo criterio que la Tarea 2 del plan 13-01). Su evidencia esta abajo.

## Verificacion de A2: el objeto de error tal cual llega del trigger

El RESEARCH dejaba abierta la forma en que un `RAISE EXCEPTION` de un trigger `BEFORE DELETE` llega al cliente por PostgREST. Capturado en vivo contra el Supabase local:

```json
{
  "code": "P0001",
  "details": null,
  "hint": null,
  "message": "service_has_future_appointments"
}
```

```json
{
  "code": "P0001",
  "details": null,
  "hint": null,
  "message": "service_has_active_abono"
}
```

**A2 confirmada.** `error.code` es exactamente `'P0001'` y `error.message` es el codigo de dominio **crudo**, sin prefijo, sin `details` ni `hint`. Es decir: el mapeo que 13-03 escribio en `lib/canchas.ts` (comparar `code === 'P0001'` y matchear el `message`) esta apuntando a los campos correctos, y el `message` no filtra ningun dato del negocio (T-13-09 — no hay nombres, fechas ni conteos en el texto).

## Entorno contra el que corrieron los tests (T-13-22)

```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321   (via .env.test.local, override: true)
DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
```

Supabase **LOCAL** (PG17), con la 065 ya aplicada por `db reset` en el plan 13-01 (verificado: `appointments.service_name` / `appointments.service_price` / `abonos.service_name` responden por PostgREST). **Nada toco produccion** — prod sigue en la migracion 064 y su aplicacion es el plan 13-05.

## Cero regresion del motor (Tarea 3a)

| Corrida | Resultado |
|---------|-----------|
| Antes de la fase (baseline documentado) | 811 passed / 1 skipped / **4 failed** — 816 tests, 64 archivos |
| `npm test` con esta fase completa (1ª corrida) | 823 passed / 1 skipped / **4 failed** — 828 tests, 66 archivos |
| `npm test` con esta fase completa (2ª corrida) | 825 passed / 1 skipped / **2 failed** — 828 tests, 66 archivos |

**828 − 816 = 12** = exactamente los 5 + 7 casos nuevos de este plan. El total crecio y ninguna suite preexistente se cayo.

Las fallas de las dos corridas viven **siempre** en los mismos tres archivos del baseline conocido (`abono-create`, `abono-cron`, `abono-generation`) y **cambian entre corridas** (4 → 2), que es la firma de la contaminacion cruzada contra la DB local compartida, preexistente desde v0.24 y fuera del alcance de esta fase. Confirmado aislando:

```
npx vitest run test/abono-create.test.ts test/abono-cron.test.ts test/abono-generation.test.ts --no-file-parallelism
→ Test Files 3 passed (3) · Tests 34 passed (34)
```

**Ninguna falla nueva fuera de ese conjunto.** Los seis tests de regresion del motor (`concurrency`, `booking-public-regression`, `booking-core`, `manual-booking`, `abono-generation`, `canchas-booking`) quedaron verdes **sin haber sido tocados** (ver diff abajo).

Los dos archivos nuevos, aislados:

```
npx vitest run test/service-snapshot.test.ts    → Test Files 1 passed · Tests 5 passed (5)
npx vitest run test/service-delete-gate.test.ts → Test Files 1 passed · Tests 7 passed (7)
```

## El write-path no cambio (Tarea 3b) — diff completo de la fase

`git diff --name-only 10a5490^ HEAD` (base de la fase = `6e7667b`, ultimo commit antes del 13-01):

```
.planning/workstreams/motor-reservas/REQUIREMENTS.md
.planning/workstreams/motor-reservas/ROADMAP.md
.planning/workstreams/motor-reservas/STATE.md
.planning/workstreams/motor-reservas/phases/13-.../13-01-SUMMARY.md
.planning/workstreams/motor-reservas/phases/13-.../13-02-SUMMARY.md
.planning/workstreams/motor-reservas/phases/13-.../13-03-SUMMARY.md
app/(dashboard)/abonos/abonos-client.tsx
app/(dashboard)/abonos/page.tsx
app/(dashboard)/appointments/appointments-client.tsx
app/(dashboard)/clients/clients-client.tsx
app/(dashboard)/dashboard/page.tsx
app/(dashboard)/finances/finances-client.tsx
app/(dashboard)/settings/settings-client.tsx
app/api/export/finances/route.ts
components/crm/confirm-dialog.test.tsx
components/crm/confirm-dialog.tsx
lib/appointment-service.ts
lib/canchas.ts
lib/types.ts
supabase/migrations/065_service_snapshot_and_delete_gate.sql
supabase/schema.sql
test/appointment-service.test.ts
test/service-delete-gate.test.ts
test/service-snapshot.test.ts
```

| Criterio | Resultado |
|----------|-----------|
| `lib/booking-core.ts` en el diff | **NO** |
| Alguna ruta bajo `app/api/booking/` | **NO** |
| `app/api/appointments/create/route.ts` | **NO** |
| `test/concurrency.test.ts` | **NO** |
| `test/booking-public-regression.test.ts` | **NO** |
| `test/booking-core.test.ts` | **NO** |
| `test/manual-booking.test.ts` | **NO** |
| `test/abono-generation.test.ts` | **NO** |
| `test/canchas-booking.test.ts` | **NO** |

Los tres unicos archivos de `test/` que aparecen son **nuevos** (`appointment-service.test.ts` del 13-02 y los dos de este plan). **Cero tests preexistentes modificados en toda la fase** — que es el criterio operativo de D-02 y la mitigacion de T-13-23.

Las 24 rutas se reparten asi: 6 de `.planning/` (documentacion del propio workflow), 9 read-paths de historial (13-02), 4 de UX del borrado (13-03), 2 de base (13-01) y 3 tests nuevos.

## Copy de sede / cancha: verificado, NO editado (Tarea 3c)

El Folded Todo del CONTEXT (re-hacer los toasts de sede, profesional y cancha) **ya estaba cerrado** por el commit `8e34b00` del 2026-07-27, y `REQUIREMENTS.md §Out of Scope` lo declara fuera de alcance. Confirmado por grep, sin tocar un solo caracter:

```
grep -c "incluidos pasados y cancelados" "app/(dashboard)/settings/settings-client.tsx"  → 2   (sede + profesional)
grep -c "incluidos pasados y cancelados" components/dashboard/canchas-manager.tsx        → 1   (cancha)
```

## Tipos y lint (Tarea 3d)

| Comando | Resultado |
|---------|-----------|
| `./node_modules/.bin/tsc --noEmit` | **exit 0** |
| `npx eslint test/service-snapshot.test.ts test/service-delete-gate.test.ts` | **exit 0**, cero hallazgos |
| `npm run lint` (repo entero) | exit 1 — 588 problemas (457 errores / 131 warnings) |

**`npm run lint` en exit 0 no es alcanzable en este repo** y no lo causa esta fase: 427 de los 457 errores son `@typescript-eslint/no-require-imports` sobre los bundles de `.claude/` (tooling de GSD, no codigo de la app), y el resto son `no-unused-vars` preexistentes. Se verifico lo que si es responsabilidad de este plan: **los dos archivos nuevos pasan eslint limpios**. Es la misma lectura que registra el baseline del workstream.

## Deviaciones del plan

Ninguna deviacion de comportamiento. Tres ajustes, los tres para cumplir criterios del propio plan o para no heredar los flakes conocidos:

**1. [Forma] Cada caso del snapshot crea su propio turno en vez de encadenarse.**
El plan describia el caso 2 como "tras el caso 1, actualizar el servicio y releer *ese* turno". Se escribio auto-contenido (crea su turno a las 09:30 y despues actualiza el servicio). Prueba exactamente lo mismo — que un `UPDATE` posterior no toca un snapshot ya escrito — y no se cae si vitest reordena o si el caso 1 falla.

**2. [Forma] Timeout explicito de 20000 ms por caso.**
El default de vitest es 5000 ms y el baseline documentado del workstream tiene flakes justamente por eso (`Test timed out in 5000ms` en los abonos). Los casos nuevos hacen entre 3 y 6 round-trips a la DB local; 20000 ms los saca del rango de riesgo sin ocultar un cuelgue real. No se toco `vitest.config.mts` (habria cambiado el timeout de toda la suite).

**3. [Forma] La cabecera de `service-snapshot.test.ts` no repite el literal `describe.skipIf`.**
El criterio de aceptacion exige `grep -c "describe.skipIf"` **exactamente 1**, y el comentario explicativo lo hacia dar 2. Se reformulo la prosa ("Sin las creds de Supabase el bloque entero se skipea"): el contenido documental esta, el conteo da 1.

**Fechas fijas en vez de "manana":** el plan pedia el caso 1 del gate con `date` de manana. Se usa `2031-03-03` (y `2020-03-02` para el pasado), que es la convencion del resto de la suite: ejerce la misma rama del trigger sin depender del reloj ni del huso del runner. No se cuenta como deviacion de comportamiento — la frontera `date >= hoy AR` queda igualmente probada por los dos lados.

## Contaminacion de la DB local: como se evito sumar mas

Los dos archivos nuevos siguen la disciplina del helper:

- Tenant propio por archivo con prefijo unico por corrida (`__test_<uuid8>`), asi que dos corridas simultaneas no colisionan.
- `teardownOneTenant` en `afterAll` (borra el business, que cascadea, y despues el usuario auth).
- `afterEach` que limpia los turnos del tenant en el archivo de snapshot.
- Ningun `count`/`select` asume tabla vacia: todas las aserciones filtran por el id concreto de la fila sembrada.
- El caso de cascada borra su propio business dentro del test y limpia el usuario auth en un `finally`.

## Verificacion

| # | Criterio del plan | Resultado |
|---|-------------------|-----------|
| 1 | `npx vitest run test/service-snapshot.test.ts` → 5/5 | OK (exit 0, 0 skipped) |
| 2 | `npx vitest run test/service-delete-gate.test.ts` → 7/7 | OK (exit 0, 0 skipped) |
| 3 | `npm test` con total mayor al de antes de la fase | OK: 828 vs 816 (+12) |
| 4 | `tsc --noEmit` exit 0 | OK |
| 4b | `npm run lint` exit 0 | Parcial: no alcanzable en el repo (baseline de 457 errores en `.claude/`); los dos archivos nuevos pasan limpios |
| 5 | El diff de la fase no toca el write-path ni ningun test preexistente | OK (tabla arriba) |

Criterios de aceptacion por grep:

| Archivo | Patron | Esperado | Real |
|---------|--------|----------|------|
| snapshot | `describe.skipIf` | 1 | 1 |
| snapshot | `teardownOneTenant` | >= 1 | 3 |
| snapshot | `createAppointmentCore` | >= 1 | 5 |
| snapshot | `seedOneTenant` | >= 2 | 3 |
| snapshot | `service_price` | >= 4 | 5 |
| gate | `service_has_future_appointments` | >= 3 | 3 |
| gate | `service_has_active_abono` | >= 1 | 2 |
| gate | `P0001` | >= 3 | 7 |
| gate | `status: null` | >= 1 | 1 |
| gate | `from('businesses').delete` | >= 1 | 1 |

## Notas para la proxima fase

- **13-05 (aplicacion a prod) es lo unico que queda.** Prod sigue en la **064**. Estos tests corren contra el local: cuando la 065 se aplique a mano, conviene re-correr los dos archivos apuntando al entorno donde se aplico (o al menos repetir a mano el caso 1 y el caso 4 del gate) antes de dar la migracion por buena.
- **El `NOTIFY pgrst, 'reload schema';` no es opcional.** Estos tests pasan en local porque PostgREST ya vio las columnas nuevas. En prod, sin el NOTIFY, los read-paths de 13-02 van a pedir `service_name` sobre un schema cache viejo y responder 400.
- **T-13-03 sigue en `accept`** (no hay trigger `BEFORE UPDATE` sobre el snapshot: un dueno puede editar el `service_name`/`service_price` de sus propios turnos por PostgREST). Estos tests **no** lo cubren a proposito — cubrir un riesgo aceptado con un test lo convertiria en un contrato que nadie decidio asumir. Queda para secure-phase.
- **Los flakes de abonos siguen ahi** y no son de esta fase. Si alguien los ataca, la pista esta en que `--no-file-parallelism` los pone verdes: es estado compartido en la DB local entre `abono-create`, `abono-cron` y `abono-generation`.

## Threat Flags

Ninguna superficie de seguridad nueva. Este plan no agrega codigo de produccion: agrega dos archivos de test que corren contra el Supabase local. T-13-22 (correr contra el Supabase equivocado) quedo mitigada y **verificada**: la URL usada esta registrada arriba y es `127.0.0.1`.

## Self-Check: PASSED

- `test/service-snapshot.test.ts` — FOUND
- `test/service-delete-gate.test.ts` — FOUND
- Commit `409cb13` — FOUND
- Commit `bd1335c` — FOUND
