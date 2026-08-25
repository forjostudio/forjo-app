---
phase: 18-el-modelo-y-la-disponibilidad
reviewed: 2026-08-25T00:00:00Z
depth: standard
files_reviewed: 11
files_reviewed_list:
  - app/api/booking/availability/route.ts
  - app/api/booking/create/route.ts
  - lib/booking-core.ts
  - lib/time-block-services.ts
  - lib/types.ts
  - supabase/migrations/071_time_block_services.sql
  - supabase/schema.sql
  - test/availability-service-window.test.ts
  - test/booking-service-window-backstop.test.ts
  - test/helpers/booking-fixtures.ts
  - test/time-block-services.test.ts
findings:
  critical: 2
  warning: 7
  info: 3
  total: 12
status: issues_found
---

# Phase 18: Code Review Report

**Reviewed:** 2026-08-25
**Depth:** standard
**Files Reviewed:** 11
**Status:** issues_found

## Summary

La regla del comodín está bien encapsulada (`lib/time-block-services.ts` es puro, testeado y NO se
reimplementa en ninguno de los dos consumidores) y las tres salidas del endpoint de disponibilidad
concatenan `notOffered` sin mutar ni cambiar el contrato `{ ok, busy, full }`. La resta de conjuntos
es correcta y el control negativo del solape (caso 4) está cubierto. Hasta ahí, lo que la fase dice
que hace, lo hace.

El problema no está en la regla: está en las **dos puertas que la protegen**, y las dos están
abiertas.

1. La vista `public_time_block_services` es **escribible por `anon`**. Verificado ejecutando el
   ataque contra el Postgres LOCAL (PG17, migr. 071 aplicada): un `POST` sin autenticar a
   `/rest/v1/public_time_block_services` inserta filas en `time_block_services` de CUALQUIER negocio,
   y un `DELETE` las borra. La RLS de la tabla base rechaza el mismo insert correctamente — la vista
   la esquiva. Con eso, un anónimo saca de modo comodín cualquier franja de cualquier tenant y le
   apaga la agenda entera.
2. El backstop del `create` **falla ABIERTO** ante un `date`/`time` mal formado: ni el route handler
   ni el core validan formato, el `dow` sale `NaN`, la query a `time_blocks` devuelve error 22P02, el
   error se descarta y `dayBlocks` queda `[]` ⇒ `isServiceAllowedAt` acepta todo. `service_not_scheduled`
   se saltea con `date: "2031-3-3"` o con `time: "10:00 AM"` — los dos literales los acepta Postgres
   sin chistar (verificado también contra el PG local), así que el turno forjado se materializa con la
   fecha/hora correcta. El control anti-tampering que la fase existe para agregar no resiste el ataque
   que dice defender.

El resto son gaps de robustez y cobertura: errores de query silenciados también en el read-path,
la RLS sin coherencia de tenant entre las tres FK, filas `clients` huérfanas por el nuevo rechazo,
la regla ciega a `location_id`, y cero test de aislamiento cross-tenant para la tabla nueva — que es
exactamente el test que habría detectado CR-01.

## Critical Issues

### CR-01: `public_time_block_services` deja que `anon` ESCRIBA la puente de cualquier negocio (bypass total de RLS)

**File:** `supabase/migrations/071_time_block_services.sql:145-160` (vista + `GRANT ALL`), `supabase/schema.sql:1266-1273`, `supabase/schema.sql:4137-4139`

**Issue:**
La vista es `OWNER TO postgres`, **sin** `security_invoker`, y es una vista SIMPLE sobre una sola
tabla con las 3 columnas como referencias directas ⇒ Postgres la considera **auto-updatable**. El
`GRANT ALL ... TO anon` no otorga solo `SELECT`: otorga `INSERT`, `UPDATE` y `DELETE`, y esas
operaciones se ejecutan con los privilegios del owner (`postgres`), que es el dueño de la tabla base
y por lo tanto **bypassa la RLS** (no hay `FORCE ROW LEVEL SECURITY`). El comentario de la migración
("el anon solo lee de hecho, la vista no tiene otra operación posible") es factualmente falso.

