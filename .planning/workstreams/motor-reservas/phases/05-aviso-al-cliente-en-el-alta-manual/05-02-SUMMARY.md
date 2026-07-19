---
phase: 05-aviso-al-cliente-en-el-alta-manual
plan: 02
subsystem: alta-manual
tags: [email, notifications, alta-manual, dashboard, opt-in]
requires: [sendManualBookingConfirmation, getBusinessSecrets, createAppointmentCore]
provides: [manual-booking-notify-optin]
affects: [app/api/appointments/create/route.ts, components/dashboard/nuevo-turno-form.tsx]
tech-stack:
  added: []
  patterns: [best-effort-email-after, opt-in-checkbox-nativo, secretos-por-tenant]
key-files:
  created: []
  modified:
    - app/api/appointments/create/route.ts
    - components/dashboard/nuevo-turno-form.tsx
decisions:
  - "D-01: checkbox opt-in default OFF; disabled + hint cuando el cliente no tiene email"
  - "D-02: mail en after() SEPARADO del de gcal, best-effort (try/catch + console.error)"
  - "D-04: se pasa result.cancelToken al mail; sin token Plan 01 degrada y manda sin botón"
  - "Flag = 'notify' (Claude's Discretion, D-03); el server re-gatea por clientEmail presente"
metrics:
  duration: ~15min
  completed: 2026-07-19
  tasks: 2
  files: 2
status: complete
requirements: [BOOK-NOTIFY-01]
---

# Phase 05 Plan 02: Aviso opt-in al cliente en el alta manual Summary

Cablea el aviso opt-in por mail en el alta manual: el checkbox del form "Nuevo turno" manda un flag `notify` y el endpoint `app/api/appointments/create` dispara `sendManualBookingConfirmation` (Plan 01) en un `after()` best-effort cuando el flag está ON y el cliente tiene email — sin tocar el core ni la sincronización con Google Calendar. Cierra BOOK-NOTIFY-01.

## What Was Built

### Task 1 — Endpoint (`app/api/appointments/create/route.ts`)
- **Import** de `sendManualBookingConfirmation` desde `@/lib/email`.
- **Flag `notify`** parseado defensivamente del body: `const notify = body.notify === true` (default OFF).
- **Select de business ampliado**: se sumaron `slug, primary_color, logo_url, whatsapp` a las columnas actuales (`id, name, address, buffer_minutes`). Columnas NO secretas; pasar el objeto ampliado a `createAppointmentCore` es inocuo (el core solo usa `id`/`buffer_minutes` por tipado estructural).
- **`after()` NUEVO y SEPARADO** para el mail, DESPUÉS del `after()` de gcal (que quedó sin cambios). Gate: `notify && clientEmail && result.appointmentId`. Dentro: `getBusinessSecrets(business.id)` propio (no reusa el del bloque gcal), llamada a `sendManualBookingConfirmation` con `to: clientEmail`, `clientName`, `service: result.serviceName`, `date`, `time`, `businessName/businessSlug`, branding (`primary_color`/`logo_url`/`whatsapp`), `cancelToken: result.cancelToken`, y secretos `resend_api_key`/`resend_from`. Catch con `console.error('[appointments/create] email confirmación FALLÓ (turno ${apptId}):', ...)`.
- **`result.cancelToken`** ahora se lee (el core ya lo devuelve en el path confirmed-sin-seña).
- El path `notify` OFF / sin email queda byte-idéntico a hoy (no hay llamada al mail).

### Task 2 — Form (`components/dashboard/nuevo-turno-form.tsx`)
- Estado `const [notifyClient, setNotifyClient] = useState(false)` (default OFF; el remount por `key={open}` lo resetea al reabrir).
- Derivado `const clientHasEmail = !!selectedClient?.email`.
- **Checkbox nativo** ("Avisar al cliente por mail") debajo de Notas y antes del Submit. `<input type="checkbox">` (no existe `ui/checkbox`), con `Label htmlFor` clickeable, `accent-primary`, `focus-visible` ring. `checked={notifyClient && clientHasEmail}`, `disabled={!clientHasEmail}`. Hint muted "Agregá un email del cliente para poder avisarle." cuando no hay email.
- En `handleSubmit`, se suma `notify: notifyClient && clientHasEmail` al POST body.

## Verification

- `npx tsc --noEmit` → **exit 0**.
- `npx vitest run test/manual-booking.test.ts test/manual-notify-email.test.ts` → **12/12 verdes** (sin regresión del alta).
- `npx eslint components/dashboard/nuevo-turno-form.tsx` → **exit 0**.

## Deviations from Plan

None - plan executed exactly as written.

## Threat Model

- **T-05-01 (info disclosure):** mitigado — `business` por owner_id, `secrets` vía `getBusinessSecrets(business.id)`; el mail va solo a `clientEmail` del turno recién creado con su `cancelToken`.
- **T-05-02 (flag spoofing):** accept — el actor es el dueño autenticado; forzar `notify=true` solo manda mail al cliente que él cargó (gateado además por `clientEmail`).
- **T-05-03 (DoS):** accept+mitigate — un mail por alta (acción humana), best-effort en `after()`; si Resend falla se loguea y el alta no se rompe.
- **T-05-06 (bypass integridad):** mitigado — el mail es puramente aditivo; no toca el core, `requireDeposit:false`, el anti-doble-booking ni el `after()` de gcal.
- **T-05-SC (supply chain):** accept — sin dependencias nuevas (checkbox nativo, Resend por fetch crudo).

## Checkpoint Humano Pendiente (Task 3)

El plan es `autonomous: false`. Verificación end-to-end pendiente del usuario (ver sección al final del reporte).

## Self-Check: PASSED

- `app/api/appointments/create/route.ts` contiene `sendManualBookingConfirmation` y `notify`: FOUND.
- `components/dashboard/nuevo-turno-form.tsx` contiene `notify` y el checkbox: FOUND.
- Commit `839dc70` (feat endpoint): FOUND.
- Commit `e3f27df` (feat form): FOUND.
