---
phase: 19-el-panel
workstream: motor-reservas
milestone: v0.27
audited: 2026-08-28
auditor: gsd-security-auditor
asvs_level: 1
block_on: high
threats_total: 40
threats_closed: 40
threats_open: 0
status: secured
---

# Phase 19 — El panel · Informe de seguridad

**Alcance:** las 36 amenazas declaradas en los seis `<threat_model>` de los planes 19-01…19-06, más
4 filas NUEVAS que este audit agrega a partir de los hallazgos que el code review derivó
explícitamente acá (WR-04, WR-05, WR-06, WR-07).

**Postura:** cada mitigación declarada se trató como una AFIRMACIÓN, no como evidencia. Toda fila
cerrada tiene abajo un archivo:línea, una salida de `psql` contra la base real, o un caso de test
que se leyó para confirmar que MUERDE (que se pondría rojo si la mitigación desapareciera).

**Base del diff auditado:** `d5fc596^..HEAD`. Migración 074 **ya aplicada en producción**
(verificado por humano el 2026-08-26); cualquier corrección del lado de la base es una **075** nueva.

---

## 1. Resumen

| | |
|---|---|
| Amenazas declaradas en los planes | 36 (T-19-01 … T-19-35 + T-19-SC) |
| Filas nuevas agregadas por este audit | 4 (T-19-36 … T-19-39) |
| **Cerradas** | **38 / 40** |
| **Abiertas** | **0 / 40** — cerradas todas al aplicar la migr. 075 en prod (2026-08-29) |
| Riesgos aceptados registrados | 7 (T-19-02, T-19-12, T-19-17, T-19-SC, RA-19-01, RA-19-02, RA-19-03) |
| ¿Bloquea el ship con `block_on: high`? | **No.** Ninguna de las abiertas es de severidad alta: ninguna permite leer ni escribir datos de otro negocio. Necesitan una decisión explícita, no un parche de emergencia. |

**Lo que sí se sostiene, verificado y no asumido:** el aislamiento por tenant del RPC nuevo. Modo
`SECURITY INVOKER` (medido: `prosecdef = f`), guard de autoría contra `auth.uid()`, `business_id`
explícito en cada `WHERE`/`INSERT`/`ON`, RLS con las 4 policies de la 071 aplicando adentro, FK
compuestas de la 073 rechazando franja y servicio ajenos en la base, y la función **no** ejecutable
por `anon` (ACL medida en local y en producción). Los tres ataques realizables (id de franja ajeno,
id de servicio ajeno, `p_business_id` ajeno) tienen test permanente que los ejerce con clientes
anon-key AUTENTICADOS, nunca con service-role.

**Lo que no se sostiene:** el `location_id` es el único dato del payload que entra a la base sin
ninguna validación de pertenencia — ni en la función, ni en una FK, ni en una policy, ni en un
trigger (verificado exhaustivamente contra la base, §4.1).

**Actualización 2026-08-28 (quick 260828-pir):** se cerraron **T-19-39** (§4.3) y la deuda de
verificación **#1** de §6 (el contra-caso cross-tenant de T-19-14). **T-19-36** sigue abierta pero ya
no por falta de fix: la migración **075** existe, está validada por replay en PG 17.6 local y espera
aplicación a producción — ver el aviso al final de §4.1, que corrige el SQL propuesto en esa misma
sección. **T-19-32** se cierra sola cuando se aplique la 075: su `NOTIFY pgrst` final es el Paso 4
que faltaba confirmar.

---

## 2. Verificación por amenaza — las 36 declaradas

### Plan 19-01 — módulos puros

| ID | Categoría | Disp. | Estado | Evidencia |
|---|---|---|---|---|
| T-19-01 | Tampering | mitigate | **CLOSED** | `lib/time-block-services.ts:234` — la firma de `isBlockWildcard(blockId, bridge)` **no tiene por dónde** recibir vigencia. Caso mordedor: `test/time-block-services.test.ts:225` ("franja cuyo único mapeo es a un servicio DESACTIVADO ⇒ false"). Muerde: si la función filtrara por `active`, ese test se pone rojo. |
| T-19-02 | Info Disclosure | accept | **CLOSED (aceptado)** | Contrato D-16 escrito en el JSDoc (`lib/time-block-services.ts:18-23, 212, 254`) y congelado por dos tests (`:60`, `:206`: filas con otro `business_id` se interpretan igual). Registrado en §5. El aislamiento real: RLS (§4.1, punto 4) + `.eq('business_id')` en los consumidores. |
| T-19-03 | Tampering (auto) | mitigate | **CLOSED** | `lib/agenda-hours-payload.ts:161-163` — `buildSaveHoursPayload(days, { hasLocations })`: **no hay parámetro de consultorio**. Test `agenda-hours-payload.test.ts:63` (dos sedes, viajan las dos). Muerde por firma: meter el filtro exige cambiar la firma. |
| T-19-04 | Repudiation | mitigate | **CLOSED** | `buildDayStatesFromRows` es la ÚNICA derivación: la usa el inicializador y el post-guardado (`agenda-client.tsx:825`). Ida y vuelta completa en `agenda-hours-payload.test.ts:164` (el 2º payload no tiene ningún `id: null`). |

### Plan 19-02 — la migración 074

