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

Y el `UPDATE` de `business_id` es posible porque las policies de `services` y `businesses` son `ALL`
**sin `WITH CHECK` explícito** (verificado en `pg_policies`: `with_check` es NULO en las dos). Una
policy `ALL` sin `WITH CHECK` valida la fila **vieja** con el `USING`, pero no valida a dónde va la
fila nueva.

## Qué NO es

- **Confinado a tenants del propio usuario.** No permite tocar el negocio de otro.
- **No lo introdujo la Phase 16:** el filtro es byte-idéntico al que ya traían la 065 y la 068. La
  070 lo conserva tal cual, que era lo correcto.

## Nota de fondo

El daño real no es el modo del servicio: es que los turnos quedan **huérfanos de negocio** respecto de
su servicio. Vale mirar si mover `business_id` de un servicio debería estar permitido **en absoluto**
— probablemente la respuesta sea que no, y entonces el arreglo es un `WITH CHECK` en la policy (o un
trigger que rechace el cambio de `business_id`), no tocar el gate.
