---
created: 2026-08-18T00:00:00.000Z
title: "`book_slot_atomic` es ejecutable por `anon` y saltea todos los controles del route handler"
area: security
severity: alta
source: secure-phase de la Phase 16 (v0.27) — hallazgo X-16-A, reproducido dos veces
files:
  - supabase/migrations/041_*.sql
  - app/api/booking/create/route.ts
  - lib/booking-window.ts
---

## Qué se midió

Con `SET LOCAL ROLE anon` —que es exactamente lo que hace PostgREST con un JWT anónimo— contra el
Postgres local:

| Camino | Resultado |
|---|---|
| `INSERT` directo en `appointments` | **BLOQUEADO** — `42501`, RLS |
| `book_slot_atomic(..., current_date - 30, ...)` | **CREÓ EL TURNO** — devolvió el id y la fila existe |

Reproducido dos veces (auditor + orquestador, por separado). La transacción se hizo `ROLLBACK`: no
quedó nada en la base.

## Por qué pasa

`book_slot_atomic` es `SECURITY DEFINER` (`prosecdef = t`) y tiene `GRANT EXECUTE ... TO "anon"`
desde la **migración 041**, re-otorgado hasta la 069. **Adentro de una función definer la RLS no
corre**, así que el bloqueo que sí atrapa al `INSERT` directo no aplica.

Y los controles que deberían frenarlo **no viven en la base**:

- `isDateOutOfWindow` aparece en **un solo lugar de producción**: `app/api/booking/create/route.ts:92`.
- El gate de plan (`plan_status`) y el reCAPTCHA también viven en el route handler.

Los dos únicos parámetros no adivinables —`business_id` y `service_id`— **son públicos**: los publica
la vista `public_services`.

## Qué NO es

- **No es cross-tenant.** La función re-impone `business_id`; no se puede escribir en otro negocio.
- **No lo abrió la Phase 16.** Es pre-existente desde la 041 y no depende de GATE-03 ni de la
  migración 070. Lo que la Phase 16 hizo fue *encontrarlo*, al auditar la premisa de un riesgo
  aceptado (T-16-05) que resultó falsa.

## El eje que las auditorías previas no miraron

Todas las auditorías de este repo apuntaron a **aislamiento por tenant**, y por ese eje la función
está bien. El eje que quedó sin evaluar es otro: **controles que existen solo en el route handler
mientras la base expone el mismo camino sin ellos**. Vale revisar si hay más RPCs con
`GRANT ... TO anon` en la misma situación.

## Caminos posibles (a medir antes de elegir)

- Llevar el chequeo de ventana **adentro** de `book_slot_atomic` (mismo criterio que
  `isDateOutOfWindow`, en hora AR).
- O `REVOKE EXECUTE ... FROM anon` y que el booking público entre por el route handler con
  service-role. **Ojo:** hay que verificar primero que ninguna superficie anónima llame al RPC directo,
  o se rompe el booking público.

No elegir sin reproducir: este workstream ya registró **tres** veces un fix propuesto que se cayó al
medirlo.
