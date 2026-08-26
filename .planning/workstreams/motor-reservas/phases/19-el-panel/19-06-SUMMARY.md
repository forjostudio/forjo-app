---
phase: 19-el-panel
plan: 06
subsystem: database
tags: [postgres, migracion, produccion, privilegios, postgrest, schema, runbook, agenda]

# Dependency graph
requires:
  - phase: 19-el-panel
    provides: "supabase/migrations/074_save_agenda_blocks.sql (Plan 19-02), escrita y validada contra el Postgres local PG17"
  - phase: 19-el-panel
    provides: "el panel invocando el RPC (Plan 19-05): sin la funcion en produccion, cada guardado de horarios falla"
  - phase: 18-el-modelo-y-la-disponibilidad
    provides: "las migr. 071/072/073, de las que la 074 depende para tener tabla que escribir y FK que valide la pertenencia al tenant"
provides:
  - "La 074 aplicada y verificada en PRODUCCION: la funcion existe, corre en modo INVOKER y el rol anonimo no puede ejecutarla"
  - "La medicion que RESUELVE la contradiccion de la Phase 18 sobre el estado de las migraciones 071/072/073 en produccion"
  - "supabase/schema.sql reflejando la funcion de la 074, su propietario, sus tres statements de privilegios y el cierre del default de FUNCTIONS"
affects: [secure-phase-19, phase-20-booking-publico]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Reflejo QUIRURGICO de schema.sql: insertar en las secciones que el archivo ya tiene para cada tipo de objeto, respetando el orden alfabetico del dump, con un diff de solo lineas agregadas"
    - "Validacion del reflejo por REPLAY real: el bloque insertado se ejecuta contra el Postgres local dentro de una transaccion que hace ROLLBACK, y se compara la ACL resultante contra la de produccion"

key-files:
  created: []
  modified:
    - supabase/schema.sql

key-decisions:
  - "La contradiccion de la Phase 18 se resuelve a favor de 18-SECURITY.md §9: las 071/072/073 YA estaban aplicadas en produccion. 18-VERIFICATION.md:152 (prod en la 070) quedo obsoleto"
  - "NO se emite una migracion 075: los dos criterios de privilegios se cumplen en produccion y la residualidad de supabase_admin es la misma limitacion de plataforma que la 073 ya documento"
  - "La definicion reflejada usa `LANGUAGE \"plpgsql\" SECURITY INVOKER` en una sola linea, el formato con el que el dump escribe el modo de seguridad de las funciones vecinas (`book_slot_atomic`), en vez de las dos lineas de la migracion"

patterns-established:
  - "Pattern: cuando dos artefactos de una fase anterior se contradicen sobre el estado de produccion, no se elige el mas nuevo — se MIDE, y la salida cruda queda pegada en el SUMMARY como evidencia"

requirements-completed: [AGENDA-05]

# Metrics
duration: 20min
completed: 2026-08-26
status: complete
---

# Phase 19 Plan 06: La 074 en producción y el reflejo en `supabase/schema.sql` Summary

**La migración 074 quedó aplicada y verificada en producción —función en modo invocador, sin ejecución para el rol anónimo— y `supabase/schema.sql` la refleja con 190 líneas agregadas y 0 borradas; la contradicción de la Phase 18 sobre el estado de las 071/072/073 se cerró midiendo, no suponiendo.**

> **La próxima migración libre del proyecto es la 075.**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-08-26
- **Tasks:** 2 (1 checkpoint humano bloqueante + 1 auto)
- **Files modified:** 1 (`supabase/schema.sql`)

## Task Commits

1. **Task 1 — aplicación a producción (checkpoint humano)** — *sin commit de código*: no toca el repo. Su registro es este SUMMARY, y se versiona con el commit `docs(19-06)` de cierre.
2. **Task 2 — reflejo en `supabase/schema.sql`** — `f833cbf` (chore) — 190 líneas agregadas, 0 borradas.

---

## Task 1 — El estado real de producción (salidas crudas, sin reinterpretar)

La persona corrió el runbook de 7 pasos contra **producción** y confirmó: *"Ahí está todo. Ya apliqué la 074."*

### Paso 1 — estado real de las migraciones de la Phase 18