Verificado contra el Postgres LOCAL con la anon key, sin sesión:

```
POST /rest/v1/public_time_block_services  {business_id, time_block_id, service_id}
  → 201 [{"business_id":"…b1","time_block_id":"ef600e40…","service_id":"…d1"}]   ← ESCRIBIÓ
POST /rest/v1/time_block_services         (misma fila, tabla base, control)
  → 42501 "new row violates row-level security policy"                           ← RLS OK
DELETE /rest/v1/public_time_block_services?time_block_id=eq.ef600e40…
  → 200 [{…}]                                                                    ← BORRÓ
```

Todos los ids que hace falta conocer son **públicos**: `time_blocks` tiene `public read` con
`USING (true)` (schema.sql:2351) y `public_services` expone `id` + `business_id`. O sea que el ataque
no necesita ni adivinar.

Impacto sobre el negocio víctima, sin autenticación:

- **INSERT** de una fila cualquiera sobre una franja de la víctima ⇒ esa franja deja de ser comodín ⇒
  `startTimesNotOffered` oculta TODOS los horarios de esa franja para el resto de los servicios y el
  backstop del `create` los rechaza con `service_not_scheduled`. Una fila por franja apaga la agenda
  pública completa del tenant. Y como el cliente público no mapea ese código (`booking-client.tsx:406`),
  el usuario final ve "Error al confirmar. Intentá de nuevo." — un reintento que nunca puede funcionar.
- **DELETE** borra la configuración real que el dueño cargue en la Phase 19.
- **SELECT** sin filtro devuelve el mapeo de TODOS los tenants (bajo, pero es cross-tenant por default;
  la migración asume que el aislamiento lo pone el `.eq('business_id', …)` del caller — `anon` no está
  obligado a ponerlo).

⚠ El defecto es SISTÉMICO, no exclusivo de esta fase: `public_professional_services` (migr. 059)
tiene el mismo `GRANT ALL` y también acepta INSERT/DELETE de `anon` (verificado igual, en el mismo
PG local). Pero la fase lo replicó en una superficie de radio mayor, así que se arreglan las dos.

**Fix:**

```sql
-- Migración 072 (nueva). Aplicar A MANO en prod + NOTIFY pgrst, 'reload schema';
REVOKE ALL ON TABLE "public"."public_time_block_services" FROM "anon", "authenticated";
GRANT SELECT ON TABLE "public"."public_time_block_services" TO "anon", "authenticated";

-- Mismo tratamiento para la hermana con el mismo defecto (migr. 059):
REVOKE ALL ON TABLE "public"."public_professional_services" FROM "anon", "authenticated";
GRANT SELECT ON TABLE "public"."public_professional_services" TO "anon", "authenticated";

-- Defensa en profundidad sobre la tabla base (los default privileges de Supabase le dieron
-- GRANT ALL a anon — hoy solo la RLS lo frena; ver schema.sql:3957):
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE "public"."time_block_services" FROM "anon";
```

Y corregir el comentario de la migración: una vista `public_*` simple SÍ es escribible; el patrón del
repo tiene que ser `GRANT SELECT`, nunca `GRANT ALL`. Auditar el resto de las `public_*`
(`public_businesses`, `public_services`, `public_professionals`, `public_canchas`) con el mismo
criterio antes de cerrar la fase.

---

### CR-02: el backstop `service_not_scheduled` se saltea con un `date`/`time` mal formado (falla ABIERTO)

**File:** `lib/booking-core.ts:218-243`, `app/api/booking/create/route.ts:38-39`

**Issue:**
Dos defectos que se suman y se anulan mutuamente el control:

1. **Sin validación de formato.** El route handler solo comprueba `typeof body.date === 'string'` y
   `typeof body.time === 'string'` (`route.ts:38-39`); nunca `^\d{4}-\d{2}-\d{2}$` / `^\d{2}:\d{2}`.
   `isDateOutOfWindow` usa `parseISO` y ante fecha inválida devuelve `false` (no bloquea).
2. **Errores de query descartados.** `const { data: dayBlocks } = await supabase…` y
   `const { data: bridgeRows } = await supabase…` no leen `error`, y `(dayBlocks || [])` convierte
   cualquier fallo en "no hay franjas" ⇒ `isServiceAllowedAt` devuelve `true` por la rama "sin franja
   contenedora".

Payload A — `date: "2031-3-3"` (en vez de `"2031-03-03"`):

```
new Date('2031-3-3T00:00:00Z')      → Invalid Date  → getUTCDay() = NaN     (verificado en node)
.eq('day_of_week', NaN)             → 22P02 "invalid input syntax for type integer: NaN"
                                                     (verificado contra el PG local)
error descartado → dayBlocks = []   → isServiceAllowedAt(...) = true        → ACEPTA
'2031-3-3'::date                    → válido en Postgres                    (verificado)
p_date del RPC es `date` → el turno se materializa en la fecha correcta.
```

Payload B — `time: "10:00 AM"`:

```
timeToMinutes('10:00 AM') = 600 + Number('00 AM') = NaN
→ toda comparación con NaN da false → containing = [] → ACEPTA
'10:00 AM'::time → válido en Postgres (verificado) → el turno queda a las 10:00.
```

O sea: el POST forjado que el test `booking-service-window-backstop.test.ts` caso 1 congela como
rechazado (400 `service_not_scheduled`) se convierte en 200 cambiando dos caracteres del body. El
control que la fase agrega para el caller "no confiable" no resiste al caller no confiable. Payload B
además anula de paso el re-check JS de solapamiento del core (la autoridad sigue siendo el RPC, así
que ahí no hay doble-booking, pero el rechazo temprano desaparece).

Nota: la misma `dow` NaN existe en `availability/route.ts:104` (read-path, solo degrada) — el bug
GRAVE es el del write-path, porque ahí el silencio es un bypass.

**Fix:**

```ts
// app/api/booking/create/route.ts — junto al resto del narrowing defensivo del body
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^\d{2}:\d{2}(:\d{2})?$/
if (!DATE_RE.test(date) || !TIME_RE.test(time)) {
  return Response.json({ ok: false, error: 'bad_request' }, { status: 400 })
}
```

```ts
// lib/booking-core.ts — el backstop falla CERRADO ante un error de query
if (enforceServiceWindow) {
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay()
  const startMinutes = timeToMinutes(time)
  if (Number.isNaN(dow) || Number.isNaN(startMinutes)) {
    return { ok: false, error: 'invalid_service', status: 400 } // entrada degenerada: no se acepta
  }
  const { data: dayBlocks, error: blocksErr } = await supabase
    .from('time_blocks').select('id, start_time, end_time')
    .eq('business_id', business.id).eq('day_of_week', dow)
  const { data: bridgeRows, error: bridgeErr } = await supabase
    .from('time_block_services').select('business_id, time_block_id, service_id')
    .eq('business_id', business.id)
  if (blocksErr || bridgeErr) {
    // Un control de seguridad que no pudo evaluarse NO autoriza. Mismo criterio fail-closed
    // que verifyRecaptcha. (Ojo: si PostgREST todavía no recargó el schema tras la 071, esto
    // corta el booking — coordinar el NOTIFY pgrst con el deploy, como dice la migración.)
    console.error('[booking-core] service-window check failed:', blocksErr?.message || bridgeErr?.message)
    return { ok: false, error: 'insert_failed', status: 500 }
  }
  ...
}
```

Y agregar los dos payloads al test del backstop (caso 6: `date: '2031-3-3'` ⇒ NO se crea; caso 7:
`time: '10:00 AM'` ⇒ NO se crea).

## Warnings

### WR-01: el read-path también descarta los errores de query y apaga la feature en silencio

