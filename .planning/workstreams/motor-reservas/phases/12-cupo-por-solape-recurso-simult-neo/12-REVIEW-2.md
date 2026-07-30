---
phase: 12-cupo-por-solape-recurso-simult-neo
reviewed: 2026-07-29T00:00:00Z
depth: deep
files_reviewed: 8
files_reviewed_list:
  - supabase/migrations/063_simultaneous_resource_hardening.sql
  - supabase/schema.sql
  - lib/booking-core.ts
  - app/api/booking/availability/route.ts
  - app/(dashboard)/agenda/agenda-client.tsx
  - app/(dashboard)/agenda/page.tsx
  - test/concurrency.test.ts
  - test/helpers/booking-fixtures.ts
findings:
  critical: 1
  warning: 4
  info: 3
  total: 8
status: issues_found
---

# Phase 12 — Code Review 2 (re-review de la ronda de fixes)

**Reviewed:** 2026-07-29
**Depth:** deep (`git diff f66f020..HEAD`, 4 commits)
**Files Reviewed:** 8
**Status:** issues_found

## Summary

Verificación fix por fix, contra el código y no contra el mensaje del commit:

| Finding | Veredicto | Evidencia |
|---|---|---|
| **CR-01** (holds vencidos consumían cupo) | **CERRADO** | Guarda `AND (a.status = 'confirmed' OR a.expires_at IS NULL OR a.expires_at > now())` agregada al count del carril (`063:293`, `schema.sql:287`), idéntica a la que ya usaba la selección "cualquiera" (`063:171`). Espejo en el panel (`agenda-client.tsx:495-502`) + `expires_at` en el select del server (`agenda/page.tsx:41`). El test CR-01 prueba el gate SQL de verdad: el hold vencido se siembra en OTRA agenda (`concurrency.test.ts:559-560`), que es el único lugar donde el core no lo libera. Residual: **WR-03**. |
| **CR-02** (doble-booking cross-servicio) | **PARCIALMENTE CERRADO → BLOCKER** | El gate existe, va PRIMERO, levanta `slot_taken` (no `slot_full`) y el bucket/holds/`business_id` son byte-consistentes con el resto del motor (`063:262-275`). El `IS DISTINCT FROM` trata `service_id IS NULL` como "otro servicio" (bloquea) y las tres capas coinciden en eso. Pero el gate es un `SELECT` sin serializar y **la rama `group_class` no tiene el gate espejo** ⇒ el mismo doble-booking sigue abierto bajo concurrencia con horarios escalonados. Ver **CR2-01**. |
| **CR-03** (lock ortogonal) | **CERRADO** | Orden real: servicio-día (solo simultáneo) → instante (SIEMPRE, los dos modos) → espacios ascendente (`063:134-139`, `063:207-217`). Tracé las ramas: no hay camino donde se tomen invertidos ni donde el de instante sea condicional. Cada transacción toma ≤1 lock de cada una de las dos primeras clases y los de espacio en orden ascendente ⇒ orden total fijo ⇒ deadlock-free. Verifiqué además que ningún caller acumula varios locks en UNA transacción: la generación forward del abono itera en JS (`lib/abono-generation.ts:196`), un RPC = una transacción. `group_class` toma exactamente el lock de 058 (`hashtextextended(business+date+time)`) y el resto de su bloque es idéntico al de 062 ⇒ cero drift. |
| **CR-04** (availability retornaba temprano) | **CERRADO con punto ciego** | Ya no retorna temprano: `full` = unión de carril del servicio ∪ agenda ocupada por otro servicio ∪ espacio compartido (`availability/route.ts:322-331`). Los solapes del PROPIO servicio quedan fuera del término cross-servicio (`:280-282`), así que la unión **no borra los lugares libres del recurso**: `laneFull` solo dispara con `n >= cap`. Contrato `{ ok, busy, full }` y `busy: []` intactos. Punto ciego: **WR-02**. |

