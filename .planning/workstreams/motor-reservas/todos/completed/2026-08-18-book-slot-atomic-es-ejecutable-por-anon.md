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

## Resolución

**Fecha:** 2026-09-02 · **Quick task:** `260902-h6m`

### Se reprodujo antes de elegir

Las dos vías, con el mismo resultado:

- **Superficie real** (PostgREST + anon key SIN sesión, que es lo que corre en el navegador de
  cualquiera que abra `/[slug]`): la llamada anónima devolvió `error = null` —creó el turno— con un
  payload que el route handler público rechazaría DOS veces (fecha `2031-03-03` con
  `max_advance_days = 7` ⇒ `date_out_of_window`; `plan_status = 'cancelled'` ⇒ `plan_inactive`).
- **`SET LOCAL ROLE anon` + `ROLLBACK`** (la vía de este todo): `has_function_privilege('anon', ...)`
  daba `t`; el `INSERT` directo quedó bloqueado por RLS (42501) y la misma escritura por la función
  definer creó el turno `fc8026bb-81c3-4cfe-b90b-1cf6e442b487`. Nada quedó escrito.

### El camino elegido: revocar

De los dos candidatos que este todo dejaba planteados, **no cubren lo mismo**:

| Camino | Ventana | Gate de plan | reCAPTCHA |
|---|---|---|---|
| Llevar `isDateOutOfWindow` adentro de la función | cierra | **sigue abierto** | **sigue abierto** |
| **Revocar la ejecución al rol anónimo** | cierra | cierra | cierra |

Además, mover la ventana a la base duplicaría una regla de negocio que hoy tiene una sola fuente de
verdad en `lib/booking-window.ts`.

La condición previa que este todo exigía —"verificar primero que ninguna superficie anónima llame al
RPC directo, o se rompe el booking público"— se **midió** y se cumple. Un solo call site en
producción (`lib/booking-core.ts:499`), que recibe el cliente por parámetro; sus llamadores reales:

| Caller | Cliente | Rol efectivo |
|---|---|---|
| `app/api/booking/create/route.ts:91` | `createAdminClient()` | `service_role` |
| `app/api/appointments/create/route.ts:23` | `await createClient()` (cookies) | `authenticated` |
| `app/api/abonos/create/route.ts:73` → `lib/abono-generation.ts` | `await createClient()` (cookies) | `authenticated` |
| `app/api/cron/cancel-expired/route.ts:253` → `lib/abono-generation.ts` | `createAdminClient()` | `service_role` |

Ninguno usa la anon key sin sesión. Los dos roles que conservan `EXECUTE` cubren los tres caminos de
alta (booking público, alta manual, abonos).

### Qué quedó hecho

- **Migración:** `supabase/migrations/076_book_slot_atomic_revoke_anon.sql` — `REVOKE EXECUTE` a
  `PUBLIC` y a `anon`, re-`GRANT` explícito a `authenticated`/`service_role`, todo en una transacción,
  con guard de post-estado que aborta si el estado final no es el esperado.
- **Test que lo deja cerrado:** `test/book-slot-atomic-anon-revoke.test.ts` — se pone rojo si alguien
  vuelve a conceder la ejecución al rol anónimo. Con controles positivos de los otros dos roles.

### ⚠ LA MIGRACIÓN 076 TODAVÍA NO ESTÁ APLICADA EN PRODUCCIÓN

Validada sólo en local (`supabase db reset`). El **runbook completo** —pre-flight, chequeo de
consumidores, verificación posterior y el espejado quirúrgico de `supabase/schema.sql`— vive en la
**cabecera del archivo 076**. Hasta que se aplique a mano en el SQL editor de producción, el bypass
sigue abierto allá. La 076 **no está acoplada a ningún deploy**: se puede aplicar sola.
