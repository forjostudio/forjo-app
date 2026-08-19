---
phase: 16-correcciones-del-gate
reviewed: 2026-08-19T02:13:25Z
depth: standard
files_reviewed: 7
files_reviewed_list:
  - supabase/migrations/070_service_gates_direction_and_time_precision.sql
  - supabase/schema.sql
  - test/capacity-mode-change-gate.test.ts
  - test/service-delete-gate.test.ts
  - test/helpers/booking-fixtures.ts
  - lib/appointment-time.ts
  - lib/types.ts
findings:
  critical: 2
  warning: 5
  info: 4
  total: 11
status: issues_found
---

# Phase 16: Code Review Report

**Reviewed:** 2026-08-19T02:13:25Z
**Depth:** standard
**Files Reviewed:** 7
**Status:** issues_found

## Summary

Se revisó la migración 070 (los dos gates de `services` redefinidos en una pasada), su espejo en
`supabase/schema.sql`, las dos suites de test reescritas, el helper de fixtures y los dos archivos
comment-only. La revisión se hizo contra el Postgres LOCAL con la 070 ya aplicada: todo lo que se
afirma acá abajo como REPRODUCIDO se corrió dentro de transacciones con `ROLLBACK` (no quedó nada
sembrado), incluyendo dos experimentos de MUTACIÓN (`CREATE OR REPLACE` de la función adentro de la
transacción) para medir si un test todavía discrimina.

Lo que está bien y quedó verificado, para no repetirlo abajo:

- **El espejo de `schema.sql` es fiel.** Comparé los dos cuerpos normalizados (sin comentarios, sin
  espacios) contra el archivo de la migración: las únicas diferencias son comillas y whitespace
  (`"plpgsql"` vs `plpgsql`, `SET "search_path" TO 'public'` vs `SET search_path = public`). Cero
  drift semántico. Y los cuerpos INSTALADOS (`pg_get_functiondef`) coinciden byte a byte con el
  archivo.
- **Los triggers siguen bindeados** (`services_block_delete_trg` BEFORE DELETE,
  `services_block_mode_change_trg` BEFORE UPDATE OF capacity_mode). El `CREATE OR REPLACE` puro
  cumplió lo que el header promete.
- **Los dos archivos comment-only lo son de verdad** (`git diff` sobre `lib/appointment-time.ts` y
  `lib/types.ts`: sólo comentarios), y lo que ahora afirman es cierto de la 070 instalada.
- **La mitad "numérica" del argumento de GATE-01 es CIERTA y la medí:** tras `individual →
  group_class` (cupo 2) con un turno preexistente nacido del motor, la 2ª inscripción en el mismo
  horario entra con `seat = 1` y la 3ª muere con `slot_full`. El turno viejo SÍ cuenta contra el cupo
  nuevo (ver IN-03: eso no lo prueba ningún test de la fase).
- **La suite corre verde hoy:** `npx vitest run test/capacity-mode-change-gate.test.ts
  test/service-delete-gate.test.ts` → 27 passed | 1 expected fail.

Dicho eso, la fase NO está lista para aplicar a producción. Hay **dos hallazgos críticos**: uno es un
agujero de integridad NUEVO que abre GATE-03 (reproducido punta a punta: cambio de modo aceptado con
una clase EN CURSO + reserva superpuesta aceptada por `book_slot_atomic`), y el otro es que la mitad
visible de GATE-03 —el gate de BORRADO— **no llega al panel**: el pre-check del modal sigue
comparando sólo la fecha, así que el dueño va a seguir viendo el borrado bloqueado exactamente en el
caso que esta fase dice arreglar. La 070 todavía no está en prod, así que los dos se pueden cerrar
antes de aplicarla.

---

## Critical Issues

### CR-01: GATE-03 mide contra el INICIO del turno, así que un turno EN CURSO cuenta como pasado — y el gate de modo suelta una fila `is_group = true` viva (R-1)

**File:** `supabase/migrations/070_service_gates_direction_and_time_precision.sql:344` (y `:233` en el
gate de borrado) · premisa afectada: header líneas 92-97 y 111-114 (T-16-05)
**Estado:** **REPRODUCIDO** contra el Postgres local (transacción + `ROLLBACK`).

