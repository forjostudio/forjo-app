---
created: 2026-08-18T00:00:00.000Z
title: "El gate de modo se esquiva moviendo `services.business_id` a otro negocio propio"
area: security
severity: media
source: secure-phase de la Phase 16 (v0.27) — hallazgo X-16-B
files:
  - supabase/migrations/065_service_snapshot_and_delete_gate.sql
  - supabase/migrations/068_service_capacity_unified_and_mode_gate.sql
  - supabase/schema.sql
---

## La cadena

1. Un servicio en `group_class` con un turno futuro vivo.
2. El dueño mueve `services.business_id` a **otro negocio suyo** (puede crearse un segundo negocio).
3. Ahora `→ individual` **PASA**.

Medido. Reabre **R-1** —el riesgo residual que la 068 vino a cerrar— por una cadena que no pasa por
la dirección que el guard de la 070 mira.

## Por qué es alcanzable

El filtro por tenant del gate es
`(OLD."business_id" IS NULL OR a."business_id" = OLD."business_id")`. Después del `UPDATE` de
`business_id`, los turnos viejos ya no matchean el negocio nuevo, así que el `EXISTS` no los ve y el
gate no tiene qué contar.

~~Y el `UPDATE` de `business_id` es posible porque las policies de `services` y `businesses` son
`ALL` **sin `WITH CHECK` explícito** (verificado en `pg_policies`: `with_check` es NULO en las dos).
Una policy `ALL` sin `WITH CHECK` valida la fila **vieja** con el `USING`, pero no valida a dónde va
la fila nueva.~~ **← ESTO ESTÁ MAL. Ver la corrección de abajo (2026-09-02).**

## Qué NO es

- **Confinado a tenants del propio usuario.** No permite tocar el negocio de otro.
- **No lo introdujo la Phase 16:** el filtro es byte-idéntico al que ya traían la 065 y la 068. La
  070 lo conserva tal cual, que era lo correcto.

## Nota de fondo

El daño real no es el modo del servicio: es que los turnos quedan **huérfanos de negocio** respecto de
su servicio. Vale mirar si mover `business_id` de un servicio debería estar permitido **en absoluto**
— probablemente la respuesta sea que no, y entonces el arreglo es un `WITH CHECK` en la policy (o un
trigger que rechace el cambio de `business_id`), no tocar el gate.

---

## ⚠ CORRECCIÓN DEL MECANISMO — medido el 2026-09-02

**El diagnóstico de arriba es incorrecto, y el fix que propone como principal no arreglaría nada.**

Cuando una policy `ALL` (o `UPDATE`) omite `WITH CHECK`, **PostgreSQL usa el `USING` también para
validar la fila nueva**. Está documentado, y se midió contra el Postgres local con tres negocios —
A1 y A2 del mismo dueño, B1 de otro — moviendo un servicio como rol `authenticated`:

| Movimiento | Resultado |
|---|---|
| A otro negocio **propio** (A1 → A2) | `UPDATE 1` — pasa |
| Al negocio de **otro dueño** (→ B1) | `ERROR: new row violates row-level security policy for table "services"` |

Ese error es literalmente el de `WITH CHECK`. O sea que **la fila nueva SÍ se valida**. El movimiento
entre negocios propios funciona porque **la validación PASA** (el dueño es dueño de los dos), no
porque falte un control.

**Consecuencias para quien tome este todo:**

1. **NO agregar un `WITH CHECK` con el mismo predicado.** Sería idéntico al `USING` que ya se aplica:
   cero cambio de comportamiento. Era el fix principal propuesto arriba.
2. **El arreglo correcto es un TRIGGER** que rechace el cambio de `business_id` — es lo que la "Nota
   de fondo" de este mismo todo menciona al pasar, y resulta ser el único camino: una policy **no
   puede** comparar contra `OLD` en su `WITH CHECK`. Molde en el repo:
   `businesses_protect_admin_columns` (revierte columnas administrativas salvo `service_role`).
3. **Falso positivo a no repetir:** 13 de las 14 policies `ALL` del schema tienen `with_check` NULO en
   `pg_policies`. Eso **no** significa que estén desprotegidas — es el comportamiento por defecto de
   Postgres. Leer esa columna sin medir el comportamiento lleva directo a una alarma equivocada.

**Alcance real, sin inflar:** confinado a negocios del MISMO dueño; requiere crear un segundo negocio
a propósito y mover el servicio. Sin exposición entre usuarios. Daño autoinfligido: turnos huérfanos
de negocio respecto de su servicio, y el gate de modo (R-1) esquivable. **No bloquea la Phase 20**,
que no toca el gate de modo.

**Decisión abierta antes de arreglarlo:** si `services` lleva trigger, hay que decidir si el mismo
trato va para las otras 12 tablas con policy `ALL` (mover un `client` o un `appointment` entre
negocios propios tiene la misma forma, y en esas tablas puede ser peor). Medir antes de elegir el
alcance.
