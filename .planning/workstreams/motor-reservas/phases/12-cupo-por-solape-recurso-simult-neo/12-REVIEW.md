---
phase: 12-cupo-por-solape-recurso-simult-neo
reviewed: 2026-07-29T00:00:00Z
depth: standard
files_reviewed: 14
files_reviewed_list:
  - supabase/migrations/062_service_capacity_mode_overlap.sql
  - supabase/schema.sql
  - lib/booking-core.ts
  - lib/types.ts
  - app/api/booking/availability/route.ts
  - app/[slug]/booking-client.tsx
  - app/(dashboard)/settings/settings-client.tsx
  - app/(dashboard)/agenda/agenda-client.tsx
  - app/(dashboard)/agenda/page.tsx
  - test/concurrency.test.ts
  - test/helpers/booking-fixtures.ts
  - test/canchas-provision.test.ts
  - test/landing-derive.test.ts
  - test/staff-services.test.ts
findings:
  critical: 4
  warning: 8
  info: 3
  total: 15
status: issues_found
---

# Phase 12: Code Review Report

**Reviewed:** 2026-07-29
**Depth:** standard
**Files Reviewed:** 14
**Status:** issues_found

## Summary

La rama `group_class` sí quedó byte-idéntica (verificado línea a línea contra 058 en
`062:341-372` y en `schema.sql:283-312`): el `DEFAULT 'group_class'` cubre todas las filas
existentes, no hay backfill, y el camino histórico (incluidas canchas y abonos) no cambia.
El aislamiento por tenant del RPC está bien: el `SELECT` de config (`062:173-177`) y el count
por solape (`062:309-316`) filtran por `business_id` explícito, y `public_services` expone
`capacity_mode` pero NO `capacity`.

Lo que NO está bien es el **modelo de exclusión del nuevo modo**. El gate simultáneo introduce
tres agujeros acumulativos en el anti-doble-booking que v0.9/v0.12 endurecieron:

1. cuenta holds VENCIDOS (falso `slot_full`),
2. un turno simultáneo con cupo > 1 nace `is_group = true` → sale del EXCLUDE 013, y a la vez el
   gate JS se desactiva y el gate SQL solo mira el MISMO `service_id` ⇒ queda **sin ninguna capa**
   que impida montarlo encima de un turno de OTRO servicio en la misma agenda,
3. el lock re-granularizado deja de serializar contra las reservas grupales/individuales del mismo
   instante, rompiendo la garantía §GA1 que 058 había introducido a propósito.

Además el read-path (`availability`) de la rama simultánea ignora el profesional, la ocupación real
del bucket y el bloqueo por espacio compartido, así que muestra libre lo que después falla — o, peor,
lo que después se reserva mal.

## Critical Issues

### CR-01: El gate por solape cuenta holds VENCIDOS → `slot_full` falso y divergencia con availability

**File:** `supabase/migrations/062_service_capacity_mode_overlap.sql:309-322` (espejado en `supabase/schema.sql:253-266`)

**Issue:** El count del modo simultáneo filtra por `status IN ('confirmed','pending_payment')` pero
NO descarta los `pending_payment` cuya seña ya venció:

```sql
AND a.status IN ('confirmed', 'pending_payment')
AND tsrange(...) && tsrange(...)
```

El comentario de la rama grupal justifica esa ausencia con "los holds vencidos ya los liberó el core
ANTES del RPC", pero eso **solo es cierto para la rama grupal**: `booking-core.ts:235-246` libera
holds de `sameBucket`, es decir del bucket `proId ?? SENTINEL` de ESTA reserva. El carril simultáneo
cuenta por `service_id` **a través de TODOS los buckets** (`062:311-312`), así que un hold vencido de
otro profesional (o del bucket sentinela) sigue restando cupo hasta que corra el cron diario.

Consecuencias:
- un cliente ve el horario libre (availability sí descarta vencidos, `route.ts:267-271`) y al
  confirmar recibe `slot_full` → reserva perdida hasta 24 h;
