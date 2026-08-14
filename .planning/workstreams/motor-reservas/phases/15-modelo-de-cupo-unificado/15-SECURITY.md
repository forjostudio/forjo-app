---
phase: 15-modelo-de-cupo-unificado
workstream: motor-reservas
milestone: v0.27
secured: 2026-08-14T22:30:00Z
status: secured-with-warning
blocking: false
asvs_level: 2
block_on: high
register_authored_at_plan_time: true
threats_total: 33
threats_closed: 32
threats_open: 1
threats_mitigate: 26
threats_accept: 6
threats_transfer: 0
unregistered_flags: 1
commit_range: e95e11f..72c7194
audit_rounds:
  - date: 2026-08-14
    scope: "planes 15-01…15-05 · T-15-01…T-15-31 + T-15-SC (32) · encargo explícito: T-15-32 (068 aplicada fuera de orden) y el análisis de services.capacity como fuente única · rango e95e11f..72c7194"
    verdict: "32/32 declaradas CLOSED (26 mitigate verificadas contra el código y contra el Postgres instalado, 6 accept registradas) · 1 flag NO registrado ABIERTO (T-15-32, WARNING, no bloqueante)"
---

# Phase 15 — Modelo de cupo unificado · Auditoría de seguridad

**Veredicto: 32/32 amenazas declaradas CERRADAS. 1 hallazgo no modelado ABIERTO (T-15-32, WARNING,
no bloqueante bajo `block_on: high`). `threats_open: 1`.**

| Ítem | Valor |
|---|---|
| Amenazas declaradas | **32** — T-15-01…T-15-31 en los cinco `<threat_model>` + `T-15-SC` (declarada en los 5 planes, es **una sola**) |
| Cerradas | **32/32** — 26 `mitigate` verificadas línea por línea, 6 `accept` registradas en §4 |
| No modeladas | **1** — `T-15-32` (encargo explícito del orquestador): la 068 se aplicó a producción **fuera del orden** que fija el runbook |
| Severidad de T-15-32 | **WARNING.** No tocó integridad ni aislamiento; el efecto medible fue **disponibilidad** de dos funciones del panel, ya corregidas por el deploy `e95e11f..72c7194` |
| Archivos de implementación modificados por este audit | **0** (read-only; único archivo escrito: este `15-SECURITY.md`) |

## Postura y método

Postura FORCE: cada mitigación se dio por **ausente** hasta encontrar la línea que la implementa. Ni un
solo verdicto se apoya en la prosa de un SUMMARY. Además de leer el código, esta auditoría **ejecutó**:

```
docker exec -i supabase_db_forjo-app psql …           → pg_constraint / pg_trigger / pg_proc.prosrc
                                                        (lo INSTALADO, no lo escrito)
./node_modules/.bin/vitest run test/capacity-mode-change-gate.test.ts   → 7 passed (7), exit 0
./node_modules/.bin/vitest run test/concurrency.test.ts                 → 24 passed (24), exit 0
```

y **cuatro controles adversariales propios** contra el Postgres local, en transacciones revertidas, que
no estaban en ninguna suite (§2.1). El criterio: una afirmación sobre un invariante de la base se prueba
**contra la base**, no contra el archivo que la declara.

**ASVS nivel 2**, heredado de `12-SECURITY.md`: es la **misma superficie** (`book_slot_atomic` +
`/api/booking/availability`, alcanzables sin sesión). El config del proyecto fija nivel 1; se aplicó el
2 porque es **estrictamente más exigente** y esta fase toca el núcleo anti-doble-booking. Ningún
criterio del nivel 1 quedó sin evaluar.

---

## 1. Registro de amenazas — verificación por plan

### Plan 15-01 — Migración 068: modelo + gate de cambio de modo