**File:** `app/api/booking/availability/route.ts:105-109`, `app/api/booking/availability/route.ts:155-158`

**Issue:** ni `capBlocks` ni `tbsRaw` leen `error`. Si PostgREST todavía no recargó el schema cache
tras aplicar la 071 en prod —escenario que la propia migración documenta como obligatorio
(`NOTIFY pgrst, 'reload schema'`)—, `time_block_services` no existe para PostgREST, `tbsRaw` viene
`null`, se interpreta como "puente vacía = todo comodín" y la feature queda apagada **sin un solo log**.
El dueño configura el mapeo en la Phase 19, ve la UI guardada y el público sigue viendo todo. A
diferencia del create (CR-02, ahí es un bypass), acá degradar es aceptable — lo que no es aceptable es
hacerlo mudo.

**Fix:** destructurar `error` en las dos queries y `console.error('[booking/availability] …', error.message)`
antes de caer al fallback, igual que ya hace la query de `appointments` (línea 89-92).

---

### WR-02: la RLS no exige que `business_id`, `time_block_id` y `service_id` sean del MISMO negocio

**File:** `supabase/migrations/071_time_block_services.sql:96-118`

**Issue:** las 4 policies validan únicamente `business_id IN (SELECT … WHERE owner_id = auth.uid())`.
Las FK garantizan existencia, no pertenencia. Un dueño autenticado (o cualquiera vía CR-01) puede
insertar `(mi_business_id, time_block_id_ajeno, mi_service_id)` o
`(mi_business_id, mi_time_block_id, service_id_ajeno)` y la fila se acepta. Hoy el daño está acotado
porque los dos consumidores filtran por `business_id` y cruzan por `time_block_id` propio, pero la
tabla queda con filas cross-tenant válidas que la Phase 19 va a leer y renderizar, y la invariante
"toda fila de la puente pertenece a un solo tenant" no está garantizada en ningún lado. La skill
`supabase-multitenant-rls` pide exactamente lo contrario.

**Fix:** UNIQUE compuesto en los padres + FK compuestas, que es la forma declarativa:

```sql
ALTER TABLE "public"."services"     ADD CONSTRAINT services_id_business_uq     UNIQUE (id, business_id);
ALTER TABLE "public"."time_blocks"  ADD CONSTRAINT time_blocks_id_business_uq  UNIQUE (id, business_id);
ALTER TABLE "public"."time_block_services"
  ADD CONSTRAINT tbs_block_same_tenant   FOREIGN KEY (time_block_id, business_id)
      REFERENCES "public"."time_blocks"(id, business_id) ON DELETE CASCADE,
  ADD CONSTRAINT tbs_service_same_tenant FOREIGN KEY (service_id, business_id)
      REFERENCES "public"."services"(id, business_id) ON DELETE CASCADE;
```

(`time_blocks.business_id` es NULLABLE: la FK compuesta con nulo no matchea, lo que reafirma la
decisión ya documentada de que una franja huérfana nunca recibe mapeo. Verificar en el `db reset`
local antes de prod.)

---

### WR-03: el rechazo `service_not_scheduled` deja filas `clients` huérfanas (Pitfall 3, ya conocido en este repo)

**File:** `app/api/booking/create/route.ts:110-116` + `app/api/booking/create/route.ts:158-177`

