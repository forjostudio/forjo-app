---
status: verified
phase: 18-el-modelo-y-la-disponibilidad
workstream: motor-reservas
milestone: v0.28
asvs_level: 2
block_on: high
threats_total: 37
threats_closed: 30
threats_accepted: 7
threats_open: 0
audited: 2026-08-25
remediated: 2026-08-25
audit_base: 2474791..HEAD (d179206)
remediation_base: db4eb5e
---

# Phase 18 — Auditoría de seguridad

**Veredicto: OPEN_THREATS.** Las 23 entradas del registro de plan-time (`T-18-01`…`T-18-22` +
`T-18-SC` declarado en los 4 planes) se verificaron **contra el sistema instalado** —Postgres local
con las migr. 071/072 aplicadas, y el servidor real de `npm run dev`—, no contra los SUMMARY.
**22 de 23 cerradas.** La única declarada que queda abierta es `T-18-06`, y no por descuido del
ejecutor: **el fail-safe que su mitigación declara dejó de ser cierto cuando se cerró CR-02**, y eso
se midió.

Además se incorporaron al registro **14 amenazas post-plan** (los 2 critical + 7 warnings + 3 info
del `18-REVIEW.md`, más 2 residuos que apareció midiendo esta auditoría). Los dos critical están
**cerrados y re-verificados de forma independiente**. Quedan **8 abiertas** en total y **5 riesgos
aceptados propuestos** que necesitan el OK explícito del dueño.

Ninguna de las abiertas rompe el aislamiento entre negocios ni la integridad de los pagos. La más
cara es operativa: **desplegar el código sin que PostgREST vea la tabla nueva apaga el booking
público entero** (medido).

---

## 0. Alcance real de la fase, medido

```
git diff --name-only 2474791..HEAD -- . ':(exclude).planning'
 app/api/booking/availability/route.ts
 app/api/booking/create/route.ts
 lib/booking-core.ts
 lib/time-block-services.ts
 lib/types.ts
 supabase/migrations/071_time_block_services.sql
 supabase/migrations/072_public_views_read_only.sql
 supabase/schema.sql
 test/availability-service-window.test.ts
 test/booking-service-window-backstop.test.ts
 test/helpers/booking-fixtures.ts
 test/time-block-services.test.ts
```

12 archivos. **Cero `.tsx`**, cero `proxy.ts`, cero `components/`, cero dependencias.

| Comprobación de entorno | Resultado |
|---|---|
| `git diff --stat 2474791..HEAD -- package.json package-lock.json` | **vacío** (T-18-SC) |
| `npx vitest run --no-file-parallelism` (3 suites de la fase + `isolation`) | **45 passed, 1 skipped, 0 failed** |
| Migraciones nuevas | **071** (tabla puente + RLS + vista) y **072** (hotfix CR-01) |
| Estado del árbol al auditar | limpio; **ningún archivo de implementación fue modificado por esta auditoría** |

**Frontera de tenant que se movió:** una tabla nueva con RLS (`time_block_services`), una vista
`public_*` nueva legible por `anon`, y **dos ejes de rechazo nuevos** sobre el endpoint público
`POST /api/booking/create` (`service_not_scheduled`, `bad_request` por forma de `date`/`time`).

---

## 1. Trust Boundaries

| Frontera | Descripción | Dato que la cruza |
|---|---|---|
| `anon` (sin sesión) → `public_time_block_services` | vista DEFINER: el anónimo lee el mapeo franja↔servicio de **cualquier** negocio | 3 uuid: `business_id`, `time_block_id`, `service_id`. Sin dato de cliente, precio ni ocupación |
| `anon` → `time_block_services` (tabla base) | no hay policy para el anónimo; la lectura devuelve 0 filas y la escritura rebota | — |
| dueño autenticado → `time_block_services` | escribe con anon key + RLS; el `business_id` lo pone el cliente y la policy lo valida contra `owner_id` | configuración de agenda |
| cliente anónimo → `GET /api/booking/availability` | decide **qué se le ofrece**; corre con service role (bypassa RLS) | `{ ok, busy, full }` |
| cliente anónimo → `POST /api/booking/create` | decide **qué se le acepta**; corre con service role | turno + fila en `clients` (datos personales) |
| `anon` → `book_slot_atomic` (RPC) | superficie **preexistente**: SECURITY DEFINER, `EXECUTE` concedido a `anon`, saltea el core entero | turno |

---

## 2. Registro de amenazas declaradas (plan-time)

Verificadas por **medición** salvo donde se indica. `CERRADA` = la mitigación declarada existe en el
sistema instalado. `ACEPTADA` = disposición `accept` del plan, registrada en §5.