| ID | Categoría | Disp. | Estado | Evidencia |
|----|-----------|-------|--------|-----------|
| T-15-01 | Tampering | mitigate | **CLOSED** | `068:126-129` — el backfill es un `UPDATE … WHERE "capacity_mode" = 'group_class' AND "capacity" <= 1`: **predicado, no lista de ids**, verificado literal. Un `group_class` con cupo >= 2 declarado entre la escritura y la aplicación **no** entra en el predicado. Re-corribilidad verificada de forma independiente: el archivo entero está guardado por `DROP CONSTRAINT IF EXISTS` (`:107`), dos bloques `DO $$` con guard por `pg_constraint` (`:136-141`, `:170-175`) y `DROP TRIGGER IF EXISTS` (`:296`) ⇒ una 2ª pasada es no-op. **Cero** `UPDATE` sin `WHERE` en el archivo. |
| T-15-02 | Tampering | mitigate | **CLOSED** | El invariante vive en la **base**: `068:176-181` crea `services_capacity_matches_mode_chk`. Verificado **instalado** en el Postgres local (`pg_constraint`): `CHECK ((((capacity_mode = 'individual') AND (capacity = 1)) OR ((capacity_mode = ANY (ARRAY['group_class','simultaneous_resource'])) AND (capacity >= 2))))`. Espejo exacto en `supabase/schema.sql:1157`. Probado por comportamiento en los **dos** sentidos, por PostgREST **con service-role** (que bypassa RLS pero **no** los constraints): `test/capacity-mode-change-gate.test.ts:267-289` → `23514` + relectura de la fila. Un PATCH forjado rebota igual. |
| T-15-03 | Elevation of Privilege | mitigate | **CLOSED** | `068:231-232` — `SECURITY DEFINER SET search_path = public`. El único `SELECT` del cuerpo (`:267-273`) lleva el filtro por tenant **explícito**: `AND (OLD."business_id" IS NULL OR a."business_id" = OLD."business_id")`, anclado en `a."service_id" = OLD."id"` (UUID PK). La rama legacy `IS NULL` solo puede volver el gate **más** restrictivo (fail-closed), nunca abrirlo, y no devuelve ni una columna al caller. Espejo en `schema.sql:592-596`. Aislamiento probado con **sesión anon real de otro dueño** + contrapeso: `capacity-mode-change-gate.test.ts:237-258` (0 filas sin error sobre el servicio ajeno; 1 fila sobre el propio). |
| T-15-04 | Information Disclosure | mitigate | **CLOSED** | `068:281` — `RAISE EXCEPTION 'service_mode_has_future_appointments' USING ERRCODE = 'P0001'`. Literal **fijo**: sin `%`, sin nombres, sin fechas, sin conteos. Espejo idéntico en `schema.sql:597`. Convivencia con los códigos de la 065 **re-verificada** por el auditor: `service_has_future_appointments` **no** es substring de `service_mode_has_future_appointments` (entre `service` y `_has_…` está `_mode`), así que el `message.includes(...)` del panel no los puede confundir. |
| T-15-05 | Tampering | mitigate | **CLOSED** | El gate es un `BEFORE UPDATE` (`068:298-300`), o sea que corre **dentro de la transacción del UPDATE**, no en un pre-check de pantalla: no hay ventana TOCTOU. Prueba más fuerte que la declarada: `capacity-mode-change-gate.test.ts:137-147` dispara el PATCH con el cliente **service-role**, que bypassa RLS — y aun así rebota con `P0001`. Verificado también por el auditor en `psql` como superusuario (§2.1, control 5). |
| T-15-06 | Tampering | **accept** | CLOSED | Riesgo aceptado §4. Verificado en el predicado: el `EXISTS` mira **qué queda colgando** (`date >= hoy AR` + estado vivo), no cómo llegó la fila a su estado ⇒ dos PATCH encadenados no lo rearman. **Salvedad de alcance encontrada por esta auditoría** (residual R-15-A, §4): marcar un turno **futuro** como `completed` desde el panel abre el gate. El efecto es inerte y no reabre R-1 — análisis completo en §2.2. |
| T-15-07 | Denial of Service (integridad) | mitigate | **CLOSED** | Criterio literal re-ejecutado: `grep -ci "return null" 068_*.sql` → **0**; `grep -cF "RETURN NEW;"` → **2** (el guard de no-cambio `:245` y el cierre `:288`), y **no hay ninguna otra salida** de la función. Comentado en `:284-287` con la lección T-14-16. Probado por comportamiento: `capacity-mode-change-gate.test.ts` caso 2 (el camino que SÍ pasa) asierta `error === null` **y relee la fila** — un `RETURN NULL` daría error nulo con la fila sin cambiar, y el caso caería. |
| T-15-08 | Tampering | mitigate | **CLOSED** | **Barrido independiente del write-path completo** (no heredado del SUMMARY): `grep -rn "from('services')" app/ lib/ test/ scripts/` → 6 escrituras de producción. Solo **una** manda `capacity_mode`: `settings-client.tsx:728` (`saveEditService`), y la manda **siempre**, incluso sin cambio ⇒ el guard `IS NOT DISTINCT FROM` (`068:244-246`) la deja pasar. `toggleService` (`:675`), `setServiceLocations` (`:684`), `lib/canchas.ts:204,282,308` **no** mandan la columna ⇒ el trigger ni dispara. `addService` (`:637`) y los INSERT de `lib/canchas.ts:64` y `app/(onboarding)/onboarding/page.tsx:356` son INSERT (fuera del alcance de un trigger de UPDATE) y los dos últimos **omiten** `capacity_mode` ⇒ toman el DEFAULT `individual`/1, que es legal. **Ningún UPDATE legítimo queda bloqueado — verificado ejecutando** (§2.1, controles 3 y 4). Es exactamente el error que el review propuso en la 067. |
| T-15-09 | Tampering | mitigate | **CLOSED** *(con salvedad de ejecución → T-15-32)* | El pre-flight con criterio de **ABORTO** está escrito en el header del archivo (`068:82-99`, control (i) con `max(capacity) > 1 ⇒ NO APLICAR`) y desarrollado en `15-RUNBOOK-068.md §1` con tabla de decisión SEGUIR/ABORTAR/REGISTRAR, incluida la fila `bloques = 0 ⇒ ABORTAR` (una query que no midió nada). El artefacto existe y es correcto. **Lo que esta auditoría NO puede verificar** es que se haya re-corrido contra prod el día de la aplicación real: no hay registro en el repo y producción está fuera de alcance. Se enruta a **T-15-32** con un control post-hoc concreto. |
| T-15-31 | Tampering de integridad | **accept** | CLOSED | Riesgo aceptado §4, con **evaluación propia** de la justificación en §2.5 (foco 5). La disposición se sostiene y la afirmación "no reabre R-1" es **verdadera y demostrable**. |
| T-15-SC | Tampering (supply chain) | mitigate | **CLOSED** | Re-ejecutado sobre el rango completo: `git diff --stat e95e11f..72c7194 -- package.json package-lock.json` → **vacío**. `tech-stack.added: []` en los cinco SUMMARY. Cero instalaciones ⇒ no aplica el gate de legitimidad de paquetes. |

### Plan 15-02 — Guard mínimo del editor y de los tests

| ID | Categoría | Disp. | Estado | Evidencia |
|----|-----------|-------|--------|-----------|
| T-15-10 | Tampering | mitigate | **CLOSED** | El piso del cliente es **espejo declarado**, no autoridad: `settings-client.tsx:134-136` (`minCapacityFor`) lleva escrito en su comentario (`:130-133`) que la autoridad es `services_capacity_matches_mode_chk`. Los tres write-paths aplican el piso: `:211` (el `onClick` del radio patchea modo **y** cupo en el mismo estado), `:635` (`addService`) y `:725` (`saveEditService`). Defensa en profundidad conservada: `:728` — `.update(payload).eq('id', editSvc.id).eq('business_id', business.id)`. El invariante real sigue en la base (T-15-02). |
| T-15-11 | Information Disclosure | mitigate | **CLOSED** | `settings-client.tsx:731-737` — discrimina por `error.code === 'P0001'` **más** `error.message?.includes('service_mode_has_future_appointments')` y emite copy **propia y fija** (`:735`). Verificado carácter por carácter: el toast **no interpola** `error.message`, ni el nombre del servicio, ni fechas, ni conteos. El fallback (`:738`) es el literal genérico `'Error al guardar'`. Molde exacto de `deleteService` (`:654-661`). |
| T-15-12 | Elevation of Privilege | mitigate | **CLOSED** | Criterio de grep re-ejecutado sobre el archivo: `grep -n "createAdminClient\|SERVICE_ROLE"` → **0 matches**. El cliente es el del navegador (anon + RLS) y el plan no agrega ninguna llamada nueva a la base: las 6 escrituras sobre `services` del archivo son las mismas de antes de la fase (verificado contra `git show e95e11f:…`). |
| T-15-13 | Tampering | **accept** | CLOSED | Riesgo aceptado §4. Confirmado en código: `test/helpers/booking-fixtures.ts:18` (`SUPABASE_SERVICE_ROLE_KEY`) vive **solo** bajo `test/`; ningún archivo de `app/` ni `lib/` lo importa. La aserción de aislamiento **no** usa ese cliente (ver T-15-27). |

### Plan 15-03 — El cupo sale del servicio dentro del motor (`book_slot_atomic`)

