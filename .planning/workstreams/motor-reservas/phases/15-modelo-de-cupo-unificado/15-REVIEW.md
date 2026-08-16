---
phase: 15-modelo-de-cupo-unificado
reviewed: 2026-08-16T00:00:00Z
depth: standard
files_reviewed: 10
files_reviewed_list:
  - supabase/migrations/068_service_capacity_unified_and_mode_gate.sql
  - lib/booking-core.ts
  - app/api/booking/availability/route.ts
  - app/[slug]/booking-client.tsx
  - app/(dashboard)/settings/settings-client.tsx
  - lib/types.ts
  - test/capacity-mode-change-gate.test.ts
  - test/concurrency.test.ts
  - test/booking-cualquiera-public.test.ts
  - test/helpers/booking-fixtures.ts
findings:
  critical: 3
  warning: 6
  info: 2
  total: 11
status: fixed
---

# Phase 15: Code Review Report

**Reviewed:** 2026-08-16
**Depth:** standard
**Files Reviewed:** 10
**Status:** issues_found

## Summary

El cutover del cupo a `services.capacity` está bien hecho en su propio eje: la derivación
`is_group := (capacity > 1)` es correcta en los tres modos, el fail-safe del `COALESCE` es
estrictamente más cerrado que el anterior, el gate `BEFORE UPDATE OF capacity_mode` maneja bien los
NULL (`status IS NULL`, `IS NOT DISTINCT FROM`), no filtra datos del negocio (mensaje fijo, sin
nombres ni conteos) y no bloquea ninguna escritura legítima del write-path que tracé
(`toggleService`, `setServiceLocations`, `updateCancha`, `addService`). Verifiqué además que
`book_slot_atomic` es el **único** escritor de `is_group` en la app (no hay ningún
`.from('appointments').insert()` ni reasignación de `service_id` en código de producción), así que
por ese lado no hay camino donde una fila nazca con el valor equivocado.

El problema real está en otro lado, y es el mismo tres veces: **la fase volvió declarable un modo
—`group_class` con `capacity >= 2`— sin extenderle NINGUNA de las tres protecciones que la Phase 12
/ migr. 064 construyeron para el otro modo de cupo > 1.** El gate espejo del RPC, el rechazo
`simultaneous_space_conflict` y el guard del editor `spacesBlockSimultaneous` **todos filtran por
`capacity_mode = 'simultaneous_resource'` literal**. Antes de la 068 eso no importaba porque un
`group_class` real era inalcanzable (el número salía de `time_blocks.capacity`, medido en 1 en el
100 % de producción). Desde la 068 el dueño lo declara con dos clicks en `/servicios`, y ahí
aparecen tres agujeros que **reproduje contra el Postgres local**, no que deduje:

1. una clase grupal se reserva **encima** de un turno ya confirmado de otro servicio en la misma
   agenda (doble-booking real, sin error);
2. "Cualquiera" + clase grupal deja lugares inalcanzables y parte la clase entre profesionales;
3. una clase grupal sobre una agenda con espacio físico mapeado se corta en 1 inscripto con un
   `slot_taken` mentiroso, mientras `availability` sigue ofreciendo los N lugares.

Los tres fallan del lado de "el público reserva y recibe un error" o —el primero— del lado
peor: entra y rompe el anti-doble-booking. Ninguno está cubierto por la suite de la fase.

Los hallazgos ya registrados como todos (dirección del gate, `completed`, comparación por fecha sin
hora, el input de "Cuántos lugares", el `+` del alta, un cliente ocupando todo el cupo, el editor
completo y la 4ª lectura de `agenda-client`) **no** se repiten acá.

---

## Critical Issues

### CR-01: Una clase grupal se reserva ENCIMA de un turno existente de otro servicio en la misma agenda

**File:** `supabase/migrations/068_service_capacity_unified_and_mode_gate.sql:695-715`
(gate espejo), `app/api/booking/availability/route.ts:426`, `lib/booking-core.ts:275`

