---
phase: 01-turnos-manuales
plan: 02
subsystem: booking
tags: [booking, route-handler, auth, multi-tenant, dedupe, vitest]
status: complete
requires:
  - "lib/booking-core.ts :: createAppointmentCore (Plan 01 — core rol-agnóstico de creación de turno)"
  - "lib/supabase/server :: createClient (anon+RLS, sesión del dueño)"
  - "lib/business-secrets.ts :: getBusinessSecrets (service-role server-only, solo el token de Google)"
provides:
  - "app/api/appointments/create/route.ts :: POST (alta manual autenticada con dedupe + core + GCal best-effort)"
  - "test/manual-booking.test.ts (dedupe D-04 + alta confirmed + denegación sin sesión)"
affects:
  - "test/helpers/booking-fixtures.ts (SeededTenant ahora expone email/password del dueño)"
tech-stack:
  added: []
  patterns:
    - "Route handler autenticado: auth.getUser() → 401, business por owner_id (tenant = actor, no slug)"
    - "Dedupe de cliente server-side: normalización teléfono=dígitos / email=lowercase como autoridad"
    - "Service-role acotado a UNA lectura dentro del after() (google_refresh_token del propio tenant)"
key-files:
  created:
    - app/api/appointments/create/route.ts
    - test/manual-booking.test.ts
  modified:
    - test/helpers/booking-fixtures.ts
decisions:
  - "El dedupe vive inline en el handler (resolveClientId, función local), no en un módulo aparte: es lógica específica del alta manual y el core sigue sin tocar la tabla clients"
  - "El test replica la secuencia del handler (resolveClientId → core) con la sesión anon del dueño en vez de invocar el endpoint HTTP, porque levantar el server end-to-end es inviable en vitest"
metrics:
  duration_min: 8
  completed: 2026-06-26
  tasks: 2
  files_created: 2
  files_modified: 1
  tests_before: 290
  tests_after: 295
---

# Phase 1 Plan 02: Alta manual de turno autenticada Summary

Route handler autenticado `app/api/appointments/create/route.ts` para el alta manual de turnos desde el dashboard: corre con la sesión del dueño (anon+RLS), resuelve el tenant por `owner_id`, deduplica el cliente (D-04) y reusa `createAppointmentCore` con seña desactivada (D-01), creando el evento de Google Calendar best-effort en `after()` sin mandar mail.

## What Was Built

- **`app/api/appointments/create/route.ts` (nuevo, ~185 líneas):** `export async function POST(request)` (runtime Node). Secuencia: (1) `createClient()` anon+RLS con las cookies del dueño — **NO admin**; (2) `auth.getUser()` → `unauthorized` 401 si no hay sesión (T-01-05); (3) business por `.eq('owner_id', user.id)` → `not_found` 404 (tenant = actor, nunca slug ni business_id del cliente, T-01-06); (4) parseo defensivo del body (molde de `booking/create`), validando requeridos (`clientName`+`serviceId`+`date`+`time`) → `missing_fields` 400; (5) dedupe del cliente vía el helper local `resolveClientId`; (6) llamada a `createAppointmentCore({ ..., requireDeposit:false })` (D-01 → `confirmed`, `expires_at` null); (7) GCal best-effort en `after()`.
- **Helper `resolveClientId` (inline en el handler):** (a) si llega `clientId`, lo re-valida por `(id + business_id)` antes de confiar en él (T-01-07); (b) normaliza teléfono a solo dígitos y email a lowercase (autoridad del servidor) y busca un cliente del negocio que matchee → reusa su id sin duplicar; (c) sin match, inserta un cliente nuevo. Todo con `supabase` (anon+RLS), **nunca admin**.
- **GCal en `after()` sin mail:** lee `getBusinessSecrets(business.id)` (única excepción de service-role permitida — token del propio tenant ya resuelto, T-01-08), y si hay `google_refresh_token` crea el evento y guarda `google_event_id`. NO importa ni llama `verifyRecaptcha` ni `sendPendingPaymentEmail` (D-01/D-02).
- **`test/manual-booking.test.ts` (nuevo):** 5 casos (`describe.skipIf(!hasSupabaseCreds)`) — 401 sin sesión (un anon sin signIn no lee/escribe turnos del negocio, RLS los oculta), dedupe por teléfono (formato distinto normaliza al mismo → reusa el cliente existente, sin duplicar), dedupe por email (distinta capitalización → reusa), sin-match (crea cliente nuevo y lo asocia), y confirmed directo (`status='confirmed'` + `expires_at` null + `client_id` correcto). Las aserciones usan un cliente **anon-key autenticado como el dueño** (no service-role) replicando la secuencia exacta del handler (`resolveClientId` → core).
- **`test/helpers/booking-fixtures.ts` (modificado):** `SeededTenant` ahora expone `email`/`password` del dueño para poder firmar la sesión anon en el test (los valores ya se generaban internamente, solo se devuelven).

