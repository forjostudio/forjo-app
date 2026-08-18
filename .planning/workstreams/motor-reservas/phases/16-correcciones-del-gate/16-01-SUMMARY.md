---
phase: 16-correcciones-del-gate
plan: 01
subsystem: database
tags: [postgres, plpgsql, triggers, rls, multi-tenant, gates, migrations, supabase]

requires:
  - phase: 15-modelo-de-cupo-unificado
    provides: "services_block_mode_change (migr. 068) y el modelo de cupo unificado en services.capacity"
  - phase: 13-borrado-e-historial
    provides: "services_block_delete (migr. 065), el snapshot de nombre de servicio y el fix del gap G4 en la UI"
provides:
  - "Migración 070: las tres correcciones (GATE-01, GATE-02, GATE-03) en una sola redefinición de los dos gates de servicio"
  - "El gate de cambio de modo deja pasar la única dirección segura (salir de 'individual') y sigue rechazando las dos peligrosas"
  - "Los dos predicados de gate divergen a propósito en el conjunto de estados, con la decisión escrita en el archivo y en schema.sql"
  - "Los dos gates comparan fecha Y hora contra el inicio del turno, alineados con isPastAppointment"
  - "16-BASELINE-070.md: control negativo A/B de los ocho casos, medidos antes y después contra el Postgres local"
affects: [16-02, 17-superficie, secure-phase, runbook-070]

tech-stack:
  added: []
  patterns:
    - "Control negativo A/B con el MISMO script antes y después del cambio, y la evidencia devuelta como FILAS (no NOTICE)"
    - "Verificación por instalación sobre pg_proc.prosrc, no sobre el archivo: los comentarios del cuerpo también viven en prosrc"
    - "Divergencia deliberada entre dos predicados hermanos, sostenida con un testigo medido por lado"

key-files:
  created:
    - supabase/migrations/070_service_gates_direction_and_time_precision.sql
    - .planning/workstreams/motor-reservas/phases/16-correcciones-del-gate/16-BASELINE-070.md
  modified:
    - supabase/schema.sql
    - lib/appointment-time.ts
    - lib/types.ts

key-decisions:
  - "El criterio de dirección de GATE-01 es NOMINAL (OLD.capacity_mode = 'individual'), no numérico (capacity <= 1): un gate no debe depender del CHECK de coherencia de la 068 para ser correcto"
  - "Los dos gates NO comparten una función auxiliar: la 070 es exactamente la migración que los hace divergir, así que extraer el predicado sería el peor momento posible"
  - "Los triggers no se dropean ni se recrean: CREATE OR REPLACE conserva el binding y recrearlos es riesgo gratis"
  - "Ningún código de dominio se renombra ni se agrega: el copy del panel sigue siendo cierto después del recorte, así que la fase no toca un solo .tsx"
  - "La 070 NO se aplica a producción dentro de la fase (D-08): queda el archivo, el runbook lo escribe 16-02"

patterns-established:
  - "Guard de medianoche en los repro que dependen de la hora: fuera de [01:00, 23:30] AR el script aborta en vez de medir lo contrario de lo que dice medir"
  - "Anti-falso-verde doble en repro SQL: ROW_COUNT por intento + un caso 0 que cuenta el fixture"
  - "El predicado de fecha/hora en SQL replica el INICIO del turno, nunca el fin, para no desalinear la base respecto de lib/appointment-time.ts"

requirements-completed: [GATE-01, GATE-02, GATE-03]

duration: 15min
completed: 2026-08-18
status: complete
---

# Phase 16 Plan 01: Correcciones del gate — Summary

**Las tres correcciones del `IF EXISTS` que comparten los dos gates de servicio viven ahora en la migración 070, con el comportamiento viejo y el nuevo medidos caso por caso contra el Postgres local: flipean exactamente los cuatro casos previstos y ninguno más.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-08-18T20:23:00Z (17:23 AR)
- **Completed:** 2026-08-18T20:38:00Z (17:38 AR)
- **Tasks:** 3/3
- **Files modified:** 5 (2 creados, 3 modificados)

## Accomplishments

- **La premisa de la fase quedó verificada antes de tocar nada.** Los ocho casos del baseline dieron
  exactamente lo que el plan predecía para el mundo pre-070. Si alguno hubiera discrepado, el plan
  mandaba parar; no hizo falta.
- **Las tres correcciones entraron en una sola redefinición** de `services_block_delete` y
  `services_block_mode_change`, con transacción explícita y re-corribilidad probada.
- **Los flips fueron exactamente los cuatro previstos** (1, 4, 5 y 6) y los cuatro casos que tenían
  que quedarse quietos se quedaron quietos (2, 3, 7 y 8) — incluidas las **dos direcciones peligrosas
  donde vive R-1**, medidas en la misma corrida en la que la dirección segura se abrió.
