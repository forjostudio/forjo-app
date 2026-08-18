---
phase: 16-correcciones-del-gate
plan: 02
subsystem: testing
tags: [vitest, postgres, triggers, gates, rls, multi-tenant, runbook, migrations]

requires:
  - phase: 16-correcciones-del-gate
    provides: "migr. 070 (GATE-01/02/03) aplicada al Postgres local + 16-BASELINE-070.md"
  - phase: 13-borrado-e-historial
    provides: "services_block_delete (migr. 065) y el molde de test/service-delete-gate.test.ts"
provides:
  - "Matriz COMPLETA por dirección del gate de modo: dos direcciones seguras que pasan y dos peligrosas que rechazan, cada una con su caso propio y relectura de la fila"
  - "GATE-02 probado: un turno futuro `completed` ya no abre el gate de modo (cierra R-15-A)"
  - "GATE-03 probado en los DOS gates, con un caso por cada lado del corte de hoy"
  - "Testigo escrito de la divergencia deliberada de estados, uno de cada lado (T-16-04)"
  - "seedSimultaneousService acepta serviceId: firma idéntica a seedGroupClassService"
  - "16-RUNBOOK-070.md: pre-flight con criterio de aborto, verificación por instalación y rollback por objeto"
affects: [secure-phase, 17-superficie, aplicacion-070-a-prod]

tech-stack:
  added: []
  patterns:
    - "Control negativo A/B a nivel SUITE: instalar los cuerpos VIEJOS de las funciones a mano, ver caer los casos discriminantes, restaurar"
    - "Separar explícitamente casos DISCRIMINANTES (caen sin el fix) de INVARIANTES (pasan con los dos predicados): un invariante no es un control"
    - "Guard de medianoche que TIRA (no skipea) cuando la hora AR sale de [01:00, 23:30]: un skip silencioso esconde el agujero de cobertura"
    - "La frontera de tiempo del test se calcula con la MISMA función que usa la UI (nowInAR), no con una fórmula paralela"

key-files:
  created:
    - .planning/workstreams/motor-reservas/phases/16-correcciones-del-gate/16-RUNBOOK-070.md
  modified:
    - test/capacity-mode-change-gate.test.ts
    - test/service-delete-gate.test.ts
    - test/helpers/booking-fixtures.ts

key-decisions:
  - "Los casos 1, 2 y 3 del gate de modo NO se aflojaron: se re-anclaron a una dirección PELIGROSA. La aserción (rechazo + código de dominio + fila intacta) es la misma; lo que se movió es la dirección"
  - "Los casos 2 y 3 tenían que salir de `group_class` y no de `individual`: desde `individual` el guard de dirección devuelve ANTES del EXISTS, y los dos casos habrían quedado verdes sin evaluar nunca lo que dicen detectar"
  - "El caso 4 (frontera de hoy a las 10:30) se ABSORBE en los dos casos de GATE-03, no se duplica: era una moneda al aire según la hora de la corrida, y un tercer turno de HOY del mismo tenant choca con el índice único 011 o con el EXCLUDE gist 013"
  - "La aserción `is_group = false` sobre el turno PREEXISTENTE es la que convierte 'la dirección segura es segura' de argumento en medición"
  - "El A/B se hizo a nivel suite (instalando los cuerpos de 065 + 068 en un .sql desechable FUERA de supabase/migrations/), no con un mutante puntual: mide lo mismo que mide prod"

requirements-completed: [GATE-01, GATE-02, GATE-03]

duration: 26 min
completed: 2026-08-18
status: complete
---

# Phase 16 Plan 02: Probar el gate por dirección y dejar escrito cómo se aplica — Summary

**El gate corregido quedó probado POR DIRECCIÓN contra Postgres real (13 + 15 casos, 0 fallos, 0 skips), con los cinco casos discriminantes VISTOS FALLAR contra el predicado viejo instalado a mano, y la 070 quedó con un runbook que tiene criterios de decisión en vez de una lista de pasos.**

## Performance

- **Duration:** ~26 min
- **Started:** 2026-08-18T20:38:00Z (17:38 AR)
- **Completed:** 2026-08-18T21:04:00Z (18:04 AR)
- **Tasks:** 3/3
- **Files modified:** 4 (1 creado, 3 modificados)

## Task Commits

1. **Task 1: La matriz de direcciones del gate de modo + el fixture que la habilita** — `a266fb4` (test)
2. **Task 2: GATE-03 en el gate de BORRADO y el testigo de la divergencia** — `8b355b1` (test)
3. **Task 3: Runbook de aplicación de la 070 a producción** — `06412d9` (docs)