| tabla_071 | vista_071 | fk_073_bloque | fk_073_servicio | grants_de_mas_072 |
|---|---|---|---|---|
| true | true | true | true | 0 |

### Paso 2 — migraciones que hubo que aplicar

**Ninguna.** La 071, la 072 y la 073 **ya estaban aplicadas** en producción.

### Paso 3 — la 074

**Aplicada a producción.**

### Paso 4 — recarga del caché de esquema de PostgREST

**Sin confirmación explícita del operador.** Ver §Pendiente operativo, más abajo. No se afirma que se corrió.

### Paso 5 — privilegios y modo de seguridad de la función

| proname | prosecdef | acl |
|---|---|---|
| save_agenda_blocks | false | `postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres` |

Una sola fila. `prosecdef = false`. **Sin entrada para `anon`.** `authenticated` con ejecución.

### Paso 6 — default privileges de FUNCTIONS en el schema `public` (2 filas)

| creador | acl |
|---|---|
| supabase_admin | `{postgres=X/supabase_admin,anon=X/supabase_admin,authenticated=X/supa…` (truncado en pantalla) |
| postgres | `{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgre…` (truncado en pantalla) |

### Contraste contra los criterios de aceptación

| # | Criterio | Resultado |
|---|---|---|
| 1 | Las cuatro banderas del Paso 1 en `true` y `grants_de_mas_072` en `0` | **CUMPLE** — y sin necesitar el Paso 2 |
| 2 | El Paso 5 devuelve **una** fila, `prosecdef = false`, sin `anon` en el `acl`, con `authenticated` | **CUMPLE** — P-02 verificado, no hay una segunda RA-05 |
| 3 | El Paso 6: el default de FUNCTIONS ya no concede ejecución al rol anónimo **para el creador `postgres`** | **CUMPLE** — la fila de `postgres` no tiene `anon=X` |
| 4 | El `NOTIFY` del Paso 4 se corrió después de la 074 y antes del deploy | **NO CONFIRMADO EXPLÍCITAMENTE** — ver §Pendiente operativo |
| 5 | Las salidas crudas de los pasos 1, 5 y 6 quedan en el SUMMARY | **CUMPLE** — arriba, verbatim |
| 6 | `git diff -- supabase/migrations/074_save_agenda_blocks.sql` vacío | **CUMPLE** — medido, vacío |

**Veredicto: checkpoint APROBADO.**

### La contradicción de la Phase 18, resuelta con una medición

Este es el punto que el plan pedía dejar por escrito, porque `secure-phase` lo va a leer:

- `18-VERIFICATION.md:152` decía que las 071 y 072 **no** estaban aplicadas y que producción seguía en la **070**.
- `18-SECURITY.md` §9, posterior, decía que **sí** lo estaban y que faltaba la 073.
- La memoria del proyecto decía que las tres estaban.

**La medición del Paso 1 resuelve la contradicción a favor de `18-SECURITY.md` §9 y en contra de `18-VERIFICATION.md:152`:** las tres migraciones estaban aplicadas antes de este plan. `18-VERIFICATION.md:152` quedó **obsoleto** y no debe usarse como fuente sobre el estado de producción.

La consecuencia práctica es que el Paso 2 del runbook no hizo falta: no hubo que aplicar nada fuera de orden, y la 074 aterrizó sobre una base que ya tenía la tabla que escribir (071) y las FK compuestas que validan la pertenencia al tenant (073). **T-19-34 cerrado por medición.**

### Pendiente operativo — el `NOTIFY` del Paso 4

El operador **no confirmó explícitamente** haber corrido `NOTIFY pgrst, 'reload schema';`. No se inventa que se corrió.

- **Consecuencia concreta si no se corrió:** PostgREST cachea el esquema, así que la función **existe en la base pero no está expuesta**, y **cada** guardado de horarios devuelve `PGRST202` (*"Could not find the function … in the schema cache"*) — el síntoma que P-05 describe y que desde el navegador es indistinguible de un problema de red. El Plan 19-05 ya mapea ese código a copy propia, así que el fallo sería diagnosticable, pero total.
- **Verificación natural:** el **primer guardado de horarios en producción después del deploy**. Si devuelve el error de función inexistente, la corrección es correr el `NOTIFY` en el editor SQL — no hace falta ninguna migración.
- **Riesgo residual:** operacional y reversible en una línea. No bloquea el cierre del plan.