- misma inconsistencia en el badge "N/N lleno" de la agenda (`agenda-client.tsx:487-516`, que
  tampoco mira `expires_at`).

La propia función ya tiene el patrón correcto 80 líneas más arriba (`062:229`).

**Fix:**
```sql
    SELECT count(*) INTO v_overlap
    FROM appointments a
    WHERE a.business_id = p_business_id
      AND a.service_id = p_service_id
      AND a.date = p_date
      AND a.status IN ('confirmed', 'pending_payment')
      -- holds VIGENTES únicamente (misma guarda que 062:229 y que el read-path)
      AND (a.status = 'confirmed' OR a.expires_at IS NULL OR a.expires_at > now())
      AND tsrange(a.date + a.time, a.date + a.time + make_interval(mins => COALESCE(a.duration_minutes, 30)))
          && tsrange(p_date + p_time, p_date + p_time + make_interval(mins => p_duration));
```
Replicar el mismo filtro en `agenda-client.tsx` (`overlapFullById`) para que el aviso del panel no
mienta.

---

### CR-02: Un servicio simultáneo se puede reservar ENCIMA de un turno existente de otro servicio en la misma agenda (doble-booking real)

**File:** `lib/booking-core.ts:210-228` + `supabase/migrations/062_service_capacity_mode_overlap.sql:309-340`

**Issue:** Para `capacity_mode = 'simultaneous_resource'` con `capacity > 1` se caen **las tres**
capas de protección de solape por agenda, a la vez:

1. **Gate JS desactivado**: `booking-core.ts:226` → `if (taken && slotCapacity <= 1 && !isSimultaneousResource)`.
   Con el flag en true no hay early-return **sea cual sea** lo que ocupe el bucket (una consulta
   normal confirmada, un turno de abono, lo que sea).
2. **Gate SQL acotado al mismo servicio**: `062:311-312` filtra `a.service_id = p_service_id`, así
   que los turnos de otros servicios en la misma agenda no restan ni bloquean.
3. **EXCLUDE 013 desactivado para la fila nueva**: `v_is_group := (v_svc_cap > 1)` (`062:340`) y la
   constraint es `... WHERE (status IN (...) AND NOT is_group)` (`schema.sql:1041`). Una fila
   `is_group = true` **no entra al índice gist**, así que no choca con nada ni nadie choca con ella.

Escenario reproducible (sin concurrencia, secuencial):
- Profesional P, servicio "Consulta" (group_class, bloque cupo 1) reservado 16:00–16:30 → fila
  `is_group = false`.
- Servicio "Camilla" (`simultaneous_resource`, capacity 2), misma agenda P, 16:10.
- JS: skip (flag). RPC: overlap del mismo `service_id` = 0 < 2 → pasa. INSERT con `is_group = true`
  → el EXCLUDE ni lo mira. **Turno creado**: P queda con dos turnos superpuestos de servicios
  distintos, que es exactamente lo que el motor v0.9/v0.12 garantizaba que no podía pasar.

Nótese la asimetría que confirma el agujero: con `capacity = 1` la fila nace `is_group = false` y el
EXCLUDE sí protege; con `capacity = 2` la protección desaparece por completo en vez de pasar de 1 a 2.

**Fix:** el cupo del recurso NO puede reemplazar la exclusión por agenda. Dos opciones, en orden de
preferencia:

- **(A) Gate adicional por bucket en la rama simultánea** — contar aparte los turnos solapados del
  mismo bucket que NO son de este servicio y rechazar si hay alguno:
```sql
    IF EXISTS (
      SELECT 1 FROM appointments a
      WHERE a.business_id = p_business_id
        AND COALESCE(a.professional_id, '00000000-0000-0000-0000-000000000000'::uuid) = v_bucket
        AND a.service_id IS DISTINCT FROM p_service_id
        AND a.date = p_date
        AND a.status IN ('confirmed','pending_payment')
        AND (a.status = 'confirmed' OR a.expires_at IS NULL OR a.expires_at > now())
        AND tsrange(a.date + a.time, a.date + a.time + make_interval(mins => COALESCE(a.duration_minutes, 30)))
            && tsrange(p_date + p_time, p_date + p_time + make_interval(mins => p_duration))
    ) THEN
      RAISE EXCEPTION 'slot_taken' USING ERRCODE = 'P0001';
    END IF;
```
- **(B)** Restringir el modo simultáneo al bucket sentinela / a agendas dedicadas y documentarlo,
  de modo que "2 camillas" no pueda compartir agenda con turnos individuales.

En ambos casos, quitar el bypass ciego de `booking-core.ts:226`: el early-return debe seguir
aplicando a los solapes **de otros servicios** (solo los del propio servicio son legales hasta el cupo).

---

### CR-03: La re-granularización del lock rompe la serialización cross-modo que 058 introdujo a propósito (§GA1)

**File:** `supabase/migrations/062_service_capacity_mode_overlap.sql:192-198`

**Issue:** 058 había **engrosado** el lock a `hash(business_id + date + time)` con una razón
explícita: "serializa TODA reserva del mismo instante de inicio del negocio ... para que la selección
de candidato vea un estado consistente de todo el instante" (comentario borrado en el diff de
`schema.sql:130-136`). La 062 hace que las reservas simultáneas tomen `hash(business_id + service_id + date)`,
que es **ortogonal**, no más grueso: una reserva simultánea y una grupal del mismo instante ya no
comparten ningún lock.

Dos carreras concretas que esto reabre:

1. **`v_seat` calculado sin lock compartido.** El asiento se computa contando el slot exacto del
   bucket (`062:328-333`), pero dos transacciones de modos distintos (o de dos servicios simultáneos
   distintos) sobre el MISMO `bucket+date+time` no se serializan → ambas obtienen el mismo
   `v_occupied` → mismo `seat` → 23505 del índice 011 → `slot_taken` **espurio** para una reserva
   que era legítima (p. ej. bloque grupal de cupo 3 con lugares libres).
2. **Selección "cualquiera" con estado sucio.** Con `autoAssign` el RPC elige el profesional bajo el
   lock (`062:204-253`) y los re-checks JS se saltean por completo (`booking-core.ts:135`). Dos
   requests concurrentes (una simultánea, otra individual) al mismo instante toman locks distintos,
   ambas ven al profesional P libre y ambas lo eligen. La individual queda `is_group = false` y la
   simultánea `is_group = true` ⇒ el EXCLUDE 013 tampoco las cruza (CR-02) ⇒ **doble-booking real
   de P bajo concurrencia**, que es justo lo que 058 §GA1 cerraba.

El endpoint público acepta `anyProfessional: true` con cualquier `serviceId`; que la UI oculte la
tarjeta (`booking-client.tsx:129-133`) no es un control de seguridad.

**Fix:** que el modo simultáneo tome **los dos** locks, siempre en el mismo orden global (primero el
de servicio-día, después el de instante) para no introducir deadlocks:
```sql
  IF v_mode = 'simultaneous_resource' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(
      p_business_id::text || p_service_id::text || p_date::text, 0));
  END IF;
  -- El lock de instante (058 §GA1) se toma SIEMPRE, en los dos modos: es lo que serializa
  -- v_seat y la selección "cualquiera" contra el resto de las reservas del mismo instante.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    p_business_id::text || p_date::text || p_time::text, 0));
```
Si se prefiere no tocar el lock, hay que bloquear explícitamente `autoAssign` + modo simultáneo en
`booking-core.ts` (fail-closed server-side, no solo en la UI) y aceptar el 23505 espurio como
comportamiento conocido — pero eso deja abierto (1).

---

### CR-04: La rama simultánea de `availability` ignora el profesional, la ocupación real del bucket y el bloqueo por espacio

**File:** `app/api/booking/availability/route.ts:248-300`