## Accomplishments

### El rojo heredado se cerró cambiando el ESCENARIO, no la aserción

16-01 dejó `capacity-mode-change-gate` en **4 pasan / 3 fallan**, y los tres rojos —casos **1, 3 y 4**—
asertaban un rechazo en `individual` → `group_class`, que es exactamente la dirección que GATE-01
abrió a propósito. Ninguna aserción se aflojó:

| Caso | Antes | Ahora | Cómo pasó a verde |
|---|---|---|---|
| **1** — el rechazo | `individual` → `group_class`, turno futuro vivo ⇒ esperaba RECHAZO | `group_class`/2 → `individual`/1, mismo turno ⇒ RECHAZO | **misma aserción, otra dirección**: se movió a donde vive R-1. El código de dominio, el `code` y la relectura de la fila son idénticos |
| **3** — rama `status IS NULL` | `individual` → `group_class`, turno futuro sin estado | `group_class`/2 → `individual`/1, mismo turno sin estado | **dirección peligrosa**. Desde `individual` el guard de dirección devuelve antes del `EXISTS` y la rama `IS NULL` no se evaluaría nunca |
| **4** — frontera "hoy" | un turno de HOY a las `10:30` ⇒ esperaba bloqueo | **absorbido** por los dos casos nuevos de GATE-03 | Dejó de existir como caso propio. Los dos lados del corte (hoy-a-hora-pasada ⇒ pasa · hoy-a-hora-futura ⇒ rechaza) tienen ahora un caso determinista cada uno |

El caso **2** (detector de `RETURN NULL`) también se movió a la dirección peligrosa aunque no estaba en
rojo: desde `individual` habría seguido verde **sin que el `EXISTS` corriera nunca**, o sea habría
dejado de detectar lo que dice detectar.

### La aritmética de los 13 casos

**6 sobrevivientes** (1, 2, 3, 5, 6 y 7) + **7 nuevos** = **13**. El 4 se **absorbe**, no se suma.
Duplicarlo además era **imposible de ejecutar**: un tercer turno del mismo tenant en `TODAY_AR` a la
misma hora choca con el índice único 011 (`23505`) y, separado de minutos, con el EXCLUDE gist 013
(`23P01`) — los tres comparten `t.professionalId`.

### La matriz completa por dirección

| # | Caso | Dirección | Resultado |
|---|---|---|---|
| 8 | GATE-01 segura **A** | `individual` → `group_class`/2, turno futuro `confirmed` | **PASA**, la fila queda escrita, y el turno preexistente **sigue con `is_group = false`** |
| 9 | GATE-01 segura **B** | `individual` → `simultaneous_resource`/2 | **PASA** |
| 10 | GATE-01 peligrosa **C** | `group_class`/2 → `simultaneous_resource`/2 | **RECHAZA** `P0001 / service_mode_has_future_appointments`, fila intacta |
| 11 | GATE-01 peligrosa **D** | `simultaneous_resource`/2 → `group_class`/2 | **RECHAZA**, fila intacta |
| 12 | GATE-02 (**R-15-A**) | `group_class`/2 con único futuro `completed` → `individual`/1 | **RECHAZA** |
| 13 | GATE-03 — el fix | `group_class`/2, único turno de HOY a `00:00:00` vivo → `individual`/1 | **PASA**, queda escrito |
| 14 | GATE-03 — la frontera | `group_class`/2, turno de HOY a `23:59:00` vivo → `individual`/1 | **RECHAZA** |

La aserción de `is_group = false` en el caso 8 es la que convierte "la dirección segura es segura" de
argumento en **medición**: esa fila sigue dentro del EXCLUDE gist 013 (`041: AND NOT is_group`) después
del cambio, o sea no queda huérfana de guards. Es la evidencia de que estrechar el gate **no** reabre R-1.

### El testigo de la divergencia, escrito de los DOS lados (T-16-04)

- **Caso 12** de `capacity-mode-change-gate` — `completed` futuro **SÍ** bloquea el cambio de modo.
- **Caso 8** de `service-delete-gate` — el mismo estado **NO** bloquea el borrado.

Cada comentario referencia al otro por número y por archivo, y explica el criterio de cada gate
("¿queda algo por prestar?" vs. "¿queda alguna fila cuyo `is_group` quedaría desalineado?"). Sin los
dos, el próximo que lea los dos archivos "arregla" uno.

## El control negativo A/B — corrido, caso por caso