| ID | Categoría | Disp. | Estado | Evidencia |
|----|-----------|-------|--------|-----------|
| T-15-14 | Tampering | mitigate | **CLOSED** | `068:725` (`v_capacity := v_svc_cap;`) + `:746` (`v_is_group := (v_capacity > 1);`), con el CHECK de coherencia detrás ⇒ `is_group ⟺ modo <> 'individual'`. Verificado **contra la función instalada**, no contra el archivo: `select position('MAX(tb.capacity)' in prosrc)` → **0** y `position('v_capacity := v_svc_cap' in prosrc)` → **24723** sobre `pg_proc`. Las dos direcciones obligatorias están probadas con control negativo A/B ya ejecutado (`CUPO-07 (a)`: cupo >= 2 nace `is_group = true`; `(b)`: cupo 1 vuelve al EXCLUDE 013 y muere con `23P01`). Suite re-corrida por el auditor: **24/24**. |
| T-15-15 | Tampering / DoS de integridad | mitigate | **CLOSED** | Eje de serialización **byte-idéntico**, verificado por `diff` entre migraciones: `064:181` y `068:441` son la misma línea (`pg_advisory_xact_lock(hashtextextended(p_business_id::text \|\| p_date::text, 0))`), y `064:275` = `068:537` (locks por espacio, orden ascendente). Cero locks agregados, cero quitados. `concurrency.test.ts` **24/24** re-corrido por el auditor, con `CONC-01`, `CUPO-04`, `CR2-01`, `CR-03 (a)` y el `CUPO-07 (d)` (carrera N+1 con warm-up de N+1 carriles, `:1173`) adentro. |
| T-15-16 | Elevation of Privilege | mitigate | **CLOSED** | `068:403-407` — el `SELECT` del paso 0 conserva `AND s.business_id = p_business_id`: un `p_service_id` de otro tenant **no resuelve**. El fail-safe (`:408`) pasa a `'individual'`, que por el CHECK implica cupo 1 ⇒ `v_seat := 0`, `is_group = false`, la fila **dentro** del EXCLUDE 013: estrictamente **más** fail-closed que el `'group_class'` histórico, que podía heredar un cupo > 1 del bloque. |
| T-15-17 | Denial of Service | mitigate | **CLOSED** | `CREATE OR REPLACE` puro: `grep -c "DROP FUNCTION" 068_*.sql` → **0**. Firma verificada por `diff` literal contra la 064 (14 params + `RETURNS TABLE (id, cancel_token)` + `LANGUAGE plpgsql SECURITY DEFINER SET search_path = public`) → **sin diferencias**. `GRANT EXECUTE … TO anon, authenticated, service_role` (`068:767`) idéntico al de `064:482` — ni un rol de más. Los cuatro consumidores cubiertos por las suites verdes (booking público, alta manual, abonos, canchas). |
| T-15-18 | Tampering | **accept** | CLOSED | Riesgo aceptado §4. **Verificado por `diff`, no por lectura**: el predicado del gate espejo de `064` y el de `068:695-712` son **idénticos**; la única diferencia en todo el bloque es **una palabra de un comentario** (`"por la feature nueva"` → `"por el modo simultáneo"`). El alcance no se movió un carácter: se reescribió solo la justificación, cuya premisa (`time_blocks.capacity` es del bloque) murió con esta migración. |
| T-15-19 | Tampering | mitigate | **CLOSED** | Misma evidencia que T-15-09 (pre-flight con criterio de aborto), con la salvedad de ejecución enrutada a T-15-32. El razonamiento del cambio de régimen está escrito en `068:335-348` y `:661-672`, y probado por A/B contra la función de la 064. |

### Plan 15-04 — Las tres lecturas del cupo se alinean con el motor

| ID | Categoría | Disp. | Estado | Evidencia |
|----|-----------|-------|--------|-----------|
| T-15-20 | Tampering | mitigate | **CLOSED** | `app/api/booking/availability/route.ts:54-63` — la resolución **izada** conserva `.eq('business_id', business.id)` (`:60`) y el `invalid_service` con **400** (`:62`): un `serviceId` de otro negocio no resuelve. Verificado que la unificación no perdió ningún otro filtro: `grep -cF ".eq('business_id', business.id)"` → **10**, contra **11** en `git show e95e11f:` ⇒ la diferencia es **exactamente 1**, la del select de servicio que se fusionó. |
| T-15-21 | Information Disclosure | mitigate | **CLOSED** *(reforzada por hallazgo propio)* | El número vive server-side: `route.ts:75` (`const slotCapacity = …`) y las **tres** respuestas del endpoint son `{ ok, busy, full }` sin conteos ni cupo (`:260`, `:365`, `:452`). El `select` de bloques dejó de traer la columna (`:98-104`). **Hallazgo adicional del auditor que refuerza la mitigación:** la vista pública `public_services` (`schema.sql:1166-1179`) expone `capacity_mode` pero **NO** `capacity` ⇒ el número no sale por ningún camino público. Ver §3.2: la fase **redujo** la exposición pública del cupo. |
| T-15-22 | Tampering de integridad | mitigate | **CLOSED** | Las tres lecturas derivan del mismo campo y cambiaron en el mismo plan: `lib/booking-core.ts:193` (`Number(service.capacity) \|\| 1`, sobre la fila ya re-validada por `business_id` en `:114-119`) y `route.ts:75` + sus tres consumidores (`:236`, `:280`, `:426`/`:445`). `capacityFor()` se **borró entera** (`grep -cF "capacityFor"` → **0**): no queda call-site huérfano. Barrido propio: la única lectura de `time_blocks.capacity` que queda en el árbol es `agenda-client.tsx` (T-15-25, `accept`, Phase 16). |
| T-15-23 | Tampering | mitigate | **CLOSED** | `route.ts:75` — `Number(svc?.capacity) \|\| 1`: sin `serviceId` cae a **1**, el camino más restrictivo, con el porqué escrito en `:69-74`. Canchas queda byte-idéntico (su servicio es de cupo fijo 1) y lo confirma `canchas-booking.test.ts` 4/4. Sub-ofrecer esconde un slot; sobre-ofrecer produciría un rechazo en el `create`: la elección es la correcta. |
| T-15-24 | Elevation of Privilege | mitigate | **CLOSED** | El orden de los rechazos se conserva: `route.ts:137` devuelve `any_professional_unsupported` con **400** dentro del `if (any && svc)` y **antes** de cualquier agregación across-staff (`grep -cF "'any_professional_unsupported'"` → **1**). El espejo del write-path sigue en `lib/booking-core.ts:136` con el mismo código y status. |
| T-15-25 | Information Disclosure | **accept** | CLOSED | Riesgo aceptado §4. Confirmado: la 4ª lectura (`app/(dashboard)/agenda/agenda-client.tsx:465-474` + el `isGroup` de presentación de `:638`) es una pantalla **autenticada** sobre datos que el dueño ya posee; el drift es de visualización, no de reserva. El público sigue recibiendo solo el booleano por slot (T-15-21). Asignada a la Phase 16 por D-08 — fuera de alcance por decisión de fase, no por omisión. |

### Plan 15-05 — Verificación del gate y runbook de la 068