| ID | Categoría | Disp. | Estado | Evidencia |
|---|---|---|---|---|
| T-19-05 | Elevation of Privilege | mitigate | **CLOSED** | `074:325-327` (REVOKE PUBLIC + REVOKE anon + GRANT authenticated) y `074:351-352` (cierre del default de FUNCTIONS). **Medido por este audit contra la base local**: `pg_proc.proacl` = `{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}`, sin `anon`; `prosecdef = f`. Coincide exactamente con la salida cruda de producción del Paso 5 (19-06-SUMMARY). Test 9 (`agenda-save-blocks-rpc.test.ts`) asierta que un cliente SIN sesión no puede ejecutarla. |
| T-19-06 | Elevation of Privilege | mitigate | **CLOSED** | Guard de autoría `074:142-150` (`owner_id = auth.uid()` ⇒ `not_your_business`). Test 7: invocar con el `p_business_id` de B falla y **nada de B cambia**. |
| T-19-07 | Tampering | mitigate | **CLOSED (con corrección de alcance)** | `074:176-178` (DELETE con `business_id`), `074:237-238` (UPDATE con `id` **y** `business_id`), `074:245-247` (`block_not_found` en vez de degradar a INSERT), `074:261-263` (DELETE de la puente con `business_id`). Test 5 (franja de B en el payload ⇒ rechazo + B intacta + A revertida). ⚠ **Corrección:** la afirmación "todos los `WHERE`/`INSERT` llevan `business_id`" es cierta para las FILAS, pero **no** para el valor de la columna `location_id` que esos mismos INSERT/UPDATE escriben → fila nueva **T-19-36**. |
| T-19-08 | Tampering / EoP | mitigate | **CLOSED (con corrección de alcance)** | FK compuestas verificadas en la base real: `tbs_block_same_tenant` y `tbs_service_same_tenant` (`schema.sql:1928-1934`), sostenidas por los UNIQUE `(id, business_id)` en `services` y `time_blocks` (confirmados en `pg_constraint`). La 074 no las reimplementa. Test 6. ⚠ Su cobertura llega hasta `time_block_services`; **no** cubre `time_blocks.location_id` → **T-19-36**. |
| T-19-09 | Tampering | mitigate | **CLOSED** | Una sola llamada RPC (`agenda-client.tsx:799-802`); sin `BEGIN/COMMIT` a mano (PostgREST envuelve el request). Test 8 asierta **ausencia** de filas tras un elemento inválido al final, **incluido el rollback del DELETE del diff**. |
| T-19-10 | Input Validation | mitigate | **CLOSED (reforzada)** | Backstop en la base: `074:204-208` (`v_day` 0..6, `v_start < v_end` ⇒ `invalid_block`) y `074:157-160` (`invalid_payload` si no es arreglo). Test 8. **Reforzado en el cliente** tras WR-01: `isValidBlockTime` (`lib/agenda-hours-payload.ts:135-137`) + control negativo que congela `'18:00' <= '' === false` (`agenda-hours-payload.test.ts:208`). |
| T-19-11 | Info Disclosure | mitigate | **CLOSED** | Los 4 y únicos `RAISE EXCEPTION` de la 074 (`:149, :159, :207, :246`) emiten códigos snake_case con `ERRCODE = 'P0001'`. Ningún mensaje de Postgres se interpola en la UI (ver T-19-24). |

### Plan 19-03 — las dos deudas de la Phase 18

| ID | Categoría | Disp. | Estado | Evidencia |
|---|---|---|---|---|
| T-19-13 | Info Disclosure | mitigate | **CLOSED** | El diff de `settings-client.tsx` agrega **cero** llamadas a `toast.*` (grep sobre las líneas `+` del diff = 0). El aviso de D-07 es texto del diálogo, todo del cliente (`:1282-1294`). El único `toast` del archivo con `error.message` (`:1592`, subida de foto) es **preexistente y está fuera del diff**. |
| T-19-14 | Info Disclosure | mitigate | **CLOSED por código — SIN prueba de contra-caso** | `settings-client.tsx:1211-1212` (`.eq('business_id', business.id).eq('service_id', s.id)`) y la 6ª query `:1219-1220` (`.eq('business_id', …)`). Segunda capa verificada en la base: RLS ACTIVA sobre `time_block_services` con 4 policies tenant (`schema.sql:2299-2325`). ⚠ **Dicho claramente: la propiedad cross-tenant NO está probada por ningún test.** Y la razón registrada en 19-03-SUMMARY ("un solo negocio en la base local") está **desactualizada**: `test/helpers/supabase-fixtures.ts` expone `seedTwoTenants()` y `test/agenda-save-blocks-rpc.test.ts` ya lo usa con dos dueños autenticados. El contra-caso es escribible hoy (§6). **Actualización 2026-08-28 (quick 260828-pir):** escrito y ejecutado — `test/settings-delete-precheck-tenant.test.ts` (4 casos, proyecto vitest `db`): control positivo (1), cross-tenant como A con el `service_id` de B (0), la MORDIDA con la RLS desactivada a propósito vía service-role (con filtro 0 / sin filtro 1) y la 6ª query sin filas de B. La mordida se **verificó ejecutándola**: quitándole el `.eq('business_id', …)` al helper el caso 3 se pone rojo (`expected 1 to be +0`); restaurado, verde. Límite honesto declarado en la cabecera del archivo: fija la propiedad a nivel de QUERY, no ata la línea inline de `settings-client.tsx`. |
| T-19-15 | Repudiation | mitigate | **CLOSED (reforzada)** | Guard único en `settings-client.tsx:1241-1242`: los `.error` de las 6 queries + `blocks.count === null` + `bridge.error` + `bridgeIncompleto` (data nula, count nulo o respuesta paginada) ⇒ `delInfo = 'error'` ⇒ el diálogo NO ofrece la acción. Sin ramas nuevas de fail-open en el camino nuevo. |
| T-19-16 | Tampering (intención) | mitigate | **CLOSED (corregida por WR-03)** | `settings-client.tsx:1282-1294`: tres formas según cuántas franjas se AGRANDAN de verdad, con el número exacto, derivado del módulo puro `blocksBecomingWildcard` (`lib/time-block-services.ts:258`) y no de un `filter` inline. La versión original afirmaba el ensanche siempre (falso para una franja multi-servicio). |
| T-19-17 | DoS (auto) | accept (descartado por diseño) | **CLOSED (aceptado)** | Verificado por ausencia: en el diff de `app/` + `lib/` hay **0** líneas agregadas con `CREATE POLICY`, `CREATE TRIGGER` o `RAISE`, y la única migración del diff es la 074, que no crea ningún gate de borrado. Registrado en §5. |

