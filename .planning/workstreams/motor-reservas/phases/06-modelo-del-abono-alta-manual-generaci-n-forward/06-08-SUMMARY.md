---
phase: 06-modelo-del-abono-alta-manual-generaci-n-forward
plan: 08
subsystem: security
tags: [typescript, postgres, supabase, dos, rate-limit, migration, gap-closure, abonos, cron]

# Dependency graph
requires:
  - phase: 06-02-motor-generacion
    provides: "lib/abono-generation.ts (motor de generación forward) y su guarda de rango"
  - phase: 06-03-alta-manual
    provides: "app/api/abonos/create/route.ts — primera tanda de generación acotada por la ventana"
  - phase: 06-04-cron-rolling
    provides: "extendAbonoWindows() en app/api/cron/cancel-expired/route.ts — la corrida diaria compartida"
  - phase: 06-05-ui-abonos
    provides: "el control de ventana (input numérico + saveWindow) en app/(dashboard)/abonos/abonos-client.tsx"
provides:
  - "clampWindowWeeks(): la ventana de generación queda SIEMPRE en 1..52 (default 8) en los dos callers server-side — ningún caller usa el valor crudo de businesses.abono_window_weeks"
  - "Motor a prueba de loop infinito: valida el formato yyyy-MM-dd de fromDate/toDate (devuelve vacío si no matchea) + MAX_OCCURRENCES_PER_RUN=520 como tope duro de iteraciones"
  - "Migración 055: normaliza los valores fuera de rango (LEAST/GREATEST) y DESPUÉS crea el CHECK businesses_abono_window_weeks_range (1..52, permite NULL)"
  - "Input de la ventana acotado a 1..52 en el panel (max, clamp del stepper y del onChange, toast con el rango)"
affects: [07-cancelacion-serie]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Defensa en profundidad de 3 capas para un valor owner-writable que dimensiona un loop: clamp en el caller (la corrección real) + backstop en el motor + CHECK en la DB; el servidor NUNCA confía en la columna aunque la DB valide"
    - "Validar el FORMATO de una fecha-string antes de compararla: un string-compare ('2026-07-21' > 'NaN-NaN-NaN' = false) es una guarda falsa cuando el otro lado puede degenerar"
    - "Tope duro de iteraciones separado del tope de negocio: maxCreated cuenta turnos CREADOS (no corta si todo choca); el contador de ocurrencias RECORRIDAS es el que garantiza terminación"
    - "Migración que agrega un CHECK sobre datos sucios: UPDATE de normalización PRIMERO (LEAST/GREATEST preserva la intención) y ADD CONSTRAINT DESPUÉS — al revés la constraint no se puede crear"
    - "Helpers file-local duplicados a propósito entre los dos callers (como SKIPPED_CAP / toISODate / countAbonoAppointments) con un comentario que obliga a mantener la semántica idéntica"

key-files:
  created:
    - supabase/migrations/055_abono_window_bounds.sql
  modified:
    - app/api/abonos/create/route.ts
    - app/api/cron/cancel-expired/route.ts
    - lib/abono-generation.ts
    - app/(dashboard)/abonos/abonos-client.tsx
    - supabase/schema.sql
    - test/abono-generation.test.ts

key-decisions:
  - "La corrección REAL es el clamp server-side en los dos callers, no el CHECK de la DB: la constraint es defensa en profundidad (una fila vieja, un import o un cambio futuro de constraint no puede reabrir el agujero)"
  - "Techo = 52 semanas (1 año de anticipación). Más que eso no es un caso de uso de agenda, es abuso; y 52 ocurrencias por corrida queda 10x por debajo del tope duro del motor"
  - "Fuera de rango NO es error en el server: se clampea (>52 → 52) o se cae al default (<1 o no finito → 8). El dueño igual genera su serie; rechazar habría roto el alta por un valor de config"
  - "El motor devuelve { created: [], skipped: [] } ante un rango inválido en vez de lanzar: los dos callers son best-effort (el alta ya insertó la fila del abono; el cron itera todos los tenants) y un throw rompería flujos que deben degradar limpio"
  - "MAX_OCCURRENCES_PER_RUN = 520 (10 años de semanas): backstop puro que con la ventana clampeada nunca se alcanza, así que no cambia la semántica de ningún rango sano"
  - "La normalización de la 055 usa LEAST/GREATEST en vez de resetear a 8: clampea preservando la intención del dueño (5000 → 52, -5 → 1)"
  - "NO se agregó la FK compuesta (business_id, abono_id) sobre appointments (UF-02 de la auditoría): tabla caliente con constraints 011/013 y hoy ninguna lectura cruza tenants — DIFERIDO y anotado en la cabecera de la 055"
  - "La 054 NO se editó: ya está aplicada en producción (2026-07-21). Todo cambio posterior es una migración nueva numerada"

requirements-completed: []

# Metrics
duration: 22min
completed: 2026-07-21
status: complete
---

