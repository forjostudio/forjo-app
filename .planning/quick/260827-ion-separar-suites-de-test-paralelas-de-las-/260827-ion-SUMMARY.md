---
phase: quick-260827-ion
plan: 01
subsystem: testing
tags: [vitest, supabase, postgrest, test-isolation, teardown, flake]

requires:
  - phase: v0.12 motor-reservas
    provides: los fixtures multi-tenant (test/helpers/booking-fixtures.ts, supabase-fixtures.ts) y las suites abono-*
provides:
  - "Split pure/db en vitest.config.mts: las 27 suites DB-backed corren serializadas, el resto en paralelo"
  - "Clasificador derivado (test/suite-split.ts) + guard puro que impide reintroducir la interferencia"
  - "cleanupOrThrow / cleanupAllOrThrow: el teardown falla fuerte, con label y motivo"
affects: [cualquier fase futura que agregue suites DB-backed, CI]

tech-stack:
  added: []
  patterns:
    - "Clasificacion de suites DERIVADA del import marcador, nunca una lista escrita a mano"
    - "Teardown que chequea el resultado de sus delete() y falla nombrando la limpieza"

key-files:
  created:
    - test/suite-split.ts
    - test/suite-split.test.ts
    - test/helpers/cleanup.ts
    - test/cleanup-helper.test.ts
  modified:
    - vitest.config.mts
    - test/helpers/booking-fixtures.ts
    - test/helpers/supabase-fixtures.ts
    - test/abono-create.test.ts
    - test/abono-cron.test.ts
    - test/abono-generation.test.ts

key-decisions:
  - "D-01: la lista db se calcula al cargar el config leyendo test/, anclada al import desde './env'"
  - "DESVIACION: el proyecto 'pure' se define por EXCLUSION, no por include — un include con la lista de test/ habria dejado de correr 21 suites co-ubicadas en app/, lib/ y components/"
  - "D-03: el helper se aplica SOLO a hooks de teardown, no a los ~60 delete() del repo"
  - "D-04: cleanupAllOrThrow corre todas las operaciones aunque una falle, y tira una sola vez al final"

patterns-established:
  - "Marcador de suite DB-backed = import estatico desde './env'; el guard test/suite-split.test.ts lo hace obligatorio"
  - "Todo delete() de teardown pasa por cleanupOrThrow/cleanupAllOrThrow"

requirements-completed: [ION-01, ION-02]

duration: ~55min
completed: 2026-08-27
status: complete
---

# Quick 260827-ion: separar las suites paralelas de las que tocan la base — Summary

**`npm test` sin flags pasa en verde de forma repetida: las 27 suites que pegan contra el Supabase local corren de a una en su propio proyecto vitest, el resto sigue en paralelo, y un `delete()` de teardown que falla ahora tira un Error con nombre en vez de contaminar el archivo siguiente.**

## Performance

- **Tareas:** 2/2
- **Archivos modificados:** 10 (4 nuevos, 6 editados)
- **Codigo de produccion tocado:** cero (`app/`, `lib/`, `supabase/` intactos)
- **Dependencias nuevas:** cero

## Que se construyo

### ION-01 — Split pure/db

`vitest.config.mts` declara dos `test.projects`:

- `pure` — corre con los workers por defecto. Se define **excluyendo** las suites db del include por defecto.
- `db` — `include` = las 27 suites DB-backed, con `fileParallelism: false` (→ `maxWorkers: 1`, grupo secuencial propio que se encola al final).

La lista NO esta escrita a mano: `test/suite-split.ts` lee `test/` al cargar el config y clasifica por el
import estatico desde `'./env'`. El mismo modulo lo consume `test/suite-split.test.ts` (guard puro), asi que
la regla tiene una sola fuente de verdad.

Tres detectores:

- `splitSuites()` — el reparto.
- `findSubdirSuites()` — suites en subcarpetas de `test/`, que el clasificador no ve.
- `findUnmarkedDbSuites()` — suites que usan los fixtures o `@supabase/supabase-js` sin el marcador `'./env'`.

### ION-02 — El teardown falla fuerte

`test/helpers/cleanup.ts` expone `cleanupOrThrow(label, op)` y `cleanupAllOrThrow({ label: op })`. El mensaje
lleva el prefijo `[test/cleanup]`, el label (tabla + tenant) y el motivo (`message` + `code` de PostgREST).

Aplicado a: `teardownOneTenant`, el `teardown` de `supabase-fixtures`, y los `afterEach` de
`abono-create` / `abono-cron` / `abono-generation`.

## El reparto final y la correccion al listado del brief

**27 db / 54 pure**, sobre 81 archivos de test.

Dos correcciones al conteo del brief, ambas verificadas en el repo:

