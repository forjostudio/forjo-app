---
phase: 19-el-panel
plan: 02
subsystem: database
tags: [postgres, plpgsql, rpc, rls, multi-tenant, migracion, vitest, agenda, time-blocks]

# Dependency graph
requires:
  - phase: 18-la-agenda-por-servicio
    provides: "time_block_services (migr. 071) con sus 4 policies + las FK compuestas de pertenencia al tenant (migr. 073), en las que este plan se apoya sin reimplementarlas"
  - phase: 19-el-panel
    provides: "lib/agenda-hours-payload.ts (Plan 19-01): AgendaBlockPayload fija el shape del parametro y SavedAgendaBlock el del retorno"
provides:
  - "public.save_agenda_blocks(uuid, jsonb): el guardado de la agenda por DIFF, transaccional (D-04), que deja de destruir el mapeo franja-servicio en cada guardado de horarios"
  - "Los 4 codigos de dominio del write path: not_your_business / invalid_payload / invalid_block / block_not_found"
  - "El cierre del default de FUNCTIONS para el rol anonimo: de aca en mas toda funcion nueva del schema public necesita un GRANT explicito"
  - "test/agenda-save-blocks-rpc.test.ts: el test de aislamiento cross-tenant que la Phase 18 dejo faltando (WR-05), ahora cubriendo el write path"