# Phase 6 Plan 08: Cierre de GAP-01 — ventana del abono acotada Summary

**`businesses.abono_window_weeks` era owner-writable sin techo en ninguna capa y dimensionaba el loop del motor DENTRO del único cron diario compartido por todos los tenants: con `999999` eran ~1.000.000 de iteraciones y con `2147483647` el `toDate` degeneraba a `'NaN-NaN-NaN'`, la guarda `fromDate > toDate` (comparación de STRINGS) no disparaba y el loop no terminaba. Se cerró en 3 capas: `clampWindowWeeks()` a 1..52 en los dos callers server-side (la corrección real), validación de formato + `MAX_OCCURRENCES_PER_RUN=520` en el motor (última línea), y la migración 055 que normaliza los valores existentes y después crea el CHECK. `supabase db reset` limpio, tsc + eslint limpios, 649 tests en verde (+2 nuevos).**

## Performance

- **Duration:** ~22 min
- **Started:** 2026-07-21T14:12Z
- **Completed:** 2026-07-21T14:34Z
- **Tasks:** 4 (5 commits — Task 2 se hizo con split RED/GREEN)
- **Files created:** 1 · **Files modified:** 6

## Accomplishments

- **Ningún caller usa ya el valor crudo de la columna.** Los dos `Number(business.abono_window_weeks) || 8` (que sólo cubrían `0`/`NaN`/`null`, jamás un número enorme) pasaron a `clampWindowWeeks()`, con semántica idéntica en los dos archivos: `Math.trunc(Number(raw))`; no finito o `< 1` → **8**; `> 52` → **52**. Verificado por grep: las únicas apariciones de `abono_window_weeks` en los dos routes son el `.select()` y comentarios.
- **El motor no puede loopear sin fin con NINGUNA entrada.** Se agregó (1) validación de formato `/^\d{4}-\d{2}-\d{2}$/` sobre `fromDate`/`toDate` con salida inmediata `{ created: [], skipped: [] }` — esto mata la clase entera de fechas degeneradas, no sólo el `'NaN-NaN-NaN'` conocido; y (2) un contador de ocurrencias **recorridas** con corte en `MAX_OCCURRENCES_PER_RUN = 520`, independiente de `maxCreated` (que cuenta turnos *creados* y por eso no corta cuando todo choca).
- **La DB rechaza el valor fuera de rango, con los datos existentes normalizados antes.** La 055 hace `UPDATE ... LEAST(GREATEST(x,1),52)` y **después** crea `businesses_abono_window_weeks_range`. El orden es obligatorio: `ADD CONSTRAINT` valida las filas existentes y la DB local tenía persistidos los 5000 / 999999 / 2147483647 de las sondas de la auditoría.
- **El panel ya no deja escribir fuera de rango.** `max={52}`, clamp en el `onChange` y en los dos botones del stepper (el `+` se deshabilita en el tope, como ya hacía el `−` en el piso), validación con toast explícito en `saveWindow` y una línea de ayuda con el rango.

## Task Commits

| Task | Nombre | Commit | Archivos |
| ---- | ------ | ------ | -------- |
| 1 | Clamp server-side en los dos callers | `3b7a74e` | `app/api/abonos/create/route.ts`, `app/api/cron/cancel-expired/route.ts` |
| 2 (RED) | Tests del motor sin acotar | `7788fa0` | `test/abono-generation.test.ts` |
| 2 (GREEN) | Motor: formato válido + tope duro | `80a0097` | `lib/abono-generation.ts` |
| 3 | Migración 055 (normalizar + CHECK) | `043f819` | `supabase/migrations/055_abono_window_bounds.sql`, `supabase/schema.sql` |
| 4 | Tope 1..52 en el input de la UI | `91cbdb3` | `app/(dashboard)/abonos/abonos-client.tsx` |

## Implementation Notes

### Por qué la guarda vieja no servía (y por qué la nueva sí)

Los callers arman las fechas con un `toISODate` manual (`getFullYear()`/`getMonth()`/`getDate()` +
`padStart`), así que un `Date` inválido **no lanza**: produce literalmente la cadena `'NaN-NaN-NaN'`.
La única guarda del motor era `if (fromDate > toDate) return`, una comparación de **strings**:
`'2026-07-21' > 'NaN-NaN-NaN'` es `false` (porque `'2'` < `'N'`), así que no disparaba, `date <= toDate`
era true para toda fecha real y el `for` iteraba para siempre haciendo 2 queries por vuelta. Validar el
formato **antes** de comparar convierte el string-compare en una guarda confiable (los dos lados ya son
`yyyy-MM-dd`), y el tope de iteraciones cubre lo que la validación de formato no puede prever.

### El try/catch del cron no era una mitigación