### Plan 19-04 — el editor (lectura)

| ID | Categoría | Disp. | Estado | Evidencia |
|---|---|---|---|---|
| T-19-18 | Info Disclosure | mitigate | **CLOSED** | `app/(dashboard)/agenda/page.tsx:60` y `:71`: las DOS consultas nuevas llevan `.eq('business_id', business.id)` además de la RLS. `service_role` / `createAdminClient` = **0 ocurrencias** en los 4 archivos de app tocados. |
| T-19-19 | Info Disclosure | mitigate | **CLOSED** | `page.tsx:71` — `select('id, name, active')`. Sin precio, duración, seña ni cupo en el bundle. |
| T-19-20 | Tampering (regresión) | mitigate | **CLOSED** | Dos lecturas de `services`, exactamente un `.eq('active', true)`: la vieja (`:53`, alta manual) intacta; la nueva (`:71`) es una query aparte. |
| T-19-21 | Tampering | mitigate | **CLOSED (con caveat)** | La decisión POR FRANJA delega: `isDraftBlockWildcard` (`agenda-client.tsx:194-199`) → `isBlockWildcard`, consumida en `:275`. Cero `.filter(r => r.time_block_id === …)` inline en el componente. ⚠ Caveat: `hasChipCatalog` (`:599-600`) escribe la negación de la regla inline sobre el borrador — no rompe el criterio literal (no filtra la puente) pero es el riesgo de deriva → fila **T-19-38**. |
| T-19-22 | Repudiation | mitigate | **CLOSED** | Exactamente **seis** `setHoursDirty(true)`, uno por mutador: `toggleDay:615`, `addBlock:629`, `removeBlock:645`, `updateBlock:660`, `toggleBlockService:676`, `applyCopyDay:736`. `validateBlocks` (`:690-725`) no la prende. |
| T-19-23 | DoS (auto) | mitigate | **CLOSED** | `import { … Minus … }` sigue en `agenda-client.tsx:20` y se usa en `:1522` (ventana de reserva). |

### Plan 19-05 — el guardado

| ID | Categoría | Disp. | Estado | Evidencia |
|---|---|---|---|---|
| T-19-24 | Info Disclosure | mitigate | **CLOSED** | `classifySaveHoursError` (`agenda-client.tsx:416-439`) inspecciona `code`/`message` y devuelve **sólo** un código de dominio; la copy vive en `SAVE_HOURS_REJECT_COPY` (`:451-457`), todas frases propias. Los `console.error` (`:807, :838`) registran **`error.code`, nunca `error.message`**. Grep de `toast.*` con `.message/.details/.hint` en los 3 archivos de app del diff = 0 líneas nuevas. |
| T-19-25 | Tampering | mitigate | **CLOSED** | `agenda-client.tsx:798` pasa `dayStates` COMPLETO (los 7 días, todos los consultorios) al constructor puro, que no acepta consultorio. Test de dos sedes (`agenda-hours-payload.test.ts:63`) + escenario UAT ejecutado contra la base (19-05-SUMMARY). |
| T-19-26 | Elevation of Privilege | mitigate | **CLOSED** | `agenda-client.tsx:800` — `p_business_id: business.id`, donde `business` viene del RSC resuelto por `owner_id = user.id` (`page.tsx:13-19`); jamás de un input. La defensa real es de la base y está verificada (T-19-06/07/08 + test 7). |
| T-19-27 | Repudiation | mitigate | **CLOSED** | Se chequean los DOS errores: el del RPC (`:803-817`, con `return` y sin tocar el estado local) y el del UPDATE de duración/descanso (`:834-841`), con copy que dice la verdad completa ("los horarios SÍ quedaron guardados"). |
| T-19-28 | Repudiation | mitigate | **CLOSED (reforzada por CR-01)** | Seis encendidos (T-19-22), un solo apagado (`:826`) y sólo tras éxito. Además `savingHours` congela la grilla entera (`disabled` en `:1388, 1411, 1419, 1428, 1448, 1458, 1465`), que es lo que impide que el indicador mienta durante la ventana del guardado. |
| T-19-29 | DoS (auto) | mitigate (por prohibición) | **CLOSED en la sustancia — criterio declarado VENCIDO** | La propiedad que importa se verifica y se sostiene: `validateBlocks` (`:690-725`) **no menciona `service_ids` ni cuenta servicios**, así que una franja sin servicios nunca es un error. ⚠ Pero el criterio de aceptación tal como está escrito ("su cuerpo no se tocó / no tiene ni una línea en el diff", 19-05-SUMMARY) **ya no es cierto**: el fix de WR-01 (`a38f491`) insertó el chequeo de forma de la hora en `:700-702`. La evidencia declarada quedó obsoleta; la reemplaza la de arriba. |
| T-19-30 | DoS (operacional) | mitigate | **CLOSED (lado código)** | `PGRST202` → `'not_deployed'` (`:437`) → copy propia (`:455`) + `console.error` diagnóstico explícito (`:812`). La parte operacional es T-19-32. |