### La residualidad de `supabase_admin` (desvío conocido, no bloqueante)

La fila del creador `supabase_admin` en `pg_default_acl` sigue con `anon=X`. Es **exactamente** la misma residualidad que la migr. 073 dejó sobre TABLES y que el Plan 19-02 ya documentó como desvío conocido: el `ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin"` degrada a `NOTICE` porque `postgres` no es miembro de ese rol y el `ALTER` tiraría `42501 permission denied to change default privileges`.

- **El creador que importa es `postgres`** — es el rol con el que corren tanto las migraciones del CLI como el editor SQL del dashboard, o sea las dos únicas vías por las que este proyecto crea objetos. Su fila **cumple** el criterio.
- **Riesgo residual:** si alguien crea una función en `public` autenticado como `supabase_admin`, esa función nacería ejecutable por el rol anónimo. **Se anota para `secure-phase`; no se gatea.**
- **No corresponde una migración 075 por esto:** no es algo que una migración pueda cerrar (la limitación es de plataforma), y emitir una 075 que vuelva a fallar con el mismo `42501` sólo agregaría ruido al historial.

---

## Task 2 — El reflejo quirúrgico en `supabase/schema.sql`

Se reflejó **exactamente** lo que la 074 agrega, insertando en las secciones que el archivo ya tiene para cada tipo de objeto. Nunca se corrió `supabase db dump`.

| Qué | Dónde se insertó | Por qué ahí |
|---|---|---|
| La definición de la función | Sección de funciones, entre `businesses_protect_admin_columns` y `services_block_delete` | Es la posición alfabética que el dump mantiene en esa zona |
| `ALTER FUNCTION … OWNER TO "postgres"` | Inmediatamente después de la definición | Es el formato con el que el archivo emite el propietario de todas sus funciones vecinas |
| Los **tres** statements de privilegios (2 `REVOKE` + 1 `GRANT`) | Bloque de `GRANT … ON FUNCTION`, entre `oid_dist` y `time_dist` | Es donde el archivo ya agrupa los privilegios de ejecución, y la posición alfabética dentro de ese bloque |
| `ALTER DEFAULT PRIVILEGES … REVOKE EXECUTE ON FUNCTIONS FROM "anon"` | Junto al bloque hermano de la 073, al final | **El orden importa:** va DESPUÉS del `GRANT ALL ON FUNCTIONS TO "anon"` (línea 4388) que corrige. Verificado: el REVOKE quedó en la 4438 |

**Divergencia deliberada de una línea respecto de la migración:** la definición reflejada usa `LANGUAGE "plpgsql" SECURITY INVOKER` **en una sola línea**, que es el formato con el que el dump escribe el modo de seguridad de las funciones vecinas (`book_slot_atomic` → `LANGUAGE "plpgsql" SECURITY DEFINER`). La migración lo escribe en dos. Es la **única** diferencia de código entre los dos archivos — medido, ver abajo.

Los comentarios de la cabecera del bloque se resumieron respecto de la migración (el `schema.sql` es el estado base, no la clase magistral), conservando lo load-bearing: por qué es INVOKER, dónde viven sus privilegios, y qué hace cada paso de la función.

### Verificación de Task 2

| # | Chequeo | Esperado | Resultado |
|---|---|---|---|
| 1 | `grep -cF "save_agenda_blocks" supabase/schema.sql` | ≥ 4 | **5** (definición + propietario + 2 `REVOKE` + 1 `GRANT`) |
| 2 | `git diff -- supabase/schema.sql \| grep -c "^-[^-]"` | 0 | **0** — sólo líneas agregadas |
| 3 | `git diff --stat -- supabase/schema.sql` | < 200 agregadas | **190 insertions(+), 0 deletions(-)** |
| 4 | `git diff -- supabase/schema.sql \| grep -cE "^\+.*SECURITY DEFINER"` | 0 | **0** — lo reflejado no corre con privilegios de owner |
| 5 | `git diff --name-only` | sólo `supabase/schema.sql` | **`supabase/schema.sql`**, nada más |
| 6 | `git diff -- supabase/migrations/074_save_agenda_blocks.sql` | vacío | **vacío** — la 074 no se tocó |
| 7 | `./node_modules/.bin/tsc --noEmit` | exit 0 | **exit 0** (leído el output, no sólo el código) |