**Issue:**
`is_group = true` saca la fila del EXCLUDE gist 013 (`appointments_no_overlap ... WHERE (... AND NOT
is_group)`, schema.sql:1300). El gate espejo de la rama no-simultánea, que es lo único que podría
frenar un solape cross-servicio de una fila exenta, exige que **el servicio de la fila preexistente**
esté en `simultaneous_resource` (`:704-709`). Un turno `individual` preexistente no cumple ese
predicado, y la fila NUEVA (grupal, `is_group = true`) tampoco entra al gist. Resultado: nada la
frena.

Las tres capas caen a la vez:
- `booking-core.ts:275` → `rejectEarly = taken && slotCapacity <= 1` → con cupo 3 es `false`.
- `availability:426` → `busy = (slotCapacity <= 1 ? live : [])` → `busy` vacío ⇒ el client no marca
  conflicto; `full` sólo cuenta `>= 3` ⇒ el horario se ofrece.
- RPC → `v_occupied` (1) `< v_capacity` (3) ⇒ `v_seat := 1` ⇒ INSERT.

**Reproducido contra el Postgres LOCAL** (servicio A `individual`, servicio B `group_class` cupo 3,
misma agenda, `book_slot_atomic` directo):

```
 client_name |   time   | duration | seat | is_group | service
 A           | 10:00:00 |       30 |    0 | f        | individual   ← turno real del cliente
 B           | 10:00:00 |       30 |    1 | t        | group_class  ← se montó encima
 C           | 10:15:00 |       30 |    0 | t        | group_class  ← y también solapado
```

Tres turnos pisándose en la agenda de un solo profesional, sin un solo error. La fila `C` además
muestra que un "grupal" acepta inscripciones a horas de inicio DISTINTAS, lo que contradice la
semántica declarada del modo ("todos arrancan a la misma hora").

**Fix:** ampliar el gate espejo (migración **069**, la 068 ya está en prod y no se edita) para que
también rechace el solape contra filas de servicios que NO son de cupo > 1. El recorte de D-07 sólo
necesita proteger el caso grupal↔grupal, así que el predicado correcto es "la fila preexistente
pertenece a un servicio de cupo > 1", no "pertenece a un simultáneo":

```sql
-- 069: el gate espejo deja de mirar el MODO y pasa a mirar el CUPO.
--   legal   : dos servicios de cupo >= 2 coexistiendo solapados (lo que "cupo N" significa)
--   ilegal  : un servicio de cupo >= 2 montándose sobre un turno de cupo 1 (doble-booking)
        AND NOT EXISTS (
              SELECT 1 FROM services s2
              WHERE s2.id = a.service_id
                AND s2.business_id = p_business_id
                AND s2.capacity >= 2          -- ⇐ reemplaza a capacity_mode = 'simultaneous_resource'
            )
```

…invertido según la rama (en la rama no-simultánea hay que rechazar cuando la preexistente es de
cupo 1, o sea `s2.capacity = 1` / `service_id IS NULL`). Y el espejo de UX: en `booking-core.ts`
usar `takenByOtherService` también para el camino grupal (`rejectEarly = takenByOtherService` cuando
`slotCapacity > 1`), y en `availability` mandar a `full` los start-times donde la agenda tiene un
turno vivo de OTRO servicio de cupo 1 —igual que ya hace la rama simultánea con `liveBucketOther`
(`route.ts:299-301, 355`).

---

### CR-02: "Cualquiera" + `group_class` deja lugares inalcanzables y parte la clase entre profesionales

**File:** `lib/booking-core.ts:136`, `app/api/booking/availability/route.ts:136-138` y `:237-246`,
`app/[slug]/booking-client.tsx:129-133`

**Issue:**
D-13 / T-12-11 declararon NO soportada la combinación "Cualquiera" + cupo > 1 porque la selección de
candidatos del RPC (`068:466-478`) marca ocupada a **cualquier** agenda con un solape: no sabe usar
el 2º lugar. El rechazo se implementó en las tres capas… **filtrando por
`capacity_mode === 'simultaneous_resource'`**:

- `booking-core.ts:136` → `if (autoAssign && service.capacity_mode === 'simultaneous_resource')`
- `availability:136` → `if (svc.capacity_mode === 'simultaneous_resource') return 400`
- `booking-client.tsx:133` → `showAny = capaces.length >= 2 && !isSimultaneousResource`

`group_class` con cupo >= 2 tiene exactamente el mismo problema y **no está gateado en ninguna de las
tres**. Peor: la rama `any` de `availability` (`:239-246`) para `cap > 1` sólo cuenta ocupación en la
**hora de inicio EXACTA** por pro (`countExact >= cap`) e ignora los solapes, mientras el RPC excluye
al pro por CUALQUIER solape → el read-path ofrece lo que el write-path no puede dar.

**Reproducido contra el Postgres LOCAL** (2 profesionales comodín, servicio `group_class` cupo 3, tres
inscripciones vía el UUID mágico "cualquiera" al mismo horario):

```
--- inscripcion 1 (Cualquiera) --- OK   → proA
--- inscripcion 2 (Cualquiera) --- OK   → proB   (proA ya está "ocupado")
--- inscripcion 3 (Cualquiera) --- ERROR: slot_taken     ← con 3 lugares declarados
```

Dos consecuencias, las dos malas: la clase de 3 lugares se llena a los 2 (y el 3º recibe "Ese horario
se acaba de ocupar" sobre un horario que la grilla seguía ofreciendo), y las 2 inscripciones quedaron
en agendas DISTINTAS — o sea que no es una clase, son dos clases de una persona.

**Fix:** extender el gate de D-13 al criterio real (cupo, no modo) en las tres capas, con el mismo
código de error que ya existe:

```ts
// lib/booking-core.ts (~136) — el combo no soportado es "autoAssign + cupo > 1", no "+ simultáneo"
if (autoAssign && Number(service.capacity) > 1) {
  return { ok: false, error: 'any_professional_unsupported', status: 400 }
}

// app/api/booking/availability/route.ts (~136) — el read-path tiene que coincidir
if (Number(svc.capacity) > 1) {
  return Response.json({ ok: false, error: 'any_professional_unsupported' }, { status: 400 })
}

// app/[slug]/booking-client.tsx (~133) — la tarjeta se oculta por cupo, no por modo
const showAny = capaces.length >= 2 && Number(selectedService?.capacity ?? 1) <= 1
```

Si en cambio se quiere SOPORTAR "Cualquiera" en grupales (que es lo razonable para una clase), hay
que hacer capacity-aware la selección de candidatos del RPC en la 069, y ahí el `NOT EXISTS` de
solape debe pasar a `count(mismo bucket, misma hora exacta) < capacity`. Cualquiera de los dos
caminos sirve; el que NO sirve es el estado actual, donde read y write no coinciden.

---

### CR-03: Una clase grupal sobre una agenda con espacio mapeado se corta en 1 inscripto con un `slot_taken` mentiroso

**File:** `supabase/migrations/068_service_capacity_unified_and_mode_gate.sql:529-531`,
`app/api/booking/availability/route.ts:329`, `app/(dashboard)/settings/settings-client.tsx:162-173`

**Issue:**
La migr. 064 (gap 3) declaró que cupo >= 2 sobre una agenda con espacio físico mapeado es una
configuración IMPOSIBLE (`appointment_spaces_no_overlap` es 1-a-la-vez, schema.sql:1290) y la cerró
en tres lugares. Los tres condicionan por modo:

- RPC `:529` → `IF v_mode = 'simultaneous_resource' AND v_svc_cap > 1 AND v_space_ids IS NOT NULL`
- read-path `:329` → `simSpaceBlocked` vive DENTRO de `if (svc.capacity_mode === 'simultaneous_resource')`
- editor `:162` `spacesBlockSimultaneous` → sólo deshabilita el botón `simultaneous_resource` (`:200`)

`group_class` cupo >= 2 sobre la misma agenda es la MISMA contradicción y no la cubre ninguno. El
editor deja guardarla, la grilla la ofrece entera, y la 2ª inscripción muere en el trigger
`appointment_spaces_populate` con 23P01, que `booking-core.ts:374` traduce a `slot_taken` —
exactamente la mentira ("horario ocupado" en vez de "configuración imposible") que la 064 vino a
eliminar.

**Reproducido contra el Postgres LOCAL** (agenda con `agenda_spaces` → SalaA, servicio `group_class`
cupo 3):

```
--- inscripcion 1 --- OK
--- inscripcion 2 --- ERROR: conflicting key value violates exclusion constraint
                              "appointment_spaces_no_overlap"
```

**Fix:** las tres protecciones tienen que mirar el CUPO, no el modo.

```sql
-- 069, RPC (~529): la contradicción es "cupo > 1 sobre espacio 1-a-la-vez", sin importar el modo
IF v_svc_cap > 1 AND v_space_ids IS NOT NULL THEN
  RAISE EXCEPTION 'simultaneous_space_conflict' USING ERRCODE = 'P0001';
END IF;
```

```ts
// availability: sacar simSpaceBlocked de la rama simultánea y evaluarlo para todo cap > 1,
// antes de la bifurcación (mismo booleano por slot, sin decir por qué).

// settings-client.tsx: renombrar a spacesBlockSharedCapacity y bloquear los DOS modos de cupo > 1
const blocked = spacesBlocked && o.key !== 'individual' && value !== o.key
```

Además conviene renombrar el código de error a algo neutro (`shared_capacity_space_conflict`) o
dejarlo y mapearlo igual en el panel; lo importante es que el público no reciba `slot_taken` por una
configuración imposible.

---

## Warnings

### WR-01: La 068 dropea el CHECK del enum ANTES del backfill y no abre transacción explícita

**File:** `supabase/migrations/068_service_capacity_unified_and_mode_gate.sql:31-37, 106-107`

**Issue:** El header afirma sin condiciones que "si el paso 4 corriera ANTES del UPDATE del paso 2,
la migración ABORTARÍA ENTERA y no quedaría nada aplicado", y el runbook (`15-RUNBOOK-068.md:215`)
repite "La migración corre en una sola transacción". El archivo **no tiene `BEGIN;`/`COMMIT;`**. Esa
garantía depende enteramente del cliente que la aplique: el SQL editor de Supabase manda el script
como un batch y sí lo envuelve en una transacción implícita; `psql -f archivo.sql` (sin `-1`) manda
statement por statement en autocommit y NO. Por ese camino, un fallo en el paso 3 o 4 dejaría la
tabla **sin ningún CHECK de enum** (el paso 1 ya lo dropeó), aceptando cualquier string en
`capacity_mode` en silencio.

No requiere migración correctiva: en prod se aplicó por el camino transaccional y el estado final es
correcto (verificado el CHECK en local, `\d services`).

**Fix:** para la 069 y siguientes, envolver explícitamente el archivo cuando dropea un constraint
antes de recrearlo:

```sql
BEGIN;
-- ... pasos 1..6 ...
COMMIT;
```

o, si se conserva la convención del repo de no usar `BEGIN`, cambiar la afirmación del header y del
runbook por la condición real ("aplicar SIEMPRE desde el SQL editor, o con `psql -1
--set=ON_ERROR_STOP=1`"). Una afirmación absoluta que sólo vale para un cliente es la clase de
comentario que este repo considera peor que ninguno.

---

### WR-02: El backfill y el pre-flight ignoran `simultaneous_resource` con cupo <= 1, que abortaría la migración

**File:** `supabase/migrations/068_service_capacity_unified_and_mode_gate.sql:126-129, 90-93`

**Issue:** El backfill del paso 2 normaliza sólo `capacity_mode = 'group_class' AND capacity <= 1`.
Un `simultaneous_resource` con cupo 1 era una configuración **legal y explícitamente testeada** antes
de esta fase (el propio `test/concurrency.test.ts:623-634` documenta que ese caso existía y lo
convierte en guard). Si alguna fila estuviera en ese estado, el `ADD CONSTRAINT` del paso 4 valida
las filas existentes y **aborta la migración entera** — el mismo modo de falla que el header dedica
seis líneas a evitar para el caso grupal. El pre-flight (ii) manda mirar la distribución pero sólo
declara criterio de aborto para `time_blocks` y sólo pide "REGISTRAR" el `group_class` con cupo >= 2;
el caso que realmente rompe no está nombrado.

Falla cerrado (no corrompe datos) y en prod no había ninguna fila así (D-02), pero el archivo y el
runbook quedan con un hueco que reaparece en cualquier replay sobre una base que no sea la de prod.

**Fix:** en la 069 (o como nota del runbook) dejar el backfill simétrico:

```sql
UPDATE "public"."services"
   SET "capacity_mode" = 'individual'
 WHERE "capacity_mode" IN ('group_class', 'simultaneous_resource')
   AND "capacity" <= 1;
```

y agregar al pre-flight el control que sí prueba algo:
`select count(*) from services where capacity_mode <> 'individual' and capacity <= 1;`
con criterio de aborto explícito si devuelve > 0 y no se quiere normalizar.

---

### WR-03: El campo "Cuántos lugares" no tiene tope y desborda el `smallint` con un error genérico

**File:** `app/(dashboard)/settings/settings-client.tsx:243-251`

**Issue:** `services.capacity` es `smallint` (máx 32767, verificado en `\d services`). El input tiene
`min={2}` pero **no tiene `max`**, y `normalizeCapacity` sólo aplica el piso
(`Math.max(min, Math.floor(n))`). Un dueño que escriba `40000` (o pegue un número) manda ese valor al
INSERT/UPDATE, Postgres responde `22003 smallint out of range` y `saveEditService:738` /
`addService:639` lo colapsan en `toast.error('Error al guardar')` / `toast.error('Error')`, sin decir
qué pasó. Un cupo de 500 tampoco tiene sentido de negocio y además rompe la grilla del roster.

**Fix:**

```tsx
// helper
const MAX_CAPACITY = 99
function normalizeCapacity(n: number, min = 1): number {
  return Number.isFinite(n) ? Math.min(MAX_CAPACITY, Math.max(min, Math.floor(n))) : min
}
// input
<Input type="number" min={2} max={MAX_CAPACITY} step={1} ... />
```

---

### WR-04: El comentario de `TimeBlock.capacity` sigue afirmando que el bloque define la clase grupal

**File:** `lib/types.ts:108-110`

**Issue:** La fase actualizó con cuidado los comentarios de `Service` (`:193-206`) y de
`Appointment.is_group` (`:277-280`), pero dejó intacto el de la columna que justamente **demotó**:

```ts
// Cupo del bloque (migración 041). NOT NULL DEFAULT 1 en la DB → siempre presente. 1 = comportamiento
// individual de siempre (1 reserva por slot); > 1 = clase grupal con `capacity` lugares en el mismo slot.
capacity: number
```

Eso ya no es cierto desde la 068: `time_blocks.capacity` no decide nada. Es el comentario exacto que
va a leer el próximo que toque `agenda-client.tsx` (la 4ª lectura, diferida a Phase 16) y lo va a
mandar por el camino equivocado. El propio `test/helpers/booking-fixtures.ts:99-102` ya documenta el
cambio de estatus de esa columna ("a partir de acá el parámetro sirve como CONTROL NEGATIVO"); el
tipo de dominio no.

**Fix:**

```ts
// Cupo del bloque (migración 041). ⚠ DESDE LA MIGR. 068 NO DECIDE NADA: el cupo es del SERVICIO
// (`services.capacity`, único para los tres modos) y `book_slot_atomic` dejó de consultar esta
// columna. Se conserva por compatibilidad y porque `agenda-client` todavía la lee (Phase 16).
capacity: number
```

---

### WR-05: Un control de `CUPOS-02` no puede fallar (pasa por el motivo equivocado)

**File:** `test/concurrency.test.ts:447`

**Issue:**

```ts
expect(busyGrupal).not.toContain('09:00')
```

`busyGrupal` sale de `bodyGrupal.busy`, y en `availability:426` `busy` es
`(slotCapacity <= 1 ? live : []).concat(siblingBusy)`. Para **cualquier** servicio de cupo > 1 el
primer término es `[]` por construcción, y este escenario no tiene espacios mapeados ⇒ `siblingBusy`
también es `[]`. La aserción es `[] not.toContain('09:00')`: verde pase lo que pase con la lógica de
cupo grupal. El comentario del caso (`:443-445`) la vende como el guard de "la ocupación grupal no se
remueve por solapamiento", que es precisamente lo que no está midiendo.

**Fix:** asertar el invariante fuerte y no su síntoma:

```ts
// La rama grupal NO manda ocupación a busy: el contrato es que busy quede vacío…
expect(bodyGrupal.busy).toEqual([])
// …y que el slot PARCIAL siga siendo ofrecido por el read-path (que es lo que protege al 3er lugar).
expect(fullGrupal).not.toContain('09:00')
```

Y, ya que el escenario ahora mezcla un servicio grupal con uno individual en la MISMA agenda, agregar
el caso que hoy falta: consultar el grupal con un turno del servicio individual vivo en ese horario y
asertar que el start-time va a `full` (es el control de CR-01).

---

### WR-06: La suite de la fase no tiene ningún caso de `group_class` conviviendo con otro servicio en la misma agenda

**File:** `test/concurrency.test.ts` (suite completa), `test/capacity-mode-change-gate.test.ts`

**Issue:** La suite cubre exhaustivamente los ejes viejos (simultáneo↔otro servicio en CR-02/CR2-01,
simultáneo↔espacio en gap 3, grupal↔grupal en `no-drift`, grupal bajo carrera en CUPO-07 d) y el eje
nuevo de la fuente del cupo (CUPO-07 a/b/c). Falta exactamente la casilla que la fase acaba de
volver alcanzable: **`group_class` cupo N contra un turno de OTRO servicio de cupo 1 en la misma
agenda**, y **`group_class` cupo N sobre una agenda con espacio mapeado**. Son los dos escenarios de
CR-01 y CR-03, y por eso la fase pasó verde con ellos abiertos. `no-drift — dos servicios que
DECLARAN cupo >= 2` (`:947`) es la mitad del cuadrante; su complemento no existe.

**Fix:** agregar dos casos al mismo archivo, con assert DURO contra el estado real de la base (molde
`occupantsOfBucketCovering`):

```ts
it('grupal vs individual — un grupal NO se puede montar sobre un turno individual de la misma agenda', async () => {
  await seedTimeBlock(t)
  const individual = await seedService(t, { name: '__test_svc_ind_vs_grupal' })
  expect((await createAppointmentCore({ ...baseInput(), serviceId: individual, time: '16:00' })).ok).toBe(true)
  await seedGroupClassService(t, { capacity: 3 })
  const grupal = await createAppointmentCore({ ...baseInput(), time: '16:00' })
  expect(grupal.ok).toBe(false)                        // hoy devuelve ok:true
  expect(await occupantsOfBucketCovering('16:10')).toBe(1)
})

it('grupal + espacio mapeado — configuración imposible rechazada de entrada', async () => {
  await seedTimeBlock(t)
  await seedGroupClassService(t, { capacity: 3 })
  const spaceA = await seedSpace(t, { name: 'A' })
  await seedAgendaSpace(t, { professionalId: t.professionalId, spaceId: spaceA })
  const res = await createAppointmentCore({ ...baseInput(), time: '16:00' })
  expect(res.ok).toBe(false)                           // hoy la 1ª entra y la 2ª muere con 23P01
})
```

---

## Info

### IN-01: `seedTimeBlock(t, { capacity: 1 })` quedó como fixture decorativo en ~8 casos

**File:** `test/concurrency.test.ts:189, 474, 512, 566, 601, 680, 741, 813, 902, 1008, 1029, 1071, 1112`

**Issue:** Después de la 068 el `capacity` del bloque no decide nada, y el helper lo declara
explícitamente como "CONTROL NEGATIVO" (`booking-fixtures.ts:99-102`). Los casos que conservan
`{ capacity: 1 }` no están ejerciendo ningún control negativo (1 es el default) y leen como si el
número importara — justo lo contrario de los dos casos donde SÍ importa (`CUPO-07 b/c`, con `capacity:
3`, que llevan el aviso escrito). Ruido que va a confundir al próximo lector.

**Fix:** dejar `seedTimeBlock(t)` a secas donde el número no discrimina nada, y conservar el
argumento explícito sólo en los casos que mienten a propósito.

### IN-02: El gate ignora el filtro de tenant cuando `services.business_id` es NULL

**File:** `supabase/migrations/068_service_capacity_unified_and_mode_gate.sql:271`

**Issue:** `AND (OLD."business_id" IS NULL OR a."business_id" = OLD."business_id")` — para un
servicio legacy sin `business_id`, el `EXISTS` corre sin filtro de tenant y escanea `appointments` de
todos los negocios buscando ese `service_id`. En la práctica no puede haber turnos de otro tenant
apuntando a ese servicio y el mensaje de error es fijo (no hay fuga), pero el patrón es el mismo que
el repo evita en todas las demás queries del `SECURITY DEFINER`. Se hereda de la 065, así que
cambiarlo acá solo sería incoherente.

**Fix (futuro, cuando se limpie `services.business_id` a NOT NULL):** eliminar la rama y dejar el
filtro incondicional `a."business_id" = OLD."business_id"`.

---

_Reviewed: 2026-08-16_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

---

## Ronda de fixes — 2026-08-16 (`--fix`, alcance críticos + warnings)

8 commits (`3106b82`..`7ad17c2`). **Los 3 blockers y los 6 warnings, aplicados.** Gates verificados de
forma independiente por el orquestador: `./node_modules/.bin/tsc --noEmit` exit **0** · `npm run build`
exit **0** · **105/105** en 13 suites de booking · `concurrency` pasó de 24/24 a **28/28**.

### ⚠ La dirección que este review proponía para CR-01 era INCORRECTA, y se midió antes de aplicarla

El review pedía reemplazar `capacity_mode = 'simultaneous_resource'` por `s2.capacity >= 2` en el gate
espejo. **Eso reabre lo que cerró la 064.** Con el CHECK de coherencia de la 068,
`capacity >= 2` ⟺ `capacity_mode <> 'individual'`, así que un **recurso simultáneo también lo cumple**:
un allow-list por cupo lo dejaría exento del gate y una clase grupal se montaría encima de la camilla.

Control ejecutado **antes** de escribir el fix, contra el Postgres local:

```
CONTROL 1 (pre-fix, 068 vigente):
  CTRL1-a simultaneo 11:00 -> OK
  CTRL1-b grupal     11:10 -> ERROR [P0001] slot_taken   ← HOY está protegido
```

El recorte de D-07 es **nominal, no numérico**: lo legal es *grupal ↔ grupal*. El predicado que se
shippeó exige **las dos cosas** — `capacity_mode = 'group_class' AND capacity >= 2` — más
`(a.is_group = true OR v_svc_cap > 1)` para no robarle el rechazo `23P01` al EXCLUDE 013 en
individual ↔ individual.

En **CR-02 y CR-03** la dirección del review sí era correcta y fue tal cual (`capacity > 1`, sin modo).

### Hallazgo adicional del mismo mecanismo, no listado acá

**El eje inverso también estaba abierto:** un turno **individual** se montaba sobre una clase grupal ya
reservada (`CTRL4-b individual 14:10 -> OK` pre-fix). El re-check JS y el read-path ya lo bloqueaban —
**la base era la única capa que decía que sí**. Cerrado en el mismo predicado.

### Repro por blocker (Postgres LOCAL, transacción + `ROLLBACK`)

| | ANTES | DESPUÉS |
|---|---|---|
| **CR-01** | 3 filas pisándose (10:00 individual seat 0 · 10:00 grupal seat 1 · 10:15 grupal), sin un solo error | `CR01-b` y `CR01-c` → `P0001 slot_taken`; queda **1 fila** |
| **CR-02** | 2 inscripciones en **agendas distintas** + la 3ª con `slot_taken`, con 3 lugares declarados | rechazo de aplicación: `any_professional_unsupported` / 400; verificado que **falla** contra el read-path viejo (`expected 200 to be 400`) |
| **CR-03** | `CR03-1 OK` · `CR03-2` → `23P01` (un `slot_taken` mentiroso) | las dos → `P0001 simultaneous_space_conflict` (fail-closed) |

**5 controles negativos, idénticos antes y después:** simultáneo↔grupal rechaza · grupal↔grupal entra
(incluido escalonado) · individual↔individual sigue muriendo con `23P01` del gist · individual +
espacio mapeado **entra** (cero regresión canchas/F11).

**A/B de los tests nuevos:** con la 068 re-aplicada al local, los 3 casos que dependen de la base
**fallan** (`3 failed | 25 passed`). Un test que nunca se vio fallar no prueba nada.

### Warnings

| ID | Estado |
|---|---|
| WR-01 | **Aplicado** — no en la 068 (está en prod): la **069 abre `BEGIN;`/`COMMIT;` explícito** y el runbook dice la verdad sobre la atomicidad de la 068, que dependía del cliente |
| WR-02 | **Aplicado como pre-flight del runbook, NO como `UPDATE` en la 069** — un backfill correctivo sería **código muerto**: la 068 ya está aplicada y su `ADD CONSTRAINT` habría abortado si existiera un `simultaneous_resource` de cupo 1 |
| WR-03 | Aplicado — `MAX_CAPACITY = 99` + `max` en el input |
| WR-04 | Aplicado |
| WR-05 | Aplicado — el assert tautológico pasó a un invariante que **puede** fallar |
| WR-06 | Aplicado — 4 casos nuevos en `concurrency.test.ts`, con assert duro contra el estado real de la base |

### Dos snippets más de este review que resultaron incorrectos

1. **`rejectEarly = takenByOtherService` para el camino grupal rompe el caso legal grupal↔grupal**
   (haría fallar `no-drift (b)`). El core resuelve los modos de los otros servicios presentes con una
   query extra y solo bloquea contra servicios que **no** comparten cupo.
2. **El gate del selector público no puede leer `capacity`:** la vista `public_services` expone
   `capacity_mode` pero **no** el número (D-06 — el público nunca recibe cupos). Leerlo daría
   `undefined` siempre y el gate no filtraría nada. Ahí el criterio va por modo, que con el CHECK de la
   068 es equivalente.

### Abierto a propósito

- **La 069 NO está aplicada en producción.** Solo en el Postgres local. Prod sigue en la 068.
- **CR-02 se cierra rechazando, no soportando.** Una clase grupal con 2+ profesionales capaces ya no
  ofrece "Cualquiera". Soportarlo exige hacer capacity-aware la selección de candidatos del RPC — es un
  cambio de comportamiento, no una corrección.
- **Un grupal sigue aceptando inscripciones del mismo servicio a horas de inicio distintas** (10:00 y
  10:15), lo que contradice "todos arrancan a la misma hora". No es alcanzable desde la grilla pública
  (los start-times van a paso = duración). Anotado en el header de la 069.
- **IN-01 e IN-02** quedaron fuera del alcance de `--fix` sin `--all`.
