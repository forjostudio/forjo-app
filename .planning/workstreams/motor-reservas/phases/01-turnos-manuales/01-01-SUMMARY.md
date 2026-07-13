---
phase: 01-turnos-manuales
plan: 01
subsystem: booking
tags: [booking, refactor, multi-tenant, anti-double-booking, vitest]
status: complete
requires:
  - "app/api/booking/create/route.ts (pipeline público existente como fuente de la extracción)"
  - "constraints 011/013 (respaldo atómico anti-doble-booking)"
provides:
  - "lib/booking-core.ts :: createAppointmentCore (core rol-agnóstico de creación de turno)"
  - "CreateAppointmentInput / CreateAppointmentResult (tipos del core)"
  - "test/helpers/booking-fixtures.ts :: seedOneTenant/teardownOneTenant"
affects:
  - "app/api/booking/create/route.ts (refactorizado para consumir el core)"
tech-stack:
  added: []
  patterns:
    - "Core rol-agnóstico: recibe el cliente Supabase por parámetro (admin público | anon+RLS manual)"
    - "El core devuelve cancelledHoldIds y NO manda mails (frontera de regresión RESEARCH Pitfall 2)"
key-files:
  created:
    - lib/booking-core.ts
    - test/booking-core.test.ts
    - test/booking-public-regression.test.ts
    - test/helpers/booking-fixtures.ts
  modified:
    - app/api/booking/create/route.ts
decisions:
  - "El core NO inserta la fila de clients: el caller resuelve/crea el cliente y pasa clientId (público=siempre nuevo, manual=dedupe)"
  - "Test D (mapeo 23505/23P01) usa un cliente Supabase 'ciego' que devuelve [] en el SELECT de clashes para simular la carrera y forzar el choque de constraint en el INSERT"
metrics:
  duration_min: 5
  completed: 2026-06-26
  tasks: 3
  files_created: 4
  files_modified: 1
  tests_before: 283
  tests_after: 290
---

# Phase 1 Plan 01: Extracción de booking-core (refactor anti-doble-booking) Summary

Extracción de la cadena de validación + insert de turno de `app/api/booking/create/route.ts` a un helper compartido y rol-agnóstico `lib/booking-core.ts` (`createAppointmentCore`), con el endpoint público refactorizado para consumirlo sin regresión y cobertura Vitest del core (overlap/buffer/anti-tampering/23505→slot_taken).

## What Was Built

- **`lib/booking-core.ts` (nuevo, ~210 líneas):** `createAppointmentCore(input)` rol-agnóstico — recibe el cliente Supabase ya construido (admin para el público, anon+RLS para el alta manual del Plan 02). Encapsula: re-validación anti-tampering de `service`/`professional`/`location` por `business_id`; re-check de solapamiento con buffer + sentinela del bucket sin profesional; liberación de holds vencidos devolviendo `cancelledHoldIds` (sin mandar mails); cálculo de `status`/`expires_at` por `requireDeposit`; INSERT con `.select('id, cancel_token')` y traducción `23505`/`23P01` → `slot_taken` (409), resto → `insert_failed` (500). Exporta los tipos `CreateAppointmentInput` y `CreateAppointmentResult`.
- **`app/api/booking/create/route.ts` (refactor):** reemplaza la cadena inline `:81-241` por una llamada al core. Mantiene en el caller (no migra al core): reCAPTCHA, gate de plan (`plan_inactive`), `getBusinessSecrets`, el insert del cliente (siempre nuevo, D-04), el mail de seña, los mails de holds vencidos (vía `result.cancelledHoldIds`) y el evento de Google Calendar en `after()`. La respuesta final (`{ ok, appointmentId, cancelToken, requiresPayment }`) no cambia.
- **`test/helpers/booking-fixtures.ts` (nuevo):** `seedOneTenant`/`teardownOneTenant` — siembra 1 negocio fixture (dueño auth + business con `buffer_minutes` + service activo + professional activo + location) con prefijo `__test_<uuid8>` y `auth.admin.deleteUser` en `finally`. Molde de `test/helpers/supabase-fixtures.ts`.
- **`test/booking-core.test.ts` (nuevo):** 5 casos (`describe.skipIf(!hasSupabaseCreds)`) — A anti-tampering (serviceId de otro business → `invalid_service`), B re-check de overlap → `slot_taken`, C confirmed directo + `expires_at` null, D mapeo de constraint `23505/23P01` → `slot_taken` (vía carrera simulada), E buffer (turno dentro del buffer → `slot_taken`).
- **`test/booking-public-regression.test.ts` (nuevo):** no-regresión de la rama de seña — `requireDeposit:true` → `pending_payment` + `expires_at` no nulo; `false` → `confirmed` + null. TEST-01 (isolation) + webhooks son el guard end-to-end del resto.