- **La divergencia entre los dos predicados quedó escrita en los dos lados** (migración y `schema.sql`)
  con el criterio de cada gate, y con un testigo medido por lado.
- **Los dos comentarios del código que la 070 volvía falsos dejaron de mentir**, sin tocar una sola
  línea de código.

## Task Commits

1. **Task 1: Medir el comportamiento ACTUAL de los dos gates (control negativo)** — `59d9a63` (docs)
2. **Task 2: La migración 070 — las tres correcciones en una sola redefinición** — `697d443` (feat)
3. **Task 3: Espejo quirúrgico en schema.sql + los dos comentarios de lib/** — `3efccef` (docs)

## Files Created/Modified

- `supabase/migrations/070_service_gates_direction_and_time_precision.sql` — **creado** (357 líneas).
  Las tres correcciones en dos `CREATE OR REPLACE FUNCTION`, dentro de `BEGIN;`/`COMMIT;`, con el
  `NOTIFY` después del cierre.
- `.planning/workstreams/motor-reservas/phases/16-correcciones-del-gate/16-BASELINE-070.md` —
  **creado**. El script de repro, las dos corridas literales y la tabla A/B de los ocho casos.
- `supabase/schema.sql` — **modificado** quirúrgicamente: solo los cuerpos de las dos funciones
  (2 hunks, +28 / −5). El gate de abonos quedó intacto.
- `lib/appointment-time.ts` — **modificado**: solo el bloque de cabecera. La "DIVERGENCIA CONOCIDA"
  se reemplazó por lo que pasa ahora.
- `lib/types.ts` — **modificado**: solo el comentario de `capacity_mode`, con la salvedad de dirección.

## El A/B, caso por caso

| Caso | ANTES | DESPUÉS | Flip | Corrección |
|---|---|---|---|---|
| 1 — `individual` → `group_class`, turno futuro vivo | RECHAZO `service_mode_has_future_appointments` | **PASA** | **sí** | GATE-01 |
| 2 — `group_class` → `individual` (aquí vive R-1) | RECHAZO | RECHAZO | no | — (buscado) |
| 3 — `group_class` → `simultaneous_resource` | RECHAZO | RECHAZO | no | — (buscado) |
| 4 — único turno FUTURO `completed`, cambio de modo | PASA | **RECHAZO** | **sí** | GATE-02 (cierra R-15-A) |
| 5 — turno de HOY `00:00` ya pasado, cambio de modo | RECHAZO | **PASA** | **sí** | GATE-03 |
| 6 — turno de HOY `00:30` ya pasado, borrado | RECHAZO `service_has_future_appointments` | **PASA** | **sí** | GATE-03 |
| 7 — turno de HOY `23:59` que no llegó, borrado | RECHAZO | RECHAZO | no | — (frontera conservada) |
| 8 — único turno FUTURO `completed`, borrado | PASA | PASA | no | — (divergencia D-03) |

**Flips: 1, 4, 5 y 6. Inmóviles: 2, 3, 7 y 8.** Coincide exactamente con la predicción del plan.

Verificación **por instalación**, no por archivo:

```
services_block_mode_change|t|t
services_block_delete|t|t
```

(`v_now_time` presente y el predicado viejo ausente, en las dos funciones.) El archivo aplicó **dos
veces seguidas** con exit 0.

## Estado de las suites (rojo esperado y declarado)

| Suite | Resultado | ¿Previsto? |
|---|---|---|
| `test/service-delete-gate.test.ts` | **12 passed \| 1 expected fail** | ✅ sin cambios, exactamente como antes |
| `test/capacity-mode-change-gate.test.ts` | **4 passed \| 3 failed** | ✅ el rojo declarado por el plan |

Los tres casos en rojo son **exactamente** los previstos:

- **caso 1** — `1 — con un turno futuro vivo el cambio de modo se RECHAZA`
- **caso 3** — `3 — un turno futuro con status NULL también bloquea el cambio de modo`
- **caso 4** — `4 — un turno de HOY (hora AR) cuenta como futuro y bloquea el cambio de modo`

Los tres siembran el servicio en `individual` y hacen PATCH a `group_class`: es **la dirección que
GATE-01 abre a propósito**. Los tres caen por el **guard de dirección**, que devuelve antes de llegar
al `EXISTS` — el caso 4 también, y a cualquier hora: GATE-03 no interviene en su caída. Ningún otro
caso se movió.

**Arreglar estos tres tests es trabajo del plan 16-02**, no de éste. Está fuera del scope fence de
este plan y así lo declara el PLAN.

`./node_modules/.bin/tsc --noEmit` → exit **0**.

## Deviations from Plan

**Una, menor, y la detectó el propio criterio del plan.**

**1. [Rule 1 - Bug] La verificación por instalación falló en el primer intento por un comentario**

- **Found during:** Task 2, al correr el criterio
  `position('a."date" >= v_today' in prosrc) = 0`.
- **Issue:** devolvió `t|f` para `services_block_delete`: el predicado viejo seguía presente en
  `prosrc`. No estaba en el código — estaba en un **comentario del cuerpo de la función**, que Postgres
  guarda dentro de `prosrc` igual que el código. El comentario decía "Antes era `a."date" >= v_today`"
  al explicar el cambio.
- **Fix:** se reformuló el comentario a "Antes miraba SÓLO el día (fecha mayor o igual a hoy)", sin
  citar el predicado textualmente. Cero cambio de comportamiento.
- **Por qué importa como aprendizaje:** el criterio de aceptación estaba bien escrito y el conteo
  sobre el archivo con `sed 's/--.*//'` (que sí pasaba) habría dejado pasar esto. **Verificar por
  instalación, no por archivo** es lo que lo encontró — vale la pena anotarlo: un `grep` sobre el
  `.sql` y un `position()` sobre `prosrc` NO son equivalentes cuando hay comentarios en el cuerpo.
