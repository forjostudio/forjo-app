---
quick_id: 260912-pm1
phase: quick
plan: "01"
subsystem: onboarding + panel + motor de reservas
status: complete
tags: [g-21-11, formularios, invariante, migracion-077, book_slot_atomic]

requires:
  - lib/agenda-hours-payload.ts (buildSaveHoursPayload)
  - lib/time-block-services.ts (hasScheduleCoverage)
  - migr. 076 (REVOKE EXECUTE de book_slot_atomic a anon — se preserva)
provides:
  - "lib/onboarding-agenda.ts: DEFAULT_SERVICE_MINUTES / normalizeServiceDuration / normalizeServicePrice / buildServiceRows"
  - "supabase/migrations/077_duration_invariant.sql: services_duration_positive + appointments_duration_positive + guard de p_duration"
affects:
  - "app/(onboarding)/onboarding/page.tsx"
  - "components/dashboard/canchas-manager.tsx"
  - "app/(dashboard)/settings/settings-client.tsx"
  - "lib/canchas.ts"
  - "supabase/schema.sql"

tech-stack:
  added: []
  patterns:
    - "texto crudo en el estado del formulario, coerción en el borde del payload"
    - "normalizar antes de restringir, en la misma transacción (molde 061/065/075)"
    - "extracción programática de una función SECURITY DEFINER en vez de transcripción"

key-files:
  created:
    - supabase/migrations/077_duration_invariant.sql
    - test/service-duration-invariant.test.ts
  modified:
    - lib/onboarding-agenda.ts
    - test/onboarding-agenda.test.ts
    - app/(onboarding)/onboarding/page.tsx
    - components/dashboard/canchas-manager.tsx
    - lib/canchas.ts
    - test/canchas-provision.test.ts
    - app/(dashboard)/settings/settings-client.tsx
    - supabase/schema.sql

decisions:
  - "La coerción vive en un módulo puro compartido por las TRES superficies, no en cada componente: el runner corre con environment 'node' y no puede renderizar un client component, así que un fallback dentro de un componente nunca se ejercita."
  - "Vaciar un campo NO es entrada degenerada: vuelve al default sin aviso. Tipear 0 o un negativo SÍ lo es: se corrige a la vista Y avisa. Antes las dos cosas daban error, y ese error trababa 'Agregar servicio' por vaciar una celda."
  - "El CHECK de services es `> 0`, no `>= 5`: el 5 es un mínimo de UI y subirlo a la base podría rechazar filas legítimas de prod que esta sesión no pudo medir."
  - "El CHECK de appointments queda NOT VALID y el NULL sigue siendo legal: los seis chequeos de solape dependen de COALESCE(duration_minutes, 30), y reescribir rangos históricos puede chocar contra el EXCLUDE (lección D-03 de v0.27)."
  - "book_slot_atomic NO se transcribió: se extrajo de schema.sql y se le insertaron sólo las líneas del guard, con un assert de cero líneas eliminadas."

metrics:
  duration: 18min
  completed: 2026-09-12

actuals:
  tokens: 17000
  tasks: 5
  commits: 5
plan_head_before: 5896e5b3a989a3d16d8089d117cb40862858cf62
---

# Quick 260912-pm1: Inputs numéricos vaciables + la invariante de duración en la base

Los campos Min. y Precio se vacían con el teclado en las tres superficies que escriben `services`, y la regla "un servicio dura más de 0 minutos" deja de vivir en la memoria de cada formulario para vivir en Postgres.

## Qué se hizo

| # | Tarea | Commit | Archivos |
|---|-------|--------|----------|
| 1 | Normalizadores + `buildServiceRows` en el módulo puro (TDD) | `9b63dbf` | `lib/onboarding-agenda.ts`, `test/onboarding-agenda.test.ts` |
| 2 | El paso 2 del alta guarda texto crudo | `f41a2c4` | `app/(onboarding)/onboarding/page.tsx` |
| 3 | Canchas: Duración vaciable + guard fail-closed | `9d3d8e1` | `components/dashboard/canchas-manager.tsx`, `lib/canchas.ts`, `test/canchas-provision.test.ts` |
| 4 | Ajustes → Servicios: los dos formularios | `4b0f3b7` | `app/(dashboard)/settings/settings-client.tsx` |
| 5 | Migración 077 + espejo de `schema.sql` + test DB-backed | `b4c408e` | `supabase/migrations/077_duration_invariant.sql`, `supabase/schema.sql`, `test/service-duration-invariant.test.ts` |

