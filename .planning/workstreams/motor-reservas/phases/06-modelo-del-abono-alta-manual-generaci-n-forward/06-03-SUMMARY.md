---
phase: 06-modelo-del-abono-alta-manual-generaci-n-forward
plan: 03
subsystem: api
tags: [typescript, supabase, next-16, abonos, multi-tenant, anti-tampering, resend, vitest]

# Dependency graph
requires:
  - phase: 06-01-modelo-del-abono
    provides: "tabla abonos (RLS owner-only, cancel_token, generated_until, skipped_occurrences) + appointments.abono_id + businesses.abono_window_weeks + interface Abono en lib/types.ts"
  - phase: 06-02-motor-generacion-forward
    provides: "generateAbonoOccurrences({supabase,business,abono,fromDate,toDate}) → {created, skipped}; toda ocurrencia por createAppointmentCore, motor PURO (no persiste)"
  - phase: motor-reservas (booking-core)
    provides: "createAppointmentCore — núcleo atómico rol-agnóstico; resolveClientId (dedupe) del alta manual"
provides:
  - "app/api/abonos/create/route.ts — endpoint POST autenticado del alta del abono (dueño): auth por owner_id, anti-tampering por business_id, insert abono anon+RLS, primera tanda vía el motor, persiste generated_until+skipped (capado a 50), 1 solo mail"
  - "sendAbonoConfirmation en lib/email.ts — mail único de alta del abono (turno fijo semanal, sin precio/seña, cancelUrl opcional para Phase 7)"
  - "Cap de skipped_occurrences a las últimas 50 (convención compartida con el cron del Plan 04)"