| ID | Categoría | Disp. | Estado | Evidencia |
|----|-----------|-------|--------|-----------|
| T-15-26 | Tampering | mitigate | **CLOSED** | Las tres defensas del molde, verificadas caso por caso en `test/capacity-mode-change-gate.test.ts`: (a) se asiertan `code` **y** `message` (`:143-146`), nunca "hubo error"; (b) se relee el **estado real** de la base con `modeOf()` después de cada intento (`:97-105`, service-role para que la lectura de control no quede filtrada por la misma policy que se prueba); (c) el caso 2 detecta un `RETURN NULL`. Cada caso **siembra su propio servicio**, así que ningún UPDATE puede salir "Success" por no matchear filas. Control negativo **ejecutado y transcrito** (`15-05-SUMMARY.md:121-144`): con el trigger dropeado caen los 3 casos de rechazo y sobreviven los 4 que no dependen de él — el reparto correcto. Re-corrida por el auditor: **7/7**. |
| T-15-27 | Elevation of Privilege | mitigate | **CLOSED** | Los **dos** guards anti-falso-verde están en el `beforeAll` y **lanzan**: `:61-67` (aborta si el cliente de aserción perdió la sesión anon) y `:68-73` (aborta si `NEXT_PUBLIC_SUPABASE_ANON_KEY === SUPABASE_SERVICE_ROLE_KEY`). El caso 6 (`:237-258`) corre con **sesión anon real** del dueño de un segundo tenant y trae su **contrapeso dentro del mismo `it`**: sin él, una RLS que bloqueara a todos dejaría la primera mitad verde. |
| T-15-28 | Tampering | mitigate | **CLOSED** | `test/concurrency.test.ts:785` define `warmUpPool(lanes = 3)` y el caso `CUPO-07 (d)` lo llama con `warmUpPool(N + 1)` (`:1173`) — warmear 3 con 4 carriles habría dejado el 4º frío, que es el falso verde exacto que el warm-up impide. A/B contra el mutante que restaura `MAX(tb.capacity)` **ejecutado y transcrito** (`15-05-SUMMARY.md:146-167`): los 4 casos `CUPO-07 (a)-(d)` caen con los códigos que sus comentarios predicen. |
| T-15-29 | Repudiation | mitigate | **CLOSED** *(el artefacto; la mitad operativa → T-15-32)* | `15-RUNBOOK-068.md` existe y contiene lo declarado, verificado sección por sección: §1 pre-flight con tabla de decisión y **criterio de ABORTO** (incluida la fila `bloques = 0`); §2 orden de deploy, `db push` **prohibido** con el motivo (prod no tiene `schema_migrations`) y el `NOTIFY pgrst` como última sentencia obligatoria; §3 verificación **por instalación** contra `pg_constraint`, `information_schema`, `pg_trigger` y `pg_proc.prosrc` — con el control invertido `position('MAX(tb.capacity)' in prosrc) → f`, que es el que detecta que el paso 7 no reemplazó la función; §4 rollback **por objeto** con la trampa del enum viejo; §5 numeración siguiente. **Todos los controles devuelven filas** (los `RAISE NOTICE` no se ven en el SQL Editor). ⚠ La segunda mitad de la mitigación declarada —*"la evidencia queda registrada al aplicar"*— **no ocurrió**: la aplicación real a prod no dejó registro en el repo. Se enruta a **T-15-32**, §3.1. |
| T-15-30 | Information Disclosure | **accept** | CLOSED | Riesgo aceptado §4. Confirmado: `test/helpers/booking-fixtures.ts` usa prefijo único por corrida (`__test_<uuid8>`, `:46`, `:57`, `:65`, `:73`, `:81`) y `teardownOneTenant` (`:350`) borra el negocio entero por cascada; el `afterAll` de la suite del gate desmonta **los dos** tenants (`:76-79`). Corren contra el Supabase **local**. |

---

## 2. Los cinco focos del encargo

### 2.1 Foco 1 — ¿CUPO-08 cierra R-1 de verdad? → **SÍ, y está probado contra la base, no contra la prosa**

La afirmación en la que se apoya toda la fase es `is_group ⟺ capacity_mode <> 'individual'`, y de ahí
que gatear **solo el modo** alcance. Verificada en tres capas independientes:

**(a) El derivador.** `is_group` lo escribe **una sola cosa** en todo el sistema: el `INSERT` de
`book_slot_atomic` (`068:748-758`), desde `v_is_group`, que se deriva en `:653` (rama simultánea) y
`:746` (rama individual + grupal) como `(cupo > 1)` sobre `services.capacity`. Barrido propio:
`grep -rn "is_group" app/ lib/` → **cero escrituras** desde TypeScript (solo comentarios y el tipo).
`grep` sobre los write-paths de `appointments` → **ningún** `update` que toque `is_group` ni
`service_id`. O sea: la columna no tiene otra fuente.

**(b) El CHECK cierra el cruce de la frontera.** Para que `is_group` cambie de clase hay que cruzar
`capacity = 1 ⇄ capacity >= 2`, y el CHECK ata cada lado a un modo. **Probado ejecutando**, en
transacciones revertidas contra el Postgres local:

| # | Control adversarial | Resultado |
|---|---|---|
| 1 | `individual` + subir **solo** `capacity` a 5 | `ERROR: … violates check constraint "services_capacity_matches_mode_chk"` ✔ rebota |
| 2 | `group_class` + bajar **solo** `capacity` a 1 | `ERROR: … violates check constraint "services_capacity_matches_mode_chk"` ✔ rebota |
| 3 | `group_class` 2 → 9, **solo** `capacity`, sin turnos | `UPDATE 1` ✔ pasa, y el trigger **ni dispara** (no está en el `SET`) |
| 4 | `capacity_mode` en el `SET` con el **mismo** valor + turno futuro vivo | `UPDATE 1` ✔ pasa (es lo que emite `saveEditService` en cada guardado) |
| 5 | **Cambio real** de modo + turno futuro vivo | `ERROR: service_mode_has_future_appointments` / `CONTEXT: PL/pgSQL function services_block_mode_change() line 50 at RAISE` ✔ traba |

**No existe ningún camino donde cambiar solo `capacity` voltee `is_group`:** el salto 1 ⇄ ≥2 exige
cambiar de modo, y el cambio de modo está gateado. El gate es **suficiente**, no un parche.

**(c) La frontera de estados del gate coincide con la del EXCLUDE.** Es la parte que ningún documento de
la fase declara explícitamente y que esta auditoría verificó: el gate ignora `cancelled` y `completed`
(`068:273`) y el EXCLUDE 013 solo indexa `status IN ('confirmed','pending_payment') AND NOT is_group`
(`schema.sql:1300`). O sea que **las filas que el gate deja pasar son exactamente las que el EXCLUDE ya
no mira**: una fila `completed`/`cancelled` con `is_group` obsoleto es **inerte**. Las dos fronteras
están alineadas; si no lo estuvieran, el gate tendría un agujero. **R-1 queda cerrado.**

### 2.2 Foco 2 — El gate `BEFORE UPDATE OF capacity_mode`: ¿bloquea algún UPDATE legítimo? → **NO**

Barrido completo de `from('services')` sobre `app/`, `lib/`, `test/` y `scripts/` (T-15-08). **Seis**
escrituras de producción, **una sola** manda `capacity_mode`, y la manda siempre con el mismo valor
salvo cuando el dueño lo cambia a propósito. Los INSERT que **omiten** la columna (`lib/canchas.ts:64`,
`onboarding/page.tsx:356`) toman el DEFAULT `individual` con `capacity` 1 ⇒ combinación legal: la
provisión de canchas y el onboarding **no** se rompen. Controles 3 y 4 de §2.1 lo prueban ejecutando.
Es el error que en la 067 habría roto todas las bajas de abono: acá **no se cometió**.