### Plan 19-06 — producción

| ID | Categoría | Disp. | Estado | Evidencia |
|---|---|---|---|---|
| T-19-31 | Elevation of Privilege | mitigate | **CLOSED** | Salida cruda de producción (Paso 5, 19-06-SUMMARY): `save_agenda_blocks \| prosecdef=false \| postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres` — **sin `anon`**. Reproducido por este audit contra la base local: idéntico, y el `pg_default_acl` de FUNCTIONS para el creador `postgres` tampoco tiene `anon` (ver RA-19-01 para la fila de `supabase_admin`). |
| T-19-32 | DoS (operacional) | mitigate | **✅ CLOSED (2026-08-29)** | Cerrada de arrastre: la migr. 075 termina en `NOTIFY pgrst, 'reload schema';` y se aplicó en producción el 2026-08-29. Ver §4.2. |
| T-19-33 | Tampering (deploy) | mitigate | **CLOSED** | La 074 quedó aplicada en producción el 2026-08-26, **antes** del deploy del código de la fase (que todavía no salió: este audit corre pre-merge). El orden invertido de la 068 no se repitió. |
| T-19-34 | Tampering | mitigate | **CLOSED por medición** | Paso 1: las cuatro banderas (071/072/073 + `grants_de_mas_072 = 0`) en `true` ANTES de aplicar la 074, con salida cruda pegada en el SUMMARY. Resolvió además la contradicción `18-VERIFICATION.md:152` vs `18-SECURITY.md` §9 a favor del segundo. |
| T-19-35 | Repudiation | mitigate | **CLOSED** | Las salidas crudas de los pasos 1, 5 y 6 están transcritas en 19-06-SUMMARY (§Task 1), incluida la que este audit reprodujo de forma independiente. |

### Transversal

| ID | Categoría | Disp. | Estado | Evidencia |
|---|---|---|---|---|
| T-19-SC | Tampering (supply chain) | accept | **CLOSED (aceptado)** | `git diff --name-only d5fc596^..HEAD -- package.json package-lock.json components.json` = **vacío**. `git status --porcelain components/ui` = **vacío**. Cero paquetes y cero componentes de registry. |
| T-19-12 | Denial of Service | accept | **CLOSED (aceptado)** | Registrado en §5. |

---

## 3. Recuento de las declaradas

- **Cerradas:** 35 / 36.
- **Abiertas:** 1 / 36 → **T-19-32**.

---

## 4. Filas NUEVAS — los hallazgos derivados a este audit

### 4.1 T-19-36 (WR-04) — `location_id` entra a la base sin validación de pertenencia · 🔴 OPEN

| | |
|---|---|
| **Categoría** | Input Validation (V5) / Tampering |
| **Componente** | `supabase/migrations/074_save_agenda_blocks.sql:190, 219, 236` (reflejado en `supabase/schema.sql:617, 645, 655`) |
| **Disposición** | `mitigate` — **requiere migración 075** |
| **Severidad** | **MEDIA** — no es una fuga entre tenants |

**Verificado por este audit contra la base real** (no heredado del review). Se buscó la validación en
los CUATRO lugares donde podría vivir, y no existe en ninguno:

1. **En la función:** `v_location := NULLIF(btrim(COALESCE(v_item->>'location_id','')),'')::uuid`
   (`074:190`) y se escribe tal cual en el INSERT (`:219`) y en el UPDATE (`:236`). Cero chequeos.
2. **En una FK compuesta:** no existe. `pg_constraint` sobre `public.time_blocks` devuelve
   `time_blocks_location_id_fkey | FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL`
   — FK **simple**.
3. **En un UNIQUE del padre:** `public.locations` tiene sólo `locations_pkey PRIMARY KEY (id)` y
   `locations_business_id_fkey`. **No hay `(id, business_id)`**, así que hoy la FK compuesta ni
   siquiera se puede crear: hace falta el UNIQUE primero.
4. **En una policy o un trigger:** las 3 policies de `time_blocks` (`schema.sql:2385, 2590, 2596`)
   validan **sólo** el `business_id` de la propia fila; `pg_trigger` sobre `time_blocks` devuelve
   **0 filas** (no hay triggers no internos).

La búsqueda es exhaustiva: no queda ningún punto de aplicación donde la validación pudiera estar.

**Consecuencia real, sin inflar:** un dueño autenticado que forje el payload desde la consola puede
escribir el UUID de un consultorio de OTRO negocio en una franja PROPIA. **No hay lectura ni
escritura de datos ajenos** — la fila sigue siendo suya y el dato ajeno es un UUID opaco que tuvo que
conseguir de algún lado. El daño es autoinfligido: la franja no aparece en ninguna pestaña de
consultorio propia, y si el consultorio ajeno se borra la FK la pone en `null`, tras lo cual el
siguiente guardado descarta la franja en silencio (`buildSaveHoursPayload` saltea los bloques sin
sede cuando el negocio tiene sedes).