**Issue:**
El predicado nuevo compara `a."time" >= v_now_time`, o sea el INICIO del turno. Un turno que YA
EMPEZÓ pero TODAVÍA NO TERMINÓ (una clase de 4 h que arrancó hace 1 h, un turno largo, una cancha
alquilada por bloque) queda del lado "pasado" del corte y deja de contar en los dos gates. Para el
gate de BORRADO eso es discutible (IN-02). Para el gate de MODO es exactamente el agujero que el gate
existe para tapar:

1. Servicio `group_class` cupo 2, con una clase EN CURSO (`is_group = true`, `confirmed`).
2. `UPDATE services SET capacity_mode='individual', capacity=1` → **la 070 lo ACEPTA** (la 069 lo
   rechazaba: medí los dos predicados sobre la misma fila → 069 = `true`, 070 = `false`, turno
   todavía en curso = `true`).
3. El servicio ahora es `individual`, pero le queda una fila VIVA con `is_group = true`, o sea FUERA
   del EXCLUDE gist 013 y fuera del gate espejo (que filtra por `service_id IS DISTINCT FROM`).
4. `book_slot_atomic` para ese mismo servicio/agenda a `now + 30 min` —dentro de la ventana todavía
   viva de la clase— **inserta sin un solo error**. Contraprueba en la misma corrida: un segundo
   turno que pisa al PRIMER intruso (dos filas `is_group = false`) sí rebota con `23P01`, lo que
   demuestra que el invariante normalmente se cumple y que lo único que lo rompe es la fila huérfana
   que dejó el cambio de modo.

Salida real de la reproducción:

```
 predicado_069_bloquea | predicado_070_bloquea | turno_todavia_en_curso
-----------------------+-----------------------+------------------------
 t                     | f                     | t
UPDATE 1
 intruso1 | 19cbfa6d-… (INSERTADO — pisa la clase en curso)
 intruso2 | ERROR: conflicting key value violates exclusion constraint "appointments_no_overlap"
```

La premisa con la que el threat model despachó T-16-05 —"es un horario que YA PASÓ, no afecta la
disponibilidad futura"— **es falsa para un turno en curso**: el tramo que le queda por delante SÍ es
futuro y SÍ es reservable. Es la misma clase de premisa falsa que la fase ya tuvo que corregir en el
commit `b61b5d0` sobre las superficies anónimas.

**Alcance / alcanzabilidad (dicho sin inflar):** las dos superficies normales de alta
(`app/api/booking/create` y `app/api/appointments/create`) pasan por `createAppointmentCore`, y su
re-check JS (`taken = sameBucket.some(isAlive)`, cupo 1) sí frena al intruso — el rechazo llega como
`slot_taken`. O sea: **lo que se pierde es la garantía en la BASE**, que es justamente donde la 064 y
la 068 decidieron ponerla porque el cliente no es autoridad. Con `book_slot_atomic` ejecutable por
`anon` (pre-existente, ya trackeado) el camino directo al RPC existe hoy y produce el doble-booking
real que se ve arriba. Esto no es re-reportar ese todo: es una consecuencia NUEVA suya que la 070
crea.

**Fix (MEDIDO, no hipótesis):** en `services_block_mode_change` —y sólo ahí— el criterio de "futuro"
tiene que ser "el turno todavía NO TERMINÓ", que es la pregunta que este gate hace de verdad
(`¿queda alguna fila cuyo is_group quedaría desalineado?`). El argumento de paridad con
`isPastAppointment` aplica al gate de BORRADO (que espeja la pantalla del dueño), no a éste:

```sql
DECLARE
  v_now timestamp := (now() AT TIME ZONE 'America/Argentina/Buenos_Aires');
...
  AND (a."date" + a."time" + make_interval(mins => COALESCE(a."duration_minutes", 30))) > v_now
```

Corrí esa versión contra el local, en transacción, sobre los tres escenarios que importan:

| caso | esperado | resultado |
|---|---|---|
| clase EN CURSO (arrancó hace 1 h, dura 4 h) | RECHAZA | `service_mode_has_future_appointments` ✅ |
| caso 13 del test (hoy 00:00, 30′, ya terminó) | PASA | `capacity_mode = individual` ✅ |
| caso 14 del test (hoy 23:59) | RECHAZA | `service_mode_has_future_appointments` ✅ |

O sea: cierra el agujero **sin** romper ninguno de los dos casos nuevos de GATE-03. Si en cambio se
decide aceptar el riesgo, hay que reescribir T-16-05 con la premisa verdadera ("un turno en curso
queda huérfano de guards en la base durante lo que le resta") y que la decisión la tome el dueño —
pero no se puede aplicar a prod con la justificación actual, porque dice algo que está medido como
falso.

---

### CR-02: GATE-03 no llega al panel — el pre-check del modal de borrado sigue comparando sólo la fecha, y su comentario afirma ser "el equivalente EXACTO del trigger"

**File:** `app/(dashboard)/settings/settings-client.tsx:603` (mirror del gate cambiado en
`supabase/migrations/070_...sql:233`)
**Estado:** **REPRODUCIDO** (query del pre-check + `DELETE` real, misma fila, misma transacción).

**Issue:**
El header de la 070 dice: "esta fase no toca una sola línea de `.tsx`", y la razón que da es que los
CÓDIGOS de dominio y la copy no cambian. Eso es cierto para GATE-01 y GATE-02. **No es cierto para
GATE-03**, porque el gate de borrado tiene un espejo de lectura en el cliente que la migración dejó
atrás:

```ts
// settings-client.tsx:591-603
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
...
  .gte('date', today).or('status.is.null,and(status.neq.cancelled,status.neq.completed)')
```

`delBlocked = delInfo.future > 0 || delInfo.activeAbono` deshabilita el botón "Eliminar". Con un
servicio cuyo ÚNICO turno vivo es de HOY a una hora ya pasada:

```
 pre_check_del_modal (delBlocked si >0)
----------------------------------------
                                      1      ← el modal bloquea y dice "tiene 1 turno futuro"
DELETE 1                                     ← la base con la 070 SÍ lo deja borrar
```

Consecuencias:

1. **El fix no se ve.** El escenario exacto que GATE-03 vino a arreglar (gap G4: el turno se ve en
   "Pasados" pero traba el borrado) **sigue igual desde el panel**. La única superficie por la que el
   dueño borra un servicio es este modal. La 070 se aplica a prod y el dueño no nota ninguna
   diferencia en el borrado.
2. **El pre-check ahora miente al revés.** Los comentarios de esas líneas afirman que el `.or(...)`
   es "el equivalente EXACTO en PostgREST del predicado del trigger". Desde la 070 es falso: le falta
   la mitad horaria. Ese comentario es exactamente la clase de afirmación que el repo usa como
   contrato, y queda inválido.
3. Los tests no lo pueden agarrar: las dos suites hacen `DELETE`/`PATCH` directo por PostgREST y
   nunca pasan por el modal, así que el drift es invisible para el pipeline (es el mismo patrón de
   "UAT real > pipeline verde" que ya está registrado en el proyecto).

**Fix:** alinear el pre-check con el predicado nuevo. Trae la hora AR con la MISMA fuente que ya usa
el resto de la app (`nowInAR`, que es la fuente de verdad declarada en `lib/appointment-time.ts`) y
partí el filtro en dos ramas, igual que el SQL:

```ts
import { nowInAR } from '@/lib/appointment-time'
...
const { date: today, time: nowTime } = nowInAR()
supabase.from('appointments').select('date, time', { count: 'exact' })
  .eq('business_id', business.id).eq('service_id', s.id)
  // date > hoy  OR  (date = hoy AND time >= ahora)  — espejo exacto de la 070
  .or(`date.gt.${today},and(date.eq.${today},time.gte.${nowTime})`)
  .or('status.is.null,and(status.neq.cancelled,status.neq.completed)')
  .order('date').limit(1)
```

⚠ Dos avisos sobre ese snippet, para que no se aplique a ciegas: (a) **hay que correrlo** — dos
`.or()` encadenados en PostgREST se combinan con AND entre sí, pero conviene verificar el count
contra la base antes de darlo por bueno (yo NO lo ejecuté: es una propuesta, no una medición); (b) si
se toma el camino de CR-01 y el gate de modo pasa a comparar contra el FIN del turno, el gate de
BORRADO sigue comparando contra el inicio, así que este espejo tiene que seguir al de borrado y no al
de modo. Alternativa igual de válida: revertir GATE-03 en el gate de borrado (dejarlo en `date >=
v_today`) y quedarse sólo con GATE-01/02 — pero entonces hay que sacar el caso 12 del test de borrado
y corregir el comentario de `lib/appointment-time.ts`, que hoy afirma que los DOS gates cerraron la
divergencia.

---

## Warnings

### WR-01: el caso 5 de `capacity-mode-change-gate` dejó de detectar lo que dice detectar (mutation-tested)

**File:** `test/capacity-mode-change-gate.test.ts:291-315`
**Estado:** **REPRODUCIDO** por mutación (gate sin el guard de no-cambio, en transacción + `ROLLBACK`).

**Issue:**
El caso 5 existe para proteger el guard `IS NOT DISTINCT FROM` — el que evita que renombrar un
servicio con turnos futuros rebote y rompa la pantalla de servicios (es la regresión que el review de
la 067 casi mete en prod, y el propio comentario del caso lo dice). Pero el caso siembra el servicio
con `seedService`, que nace **`individual`**. Con la 070, si alguien borra el guard de no-cambio, el
**guard de dirección** (`OLD.capacity_mode = 'individual' → RETURN NEW`) devuelve igual y el caso
sigue verde:

```
 caso5 con el gate MUTADO |          name          | capacity_mode
--------------------------+------------------------+---------------
                          | __rev_caso5_renombrado | individual      ← pasó sin el guard
```

El mismo rename sobre un servicio `group_class` con el gate mutado sí rebota con
`service_mode_has_future_appointments`, que es lo que el caso debería estar midiendo.

Es exactamente el problema que la fase SÍ detectó y corrigió en los casos 1, 2 y 3 (ver sus
comentarios "⚠ QUÉ CAMBIÓ EN LA 070"): al caso 5 se le pasó.

**Fix:** re-anclar el caso 5 a una dirección donde el guard de no-cambio sea lo único que lo salve,
igual que los casos 1/2/3:

```ts
const svc = await seedService(t, { name: '__test_svc_mode_gate_5' })
await seedGroupClassService(t, { capacity: 2, serviceId: svc })   // ← modo de ORIGEN peligroso
await seedAppointment(t, { serviceId: svc, date: FUTURE, time: '11:00', status: 'confirmed' })
...
const rename = await patchService(t.admin, svc, t.businessId, {
  name: nuevoNombre, capacity_mode: 'group_class', capacity: 2,   // mismo valor que ya tenía
})
```

(y ajustar la aserción final a `capacity_mode === 'group_class'`). Con eso, borrar el guard vuelve a
poner el caso en rojo.

---

### WR-02: GATE-02 crea un callejón sin salida en el panel — un turno FUTURO `completed` bloquea el cambio de modo y el dueño no tiene botón para destrabarlo

**File:** `supabase/migrations/070_...sql:345` + `app/(dashboard)/appointments/appointments-client.tsx:72-95`
+ copy en `app/(dashboard)/settings/settings-client.tsx:755`
**Estado:** **REPRODUCIDO** a medias (el rechazo lo prueba el caso 12 de la suite, que corrí verde);
la ausencia de salida en la UI es lectura de código, no ejecución.

**Issue:**
GATE-02 hace que un turno FUTURO en estado `completed` bloquee el cambio de modo (correcto: cierra
R-15-A). Pero el panel no le deja al dueño ninguna forma de sacarse esa fila de encima:

```ts
// appointments-client.tsx:72
const isActive = !['cancelled', 'completed'].includes(appt.status)
// cancelar: sólo si isActive  → un completed NO tiene botón de cancelar
// eliminar: sólo si status === 'cancelled' || 'pending_payment' → tampoco tiene borrar
// confirmar: sólo si status === 'pending' → no hay vuelta atrás desde completed
```

Y no hay reprogramación de turnos en el panel (busqué: no existe). O sea que la copy del rechazo —
*"tiene turnos futuros reservados. **Cancelalos** o esperá a que pasen"* — le ofrece al dueño una
salida que, para esta fila puntual, **no existe en la interfaz**. El servicio queda con el modo
congelado hasta que la fecha del turno pase, que pueden ser meses.

El header de la 070 afirma que "el copy actual sigue siendo CIERTO después del recorte". Eso se
evaluó para el recorte por dirección (GATE-01) y es cierto ahí; para la AMPLIACIÓN de GATE-02 no se
evaluó, y ahí no lo es.

**Fix (elegir uno, es decisión de producto):**
- (a) permitir cancelar un turno `completed` **futuro** en `RowActions` (la condición pasa a
  `isActive || (appt.status === 'completed' && !isPastAppointment(appt, now))`) — es la salida que la
  copy ya promete y no toca el gate; o
- (b) dejar la base como está y corregir la copy del toast para el caso, algo del tipo *"…tiene
  turnos futuros. Cancelalos (o, si lo marcaste como completado, desmarcalo) y volvé a intentar"*,
  con el botón que lo haga posible.

No proponer "sacar `completed` del gate": eso reabre R-15-A, que es literalmente lo que la fase vino
a cerrar.

---

### WR-03: los helpers de modo no verifican que el UPDATE haya tocado una fila — un `serviceId` equivocado degrada un caso a verde vacío

**File:** `test/helpers/booking-fixtures.ts:273-280` (y su gemelo `seedGroupClassService:298-305`)
**Estado:** RAZONADO, con la evidencia adentro del propio repo (no lo ejecuté aparte).

**Issue:**
El parámetro nuevo `serviceId` es compatible hacia atrás (todos los llamadores actuales pasan sólo
`{ capacity }` y el `??` los deja en `seeded.serviceId`) — eso está bien. El problema es lo que pasa
cuando el `serviceId` es equivocado (typo, id de OTRO tenant, id de un service ya borrado por un
`afterEach`): el UPDATE matchea **0 filas**, PostgREST responde sin error, `upd.error` es `null` y el
helper **no tira**. El propio caso 6 de la suite de modo asierta esa semántica de PostgREST
(`cross.error` es `null` con `data.length === 0`), así que no es una hipótesis sobre la librería.

La consecuencia concreta: el service se queda en `individual` y el caso mide la dirección SEGURA en
vez de la peligrosa. En los casos que asiertan RECHAZO eso falla ruidosamente (bien), pero en el
**caso 13** (que asierta que el cambio PASA) el fixture roto lo deja verde por el motivo equivocado:
el PATCH a `individual` sobre un service que ya es `individual` sale por el guard de no-cambio y las
aserciones (`error === null`, `modeOf == individual/1`) se cumplen igual. Un caso que valida GATE-03
puede quedar vacío sin que nadie se entere.

**Fix:** que los dos helpers exijan la fila, igual que hace `patchService` en la suite:

```ts
const upd = await seeded.admin
  .from('services')
  .update({ capacity_mode: 'simultaneous_resource', capacity: opts.capacity })
  .eq('id', opts.serviceId ?? seeded.serviceId)
  .eq('business_id', seeded.businessId)
  .select('id')
if (upd.error) throw new Error(`seed: update service simultáneo falló: ${upd.error.message}`)
if ((upd.data ?? []).length !== 1) throw new Error('seed: el service simultáneo no existe en este tenant (0 filas)')
```

---

### WR-04: el guard de medianoche tira en `beforeAll` y voltea las 28 pruebas de los dos archivos entre las 23:30 y la 01:00 AR, todos los días

**File:** `test/capacity-mode-change-gate.test.ts:119-131` y `test/service-delete-gate.test.ts:35-47`
**Estado:** RAZONADO (aritmética del guard). Nota: la review corrió a las **23:09 AR** — 21 minutos
antes de que el guard empiece a tirar.

**Issue:**
La decisión de tirar en vez de skipear está argumentada y el argumento es bueno (un skip silencioso
esconde el agujero justo en la franja donde el bug de zona es más probable). El costo, en cambio, no
está evaluado: el `throw` vive en el `beforeAll`, así que se lleva puesto **el describe entero** — las
24 pruebas que NO dependen del reloj (aislamiento por tenant, CHECK de coherencia, matriz de
direcciones, GATE-02, cascada, historial) se caen junto con las 4 que sí. Una hora y media de rojo
garantizado por día, en un repo que ya tiene `vitest` en CI. El primero que lo vea en rojo a las
23:40 no va a leer el mensaje del guard: va a asumir que la 070 rompió algo.

**Fix (dos opciones, ninguna pierde determinismo):**
- (a) derivar las dos horas de `AR_NOW` en vez de fijarlas, y quedarse con el guard SÓLO para el
  vuelco de día:
  ```ts
  const PAST_TIME_TODAY   = shiftAR(AR_NOW.time, -10) // 'HH:mm:ss'
  const FUTURE_TIME_TODAY = shiftAR(AR_NOW.time, +10)
  // guard reducido: sólo [00:10, 23:50], donde el ±10' cruza de día
  ```
- (b) mantener las constantes fijas y bajar el guard de `beforeAll` a los 4 casos afectados
  (`it.skipIf(fueraDeVentana)`), + un caso siempre activo que FALLE si la ventana se saltea, para no
  perder la señal de cobertura que motivó el `throw`.

---

### WR-05: el gate de modo no tiene guard de abono activo — GATE-01 habilita pasar a grupal un servicio con abonos vivos, y las ocurrencias futuras se saltean en silencio

**File:** `supabase/migrations/070_...sql:307` (guard de dirección) vs `:247-255` (el guard de abono
que SÍ tiene el gate de borrado)
**Estado:** RAZONADO sobre código medido parcialmente (verifiqué que el gate de modo no consulta
`abonos` y que `abono-generation` saltea ante conflicto; no corrí el escenario completo).

**Issue:**
El gate de BORRADO trata explícitamente al abono activo como "turnos futuros" y lo bloquea, con este
razonamiento escrito en la 065: *"Un abono activo genera turnos hacia adelante: cuenta como turnos
futuros"*. El gate de MODO nunca tuvo ese bloque, y hasta la 069 no lo necesitaba: una serie activa
casi siempre tiene turnos futuros materializados, así que el predicado de turnos la frenaba de
rebote. **GATE-01 saca esa protección incidental para la dirección `individual → grupal/simultáneo`**
(la más probable: es la que el dueño quiere usar).

Post-cambio, las ocurrencias que la serie genere sobre el nuevo modo compiten por cupo con el resto,
y `lib/abono-generation.ts:212-225` ante `slot_full`/`slot_taken` **saltea la ocurrencia y sigue** —
el abonado pierde turnos sin que nadie se lo diga.

**Fix:** replicar el bloque de abono del gate de borrado dentro del guard de dirección, ANTES del
`RETURN NEW` (o sea: salir de `individual` es seguro para los turnos ya creados, pero no para una
serie que va a seguir creando):

```sql
IF OLD."capacity_mode" = 'individual' THEN
  IF EXISTS (SELECT 1 FROM abonos ab
              WHERE ab."service_id" = OLD."id"
                AND (OLD."business_id" IS NULL OR ab."business_id" = OLD."business_id")
                AND ab."status" = 'active') THEN
    RAISE EXCEPTION 'service_mode_has_future_appointments' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END IF;
```

(Reusar el código de dominio existente, no inventar uno nuevo: el panel mapea por substring y la copy
—"tiene turnos futuros reservados"— sigue siendo razonable para el caso.) Si en cambio se decide que
esto es aceptable, tiene que quedar escrito como riesgo residual con nombre, no como silencio.

---

## Info

### IN-01: el caso 7 del gate de borrado dejó de discriminar después de las 15:00 AR

**File:** `test/service-delete-gate.test.ts:222-224`
**Estado:** **REPRODUCIDO** por evaluación del predicado contra el reloj real (23:12 AR).

El caso 7 ("un turno de HOY marcado `completed` NO bloquea") siembra el turno a las `15:00` de HOY.
Con GATE-03, después de las 15:00 AR esa fila queda fuera del `EXISTS` **por la rama de fecha/hora**,
así que el borrado pasa aunque el gate dejara de excluir `completed`:

```
    ahora_ar     | rama_fecha_070 | gate_mutado_bloquea
-----------------+----------------+---------------------
 23:12:58.887865 | f              | f
```

O sea: media jornada por día el caso es tautológico. La cobertura no se pierde (el caso 8, con fecha
FUTURE, sí discrimina), pero el caso dice medir algo que a esa hora no mide. Fix chico: mover el turno
a `FUTURE_TIME_TODAY` (que el guard ya garantiza no-llegado) para que la rama de fecha sea siempre
`true` y el único motivo de que pase sea el estado.

### IN-02: el gate de BORRADO también trata como pasado un turno EN CURSO

**File:** `supabase/migrations/070_...sql:233`
**Estado:** RAZONADO (misma raíz que CR-01, medida ahí).

Consecuencia: se puede borrar un servicio mientras se está prestando. El daño es acotado (la FK es
`ON DELETE SET NULL` y el snapshot de la 065 conserva `service_name`/`service_price`, así que la
factura y el historial sobreviven), y para el gate de borrado el argumento de paridad con
`isPastAppointment` sí aplica de verdad — este gate espeja la pantalla del dueño. Lo dejo como Info
porque merece una decisión EXPLÍCITA en el header, no porque sea inocuo: hoy el header no distingue
"empezó" de "terminó" en ninguno de los dos gates, y esa distinción es la que hace correcto a uno e
incorrecto al otro.

### IN-03: la mitad load-bearing del argumento de GATE-01 no la prueba ningún test

**File:** `test/capacity-mode-change-gate.test.ts:400-413` (caso 8) y
`test/helpers/booking-fixtures.ts` (seedAppointment local del archivo)
**Estado:** REPRODUCIDO por mi lado (el comportamiento es correcto), pero SIN cobertura en la suite.

El caso 8 dice: *"Sin esta aserción, 'la dirección es segura' sería un argumento; con ella es una
medición"*. En rigor mide menos de lo que dice:

- Los turnos de la matriz se insertan **directo** por service-role sin pasar `is_group`, así que
  nacen `false` por el **DEFAULT de la columna**, no por el motor. La aserción
  `isGroupOf(...) === false` antes y después del UPDATE no puede fallar salvo que alguien agregue un
  trigger que reescriba `is_group` (que es, sí, el "reparar en vez de bloquear" que D-03 descartó —
  el valor del caso es ése y sólo ése).
- La otra mitad del argumento —"y ADEMÁS se cuentan contra el cupo nuevo"— **no la toca ningún
  test**: ninguno reserva por `book_slot_atomic` después del cambio de modo. La verifiqué a mano y
  **está bien** (preexistente + 2ª inscripción entran; la 3ª muere con `slot_full`), pero hoy eso es
  un hecho no capturado: si alguien toca el conteo del RPC, la suite no se entera y el argumento con
  el que se abrió el gate se cae en silencio.

Fix sugerido: un caso que, tras `individual → group_class` cupo 2, llame al RPC dos veces y espere
`slot_full` en la segunda. Es el único test que convierte "la dirección es segura" en una medición.

### IN-04: nota de proceso — la 070 NO está en prod (prod = 069), así que CR-01 y CR-02 se pueden cerrar antes de aplicar

Es el escenario para el que sirve correr esta review ahora. Recomendación: **no aplicar la 070 a
producción** hasta resolver CR-01 (o re-disponer T-16-05 con la premisa corregida y que lo apruebe el
dueño) y CR-02 (o revertir GATE-03 del gate de borrado). GATE-01 y GATE-02 quedaron sólidos: el
recorte por dirección es correcto en las cuatro direcciones que medí, y el cierre de R-15-A funciona.

---

_Reviewed: 2026-08-19T02:13:25Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