- **Files modified:** `supabase/migrations/070_service_gates_direction_and_time_precision.sql`
- **Commit:** `697d443` (corregido antes de commitear; el archivo commiteado ya da `t|t`)

**2. [nota de proceso, no una desviación de contenido]** El primer borrador de `16-BASELINE-070.md`
se escribió con la sección `## DESPUES` **pre-llenada con los valores predichos** antes de aplicar la
070. Se cortó antes de commitear la Task 1 y la sección se escribió recién después de correr el repro
de verdad. El commit de la Task 1 contiene **solo** el `## ANTES`, que es lo que exige el control
negativo. Los valores finales del `## DESPUES` son medidos, no predichos — y coinciden con lo predicho,
que es el punto.

Fuera de eso, el plan se ejecutó tal cual está escrito.

## Authentication Gates

Ninguno.

## Requirements Completed

- **GATE-01** — recorte por dirección del gate de cambio de modo.
- **GATE-02** — `completed` sobre un turno futuro deja de abrir el gate de modo (cierra el residual
  **R-15-A** de `15-SECURITY.md`).
- **GATE-03** — fecha **+ hora** en los **dos** gates.

## Known Stubs

Ninguno. Este plan escribe SQL, comentarios y un `.md`; no hay superficie ni datos mockeados.

## Threat Flags

Ninguno. El plan no introduce endpoints, rutas de auth, accesos a archivos ni cambios de esquema en
una frontera de confianza: redefine dos funciones que ya existían, conservando en las dos el filtro
explícito por tenant (verificado con conteo exacto == 2) y sin agregar ni renombrar códigos de dominio.

La disposición `accept` de **T-16-05** (GATE-03 es permisivo y el alta manual está exenta de la
ventana de reserva) quedó **escrita en el header de la propia migración**, con su condición de
reapertura, para que `secure-phase` la encuentre donde vive el código y no solo en el PLAN.

## Notas para el que siga

- **La 070 NO está aplicada a producción** (D-08). Está aplicada **al Postgres local**. El runbook lo
  escribe **16-02**. Última migración en prod: **069**.
- **`16-02` tiene dos entregables que dependen de esto:** arreglar los tres tests que quedaron en rojo
  (por dirección, con control negativo) y escribir el runbook.
- **No unificar los dos predicados.** Son parecidos a propósito y distintos a propósito. Los conteos
  de grep del PLAN y los comentarios de los dos archivos están puestos para que un intento de
  "simplificarlos por simetría" falle ruidosamente.
- El script de repro es re-corrible y no deja datos: sirve tal cual para `secure-phase`. Su copia
  literal está dentro de `16-BASELINE-070.md`.

## Self-Check: PASSED

Archivos declarados, verificados en disco:

- `supabase/migrations/070_service_gates_direction_and_time_precision.sql` — FOUND
- `.planning/workstreams/motor-reservas/phases/16-correcciones-del-gate/16-BASELINE-070.md` — FOUND
- `supabase/schema.sql` — FOUND (modificado, 2 hunks)
- `lib/appointment-time.ts` — FOUND (modificado, solo comentarios)
- `lib/types.ts` — FOUND (modificado, solo comentarios)

Commits declarados, verificados en `git log`:

- `59d9a63` — FOUND
- `697d443` — FOUND
- `3efccef` — FOUND