## El hallazgo: el doble-booking silencioso quedó MEDIDO, no argumentado

El plan afirmaba que `p_duration = 0` arma un `tsrange` vacío que no solapa con nada y hace pasar los seis gates anti-doble-booking. Se midió contra el Postgres local, revirtiendo las dos piezas de la 077 (función sin guard, `appointments` sin su CHECK), con un turno `confirmed` de 60 minutos sembrado a las 14:00:

```
book_slot_atomic(..., p_time => '14:30', p_duration => 0)
  NOTICE:  RPC DEVOLVIO TURNO: 77e0dd6f-89d4-4f7b-bcc8-96dc1c879e10
  NOTICE:  FILAS INTRUSAS CREADAS ENCIMA DEL TURNO DE 14:00: 1
```

Turno creado encima de otro, cero errores. **T-Q11-03 es real, no teórico.**

El mismo experimento corrigió una imprecisión del plan que había pasado al test: revirtiendo **sólo** la función (dejando el CHECK de `appointments`), el 0 igual rebota — pero con un error crudo de Postgres y después de haber tomado los locks. O sea, las dos piezas de la 077 se solapan a propósito: el guard es el que falla temprano y con un código legible (`invalid_duration`), y el CHECK es la segunda red. El comentario del test se reescribió para decir eso, con los números.

## Verificación

| Gate | Resultado |
|------|-----------|
| `npx vitest run` | **88 files · 1154 passed · 4 expected fail · 1 skipped** (baseline: 87/1126 — +1 file, +28 tests) |
| `./node_modules/.bin/tsc --noEmit` filtrado por `^\.next/` | **0 errores** |
| `supabase db reset` | baseline + 001..077 sin un solo error |
| Gate de identidad `schema.sql` ↔ migración 077 | **idénticas carácter por carácter** |
| Suites del motor tras el reset (7 archivos) | 81 passed, `book-slot-atomic-anon-revoke` incluido (el REVOKE de la 076 sigue en pie tras el `CREATE OR REPLACE`) |
| `npx eslint` sobre los archivos tocados | sin errores nuevos (los 11 de `settings-client.tsx` y los 2 de `onboarding/page.tsx` son pre-existentes, todos `react-hooks/*` en líneas que este plan no tocó) |

**Pruebas de mutación** (ninguno de los dos guards es un no-op disfrazado):
- Comentando el guard de `lib/canchas.ts`: **6 casos rojos**, restaurado → 30 verdes.
- Revirtiendo el guard del RPC: **2 casos rojos** aunque la fila siga sin crearse (el test distingue las dos capas por el mensaje).

Constraints verificadas en el Postgres local:
```
 services_duration_positive     | CHECK ((duration_minutes > 0))                                           | validated
 appointments_duration_positive | CHECK (((duration_minutes IS NULL) OR (duration_minutes > 0))) NOT VALID | not validated
```

## Deviaciones del plan

**1. [Corrección de un hecho del plan] El test de la Tarea 5 no podía afirmar lo que afirmaba.**
El plan pedía un test cuyo comentario dijera "sin el guard, la llamada devuelve un turno creado y ningún error". Medido, eso es cierto sólo **antes de la 077 completa**: con el CHECK de `appointments` puesto, quitar el guard produce un rechazo (crudo, tardío) en vez de un turno. El comentario se reescribió con la medición real y con la diferencia entre las dos capas. La aserción sobre `invalid_duration` no se debilitó — es justamente lo que distingue el guard del CHECK.

**2. [Rule 3 - Bloqueante, autocorregido] Ejecuté `git stash` por error durante la Tarea 4** al encadenar un comando de lint. La rama no es un worktree y el stash era el único de la pila, creado sobre mi propio commit segundos antes; aun así es un comando prohibido. Recuperación: se re-corrió el script determinístico de la Tarea 4, se verificó con `git diff stash@{0} -- <archivo>` que el resultado era **byte-idéntico** a lo stasheado (diff vacío), y recién ahí se descartó la entrada para no dejar basura en la pila compartida del usuario. **Cero pérdida.** Queda registrado porque el modo de falla (encadenar un comando destructivo detrás de uno inocuo) es el que importa, no el resultado.