**Por qué igual queda abierta:** es el único dato del payload que la 074 escribe sin validar, en la
migración que consolidó todos los demás chequeos de pertenencia. Y hace que T-19-07 y T-19-08 estén
**sobre-declaradas**: su cobertura es real para franja y servicio, no para consultorio. (La cabecera
de la 074 `:255-260` está literalmente bien escrita — habla de "el bloque o el servicio" — pero se
lee como si cubriera todo el payload.)

**Fix propuesto (migración 075 NUEVA — la 074 ya corrió en prod, NO se toca):**

```sql
-- 0. Backfill limpio primero: tiene que devolver 0.
SELECT count(*) FROM time_blocks tb
  JOIN locations l ON l.id = tb.location_id
 WHERE l.business_id <> tb.business_id;

ALTER TABLE ONLY "public"."locations"
  ADD CONSTRAINT "locations_id_business_uq" UNIQUE ("id", "business_id");

ALTER TABLE ONLY "public"."time_blocks"
  DROP CONSTRAINT "time_blocks_location_id_fkey";

ALTER TABLE ONLY "public"."time_blocks"
  ADD CONSTRAINT "tb_location_same_tenant"
  FOREIGN KEY ("location_id", "business_id")
  REFERENCES "public"."locations"("id", "business_id") ON DELETE SET NULL;
```

Después: reflejo quirúrgico en `supabase/schema.sql` y corrección de la cabecera de la 074 para que
diga qué cubre y qué no. Alternativa aceptable: **aceptar** el riesgo con esta ficha como registro.
La decisión es del dueño del milestone; este audit no la toma por él.

> ### ⚠ Actualización 2026-08-28 (quick 260828-pir): SIGUE OPEN, y **el SQL de arriba está MAL**
>
> **Estado:** el fix existe y está validado, pero la propiedad **no existe en producción** hasta que
> alguien aplique la migración. Por eso la fila sigue 🔴 OPEN y no se marca cerrada por adelantado.
>
> **Artefacto:** `supabase/migrations/075_time_block_location_same_tenant.sql` — creada, replayada dos
> veces con `supabase db reset` contra PG 17.6 local y verificada con un probe de cuatro casos.
> **NO aplicada a producción.** El runbook completo (pre-flight, aplicación, verificación, reflejo en
> `schema.sql`) vive en la cabecera del propio archivo.
>
> **Los dos errores del SQL propuesto arriba — no pegarlo en el editor SQL de producción:**
>
> 1. **`ON DELETE SET NULL` sin lista de columnas huerfaniza la franja.** Medido contra PG 17.6 con
>    esa forma exacta: al borrar un consultorio, `business_id_quedo_null = t` **y**
>    `location_quedo_null = t`. Como `time_blocks.business_id` es **NULLABLE** (medido:
>    `is_nullable = YES`), **no hay error**: el borrado sigue "funcionando" y la franja queda fuera de
>    la RLS de su dueño, invisible en el panel e irrecuperable desde la app, comodín para siempre
>    (RA-02). La forma correcta —la que usa la 075— es `ON DELETE SET NULL ("location_id")`, con la
>    lista de columnas: medido, tras el DELETE queda `location_id IS NULL` y `business_id` **intacto**.
> 2. **El chequeo de backfill propuesto tiene dos agujeros.** `JOIN … WHERE l.business_id <> tb.business_id`
>    no cuenta las filas donde alguno de los dos `business_id` es nulo (`<>` contra NULL devuelve NULL)
>    y el `JOIN` descarta las franjas cuyo `location_id` no existe en `locations`. La forma que
>    coincide EXACTAMENTE con lo que la FK valida es `NOT EXISTS` sobre el par, acotada a las filas
>    con las dos columnas no-nulas — y en la 075 vive dentro de un `DO $$` que **aborta** con `P0001`,
>    no como consulta previa que se puede saltear. Local mide **0**; producción se mide en el
>    pre-flight del runbook.
>
> **Bonus:** la 075 termina con `NOTIFY pgrst, 'reload schema';` después del `COMMIT`, así que
> aplicarla cierra de paso **T-19-32** (§4.2).

### 4.2 T-19-32 (declarada) — el `NOTIFY pgrst` sin confirmar · 🔴 OPEN

| | |
|---|---|
| **Categoría** | Denial of Service (operacional) |
| **Severidad** | **MEDIA** — se auto-revela al primer uso y se arregla con una línea |

La mitigación del lado del código está implementada y verificada (T-19-30). Lo que falta es la
confirmación de que el Paso 4 del runbook se corrió en producción. Este audit **intentó** cerrarla
con una sonda no mutante contra el PostgREST de producción (llamada con la anon key y un
`p_business_id` inexistente, que el guard de autoría rechaza en la primera línea antes de tocar una
fila): **el entorno denegó el acceso a las credenciales**, así que queda sin resolver desde acá.

**Cómo cerrarla en 10 segundos, sin escribir nada** (editor SQL de producción):

```sql
SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname = 'save_agenda_blocks';
NOTIFY pgrst, 'reload schema';   -- idempotente: correrlo de más no rompe nada
```