**Cómo se hizo:** se armó un `.sql` desechable **fuera de `supabase/migrations/`** (en el scratchpad de
la sesión, borrado al terminar) con los cuerpos **viejos** de las dos funciones copiados literalmente
de la **065** (`services_block_delete`, líneas 215-286) y la **068** (`services_block_mode_change`,
líneas 231-292), envueltos en `BEGIN;`/`COMMIT;` + `NOTIFY`. Se aplicó al Postgres local, se verificó
**por instalación** que el predicado viejo estaba puesto, se corrieron las dos suites, y se restauró
re-aplicando la 070.

**Verificación por instalación con el predicado viejo puesto** (`v_now_time` ausente · predicado viejo presente):

```
services_block_mode_change|f|t
services_block_delete|f|t
```

**Resultado: `5 failed | 22 passed | 1 expected fail (28)`.** Cayeron **exactamente** los cinco casos
discriminantes previstos, ni uno más:

### Discriminantes — CAYERON con el predicado viejo (son los que prueban algo)

| Suite | Caso | Qué falló sin el fix |
|---|---|---|
| `capacity-mode-change-gate` | **8** — GATE-01 segura A (`individual` → `group_class`) | esperaba `error === null`; el gate viejo rechazó con `P0001` |
| `capacity-mode-change-gate` | **9** — GATE-01 segura B (`individual` → `simultaneous_resource`) | ídem: rechazo del gate viejo |
| `capacity-mode-change-gate` | **12** — GATE-02 (`completed` futuro) | esperaba `P0001`; el predicado viejo excluía `completed` ⇒ el cambio **pasó** (el bypass de un click de R-15-A, medido) |
| `capacity-mode-change-gate` | **13** — GATE-03 (hoy a hora ya pasada) | esperaba `error === null`; el predicado viejo (`date >= hoy`) lo contó como futuro y rechazó |
| `service-delete-gate` | **12** — GATE-03 (hoy a hora ya pasada) | el borrado esperaba pasar; el predicado viejo rechazó con `service_has_future_appointments` |

### Invariantes — pasaron con LOS DOS predicados (y eso se declara: un invariante no es un control)

- `capacity-mode-change-gate` **1, 2, 3, 5, 6, 7** — los sobrevivientes. Las direcciones peligrosas
  rechazan igual con los dos predicados: es exactamente el punto (el recorte **no** las tocó).
- `capacity-mode-change-gate` **10 y 11** — las dos direcciones peligrosas nuevas (C y D). Invariantes
  **a propósito**: son la evidencia de que R-1 sigue cerrado, no del fix.
- `capacity-mode-change-gate` **14** — GATE-03 frontera (hoy a hora que no llegó). Invariante: bloquea
  con los dos predicados. Su valor no es discriminar, es impedir que GATE-03 se pase de laxo.
- `service-delete-gate` **1..11 y 13** — incluida la frontera nueva (**13**), invariante por el mismo
  motivo. El `expected fail` (IN-01) sigue siendo **uno solo** y no se movió.

**Restauración verificada:** re-aplicada la 070, `pg_proc` volvió a dar `t|t` en las dos funciones y
las dos suites volvieron a **27 passed | 1 expected fail (28)**.

## Verification

| # | Verificación | Resultado |
|---|---|---|
| 1 | `vitest run capacity-mode-change-gate + service-delete-gate --no-file-parallelism --testTimeout=30000` | ✅ **27 passed \| 1 expected fail (28)** · **0 fallos, 0 skips**. Por archivo: **13** (era 7) y **15** (era 13, con el mismo único `expected fail`) |
| 2 | Regresión de los llamadores del fixture: `concurrency` + `booking-cualquiera-public` | ✅ **35 passed** — el cambio de firma es compatible hacia atrás |
| 3 | `./node_modules/.bin/tsc --noEmit` | ✅ exit **0** |
| 4 | A/B ejecutado y declarado caso por caso | ✅ los **5** discriminantes cayeron; con la 070 restaurada, todo verde |
| 5 | El runbook existe y cumple sus greps | ✅ ver tabla abajo |
| 6 | `git diff --name-only` no toca `supabase/`, `app/` ni `lib/` | ✅ sólo `test/` (3 archivos) y `.planning/` (1) |
| 7 | La 070 sigue **sin aplicar** en producción (D-08) | ✅ no se ejecutó una sola query contra prod en todo el plan |

**Criterios de grep, medidos:**