Chequeos transversales que **pasan**: `schema.sql` refleja la función de 063 (comparé cuerpo a cuerpo, `schema.sql:104-353`); firma byte-idéntica (14 params + `RETURNS TABLE (id, cancel_token)`), `CREATE OR REPLACE` sin `DROP`; `public_services` sigue exponiendo `capacity_mode` y **no** `capacity` (`schema.sql:935-948`); todas las queries nuevas filtran por `business_id` (incluidas las dos de `agenda_spaces` del branch simultáneo); `tsc --noEmit` sale 0.

El problema serio es uno: la ronda arregló CR-02 en el eje secuencial y dejó el eje concurrente —que es el eje del subsistema— sin cubrir, y el test nuevo no puede detectarlo porque es secuencial.

## Critical Issues

### CR2-01: el gate de CR-02 no está serializado y la rama `group_class` no tiene el espejo → doble-booking cross-servicio bajo concurrencia

**File:** `supabase/migrations/063_simultaneous_resource_hardening.sql:262-275` (y la rama sin gate en `:321-352`); mismo código en `supabase/schema.sql:260-273` / `:309-340`

**Issue:**
El gate de CR-02 es un `IF EXISTS (SELECT ...)` puro. Bajo READ COMMITTED solo ve filas **committeadas**, y los locks que se toman no lo cubren:

- lock de servicio-día `hash(business+service_id+date)` → solo lo toma el modo simultáneo, y es **por servicio**;
- lock de instante `hash(business+date+time)` → solo serializa transacciones con el **mismo `p_time`**;
- locks de espacio → solo si la agenda tiene `agenda_spaces` mapeados (el caso normal de una camilla es sin espacios), y su `EXISTS` **excluye el propio bucket** (`063:232-233`), así que ni siquiera mira solapes de la misma agenda.

No existe ningún lock a nivel **agenda-día**. Resultado: dos reservas de **servicios distintos**, en la **misma agenda**, con horarios **escalonados** (el caso de uso central de la feature) no comparten ningún lock y ambas pasan el gate:

```
R1: "Consulta"  (group_class, cupo 1)      pro P, 2031-03-03 16:00-16:30
R2: "Camilla"   (simultaneous, capacity 2) pro P, 2031-03-03 16:10-16:40   ← concurrente

R1 toma  I=hash(B+date+'16:00')
R2 toma  A=hash(B+camilla+date)  +  I2=hash(B+date+'16:10')     → cero intersección
R2 corre el gate CR-02: no ve la fila de R1 (sin commitear) → pasa
R2 carril: 0 turnos de "camilla" < 2 → pasa;  v_seat=0;  is_group := (2>1) = true
Constraints: índice 011 (B,P,date,time,seat) → `time` distinto, no choca.
             EXCLUDE 013 → la fila de R2 es is_group=true ⇒ NO está en el índice parcial
                           (schema.sql:1069: `WHERE (... AND NOT is_group)`) ⇒ no choca.
Ambas commitean → dos turnos solapados en la agenda de P. Doble-booking.
```

El re-check JS **no** es defensa: es TOCTOU por diseño y está declarado "SOLO UX, la autoridad es el RPC" (`lib/booking-core.ts:129-134`); en el camino `anyProfessional=true` (flag controlado por el cliente, `app/api/booking/create/route.ts:38,173`) se saltea entero.

Y el eje inverso está **completamente** sin gate, incluso sin concurrencia en cuanto el bloque es grupal: la rama `group_class` (`063:321-352`) no chequea nada cross-servicio, y una fila `is_group = true` preexistente (camilla, cupo ≥ 2) es invisible para el EXCLUDE 013. Con un `time_blocks.capacity > 1` cubriendo el slot, reservar "Consulta" a las 16:10 encima de "Camilla" 16:00-16:30 en la misma agenda entra **secuencialmente** (el JS tampoco rechaza: `rejectEarly = taken && slotCapacity <= 1` → false). Con `capacity = 1` el JS lo tapa solo en el camino secuencial; bajo concurrencia vuelve a entrar.