1. **Los 2 falsos positivos del listado de 29 (confirmado).** `grep -l hasSupabaseCreds test/*.test.ts` da 29,
   pero `test/appointment-service.test.ts` y `test/appointment-time.test.ts` nombran el token en un comentario
   en **prosa** — justamente para explicar que NO lo usan — y no tocan la base. Anclado al import, el set real
   es **27**. El guard tiene anclas de regresion para los dos.

2. **El plan asumia 58 archivos totales; son 81.** Hay **21 suites co-ubicadas** fuera de `test/`
   (`app/(crm)/admin/*.test.ts`, `components/**`, `lib/**`) que matchea el include por defecto de Vitest. Si el
   proyecto `pure` se hubiera definido con un `include` de la lista de `test/` — como decia el plan, que
   esperaba "31 pure" —, esas 21 suites **habrian dejado de correr en silencio**: un falso verde peor que el
   bug original. Por eso `pure` se define **excluyendo** `dbSuites` del include por defecto. Efecto lateral
   deseable: toda suite nueva cae en `pure` sola, y lo unico que cambia de carril es lo que el clasificador
   marca como DB-backed. (Se verifico que ninguna de las 21 toca la base: la unica que menciona
   `@supabase/supabase-js` es `lib/abono-cancel.test.ts`, y con `import type`, que se borra al compilar.)

Conteo final: 27 (db) + 32 (pure en `test/`, 31 originales + el guard nuevo) + 21 (co-ubicadas) + 1
(`test/cleanup-helper.test.ts`) = 81.

## Mediciones (numeros reales, sin maquillar)

Supabase local arriba (`supabase_db_forjo-app`, `supabase_rest_forjo-app`), `.env.test.local` presente.
Todos los runs reportan **27 passed** en el carril db — no skipped.

| Run | Modo | Test Files | Duration |
|-----|------|-----------|----------|
| baseline (antes del cambio) | `--fileParallelism=false` | 79 passed | **92.35s** |
| baseline (antes del cambio) | `vitest run` sin flags | *fallaba: 5 tests en los 3 abono-** | — |
| 1 | `npm test` (split) | 81 passed | 110.35s |
| 2 | `npm test` (split) | 81 passed | 93.99s |
| 3 | `npm test` (split) | 81 passed | 121.05s |
| 4 | `npm test` (split) | 81 passed | 93.51s |
| 5 | `npm test` (split) | 81 passed | **63.98s** |
| 6 | `npm test` (split) | 81 passed | **62.40s** |
| control | `--fileParallelism=false` con el config nuevo | 81 passed | 135.95s / 139.19s |

Por proyecto, aislados: `--project=pure` = 53 archivos en **11.22s**; `--project=db` = 27 archivos en **67.11s**.

**Lectura honesta de estos numeros.** La varianza de la maquina es enorme (62s a 121s para el MISMO comando),
asi que ninguna comparacion de una sola medicion prueba nada. Lo que si se sostiene:

- Los 27 archivos serializados **dominan el wall time** (67s de un run de ~63-120s). La ganancia es la mitad
  pura, que baja de minutos-de-cola a 11s. No hay ningun 10x acá y nunca lo iba a haber.
- Comparado **contra si mismo bajo las mismas condiciones**, el split gana claro: en la corrida pareada,
  serializado 227s vs split 93.51s; en los controles posteriores, 136-139s serializado vs 62-64s con el split.
- Contra el baseline pre-cambio de 92.35s la comparacion es ruidosa: hay runs del split por encima (110s, 121s)
  y por debajo (62s, 64s). Los dos runs mas rapidos y mas limpios del split (62.40s / 63.98s) quedan **por
  debajo** del baseline, pero con esta varianza no lo declaro un 30% de mejora. Lo que importa acá es que
  **`npm test` sin flags dejo de fallar**; la velocidad es secundaria y quedo, en el peor caso, pareja.
- **6 corridas consecutivas en verde** de `npm test` con el codigo final (+1 mas con el codigo intermedio).
  El bug era una carrera, asi que esto es evidencia razonable, no prueba.

## Verificaciones

- `./node_modules/.bin/tsc --noEmit` → exit 0 (binario local; `npx tsc` es falso verde en este repo).
- eslint acotado a los 10 archivos tocados → exit 0, **cero findings nuevos**. Aparece 1 warning
  **preexistente**: `'SupabaseClient' is defined but never used` en `test/abono-cron.test.ts:2` (import muerto
  desde antes; verificado con `git show HEAD:` — misma cantidad de ocurrencias antes y despues). Fuera de
  alcance, no se toco.