**Issue:** Cuando `capacity_mode = 'simultaneous_resource'`, el endpoint retorna
`{ busy: [], full: fullSim }` (`route.ts:299`) y `fullSim` se calcula **solo** con los turnos del
mismo `service_id` (`route.ts:267-271`). El `professionalId` que el cliente sí manda
(`booking-client.tsx:262`) se descarta, y la rama retorna antes de:

- el bucketeo por profesional (`route.ts:304-311`),
- el bloqueo por ESPACIO compartido (`route.ts:313-347`), que es una invariante endurecida en v0.12,
- el `busy` de los turnos vivos de esa agenda (`route.ts:358-366`).

Efectos:
1. Un profesional con la agenda ocupada por otro servicio aparece **totalmente libre** para el
   servicio simultáneo. Combinado con CR-02, no es solo un espejismo: la reserva entra y produce el
   doble-booking.
2. Si la agenda tiene espacios mapeados (`agenda_spaces`), el RPC sí rechaza (`062:282-298`), así que
   el público ve el horario, lo elige, y recibe un error genérico (ver WR-01).

**Fix:** en la rama simultánea, mantener el resto de los filtros en vez de retornar temprano. Como
mínimo, computar `full` como la UNIÓN de (a) `n >= cap` del carril del servicio y (b) los solapes del
bucket consultado + los de sus agendas hermanas por espacio, reutilizando `mySpaces`/`siblingBuckets`
tal como hace la rama `any` (`route.ts:154-181, 210-228`). El contrato `{ ok, busy, full }` y el
no-leak (`busy: []`) se pueden conservar: la información sigue colapsando a un booleano por slot.

## Warnings

### WR-01: El cliente público no maneja `slot_full` → mensaje genérico "Error al confirmar"

**File:** `app/[slug]/booking-client.tsx:374-384`
**Issue:** `/api/booking/create` devuelve `{ ok:false, error:'slot_full' }` con 409
(`app/api/booking/create/route.ts:175-177`), pero el cliente solo contempla `slot_taken` y
`recaptcha_failed`; todo lo demás cae en `toast.error('Error al confirmar. Intentá de nuevo.')`.
Con la Phase 12 `slot_full` pasa a ser el rechazo **principal** de un modo entero (y es más frecuente
por los caveats de grilla del read-path: horarios especiales, buffer, holds), así que el usuario ve
un error de sistema en vez de "se ocupó".
**Fix:**
```ts
if (data?.error === 'slot_taken' || data?.error === 'slot_full') {
  toast.error('Ese horario se acaba de ocupar, elegí otro.')
}
```

### WR-02: El carril del cupo ignora `location_id` y `professional_id` — el "2 camillas" es global al negocio

**File:** `supabase/migrations/062_service_capacity_mode_overlap.sql:309-316`
**Issue:** El count es por `business_id + service_id + date`. En un negocio multi-sede que ofrece el
mismo servicio en dos consultorios, o con dos profesionales que hacen "Camilla", el cupo N se comparte
entre TODOS: dos turnos en sedes distintas se pisan y el segundo recibe `slot_full`. La UI de Ajustes
(`settings-client.tsx:119-176`) no dice en ningún lado que el número es por servicio y global, y el
texto de ayuda ("atendés varios a la vez, ej. 2 camillas") sugiere lo contrario.
**Fix:** decidir explícitamente la dimensión del carril. Si el cupo es por sede/agenda, sumar
`AND a.location_id IS NOT DISTINCT FROM p_location_id` (o el bucket) al count y al read-path; si es
global a propósito, decirlo en el copy del panel ("N a la vez en todo el negocio").

### WR-03: `Service.capacity` está tipado como requerido pero `public_services` no lo expone