## Verification

- `npm run test` (suite completa): **290/290 verde** (antes 283; +5 core, +2 regresión). TEST-01 isolation + webhook-deposit + webhook-subscription siguen pasando → no-regresión confirmada.
- `npx tsc --noEmit`: sin errores.
- `npx eslint app/api/booking/create/route.ts lib/booking-core.ts`: limpio.
- `grep` confirma que `lib/booking-core.ts` NO importa `lib/email`/`lib/recaptcha`/`business-secrets` ni crea su cliente Supabase (`createClient(`/`createAdminClient(` ausentes).
- `grep` confirma que el endpoint público sigue importando `verifyRecaptcha`, `sendPendingPaymentEmail`, `sendExpiredHoldEmail`, `createCalendarEvent`, `getBusinessSecrets` y conserva el gate `plan_inactive`.

## Deviations from Plan

Ninguna funcional. Notas de implementación:

- **Test D (mapeo 23505/23P01):** el plan pide "forzar un insert que viole 011/013". Como el re-check JS y los constraints DB cubren exactamente los mismos estados (`confirmed`/`pending_payment`), un ocupante visible al re-check nunca llega al INSERT. Para ejercitar específicamente la traducción de constraint (no el re-check de UX), Test D usa un cliente Supabase "ciego" que devuelve `[]` solo en el SELECT de clashes de `appointments` (simulando la ventana de carrera donde el ocupante aparece después del re-check); el ocupante real existe en la DB, así el INSERT choca con la constraint viva y el core traduce el código. Documentado en el propio test.
- **Manejo de holds-emails en el caller:** el core devuelve `cancelledHoldIds` (solo ids). El endpoint público re-consulta esos ids (`select('id, client_name, client_email, date, time, services(name)')` filtrado por `business_id`) para armar los mails en su `after()`. El comportamiento de aviso al cliente de hold vencido se preserva.

## Threat Surface

Sin superficie nueva. Las mitigaciones del threat register se mantienen: T-01-01 (anti-tampering por `business_id`, verify Test A), T-01-02 (constraints 011/013 + traducción, verify Test B/D), T-01-03 (el core no importa email/recaptcha/secrets, verify grep), T-01-04 (rama de seña intacta, verify suite verde). Esta fase NO instala paquetes (T-01-SC accept).

## For Next Plan (01-02)

`createAppointmentCore` está listo para el alta manual autenticada: el route handler nuevo (`app/api/appointments/create`) lo llama con el cliente anon+RLS de `lib/supabase/server`, `business` resuelto por `owner_id`, `requireDeposit:false` (D-01: manual siempre `confirmed`), y resuelve/deduplica el cliente antes de pasar `clientId`. El core ignora `cancelledHoldIds` en ese caller (no manda mails de holds en el alta manual).

## Self-Check: PASSED

- FOUND: lib/booking-core.ts
- FOUND: test/booking-core.test.ts
- FOUND: test/booking-public-regression.test.ts
- FOUND: test/helpers/booking-fixtures.ts
- FOUND commit 78e7c05 (Task 1), cfa8c74 (Task 2), e769aad (Task 3)