**Issue:** el público inserta SIEMPRE la fila en `clients` **antes** de llamar al core, y el nuevo
rechazo vive dentro del core. Cada POST forjado que termina en `service_not_scheduled` deja un cliente
basura en la lista del dueño. El propio archivo documenta el problema para el backstop de ventana
(línea 84-92: *"Corre TEMPRANO … para que una fecha fuera de ventana no deje filas `clients`
huérfanas (Pitfall 3)"*) y el control nuevo lo reintroduce. Un anónimo puede inflar la tabla `clients`
de cualquier tenant a razón de un request por fila, sin reCAPTCHA cuando el negocio pide seña.

**Fix:** la regla no depende del cliente ni del insert; moverla a un helper compartido y evaluarla en
el route handler ANTES del `insert` en `clients` (con el `serviceId` ya resuelto — resolver el service
por `business_id` una vez y pasarlo), o bien borrar el cliente recién creado cuando `result.error` es
un 400 de validación. La primera opción es la que ya eligió el repo para la ventana de reserva.

---

### WR-04: la regla es ciega a `location_id` — en un negocio multi-sede autoriza/oculta cruzado

**File:** `lib/time-block-services.ts:133-146`, `app/api/booking/availability/route.ts:105-109`, `lib/booking-core.ts:224-229`

**Issue:** `time_blocks` tiene `location_id` (schema.sql:1333) y ninguna de las dos queries lo filtra
ni lo pasa al helper. Consecuencia en un tenant con dos sedes: si la franja 09:00-12:00 de la sede A
declara "corte" y la de la sede B declara "color", `isServiceAllowedAt('corte', 10:00, …)` acepta la
reserva de corte **en la sede B**, porque le alcanza con que UNA franja contenedora —la de la otra
sede— dé el servicio. La misma ceguera afecta a `startTimesNotOffered`, que hace la resta de conjuntos
sobre la unión de las franjas de todas las sedes. La fase documenta con detalle el caveat de
`schedule_exceptions` pero no menciona este, que es el que un negocio con consultorios va a pisar el
día 1 de la Phase 19.

**Fix:** o bien acotar el alcance de forma explícita (documentarlo como limitación conocida y
gatear la UI de la Phase 19 a negocios de una sola sede), o bien propagar la sede: agregar
`location_id` a `BlockWindow` y filtrar las franjas contenedoras por la sede resuelta antes de llamar
al helper (el `create` ya resuelve `validLocationId`; el endpoint de disponibilidad hoy no recibe
`locationId` y habría que agregarlo al contrato).

---

### WR-05: cero cobertura de aislamiento cross-tenant para la tabla y la vista nuevas

**File:** `test/time-block-services.test.ts:58-68`, `test/availability-service-window.test.ts`, `test/booking-service-window-backstop.test.ts`

**Issue:** el único test que menciona el tenant es el del contrato D-16, y lo que congela es que el
helper **ignora** `business_id`. No hay ni un caso que verifique lo que de verdad sostiene el
aislamiento: (a) que una fila de la puente del negocio B no cambie la disponibilidad ni el `create` del
negocio A (si alguien borra el `.eq('business_id', …)` de cualquiera de las dos queries, los 12 tests
nuevos siguen verdes); (b) que `anon` no pueda leer ni escribir `time_block_services` ni
`public_time_block_services`. `test/isolation.test.ts` —que existe justamente para eso y usa anon-key
en las aserciones— no se tocó. Ese test es el que habría detectado CR-01 antes del review.

**Fix:** agregar a `test/isolation.test.ts` el caso anon-key sobre la tabla y la vista nuevas
(SELECT/INSERT/DELETE deben fallar) y, en `availability-service-window.test.ts`, un caso con dos
tenants sembrados donde el mapeo de B no altera la respuesta de A.

---

### WR-06: la fórmula de la grilla y `toMinutes` se re-duplicaron (ahora hay 6 y 3 copias)

**File:** `lib/time-block-services.ts:51-72`, `app/api/booking/availability/route.ts:111-114,288-293,406-416,567-580`, `app/[slug]/booking-client.tsx:311-315`

**Issue:** la fase se apoya —con razón— en "la regla del comodín vive en un solo lugar", pero para
lograrlo copió otra vez la enumeración `for (t = open; t + dur <= close; t += dur)` y otra vez la
conversión `'HH:MM[:SS]' → minutos`. El propio comentario del helper explica el riesgo: si la fórmula
diverge, "la resta de conjuntos de `startTimesNotOffered` dejaría residuos fantasma" — es decir,
horarios ocultados o no ocultados sin explicación. Un módulo puro es el lugar natural para las dos.

**Fix:** exportar `toMinutes` y `startTimesOf` desde `lib/time-block-services.ts` (o desde un
`lib/schedule-grid.ts` compartido) y consumirlas desde las 4 ramas del endpoint y desde el cliente
público, borrando los `toMin`/`minToHHMM` locales.

---

### WR-07: en días con horario ESPECIAL la disponibilidad y el backstop pueden discrepar y el cliente no tiene copy

**File:** `app/api/booking/availability/route.ts:143-147`, `app/[slug]/booking-client.tsx:241-252`, `app/[slug]/booking-client.tsx:395-406`

**Issue:** el cliente arma la grilla del día **reemplazando** la ventana de la franja por la de la
excepción (`booking-client.tsx:246-249`), mientras `startTimesNotOffered` la calcula sobre las franjas
CRUDAS de `time_blocks`. Si la ventana de la excepción no arranca alineada con la de la franja (p. ej.
excepción 09:15-13:00 sobre una franja 09:00-13:00 con servicios de 30'), los horarios ocultados
(09:00, 09:30, …) no intersectan la grilla que el cliente muestra (09:15, 09:45, …) ⇒ se **ofrecen**
horarios que el backstop **rechaza** con `service_not_scheduled`. Y ese código no está mapeado en el
cliente (`booking-client.tsx:406`), así que el usuario recibe "Error al confirmar. Intentá de nuevo."
— un reintento imposible. La fase documenta el caveat de las excepciones solo en el sentido "no se
pueden ocultar"; este sentido (se ofrece y se rechaza) no está cubierto.

**Fix:** mínimo, agregar YA la copy del código nuevo en `booking-client.tsx`
(`service_not_scheduled` → "Ese servicio no se atiende en ese horario. Elegí otro."), sin esperar a la
Phase 20: el error es alcanzable en producción apenas exista una fila de mapeo. Idealmente, que
`notOffered` se calcule sobre la misma ventana efectiva que ve el cliente (aplicar
`schedule_exceptions` server-side) o dejar registrada la divergencia como caveat explícito.

## Info

### IN-01: `isServiceScheduled` no tiene consumidor en producción

**File:** `lib/time-block-services.ts:111-117`

**Issue:** exportada y testeada, pero solo la usan los tests; su consumidor real (el aviso D-06) es de
la Phase 19. Es dead code hasta entonces.
**Fix:** aceptable si la Phase 19 la consume en el próximo ciclo; si se corriera de milestone, borrarla
o marcarla explícitamente como API pendiente.

---

### IN-02: la regla mira solo el minuto de INICIO — un turno puede invadir una franja que no lo da

**File:** `lib/time-block-services.ts:133-146`

**Issue:** un servicio de 90' que arranca a las 11:30 dentro de la franja "corte 09:00-12:00" se acepta
y se extiende hasta las 13:00 dentro de la franja "color 12:00-18:00". `startTimesOf` nunca ofrece ese
inicio (exige `t + dur <= close`), así que OFRECE y ACEPTA divergen en la cola. La contención por
inicio está documentada como decisión, pero esta consecuencia no.
**Fix:** documentarla en la cabecera del helper, o exigir `startMinutes + duration <= close` en las
franjas contenedoras cuando se decida cerrarla (requiere pasarle la duración a `isServiceAllowedAt`).

---

### IN-03: `notOffered` se calcula antes del early-return de `any_professional_unsupported`

**File:** `app/api/booking/availability/route.ts:148-165` vs `app/api/booking/availability/route.ts:199-201`

**Issue:** la lectura de la puente ocurre siempre que haya `serviceId`, incluso en requests que
inmediatamente después salen con 400 (`any=1` + cupo > 1). Trabajo descartado en una superficie
anónima.
**Fix:** mover el bloque de `notOffered` debajo del gate de `any_professional_unsupported`, o gatearlo
con la misma condición.

---

_Reviewed: 2026-08-25_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