affects: [19-04, 19-05, 19-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "RPC de escritura del panel en modo INVOKER (no DEFINER): la RLS del dueno aplica adentro y el business_id explicito es la segunda capa, no la unica"
    - "REVOKE EXECUTE sobre una funcion nueva + cierre del default de FUNCTIONS: primer precedente del repo (las 8 migraciones previas que tocan privilegios de funcion hacen lo contrario)"
    - "Guardado por estado deseado completo (no delta) resuelto con un diff server-side dentro de una sola transaccion"

key-files:
  created:
    - supabase/migrations/074_save_agenda_blocks.sql
    - test/agenda-save-blocks-rpc.test.ts
  modified: []

key-decisions:
  - "El retorno de la funcion son las 7 columnas de SavedAgendaBlock y nada mas: sin WITH ORDINALITY, sin eco de claves temporales. Se honra la decision del 19-01 (la re-derivacion completa elimina la clase de bug de correlacion en vez de administrarla)"
  - "La fila cross-tenant de la puente NO se valida en la funcion: la rechazan las FK compuestas de la 073. Reimplementarla en plpgsql crearia una segunda fuente de verdad que puede divergir"
  - "El UPDATE que no toca ninguna fila lanza block_not_found en vez de degradar a INSERT: un fallo mudo dejaria al dueno con una configuracion distinta a la que vio en pantalla"
  - "El bloque de degradacion del ALTER DEFAULT PRIVILEGES de supabase_admin se copia tal cual de la 073, con su limitacion conocida: la entrada de ese creador queda intacta"

patterns-established:
  - "Pattern: una funcion nueva del schema public nace sin privilegios de cliente y necesita su GRANT explicito"
  - "Pattern: la prueba de mordida sobre un control de aislamiento se corre en las DOS direcciones (sacar la RLS, sacar el filtro explicito) para medir cual capa sostiene que"

requirements-completed: [AGENDA-05]

# Metrics
duration: 15min
completed: 2026-08-26
status: complete
---

# Phase 19 Plan 02: La migración 074 — el guardado atómico de la agenda Summary

**`public.save_agenda_blocks(uuid, jsonb)`: el guardado de horarios pasa de borrar-todo-e-insertar a un diff transaccional que conserva el mapeo franja↔servicio — en modo INVOKER, sin acceso del rol anónimo, y con 9 casos de aislamiento y atomicidad verdes contra el Postgres local.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-08-26T03:14:00Z
- **Completed:** 2026-08-26T03:29:00Z
- **Tasks:** 3 (1 migración, 1 validación local, 1 suite de tests)
- **Files modified:** 2 (los 2 creados; cero archivos modificados)

## Accomplishments

- **El mapeo dejó de ser destruible.** Hoy `saveHours()` borra todos los bloques del negocio y reinserta; `time_block_services` es hijo con `ON DELETE CASCADE`, así que cualquier mapeo que el dueño configurara se autodestruía al siguiente guardado de horarios, cayendo a un estado (comodín) visualmente idéntico a "todavía no configuré nada". La 074 lo convierte en un UPDATE sobre la misma fila: el hijo ni se entera. Congelado por el caso 2 del test.
- **Se cerró la ventana de estado intermedio que veía el público.** Entre el DELETE y el INSERT de hoy, `/api/booking/availability` lee un negocio sin horarios o con el mapeo viejo. Con una sola llamada dentro de una transacción no hay estado intermedio observable (D-04). El caso 8 lo verifica por **ausencia de filas**, incluido el rollback del DELETE del diff.
- **No se repitió RA-05.** La función corre con los privilegios del invocador —al revés del único RPC no-trigger que hoy tiene el schema— así que la RLS de `time_blocks`, `time_block_services` y `businesses` aplica adentro. Y el rol anónimo no puede ejecutarla: verificado contra `pg_proc.proacl` y con el caso 9 del test.
- **Se cerró la fábrica, no sólo la instancia.** El default de FUNCTIONS del schema `public` dejaba nacer a toda función nueva ejecutable por el rol anónimo (baseline `:3081`, que la 073 no tocó porque sólo revocó defaults sobre TABLES). La §3 lo revoca: de acá en más toda función nueva necesita un GRANT explícito.
- **WR-05 de la Phase 18 cerrado para el write path.** La auditoría anterior marcó "cero test de aislamiento cross-tenant para la tabla nueva". Ahora hay 4 vectores cubiertos: franja ajena, servicio ajeno, negocio ajeno y rol anónimo.

## Task Commits

1. **Task 1 — la migración 074** — `2c1f6c5` (feat) — `supabase/migrations/074_save_agenda_blocks.sql`, 360 líneas
2. **Task 2 — validación LOCAL** — *sin commit propio*: es una tarea de verificación pura y no requirió ninguna corrección sobre la migración (el `db reset` salió limpio al primer intento). Su evidencia está abajo, en §Task 2.
3. **Task 3 — la suite del RPC** — `5561a8f` (test) — `test/agenda-save-blocks-rpc.test.ts`, 355 líneas, 9 casos

**Plan metadata:** ver el commit `docs(19-02)` posterior.

## Files Created/Modified

- `supabase/migrations/074_save_agenda_blocks.sql` — **nuevo, 360 líneas.** Cabecera al molde de la 071 (contexto medido, `Qué hace` numerado, las dos divergencias explícitas, `Qué NO hace`, runbook con `NOTIFY pgrst` y las dos consultas de verificación posterior) + 3 secciones: la función, sus privilegios, y el cierre del default de FUNCTIONS.
- `test/agenda-save-blocks-rpc.test.ts` — **nuevo, 355 líneas.** 1 `describe`, 9 `it`, arranque espejado de `test/isolation.test.ts` (2 clientes anon-key autenticados + los 2 guards anti-falso-verde).
- **`supabase/schema.sql` NO se tocó** — es del Plan 19-06, junto con la aplicación a producción.
- `package.json` / `package-lock.json` — **sin cambios**: cero dependencias nuevas.

## Task 2 — validación LOCAL (la evidencia)

**`npx supabase db reset`** replayó el baseline numerado completo, la 074 incluida, **sin ningún `ERROR:` de SQL**:

```
Applying migration 071_time_block_services.sql...
Applying migration 072_public_views_read_only.sql...
Applying migration 073_tenant_integrity_and_default_privs.sql...
Applying migration 074_save_agenda_blocks.sql...
Seeding data from supabase/seed.sql...
Finished supabase db reset on branch main.
```

**La consulta booleana del plan devolvió `t`** (existe una vez · modo invocador · sin el rol anónimo en su lista de privilegios · con `authenticated`).

**El valor crudo de la lista de privilegios** — es la evidencia de P-02 y lo que el Plan 19-06 va a repetir contra producción:

```
save_agenda_blocks | prosecdef=false | {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
```

**El default de FUNCTIONS del schema `public`, por creador:**

```
supabase_admin -> {postgres=X/supabase_admin,anon=X/supabase_admin,authenticated=X/supabase_admin,service_role=X/supabase_admin}
postgres       -> {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
```

La entrada de `postgres` —el creador que importa— ya **no** concede ejecución al rol anónimo. La de `supabase_admin` sigue igual: ver §Desviaciones, es la misma limitación conocida y aceptada de la 073.

**Idempotencia real (no declarada):** el archivo se re-ejecutó sobre la base ya reseteada con `docker exec -i ... psql -f -` y salió limpio (`CREATE FUNCTION / ALTER FUNCTION / REVOKE / REVOKE / GRANT / ALTER DEFAULT PRIVILEGES / DO` + el `NOTICE` esperado del bloque de degradación). La lista de privilegios quedó idéntica después: `CREATE OR REPLACE` conserva la ACL ya ajustada.

**Cero contacto con remoto.** No se ejecutó `supabase db push`, ni `supabase link`, ni `supabase migration up --linked`, ni se abrió el editor SQL del dashboard. Medido además del lado del test: la suite corrió contra `NEXT_PUBLIC_SUPABASE_URL` = `127.0.0.1:54321` (verificado imprimiendo sólo el host, sin exponer el archivo de entorno). La aplicación a producción es el Plan 19-06.

## Verificación (los 11 puntos del plan)

| # | Chequeo | Resultado |
|---|---|---|
| 1 | `npx supabase db reset` sin `ERROR:` | **limpio** |
| 2 | Consulta booleana de `pg_proc` | **`t`** |
| 3 | `pg_default_acl` (`defaclobjtype='f'`), creador `postgres` | sin `anon=X` ✅ · creador `supabase_admin` intacto (ver §Desviaciones) |
| 4 | `^REVOKE EXECUTE ON FUNCTION ` / `^GRANT EXECUTE ON FUNCTION ` / `^GRANT...TO "anon"` | **2** / **1** / **0** |
| 5 | `SECURITY DEFINER` / `SECURITY INVOKER` | **0** / **1** |
| 6 | `^(CREATE\|ALTER) TABLE` / `^(CREATE\|DROP) POLICY` / nombre del RPC del motor | **0** / **0** / **0** |
| 7 | `sed` sobre el INSERT y el UPDATE de `time_blocks` buscando la columna de cupo | **0** y **0** |
| 8 | `npx vitest run test/agenda-save-blocks-rpc.test.ts` | **9 passed**, 0 failed, **0 skipped**, exit 0 |
| 9 | Prueba de mordida | ver §Pruebas de mordida — se corrieron **tres**, con un hallazgo |
| 10 | `git diff --name-only` del plan | exactamente los 2 archivos; **`supabase/schema.sql` NO aparece** |
| 11 | `git diff -- package.json package-lock.json` | **vacío** |

Extras: `./node_modules/.bin/tsc --noEmit` exit **0** (leído el output, no sólo el exit code). `npx eslint` sobre el test sale limpio (exit 0); `npm run lint` completo no se corrió — se corta por timeout de 2 min en esta máquina y no es gate de este plan.

`grep -cE "^  it\(" test/agenda-save-blocks-rpc.test.ts` = **9**. `SUPABASE_SERVICE_ROLE_KEY` aparece **2 veces** en el archivo, las dos en el **guard anti-falso-verde** del `beforeAll` (`if (anonKey === process.env.SUPABASE_SERVICE_ROLE_KEY) throw ...`), nunca dentro de un `expect` de aislamiento — verificado leyendo las líneas 72-73.

## Pruebas de mordida (tres, y una dio un hallazgo)

El plan pedía una: sacar el filtro por `business_id` del UPDATE y confirmar que el caso 5 se pone rojo. **No se puso rojo** — y entender por qué valía más que el rojo, así que se corrieron las tres combinaciones. La migración se restauró desde una copia previa después de cada una y el working tree quedó limpio (`git diff --stat` vacío antes de commitear).

| # | Qué se rompió a propósito | Resultado | Qué demuestra |
|---|---|---|---|
| 1 | Se saca `AND tb."business_id" = p_business_id` del UPDATE | **9 passed** (no muerde) | La RLS sola ya frena el ataque: la policy `business access` de `time_blocks` filtra la fila de B antes de que el UPDATE la vea |
| 2 | Se saca el filtro **y** se pone la función en modo DEFINER | **1 failed \| 8 passed** — el único rojo es *"5. CROSS-TENANT por FRANJA AJENA"* | El caso 5 muerde de verdad, y muerde **exactamente** donde debe |
| 3 | Sólo se pone en modo DEFINER, con el filtro puesto | **9 passed** | El `business_id` explícito solo sostiene el aislamiento cuando la RLS no aplica |

**El hallazgo:** las dos capas son **individualmente suficientes** y el caso 5 mide la combinación, no una de las dos. Es exactamente lo que la regla del proyecto pide ("la RLS es la segunda capa, no la única") y ahora está **medido**, no supuesto. La consecuencia práctica para quien mantenga esto: un review que borre una de las dos capas **no va a ver ningún test rojo** — por eso la §(b) de la cabecera de la migración escribe explícitamente que las dos existen a propósito.

## Decisions Made

- **El retorno son las 7 columnas de `SavedAgendaBlock` y nada más.** Se honró la decisión vinculante del Plan 19-01: sin `WITH ORDINALITY`, sin `tmp_key`, sin eco de claves de correlación. El cliente re-deriva su estado entero con `buildDayStatesFromRows`, así que no existe correlación payload↔retorno que mantener — y por lo tanto tampoco existe la clase de bug de correlación.
- **La pertenencia cruzada NO se revalida en plpgsql.** Las FK compuestas `tbs_block_same_tenant` / `tbs_service_same_tenant` (migr. 073) ya rechazan en la base cualquier combinación cross-tenant. Reimplementarlo en la función crearía una segunda fuente de verdad que puede divergir; el punto de la 073 es justamente que ningún consumidor tenga que acordarse. El caso 6 del test verifica que el rechazo llega igual.
- **El UPDATE que no toca ninguna fila lanza `block_not_found`, no degrada a INSERT.** Un id que no existe, que es de otro negocio, o que otra pestaña borró en el medio, es una discrepancia real entre lo que el dueño ve y lo que hay. Degradar a INSERT lo taparía con un bloque duplicado. Falla ruidosa y todo-o-nada.
- **`array_agg(DISTINCT ...)` en la extracción de los `service_id`.** El cliente ya deduplica (`uniqueIds` en `agenda-hours-payload.ts`), pero la función no puede depender de eso: el jsonb viene del browser. Con el `ON CONFLICT DO NOTHING` del INSERT serían dos capas para lo mismo, y las dos cuestan cero.
- **El `RETURNS TABLE` obliga a calificar todas las referencias de columna.** Los nombres de las 7 columnas de salida (`id`, `day_of_week`, `start_time`, …) son parámetros OUT en plpgsql y colisionan con las columnas de `time_blocks`. Se usan alias (`tb`, `tbs`) en absolutamente todos los `WHERE`, `RETURNING` y `SELECT` del cuerpo — incluyendo `INSERT INTO ... AS tb` y `UPDATE ... AS tb`, que es lo que hace que `RETURNING tb."id" INTO v_block_id` no sea ambiguo.

## Deviations from Plan

### Auto-fixed / limitaciones documentadas

**1. [Rule 3 — Bloqueante] El delimitador del cuerpo de la función es `$_$`, no `$$`**

- **Encontrado durante:** Task 1
- **Problema:** el cuerpo de la función y el bloque `DO` de la §3 conviven en el mismo archivo. Con `$$` en los dos, el `DO $$` de la §3 cerraría el cuerpo de la función.
- **Solución:** el cuerpo usa `$_$` (el mismo delimitador que usa `supabase/schema.sql` para las funciones largas del repo) y el `DO` conserva `$$`, igual que en la 073.
- **Commit:** `2c1f6c5`

**2. [Limitación conocida, heredada de la 073] La entrada de `supabase_admin` en `pg_default_acl` sigue concediendo `EXECUTE` al rol anónimo**

- **Encontrado durante:** Task 2
- **Criterio del plan:** *"la consulta de `pg_default_acl` no contiene `anon=X`"*. **Estrictamente, sí lo contiene** — pero sólo en la fila del creador `supabase_admin`, no en la de `postgres`.
- **Por qué queda así:** `postgres` no es miembro de `supabase_admin`, así que el `ALTER DEFAULT PRIVILEGES` sobre ese rol tira `42501 permission denied to change default privileges`. El bloque `DO ... EXCEPTION WHEN insufficient_privilege` lo degrada a `NOTICE` en vez de abortar la migración entera — que es exactamente lo que el plan pedía y el molde que la 073 estableció.
- **Por qué no importa en la práctica:** el creador efectivo de objetos en este proyecto es `postgres` — es el rol con el que corren **tanto** las migraciones del CLI **como** el editor SQL del dashboard de Supabase, o sea las dos únicas vías por las que este proyecto crea objetos. La 073 dejó **exactamente** la misma residualidad sobre TABLES (medido: `supabase_admin -> {... anon=arwdDxtm/supabase_admin ...}`), así que no es una regresión ni un descuido nuevo: es la misma limitación de plataforma, documentada dos veces.
- **Riesgo residual:** si alguna vez alguien crea una función en el schema `public` autenticado como `supabase_admin`, esa función nacería ejecutable por el rol anónimo. **Se anota para el `secure-phase`**; no se gatea.
- **Sin cambio de código.**

**3. [Ampliación de alcance, no desviación] La prueba de mordida se corrió tres veces en vez de una**

- **Encontrado durante:** Task 3
- **Motivo:** la mordida que pedía el plan no muerde (ver §Pruebas de mordida). En vez de reportar "no se puso rojo" y seguir, se corrieron las tres combinaciones para saber **qué capa sostiene qué**. El resultado es evidencia útil para el `secure-phase` y para el Plan 19-06.
- **Sin cambio de código.** La migración se restauró íntegra después de cada mordida.

## Issues Encountered

- **El heredoc de bash se rompió** al escribir un archivo SQL de 360 líneas con `$$`, `$_$` y caracteres de caja Unicode. Se resolvió usando la herramienta de escritura de archivos directamente. La codificación UTF-8 se verificó antes (`od -c` sobre un archivo de prueba con `⚠ ↔ ─ ó`) y el archivo final tiene los acentos y símbolos correctos.
- **`npm run lint` completo se corta por timeout de 2 min** en esta máquina (mismo issue que reportó el Plan 19-01). Sustituido por `npx eslint` acotado al archivo tocado. Vale la advertencia para los Planes 19-04/19-05, donde el lint completo **sí** es gate.
- **`npx vitest run` completo no se corrió a propósito** (constraint del plan: las suites de abono son flaky en paralelo en esta máquina). Se corrió sólo la suite nombrada.

## Known Stubs

Ninguno. La función está completa y ejercitada por 9 casos reales contra Postgres; los 4 códigos de dominio que emite están los 4 cubiertos por el test o por la validación de entrada. El cableado desde la UI (`saveHours` llamando al RPC) es de los Planes 19-04/19-05 por diseño de la fase, y la aplicación a producción del Plan 19-06 — así lo declara la tabla de artefactos del plan.

## Threat Flags

Ninguna superficie de seguridad **fuera** del `<threat_model>` del plan. La única superficie nueva es la función misma, ya registrada en T-19-05 … T-19-12, y las 7 amenazas con disposición `mitigate` tienen su mitigación implementada y verificada:

| Amenaza | Mitigación implementada | Verificación |
|---|---|---|
| T-19-05 (función ejecutable por `anon`) | §2 (REVOKE de PUBLIC + del rol anónimo, GRANT sólo a `authenticated`) + §3 (cierre del default) | `pg_proc.proacl` + caso 9 |
| T-19-06 (`p_business_id` ajeno) | Guard de autoría `owner_id = auth.uid()` + modo INVOKER | Caso 7 (asierta el código de dominio) |
| T-19-07 (`time_block_id` ajeno) | `business_id` en todos los `WHERE`/`INSERT` + RLS + `block_not_found` | Caso 5 + las 3 pruebas de mordida |
| T-19-08 (`service_id` ajeno) | FK compuestas de la 073, no reimplementadas | Caso 6 |
| T-19-09 (guardado a medias) | Una llamada, una transacción; cualquier `RAISE` revierte | Caso 8 (ausencia de filas, incluido el rollback del DELETE) |
| T-19-10 (día/hora fuera de rango) | Validación por elemento (`invalid_block`) + `invalid_payload` | Caso 8 |
| T-19-11 (fuga por el mensaje de error) | La función emite **sólo** códigos snake_case con `ERRCODE = 'P0001'`; la traducción a copy es del Plan 19-05 | Los 4 `RAISE EXCEPTION` del archivo, verificados por grep |

`T-19-12` (payload gigante) y `T-19-SC` (cadena de suministro) quedan como `accept`: el editor está acotado a 7 días × N bloques y `git diff -- package.json package-lock.json` está vacío.

**Nota para el `secure-phase`:** la residualidad de `supabase_admin` en `pg_default_acl` (ver §Desviaciones, punto 2) es la única pieza de T-19-05 que no se pudo cerrar desde una migración. Es idéntica a la que la 073 dejó sobre TABLES.

## Next Phase Readiness

Listo para el **Plan 19-04/19-05**: la firma que el cliente tiene que invocar es
`supabase.rpc('save_agenda_blocks', { p_business_id, p_blocks })`, con `p_blocks` = la salida de
`buildSaveHoursPayload` tal cual, y el retorno alimenta `buildDayStatesFromRows` directo (mismo shape,
`start_time` con segundos). Los 4 códigos de dominio a traducir a copy son `not_your_business`,
`invalid_payload`, `invalid_block` y `block_not_found` — llegan como `error.message` con
`error.code === 'P0001'`, molde de mapeo idéntico a `deleteService` en `settings-client.tsx`. Sumar
`PGRST202` a ese mapeo (P-05): sin el `NOTIFY pgrst` en producción, el síntoma es indistinguible de
un problema de red.

Para el **Plan 19-06**: la migración 074 está **creada y validada en LOCAL, PENDIENTE de aplicación
manual a producción**. El runbook completo está en su cabecera, y las dos consultas de verificación
posterior (`pg_proc` y `pg_default_acl`) están escritas ahí para repetirlas contra prod. `supabase/schema.sql`
sigue **sin reflejar** la 074, a propósito.

Sin blockers.

## Self-Check: PASSED

- `supabase/migrations/074_save_agenda_blocks.sql` — FOUND
- `test/agenda-save-blocks-rpc.test.ts` — FOUND
- commit `2c1f6c5` — FOUND
- commit `5561a8f` — FOUND

---
*Phase: 19-el-panel · Plan 02 · workstream motor-reservas*
*Completed: 2026-08-26*