Esto contradice el invariante que la propia función declara dos líneas arriba del gate: *"nunca se decide disponibilidad con un count suelto (TOCTOU)"* (`063:243-244`).

**Fix:**
Serializar el gate por **agenda-día** y agregar el espejo en la otra rama. Manteniendo el orden global (agenda-día es la clase más gruesa → va primero):

```sql
-- 1. Locks: agenda-día → servicio-día → instante → espacios (ascendente).
--    (063, CR2-01) El gate cross-servicio decide sobre TODA la agenda del día (horarios
--    escalonados ⇒ el lock de instante no lo cubre) y las filas is_group=true no están en
--    el EXCLUDE 013, así que sin este lock el gate es un count suelto (TOCTOU).
--    Se toma en LOS DOS modos: la carrera es cross-modo.
--    OJO: v_bucket todavía no está resuelto acá si el caller pidió "cualquiera"; para ese
--    caso keyear por el sentinel mágico NO sirve. Tomar el lock de agenda-día DESPUÉS de la
--    selección "cualquiera" y ANTES de cualquier gate, manteniendo el orden relativo
--    agenda-día → espacios (el de instante ya se tomó y no participa de este gate).
PERFORM pg_advisory_xact_lock(hashtextextended(
  p_business_id::text || v_bucket::text || p_date::text, 0));
```

y en la rama `group_class`, el gate espejo que hoy falta:

```sql
    -- (CR2-01) Espejo del gate de CR-02: una fila is_group=true (recurso simultáneo cupo>1)
    -- NO está en el EXCLUDE 013, así que un turno individual/grupal puede montarse encima.
    IF EXISTS (
      SELECT 1 FROM appointments a
      WHERE a.business_id = p_business_id
        AND COALESCE(a.professional_id, '00000000-0000-0000-0000-000000000000'::uuid) = v_bucket
        AND a.is_group = true
        AND a.service_id IS DISTINCT FROM p_service_id
        AND a.date = p_date
        AND a.status IN ('confirmed', 'pending_payment')
        AND (a.status = 'confirmed' OR a.expires_at IS NULL OR a.expires_at > now())
        AND tsrange(a.date + a.time, a.date + a.time + make_interval(mins => COALESCE(a.duration_minutes, 30)))
            && tsrange(p_date + p_time, p_date + p_time + make_interval(mins => p_duration))
    ) THEN
      RAISE EXCEPTION 'slot_taken' USING ERRCODE = 'P0001';
    END IF;
```

(La alternativa estructural —y más barata de razonar— es dejar de sacar la fila del EXCLUDE 013 y en cambio condicionar el índice parcial a algo que distinga "solape legal del propio recurso" de "solape cross-servicio". Requiere una migración de índice, decisión de diseño, no de review.)

Y el test que lo prueba, con el mismo warm-up obligatorio que ya usa CUPO-04 (`test/concurrency.test.ts:400-406`) porque sin él la carrera no ocurre:

```ts
it('CR2-01 — cross-servicio ESCALONADO concurrente: no puede haber 2 turnos solapados en la agenda', async () => {
  await seedTimeBlock(t, { capacity: 1 })
  const otro = await seedService(t, { durationMinutes: 30, name: '__test_svc_consulta_conc' })
  await seedSimultaneousService(t, { capacity: 2 })
  await Promise.all([1, 2, 3].map(() => t.admin.from('services').select('id').eq('id', t.serviceId)))
  const [r1, r2] = await Promise.all([
    createAppointmentCore({ ...baseInput(), serviceId: otro, time: '16:00' }),
    createAppointmentCore({ ...baseInput(), time: '16:10' }),
  ])
  // La agenda no puede quedar con dos turnos pisándose (uno de ellos is_group=true).
  expect(await occupantsOfBucketCovering('16:20')).toBe(1)
  expect([r1, r2].filter(r => r.ok).length).toBe(1)
})
```

## Warnings