**Residual encontrado por esta auditoría (R-15-A, §4), que extiende T-15-06.** El botón "Marcar
completado" de `app/(dashboard)/appointments/appointments-client.tsx:80-84` no tiene guarda de fecha:
un turno **futuro** `confirmed` se puede pasar a `completed`, y con eso el gate deja de verlo y el
cambio de modo pasa. La fila queda con `is_group` obsoleto — pero **inerte**, por §2.1(c): `completed`
está fuera del EXCLUDE 013 y fuera de **todos** los counts del RPC (los cinco filtran
`status IN ('confirmed','pending_payment')`). Para revivirla haría falta devolverla a un estado vivo, y
la UI **no ofrece ese camino** (verificado en `RowActions:66-96`: `pending→confirmed`,
`confirmed→completed`, activo→cancelar, `cancelled|pending_payment`→eliminar; **no hay des-cancelar ni
des-completar**). Solo un PATCH forjado por el propio dueño, sobre su propio tenant, lo lograría.
**Cero impacto cross-tenant, autolesión deliberada, no reabre R-1 por ningún camino de la UI.** Se
registra como riesgo aceptado con condición de cierre barata (§4).

### 2.3 Foco 3 — El código de dominio no filtra datos del negocio → **verificado en las dos puntas**

- **Origen:** `068:281` — literal fijo, cero interpolación. Espejo idéntico en `schema.sql:597`.
- **Destino:** `settings-client.tsx:731-737` — el panel discrimina por `code` + `includes` y emite copy
  **propia y fija** (`:735`). El texto crudo del error **nunca** llega a pantalla; el fallback es el
  genérico `'Error al guardar'` (`:738`).
- **Convivencia:** re-verificada por el auditor contra los dos códigos de la 065 — ninguno es substring
  del otro en ninguna dirección, así que el `includes` de `deleteService` (`:656-657`) y el de
  `saveEditService` no se pueden confundir.

Lección T-14-14 / T-13-09 aplicada correctamente y sin atajos.

### 2.4 Foco 4 — Cero regresión del núcleo anti-doble-booking → **verificado**

- **Firma del RPC:** `diff` literal contra la 064 → **sin diferencias**. `GRANT` idéntico. Sin
  `DROP FUNCTION`. Los cuatro consumidores entran por `createAppointmentCore` y ninguno vio cambiar su
  contrato.
- **Eje de serialización:** las dos líneas de lock son byte-idénticas a las de la 064 (§T-15-15). El
  lock de negocio-día y los locks por espacio en orden ascendente no se movieron ⇒ CR2-01 no se reabre.
- **Gate espejo:** predicado idéntico por `diff`; cambió una palabra de un comentario.
- **Gemelo canchas:** `canchas-booking-client.tsx` no se tocó a propósito — su servicio es de cupo fijo
  1 y el fallback del endpoint es 1 ⇒ byte-idéntico; `canchas-booking.test.ts` 4/4 lo confirma, y la
  provisión de canchas (`lib/canchas.ts:64`) omite `capacity_mode` ⇒ nace `individual`/1, legal.
- **Suites re-corridas por el auditor:** `concurrency.test.ts` **24/24** y
  `capacity-mode-change-gate.test.ts` **7/7**, contra el Postgres local con la 068 instalada.
- Los **dos** `seedTimeBlock(t, { capacity: 3 })` que quedan en `concurrency.test.ts` son los controles
  negativos `CUPO-07 (b)` y `(c)`: el número del bloque **miente a propósito** y es la mentira lo que el
  caso prueba. Bajarlos los dejaría sin poder discriminante. Verificado y **no** contado como deuda.

### 2.5 Foco 5 — T-15-31 (`accept`): ¿está justificado, o se descartó una mitigación barata sin evaluar?

**El riesgo es real y está bien descrito:** bajar `capacity` de 5 a 2 en un grupal con 4 turnos ya
reservados en un mismo horario deja ese slot **sobre-cupo**. El gate no dispara (no hay cambio de modo)
y el CHECK no lo impide (2 >= 2).

**La afirmación "no es R-1 y no reabre R-1" es verdadera y la verifiqué:** `is_group` de esas filas es
`true` y el modo sigue siendo `group_class` ⇒ `is_group ⟺ modo <> individual` **se sigue cumpliendo**;
el EXCLUDE 013 trata a esas filas igual que antes; ningún gate deja de cubrir nada. Y el estado es
**convergente, no divergente**: el RPC compara contra el `capacity` vigente (`068:738`), así que ese slot
simplemente deja de admitir reservas nuevas (`slot_full`), y `availability` lo publica como lleno
(`route.ts:445`, `n >= slotCapacity`). Tampoco hay colisión de asientos: los `seat` ya asignados (0..3)
son únicos por el índice 011 y nadie recalcula.

**¿Se descartó una mitigación barata sin evaluar?** Parcialmente, y lo digo sin suavizar:

- La mitigación **en la base** (rechazar la baja) **no** es barata: exige un `GROUP BY` sobre los slots
  futuros del servicio dentro de un trigger, y toparía con el mismo problema que D-03 le encontró a
  "reparar": el dueño queda trabado sin salida clara.
- La mitigación **en el editor** (avisar "hay un horario con 4 reservas; el cupo nuevo es 2") **sí** es
  barata y **no** está evaluada en el registro: el `accept` la nombra como "candidato de la Phase 16"
  sin comparar costo. Es la opción correcta y debería quedar asignada explícitamente, no implícita.

**Veredicto: el `accept` se sostiene** (efecto local, auto-infligido por el propio tenant, convergente,
sin impacto cross-tenant ni sobre el anti-doble-booking), **con una corrección a la justificación**: la
frase "pide una decisión de producto que nadie tomó" es cierta para la variante "rechazar/cancelar", no
para la variante "avisar". Queda registrado en §4 con condición de cierre concreta.

---

## 3. Lo no modelado — encargo explícito del orquestador

### 3.1 T-15-32 — La 068 se aplicó a producción FUERA DEL ORDEN del runbook · **OPEN (WARNING)**

**Los hechos** (aportados y medidos por el orquestador; producción está fuera del alcance de esta
auditoría por instrucción): el runbook fija **código primero, migración inmediatamente después**
(`15-RUNBOOK-068.md §2`, decisión registrada como desviación 3 de `15-05-SUMMARY.md`). El dueño la
aplicó **antes**. El motor no se rompió; lo que se rompió fue **crear un servicio nuevo**. Se corrigió
deployando el código (`e95e11f..72c7194`), no con una migración correctiva.

#### (1) ¿Hubo consecuencias de INTEGRIDAD? → **No.**

- **Los dos rechazos son atómicos.** El `CHECK` aborta la sentencia y el `RAISE` del trigger aborta la
  transacción: no existe escritura parcial. El servicio que no se pudo crear **no se creó a medias**.
- **La migración es una sola unidad y no abortó.** Si alguna fila hubiera violado el CHECK de
  coherencia, el `ADD CONSTRAINT` (`068:176-181`) habría abortado el archivo entero (D-05). Que haya
  terminado implica que **toda** la tabla `services` quedó coherente en ese instante.