affects: [06-04-cron, 07-cancelacion-serie, alta-manual-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Endpoint autenticado espejo de appointments/create: createClient() anon+RLS, auth.getUser()→401, business por owner_id→404, insert SIN admin (RLS + business_id = defensa en profundidad)"
    - "Anti-tampering server-side: professional/service/location re-validados por business_id ANTES del insert; canchas derivan serviceId desde professional.service_id (nunca del body)"
    - "Estado rolling del abono lo aplica el CALLER: el endpoint persiste generated_until = toDate y skipped_occurrences = result.skipped.slice(-50) tras correr el motor puro"
    - "Un solo efecto de mail en after() best-effort (secretos por getBusinessSecrets del propio tenant); la generación NO manda mail por ocurrencia"

key-files:
  created:
    - app/api/abonos/create/route.ts
    - test/abono-create.test.ts
  modified:
    - lib/email.ts

key-decisions:
  - "Validación estricta de professional por business_id en el endpoint (invalid_professional 400) antes de insertar, porque el professional_id se persiste en la fila abonos — más estricto que booking/create, apropiado para el alta autenticada"
  - "El mail de alta no hace un select extra del nombre del service (service='' aditivo): el mail funciona sin él y se evita un round-trip; el foco del mail es día+hora recurrentes"
  - "fromDate = todayInAR() (hora Argentina, no new Date() crudo) y toDate = hoy + abono_window_weeks*7 (default 8) — misma fuente de verdad de 'hoy' que la ventana de reserva pública"

patterns-established:
  - "Alta de serie recurrente autenticada: auth+tenant → anti-tampering (+derivación canchas) → dedupe cliente → insert serie anon+RLS → primera tanda por el motor → persistir ventana rolling → 1 mail"

requirements-completed: [ABONO-01, ABONO-02]

# Metrics
duration: 22min
completed: 2026-07-20
status: complete
---

# Phase 6 Plan 03: Alta manual del abono (endpoint + mail) Summary

**`app/api/abonos/create` da de alta el abono con la sesión del dueño (tenant por owner_id, anti-tampering por business_id, canchas derivan el service server-side), inserta la serie con anon+RLS, corre la primera tanda vía `generateAbonoOccurrences` (todo turno por `createAppointmentCore`), persiste `generated_until` + `skipped_occurrences` (capado a 50) y manda UN solo mail de alta (`sendAbonoConfirmation`, sin precio/seña). 10 tests verdes.**

## Performance

- **Duration:** ~22 min
- **Completed:** 2026-07-20
- **Tasks:** 3
- **Files modified:** 3 (2 creados, 1 modificado)

## Accomplishments
- `sendAbonoConfirmation` en `lib/email.ts`: mail de alta del abono que describe el turno FIJO semanal (día recurrente + hora + servicio + negocio), reusando los helpers del módulo (resolveSender/renderEmailHeader/normalizeArWhatsApp/resendSend). Sin precio/seña (D-08). `cancelUrl` opcional preparado para el link de cancelar serie de Phase 7 (hoy no se pasa).
- `POST /api/abonos/create`: espejo exacto de `appointments/create`. `createClient()` (anon+RLS, NUNCA admin), `auth.getUser()` → 401, business por `owner_id` → 404. Parseo defensivo del body.
- Anti-tampering (T-06-10): professional/service/location re-validados por `business_id` antes de insertar; en canchas el `serviceId` se DERIVA de `professional.service_id` server-side (ignora el del body). Dedupe de cliente (mismo criterio que el alta manual de turno) → el abono queda siempre con `client_id`.
- Insert de la fila `abonos` con anon+RLS (la policy INSERT with-check garantiza el negocio del dueño, T-06-11). Primera tanda (D-05): `fromDate = todayInAR()`, `toDate = hoy + abono_window_weeks*7` (default 8), vía `generateAbonoOccurrences` → todo turno por `createAppointmentCore` (T-06-13). Persiste `generated_until = toDate` y `skipped_occurrences = result.skipped.slice(-50)` (UPDATE acotado por id + business_id).
- UN solo mail (D-08) en `after()` best-effort, sólo si el cliente tiene email; secretos Resend del propio tenant (T-06-12). Los turnos generados NO mandan mail por ocurrencia.
- 10 tests: 6 de integración contra la DB local (alta feliz, anti-tampering service+professional, RLS sin sesión, 404 sin business, primera tanda sin mail por ocurrencia) + 4 puros del mail (1 llamada = 1 POST, contenido día/hora, sin precio/seña, sin botón cancelar).

## Task Commits

Each task was committed atomically:

1. **Task 1: Template sendAbonoConfirmation** — `34d92ba` (feat)
2. **Task 2: Endpoint POST /api/abonos/create** — `96a8100` (feat)
3. **Task 3: Tests del endpoint** — `d3c864a` (test)

## Files Created/Modified
- `app/api/abonos/create/route.ts` — endpoint POST autenticado: auth+tenant, anti-tampering (+derivación canchas), dedupe cliente, insert abono anon+RLS, primera tanda por el motor, persistencia de generated_until+skipped (capado a 50), 1 mail en after().
- `lib/email.ts` — `sendAbonoConfirmation`: mail de alta del abono (turno fijo semanal, sin precio/seña, cancelUrl opcional).
- `test/abono-create.test.ts` — 6 tests de integración (owner anon+RLS contra la DB local) + 4 tests puros del mail.

## Decisions Made
- **Professional validado estrictamente por business_id en el endpoint** (invalid_professional 400) antes del insert, porque `professional_id` se persiste en la fila `abonos`. Más estricto que `booking/create` (que delega esa validación al core), apropiado porque acá la entidad se guarda en la serie.
- **El mail no hace un select extra del nombre del service** (`service=''` aditivo): el mail de alta funciona sin él y se evita un round-trip; el foco es el día+hora recurrentes. Un caller futuro puede pasar el nombre si lo quiere mostrar.
- **`fromDate = todayInAR()`** (hora Argentina, no `new Date()` crudo) para que el borde de la ventana coincida con la misma noción de "hoy" que la ventana de reserva pública (evita drift por el server en UTC).

## Deviations from Plan

None — el plan se ejecutó tal cual, incorporando la augmentation del orquestador (cap de `skipped_occurrences` a las últimas 50 con `.slice(-50)`, convención compartida con el cron del Plan 04) como parte del UPDATE de persistencia en la Task 2.

**Total deviations:** 0.

## Issues Encountered
- El route handler HTTP no se puede invocar end-to-end sin levantar el server (usa `createClient()` con cookies de sesión). Se siguió el patrón establecido del repo (`test/manual-booking.test.ts`): replicar la MISMA secuencia del handler con el cliente anon+RLS autenticado del dueño. El mail (que en el handler va en `after()`) se prueba aparte, puro, stubbeando `fetch`.
- La verificación "los turnos generados no mandan mail por ocurrencia" no se puede hacer stubbeando `fetch` durante la generación (supabase-js usa `fetch` internamente). Se asertó por la vía DB: ninguno de los 5 turnos de la primera tanda queda con `email_sent` (el motor/booking-core no importan lib/email), combinado con el test puro de que 1 llamada a `sendAbonoConfirmation` = 1 POST.

## Threat Mitigations Applied
- **T-06-09 (Spoofing):** `auth.getUser()` obligatorio → 401; business por `owner_id`, nunca por un id del body. Test 3 (RLS sin sesión) + 3b (404 sin business).
- **T-06-10 (Tampering):** service/professional/location re-validados por `business_id`; canchas derivan `serviceId` desde `professional.service_id`; `resolveClientId` re-valida el `clientId` por tenant. Tests 2 + 2b (cross-tenant rechazado sin crear nada).
- **T-06-11 (Tampering):** insert del abono con anon+RLS (no admin); policy INSERT with-check → no se puede crear en otro negocio. Test 3 (RLS deniega el insert sin sesión).
- **T-06-12 (Info Disclosure):** secretos Resend por `getBusinessSecrets(business.id)` del propio tenant; mail sólo al cliente del abono; en `after()` best-effort (si falla, el alta no se rompe).
- **T-06-13 (Repudiation/abuso):** la primera tanda pasa por el motor → todo turno por `createAppointmentCore`; rango acotado por `abono_window_weeks`.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plan 04 (cron) puede reusar la misma persistencia (`generated_until` + `skipped_occurrences.slice(-50)`) para extender la ventana rolling día a día con el mismo motor idempotente.
- Phase 7 (cancelación de serie) tiene el `cancel_token` a nivel serie ya presente en la fila y el `cancelUrl` opcional ya cableado en `sendAbonoConfirmation` — sólo hay que empezar a pasarlo.
- Falta (fuera de este plan): la UI del panel que consume `POST /api/abonos/create` (alta del abono desde el dashboard).

## Self-Check: PASSED
- Archivos verificados: app/api/abonos/create/route.ts, lib/email.ts (sendAbonoConfirmation), test/abono-create.test.ts, 06-03-SUMMARY.md — presentes.
- Commits verificados: 34d92ba (Task 1), 96a8100 (Task 2), d3c864a (Task 3) — en git log.
- `npx tsc --noEmit` pasa; `npx vitest run test/abono-create.test.ts` → 10/10 verde.

---
*Phase: 06-modelo-del-abono-alta-manual-generaci-n-forward*
*Completed: 2026-07-20*