### WR-01: los dos fixes más riesgosos (CR-03, CR-04) no tienen test, y el test de CR-02 es secuencial-only

**File:** `test/concurrency.test.ts:479-569`

**Issue:** La ronda agrega dos casos: CR-02 (`:498-540`) y CR-01 (`:553-569`). Ambos son secuenciales.

- **CR-03** —el cambio a dos advisory locks, lo más peligroso del diff— no tiene ni un test. La regresión que cerraba (una reserva simultánea y una grupal del **mismo instante** dejando de compartir lock ⇒ `v_seat` sin serializar ⇒ 23505 espurio) es directamente testeable y determinista: dos `Promise.all` con el mismo `time`, un servicio simultáneo y uno grupal, mismo bucket, asertando que ninguna vuelve con `insert_failed` y que los `seat` son distintos. Sin ese test, un futuro "optimicemos el lock" reabre CR-03 en silencio.
- **CR-04** tampoco tiene test, y es el más fácil de todos: `CUPOS-02` ya demuestra el patrón de invocar `availabilityGET` directo (`:229-287`). Un caso que siembre un turno de otro servicio en la agenda y asierte que su start-time aparece en `full` cuesta 15 líneas.
- El test de CR-02 asierta el gate SQL llamando al RPC directo (`:520-536`), que es lo correcto para cubrir `autoAssign`, pero **secuencialmente**: por construcción no puede detectar CR2-01. Nótese que el archivo ya sabe que la concurrencia necesita warm-up explícito o el test es falso verde (`:400-406`) y ese aprendizaje no se aplicó a los casos nuevos.

**Fix:** agregar (a) el test concurrente de CR2-01 propuesto arriba, (b) un test cross-modo del mismo instante para CR-03, (c) un caso de `availabilityGET` para CR-04 (`full` debe contener el start-time bloqueado por otro servicio en la agenda y por una agenda hermana, y **no** debe contener el start-time donde el recurso todavía tiene lugar).

### WR-02: el `full` del branch simultáneo se calcula solo sobre la grilla de `time_blocks` — con horario especial se pierde TODA la información de bloqueo

**File:** `app/api/booking/availability/route.ts:313-331`

**Issue:** `startSet` se enumera exclusivamente desde `capBlocks` (= `time_blocks` del `dow`). Como este branch devuelve `busy: []`, `full` es el **único** canal de bloqueo. El client, en cambio, arma su grilla desde `dayBlocks`, que puede venir de `schedule_exceptions` (`app/[slug]/booking-client.tsx:208-240`): un horario especial global **reemplaza** el día por un rango arbitrario.

Dos consecuencias:

1. **Ventana extendida** (bloques 08:00-20:00, excepción 21:00-23:00): los start-times 21:00/21:30 no existen en `startSet` ⇒ no pueden estar en `full` ⇒ el público ve libre un horario donde la agenda tiene un turno confirmado de otro servicio → reserva → `slot_taken` 409.
2. **Desalineación de grilla**: con `duration = 45` y excepción 10:00-14:00, el client genera 10:00 / 10:45 / 11:30…, mientras `startSet` genera 08:00 / 08:45 / 09:30 / 10:15… ⇒ ningún string coincide ⇒ `full` no filtra nada ese día.

El caveat está comentado (`:310-312`) heredado del branch `any`, pero ahí solo costaba ocultar un slot de cupo; acá CR-04 metió en el mismo canal la **ocupación real de la agenda** y el **espacio compartido**, que en el camino legacy viajaban por `busy` (per-turno, inmune a la grilla). Es decir: para un mismo negocio, pasar un servicio de `group_class` a `simultaneous_resource` **pierde** cobertura de lectura en los días con horario especial. El RPC sigue fail-closed (no hay doble-booking), pero es exactamente la mentira del read-path que CR-04 venía a matar.

**Fix:** emitir también, en el branch simultáneo, las entradas de bloqueo duro por-turno en `busy` (que son inmunes a la grilla), limitadas a lo que NO es cupo propio — `liveBucketOther` y `liveSiblings` ya están calculados y no filtran nada nuevo (misma forma `{time,status,expires_at,duration_minutes}` que una entrada normal, sin conteo):