- **Y no puede dejar de estarlo:** los tres INSERT del árbol o mandan un par coherente
  (`settings-client.tsx:635-637`, con el piso de `minCapacityFor`) o **omiten** `capacity_mode` y toman
  el DEFAULT legal (`lib/canchas.ts:64`, `onboarding/page.tsx:356`).
- **`appointments.is_group` no quedó obsoleto.** Con `max(time_blocks.capacity) = 1` en prod, toda fila
  anterior a la 068 nació `is_group = false`; con el backfill toda fila de `services` quedó
  `individual`. `is_group ⟺ modo <> individual` se cumple para **todo el corpus existente** sin
  necesidad de backfill de turnos. ⚠ Esto es una conclusión **derivada** de una premisa medida el
  **2026-08-11**, no una medición del estado actual de prod → control post-hoc abajo.

#### (2) ¿Hubo consecuencias de AISLAMIENTO? → **No.**

La 068 no toca ni una policy (`grep -i policy` sobre el archivo → 1 match, y es la línea del header que
dice que **no** las toca), no cambia `GRANT` (idéntico al de la 064), no modifica el filtro por tenant
del RPC (`:407`) ni el del gate (`:271`). La ventana de desalineación no alteró ningún límite de
autorización.

#### (3) ¿Qué se rompió exactamente? → **Disponibilidad de dos funciones del panel, en el propio tenant.**

Verificado leyendo el código que estaba desplegado (`git show e95e11f:…settings-client.tsx`):

| Acción con el código viejo + base nueva | Qué pasaba | Efecto |
|---|---|---|
| Crear un servicio (`addService`, `e95e11f:611-621`) | insertaba `capacity_mode: 'group_class'` (default del estado) + `capacity: 1` → **23514** | toast `"Error"`, **nada escrito** |
| Editar un servicio a "Clase grupal" | mismo par ilegal → **23514** (o `P0001` del gate si había turnos futuros) | toast `"Error al guardar"`, **nada escrito** |
| Editar nombre/precio/duración | mandaba `capacity_mode: 'individual'` (el valor que dejó el backfill), sin cambio ⇒ guard `IS NOT DISTINCT FROM` | ✔ seguía funcionando |
| Reservar (público, manual, abonos, canchas) | código viejo leía `time_blocks.capacity` (todo 1); RPC nuevo leía `services.capacity` (todo 1) | ✔ **byte-idéntico** |

O sea: **disponibilidad**, no integridad ni aislamiento. Y la neutralidad del camino de reserva depende
por completo de `max(time_blocks.capacity) = 1` — que es **exactamente** lo que el criterio de aborto
del pre-flight protege. Es la única cosa entre "ventana inofensiva" y "bajada silenciosa del cupo + cambio
de régimen del EXCLUDE".

#### (4) ¿Debería el runbook haber hecho el orden IMPOSIBLE de invertir? → **Sí, y era barato.**

Un orden que solo existe en prosa se invierte. El runbook lo declara en `§2` con negrita y con el motivo,
y aun así se invirtió — que es la evidencia empírica de que declarar no alcanza. Dos formas de
convertirlo en mecánico, en orden de preferencia:

1. **Estructural (la buena): partir el archivo.** La única sentencia sensible al orden es el CHECK de
   coherencia — es la que rompe al editor viejo. Todo lo demás (enum de tres, backfill, DEFAULT, gate,
   redefinición del RPC) es **inofensivo** aplicado antes del deploy. Con el CHECK en una **069** posterior
   al deploy, aplicar la 068 temprano deja de tener consecuencias y el orden deja de ser un requisito.
   Regla generalizable: *no mezclar en un mismo archivo DDL sensible al orden con DDL que no lo es.*
2. **Mecánica (la barata): gate de reconocimiento en la primera línea del archivo.** Tres líneas de
   `DO $$ … RAISE EXCEPTION` que aborten salvo que el operador declare explícitamente el deploy hecho
   (p. ej. un `set forjo.code_deployed = '<sha>'` que el propio runbook manda pegar arriba). Convierte una
   instrucción en un **fallo ruidoso**, que es la única forma de orden que sobrevive a un operador apurado.

*(Se descarta `NOT VALID` + `VALIDATE CONSTRAINT`: además de no tener precedente en el repo —divergencia
(b) del header—, **no** habría ayudado, porque `NOT VALID` igual rechaza las filas nuevas, que es
justamente lo que rompía al editor viejo.)*

#### (5) Lo que queda ABIERTO (y por qué es WARNING y no BLOCKER)

- **No hay registro de la aplicación en el repo.** `STATE.md:29-30`, `ROADMAP.md:595`, los cinco SUMMARY
  y el propio `15-RUNBOOK-068.md` (encabezado: *"⛔ la 068 NO está aplicada en producción"*) siguen
  afirmando que la última migración en prod es la **067**. Es la mitad no cumplida de T-15-29.
- **Riesgo concreto de esa desactualización:** `STATE.md:38` dice *"Próxima migración del proyecto: la
  **068**"*. Un próximo plan que lea eso puede numerar **068** una migración nueva y colisionar con una ya
  aplicada. Es el daño más probable de todo este hallazgo, y es de documentación.
- **Re-aplicar la 068 hoy sería inofensivo** (el archivo es idempotente por diseño: `DROP … IF EXISTS`,
  guards por `pg_constraint`, backfill por predicado, `CREATE OR REPLACE`), así que no hay urgencia
  operativa.
- **No bloquea** bajo `block_on: high`: no cambió ningún límite de autorización, ni policy, ni endpoint,
  ni el motor; el efecto medido fue disponibilidad y ya está corregido en prod.

**Condiciones de cierre de T-15-32** (cualquier orden, las tres son baratas):

1. **Registrar la aplicación**: fecha, quién, y el output de los controles de `15-RUNBOOK-068.md §3`
   contra prod (los cinco devuelven filas). Actualizar `15-RUNBOOK-068.md`, `STATE.md:29-30,38` y
   `ROADMAP.md:595` a *"última en prod = 068 · próxima del proyecto = **069**"*.
2. **Control post-hoc del pre-flight que no se pudo verificar** — dos queries de solo lectura contra
   prod, que miden el invariante en vez de asumirlo:
   ```sql
   -- (a) la premisa D-02, medida HOY y no el 2026-08-11
   select count(*) as bloques, max(capacity) as cupo_max from time_blocks;   -- esperado: cupo_max = 1

   -- (b) el invariante de la fase, medido sobre datos reales
   select count(*) as filas_incoherentes
     from appointments a
     join services s on s.id = a.service_id
    where a.is_group <> (s.capacity_mode <> 'individual');                    -- esperado: 0
   ```
   Si (a) devuelve `cupo_max > 1` o (b) devuelve algo distinto de 0, hay que abrir la remediación —
   pero entonces sería un hallazgo **medido**, no una sospecha.
3. **Anotar la lección de proceso** (§3.1(4)) para la próxima migración sensible al orden.