`extendAbonoWindows` procesa cada abono en su propio `try/catch` (T-06-17), pero **un try/catch no
interrumpe un loop infinito**: un solo abono con la ventana degenerada colgaba la corrida entera y los
abonos de todos los demás negocios nunca se extendían. Por eso el clamp va **antes** de calcular el
rango, no como manejo de error después.

### RED verificado antes del fix (TDD en Task 2)

Con el motor sin tope, el test del rango de 50 años dio exactamente lo esperado:

```
AssertionError: expected 2610 to be 520
```

Los dos tests nuevos:

- **caso 7** — 7 combinaciones de rango inválido (incl. `[FROM, 'NaN-NaN-NaN']`, que es el caso
  explotable) → `{ created: [], skipped: [] }` y 0 turnos en la DB.
- **caso 8** — rango de 50 años (~2609 lunes) → corta en 520. Usa el `service_id` de OTRO tenant para
  que el core corte en `invalid_service` con una sola query y sin insert: el tope se cuenta barato
  (el test entero pasó de 45 s en RED a ~1 s en GREEN) y no se materializan 520 turnos reales.

### Migración 055 — evidencia de la sonda

Se simuló el estado pre-055 en la DB local (constraint dropeada + filas con `999999`, `2147483647`,
`-5` y `NULL`) y se aplicó la migración:

```
UPDATE 3 / DO
POST-055: -5 → 1 · 999999 → 52 · 2147483647 → 52 · NULL → NULL (intacto)
CHECK (((abono_window_weeks IS NULL) OR ((abono_window_weeks >= 1) AND (abono_window_weeks <= 52))))
```

Re-aplicarla es no-op (`UPDATE 0` + el `DO` block no recrea la constraint). Con la constraint puesta,
PostgREST rechaza `999999`, `2147483647`, `0`, `-5` y `53` con `23514`, y acepta `1`, `8`, `52` y `NULL`.

**Aplicación en prod:** la 055 **NO** se aplica por push. Va a mano coordinada con el deploy, seguida de
`NOTIFY pgrst, 'reload schema';`. La 054 quedó **byte-idéntica** (`git diff --name-only` no la lista).

## Deviations from Plan

Ninguna — el plan se ejecutó tal cual está escrito. Dos precisiones de implementación dentro del alcance
declarado de la Task 4 (el plan pedía "clampear en el handler" y "actualizar el texto de ayuda"):

- El botón `+` del stepper también se deshabilita en 52 y recibió las clases `disabled:` que ya tenía el
  `−`; sin eso el stepper podía empujar el valor por encima del máximo y el `max` del input no lo frenaba
  (el `max` de un `<input type="number">` sólo aplica a la entrada del usuario, no a un `setState`).
- La línea de ayuda con el rango se puso **debajo del control** (proximidad) en vez de dentro del
  párrafo descriptivo de la card.

## Threat Model Coverage

| Threat ID | Disposición | Cómo quedó cubierto |
|-----------|-------------|---------------------|
| T-06-08 | mitigate | Validación de formato + `MAX_OCCURRENCES_PER_RUN` en `lib/abono-generation.ts` → ningún rango, válido o degenerado, puede loopear sin fin (test 7 y 8) |
| T-06-17 | mitigate | `clampWindowWeeks()` en `app/api/cron/cancel-expired/route.ts` → un tenant no puede degradar la corrida diaria compartida |
| T-06-24 | mitigate | El rango por corrida queda acotado por el clamp (≤52 ocurrencias) y, en el peor caso, por el tope duro del motor |
| T-06-28 | mitigate | CHECK `businesses_abono_window_weeks_range` (migr. 055) tras normalizar los valores existentes |

Sin banderas de superficie nueva: no se agregaron endpoints, rutas, accesos a archivos ni cambios de
esquema en fronteras de confianza (el único DDL es un CHECK sobre una columna ya existente).

## Deferred / Anotado

- **UF-02 — FK compuesta `(business_id, abono_id)` sobre `appointments`:** DIFERIDA por decisión del plan.
  `appointments` es una tabla caliente con el índice único 011 y la exclusion constraint 013, y hoy
  ninguna lectura cruza tenants (el motor filtra toda query por `business_id`). Queda anotado en la
  cabecera de la 055.
- **Aplicar la 055 en producción a mano** + `NOTIFY pgrst, 'reload schema';` al deployar.

## Verification

- `npx supabase db reset` → replay limpio del baseline + `040..055`.
- `npx tsc --noEmit` → limpio.
- `npx eslint` sobre los 4 archivos tocados + `app/(dashboard)/abonos` → limpio.
- `npx vitest run --no-file-parallelism` → **50 archivos · 649 pass · 1 skip** (el baseline de la
  auditoría era 647 pass · 1 skip; los 2 nuevos son los casos 7 y 8 del motor).
- `grep abono_window_weeks` en los dos routes → sólo `.select()` y comentarios; ningún uso crudo.
- `git diff --name-only -- supabase/migrations/054_abonos.sql` → **vacío** (054 intacta).

## Self-Check: PASSED