## Verification

- `npm run test -- manual-booking`: **5/5 verde** (contra creds reales de Supabase dev).
- `npm run test` (suite completa): **295/295 verde** (antes 290 tras Plan 01; +5 manual-booking). isolation/webhooks sin regresión.
- `npx tsc --noEmit`: sin errores.
- `grep` confirma las prohibiciones: 0 `createAdminClient`, 0 `verifyRecaptcha`, 0 `sendPendingPaymentEmail` en el handler; importa `createClient` de `@/lib/supabase/server`; `getBusinessSecrets` aparece solo como import + 1 llamada **dentro del `after()`** (línea 103).

## Deviations from Plan

Ninguna funcional. Notas de implementación:

- **Dedupe inline (no helper externo):** el plan dejaba la opción de "implementarlo inline o llamar a un helper local". Quedó inline (`resolveClientId` al pie del archivo) porque es lógica específica del alta manual y mantener el core sin tocar `clients` (decisión de Plan 01) sigue siendo correcto. El test replica el helper con la misma normalización para asertar el contrato.
- **Test sin server HTTP:** invocar el route handler end-to-end exige levantar Next, inviable en vitest. Siguiendo lo que el plan autoriza explícitamente, el test ejecuta la misma secuencia que el handler (`resolveClientId` → `createAppointmentCore`) con el cliente anon autenticado del dueño. El caso 401 se valida a nivel RLS (sin sesión, el anon no ve/escribe turnos del negocio), que es la garantía DB detrás del `auth.getUser()` del handler.

## Threat Surface

Sin superficie nueva fuera del threat register del plan. Mitigaciones aplicadas: T-01-05 (auth.getUser → 401, verify test + grep), T-01-06 (business por owner_id, nunca slug/business_id del cliente), T-01-07 (clientId re-validado por business_id + el core re-valida service/professional/location), T-01-08 (sin `createAdminClient` en el insert; `getBusinessSecrets` solo dentro del after(), verify grep), T-01-09 (reusa el core → mismo `slot_taken` 409 atómico que el público). Esta fase NO instala paquetes (T-01-SC accept).

## For Next Plan

El endpoint `POST /api/appointments/create` queda listo para que el componente del dashboard (`nuevo-turno-form.tsx`) y `appointments-client.tsx` reemplacen el insert client-side directo por un `fetch` a este endpoint (Plan 03+). El contrato de respuesta es `{ ok:true, appointmentId }` en éxito y `{ ok:false, error:'<snake>' }` (con `slot_taken` 409, `invalid_service`/`invalid_professional` 400, `unauthorized` 401, `not_found` 404, `missing_fields`/`bad_request` 400) en falla.

## Self-Check: PASSED

- FOUND: app/api/appointments/create/route.ts
- FOUND: test/manual-booking.test.ts
- FOUND: test/helpers/booking-fixtures.ts (modificado)
- FOUND commit 6663133 (Task 1), 39cfffb (Task 2)