### 3.2 `services.capacity` como fuente ÚNICA — ¿cambia la superficie de ataque o el blast radius?

Pregunta del encargo, respondida con evidencia y sin "parece que": **el aislamiento por tenant es
idéntico, y tanto la exposición pública como el blast radius MEJORARON.**

| Dimensión | `time_blocks.capacity` (antes) | `services.capacity` (ahora) | Veredicto |
|---|---|---|---|
| **Policy de tenant** | `schema.sql:2077` — `business_id IN (select id from businesses where owner_id = auth.uid())` | `schema.sql:2101` — **la misma expresión, palabra por palabra** | **Sin diferencia.** RLS habilitada en las dos (`:2279`, `:2241`) |
| **Lectura pública** | `schema.sql:2231` — `CREATE POLICY "public read time_blocks" FOR SELECT USING (true)`, **sin restringir el rol**: el número era legible por cualquiera | `services` no tiene policy pública; la superficie pública es la vista `public_services` (`:1166-1179`), que expone `capacity_mode` pero **NO `capacity`** | **Mejora.** El número pasó de world-readable a server-only |
| **Quién escribe** | navegador del dueño, anon + RLS | navegador del dueño, anon + RLS | Sin diferencia |
| **Defensas en la tabla** | un solo CHECK: `capacity >= 1` (`:1268`). Sin gate. | `capacity >= 1` + `services_capacity_matches_mode_chk` + el trigger `BEFORE UPDATE OF capacity_mode` (`:1596-1600`) | **Mejora.** Dos controles nuevos donde antes no había ninguno |
| **Blast radius de un UPDATE equivocado o malicioso** | una fila es `(negocio, día de la semana, ventana)` y el RPC hacía `COALESCE(MAX(tb.capacity),1)` ⇒ tocar **una** fila volvía `is_group = true` a **todas** las filas de **todos** los servicios del negocio en esa ventana, sacándolas del EXCLUDE 013 | una fila es **un servicio**; y no puede cruzar la frontera 1 ⇄ ≥2 sin cambiar de modo (probado, §2.1) ⇒ el peor caso es el sobre-cupo local de T-15-31 | **Mejora clara.** De business-wide y cross-servicio a un servicio, y acotado por CHECK |

**Única asimetría que anoto, sin inflarla:** `settings-client.tsx:684` (`setServiceLocations`) escribe
sobre `services` **sin** `.eq('business_id', …)`, apoyándose solo en RLS. Verificado contra
`git show e95e11f:` — es **preexistente byte a byte**, no lo introdujo esta fase, y no toca
`capacity`/`capacity_mode`, así que no puede mover el cupo. Queda como observación de higiene, no como
hallazgo de la Phase 15.

**Conclusión, sin adornos:** concentrar el número en `services` **no** debilitó nada y sí endureció tres
cosas (exposición pública, blast radius, controles en la tabla). Es un "no hay diferencia" **verificado**
en aislamiento y una mejora medible en el resto.

---

## 4. Log de riesgos aceptados

| ID | Categoría | Superficie | Justificación registrada | Quién decide si se reabre |
|----|-----------|------------|--------------------------|---------------------------|
| T-15-06 | Tampering | encadenar escrituras para esquivar el gate | El `EXISTS` mira **qué queda colgando**, no cómo llegó la fila a su estado ⇒ no se rearma con dos PATCH. Cancelar los turnos **es** la salida legítima documentada (molde 067). | Reabrir si el gate pasa a mirar transiciones en vez de estado final. |
| **R-15-A** *(residual nuevo, extiende T-15-06)* | Tampering de integridad | `appointments-client.tsx:80-84` — marcar `completed` un turno **futuro** abre el gate | Se acepta porque el efecto es **inerte**: `completed` está fuera del EXCLUDE 013 (`schema.sql:1300`) y fuera de los cinco counts del RPC, y la UI **no ofrece** ningún camino de vuelta a un estado vivo (`RowActions:66-96`). Revivir la fila exige un PATCH forjado del propio dueño sobre su propio tenant. Cero impacto cross-tenant. | **Condición de cierre barata:** en el predicado del gate (`068:273`) excluir solo `'cancelled'`, dejando que un `completed` **futuro** siga bloqueando. Es un cambio de una palabra en una migración futura. Reabrir si la UI llega a ofrecer des-completar / des-cancelar. |
| T-15-13 | Tampering | fixtures con service-role | `test/helpers/booking-fixtures.ts:18` usa service-role **a propósito y solo bajo `test/`**; no viaja a producción y no se usa para asertar aislamiento (T-15-27). | Reabrir si un helper de `test/` se importa desde `app/` o `lib/`. |
| T-15-18 | Tampering | alcance del gate espejo de la 064 | No se re-escopea (D-07): el caso legal que protege —dos servicios **grupales** de cupo >= 2 coexistiendo solapados en la misma agenda— **sobrevive** al cambio de fuente del cupo. Ampliarlo sería **cambiar comportamiento**, no restaurar integridad, y hacerlo en la misma migración que mueve la fuente es apilar riesgo. Verificado por `diff`: el predicado no se movió un carácter. | El dueño, en la revisión propia ya anotada como diferido. |
| T-15-25 | Information Disclosure | 4ª lectura — `agenda-client.tsx:465-474`, `:638` | Pantalla **autenticada** sobre datos que el dueño ya posee: el drift es de **visualización**, no de reserva. El público sigue recibiendo solo el booleano por slot. Asignada a la Phase 16 por D-08. | Reabrir si esa lectura pasara a alimentar una escritura o a servir a un cliente no autenticado. |
| T-15-30 | Information Disclosure | datos de prueba en la base local | Prefijo único por corrida (`__test_<uuid8>`) + `teardownOneTenant` con cascada; corren contra el Supabase **local**, nunca contra prod. | Reabrir si alguna suite necesitara datos de producción. |
| T-15-31 | Tampering de integridad | **bajar** `capacity` en un grupal con turnos futuros | El slot queda sobre-cupo, pero **no reabre R-1** (verificado, §2.5): `is_group` no se desalinea, el EXCLUDE trata igual a esas filas y ningún gate deja de cubrir nada. Efecto local, auto-infligido, y **convergente** — el RPC compara contra el `capacity` vigente ⇒ ese slot deja de admitir reservas. | **Corrección a la justificación (§2.5):** "pide una decisión de producto" vale para *rechazar/cancelar*, **no** para *avisar*. La variante barata —un aviso en el editor cuando el cupo nuevo queda por debajo de la ocupación de algún slot futuro— **no** fue costeada. Asignarla explícitamente a la Phase 16 (CUPO-09) o aceptar el riesgo dejando escrito que se evaluó. |

---

## 5. Threat Flags de los SUMMARY