**Diff de código migración ↔ schema** (comparando sólo líneas de SQL, ignorando comentarios y blancos):

```
--- migracion
+++ schema
@@ -2,2 +2 @@
-    LANGUAGE "plpgsql"
-    SECURITY INVOKER
+    LANGUAGE "plpgsql" SECURITY INVOKER
```

Cero diferencias más. El cuerpo de la función es **idéntico**, línea por línea.

**Validación por REPLAY real (no por `grep`).** El bloque insertado —definición + propietario + los tres privilegios + el default de FUNCTIONS— se extrajo del `schema.sql` ya editado y se ejecutó contra el Postgres local dentro de una transacción con `ROLLBACK`:

```
BEGIN
CREATE FUNCTION
ALTER FUNCTION
REVOKE
REVOKE
GRANT
ALTER DEFAULT PRIVILEGES
      proname       | prosecdef |                                 acl
--------------------+-----------+----------------------------------------------------------------------
 save_agenda_blocks | f         | postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres
(1 row)

ROLLBACK
```

Parsea, instala, y la ACL resultante es **exactamente la misma** que devolvió el Paso 5 contra producción y la que el Plan 19-02 midió en local: `prosecdef = f`, sin `anon`, con `authenticated=X`. El reflejo no es una transcripción a ojo: está ejecutado.

`npm run lint` completo **no** se corrió: no hay archivos de código en el diff de este plan (sólo `.sql`) y, como registraron los Planes 19-01/19-02, la corrida completa se corta por timeout en esta máquina. Además `agenda-client.tsx` arrastra un error preexistente de `react-hooks/purity` en la vista semanal, fuera de alcance por D-13 y ya anotado en `deferred-items.md`.

---

## Decisions Made

- **La contradicción se resolvió midiendo, no eligiendo el artefacto más nuevo.** El resultado (las tres migraciones ya estaban) coincide con `18-SECURITY.md` §9 y con la memoria del proyecto, pero el valor no es la coincidencia: es que ahora hay una salida cruda pegada, y `18-VERIFICATION.md:152` queda marcado como obsoleto.
- **No se emite una migración 075.** Los dos criterios de privilegios (`pg_proc` y `pg_default_acl` para el creador `postgres`) se cumplen en producción. Lo único abierto es la residualidad de `supabase_admin`, que ninguna migración puede cerrar desde este proyecto.
- **La 074 no se tocó, ni siquiera para arreglar un comentario.** Ya corrió en producción; la regla del proyecto es corregir con una migración nueva, nunca editando un archivo aplicado.
- **El reflejo usa el formato del dump, no el de la migración,** en la única línea donde difieren (el modo de seguridad). El `schema.sql` tiene que leerse como lo que es —el estado base del schema— y no como una copia del historial.

## Deviations from Plan

**1. [Registro] El `NOTIFY` del Paso 4 no quedó confirmado explícitamente**

- **Encontrado durante:** Task 1 (lectura del reporte del operador)
- **Qué pasó:** el operador confirmó los pasos 1, 2, 3, 5 y 6 con salidas crudas, y confirmó haber aplicado la 074. No mencionó el `NOTIFY`.
- **Cómo se trató:** no se asume ni a favor ni en contra. Queda registrado arriba con su consecuencia (`PGRST202` en **cada** guardado) y su verificación natural (el primer guardado de horarios en producción tras el deploy). No gatea el cierre del plan porque la corrección, si hiciera falta, es una línea en el editor SQL y no requiere migración.
- **Sin cambio de código.**

**2. [Limitación conocida, heredada de la 073 y ya documentada por el 19-02] La fila de `supabase_admin` en `pg_default_acl` sigue con `anon=X`**

- **Encontrado durante:** Task 1, Paso 6
- **Criterio estricto del plan:** *"el rol anónimo ya no tiene que figurar con ejecución"*. Figura, pero **sólo** en la fila del creador `supabase_admin`, no en la de `postgres` — que es el criterio que el propio plan acota (*"el creador que importa en este proyecto es `postgres`"*).
- **Por qué no es bloqueo y por qué no corresponde una 075:** ver §La residualidad de `supabase_admin`, arriba. Es una limitación de plataforma (`42501`), idéntica a la que la 073 dejó sobre TABLES.
- **Sin cambio de código.**