| ID | Categoría | Disp. | Estado | Evidencia (medida) |
|---|---|---|---|---|
| T-18-01 | Info Disclosure | accept | **ACEPTADA** | La vista expone 3 columnas (`\d+ public_time_block_services`), sin JOIN. `SET LOCAL ROLE anon; SELECT count(*)` → lee filas de todos los tenants **sólo lectura** (§3, CR-01). Riesgo re-alcanzado tras la 072 |
| T-18-02 | Info Disclosure (falla silenciosa) | mitigate | **CERRADA** | `pg_class.reloptions` de la vista = **NULL** (sin `security_invoker`) **y** control positivo real: `SET LOCAL ROLE anon; SELECT count(*) FROM public_time_block_services` → **1 fila**. Con invocador habría devuelto 0 en silencio |
| T-18-03 | Tampering (`time_block_id` ajeno) | mitigate | **CERRADA (alcance declarado)** | Los dos consumidores acotan por tenant: `availability/route.ts:105-109` (`capBlocks .eq('business_id')`) + `:153-158` (puente `.eq('business_id')`), y `booking-core.ts:244-252` idem. Una fila con `time_block_id` de otro negocio no matchea ningún bloque propio ⇒ inerte. ⚠ La variante simétrica (bloque propio + `service_id` ajeno) **NO es inerte** → WR-02, ABIERTA |
| T-18-04 | Elevation of Privilege (`anon` escribe el mapeo) | mitigate | **CERRADA** | `relrowsecurity = t`, 4 policies (`pg_policies`), ninguna para `anon`. Medido como rol `anon`: `INSERT` sobre la tabla base → `new row violates row-level security policy`; `SELECT` → **0 filas**; `INSERT`/`DELETE` sobre la vista → `permission denied for view` (tras la 072). Residuos: R-01, R-02 |
| T-18-05 | Tampering (integridad referencial) | accept | **ACEPTADA** | `SELECT count(*) FROM time_blocks WHERE business_id IS NULL` → **0**. Falla al lado seguro (franja huérfana = comodín para siempre) |
| T-18-06 | DoS auto-infligido (cache de PostgREST) | mitigate | **🔴 ABIERTA** | La documentación existe (`grep -c "NOTIFY pgrst" 071` = **1**), pero **el fail-safe declarado es falso desde CR-02**. Ver §4.1 — medido |
| T-18-07 | Tampering (falso aislamiento en el helper) | mitigate | **CERRADA** | `lib/time-block-services.ts` no menciona `business_id` en ninguna función (sólo en la cabecera del contrato D-16). Caso `CONTRATO D-16` verde en `test/time-block-services.test.ts` (16/16 corridos en esta auditoría) |
| T-18-08 | DoS (regla del comodín invertida) | mitigate | **CERRADA** | Control pareado medido **contra el servidor real**: mismo día/franja, servicio **mapeado** → `full: []`; servicio **no mapeado** → `full: ["08:00"…"12:30"]` (10 horarios). Con la regla invertida el resultado sería el espejo. Además `startTimesNotOffered` **no tiene** atajo `bridge.length === 0` (verificado en el cuerpo) — el `[]` emerge de la regla |
| T-18-09 | DoS (regresión: horario especial) | mitigate | **CERRADA** | Medido en vivo: `POST` de un servicio NO mapeado a las **13:30** del lunes (fuera de las dos franjas 08-13 y 14-20) → **200, turno creado**. La regla no valida ventana general |
| T-18-10 | Info Disclosure (helper) | accept | **ACEPTADA** | Entradas del módulo: ids, minutos y `'HH:MM'`. Un solo `import type`, cero superficie de fuga |
| T-18-11 | Info Disclosure (motivo del ocultamiento) | mitigate | **CERRADA** | Respuesta real: `{"ok":true,"busy":[],"full":["08:00",…]}` — el contrato no cambió de forma y `full` no dice el motivo. `grep -c "return Response.json({ ok: true"` = **3**, las tres con `.concat(notOffered)`. El `id` de la franja se lee pero nunca se serializa |
| T-18-12 | Tampering (`serviceId` de otro negocio) | mitigate | **CERRADA** | Doble control medido: `GET …&serviceId=<de otro tenant>` → **400 `invalid_service`**; y la lectura de la puente lleva `.eq('business_id', business.id)` (`grep` = 1) aunque corra con service role |
| T-18-13 | DoS silencioso (filtrar en vez de sumar) | mitigate | **CERRADA** | Medido: `full` **crece** (0 → 10 horarios) para el servicio no mapeado y sigue en **0** para el mapeado ⇒ es una suma a `full`, no un filtro de bloques. La resta de conjuntos vive en el helper y la congela el caso 4 |
| T-18-14 | DoS (regresión canchas / clientes viejos) | mitigate | **CERRADA** | Medido: `GET` **sin** `serviceId` → `full: []`, idéntico a hoy. Gate `if (svc && serviceIdParam)` en el cuerpo |
| T-18-15 | Spoofing / bypass del read-path | accept (lo cierra 18-04) | **CERRADA** | La condición de la aceptación se cumplió: `POST` forjado → **400 `service_not_scheduled`**, **0 turnos** (§2, T-18-17) |
| T-18-16 | DoS (cobertura: `schedule_exceptions`) | accept | **ACEPTADA** | El caveat está escrito en el código (`availability/route.ts`, bloque de `notOffered`). ⚠ La aceptación cubre el sentido "no se puede ocultar"; el sentido inverso (se ofrece y se rechaza) **no estaba cubierto** → WR-07, ABIERTA |
| T-18-17 | Tampering (POST forjado) | mitigate | **CERRADA** | Medido de punta a punta contra `npm run dev`: `{"serviceId":"<Color>","date":"2026-08-31","time":"10:00"}` → **HTTP 400 `service_not_scheduled`**, `count(appointments)` = **0**. Control positivo: el mismo horario con el servicio **mapeado** → **200**. La regla se evalúa sobre `service.id` re-validado por `business_id` (`booking-core.ts:258`) |
| T-18-18 | DoS (el backstop se filtra a las exenciones) | mitigate | **CERRADA** | `grep -rn enforceServiceWindow` en todo el repo = 6 apariciones: tipo, default `false` (`booking-core.ts:139`), gate, el **único** caller (`booking/create/route.ts:210`) y un test. `app/api/appointments/create/route.ts` y `lib/abono-generation.ts` **no aparecen en el diff de la fase** |
| T-18-19 | DoS (validación general de ventana) | mitigate | **CERRADA** | Misma medición que T-18-09: 13:30 fuera de toda franja → 200 |
| T-18-20 | Tampering (caller futuro) | mitigate | **CERRADA** | `enforceServiceWindow = false` en la desestructuración (`booking-core.ts:139`), documentado en el tipo junto a `requireDeposit`/`autoAssign` |
| T-18-21 | Elevation of Privilege (`book_slot_atomic`) | accept | **ACEPTADA (exposición real, medida)** | `has_function_privilege('anon', 'book_slot_atomic', 'EXECUTE')` = **t**, `prosecdef` = **t**, owner `postgres`. El todo existe: `.planning/workstreams/motor-reservas/todos/pending/2026-08-18-book-slot-atomic-es-ejecutable-por-anon.md`. ⚠ Esta fase **agranda** la consecuencia: ver §5 |
| T-18-22 | Info Disclosure (código de error) | accept | **ACEPTADA** | `service_not_scheduled` revela lo mismo que la grilla pública ya revela al no ofrecer el horario |
| T-18-SC | Tampering (supply chain) ×4 | accept | **ACEPTADA** | `git diff --stat 2474791..HEAD -- package.json package-lock.json` → **vacío** |