| Origen | Flag | Mapeo |
|--------|------|-------|
| `15-01-SUMMARY.md:268-271` | "Ninguna superficie nueva… la única escritura nueva es un trigger de solo-lectura sobre `appointments` con filtro explícito por tenant dentro de un `SECURITY DEFINER`." | Declaración de ausencia. **Verificada de forma independiente**: el cuerpo del trigger tiene un único `SELECT` (`068:267-273`), cero `INSERT`/`UPDATE`/`DELETE`, filtro por tenant explícito. Cubierta por T-15-03/04/05/07. |
| `15-02-SUMMARY.md:252-256` | "Ninguna superficie nueva. Cero dependencias npm. El cliente sigue siendo el del navegador (anon + RLS)." | Verificada: `grep "createAdminClient\|SERVICE_ROLE"` sobre `settings-client.tsx` → **0**; `package.json` sin cambios en el rango. |
| `15-03-SUMMARY.md:284-286` | "No hay endpoints, ni policies, ni columnas nuevas: la migración **redefine** una función existente con la firma intacta." | Verificada por `diff` de firma y de `GRANT` contra la 064, y por `pg_proc` sobre la función instalada. |
| `15-04-SUMMARY.md:307-316` | "Cero endpoints nuevos, cero columnas nuevas" + los seis mapeos T-15-20…25. | Verificada: el conteo de filtros por tenant en `availability` bajó **exactamente 1** (el select fusionado) y ninguno más; la forma de la respuesta pública no cambió (`{ ok, busy, full }` en las tres salidas). |
| `15-05-SUMMARY.md:235-237` | "Ninguno. No toca endpoints, ni auth, ni schema, ni policies." | Verificada: el plan agrega dos archivos de test y un documento. |

**Unregistered flags: 1 — `T-15-32`.** No sale de ningún `## Threat Flags`: sale de comparar el estado
declarado por los artefactos ("068 sin aplicar, última en prod = 067") contra el estado real de
producción informado por el orquestador. Ningún `<threat_model>` podía modelarlo —los cinco se
escribieron antes de que la migración existiera en prod— y por eso entra como encargo explícito.
Dictamen completo en **§3.1**.

**Barrido complementario de superficie no mapeada:** los archivos del rango sin amenaza propia
(`app/[slug]/booking-client.tsx`, `test/helpers/booking-fixtures.ts`, `test/booking-cualquiera-public.test.ts`)
no agregan endpoints, policies, columnas ni secretos; el cambio de `booking-client.tsx` es **agregar** un
parámetro que el endpoint ya re-validaba por tenant (T-15-20). No apareció superficie de ataque nueva sin
mapear más allá de T-15-32.

---

## 6. Gaps escalados

**Ninguno bloqueante.** Un WARNING abierto:

1. **T-15-32** (§3.1) — WARNING, no bloqueante bajo `block_on: high`. Tres condiciones de cierre
   concretas, todas de documentación + dos queries de solo lectura contra prod.

**No se reportan como gap** (confirmados fuera de alcance por instrucción y por decisión de fase): el
editor completo de la Phase 16 (D-10), la 4ª lectura de `agenda-client.tsx` (D-08), la UAT del booking
público pendiente en `15-UAT.md`, y que `grep -cE 'seedTimeBlock\(t, \{ capacity: [2-9]'` dé **2** — los
dos son controles negativos que mienten a propósito, y esa mentira es lo que los vuelve discriminantes.

**Nota operativa para el próximo apply manual** (además de la lección de §3.1(4)): el pre-flight de este
proyecto ya está bien construido —devuelve números, no "no rows"— pero su **ejecución** no deja rastro.
Conviene que el runbook pida pegar el output de los controles en el propio archivo antes de dar la
migración por aplicada; sin eso, el pre-flight es verificable como artefacto y no como acto.

---

## 7. Audit trail

| Ítem | Valor |
|------|-------|
| Rango auditado | `e95e11f..72c7194` — 24 commits (12 de código/tests de los 5 planes + docs) |
| Diff de código del rango | 11 archivos · +1762 / −262 · `git diff --stat e95e11f..72c7194 -- . ':!.planning'` |
| Migración auditada | `supabase/migrations/068_service_capacity_unified_and_mode_gate.sql` (771 líneas, **leída entera**) + espejo `supabase/schema.sql:576-605`, `:1144-1160`, `:1600` y el cuerpo del RPC |
| Estado en producción | **068 APLICADA** (informado por el orquestador; prod fuera del alcance de esta auditoría). Aplicada **antes** del deploy del código, contra el orden del runbook → T-15-32. Corregida por el deploy `e95e11f..72c7194`. **Ningún artefacto del repo lo registra** (condición de cierre 1 de T-15-32) |
| Estado en el Postgres LOCAL (verificado por el auditor) | 3 CHECK sobre `services` con la definición exacta · 2 triggers (`services_block_delete_trg`, `services_block_mode_change_trg`), los dos `tgenabled = 'O'` · `book_slot_atomic` con `position('MAX(tb.capacity)' in prosrc) = 0` y `position('v_capacity := v_svc_cap' in prosrc) = 24723` |
| Suites corridas por el auditor | `test/capacity-mode-change-gate.test.ts` → **7 passed (7)**, exit 0 · `test/concurrency.test.ts` → **24 passed (24)**, exit 0 |
| Controles adversariales propios | **5**, en transacciones revertidas contra el Postgres local (§2.1): capacity-only en los dos sentidos (23514 ×2), capacity-only dentro de la misma clase (pasa, trigger no dispara), mismo-valor de modo con turno futuro vivo (pasa), cambio real de modo con turno futuro vivo (`P0001`) |
| `diff` estructurales ejecutados | firma de `book_slot_atomic` 064 vs 068 → **idéntica** · `GRANT EXECUTE` 064 vs 068 → **idéntico** · predicado del gate espejo 064 vs 068 → **idéntico** (solo cambia una palabra de un comentario) · líneas de `pg_advisory_xact_lock` → **idénticas** |
| Barridos de invariante re-ejecutados | `from('services')` en `app/`+`lib/`+`test/`+`scripts/` → 6 escrituras de producción, 1 sola con `capacity_mode` · `is_group` escrito desde TS → **0** · `update` de `appointments.service_id` → **0** · `DROP FUNCTION` en la 068 → **0** · `return null` en la 068 → **0** · `RETURN NEW;` → **2** · `FROM time_blocks` en la 068 → **0** · `capacityFor` en `availability` → **0** · `package.json` en el rango → **sin cambios** |
| Fuentes verificadas | 5 PLAN (`<threat_model>` de cada uno) + 5 SUMMARY (incluidas sus **Deviations**) + `15-CONTEXT.md` (D-01…D-10) + `15-VERIFICATION.md` + `15-RUNBOOK-068.md` + `15-UAT.md` + `deferred-items.md` + `12-SECURITY.md` §R-1 + `14-SECURITY.md` (formato) |
| Archivos de implementación modificados | **0** — auditoría read-only. Único archivo escrito: este `15-SECURITY.md` |
| ASVS | **Nivel 2** (heredado de `12-SECURITY.md`: misma superficie anónima; el config del proyecto fija 1 y el 2 es estrictamente más exigente) · `block_on: high` · **sin hallazgos HIGH** · 1 hallazgo WARNING |