| Archivo | Criterio | Exigido | Medido |
|---|---|---|---|
| `capacity-mode-change-gate` | `capacity_mode: 'simultaneous_resource'` | ≥ 2 | **4** |
| | `'completed'` | ≥ 1 | **1** |
| | `diverg` (`-ci`) | ≥ 1 | **2** |
| | `is_group` | ≥ 1 | **16** |
| | `nowInAR` | ≥ 1 | **4** |
| | `PAST_TIME_TODAY\|FUTURE_TIME_TODAY` | ≥ 2 | **6** |
| | `GUARD` | ≥ 5 | **10** |
| | `23:30` | ≥ 1 | **3** |
| | `\}, [0-9]{4,}\)` (timeout por caso) | ≥ 13 | **13** |
| `service-delete-gate` | `PAST_TIME_TODAY\|FUTURE_TIME_TODAY` | ≥ 2 | **7** |
| | `nowInAR` | ≥ 1 | **3** |
| | `23:30` | ≥ 1 | **3** |
| | `service_has_future_appointments` | ≥ 5 | **5** |
| | `\}, [0-9]{4,}\)` | ≥ 12 | **12** |
| | `diverg` (`-ci`) | ≥ 1 | **1** |
| `booking-fixtures` | `opts: { capacity: number; serviceId?: string }` (`-cF`) | == 2 | **2** |
| `16-RUNBOOK-070.md` | `pg_proc` | ≥ 2 | **6** |
| | `pg_trigger` | ≥ 1 | **1** |
| | `ABORTAR` | ≥ 3 | **5** |
| | `db push` | ≥ 1 | **2** |
| | `rollback` (`-ci`) | ≥ 1 | **3** |
| | `069` / `070` | ≥ 1 / ≥ 3 | **1** / **20** |
| | `R-15-A` (`-ci`) | ≥ 1 | **2** |
| | `NO APLICADA` (`-ci`) | ≥ 1 | **1** |

**Ningún skip.** Las creds del Supabase local estaban presentes en las tres corridas — si hubieran
faltado, la suite entera se habría skipeado y **eso no cuenta como verde**.

## Files Created/Modified

- `test/capacity-mode-change-gate.test.ts` — **modificado**. De 7 a **13** casos: cabecera con la matriz
  de direcciones y la advertencia de la trampa de orden, constantes derivadas de `nowInAR`, guard de la
  ventana de medianoche, helper `isGroupOf`, casos 1/2/3 re-anclados, caso 4 absorbido (con el porqué
  escrito donde estaba), y los 7 casos nuevos.
- `test/service-delete-gate.test.ts` — **modificado**. De 13 a **15** casos: guard de medianoche +
  constantes de `nowInAR`, los dos casos de GATE-03 (fix y frontera) y el testigo de la divergencia
  ampliado en el caso 8. **Los 13 anteriores quedaron exactamente como estaban.**
- `test/helpers/booking-fixtures.ts` — **modificado**. `seedSimultaneousService` acepta `serviceId`, con
  la **misma firma** que `seedGroupClassService`, y con la trampa de orden documentada en los dos.
- `.planning/.../16-RUNBOOK-070.md` — **creado** (~240 líneas).

## El runbook, en una línea por sección

1. **Pre-flight con criterio de ABORTO** — (i) estado de prod **por instalación** sobre `pg_proc`, con
   las cuatro lecturas posibles y qué hacer con cada una (incluida "ya está aplicada ⇒ no re-aplicar");
   (ii) servicios por modo/cupo, con la instrucción de **registrar id y nombre** de todo lo que no sea
   `individual`; (iii) el conteo de turnos que GATE-03 deja de contar, **sin** criterio de aborto porque
   es el efecto buscado; (iv) la regla de la Phase 14: **un cero sólo vale si otra query ya devolvió
   números**.
2. **Orden** — por qué la 070 **puede ir sola**: el mapeo de los rechazos ya está en prod desde 15-02 y
   la migración **no agrega ni renombra ningún código de dominio**.
3. **Aplicación** — el archivo entero, de una vez, con su propio `BEGIN;`/`COMMIT;`; **nunca `db push`**
   (prod no tiene `schema_migrations` y el proyecto está linkeado).
4. **Verificación por INSTALACIÓN** — la misma query de (i) invertida, más `pg_proc` para el guard de
   dirección y la divergencia de estados, más `pg_trigger` para confirmar que los dos triggers siguen
   enganchados. Con el porqué de que no sea por comportamiento (D-09).
5. **Rollback por objeto** — re-aplicar los cuerpos de la **065** y la **068** juntas, en una
   transacción, sin `DROP FUNCTION`. Con **qué se pierde** escrito: vuelve el bloqueo del cambio más
   frecuente, se **reabre R-15-A**, y vuelve el turno de hoy ya pasado trabando el borrado.