**22 de 23 declaradas cerradas o aceptadas. 1 abierta (T-18-06).**

---

## 3. Los dos critical del review: cerrados y re-verificados

### CR-01 — las vistas `public_*` eran escribibles por `anon` — ✅ CERRADA

Verificada **por instalación**, no por `grep` del `.sql`. Grants tras la 072
(`information_schema.role_table_grants`, 12 filas):

```
public_businesses            | anon / authenticated | SELECT
public_canchas               | anon / authenticated | SELECT
public_professional_services | anon / authenticated | SELECT
public_professionals         | anon / authenticated | SELECT
public_services              | anon / authenticated | SELECT
public_time_block_services   | anon / authenticated | SELECT
```

Los cinco ataques, como rol `anon` sin sesión, en transacciones revertidas:

```
INSERT INTO public_time_block_services …  → ERROR: permission denied for view public_time_block_services
DELETE FROM public_time_block_services    → ERROR: permission denied for view public_time_block_services
DELETE FROM public_services               → ERROR: permission denied for view public_services
DELETE FROM public_businesses             → ERROR: permission denied for view public_businesses
UPDATE public_professionals SET name=…    → ERROR: permission denied for view public_professionals
```

Control de no-regresión de lectura (lo que la 072 **no** podía romper):

```
SET LOCAL ROLE anon;
SELECT count(*) FROM public_businesses            → 3
SELECT count(*) FROM public_time_block_services   → 1
```

Y `supabase/schema.sql:4101-4139` ya refleja `GRANT SELECT` en las seis: el arreglo sobrevive a una
regeneración del baseline. **`is_updatable` sigue en `YES` para cinco de las seis** — la vista sigue
siendo auto-actualizable; lo que se sacó es el permiso. Es la decisión correcta (poner
`security_invoker` rompería la lectura anónima), pero significa que **el único candado es el GRANT**.

### CR-02 — el backstop fallaba ABIERTO — ✅ CERRADA

Medida contra el servidor real, no contra vitest:

```
POST /api/booking/create {"date":"2026-8-31","time":"10:00"}      → 400 {"ok":false,"error":"bad_request"}
POST /api/booking/create {"date":"2026-08-31","time":"10:00 AM"}  → 400 {"ok":false,"error":"bad_request"}
POST /api/booking/create {"date":"2026-02-31","time":"10:00"}     → 400 {"ok":false,"error":"bad_request"}
POST /api/booking/create {"serviceId":"<Color>", …,"time":"10:00"}→ 400 {"ok":false,"error":"service_not_scheduled"}
POST /api/booking/create {"serviceId":"<Corte>", …,"time":"10:00"}→ 200 {"ok":true,"appointmentId":"b5a9a79d…"}   ← control
```

Los tres payloads malformados **no dejaron fila en `clients`** (el guard de forma corre antes del
insert): sólo el control positivo dejó una, y se borró. El fail-closed del core también se midió, y
funciona — ver §4.1, donde se muestra lo que ese acierto cuesta.

---

## 4. Amenazas ABIERTAS