- Prueba negativa del guard, ejecutada de verdad: se creo un `test/zz-tmp-guard-probe.test.ts` que importa
  `seedOneTenant` sin el marcador `'./env'` → `test/suite-split.test.ts` fallo con
  `expected [ 'test/zz-tmp-guard-probe.test.ts' ] to deeply equal []`. Archivo eliminado despues.
- Prueba negativa del helper: cubierta por `test/cleanup-helper.test.ts` (5 casos, incluido "las 3 ops corren
  aunque falle la primera" y "el error nombra a TODAS las fallidas").
- Cero cambios en `app/`, `lib/`, `supabase/`, `package.json`, `package-lock.json` y
  `.planning/workstreams/motor-reservas/phases/19-el-panel/` (verificado con `git diff --name-only`).

## Anomalia sin resolver (se reporta, no se tapa)

En **una** de las corridas de control con `--fileParallelism=false` (la mas lenta, 227.25s), Vitest reporto
`1 failed | 80 passed`. No capture el nombre del archivo y **no se reprodujo en 2 intentos posteriores** del
mismo comando (139.19s y 135.95s, ambos 81/81). Notas:

- Fue bajo **serializacion total**, no bajo `npm test`. El modo que este cambio arregla nunca fallo.
- Esa corrida tardo 227s contra ~137s de las otras dos → la maquina estaba muy cargada; un timeout de test es
  la hipotesis mas probable, pero **es una hipotesis, no un diagnostico**.
- Ningun teardown tiro el Error nuevo (`limpieza fallida`) en ninguna corrida, asi que no hay evidencia de que
  haya sido contaminacion de datos.

Si vuelve a aparecer, el mensaje ya no va a ser mudo: cualquier limpieza caida ahora nombra tabla y motivo.

## Desviaciones del plan

**1. [Rule 1 - Bug] El proyecto `pure` se define por exclusion, no por include**
- **Encontrado en:** Task 1, al medir el baseline (79 archivos, no 58).
- **Problema:** el plan derivaba `pure` de la lista de `test/` y esperaba 31 archivos. Con un `include` asi,
  las 21 suites co-ubicadas en `app/`, `lib/` y `components/` habrian dejado de ejecutarse sin ningun aviso.
- **Arreglo:** `{ name: 'pure', exclude: [...defaultExclude, ...dbSuites] }`. `splitSuites()` conserva su
  contrato (`{ db, pure }`); el config usa `db` para las dos cosas (include de uno, exclude del otro) y `pure`
  queda como insumo de las aserciones del guard.
- **Impacto en los `<verify>` del plan:** los numeros esperados cambian — `pure` reporta **53**, no 31, y el
  total pasa de 79 a 81 (2 tests nuevos). `db` reporta **27 passed**, como pedia el plan.
- **Archivos:** `vitest.config.mts`, `test/suite-split.ts` (documentado en el JSDoc de `splitSuites`).
- **Commit:** aee6bc8

**2. [Rule 2 - Robustez] `cleanupAllOrThrow` tambien atrapa rechazos, no solo `{ error }`**
- Si la request se cae a nivel red, el `await` rechaza en vez de devolver `{ error }`. Sin el `try/catch`
  interno esa excepcion escapaba del bucle y las limpiezas siguientes no corrian — exactamente lo que D-04
  quiere evitar. Se agrego el catch y se documento el porque.
- **Commit:** 4f8c84b

**3. [Nota de alcance] `abono-create` y `abono-cron` usan el singular, no el plural**
- El orden `delete(appointments)` → `purgeAbonos()` es load-bearing (hay que borrar los turnos antes de
  archivar la serie). Meter los `delete()` en el mapa de `cleanupAllOrThrow` los sacaria de esa secuencia, asi
  que ahi va `cleanupOrThrow` por operacion. `abono-generation`, que limpia 3 tablas sin nada intercalado, si
  usa el plural como pedia el plan. Documentado en cada hook.

## Como se rompe esto en el futuro (y que lo va a avisar)

- Suite DB-backed nueva sin `import ... from './env'` → falla `test/suite-split.test.ts` nombrando el archivo.
- Suite dentro de `test/alguna-subcarpeta/` → falla el mismo guard (el clasificador solo mira el primer nivel,
  asi que ahi adentro nunca entraria al carril serializado).
- Limpieza de teardown que se cae → `[test/cleanup] limpieza fallida: <label> — <motivo>`, en el archivo donde
  paso, no dos archivos despues.

## Self-Check: PASSED

Archivos verificados en disco: `test/suite-split.ts`, `test/suite-split.test.ts`, `test/helpers/cleanup.ts`,
`test/cleanup-helper.test.ts`, `vitest.config.mts`.
Commits verificados en `git log`: 9e98fc1, aee6bc8, 2979f93, 4f8c84b.