**File:** `lib/types.ts:198-201` · `app/[slug]/page.tsx:81`
**Issue:** La vista pública (correctamente) NO devuelve `capacity`, pero el tipo lo declara
`capacity: number` sin `?`. La página pública hace `public_services.select('*')` y castea a
`Service[]`, así que en todo el path público `service.capacity` es `undefined` mientras TypeScript
afirma que es `number`. Hoy nadie lo lee ahí, pero es una trampa activa para el próximo cambio (un
`service.capacity > 1` en el cliente sería silenciosamente falso).
**Fix:** `capacity?: number` (como ya se hace con `location_id?`/`location_ids?`), o un tipo
`PublicService = Omit<Service, 'capacity'>` para el path anon.

### WR-04: Cambiar `capacity_mode` de un servicio con turnos futuros deja `is_group` inconsistente

**File:** `app/(dashboard)/settings/settings-client.tsx:521-534`
**Issue:** `saveEditService` permite cambiar el modo de un servicio que ya tiene turnos creados. Las
filas viejas conservan su `is_group` (escrito por el RPC al insertarlas), así que:
- simultáneo cupo 2 → `group_class`: las filas viejas quedan `is_group = true`, es decir fuera del
  EXCLUDE 013 para siempre; el nuevo gate por hora exacta no las cubre en horarios escalonados ⇒
  la agenda queda con solapes permanentes que ningún gate volverá a detectar;
- `group_class` → simultáneo: los turnos previos del servicio pasan a contar en un carril que antes
  no existía, pudiendo dejar el día entero como `slot_full`.
No hay aviso ni confirmación en el diálogo.
**Fix:** advertir en el diálogo cuando el servicio tiene turnos futuros (`ConfirmDialog` del repo) y
—si se acepta el cambio— recalcular `is_group` de esos turnos en el mismo UPDATE, o bloquear el
cambio de modo mientras existan turnos futuros no cancelados.

### WR-05: El input de cupo no tiene tope (desborda `smallint`) y no se puede vaciar

**File:** `app/(dashboard)/settings/settings-client.tsx:110-112, 158-168`
**Issue:** `normalizeCapacity` acota por abajo (`Math.max(1, ...)`) pero no por arriba, y la columna
es `smallint` (máx. 32767). Escribir 99999 hace fallar el UPDATE/INSERT con un error de Postgres que
la UI muestra como `toast.error('Error')` sin explicación. Además `parseInt('')` → `NaN` → 1, así que
al borrar el campo salta a 1 y no se puede dejar vacío mientras se tipea.
**Fix:** `max={99}` en el input + `Math.min(99, Math.max(1, ...))` en `normalizeCapacity` (un cupo
mayor no tiene sentido de negocio y evita el overflow), y mantener el valor como string en el estado
del form para permitir el campo vacío durante la edición.

### WR-06: El test "criterio de éxito duro" CUPO-04 depende del timing y pasa igual sin el fix

**File:** `test/concurrency.test.ts:371-403`
**Issue:** El propio comentario documenta que "sin warm-up, este mismo test PASA incluso con el lock
viejo" (`concurrency.test.ts:379-384`). El assert final (2 ok + 1 `slot_full`) también se cumple en
ejecución **secuencial**, así que el test no distingue el lock corregido del roto salvo que la carrera
realmente ocurra — cosa que depende del pool de conexiones y de la latencia de la red. En CI (más
lento, sockets fríos) es un falso verde probable: la fase pierde su única guarda de la
re-granularización.
**Fix:** hacer la carrera determinista en vez de esperarla: sembrar N-1 turnos comprometidos y lanzar
las concurrentes sobre el último lugar (como hace CONC-01), y/o asertar además el estado que solo el
lock produce (p. ej. que las filas insertadas tengan `seat` consecutivos sin huecos). Alternativamente,
marcar el test como no-determinista y mover la prueba de la re-granularización a un test que fuerce la
concurrencia con `pg_sleep` dentro de una transacción.

### WR-07: El aviso "lleno" de la agenda se pierde con servicios inactivos y reconstruye el `service_id` por string