Correr el `NOTIFY` es gratis y cierra la amenaza sin necesidad de averiguar si ya se había corrido.
Si no se corre: el primer guardado de horarios en producción falla con `PGRST202`, el dueño ve
*"No se pudieron guardar los horarios. Probá de nuevo en un momento."* y la consola registra el
diagnóstico real (`agenda-client.tsx:812`).

### 4.3 T-19-39 (WR-07) — el guard fail-closed se aplicó a 1 de 5 counts · 🔴 OPEN

| | |
|---|---|
| **Categoría** | Repudiation / fail-open |
| **Componente** | `app/(dashboard)/settings/settings-client.tsx:1241-1242` (consumo en `:1259-1260`) |
| **Disposición** | `mitigate` recomendada |
| **Severidad** | **BAJA** — el trigger de la base sigue rechazando; no hay pérdida de datos |

El razonamiento que la fase escribió para `blocks.count === null` (`:1227-1232`: un `head: true` que
no resuelve vuelve 204 con `error: null` y `count: null`) aplica **palabra por palabra** a `abo`
(`:1204-1205`) y `hist` (`:1206-1207`), que son la misma forma y se consumen con `?? 0` en
`:1259-1260`. Pesa más en `abo`: `activeAbono` alimenta `delBlocked` (`:1271`), así que un count nulo
convierte un borrado **bloqueado** en uno **confirmable**. El trigger `services_block_delete_trg`
igual lo rechaza, pero el modal ofrece una acción destructiva que acaba de reconocer que no puede
verificar — exactamente la falla P-08 / WR-02 que el guard se escribió para evitar.

Queda ABIERTA y no aceptada a propósito: es un fail-open en un guard de acción destructiva, en la
línea exacta que esta fase editó. El fix es una condición más en el `if` que ya existe:

```ts
if (futDias.error || futHoy.error || abo.error || hist.error || blocks.error
    || abo.count === null || hist.count === null || blocks.count === null
    || bridge.error || bridgeIncompleto) {
```

> ### ✅ Actualización 2026-08-28 (quick 260828-pir): **CLOSED**
>
> Arreglada en `app/(dashboard)/settings/settings-client.tsx:1259-1265`, y **extendida a los CINCO
> counts, no sólo a `abo`** (el fix propuesto arriba cubría 3 de 5: le faltaban `futDias` y `futHoy`):
>
> ```ts
> if (futDias.error || futHoy.error || abo.error || hist.error || blocks.error
>     || futDias.count === null
>     || futHoy.count === null
>     || abo.count === null
>     || hist.count === null
>     || blocks.count === null
>     || bridge.error || bridgeIncompleto) {
> ```
>
> Los dos que el fix propuesto no incluía pesan tanto como `abo`: **`futDias`** alimenta `future`, que
> alimenta `delBlocked` (mismo fail-open de borrado bloqueado → confirmable), y **`futHoy`** es peor de
> lo que parece — un count nulo no sólo subcuenta, además **desactiva el fail-closed de paginación**
> (`countDeHoy > filasDeHoy.length` nunca se cumple con `countDeHoy = 0`).
>
> La regla que quedó escrita en el comentario del guard es **uniforme y sin excepciones** a propósito:
> en una respuesta que resolvió contra la tabla, `count` SIEMPRE es un número, así que un nulo sólo
> puede ser un fallo, y sobre un fallo este diálogo no ofrece la acción. El razonamiento
> caso-por-caso ya falló una vez acá (se aplicó a 1 de 5); la uniformidad es lo que impide que vuelva
> a fallar cuando alguien agregue un sexto count.
>
> Sin suite nueva, deliberadamente: la condición vive inline en un componente cliente de ~2000 líneas
> y extraerla sería un refactor mayor y más riesgoso que el arreglo. Gate: `tsc --noEmit` limpio y
> eslint sobre el archivo en **11 hallazgos, los mismos 11 preexistentes** que antes del cambio.

### 4.4 T-19-37 (WR-05) — el gate de canchas esconde mapeos que el motor sigue aplicando · ACEPTADA (RA-19-02)

| | |
|---|---|
| **Categoría** | Denial of Service (auto) / Repudiation |
| **Componente** | `app/(dashboard)/agenda/agenda-client.tsx:593, 602` (y el gate espejo en `:1368`) |
| **Disposición** | **accept** — riesgo con población CERO hoy, con trip-wire |

Confirmado que la premisa del review es correcta: el vertical **es** editable por el dueño
(`settings-client.tsx:1040, 1061` — `update({ …, vertical })`). Un negocio `belleza`/`salud` que
mapea servicios y después se pasa a `canchas` conserva sus filas en `time_block_services`; el motor
(`blocksForService` / `isServiceAllowedAt`) las sigue leyendo y sigue restringiendo la
disponibilidad pública, pero el panel no renderiza la línea y el dueño no tiene **ninguna** pantalla
donde ver o quitar esa restricción.

**Por qué se acepta y no se abre:** la población afectada hoy es **cero por construcción** — la
única forma de crear filas en la puente es el editor que esta fase estrena, así que ningún negocio
`canchas` puede tener mapeos previos el día del deploy. El gate hermano de abajo (`hasChipCatalog`)
ya usa el patrón correcto (ceder ante datos existentes), así que el arreglo es de una línea.

**Trip-wire:** deja de ser aceptable en cuanto un negocio con mapeos pase a `canchas`. Consulta de
detección:

```sql
SELECT b.slug, count(*) FROM time_block_services tbs
  JOIN businesses b ON b.id = tbs.business_id
 WHERE b.vertical = 'canchas' GROUP BY b.slug;   -- debe volver vacío
```