6. **Registro** — tabla vacía a completar el día de la aplicación (fecha, quién, salida de cada control,
   desvíos), porque el runbook de la 068 terminó valiendo más como registro que como procedimiento.

## Deviations from Plan

**Una, de forma y no de contenido.**

**1. [Rule 3 - Blocker] El runbook no se pudo escribir por heredoc**

- **Found during:** Task 3.
- **Issue:** el `cat > archivo <<'EOF'` con el contenido completo del runbook abortó en el Git Bash de
  esta máquina con `unexpected EOF while looking for matching '`. El heredoc estaba correctamente
  citado; el fallo es del parser de la línea de comando con un payload de ese tamaño y con comillas
  simples dobladas dentro de los bloques SQL.
- **Fix:** se escribió el archivo con la herramienta `Write`. Cero cambio de contenido.
- **Files modified:** ninguno adicional.
- **Commit:** `06412d9`.

Fuera de eso, el plan se ejecutó tal cual está escrito. **Ningún test se ajustó para que pasara**: el
predicado de la 070 no reveló ningún defecto, y `supabase/`, `app/` y `lib/` quedaron sin tocar.

**Total de desviaciones:** 1 auto-resuelta (Rule 3, herramienta). **Impacto:** nulo sobre el contenido.

## Authentication Gates

Ninguno.

## Requirements Completed

- **GATE-01** — matriz completa por dirección: dos seguras que pasan (casos 8 y 9) y dos peligrosas que
  rechazan (10 y 11), más las tres direcciones peligrosas de los casos re-anclados (1, 2, 3).
- **GATE-02** — caso 12 del gate de modo + su testigo cruzado en el caso 8 del gate de borrado.
- **GATE-03** — cuatro casos: fix y frontera en **cada uno** de los dos gates.

## Known Stubs

Ninguno. Este plan escribe tests, comentarios y un `.md`; no hay superficie ni datos mockeados. Los
fixtures usan el prefijo `__test_` y `teardownOneTenant` borra el negocio entero por cascada.

## Threat Flags

Ninguno. No se introducen endpoints, rutas de auth, accesos a archivos ni cambios de esquema. Los dos
guards anti-falso-verde del `beforeAll` (sesión anon presente · anon key ≠ service-role) se conservaron
intactos, así que **T-16-14** sigue mitigada, y el contrapeso del caso de aislamiento sigue en el mismo
`it`. El `.sql` desechable del A/B se creó **fuera del repo** (scratchpad de la sesión) y se borró al
terminar: no quedó en `supabase/migrations/` ni en `git status`.

## Notas para el que siga

- **La 070 sigue SIN aplicar a producción.** Última en prod: **069** (2026-08-16). El procedimiento
  está en `16-RUNBOOK-070.md` y **aplicarla es decisión del dueño** (D-08).
- **Los dos predicados NO se unifican.** Los comentarios cruzados de los casos 12 (modo) y 8 (borrado),
  más los criterios de grep de `diverg` en los dos archivos, están puestos para que un intento de
  "simplificarlos por simetría" falle ruidosamente. Es la defensa de **T-16-04**.
- **El guard de medianoche tira, no skipea.** Si alguien corre estas suites entre las 23:30 y la 01:00
  AR, van a fallar con un mensaje que explica exactamente por qué. Eso es correcto: en esa franja los
  casos de GATE-03 medirían lo contrario de lo que dicen medir.
- **Para repetir el A/B** (por ejemplo en `secure-phase`): copiar las líneas 215-286 de la 065 y
  231-292 de la 068 a un `.sql` **fuera de `supabase/migrations/`**, aplicarlo al local, correr las dos
  suites, y restaurar re-aplicando la 070. Los cinco discriminantes están listados arriba por nombre.
- **`grep -ciF` aborta en el Git Bash de esta máquina** (exit 134). Usar `-ci` o `-cF`, nunca los tres
  flags juntos.

## Self-Check: PASSED

Archivos declarados, verificados en disco:

- `.planning/workstreams/motor-reservas/phases/16-correcciones-del-gate/16-RUNBOOK-070.md` — FOUND
- `test/capacity-mode-change-gate.test.ts` — FOUND (modificado)
- `test/service-delete-gate.test.ts` — FOUND (modificado)
- `test/helpers/booking-fixtures.ts` — FOUND (modificado)

Commits declarados, verificados en `git log`:

- `a266fb4` — FOUND
- `8b355b1` — FOUND
- `06412d9` — FOUND
