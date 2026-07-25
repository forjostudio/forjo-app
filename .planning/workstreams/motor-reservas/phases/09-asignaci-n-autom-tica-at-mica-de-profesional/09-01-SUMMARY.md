---
phase: 09-asignaci-n-autom-tica-at-mica-de-profesional
plan: 01
subsystem: motor-reservas / núcleo anti-doble-booking (book_slot_atomic)
tags: [rpc, security-definer, advisory-lock, concurrency, multi-staff, migration]
status: complete
requires:
  - "book_slot_atomic (migr. 041/042) — RPC atómico de reserva"
  - "professional_services (migr. 057, Phase 8) — mapeo staff↔servicios"
  - "lib/staff-services.ts — regla del comodín canónica"
provides:
  - "book_slot_atomic (migr. 058) con rama 'cualquiera': elige profesional capaz+libre bajo el lock"
  - "lib/booking-core.ts flag aditivo autoAssign + constante ANY_PROFESSIONAL"
  - "advisory lock del slot ampliado a hash(business_id + date + time)"
affects:
  - "los 4 callers de createAppointmentCore (byte-idéntico con el flag falsy)"
tech-stack:
  added: []
  patterns:
    - "UUID centinela mágico ('...0001') para señalar intención sin cambiar la firma del RPC"
    - "CREATE OR REPLACE puro (firma + RETURNS byte-idénticos) para cero regresión de callers"
    - "selección de candidato SECURITY DEFINER con business_id explícito + paridad-comodín SQL"
key-files:
  created:
    - supabase/migrations/058_professional_auto_assignment.sql
  modified:
    - supabase/schema.sql
    - lib/booking-core.ts
decisions:
  - "Señal 'cualquiera' = UUID mágico '00000000-0000-0000-0000-000000000001' (distinto del SENTINEL cero de 'sin profesional') → firma del RPC intacta, CREATE OR REPLACE puro (D-09/D-11)"
  - "Lock del slot ampliado quitando v_bucket del hash: hash(business_id + date + time) (D-04) — lock más grueso serializa más, no degrada slot_full/slot_taken"
  - "Sin candidato capaz libre → RAISE 'slot_taken' (D-10), cae en la rama slot_taken→409 ya existente del core"
metrics:
  tasks_completed: 3
  files_created: 1
  files_modified: 2
  completed: 2026-07-25
---

# Phase 9 Plan 01: Asignación automática atómica de profesional — Summary

Migración 058 (`CREATE OR REPLACE` puro) que enseña a `book_slot_atomic` a elegir, DENTRO de la misma transacción `SECURITY DEFINER` y bajo un advisory lock ampliado, un profesional capaz+libre (el de menos turnos ese día) cuando la reserva pide "cualquiera"; más el flag aditivo `autoAssign` en `lib/booking-core.ts` que señala esa intención con un UUID mágico sin tocar la firma del RPC ni el comportamiento de los 4 callers actuales.

## What Was Built

### Task 1 — Migración 058 + schema.sql (commit ca3a7d2)
- `supabase/migrations/058_professional_auto_assignment.sql`: `CREATE OR REPLACE FUNCTION book_slot_atomic` con la firma de 14 parámetros y `RETURNS TABLE ("id" uuid, "cancel_token" uuid)` **byte-idénticos** a 042 (sin `DROP FUNCTION`). Re-emite `ALTER FUNCTION ... OWNER TO postgres` y `GRANT EXECUTE ... TO anon, authenticated, service_role` con la firma completa de 14 tipos.
- Cambios sobre el cuerpo de 042:
  1. **DECLARE nuevos:** `v_effective_pro uuid := p_professional_id`, `v_is_any boolean := (p_professional_id = '...0001'::uuid)`, y `v_bucket` ahora se recomputa tras la selección.
  2. **Lock ampliado (D-04):** el `pg_advisory_xact_lock` del slot hashea `p_business_id::text || p_date::text || p_time::text` — sin `v_bucket`.
  3. **Selección de candidato (D-01/02/03/07/08/10):** `IF v_is_any THEN SELECT p.id INTO v_effective_pro ...` con filtro `p.business_id = p_business_id`, `p.active = true`, `p.service_id IS NULL` (excluye canchas), sede `(p.location_id = p_location_id OR p.location_id IS NULL)`, paridad-comodín exacta (`NOT EXISTS ... OR EXISTS ...` sobre `professional_services`, ambas con `ps.business_id = p_business_id`), "libre" por solape con guarda de holds vigentes, y `ORDER BY (count carga día) ASC, created_at ASC, id ASC`. Sin candidato → `RAISE 'slot_taken'`.
  4. **Uso de `v_effective_pro`:** recompute de `v_bucket`, el bloque de espacio (042), el count y el `INSERT` usan el pro REAL elegido — nunca el UUID mágico.
