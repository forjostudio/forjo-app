---
created: 2026-07-22T20:35:56.370Z
title: "Cupo por solape: capacity > 1 no controla turnos escalonados"
area: database
files:
  - supabase/migrations/042_spaces_and_coupled_exclusion.sql:209-218
  - supabase/schema.sql:886
  - lib/abono-cancel.ts
  - app/api/booking/create/route.ts
  - app/api/abonos/create/route.ts
---

## Problem

Con `capacity > 1`, el control de sobrecupo **cuenta por hora de inicio exacta y no por solape**, así que
turnos escalonados que se pisan entre sí superan el cupo sin que nada los frene.

**Reproducido a mano (UAT fase 07, 2026-07-22).** Negocio con cupo 2, servicio de 30 min:

```
16:00 ──────────── 16:30      turno A   (aceptado)
16:00 ──────────── 16:30      turno B   (aceptado → cupo 2 lleno para las 16:00)
        16:15 ──────────── 16:45   turno C  (ya existía)
        16:15 ──────────── 16:45   turno D  (aceptado → cupo 2 lleno para las 16:15)
             ↑
   entre 16:15 y 16:30 hay CUATRO turnos a la vez, con cupo 2
```
Recién el 3.º turno con la MISMA hora de inicio dispara el salto. El operador lo detectó en el
contexto de un kinesiólogo (cupo = camillas disponibles).

### Causa raíz (diagnóstico cerrado, verificado en código)

Son dos piezas que se combinan:

1. **El `EXCLUDE` anti-solape se apaga con cupo > 1.** `supabase/schema.sql:886`:
   ```sql
   EXCLUDE USING gist (business_id, professional_id, tsrange(...) WITH &&)
   WHERE (status IN ('confirmed','pending_payment') AND NOT is_group)
   ```
   El RPC setea `is_group := (v_capacity > 1)`. Con cupo 1 la constraint blinda el solape; apenas
   sube a 2 deja de aplicar por completo. Es **necesario** (con cupo > 1 el solape ES legal hasta el
   cupo), pero deja el control en manos del conteo del punto 2.

2. **El conteo mira solo `date + time` idénticos.**
   `supabase/migrations/042_spaces_and_coupled_exclusion.sql:209-218`, cuyo propio comentario dice
   "Ocupantes actuales del slot **exacto**":
   ```sql
   AND a.date = p_date AND a.time = p_time
   ```
   Nunca considera `duration_minutes`. Ironía: la MISMA función ya sabe razonar por intervalo — el
   chequeo de espacios compartidos (líneas 190-191) usa `tsrange && tsrange`. El cupo no lo usa.

No es regresión de la fase 07: viene del motor de cupos (v0.12).

## Solution

**Primero hay una decisión de producto, no técnica.** "Cupo 2" significa dos cosas distintas y hoy la
app solo implementa la primera:

| Semántica | Ejemplo | Criterio correcto | Estado actual |
|---|---|---|---|
| Clase grupal | yoga 16:00, cupo 10 | por hora de inicio | ✅ correcto |
| Recurso simultáneo | kinesiólogo con 2 camillas | por solape | ❌ roto |

Por eso el fix NO es "usar solape" a secas: eso rompería las clases grupales, donde la clase de las
16:00 y la de las 17:00 no deberían sumar entre sí. Hay que decidir si el cupo por solape es un
**modo nuevo** (configurable por negocio, o derivado del vertical) o si reemplaza al actual.

### Dos complicaciones técnicas que agrandan el trabajo

1. **Asignación de `seat`.** Hoy `v_seat := v_occupied`, y el índice único 011 usa
   `(negocio, profesional, fecha, hora, seat)`. Si el conteo pasa a ser por solape, un turno de las
   16:15 podría recibir `seat = 3` con cupo 2 y chocar con ese índice. Hay que **separar el criterio
   de cupo de la asignación de asiento**: el cupo se evalúa por solape, el asiento sigue siendo
   posición dentro del slot exacto.

2. **Granularidad del advisory lock.** El `pg_advisory_xact_lock` es por **slot + bucket**. Dos
   reservas concurrentes a las 16:00 y a las 16:15 que se pisan toman locks **distintos** → se
   cuelan las dos aunque el conteo sea por solape. Con semántica de solape el lock tiene que pasar a
   ser por bucket + día (o por ventana), y eso toca el corazón anti-doble-booking de **todas** las
   vías de reserva: booking público, alta manual y abonos.

### Cómo encararlo

NO es una quick task. Toca el RPC atómico que garantiza el no-sobrecupo de todo el producto.
Abrir como fase propia con `/gsd:discuss-phase`, cerrando primero la decisión de producto.
`secure-phase` obligatorio: el invariante anti-sobrecupo/anti-doble-booking es el más caro de romper.