```ts
const busySim = [...liveBucketOther, ...liveSiblings].map(a => ({
  time: a.time, status: a.status, expires_at: a.expires_at, duration_minutes: a.duration_minutes,
}))
// `full` sigue llevando SOLO el cupo del carril (laneFull): los solapes del propio servicio
// jamás pueden ir a `busy` (el client los trata como conflicto y borraría el 2º lugar).
return Response.json({ ok: true, busy: busySim, full: fullSim }, { headers: { 'Cache-Control': 'no-store' } })
```

Con esto `laneFull` queda en `full` (booleano por slot, sin leak) y la ocupación 1-a-la-vez vuelve a ser independiente de la grilla, igual que en el camino legacy.

### WR-03: `appointment_spaces_no_overlap` no exceptúa `is_group` → un recurso simultáneo cupo ≥ 2 en una agenda con espacio mapeado nunca puede ocupar el 2º lugar, y `availability` igual lo ofrece

**File:** `supabase/schema.sql:1058-1059` (constraint) + `app/api/booking/availability/route.ts:287-302` (read-path)

**Issue:** El EXCLUDE de `appointments` tiene el carve-out `AND NOT is_group` (`schema.sql:1069`), pero el de `appointment_spaces` **no tiene ninguno**:

```sql
ADD CONSTRAINT "appointment_spaces_no_overlap"
  EXCLUDE USING gist (business_id WITH =, space_id WITH =, slot WITH &&);
```

y el trigger `appointment_spaces_populate` (`schema.sql:79-98`) inserta una fila por espacio de la agenda para **todo** turno `confirmed`/`pending_payment`, sin mirar `is_group`. Repro: agenda P mapeada al espacio X, servicio simultáneo cupo 2. Reserva 16:00 → OK. Reserva 16:10 (misma agenda, mismo servicio, 2ª camilla) → el gate por solape pasa (1 < 2), el bloque de espacio pasa (excluye el propio bucket) y el INSERT dispara el trigger → `(X, [16:10,16:40))` choca con `(X, [16:00,16:30))` → **23P01 → `slot_taken`**. El modo queda silenciosamente roto para cualquier agenda con espacios.

Es pre-existente de 062 (no lo introdujo esta ronda), pero interactúa directo con CR-04: el branch simultáneo solo mira agendas **hermanas** (`.neq('professional_id', bucketSim)`, `:299`) y por eso publica esos slots como **libres** — el read-path promete algo que la base rechaza.

**Fix:** decidir explícitamente la semántica y dejarla en una sola capa. Si un recurso simultáneo puede compartir su espacio consigo mismo, el índice necesita el mismo carve-out que 013 (migración nueva, 064):

```sql
-- 064: el espacio de la PROPIA agenda no se auto-excluye para las filas de cupo (is_group),
-- igual que el EXCLUDE 013. La exclusión cross-agenda la sigue imponiendo el RPC (042).
ALTER TABLE appointment_spaces DROP CONSTRAINT appointment_spaces_no_overlap;
-- ...recrear con la columna/predicado que distinga la fila de cupo, o mover la exclusión
--    cross-agenda enteramente al RPC (que ya la hace) y quedarse sin el índice.
```

Si en cambio la decisión es "simultáneo y espacios son incompatibles", hay que gatearlo en el panel (no ofrecer `simultaneous_resource` para un servicio cuyas agendas tengan `agenda_spaces`) y reflejarlo en `availability`. Cualquiera de las dos, pero no el estado actual.

### WR-04: el roster del panel sigue contando holds vencidos — la misma mentira que CR-01 arregló en el badge de al lado

**File:** `app/(dashboard)/agenda/agenda-client.tsx:529-537` (filtro en `:534`)