**File:** `app/(dashboard)/agenda/agenda-client.tsx:487-516` · `app/(dashboard)/agenda/page.tsx:45`
**Issue:** Dos cosas:
1. `page.tsx:45` trae `services` con `.eq('active', true)`. Un servicio simultáneo desactivado
   (frecuente: se desactiva pero quedan turnos futuros) desaparece de `serviceById`, así que sus
   turnos pierden el badge de cupo lleno y vuelven a tratarse como `group_class` (`agenda-client.tsx:628`).
2. `const svc = serviceById.get(key.slice(0, key.indexOf('|')))` reconstruye el id parseando la clave
   compuesta en vez de guardarlo. Si algún día la clave cambia de formato el bug es silencioso
   (`svc` undefined → `capacity` 1 → todo se marca lleno).
**Fix:** que `lanes` guarde `Map<string, { serviceId: string; date: string; items: AgendaAppt[] }>`
(o una clave que no requiera parsear), y traer los servicios de la agenda sin el filtro `active` (o
con un segundo fetch de los ids referenciados por los turnos de la semana).

### WR-08: El panel escribe `capacity_mode`/`capacity` antes de que la migración exista en prod

**File:** `app/(dashboard)/settings/settings-client.tsx:466-468, 526-531`
**Issue:** El alta y la edición de servicios mandan siempre `capacity_mode` y `capacity` en el
payload, también cuando el dueño no toca nada del cupo. Si el código se deploya antes de aplicar la
062 a mano (la última en prod es la 061), **toda** creación/edición de servicios falla con
`column "capacity_mode" does not exist` y la UI muestra `toast.error('Error')` sin más contexto:
una funcionalidad preexistente se rompe por una feature nueva.
**Fix:** dejar constancia del orden obligatorio (migración → deploy) en el plan de deploy y mejorar
el mensaje de error (`toast.error(error.message)` o un código propio), o —si se quiere tolerancia—
omitir las dos columnas del payload cuando el modo es `group_class` y no cambió.

## Info

### IN-01: `capacity` se lee en el core y no se usa

**File:** `lib/booking-core.ts:98`
**Issue:** El `select` trae `capacity_mode, capacity`, pero solo se usa `capacity_mode`
(`booking-core.ts:218`). El cupo N es autoridad exclusiva del RPC, así que la columna sobra.
**Fix:** sacar `capacity` del select, o comentar por qué se trae igual (futuro re-check UX).

### IN-02: `availability` ahora puede responder 400 donde antes devolvía la grilla

**File:** `app/api/booking/availability/route.ts:248-257`
**Issue:** El nuevo bloque corre para **cualquier** request con `serviceId` (no solo `any=1`) y
devuelve `invalid_service` (400) si el id no resuelve por `business_id`. Antes ese parámetro se
ignoraba en el camino específico. Es correcto como anti-tampering, pero es un cambio de contrato para
clientes viejos/embebidos que mandaran `serviceId` de más, y agrega una query por request.
**Fix:** ninguno obligatorio; documentarlo en el contrato del endpoint.

### IN-03: Divergencias/edge cases del predicado de solape

**File:** `app/api/booking/availability/route.ts:272-276` · `supabase/migrations/062_service_capacity_mode_overlap.sql:315-316`
**Issue:** (a) El read-path aplica `buffer_minutes` al solape y el RPC no — la divergencia está
documentada y es conservadora (oculta de más), pero hace que `full` no sea espejo del gate.
(b) `COALESCE(a.duration_minutes, 30)` no cubre `0`: una fila con duración 0 produce un `tsrange`
vacío que no solapa con nada y no consume cupo; una duración negativa hace fallar `tsrange` (22000 →
`insert_failed` 500). Hoy el core normaliza (`Number(... || 30)`), así que no es alcanzable desde la
app, pero no hay CHECK en `services.duration_minutes` que lo garantice.
**Fix:** agregar `CHECK (duration_minutes > 0)` a `services` en una migración futura; si se quiere
paridad exacta read/write, mover el buffer al RPC o quitarlo del read.

---

_Reviewed: 2026-07-29_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