- `supabase/schema.sql`: bloque `book_slot_atomic` regenerado quirúrgicamente (misma definición nueva; una sola definición del RPC).

### Task 2 — lib/booking-core.ts (commit dad421b)
- Constante de módulo `ANY_PROFESSIONAL = '00000000-0000-0000-0000-000000000001'` (distinta del `SENTINEL`).
- `autoAssign?: boolean` en `CreateAppointmentInput`.
- Con `autoAssign`: se saltea la resolución/anti-tampering de `professionalId` y se fija `proId = ANY_PROFESSIONAL`; los re-checks JS (solape por bucket, espacio compartido, capacity-aware, liberación de holds) quedan envueltos en `if (!autoAssign) { … }`. `cancelledHoldIds` se declara fuera del bloque (queda `[]` en el camino autoAssign).
- La llamada `.rpc('book_slot_atomic', {...})` conserva las mismas 14 claves `p_*`; solo cambia el valor de `p_professional_id`. La traducción de errores `rpcErr` queda intacta (el `slot_taken` de "sin candidato" cae en la rama existente → 409).

### Task 3 — Aplicación local + smoke (BLOCKING)
- `npx supabase db reset` replayó 001→058 limpio (exit 0); `supabase migration list --local` lista la 058.
- Smoke de cero regresión: `npm test -- test/concurrency.test.ts test/booking-core.test.ts` → **2 archivos, 11 tests, todos pasan** (exit 0). El lock más grueso no degrada CONC/CUPOS ni el core.

## Verification Results

- `grep` de firma byte-idéntica en 058: `RETURNS TABLE ("id" uuid, "cancel_token" uuid)` == 1, `ALTER`/`GRANT` de 14 tipos presentes, `DROP FUNCTION` == 0.
- Lock ampliado confirmado (la sentencia del lock del slot hashea `business_id + date + time`, sin `v_bucket`).
- UUID mágico presente y distinto del sentinel; paridad-comodín con `ps.business_id = p_business_id` en ambas subqueries; `p.service_id IS NULL` y filtro de sede presentes; `RAISE 'slot_taken'` sin candidato.
- `lib/booking-core.ts`: `autoAssign` (12 ocurrencias), `ANY_PROFESSIONAL = '...0001'` (==1), `if (!autoAssign)` (==1), 14 claves `p_*` en la llamada rpc.
- `npx tsc --noEmit` → exit 0.
- `supabase db reset` local exit 0; 058 en la lista; smoke 11/11.

## Deviations from Plan

Ninguna funcional. Ajuste menor de redacción: un comentario de cabecera de 058 mencionaba textualmente `RETURNS TABLE ("id" uuid, "cancel_token" uuid)`, lo que hacía que el grep de acceptance (`== 1`) contara 2 apariciones; se reformuló el comentario a "el RETURNS TABLE (id, cancel_token)" para que el literal exacto aparezca solo en la firma real. Sin impacto en el SQL ejecutado.

## Deployment Note (paso manual — NO scripteado)

La 058 se aplica **a mano** al Supabase de PROD coordinada con el deploy de la Phase 9 (última migración en prod = 057). Tras aplicarla: `NOTIFY pgrst, 'reload schema';` (PostgREST refresca su schema cache). No se agregó ningún `supabase db push` / `--linked` a scripts (D-09, `user_setup`).

## Notes for Next Plan (09-02)

- La verificación de atomicidad bajo concurrencia REAL (ASIGN-03), la selección del menos-cargado (ASIGN-04), la paridad-comodín/sede y la regresión completa de los 4 caminos las cubre el Plan 09-02, que agrega `seedProfessionalService` a `test/helpers/booking-fixtures.ts` y `test/staff-assignment.test.ts` (con `autoAssign: true`), más el secure-phase obligatorio (D-12).
- El profesional asignado se lee de `appointments.professional_id` de la fila (el `RETURNS` no cambió; Phase 10 lo expone en la UI).

## Self-Check: PASSED

- FOUND: supabase/migrations/058_professional_auto_assignment.sql
- FOUND: supabase/schema.sql
- FOUND: lib/booking-core.ts
- FOUND commit: ca3a7d2 (Task 1)
- FOUND commit: dad421b (Task 2)