Fix cuando aplique: `const showServicesLine = (!isCanchas || hasExistingMappings) && hasChipCatalog`.

### 4.5 T-19-38 (WR-06) — `hasChipCatalog` reimplementa la regla del comodín · ACEPTADA (RA-19-03)

| | |
|---|---|
| **Categoría** | Tampering (deriva) |
| **Componente** | `app/(dashboard)/agenda/agenda-client.tsx:599-600` |
| **Disposición** | **accept** — sin defecto observable |

`serviceCatalog.some(s => s.active) || dayStates.some(d => d.blocks.some(b => b.service_ids.length > 0))`.
El segundo término es la negación literal de la regla del comodín escrita inline, en el archivo cuya
cabecera prohíbe explícitamente esa segunda interpretación. **No invalida T-19-21**: la decisión POR
FRANJA (la que pinta el chip y la que el público ve reflejada) sí delega en el módulo puro (`:275`),
y este `some` responde otra pregunta (¿se renderiza la línea?). No hay divergencia posible hoy.

Se acepta como deuda de deriva, con el fix de una línea documentado por si alguien toca la regla:
`… || dayStates.some(d => d.blocks.some(b => !isDraftBlockWildcard(b.service_ids)))`.

---

## 5. Registro de riesgos aceptados

| ID | Riesgo | Por qué se acepta | Condición de revisión |
|---|---|---|---|
| **T-19-02** | Los módulos puros de `lib/time-block-services.ts` **no** filtran por `business_id` ni por vigencia | Filtrar adentro daría una falsa sensación de aislamiento en código que recibe filas de un tercero y no puede validar su origen. El contrato D-16 está en el JSDoc y congelado por 2 tests. El aislamiento real vive en la RLS (4 policies sobre la puente) y en el `.eq('business_id')` de los consumidores. | Si aparece un consumidor que NO filtre por tenant antes de llamar. |
| **T-19-12** | Payload gigante recorrido elemento por elemento en la 074 | El editor está acotado a 7 días × N bloques por consultorio, el guard de autoría corta antes del bucle y la RLS acota el alcance a un negocio. Se anota, no se gatea. | Si el editor deja de acotar el número de franjas. |
| **T-19-17** | NO se agregó un gate que impida borrar un servicio mapeado | D-07 lo descartó: es la clase de gate que este workstream ya tuvo que corregir tres veces (migr. 063/065/070). El dueño recibe el aviso con el número exacto y decide. Verificado por ausencia (0 gates nuevos en el diff). | Si el aviso deja de mostrar el número correcto. |
| **T-19-SC** | Cadena de suministro | Cero paquetes nuevos, cero componentes de registry. Verificado por `git diff` vacío. | Cada fase. |
| **RA-19-01** | `pg_default_acl` conserva `anon=X` sobre FUNCTIONS para el creador `supabase_admin` | Ninguna migración de este proyecto puede cerrarlo (`42501`): `postgres` no es miembro de ese rol, y el bloque `DO` de la 074 degrada a NOTICE a propósito para no abortar la migración. El creador efectivo del proyecto es `postgres` (CLI + editor SQL del dashboard), cuya fila **sí** quedó sin `anon` — medido por este audit en local (`postgres` → `{postgres=X,authenticated=X,service_role=X}`) y confirmado en prod por el Paso 6. Residuo idéntico al que la 073 dejó sobre TABLES. | Si alguna vez se crea una función como `supabase_admin`. |
| **RA-19-02** | T-19-37 — el gate de canchas puede esconder mapeos vigentes | Población afectada **cero** hoy: los mapeos sólo pueden nacer del editor que estrena esta fase. Ver §4.4. | Trip-wire SQL de §4.4. |
| **RA-19-03** | T-19-38 — `hasChipCatalog` reimplementa la regla inline | Sin defecto observable; la decisión por franja delega correctamente. Ver §4.5. | Si alguien edita la regla del comodín en `lib/time-block-services.ts`. |

---

## 6. Deuda de verificación (no son amenazas abiertas, son pruebas que faltan)

| # | Qué falta | Por qué importa |
|---|---|---|
| 1 | **Contra-caso cross-tenant de T-19-14.** El pre-check de borrado de servicios filtra por `business_id` por código y la RLS es la segunda capa, pero ningún test lo ejerce con dos dueños. | La razón registrada ("un solo negocio en la base local") está desactualizada: `seedTwoTenants()` existe y `agenda-save-blocks-rpc.test.ts` ya la usa. El test es: sembrar A y B, mapear una franja de B a un servicio de B, correr el pre-check como A con el `service_id` de B y asertar `blocks = 0`. **Actualización 2026-08-28 (quick 260828-pir): SALDADA.** `test/settings-delete-precheck-tenant.test.ts` — 4 casos, ninguno skipeado, proyecto vitest `db`. Va más allá de lo pedido acá: además del caso descrito incluye un control positivo (sin él un 0 no prueba nada), la 6ª query del mismo `Promise.all`, y —lo que de verdad importa— un caso con la RLS **desactivada** vía service-role, porque el contra-caso tal como estaba descrito **no muerde**: con la RLS activa el count da 0 igual, así que borrarle el `.eq('business_id', …)` a la query dejaría el test en verde. La mordida se ejecutó de verdad (roja sin el filtro, verde con él). |
| 2 | **Las 3 verificaciones humanas de `19-VERIFICATION.md`** siguen pendientes: UAT visual de la línea de chips, primer guardado en producción (que además cierra T-19-32) y el toast `service_not_scheduled` disparado de verdad. | Ninguna es verificable desde el repo. |
| 3 | **La afirmación "ninguna superficie de seguridad nueva"** aparece en los seis SUMMARY. Es **más fuerte de lo que el código sostiene**: el code review encontró después WR-04 (§4.1), que es exactamente superficie de escritura nueva sin fila en el registro. La sección `## Threat Flags` de un SUMMARY no debe leerse como lista completa de la superficie nueva. | Proceso, no defecto. |