**Issue:** `overlapFullById` ahora descarta holds vencidos (`:496-502`, el fix de CR-01), pero el `roster` del slot grupal —el contador "N/capacity" que abre el chip— filtra solo por `OCCUPYING_STATUSES.includes(a.status)` sin la guarda `expires_at`. Un `pending_payment` con la seña vencida sigue apareciendo como inscripto y sigue inflando el contador, así que el dueño lee "3/3" en un slot que `availability` ya está ofreciendo como libre (el read-path sí descarta vencidos, `availability/route.ts:350`). Es exactamente el defecto de CR-01, en el widget contiguo del mismo archivo, y ahora además inconsistente con su hermano recién arreglado.

**Fix:** reusar el mismo `isAlive` (extraerlo del `useMemo` a un helper de módulo para no duplicarlo):

```ts
const enrollees = initialAppointments
  .filter(a => a.date === date && a.time.slice(0, 5) === slotKey
    && OCCUPYING_STATUSES.includes(a.status) && isAliveAppt(a))
  .sort((a, b) => a.client_name.localeCompare(b.client_name))
```

## Info

### IN-01: `Date.now()` dentro de un `useMemo` de un componente cliente renderizado en el server

**File:** `app/(dashboard)/agenda/agenda-client.tsx:495`

**Issue:** El `useMemo` corre también en el render de servidor (SSR del client component) con un `Date.now()` distinto al de la hidratación. Si un hold expira en esa ventana, el badge "N/N lleno" difiere entre server y client → mismatch de hidratación. Además el valor queda congelado: el badge no se actualiza a medida que los holds vencen, hasta un re-render por otra causa.

**Fix:** capturar el instante en estado/efecto (`const [nowMs, setNowMs] = useState<number | null>(null)` + `useEffect(() => setNowMs(Date.now()), [])`) y tratar `null` como "sin filtrar" en el primer paint, o refrescarlo con un intervalo si el badge tiene que envejecer solo.

### IN-02: `anyProfessional` + servicio simultáneo hace inalcanzable el 2º lugar del recurso (falso `slot_taken`)

**File:** `supabase/migrations/063_simultaneous_resource_hardening.sql:164-176`

**Issue:** La query de candidatos exige que el profesional **no** tenga ningún turno vivo solapado, sin importar el modo del servicio. Para un recurso simultáneo con cupo 2 eso excluye a la kinesióloga en cuanto usó la 1ª camilla ⇒ "Cualquiera" devuelve `slot_taken` con el recurso a medio llenar. Hoy es inalcanzable por UI (D-13 oculta "Cualquiera" en simultáneo) pero **no** por API: `anyProfessional` viene del body del cliente (`app/api/booking/create/route.ts:38`). El comportamiento es fail-closed (rechaza, no sobre-reserva), así que no es un defecto de seguridad — pero es una mina para el follow-up del flag por servicio.

**Fix:** cuando `v_mode = 'simultaneous_resource'`, el `NOT EXISTS` de libertad debería excluir del cómputo los turnos del **propio** `p_service_id` (el cupo se gatea después) y quedarse solo con los cross-servicio, alineado con el gate de CR-02.

### IN-03: el espejo JS de CR-02 usa solape con buffer, el gate SQL usa `tsrange` crudo

**File:** `lib/booking-core.ts:228` (con `overlaps` de `:168-172`)

**Issue:** `takenByOtherService` hereda el `overlaps` ensanchado por `buffer_minutes`, mientras el gate autoritativo compara intervalos crudos (`063:270-271`). El core puede devolver `slot_taken` en un caso que el RPC aceptaría. Va en la dirección segura y es discutiblemente lo correcto (el buffer es la regla de descanso del negocio), pero la divergencia está documentada solo en `availability` (`:241-243`) y no acá, donde además cambia el resultado de una reserva.

**Fix:** una línea de comentario en `:228` explicitando que el espejo es deliberadamente MÁS estricto que el gate SQL por el buffer, para que el próximo lector no lo "alinee" quitando el buffer.

---

_Reviewed: 2026-07-29_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