Fuera de eso, el plan se ejecutó como estaba escrito: los 11 sitios autorizados de la Tarea 2, los 10 de la Tarea 3 y los 12 de la Tarea 4 se aplicaron sobre los anclajes exactos (cada reemplazo con `assert count == 1`, ningún match ambiguo).

## Anotado para después (out of scope, del propio plan)

- **Renombrar `lib/onboarding-agenda.ts`.** Desde este plan lo consumen tres superficies y ya no sólo el alta. El rename toca imports de varias pantallas; queda pendiente, tal como el plan lo dejó decidido.
- El precio negativo en Ajustes mantiene el comportamiento actual (se guarda).
- `VALIDATE CONSTRAINT` sobre `appointments` queda pendiente de medir prod.

## Pendiente de UAT (los `human-check` de las tareas 2, 3 y 4)

El runner corre con `environment: 'node'`: **no hay DOM, así que la parte de teclado —que es literalmente la queja del usuario— no está probada automáticamente.** Se probó en sus bordes duros (el módulo puro y la base). Falta, con `npm run dev` contra el Supabase local:

1. **Alta, paso 2:** borrar Min. con el teclado → la celda queda vacía mientras se escribe (hoy el 30 volvía solo con cada tecla); al salir muestra 30 sin texto rojo. Escribir 0 y salir → muestra 5 con el aviso inline. Borrar Precio → queda vacío; al salir muestra 0. Completar nombre + 45 min + 8000 y finalizar → el servicio queda con esos valores **y los horarios del paso 4 no se pierden**.
2. **Panel de canchas** (negocio vertical canchas): borrar Duración en "Agregar cancha" → la celda queda vacía (hoy vuelve a 0); agregar sin duración → toast "La duración debe ser mayor a 0". Editar una cancha, borrar Duración, escribir 90, guardar → queda en 90.
3. **Ajustes → Servicios** (negocio que no sea canchas): borrar Duración en el alta → celda vacía; al salir muestra 30; guardar → 30 min (hoy el guardado muere con "Error"). En edición, borrar Duración → 30; escribir 0 → 5; guardar → queda en 5, no en 0.

## Runbook de deploy (el orden NO es libre)

1. **Primero el código** (commits `9b63dbf`..`4b0f3b7`). Deja de existir un formulario capaz de escribir 0 o `NaN`.
2. **Después la 077**, a mano, en el SQL editor de Supabase, **completa y de una sola vez** (es `BEGIN`/`COMMIT`, idempotente y sin nada destructivo). Última migración en prod: **076**.
3. Verificar con la query de `pg_constraint` de la cabecera (debe dar **dos** filas) y con `SELECT count(*) FROM services WHERE duration_minutes <= 0` (debe dar **0**).

Al revés no hay pérdida de datos, pero durante la ventana el panel viejo puede mandar un 0 y comerse un rechazo crudo del CHECK con un toast genérico. Es la lección de la 068 y está escrita también en la cabecera del archivo.

⚠ `supabase/schema.sql` ya está espejado (quirúrgico, nunca `db dump`) porque la migración se aplicó y verificó en local. Contra producción sigue pendiente de aplicar.

## Known Stubs

Ninguno. El scan de `lib/onboarding-agenda.ts`, `lib/canchas.ts`, la migración y el test nuevo no encontró valores vacíos hardcodeados, texto placeholder ni componentes sin fuente de datos.

## Threat Flags

Ninguna superficie de seguridad nueva fuera del `<threat_model>` del plan: no se agregaron endpoints, vistas ni policies, no se tocó ningún filtro por `business_id`, y no se instaló ningún paquete. La única función `SECURITY DEFINER` modificada conserva firma, `search_path`, owner y permisos byte-idénticos (verificado por el gate de identidad y por `book-slot-atomic-anon-revoke` en verde).

## Self-Check: PASSED

Archivos declarados como creados, verificados en disco:
- `supabase/migrations/077_duration_invariant.sql` — FOUND
- `test/service-duration-invariant.test.ts` — FOUND

Commits declarados, verificados en `git log`: `9b63dbf`, `f41a2c4`, `9d3d8e1`, `4b0f3b7`, `b4c408e` — los cinco FOUND.

`commits: 5` es MEDIDO con `git rev-list --count 5896e5b..HEAD`, no narrado.