---

## 7. Veredicto

**OPEN_THREATS** — 37/40 cerradas, 3 abiertas (T-19-32, T-19-36, T-19-39).

Ninguna de las 3 abiertas es de severidad alta: **ninguna permite que un negocio lea o modifique
datos de otro**, que es el valor central del producto y está sostenido por cuatro capas
independientes (guard de autoría, `business_id` explícito, RLS, FK compuestas), con test permanente
que ejerce los tres ataques realizables. Con `block_on: high`, esta fase **no queda bloqueada**, pero
las tres abiertas necesitan una decisión explícita antes del cierre del milestone:

1. **T-19-32** — correr `NOTIFY pgrst, 'reload schema';` en producción. Gratis e idempotente. Hacerlo.
2. **T-19-36** — migración **075** (UNIQUE + FK compuesta sobre `locations`), o aceptación formal con
   la ficha de §4.1 como registro. No editar la 074.
3. **T-19-39** — una condición más en un `if` que ya existe.

> ### Actualización 2026-08-28 (quick 260828-pir): **38/40 cerradas, 2 abiertas**
>
> El veredicto de arriba se conserva tal cual como registro de lo que el audit encontró. Estado real
> tras el quick task `260828-pir`:
>
> 1. **T-19-32 — sigue 🔴 OPEN**, pero ya no necesita una acción propia: la migración 075 termina con
>    el `NOTIFY pgrst, 'reload schema';` después del `COMMIT`, así que aplicarla la cierra de paso.
> 2. **T-19-36 — sigue 🔴 OPEN**: la migración 075 está escrita, replayada dos veces en local y con
>    runbook en su cabecera, pero **no aplicada a producción**, y la propiedad no existe allá hasta
>    que se aplique. ⚠ El SQL propuesto en §4.1 **no sirve**: ver el aviso al final de esa sección.
>    La 074 no se tocó (`git diff` vacío) y `supabase/schema.sql` tampoco (se espeja recién después
>    de aplicar, precedente del plan 19-06).
> 3. **T-19-39 — ✅ CLOSED**, extendida a los cinco counts. Ver §4.3.
>
> Y la **deuda de verificación #1** de §6 quedó saldada con un test permanente cuya mordida se
> ejecutó. Las dos abiertas se cierran con **una sola acción del operador**: aplicar la 075.

---

_Auditado: 2026-08-28 · gsd-security-auditor · ASVS L1_
_Archivos de implementación: NO modificados._

---

## 7. Cierre — 2026-08-29

La **migración 075** (`075_time_block_location_same_tenant.sql`) se aplicó a **producción** el
2026-08-29 y cierra las dos amenazas que quedaban abiertas.

**Evidencia cruda pegada por el operador** (SQL editor de producción):

```
conname                  | definicion
-------------------------+--------------------------------------------------------------
tb_location_same_tenant  | FOREIGN KEY (location_id, business_id) REFERENCES locations(id, busi…
```

Una **sola** fila: `time_blocks_location_id_fkey` ya no existe, o sea que el `DROP` corrió y no
quedaron dos FK conviviendo. La cláusula `ON DELETE` queda cortada por el ancho de la columna en la
captura, pero la determina el archivo: la 075 va en una única transacción, así que la constraint es
byte por byte lo que decía el `.sql`.

| Amenaza | Nuevo estado | Por qué |
|---|---|---|
| **T-19-36** (WR-04) | ✅ **CLOSED** | La FK compuesta `tb_location_same_tenant` existe en producción. `location_id` deja de ser el único dato del payload de `save_agenda_blocks` sin chequeo de pertenencia. Con esto, la corrección de alcance anotada en T-19-07 y T-19-08 queda saldada. |
| **T-19-32** | ✅ **CLOSED** | El `NOTIFY pgrst, 'reload schema';` final de la 075 corrió en la misma sesión. Confirmado por el operador. |

`supabase/schema.sql` espejado a mano (quirúrgico, sin regenerar del dump) en las dos ubicaciones:
el UNIQUE `locations_id_business_uq` junto a los de la 073, y la FK compuesta reemplazando a
`time_blocks_location_id_fkey`.

> ⚠ **El SQL de §4.1 sigue estando MAL y no se corrigió a propósito** — se conserva con su advertencia
> para que quede el registro de por qué no se usó. Lo que corrió en producción es
> `supabase/migrations/075_time_block_location_same_tenant.sql`, con
> `ON DELETE SET NULL ("location_id")`. Nadie debería volver a pegar el bloque de §4.1 en ningún lado.

**Pendiente que NO es de seguridad:** las 3 verificaciones humanas de `19-VERIFICATION.md` siguen su
propio curso en `19-UAT.md` (1 de 3 pasada). El primer guardado de horarios en producción —Test 2—
quedó **desbloqueado** por este mismo `NOTIFY`.