**3. [Formato] La línea del modo de seguridad se reflejó en una sola línea**

- **Encontrado durante:** Task 2
- **Motivo:** el plan pide *"el mismo formato con el que el dump escribe las demás funciones del schema"*, y el dump emite el modo de seguridad pegado al `LANGUAGE` (`LANGUAGE "plpgsql" SECURITY DEFINER` en `book_slot_atomic`). La migración lo escribe en dos líneas.
- **Impacto:** ninguno funcional — verificado por replay real contra Postgres. Es la única diferencia de código entre los dos archivos.

## Issues Encountered

- **Ninguno bloqueante.** El único roce fue operativo: `docker cp` / `docker exec` desde Git Bash en Windows reescriben las rutas POSIX (`/tmp/replay.sql` → `C:/Users/.../Temp/replay.sql`). Se resolvió con `MSYS_NO_PATHCONV=1`. Vale anotarlo para futuras validaciones por replay en esta máquina.

## Known Stubs

Ninguno. Este plan no toca código de la app.

## Threat Flags

Ninguna superficie de seguridad fuera del `<threat_model>` del plan. Estado de las 6 amenazas registradas:

| Amenaza | Estado | Evidencia |
|---|---|---|
| T-19-31 (funcion aplicada sin su bloque de privilegios ⇒ ejecutable por `anon`) | **CERRADA** | Paso 5 contra producción: `prosecdef = false`, sin `anon` en el `acl`, `authenticated=X` |
| T-19-32 (aplicar sin recargar el caché de esquema ⇒ todos los guardados fallan) | **ABIERTA / no confirmada** | El Paso 4 no fue confirmado explícitamente. Consecuencia y verificación natural documentadas en §Pendiente operativo. La mitigación del lado del código (mapeo de `PGRST202` a copy propia, P-05) sí está implementada por el Plan 19-05 |
| T-19-33 (deployar antes de la migración, como pasó con la 068) | **CERRADA** | La 074 quedó aplicada **antes** del deploy del código de la fase |
| T-19-34 (aplicar la 074 sobre una base sin la 071/073) | **CERRADA por medición** | Paso 1: las cuatro banderas en `true` antes de aplicar la 074 |
| T-19-35 (cerrar la fase sin evidencia del estado de producción) | **CERRADA** | Las salidas crudas de los pasos 1, 5 y 6 están pegadas en este SUMMARY |
| T-19-SC (cadena de suministro) | **accept** | Cero paquetes nuevos: `git diff --name-only` toca sólo `supabase/schema.sql` |

**Nota para `secure-phase`:** hay **dos** ítems que leer acá y no en otro lado — (a) T-19-32 queda sin confirmación operativa del `NOTIFY`, y (b) la residualidad de `supabase_admin` en `pg_default_acl`, que es la misma que el Plan 19-02 y la migr. 073 ya anotaron y que ninguna migración de este proyecto puede cerrar.

## Next Phase Readiness

La fase queda cerrada del lado de la base: producción tiene las 071/072/073/074 aplicadas, la función corre en modo invocador y el rol anónimo no puede ejecutarla. El repo (`supabase/schema.sql`) refleja lo que hay en la base.

**La próxima migración libre del proyecto es la 075.**

Dos cosas para quien siga:

1. **Al deployar, mirar el primer guardado de horarios en producción.** Si devuelve el error de función inexistente, falta el `NOTIFY pgrst, 'reload schema';` — una línea en el editor SQL, sin migración.
2. **`18-VERIFICATION.md:152` está obsoleto** sobre el estado de producción. La fuente correcta es este SUMMARY y `18-SECURITY.md` §9.

Sin blockers.

## Self-Check: PASSED

- `supabase/schema.sql` — FOUND (modificado, 190 líneas agregadas / 0 borradas)
- `supabase/migrations/074_save_agenda_blocks.sql` — FOUND e **intacto** (`git diff` vacío)
- commit `f833cbf` — FOUND

---
*Phase: 19-el-panel · Plan 06 · workstream motor-reservas*
*Completed: 2026-08-26*