### 4.1 🔴 T-18-06 — el fail-safe declarado del deploy es FALSO desde CR-02 (BLOQUEANTE operativo)

La mitigación declarada dice, textual: *"Fail-safe: sin la tabla, la lectura de la puente devuelve
vacío ⇒ todo comodín ⇒ el booking de hoy sigue funcionando"*. **Eso ya no es cierto**: CR-02 hizo —
correctamente — que el backstop falle CERRADO ante un error de query (`booking-core.ts:253-256`).

Medición (permiso de lectura de la puente retirado a `service_role` para reproducir "la tabla no es
legible", restaurado inmediatamente después):

```
REVOKE SELECT ON time_block_services FROM service_role;
POST /api/booking/create  (martes, franja COMODÍN, negocio sin una sola fila de mapeo)
  → HTTP 400 {"ok":false,"error":"service_not_scheduled"}      ← el booking público, CAÍDO

GRANT ALL ON time_block_services TO service_role;   (restaurado)
POST /api/booking/create  (mismo pedido)
  → HTTP 200 {"ok":true,"appointmentId":"2053aba9…"}
```

O sea: **si el código de la Phase 18 llega a producción y PostgREST no tiene `time_block_services`
en su cache de schema, TODAS las reservas públicas de TODOS los negocios devuelven 400** — incluidos
los negocios con cero configuración. No es una degradación: es una caída total del camino que
factura. Y el mensaje que ve el usuario final es *"Error al confirmar. Intentá de nuevo."* (WR-07),
un reintento que nunca puede funcionar.

Ventanas de riesgo reales:
1. deploy del código **antes** de aplicar la 071 a mano;
2. 071 aplicada **sin** `NOTIFY pgrst, 'reload schema';`
3. cualquier reinicio/rollback futuro que deje el schema cache viejo.

**Cierre requerido (elegir uno):**
- **(a)** Confirmar por medición contra producción, ANTES de deployar el código, que PostgREST ve la
  tabla: `GET https://<proj>.supabase.co/rest/v1/time_block_services?select=business_id&limit=1` con
  la anon key. Respuesta `[]` o `401/permission` = cache OK. Un `PGRST205 Could not find the table` =
  **no deployar**. Dejar la evidencia pegada acá.
- **(b)** Aceptar el riesgo explícitamente y dejar registrado el runbook de rollback (revertir el
  deploy del código, no la migración).

---

### 4.2 🔴 WR-03 — el rechazo nuevo deja filas `clients` huérfanas (escritura anónima de datos personales)

**Confirmada por medición propia**, además de por la UAT. Seis POST forjados consecutivos contra el
servidor real:

```
req1..req5 HTTP 400 (+ el POST inicial)  → filas nuevas en `clients`: 6      ← una por request
count(appointments) = 0                                                     ← ningún turno, como corresponde
sin throttling, sin backoff, sin límite
```

`app/api/booking/create/route.ts:145-150` inserta el cliente **antes** de `createAppointmentCore`, y
el rechazo nuevo vive **dentro** del core. El propio archivo documenta el problema para el backstop
de ventana de reserva (*"Corre TEMPRANO … para que una fecha fuera de ventana no deje filas `clients`
huérfanas (Pitfall 3)"*) y este control lo reintroduce.

Agravante medido en el código: cuando el negocio **pide seña**, el reCAPTCHA **se saltea a propósito**
(`route.ts:135-141`, el gate es el pago). En esos negocios un anónimo puede escribir filas con
`name`/`phone`/`email` arbitrarios en la tabla de clientes del dueño sin ningún control, a razón de
una por request.

No es cosmético: es **escritura no autenticada a una tabla de negocio que guarda datos personales**
(Ley 25.326 / minimización de datos), y ensucia la lista que el dueño usa para operar.

**Cierre esperado:** evaluar la regla antes del `insert` en `clients` (el patrón que el repo ya eligió
para la ventana de reserva) o borrar el cliente recién creado cuando `result.error` es un 400 de
validación. Alternativa mínima aceptable: aceptarlo explícitamente **con** una nota de retención/purga.

---

### 4.3 🟠 WR-02 — la RLS no exige que las tres FK sean del MISMO negocio

**Confirmada por medición, en las dos direcciones.** Como `authenticated` con
`request.jwt.claims.sub` = el dueño de `negocio-prueba`:

```
INSERT (mi business_id, time_block_id de OTRO tenant, mi service_id)  → INSERT 0 1   ✔ aceptada
INSERT (mi business_id, mi time_block_id, service_id de OTRO tenant)  → INSERT 0 1   ✔ aceptada
pg_constraint sobre time_block_services: 3 FK simples + PK. Sin FK compuesta.
```

Y los ids ajenos **son públicos**: como `anon`, `public_services` devuelve los 4 servicios de todos
los tenants y `time_blocks` (policy `public read`, `qual: true`) devuelve los 10 bloques de todos.
No hay nada que adivinar.

Impacto hoy: la primera variante queda inerte (T-18-03). La segunda **no**: convierte una franja
propia en "mapeada a un servicio que no existe en mi catálogo" ⇒ esa franja deja de ofrecer todos mis
servicios. Es auto-infligido, no cross-tenant, pero la invariante *"toda fila de la puente pertenece
a un solo tenant"* **no está garantizada en ningún lado**, y la Phase 19 va a leer y renderizar esa
tabla. La skill `supabase-multitenant-rls` pide exactamente lo contrario.

**Cierre esperado:** UNIQUE compuesto en los padres + FK compuestas (el SQL está escrito en
`18-REVIEW.md`), verificado con `db reset` local antes de prod. O aceptación explícita con la
condición de que la Phase 19 valide pertenencia en su write path.

---

### 4.4 🟠 R-01 — la 072 cerró las seis vistas, pero **no desarmó el mecanismo que las abrió**

Hallazgo **nuevo de esta auditoría**, residuo directo de CR-01. Medido:

```
pg_default_acl (schema public, creadores postgres y supabase_admin):
  anon          = arwdDxtm   ← ALL, sobre TODA relación futura
  authenticated = arwdDxtm

BEGIN;
CREATE VIEW public.__audit_tmp_view AS SELECT id FROM public.businesses;
→ grants heredados: anon = DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
ROLLBACK;
```

Una vista **nueva** creada por `postgres` en `public` nace, hoy mismo, con `INSERT/UPDATE/DELETE`
para `anon` — que es exactamente el defecto de CR-01. La 072 revocó las seis existentes; no tocó los
default privileges. **La Phase 20 agrega superficie pública de lectura**: si crea una vista `public_*`
y alguien se olvida del `REVOKE ALL` + `GRANT SELECT`, CR-01 vuelve idéntica y en silencio.

Para tablas nuevas el paracaídas es la RLS. Para **vistas** DEFINER no hay ninguno.

**Cierre esperado (una de dos):**
- regla dura + plantilla en la skill `supabase-multitenant-rls`: toda vista `public_*` termina con
  `REVOKE ALL … FROM anon, authenticated; GRANT SELECT …`, y el `db reset` local se valida con la
  consulta de grants de la cabecera de la 072; **o**
- `ALTER DEFAULT PRIVILEGES … REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLES FROM anon` en una
  migración nueva. ⚠ **Auditar antes**: existe una policy de INSERT deliberadamente abierta al
  público (`landing_leads_public_insert`), así que una revocación a ciegas rompe la captación de
  leads del landing. `authenticated` **necesita** escritura (todo el dashboard escribe con la sesión
  del dueño): no tocarlo.

---

### 4.5 🟠 WR-05 — cero cobertura de aislamiento para la tabla y la vista nuevas

```
grep -c "time_block_services" test/isolation.test.ts  → 0
```

`test/isolation.test.ts` existe justamente para esto y usa anon-key en las aserciones. No se tocó.
Consecuencia concreta: **el cierre de CR-01 no tiene test de regresión**. Si alguien re-agrega un
`GRANT ALL` copiando el molde viejo, o borra un `.eq('business_id', …)` de cualquiera de las dos
queries, la suite entera sigue verde (45/45 hoy).

**Cierre esperado:** casos anon-key sobre `time_block_services` y `public_time_block_services`
(SELECT/INSERT/DELETE deben fallar o devolver vacío) + un caso de dos tenants donde el mapeo de B no
altera la respuesta de A.

---

### 4.6 🟠 WR-07 — el error nuevo es alcanzable en producción y no tiene copy

```
grep -rn "service_not_scheduled" app/**/*.tsx  → 0 coincidencias
```

El código de error existe en el server desde este deploy y **ningún cliente lo traduce**: el usuario
final ve el fallback genérico *"Error al confirmar. Intentá de nuevo."*. Se vuelve alcanzable apenas
exista **una** fila de mapeo (Phase 19) — y también lo dispara el fail-closed de §4.1, donde el
reintento es imposible por definición.

Se suma la divergencia de los días con horario ESPECIAL: el cliente arma la grilla reemplazando la
ventana de la franja por la de la excepción, mientras `startTimesNotOffered` calcula sobre las
franjas crudas ⇒ se pueden **ofrecer** horarios que el backstop **rechaza**. T-18-16 aceptó el sentido
contrario ("no se pueden ocultar"), no éste.

**Cierre esperado:** agregar la copy ya (no esperar a la Phase 20) y/o documentar la divergencia.

---

### 4.7 🟡 WR-01 — el read-path también descarta los errores de query, y sin log

`availability/route.ts:105` y `:155` desestructuran sólo `data`. Si la lectura falla (schema cache
viejo, permiso, `dow` NaN por un `date` malformado —el endpoint **no** tiene el guard de forma que sí
tiene el `create`—), la feature se apaga **sin un solo log** y el dueño ve la UI guardada mientras el
público sigue viendo todo.

Acá degradar es aceptable por diseño (fail-safe = comodín); lo que no es aceptable es hacerlo mudo.
**Cierre esperado:** desestructurar `error` y `console.error('[booking/availability] …')` antes del
fallback, igual que ya hace la query de `appointments` del mismo archivo.

---

### 4.8 🟡 WR-04 — la regla es ciega a `location_id`

Ninguna de las tres lecturas de `time_blocks` de la fase filtra por sede, y `BlockWindow` no la
transporta. En un negocio con dos sedes, una franja de la sede A que da "corte" **autoriza** un corte
en la sede B a esa hora, y `startTimesNotOffered` hace la resta sobre la unión de todas las sedes.

Impacto hoy, medido: **0 negocios con más de una sede** (`SELECT business_id, count(*) FROM locations
GROUP BY 1 HAVING count(*) > 1` → 0 filas), así que la regresión no está viva. Es el caveat que el
primer tenant multi-sede pisa el día 1 de la Phase 19.

**Cierre esperado:** propagar `location_id` al helper, **o** documentarlo como limitación conocida y
gatear la UI de la Phase 19 a negocios de una sola sede.

---

## 5. Riesgos aceptados

Los seis primeros vienen con la disposición `accept` de los planes (aceptados por el dueño al aprobar
la fase). Los cinco últimos los **propone esta auditoría** y necesitan un OK explícito.

| ID | Ref | Justificación | Aceptado por | Fecha |
|---|---|---|---|---|
| RA-01 | T-18-01 | La vista expone 3 uuid que la grilla pública ya revela; sin dato de cliente, precio ni ocupación. Molde idéntico a la 059 (T-10-02, ya aceptado). **Sólo lectura desde la 072** | Franco (disposición del plan 18-01) | 2026-08-25 |
| RA-02 | T-18-05 | Una franja huérfana (`business_id` nulo) no puede recibir mapeo ⇒ queda comodín para siempre = su comportamiento de hoy. Falla al lado seguro. Medido: 0 huérfanas | Franco (plan 18-01) | 2026-08-25 |
| RA-03 | T-18-10 | El helper puro no ve datos de cliente ni de ocupación | Franco (plan 18-02) | 2026-08-25 |
| RA-04 | T-18-16 | Los horarios especiales que EXTIENDEN la jornada viven en `schedule_exceptions` y no se pueden ocultar por esta vía. Coherente con la regla angosta del backstop | Franco (plan 18-03) | 2026-08-25 |
| RA-05 | T-18-21 | `book_slot_atomic` ejecutable por `anon` (medido: `prosecdef=t`, `EXECUTE` a anon): preexistente desde la migr. 041, fuera de este milestone, con todo abierto. ⚠ **Esta fase agranda la consecuencia**: el control nuevo vive en el core, así que el RPC invocado directo también saltea la agenda por servicio, además de la ventana de reserva, el gate de plan y el reCAPTCHA. Sube de prioridad para el milestone siguiente | Franco (plan 18-04) | 2026-08-25 |
| RA-06 | T-18-22 | El código `service_not_scheduled` revela lo mismo que la grilla ya revela | Franco (plan 18-04) | 2026-08-25 |
| RA-07 | R-02 | `anon` conserva `INSERT/UPDATE/DELETE/TRUNCATE` sobre la tabla base (y sobre todas las demás: es el default de Supabase). Hoy sólo la RLS lo frena — y **TRUNCATE no pasa por RLS**: medido, `SET LOCAL ROLE anon; TRUNCATE time_block_services` **funciona** dentro de una transacción revertida. No es alcanzable por PostgREST (ningún verbo HTTP mapea a TRUNCATE) ⇒ severidad baja. ⚠ El fix propuesto en el `18-REVIEW.md` para CR-01 **incluía** este `REVOKE` y la 072 **no lo hizo** | **PENDIENTE — propuesto por la auditoría** | — |
| RA-08 | WR-06 | `toMinutes` y la fórmula de la grilla quedaron duplicadas (3 y 6 copias). Riesgo de divergencia futura, no divergencia actual (medido: server y cliente coinciden en la grilla de hoy) | **PENDIENTE — propuesto** | — |
| RA-09 | IN-01 | `isServiceScheduled` sin consumidor en producción hasta la Phase 19 (dead code temporal, sin superficie) | **PENDIENTE — propuesto** | — |
| RA-10 | IN-02 | La contención mira sólo el minuto de INICIO: un servicio largo puede invadir la franja siguiente que no lo da. `startTimesOf` nunca ofrece ese inicio, así que OFRECE y ACEPTA divergen en la cola. Documentar en la cabecera del helper | **PENDIENTE — propuesto** | — |
| RA-11 | IN-03 | `notOffered` se calcula antes del early-return de `any_professional_unsupported`: una lectura descartada en una superficie anónima. Costo, no riesgo | **PENDIENTE — propuesto** | — |

---

## 6. Threat Flags de los SUMMARY

`18-04-SUMMARY.md` declara **"Ninguno"**. Los otros tres SUMMARY no traen la sección.

**Superficie nueva detectada por esta auditoría que ningún flag declaró** (no bloqueante, informativa):

| Superficie | ¿Mapeada a una amenaza? |
|---|---|
| Código de error público nuevo `service_not_scheduled` en `POST /api/booking/create` | Sí — T-18-22 (info disclosure). Pero su **falta de copy** no estaba mapeada → WR-07 |
| Código de error público nuevo `bad_request` por forma de `date`/`time` (CR-02) | **No mapeado**. Es un endurecimiento, no una apertura: rechaza antes lo que antes pasaba. Sin amenaza asociada |
| Dos queries nuevas por request pública cuando el flag está encendido | Sí — IN-03 (costo) |
| Migración **072**, que cambia privilegios de **6 vistas** (4 de ellas ya en producción y ajenas a esta fase) | **No mapeado en ningún `<threat_model>`** — nació del review. Cubierto acá como CR-01. Ojo: es un cambio de radio mayor que la fase, aplicado a prod fuera de su ciclo |

---

## 7. Pendientes operativos (no son código)

1. **Antes de deployar el código de la Phase 18**: la verificación del §4.1 contra producción. Sin
   eso el deploy tiene una ventana en la que el booking público entero devuelve 400.
2. La 071 y la 072 se declaran aplicadas a producción; los SUMMARY y el `18-VERIFICATION.md` fueron
   escritos cuando prod estaba en la 070. **Reconciliar**: dejar registrado quién las aplicó, cuándo,
   y si se ejecutó `NOTIFY pgrst, 'reload schema';`.
3. `supabase/schema.sql` ya refleja los `GRANT SELECT` de la 072 (verificado, líneas 4101-4139).

---

## 8. Audit Trail

| Fecha | Total | Cerradas | Aceptadas | Abiertas | Ejecutado por |
|---|---|---|---|---|---|
| 2026-08-25 | 37 | 24 | 5 (+6 ya aceptadas por plan, contadas en cerradas) | 8 | Claude (gsd-security-auditor) |
| 2026-08-25 (remediación) | 37 | 30 | 7 | **0** | Claude (orquestador), alcance decidido por Franco |

Método: verificación **por instalación** contra el Postgres local (contenedor
`supabase_db_forjo-app`, PG17, migr. 071/072 aplicadas) y **por HTTP real** contra `npm run dev`.
Todo ataque corrió en transacción con `ROLLBACK` y con conteo posterior; los datos de prueba creados
por la auditoría (`__audit_sec18*`) se borraron y los grants tocados se restauraron (verificado:
`clients` = 2, `appointments` = 0, `service_role` con sus privilegios originales). **Ningún archivo
de implementación fue modificado.**


### Remediación 2026-08-25 — commit `db4eb5e` (migr. 073 + 3 archivos de código + 2 de tests)

Alcance decidido por el dueño: **cerrar con código** R-01, RA-07, WR-01, WR-02, WR-03 y WR-05;
**aceptar** WR-04 y WR-07. Cada cierre se verificó por instalación o con mordida (control negativo),
nunca por lectura del diff.

| ID | Cómo se cerró | Evidencia medida |
|---|---|---|
| **T-18-06** | **Cierre por la vía (a)**: verificación contra PRODUCCIÓN antes de deployar el código. Además WR-01 ahora deja log cuando la lectura falla, así que el síntoma deja de ser mudo | `GET https://tpvbjwqzskzkevepcwyb.supabase.co/rest/v1/time_block_services?select=business_id&limit=1` con la anon key → **HTTP 200 `[]`** (no `PGRST205`) ⇒ PostgREST en prod YA tiene la tabla en su cache. Ídem `public_time_block_services` → **200 `[]`**. Y el código **no estaba deployado** (18 commits sin pushear), o sea que la ventana de riesgo nunca se abrió: la migración entró primero, que es el orden correcto |
| **R-01** | Migr. **073**: `ALTER DEFAULT PRIVILEGES FOR ROLE postgres … REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLES FROM anon`. Para `supabase_admin` se intenta dentro de un bloque que degrada a `NOTICE` (`postgres` no es miembro ⇒ 42501; el creador efectivo del proyecto es `postgres`: CLI + editor SQL) | `pg_default_acl` pasó de `anon=arwdDxtm` a `anon=rxtm`. Control REAL: `CREATE VIEW` en transacción → grants heredados por `anon` = **`REFERENCES,SELECT,TRIGGER`** (antes: `DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE`). La Phase 20 ya no puede reabrir CR-01 por olvido |
| **RA-07 → cerrado** | Migr. 073: `REVOKE TRUNCATE … FROM anon, authenticated`, sobre lo existente y por default. Se decidió **cerrarlo en vez de aceptarlo**: costaba cero y es la única escritura que la RLS no frena | `SET LOCAL ROLE anon; TRUNCATE public.time_block_services` → **`ERROR: permission denied for table`** (antes funcionaba) |
| **WR-02** | Migr. 073: `UNIQUE (id, business_id)` en `services` y `time_blocks` + FK **compuestas** `tbs_block_same_tenant` / `tbs_service_same_tenant`. Declarativo a propósito: rechaza la BASE, no el predicado de una policy que alguien tenga que recordar | Como `postgres`, o sea salteando la RLS por completo: variante bloque ajeno → `violates foreign key constraint "tbs_block_same_tenant"`; variante servicio ajeno → `"tbs_service_same_tenant"`. **Control positivo**: la fila del mismo tenant sigue entrando |
| **WR-03** | Dos medidas en `app/api/booking/create/route.ts`: (1) el insert de `clients` se bajó hasta después de todos los rechazos que se pueden decidir sin él —forma de date/time, plan, ventana de reserva, reCAPTCHA y la derivación de canchas con su `invalid_service`—; (2) lo que rechaza el core se limpia, acotado a `client.id` + `business_id`. NO se barren "clientes sin turnos" en general: el alta manual del dueño los crea de forma legítima | Casos **10 y 11** de `booking-service-window-backstop`. El 10 hace **3** rechazos seguidos (el bug escalaba linealmente) y asierta **0** filas. El 11 es el control positivo: el turno que SÍ entra conserva su cliente — sin él, "borrar siempre" pasaría el 10. Mordida: desactivando la limpieza cae **sólo** el 10 |
| **WR-01** | `availability/route.ts` desestructura `error` en sus dos queries y loguea antes del fallback. **La degradación se mantiene a propósito**: acá el fail-safe correcto es el opuesto al del `create` —ofrecer de más, con el backstop como autoridad— antes que apagarle la agenda a todos | Es justamente el síntoma de la 071 aplicada sin `NOTIFY pgrst`; sin log era indistinguible de "el negocio todavía no configuró nada" |
| **WR-05** | **7 casos nuevos** en `test/isolation.test.ts` —el archivo que existía para esto y no tocaba la tabla nueva, razón por la cual CR-01 pasó con todo en verde—: escritura y borrado anónimo por la vista, escritura anónima en la tabla base, lectura pública que SÍ debe funcionar (D-05), cross-READ, cross-WRITE, WR-02 y el happy path | 21 passed. **Mordida**: re-abriendo el `GRANT ALL` en la vista y soltando las dos FK compuestas caen **exactamente** los 3 de regresión (CR-01 escritura, CR-01 borrado, WR-02) |

**Gate tras la remediación:** `tsc --noEmit` 0 · `npm run build` 0 · suite completa
**77 archivos / 1013 passed** (`--no-file-parallelism`; en paralelo hay flakiness PRE-EXISTENTE de
infra contra la DB local, no regresión).

⚠ **La migr. 073 NO está aplicada a producción.** Las 071 y 072 sí (a mano, 2026-08-25). Aplicar la
073 junto con el deploy del código.

⚠ `supabase/schema.sql` se actualizó de forma **quirúrgica**, no regenerando: el dump local completo
borraría `pg_net` (está en prod y no en las migraciones locales). Queda anotado el **drift
preexistente** — `app_settings`, `landing_content` y `landing_leads` nunca entraron al `schema.sql`
commiteado. No es de esta fase; merece una pasada dedicada.

---

## 9. Sign-Off

- [x] Todas las amenazas tienen disposición (mitigate / accept / transfer)
- [x] Riesgos aceptados registrados en §5 y acá abajo
- [x] `threats_open: 0` — las 8 que quedaban se resolvieron: **6 cerradas con código**
  (T-18-06, R-01, WR-01, WR-02, WR-03, WR-05) y **2 aceptadas** (WR-04, WR-07)
- [x] Riesgos aceptados propuestos por la auditoría, resueltos por el dueño: **RA-07 se cerró con
  código** en vez de aceptarse (costaba cero); **RA-08, RA-09, RA-10 y RA-11 se aceptan**
- [x] `status: verified` en el frontmatter

### Aceptaciones explícitas de esta ronda

| ID | Justificación | Aceptado por | Fecha |
|---|---|---|---|
| **WR-04** | La regla es ciega a `location_id`: en un negocio multi-sede, una franja de la sede A que da "corte" autoriza un corte en la sede B. **Medido: 0 negocios con más de una sede**, así que la regresión no está viva. Es el caveat que pisa el primer tenant multi-sede el día 1 de la Phase 19 — que es donde corresponde propagar `location_id` al helper, junto con la UI que lo vuelve configurable | Franco | 2026-08-25 |
| **WR-07** | `service_not_scheduled` no tiene copy en el cliente (cae en "Error al confirmar. Intentá de nuevo."). Sólo se vuelve alcanzable cuando exista la primera fila de mapeo, y eso requiere la UI de la **Phase 19**. La copy ya está asignada a **AGENDA-07 (Phase 20)**. Se acepta con la condición de que la Phase 19 no se dé por cerrada sin ella, porque ahí sí queda alcanzable | Franco | 2026-08-25 |
| **RA-08** | `toMinutes` y la fórmula de la grilla duplicadas (3 y 6 copias). Riesgo de divergencia futura, no divergencia actual (medido: server y cliente coinciden hoy) | Franco | 2026-08-25 |
| **RA-09** | `isServiceScheduled` sin consumidor hasta la Phase 19 (dead code temporal, sin superficie) | Franco | 2026-08-25 |
| **RA-10** | La contención mira sólo el minuto de INICIO: un servicio largo puede invadir la franja siguiente que no lo da. `startTimesOf` nunca ofrece ese inicio, así que OFRECE y ACEPTA divergen sólo en la cola | Franco | 2026-08-25 |
| **RA-11** | `notOffered` se calcula antes del early-return de `any_professional_unsupported`: una lectura descartada. Costo, no riesgo | Franco | 2026-08-25 |

**Aprobación:** ✅ **SECURED.** `threats_open: 0`. Pendiente operativo, no de código: aplicar la
**migr. 073** a producción junto con el deploy (las 071 y 072 ya están).
